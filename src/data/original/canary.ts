// Whether two productions of the same rows hold the same facts: the canary diff that decides if a producer change needs a
// version bump. Real-clock fields (answer times, changed regions, layout shift, durations) are left out: they differ every run.
import { createHash } from 'node:crypto';
import type { Json } from '../codec.ts';

/** Fields measured on the real clock, never part of a row's facts. */
export const TIMING_FIELDS: ReadonlySet<string> = new Set(['answeredMs', 'regions', 'shift', 'ms', 'at', 'startedAt', 'elapsedMs', 'durationMs', 'loadMs', 'timing', 'views', 'frames', 'stateMs']);

/** Fields whose text ends in real-clock counts: a tweened shape's `|frames|ms`. */
const TIMED_PARTS: Readonly<Record<string, (v: unknown) => unknown>> = {
	tweened: (v) => (Array.isArray(v) ? v.map((t) => (typeof t === 'string' ? t.replace(/\|\d+\|\d+$/, '') : t)) : v),
};

export interface Difference {
	readonly path: string;
	readonly a: string;
	readonly b: string;
}

const short = (v: unknown) => {
	const text = JSON.stringify(v) ?? 'undefined';
	return text.length > 120 ? `${text.slice(0, 117)}...` : text;
};

/** Every place two values differ, real-clock fields aside, at most `limit` of them. */
export function differences(a: unknown, b: unknown, limit = 20, path = ''): Difference[] {
	const out: Difference[] = [];
	const walk = (x: unknown, y: unknown, at: string): void => {
		if (out.length >= limit) return;
		if (x === y) return;
		if (typeof x !== typeof y || x === null || y === null || typeof x !== 'object') {
			if (!(typeof x === 'number' && typeof y === 'number' && Number.isNaN(x) && Number.isNaN(y))) out.push({ path: at || '.', a: short(x), b: short(y) });
			return;
		}
		if (x instanceof Uint8Array || y instanceof Uint8Array) {
			if (!(x instanceof Uint8Array && y instanceof Uint8Array && Buffer.from(x).equals(Buffer.from(y)))) out.push({ path: at, a: `${(x as Uint8Array).length ?? '?'} bytes`, b: `${(y as Uint8Array).length ?? '?'} bytes` });
			return;
		}
		if (x instanceof Map || x instanceof Set) return walk([...(x as Map<unknown, unknown>)], y instanceof Map || y instanceof Set ? [...(y as Map<unknown, unknown>)] : y, at);
		if (Array.isArray(x) !== Array.isArray(y)) return void out.push({ path: at, a: short(x), b: short(y) });
		if (Array.isArray(x)) {
			const ys = y as unknown[];
			if (x.length !== ys.length) out.push({ path: `${at}.length`, a: String(x.length), b: String(ys.length) });
			for (let i = 0; i < Math.min(x.length, ys.length); i++) walk(x[i], ys[i], `${at}[${i}]`);
			return;
		}
		const xo = x as Record<string, unknown>, yo = y as Record<string, unknown>;
		for (const k of new Set([...Object.keys(xo), ...Object.keys(yo)])) if (!TIMING_FIELDS.has(k)) walk(TIMED_PARTS[k]?.(xo[k]) ?? xo[k], TIMED_PARTS[k]?.(yo[k]) ?? yo[k], `${at}.${k}`);
	};
	walk(a, b, path);
	return out;
}

/** A path with its indices taken out, so differences can be counted by the field they are in. */
export const fieldOf = (path: string): string => path.replace(/\[\d+\]/g, '[]');

export type Rows = ReadonlyMap<string, Json | unknown>;

export interface TableDiff {
	readonly onlyA: readonly string[];
	readonly onlyB: readonly string[];
	readonly differing: readonly { readonly key: string; readonly differences: readonly Difference[] }[];
}

/** The rows two productions of one table hold, by key: those only one has, and those whose facts differ. */
export function diffTable(a: Rows, b: Rows, ignore: (d: Difference) => boolean = () => false): TableDiff {
	const onlyA = [...a.keys()].filter((k) => !b.has(k));
	const onlyB = [...b.keys()].filter((k) => !a.has(k));
	const differing = [...a.keys()].filter((k) => b.has(k)).flatMap((key) => {
		const found = differences(a.get(key), b.get(key)).filter((d) => !ignore(d));
		return found.length ? [{ key, differences: found }] : [];
	});
	return { onlyA, onlyB, differing };
}

export const same = (d: TableDiff): boolean => !d.onlyA.length && !d.onlyB.length && !d.differing.length;

/** A value's field families (its paths with their indices taken out), each with one hash over every leaf of it, path and value. */
export function families(value: unknown): Map<string, string> {
	const hashes = new Map<string, ReturnType<typeof createHash>>();
	const add = (path: string, leaf: string | Uint8Array) => {
		const family = fieldOf(path) || '.';
		let hash = hashes.get(family);
		if (!hash) hashes.set(family, (hash = createHash('sha1')));
		hash.update(path).update('\0').update(leaf).update('\n');
	};
	const walk = (v: unknown, path: string): void => {
		if (v instanceof Uint8Array) return add(path, v);
		if (v instanceof Map || v instanceof Set) return walk([...(v as Map<unknown, unknown>)], path);
		if (Array.isArray(v)) {
			add(`${path}.length`, String(v.length));
			v.forEach((x, i) => walk(x, `${path}[${i}]`));
			return;
		}
		if (v && typeof v === 'object') {
			for (const [k, x] of Object.entries(v)) if (!TIMING_FIELDS.has(k)) walk(TIMED_PARTS[k]?.(x) ?? x, `${path}.${k}`);
			return;
		}
		add(path, JSON.stringify(v) ?? 'undefined');
	};
	walk(value, '');
	return new Map([...hashes].map(([f, h]) => [f, h.digest('base64')]));
}

export interface CanaryResult {
	/** Field families that differ between two runs of the same code: the producer is not deterministic there, so no change in them can be told from noise. */
	readonly nondeterministic: readonly { readonly table: string; readonly family: string; readonly side: 'base' | 'head'; readonly rows: number }[];
	/** Per table: whether the code change left every deterministic family alike, and what changed where it did not. */
	readonly tables: Readonly<Record<string, { readonly same: boolean; readonly summary: string }>>;
}

/**
 * Two runs of each side's producers: a family differing between a side's own two runs is nondeterministic and named, never
 * masked; a family alike within each side and different between the sides is a change that sticks, the one thing that
 * bumps a version.
 */
export function canary(tables: readonly string[], rows: (side: 'base' | 'head', run: 0 | 1, table: string) => ReadonlyMap<string, unknown>): CanaryResult {
	const nondeterministic: { table: string; family: string; side: 'base' | 'head'; rows: number }[] = [];
	const out: Record<string, { same: boolean; summary: string }> = {};
	for (const table of tables) {
		const runs = { base: [rows('base', 0, table), rows('base', 1, table)], head: [rows('head', 0, table), rows('head', 1, table)] };
		const fams = { base: runs.base.map((r) => new Map([...r].map(([k, v]) => [k, families(v)]))), head: runs.head.map((r) => new Map([...r].map(([k, v]) => [k, families(v)]))) };
		const noisy = new Set<string>();
		for (const side of ['base', 'head'] as const) {
			const [a, b] = fams[side] as [Map<string, Map<string, string>>, Map<string, Map<string, string>>];
			const count = new Map<string, number>();
			for (const key of new Set([...a.keys(), ...b.keys()])) {
				const x = a.get(key), y = b.get(key);
				const differing = !x || !y ? ['(the row itself)'] : [...new Set([...x.keys(), ...y.keys()])].filter((f) => x.get(f) !== y.get(f));
				for (const f of differing) count.set(f, (count.get(f) ?? 0) + 1);
			}
			for (const [family, n] of count) {
				noisy.add(family);
				nondeterministic.push({ table, family, side, rows: n });
			}
		}
		const [base, head] = [fams.base[0]!, fams.head[0]!];
		const changed: string[] = [];
		const keys = new Set([...base.keys(), ...head.keys()]);
		for (const key of keys) {
			const x = base.get(key), y = head.get(key);
			if (!x || !y) {
				if (!noisy.has('(the row itself)')) changed.push(`${key.split('\u0000').join(' | ')} ${x ? 'gone' : 'new'}`);
				continue;
			}
			for (const f of new Set([...x.keys(), ...y.keys()])) if (!noisy.has(f) && x.get(f) !== y.get(f)) changed.push(`${key.split('\u0000').join(' | ')} ${f}`);
		}
		out[table] = { same: !changed.length, summary: changed.length ? `${changed.length} deterministic changes, first ${changed.slice(0, 3).join('; ')}` : 'alike' };
	}
	return { nondeterministic, tables: out };
}
