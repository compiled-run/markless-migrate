// The Firebase Realtime Database wire protocol (v5) the old app's SDK spoke, reduced to what HN needs: one socket, listens and unlistens.

type Listener = (value: unknown) => void;

interface Listen {
	readonly listeners: Set<Listener>;
	value: unknown;
	known: boolean;
	unlistenTimer?: ReturnType<typeof setTimeout>;
}

const KEEPALIVE_MS = 45_000;
const UNLISTEN_GRACE_MS = 2_000;
const FRAGMENT_COUNT = /^\d{1,6}$/;

export class Connection {
	private socket: WebSocket | undefined;
	private open = false;
	private nextRequest = 1;
	private readonly outbox: string[] = [];
	private readonly listens = new Map<string, Listen>();
	private fragments: string[] = [];
	private expected = 0;
	private keepalive: ReturnType<typeof setInterval> | undefined;

	constructor(private readonly host: string) {}

	/** Calls `listener` with the value at `path` now (when known) and on every change; the returned function stops it. */
	listen(path: string, listener: Listener): () => void {
		const key = normalise(path);
		let entry = this.listens.get(key);
		if (!entry) {
			entry = { listeners: new Set(), value: undefined, known: false };
			this.listens.set(key, entry);
			this.send({ a: 'q', b: { p: `/${key}`, h: '' } });
		}
		if (entry.unlistenTimer) {
			clearTimeout(entry.unlistenTimer);
			entry.unlistenTimer = undefined;
		}
		entry.listeners.add(listener);
		const own = entry;
		if (own.known)
			queueMicrotask(() => own.listeners.has(listener) && listener(toValue(own.value)));
		return () => {
			own.listeners.delete(listener);
			if (own.listeners.size || own.unlistenTimer) return;
			own.unlistenTimer = setTimeout(() => {
				if (own.listeners.size || this.listens.get(key) !== own) return;
				this.listens.delete(key);
				this.send({ a: 'n', b: { p: `/${key}` } });
			}, UNLISTEN_GRACE_MS);
		};
	}

	/** The value at `path` once it is known. */
	once<T>(path: string): Promise<T> {
		return new Promise((resolve) => {
			let stop: (() => void) | undefined;
			let done = false;
			stop = this.listen(path, (value) => {
				if (done) return;
				done = true;
				resolve(value as T);
				queueMicrotask(() => stop?.());
			});
		});
	}

	close(): void {
		if (this.keepalive) clearInterval(this.keepalive);
		this.socket?.close();
		this.socket = undefined;
		this.open = false;
	}

	private send(body: { a: string; b: unknown }): void {
		const frame = JSON.stringify({ t: 'd', d: { r: this.nextRequest++, ...body } });
		if (this.open) this.socket!.send(frame);
		else {
			this.outbox.push(frame);
			this.connect();
		}
	}

	private connect(): void {
		if (this.socket) return;
		const socket = new WebSocket(`wss://${this.host}/.ws?v=5`);
		this.socket = socket;
		socket.onopen = () => {
			this.open = true;
			for (const frame of this.outbox.splice(0)) socket.send(frame);
			this.keepalive = setInterval(
				() => socket.readyState === WebSocket.OPEN && socket.send('0'),
				KEEPALIVE_MS,
			);
		};
		socket.onmessage = (event) => this.receive(String(event.data));
		socket.onclose = () => {
			if (this.keepalive) clearInterval(this.keepalive);
			if (this.socket !== socket) return;
			this.socket = undefined;
			this.open = false;
			if (!this.listens.size) return;
			for (const key of this.listens.keys())
				this.outbox.push(
					JSON.stringify({
						t: 'd',
						d: { r: this.nextRequest++, a: 'q', b: { p: `/${key}`, h: '' } },
					}),
				);
			setTimeout(() => this.connect(), 1_000);
		};
	}

	private receive(text: string): void {
		if (this.expected) {
			this.fragments.push(text);
			if (this.fragments.length < this.expected) return;
			text = this.fragments.join('');
			this.fragments = [];
			this.expected = 0;
		} else if (FRAGMENT_COUNT.test(text)) {
			this.expected = Number(text);
			return;
		}
		let message: { t?: string; d?: { a?: string; b?: { p?: string; d?: unknown } } };
		try {
			message = JSON.parse(text);
		} catch {
			return;
		}
		const data = message.t === 'd' ? message.d : undefined;
		if (!data?.b || typeof data.b.p !== 'string') return;
		if (data.a === 'd' || data.a === 'm')
			this.apply(normalise(data.b.p), data.b.d, data.a === 'm');
	}

	private apply(path: string, data: unknown, merge: boolean): void {
		for (const [key, entry] of this.listens) {
			if (path !== key && !path.startsWith(`${key}/`)) continue;
			const rest = path === key ? [] : path.slice(key.length + 1).split('/');
			entry.value = merge
				? mergeAt(entry.value, rest, data as Record<string, unknown>)
				: setAt(entry.value, rest, data);
			entry.known = true;
			const value = toValue(entry.value);
			for (const listener of entry.listeners) listener(value);
		}
	}
}

function normalise(path: string): string {
	return path.replace(/^\/+|\/+$/g, '');
}

function setAt(root: unknown, rest: readonly string[], data: unknown): unknown {
	if (!rest.length) return data;
	const node = root && typeof root === 'object' ? { ...(root as Record<string, unknown>) } : {};
	const [head, ...tail] = rest;
	const next = setAt(node[head!], tail, data);
	if (next === null) delete node[head!];
	else node[head!] = next;
	return node;
}

function mergeAt(
	root: unknown,
	rest: readonly string[],
	children: Record<string, unknown>,
): unknown {
	let next = root;
	for (const [child, value] of Object.entries(children ?? {}))
		next = setAt(next, [...rest, ...child.split('/')], value);
	return next;
}

/** What the SDK's `val()` returns: objects whose keys are mostly array indexes become arrays. */
function toValue(node: unknown): unknown {
	if (!node || typeof node !== 'object') return node;
	const entries = Object.entries(node as Record<string, unknown>);
	const indexes = entries.every(([k]) => /^(0|[1-9]\d*)$/.test(k));
	if (indexes && entries.length) {
		const max = Math.max(...entries.map(([k]) => Number(k)));
		if (max < 2 * entries.length) {
			const out: unknown[] = [];
			for (const [k, v] of entries) out[Number(k)] = toValue(v);
			return out;
		}
	}
	return Object.fromEntries(entries.map(([k, v]) => [k, toValue(v)]));
}
