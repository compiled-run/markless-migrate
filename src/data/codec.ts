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

const TAGS = new Set(['$buf', '$map', '$set', '$undef', '$num', '$obj', '$def', '$ref']);

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
	const walk = (v: Json): unknown => {
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
			const made = shell(x);
			defs[at] = made;
			return populate(made, x);
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
		if (made instanceof Map) for (const [k, y] of o.$map as Json[][]) made.set(walk(k!), walk(y!));
		else if (made instanceof Set) for (const y of o.$set as Json[]) made.add(walk(y));
		else if (tag === '$obj' && Object.keys(o).length === 1) fill(made as Record<string, unknown>, o.$obj as Record<string, Json>);
		else fill(made as Record<string, unknown>, o);
		return made;
	};
	return walk(json);
}

/** A digest of what `value` holds, blobs by their sha and shared objects as copies: two values with one digest hold the same. */
export function digest(value: unknown): string {
	const blobs: Blobs = { put: (bytes) => sha256(bytes), get: () => Buffer.alloc(0) };
	return sha256(JSON.stringify(encode(value, blobs, { share: false }))).slice(0, 32);
}
