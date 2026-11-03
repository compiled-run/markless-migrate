// Whether two productions of the same rows hold the same facts: the canary diff that decides if a producer change needs a
// version bump. Real-clock fields (answer times, changed regions, layout shift, durations) are left out: they differ every run.
import type { Json } from '../codec.ts';

/** Fields measured on the real clock, never part of a row's facts. */
export const TIMING_FIELDS: ReadonlySet<string> = new Set(['answeredMs', 'regions', 'shift', 'ms', 'at', 'startedAt', 'elapsedMs', 'durationMs', 'loadMs', 'timing', 'views', 'frames', 'stateMs']);

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
		for (const k of new Set([...Object.keys(xo), ...Object.keys(yo)])) if (!TIMING_FIELDS.has(k)) walk(xo[k], yo[k], `${at}.${k}`);
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
