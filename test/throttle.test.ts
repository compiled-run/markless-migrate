import assert from 'node:assert/strict';
import { createServer, request, type Agent, type Server } from 'node:http';
import { Agent as HttpAgent } from 'node:http';
import { connect, createServer as createTcpServer, type AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { NETWORK_PROFILES, startThrottle, type NetworkProfile } from '../src/check/throttle.ts';

const FAST: NetworkProfile = { name: 'test', label: 'test link', downBytesPerSecond: 64_000, upBytesPerSecond: 64_000, rttMs: 200, source: 'test' };

let app: Server;
let port = 0;
before(async () => {
	app = createServer((req, res) => {
		const size = Number(new URL(req.url ?? '/', 'http://x').searchParams.get('bytes') ?? 0);
		res.writeHead(200, { 'content-type': 'application/octet-stream', 'content-length': size }).end(Buffer.alloc(size, 7));
	});
	await new Promise<void>((done) => app.listen(0, '127.0.0.1', done));
	port = (app.address() as AddressInfo).port;
});
after(() => app.close());

function get(proxy: string, url: string, agent?: Agent): Promise<{ bytes: number; ms: number }> {
	const via = new URL(proxy);
	const started = performance.now();
	return new Promise((resolve, reject) => {
		const req = request({ host: via.hostname, port: via.port, path: url, headers: { host: new URL(url).host }, ...(agent ? { agent } : {}) }, (res) => {
			let bytes = 0;
			res.on('data', (c: Buffer) => (bytes += c.length));
			res.on('end', () => resolve({ bytes, ms: performance.now() - started }));
		});
		req.on('error', reject);
		req.end();
	});
}

test('the named profiles are the Firefox DevTools presets, Lighthouse mobile and Chrome DevTools Slow 4G, each with its source', () => {
	assert.deepEqual(
		Object.values(NETWORK_PROFILES).map((p) => [p.name, Math.round(p.downBytesPerSecond * 100) / 100, p.upBytesPerSecond, p.rttMs]),
		[
			['regular-2g', 32_000, 6_400, 300],
			['regular-3g', 96_000, 32_000, 100],
			['slow-4g', 209_715.2, 86_400, 150],
			['chrome-slow-4g', 188_743.68, 86_400, 150],
		],
	);
	assert.ok(Object.values(NETWORK_PROFILES).every((p) => p.source.length > 10));
	assert.equal(NETWORK_PROFILES['chrome-slow-4g']!.devtools?.requestLatencyMs, 562.5);
});

test('a response pays a round trip for the connection, one for the name lookup, one for the request, and its bytes at the link rate', async () => {
	const throttle = await startThrottle(FAST, { hosts: { 'app.test': `127.0.0.1:${port}` } });
	try {
		const got = await get(throttle.proxy, 'http://app.test/?bytes=64000');
		assert.equal(got.bytes, 64_000);
		// 3 round trips (600 ms) and 64 kB at 64 kB/s (1 s).
		assert.ok(got.ms > 1550 && got.ms < 2100, `${Math.round(got.ms)} ms`);
		assert.ok(throttle.downloaded() >= 64_000, String(throttle.downloaded()));
	} finally {
		await throttle.close();
	}
});

test('a second request on the same connection pays one round trip, not the connection and lookup again', async () => {
	const throttle = await startThrottle(FAST, { hosts: { 'app.test': `127.0.0.1:${port}` } });
	const agent = new HttpAgent({ keepAlive: true, maxSockets: 1 });
	try {
		await get(throttle.proxy, 'http://app.test/?bytes=10', agent);
		const again = await get(throttle.proxy, 'http://app.test/?bytes=6400', agent);
		// One round trip (200 ms) and 6.4 kB at 64 kB/s (100 ms).
		assert.ok(again.ms > 270 && again.ms < 450, `${Math.round(again.ms)} ms`);
	} finally {
		agent.destroy();
		await throttle.close();
	}
});

test('two downloads at once share the one link: each takes as long as both would in turn', async () => {
	const throttle = await startThrottle(FAST, { hosts: { 'app.test': `127.0.0.1:${port}` } });
	try {
		const [a, b] = await Promise.all([get(throttle.proxy, 'http://app.test/?bytes=32000'), get(throttle.proxy, 'http://app.test/?bytes=32000')]);
		// 3 round trips (600 ms), then 64 kB in all at 64 kB/s: both end near 1.6 s, neither at 1.1 s.
		assert.ok(Math.min(a.ms, b.ms) > 1400, `${Math.round(a.ms)} ms and ${Math.round(b.ms)} ms`);
		assert.ok(Math.max(a.ms, b.ms) < 2100, `${Math.round(a.ms)} ms and ${Math.round(b.ms)} ms`);
	} finally {
		await throttle.close();
	}
});

test('a CONNECT tunnel (how a browser reaches an https origin) is throttled the same way, and the bytes are counted over time', async () => {
	const echo = createTcpServer((socket) => socket.pipe(socket));
	await new Promise<void>((done) => echo.listen(0, '127.0.0.1', done));
	const throttle = await startThrottle(FAST, { hosts: { 'secure.test': `127.0.0.1:${(echo.address() as AddressInfo).port}` } });
	try {
		const via = new URL(throttle.proxy);
		const started = performance.now();
		const socket = connect(Number(via.port), via.hostname);
		socket.write('CONNECT secure.test:443 HTTP/1.1\r\nHost: secure.test:443\r\n\r\n');
		const { established, echoedAt } = await new Promise<{ established: number; echoedAt: number }>((resolve, reject) => {
			let buffer = '';
			let established = 0;
			socket.on('data', (chunk: Buffer) => {
				buffer += chunk.toString('latin1');
				if (!established && buffer.includes('\r\n\r\n')) {
					assert.match(buffer, /^HTTP\/1\.1 200/);
					established = performance.now() - started;
					buffer = '';
					socket.write(Buffer.alloc(12_800, 1));
				} else if (established && buffer.length >= 12_800) resolve({ established, echoedAt: performance.now() - started });
			});
			socket.on('error', reject);
		});
		socket.destroy();
		// Connection and lookup: two round trips, then CONNECT's own.
		assert.ok(established > 550 && established < 800, `${Math.round(established)} ms`);
		// 12.8 kB up at 64 kB/s (200 ms), a round trip, and the last slice down: the two directions overlap.
		assert.ok(echoedAt - established > 400 && echoedAt - established < 700, `${Math.round(echoedAt - established)} ms`);
		const now = Date.now();
		assert.ok(throttle.downloadedBy(now) >= 12_800);
		assert.equal(throttle.downloadedBy(now - 60_000), 0);
	} finally {
		await throttle.close();
		echo.close();
	}
});
