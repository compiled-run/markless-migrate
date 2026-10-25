import { createServer as createHttpServer, request as httpRequest, type IncomingMessage, type Server } from 'node:http';
import { connect, createServer, type AddressInfo, type Server as TcpServer, type Socket } from 'node:net';
import { throttling } from 'lighthouse/core/config/constants.js';

/** A network a page is loaded over: one shared link with this bandwidth each way and this round-trip time on every packet. */
export interface NetworkProfile {
	readonly name: string;
	readonly label: string;
	readonly downBytesPerSecond: number;
	readonly upBytesPerSecond: number;
	readonly rttMs: number;
	/** Where the numbers come from. */
	readonly source: string;
	/** Throttled inside Chromium by DevTools' model instead of the link: a fixed delay added to every request, the bandwidth metered per request. */
	readonly devtools?: { readonly requestLatencyMs: number };
}

// Firefox and Lighthouse both count a kilobit as 1024 bits.
const KBIT = 1024 / 8;
const FIREFOX = 'Firefox DevTools network throttling presets, devtools/client/shared/components/throttling/profiles.js';

export const NETWORK_PROFILES: Readonly<Record<string, NetworkProfile>> = {
	'regular-2g': { name: 'regular-2g', label: 'Regular 2G (256 kbit/s, 300 ms RTT)', downBytesPerSecond: 250 * KBIT, upBytesPerSecond: 50 * KBIT, rttMs: 300, source: FIREFOX },
	'regular-3g': { name: 'regular-3g', label: 'Regular 3G (768 kbit/s, 100 ms RTT)', downBytesPerSecond: 750 * KBIT, upBytesPerSecond: 250 * KBIT, rttMs: 100, source: FIREFOX },
	'slow-4g': {
		name: 'slow-4g',
		label: 'Slow 4G (1.6 Mbit/s, 150 ms RTT)',
		downBytesPerSecond: throttling.mobileSlow4G.throughputKbps * KBIT,
		upBytesPerSecond: throttling.mobileSlow4G.uploadThroughputKbps * KBIT,
		rttMs: throttling.mobileSlow4G.rttMs,
		source: 'Lighthouse mobile (PageSpeed Insights), throttling.mobileSlow4G',
	},
	'chrome-slow-4g': {
		name: 'chrome-slow-4g',
		label: 'Chrome DevTools Slow 4G (1.4 Mbit/s, 562.5 ms added to every request)',
		downBytesPerSecond: throttling.mobileSlow4G.downloadThroughputKbps * KBIT,
		upBytesPerSecond: throttling.mobileSlow4G.uploadThroughputKbps * KBIT,
		rttMs: throttling.mobileSlow4G.rttMs,
		devtools: { requestLatencyMs: throttling.mobileSlow4G.requestLatencyMs },
		source: "Lighthouse's DevTools throttling, throttling.mobileSlow4G (Chrome DevTools' Slow 4G preset), Chromium only",
	},
};

export interface Throttle {
	/** `http://127.0.0.1:<port>`: give it to the browser as its proxy, for http and https alike. */
	readonly proxy: string;
	/** Bytes delivered to the browser so far, TLS and HTTP framing included. */
	downloaded(): number;
	/** Bytes delivered to the browser up to this time (ms since the epoch). */
	downloadedBy(epochMs: number): number;
	uploaded(): number;
	/** When a byte last crossed the link either way (ms since the epoch). */
	lastActivity(): number;
	close(): Promise<void>;
}

export interface ThrottleOptions {
	/** Host names the proxy connects elsewhere, `app.test` to `127.0.0.1:4000`: a browser sends loopback origins past its proxy, so tests reach a local server by another name. */
	readonly hosts?: Readonly<Record<string, string>>;
}

// A slice of at most this many bytes crosses the link at a time, so flows sharing the link take turns.
const SLICE = 4096;
// A flow holding more than this waits to read from its source: what a TCP window does.
const HIGH_WATER = 64 * 1024;

interface Flow {
	readonly queue: Buffer[];
	queued: number;
	inFlight: number;
	ended: boolean;
	closed: boolean;
	readonly source: Socket;
	readonly deliver: (chunk: Buffer) => void;
	readonly finish: () => void;
}

/** One direction of the link: slices cross one at a time at the link rate, the flows with data taking turns, and each lands half a round trip later. */
class Link {
	readonly #bytesPerMs: number;
	readonly #delayMs: number;
	readonly #flows: Flow[] = [];
	readonly #timers = new Set<NodeJS.Timeout>();
	readonly #onDeliver: (bytes: number) => void;
	#next = 0;
	#freeAt = 0;
	#busy = false;
	#closed = false;

	constructor(bytesPerSecond: number, delayMs: number, onDeliver: (bytes: number) => void) {
		this.#bytesPerMs = bytesPerSecond / 1000;
		this.#delayMs = delayMs;
		this.#onDeliver = onDeliver;
	}

	flow(source: Socket, deliver: (chunk: Buffer) => void, finish: () => void): Flow {
		const flow: Flow = { queue: [], queued: 0, inFlight: 0, ended: false, closed: false, source, deliver, finish };
		this.#flows.push(flow);
		return flow;
	}

	send(flow: Flow, chunk: Buffer): void {
		for (let at = 0; at < chunk.length; at += SLICE) flow.queue.push(chunk.subarray(at, at + SLICE));
		flow.queued += chunk.length;
		if (flow.queued > HIGH_WATER) flow.source.pause();
		this.#pump();
	}

	end(flow: Flow): void {
		flow.ended = true;
		this.#settle(flow);
	}

	drop(flow: Flow): void {
		flow.closed = true;
		flow.queue.length = 0;
		flow.queued = 0;
		const at = this.#flows.indexOf(flow);
		if (at >= 0) this.#flows.splice(at, 1);
	}

	close(): void {
		this.#closed = true;
		for (const timer of this.#timers) clearTimeout(timer);
		this.#timers.clear();
	}

	#later(ms: number, run: () => void): void {
		const timer = setTimeout(() => {
			this.#timers.delete(timer);
			if (!this.#closed) run();
		}, Math.max(0, ms));
		this.#timers.add(timer);
	}

	#settle(flow: Flow): void {
		if (flow.ended && !flow.queued && !flow.inFlight && !flow.closed) {
			this.drop(flow);
			flow.finish();
		}
	}

	#pump(): void {
		if (this.#busy || this.#closed) return;
		const count = this.#flows.length;
		for (let i = 0; i < count; i++) {
			const flow = this.#flows[(this.#next + i) % count]!;
			const slice = flow.queue.shift();
			if (!slice) continue;
			this.#next = (this.#next + i + 1) % Math.max(1, this.#flows.length);
			flow.queued -= slice.length;
			flow.inFlight++;
			if (flow.queued < HIGH_WATER / 4 && flow.source.isPaused()) flow.source.resume();
			const now = performance.now();
			this.#freeAt = Math.max(now, this.#freeAt) + slice.length / this.#bytesPerMs;
			this.#busy = true;
			this.#later(this.#freeAt - now, () => {
				this.#busy = false;
				this.#later(this.#delayMs, () => {
					flow.inFlight--;
					if (!flow.closed) {
						this.#onDeliver(slice.length);
						flow.deliver(slice);
					}
					this.#settle(flow);
				});
				this.#pump();
			});
			return;
		}
	}
}

function target(hostPort: string, hosts: Readonly<Record<string, string>>, defaultPort: number): { host: string; port: number; name: string } {
	const url = new URL(`http://${hostPort}`);
	const name = url.hostname;
	const mapped = hosts[name];
	if (mapped) {
		const to = new URL(`http://${mapped}`);
		return { host: to.hostname, port: Number(to.port || defaultPort), name };
	}
	return { host: name.replace(/^\[|\]$/g, ''), port: Number(url.port || defaultPort), name };
}

/**
 * A proxy whose every byte to and from the browser crosses one shaped link: `profile`'s bandwidth each way, shared by
 * all connections, and half its round-trip time on every slice each way. A new connection waits a round trip (TCP's
 * handshake) and the first connection to a host another (its DNS lookup); TLS handshakes cross the link like any data.
 * It shapes every browser alike, unlike DevTools throttling, which Firefox applies as one fixed delay per response.
 */
export async function startThrottle(profile: NetworkProfile, options: ThrottleOptions = {}): Promise<Throttle> {
	const hosts = options.hosts ?? {};
	const delivered: [number, number][] = [];
	let down = 0;
	let up = 0;
	let last = Date.now();
	const downLink = new Link(profile.downBytesPerSecond, profile.rttMs / 2, (bytes) => {
		down += bytes;
		last = Date.now();
		delivered.push([last, down]);
	});
	const upLink = new Link(profile.upBytesPerSecond, profile.rttMs / 2, (bytes) => {
		up += bytes;
		last = Date.now();
	});
	const sockets = new Set<Socket>();
	const track = (socket: Socket) => {
		sockets.add(socket);
		socket.on('close', () => sockets.delete(socket));
		socket.on('error', () => socket.destroy());
	};
	const looked = new Map<string, Promise<void>>();
	const lookup = (name: string) => {
		let done = looked.get(name);
		if (!done) looked.set(name, (done = new Promise((resolve) => setTimeout(resolve, profile.rttMs))));
		return done;
	};

	const inner: Server = createHttpServer((req: IncomingMessage, res) => {
		let url: URL;
		try {
			url = new URL(req.url ?? '');
		} catch {
			res.writeHead(400).end();
			return;
		}
		const to = target(url.host, hosts, 80);
		void lookup(to.name).then(() => {
			const upstream = httpRequest({ host: to.host, port: to.port, method: req.method, path: `${url.pathname}${url.search}`, headers: req.headers }, (answer) => {
				res.writeHead(answer.statusCode ?? 502, answer.rawHeaders);
				answer.pipe(res);
			});
			upstream.on('error', () => res.headersSent ? res.destroy() : res.writeHead(502).end());
			req.pipe(upstream);
		});
	});
	inner.on('connect', (req: IncomingMessage, client: Socket, head: Buffer) => {
		track(client);
		const to = target(req.url ?? '', hosts, 443);
		void lookup(to.name).then(() => {
			const server = connect(to.port, to.host, () => {
				client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
				if (head.length) server.write(head);
				server.pipe(client);
				client.pipe(server);
			});
			track(server);
			server.on('close', () => client.destroy());
			client.on('close', () => server.destroy());
		});
	});
	inner.on('connection', track);
	await new Promise<void>((done) => inner.listen(0, '127.0.0.1', done));
	const innerPort = (inner.address() as AddressInfo).port;

	const shaper: TcpServer = createServer((browser) => {
		track(browser);
		browser.pause();
		const proxy = connect(innerPort, '127.0.0.1');
		track(proxy);
		proxy.pause();
		const toProxy = upLink.flow(browser, (chunk) => proxy.write(chunk), () => proxy.end());
		const toBrowser = downLink.flow(proxy, (chunk) => browser.write(chunk), () => browser.end());
		browser.on('data', (chunk: Buffer) => upLink.send(toProxy, chunk));
		proxy.on('data', (chunk: Buffer) => downLink.send(toBrowser, chunk));
		browser.on('end', () => upLink.end(toProxy));
		proxy.on('end', () => downLink.end(toBrowser));
		browser.on('close', () => {
			upLink.drop(toProxy);
			downLink.drop(toBrowser);
			proxy.destroy();
		});
		proxy.on('close', () => {
			if (!toBrowser.closed && !toBrowser.ended) browser.destroy();
		});
		// The TCP handshake: a round trip before the first byte either way.
		setTimeout(() => {
			if (browser.destroyed) return;
			browser.resume();
			proxy.resume();
		}, profile.rttMs);
	});
	await new Promise<void>((done) => shaper.listen(0, '127.0.0.1', done));
	const port = (shaper.address() as AddressInfo).port;

	return {
		proxy: `http://127.0.0.1:${port}`,
		downloaded: () => down,
		downloadedBy: (epochMs) => {
			let lo = 0;
			let hi = delivered.length;
			while (lo < hi) {
				const mid = (lo + hi) >> 1;
				if (delivered[mid]![0] <= epochMs) lo = mid + 1;
				else hi = mid;
			}
			return lo ? delivered[lo - 1]![1] : 0;
		},
		uploaded: () => up,
		lastActivity: () => last,
		close: async () => {
			downLink.close();
			upLink.close();
			for (const socket of sockets) socket.destroy();
			await Promise.all([new Promise<void>((done) => shaper.close(() => done())), new Promise<void>((done) => inner.close(() => done()))]);
		},
	};
}
