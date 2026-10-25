import type { BrowserContext, WebSocketRoute } from 'playwright';

/** Firebase Realtime Database traffic recorded from the old page's socket: each path's first answer is the snapshot, each later push an update. */
export interface LiveRecording {
	readonly firebase: readonly FirebaseDatabase[];
}

export interface FirebaseDatabase {
	/** The database's host, as the page's SDK names it (`hacker-news.firebaseio.com`). */
	readonly host: string;
	/** Each path the page listened to (no leading slash, as the server names it) and the value it was first sent. */
	readonly snapshot: Readonly<Record<string, unknown>>;
	/** Values the server pushed afterwards, in order: `merge` updates only the children it names. */
	readonly updates: readonly LiveUpdate[];
}

export interface LiveUpdate {
	readonly path: string;
	readonly data: unknown;
	readonly merge?: boolean;
	/** Milliseconds after the socket opened. */
	readonly at?: number;
}

/** A socket address of a Firebase Realtime Database: `wss://<ns>.firebaseio.com/.ws?...` or a `firebasedatabase.app` region host. */
export const FIREBASE_SOCKET = /^wss?:\/\/[^/]+\.(firebaseio\.com|firebasedatabase\.app)\/\.ws(\?|$)/;
/** A REST read of the same databases: `https://<ns>.firebaseio.com/<path>.json`. */
export const FIREBASE_REST = /^https:\/\/[^/]+\.(firebaseio\.com|firebasedatabase\.app)\/(.*)\.json$/;

const FRAGMENT_COUNT = /^\d{1,6}$/;

interface DataMessage {
	readonly t: 'd';
	readonly d: { readonly r?: number; readonly a?: string; readonly b?: { readonly p?: string; readonly d?: unknown; readonly h?: string } };
}

const trim = (path: string) => path.replace(/^\/+|\/+$/g, '');

/** Reassembles a socket's frames into messages, each with the time of its last frame: the server splits a long message into a count frame and that many pieces. */
export function framesToMessages(frames: readonly { readonly text: string; readonly at: number }[]): { message: unknown; at: number }[] {
	const out: { message: unknown; at: number }[] = [];
	let pieces: string[] = [];
	let expected = 0;
	for (const frame of frames) {
		if (expected) {
			pieces.push(frame.text);
			if (pieces.length < expected) continue;
			out.push({ message: parse(pieces.join('')), at: frame.at });
			pieces = [];
			expected = 0;
			continue;
		}
		if (FRAGMENT_COUNT.test(frame.text)) {
			expected = Number(frame.text);
			continue;
		}
		out.push({ message: parse(frame.text), at: frame.at });
	}
	return out.filter((m) => m.message !== undefined);
}

function parse(text: string): unknown {
	try {
		return JSON.parse(text);
	} catch {
		return undefined;
	}
}

export interface SocketLog {
	readonly url: string;
	/** Frames in order, each marked as sent by the page or received from the server, with its time since the socket opened. */
	readonly frames: readonly { readonly sent: boolean; readonly text: string; readonly at: number }[];
}

/** What one recorded page learned from each database it spoke to: the first value of every path it listened to, then every push. */
export function recordDatabases(sockets: readonly SocketLog[]): FirebaseDatabase[] {
	const byHost = new Map<string, { snapshot: Record<string, unknown>; updates: LiveUpdate[] }>();
	for (const socket of sockets) {
		if (!FIREBASE_SOCKET.test(socket.url)) continue;
		const host = new URL(socket.url).host;
		const db = byHost.get(host) ?? { snapshot: {}, updates: [] };
		byHost.set(host, db);
		// A listen's first answer can be reported before the frame that asked for it, so the order of the two directions is not used.
		const known = (path: string) => path in db.snapshot || Object.keys(db.snapshot).some((kept) => path.startsWith(`${kept}/`));
		for (const { message, at } of framesToMessages(socket.frames.filter((f) => !f.sent))) {
			const data = (message as DataMessage)?.t === 'd' ? (message as DataMessage).d : undefined;
			const path = data?.b?.p;
			if (!data || data.r !== undefined || typeof path !== 'string' || (data.a !== 'd' && data.a !== 'm')) continue;
			const key = trim(path);
			if (data.a === 'd' && !known(key)) db.snapshot[key] = data.b!.d ?? null;
			else db.updates.push({ path: key, data: data.b!.d ?? null, ...(data.a === 'm' ? { merge: true } : {}), at });
		}
	}
	return [...byHost].map(([host, db]) => ({ host, snapshot: db.snapshot, updates: db.updates }));
}

/** The value at `path` in a database whose state is kept per listened path: the path itself, or inside the nearest one above it. */
export function valueAt(state: ReadonlyMap<string, unknown>, path: string): unknown {
	const key = trim(path);
	if (state.has(key)) return state.get(key);
	const parts = key.split('/');
	for (let i = parts.length - 1; i > 0; i--) {
		const above = parts.slice(0, i).join('/');
		if (!state.has(above)) continue;
		let node = state.get(above);
		for (const part of parts.slice(i)) node = node && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined;
		return node ?? null;
	}
	return null;
}

function setAt(node: unknown, parts: readonly string[], data: unknown): unknown {
	if (!parts.length) return data;
	const copy: Record<string, unknown> = node && typeof node === 'object' ? { ...(node as Record<string, unknown>) } : {};
	const [head, ...rest] = parts;
	const next = setAt(copy[head!], rest, data);
	if (next === null) delete copy[head!];
	else copy[head!] = next;
	return copy;
}

/** Applies a pushed update to the kept state: the path itself, inside the listened path above it, and the listened paths below it. */
export function applyUpdate(state: Map<string, unknown>, update: LiveUpdate): void {
	const key = trim(update.path);
	const writes: [string, unknown][] = update.merge ? Object.entries((update.data ?? {}) as Record<string, unknown>).map(([child, value]) => [`${key}/${trim(child)}`, value]) : [[key, update.data]];
	for (const [path, value] of writes) {
		let placed = false;
		for (const kept of [...state.keys()]) {
			if (kept === path) {
				state.set(kept, value);
				placed = true;
			} else if (path.startsWith(`${kept}/`)) {
				state.set(kept, setAt(state.get(kept), path.slice(kept.length + 1).split('/'), value));
				placed = true;
			} else if (kept.startsWith(`${path}/`)) {
				let node = value;
				for (const part of kept.slice(path.length + 1).split('/')) node = node && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined;
				state.set(kept, node ?? null);
			}
		}
		if (!placed) state.set(path, value);
	}
}

interface Listener {
	readonly socket: WebSocketRoute;
	readonly path: string;
}

/** One page session's database: the recorded snapshot, the updates sent so far, and every socket listening to it, across reloads. */
export class FakeDatabase {
	private readonly state: Map<string, unknown>;
	private readonly listeners = new Set<Listener>();
	private sent = 0;
	/** Paths the pages listened to, in order, so both apps' reads can be compared. */
	readonly listened: string[] = [];

	readonly recorded: FirebaseDatabase;

	constructor(recorded: FirebaseDatabase) {
		this.recorded = recorded;
		this.state = new Map(Object.entries(recorded.snapshot));
	}

	get pending(): number {
		return this.recorded.updates.length - this.sent;
	}

	value(path: string): unknown {
		return valueAt(this.state, path);
	}

	/** Answers a page's socket as the database server does: the handshake, each listen with its value, and ok to everything else. */
	serve(socket: WebSocketRoute): void {
		const host = this.recorded.host;
		socket.send(JSON.stringify({ t: 'c', d: { t: 'h', d: { ts: Date.now(), v: '5', h: host, s: 'markless-migrate-replay' } } }));
		const mine = new Set<Listener>();
		socket.onMessage((message) => {
			const text = typeof message === 'string' ? message : message.toString('utf8');
			if (text === '0' || FRAGMENT_COUNT.test(text)) return;
			const parsed = parse(text) as DataMessage | undefined;
			if (parsed?.t !== 'd') return;
			const { r, a, b } = parsed.d;
			const ok = (d: unknown = {}) => r !== undefined && socket.send(JSON.stringify({ t: 'd', d: { r, b: { s: 'ok', d } } }));
			if (a === 'q' && typeof b?.p === 'string') {
				const path = trim(b.p);
				const listener = { socket, path };
				mine.add(listener);
				this.listeners.add(listener);
				this.listened.push(path);
				socket.send(JSON.stringify({ t: 'd', d: { b: { p: path, d: this.value(path) }, a: 'd' } }));
				return void ok();
			}
			if (a === 'n' && typeof b?.p === 'string') {
				const path = trim(b.p);
				for (const listener of mine) if (listener.path === path) {
					mine.delete(listener);
					this.listeners.delete(listener);
				}
				return void ok();
			}
			if (a === 'g' && typeof b?.p === 'string') return void ok(this.value(b.p));
			ok(a === 's' ? '' : {});
		});
		socket.onClose(() => {
			for (const listener of mine) this.listeners.delete(listener);
		});
	}

	/** Sends the next recorded update to every socket listening at or around its path, or with `away` only keeps it for the next load; false when none is left. */
	next(away = false): boolean {
		const update = this.recorded.updates[this.sent];
		if (!update) return false;
		this.sent++;
		applyUpdate(this.state, update);
		if (away) return true;
		const key = trim(update.path);
		for (const { socket, path } of this.listeners) {
			if (path === key || key.startsWith(`${path}/`)) socket.send(JSON.stringify({ t: 'd', d: { b: { p: key, d: update.data }, a: update.merge ? 'm' : 'd' } }));
			else if (path.startsWith(`${key}/`)) socket.send(JSON.stringify({ t: 'd', d: { b: { p: path, d: this.value(path) }, a: 'd' } }));
		}
		return true;
	}
}

const sessions = new WeakMap<BrowserContext, FakeDatabase[]>();

/** Serves the recorded databases to every socket and REST read of a page session, kept for the whole session so a reload sees the updates sent before it. */
export async function serveDatabases(context: BrowserContext, recording: LiveRecording): Promise<FakeDatabase[]> {
	const databases = recording.firebase.map((db) => new FakeDatabase(db));
	sessions.set(context, databases);
	const byHost = (host: string) => databases.find((db) => db.recorded.host === host);
	await context.routeWebSocket(FIREBASE_SOCKET, (socket) => {
		const db = byHost(new URL(socket.url()).host) ?? databases[0];
		if (db) db.serve(socket);
		else socket.close();
	});
	return databases;
}

export function sessionDatabases(context: BrowserContext): readonly FakeDatabase[] {
	return sessions.get(context) ?? [];
}

/** Answers a REST read of a recorded database, browser or server side; undefined when the address is not one. */
export function restAnswer(databases: readonly FakeDatabase[], url: string): { status: number; contentType: string; body: string } | undefined {
	const match = FIREBASE_REST.exec(url.split('?')[0]!);
	if (!match) return undefined;
	const db = databases.find((d) => d.recorded.host === new URL(url).host);
	if (!db) return undefined;
	return { status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify(db.value(match[2]!) ?? null) };
}

/** The live updates a page session can be sent: every recorded update of every database it was served. */
export function updateCount(recording: LiveRecording | undefined): number {
	return recording?.firebase.reduce((n, db) => n + db.updates.length, 0) ?? 0;
}
