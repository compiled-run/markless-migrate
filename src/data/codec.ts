// Observation rows as JSON: what a producer returns is written and read back as the same value, its bytes (screenshots,
// response bodies) as content-addressed blobs beside the rows. A value the codec cannot write back exactly is an error.
import { createHash } from 'node:crypto';

export type Json = null | boolean | number | string | readonly Json[] | { readonly [key: string]: Json };

/** Where blobs go and come from, by the sha256 of their bytes. */
export interface Blobs {
	put(bytes: Buffer): string;
	get(sha: string): Buffer;
}

export const sha256 = (bytes: Uint8Array | string): string => createHash('sha256').update(bytes).digest('hex');

/** Blobs held in memory, for a run's rows before they are written and for tests. */
export class MemoryBlobs implements Blobs {
	readonly bytes = new Map<string, Buffer>();
	put(bytes: Buffer): string {
		const sha = sha256(bytes);
		if (!this.bytes.has(sha)) this.bytes.set(sha, Buffer.from(bytes));
		return sha;
	}
	get(sha: string): Buffer {
		const found = this.bytes.get(sha);
		if (!found) throw new Error(`no blob ${sha}`);
		return found;
	}
}

const TAGS = new Set(['$buf', '$map', '$set', '$undef', '$num', '$obj', '$def', '$ref', '$json', '$chunks']);

const plain = (value: object): boolean => {
	const proto = Object.getPrototypeOf(value);
	return proto === Object.prototype || proto === null;
};

/**
 * `value` as JSON, its Buffers put in `blobs`. An object reached twice is written once and referred to after, so a judge that
 * matches elements by identity sees the same graph. Throws on a function, a class instance it does not know, or a cycle.
 */
export function encode(value: unknown, blobs: Blobs, { share = true }: { readonly share?: boolean } = {}): Json {
	const seen = new Map<object, number>();
	const count = (v: unknown): void => {
		if (v === null || typeof v !== 'object' || Buffer.isBuffer(v)) return;
		const n = seen.get(v) ?? 0;
		seen.set(v, n + 1);
		if (n) return;
		if (Array.isArray(v)) for (const x of v) count(x);
		else if (v instanceof Map) for (const [k, x] of v) (count(k), count(x));
		else if (v instanceof Set) for (const x of v) count(x);
		else for (const x of Object.values(v)) count(x);
	};
	if (share) count(value);
	const ids = new Map<object, number>();
	const open = new Set<object>();
	const walk = (v: unknown, path: string): Json => {
		if (v === undefined) return { $undef: 1 };
		if (v === null || typeof v === 'boolean' || typeof v === 'string') return v;
		if (typeof v === 'number') return Number.isFinite(v) && !Object.is(v, -0) ? v : { $num: Object.is(v, -0) ? '-0' : String(v) };
		if (typeof v !== 'object') throw new Error(`${path}: a ${typeof v} cannot be kept as data`);
		if (Buffer.isBuffer(v)) return { $buf: blobs.put(v) };
		if (open.has(v)) throw new Error(`${path}: a cycle cannot be kept as data`);
		const id = ids.get(v);
		if (id !== undefined) return { $ref: id };
		const shared = (seen.get(v) ?? 0) > 1;
		if (shared) ids.set(v, ids.size);
		open.add(v);
		try {
			const body = ((): Json => {
				if (Array.isArray(v)) return Array.from(v, (x, i) => walk(x, `${path}[${i}]`));
				if (v instanceof Map) return { $map: [...v].map(([k, x], i) => [walk(k, `${path}<key ${i}>`), walk(x, `${path}<${i}>`)]) };
				if (v instanceof Set) return { $set: [...v].map((x, i) => walk(x, `${path}<${i}>`)) };
				if (!plain(v)) throw new Error(`${path}: a ${v.constructor?.name ?? 'class'} instance cannot be kept as data`);
				const out: Record<string, Json> = {};
				let tagged = false;
				for (const [k, x] of Object.entries(v)) {
					if (k.startsWith('$')) tagged = true;
					out[k] = walk(x, `${path}.${k}`);
				}
				return tagged ? { $obj: out } : out;
			})();
			return shared ? { $def: body } : body;
		} finally {
			open.delete(v);
		}
	};
	return walk(value, '$');
}

/** What `encode` wrote, read back, an object written once and referred to after as one object again. */
export function decode(json: Json, blobs: Blobs): unknown {
	const defs: unknown[] = [];
	const parse = (sha: string) => JSON.parse(blobs.get(sha).toString('utf8')) as Json;
	// What `spill` put away, read back where it stood, so the walk meets every part in the order it was written.
	const resolve = (v: Json): Json => {
		if (v === null || typeof v !== 'object' || Array.isArray(v)) return v;
		const keys = Object.keys(v);
		if (keys.length !== 1) return v;
		const o = v as Record<string, Json>;
		if (keys[0] === '$json') return resolve(parse(o.$json as string));
		if (keys[0] === '$chunks') return (o.$chunks as string[]).flatMap((sha) => parse(sha) as Json[]);
		return v;
	};
	const walk = (raw: Json): unknown => {
		const v = resolve(raw);
		if (v === null || typeof v !== 'object') return v;
		if (Array.isArray(v)) return v.map(walk);
		const o = v as Record<string, Json>;
		const keys = Object.keys(o);
		if (keys.length !== 1 || !TAGS.has(keys[0]!)) return fill({}, o);
		const tag = keys[0]!;
		const x = o[tag]!;
		if (tag === '$undef') return undefined;
		if (tag === '$num') return x === '-0' ? -0 : Number(x);
		if (tag === '$buf') return blobs.get(x as string);
		if (tag === '$ref') return defs[x as number];
		if (tag === '$def') {
			// The object is registered before what is inside it is read, so a reference inside it already finds it.
			const at = defs.length;
			defs.push(undefined);
			const body = resolve(x);
			const made = shell(body);
			defs[at] = made;
			return populate(made, body);
		}
		return populate(shell(v), v);
	};
	const shell = (v: Json): unknown => {
		if (Array.isArray(v)) return [];
		const o = v as Record<string, Json>;
		const keys = Object.keys(o);
		if (keys.length === 1 && keys[0] === '$map') return new Map();
		if (keys.length === 1 && keys[0] === '$set') return new Set();
		return {};
	};
	const fill = (into: Record<string, unknown>, from: Record<string, Json>) => {
		for (const [k, y] of Object.entries(from)) into[k] = walk(y);
		return into;
	};
	const populate = (made: unknown, v: Json): unknown => {
		if (Array.isArray(v)) {
			for (const y of v) (made as unknown[]).push(walk(y));
			return made;
		}
		const o = v as Record<string, Json>;
		const [tag] = Object.keys(o);
		if (made instanceof Map) for (const pair of resolve(o.$map!) as Json[]) {
			const [k, y] = resolve(pair) as Json[];
			made.set(walk(k!), walk(y!));
		}
		else if (made instanceof Set) for (const y of resolve(o.$set!) as Json[]) made.add(walk(y));
		else if (tag === '$obj' && Object.keys(o).length === 1) fill(made as Record<string, unknown>, resolve(o.$obj!) as Record<string, Json>);
		else fill(made as Record<string, unknown>, o);
		return made;
	};
	return walk(json);
}

/** About how many characters `JSON.stringify` writes for each part of what `encode` wrote. */
const size = (v: Json): number => (v === null || typeof v !== 'object' ? (typeof v === 'string' ? v.length + 2 : String(v).length) : Array.isArray(v) ? v.reduce<number>((n, x) => n + size(x) + 1, 2) : Object.entries(v).reduce<number>((n, [k, x]) => n + k.length + 4 + size(x), 2));

/**
 * What `encode` wrote, with every array or object longer than `limit` characters put in `blobs` as JSON (arrays in chunks):
 * no line or blob of a route's rows nears the longest string JavaScript can hold. `decode` reads them back in place.
 */
export function spill(json: Json, blobs: Blobs, limit = 4_000_000): Json {
	const put = (part: Json) => blobs.put(Buffer.from(JSON.stringify(part)));
	const walk = (v: Json): { json: Json; size: number } => {
		if (v === null || typeof v !== 'object') return { json: v, size: size(v) };
		if (Array.isArray(v)) {
			const parts = v.map(walk);
			const total = parts.reduce((n, p) => n + p.size + 1, 2);
			if (total <= limit) return { json: parts.map((p) => p.json), size: total };
			const chunks: string[] = [];
			let chunk: Json[] = [];
			let held = 2;
			for (const p of parts) {
				if (chunk.length && held + p.size > limit) {
					chunks.push(put(chunk));
					chunk = [];
					held = 2;
				}
				chunk.push(p.json);
				held += p.size + 1;
			}
			if (chunk.length) chunks.push(put(chunk));
			return { json: { $chunks: chunks }, size: 16 + 68 * chunks.length };
		}
		const parts = Object.entries(v).map(([k, x]) => [k, walk(x)] as const);
		let total = parts.reduce((n, [k, p]) => n + k.length + 4 + p.size, 2);
		// The largest parts go first, until what stays is within the limit.
		for (const at of [...parts.keys()].sort((a, b) => parts[b]![1].size - parts[a]![1].size)) {
			if (total <= limit) break;
			const [k, p] = parts[at]!;
			if (p.size < 1_000) break;
			parts[at] = [k, { json: { $json: put(p.json) }, size: 80 }];
			total -= p.size - 80;
		}
		return { json: Object.fromEntries(parts.map(([k, p]) => [k, p.json])), size: total };
	};
	return walk(json).json;
}

/** A digest of what `value` holds, blobs by their sha and shared objects as copies: two values with one digest hold the same. */
export function digest(value: unknown): string {
	const blobs: Blobs = { put: (bytes) => sha256(bytes), get: () => Buffer.alloc(0) };
	return sha256(JSON.stringify(encode(value, blobs, { share: false }))).slice(0, 32);
}
