export type Matcher = { readonly source: string; readonly test: (value: string) => boolean; readonly noisy: boolean };

const TOKEN = /\d+|\p{L}+|\s+|./gu;
const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function exact(value: string): Matcher {
	return { source: value, test: (other) => other === value, noisy: false };
}

export function anything(source: string): Matcher {
	return { source, test: () => true, noisy: true };
}

function charClass(char: string): string {
	if (/\d/.test(char)) return '\\d';
	if (/\p{L}/u.test(char)) return '\\p{L}';
	if (/\s/.test(char)) return '\\s';
	return escape(char);
}

// Characters a varying stretch may hold: only the classes the OLD loads showed there, so digits stay digits.
function gapPattern(gaps: readonly string[]): string {
	const classes = new Set<string>();
	for (const gap of gaps) for (const char of gap) classes.add(charClass(char));
	if (!classes.size) return '';
	return `[${[...classes].sort().join('')}]${gaps.some((gap) => gap === '') ? '*' : '+'}`;
}

// Index in b that each token of a pairs with, by longest common subsequence.
function tokenMap(a: readonly string[], b: readonly string[]): (number | undefined)[] {
	const map = align(a, b, (x, y) => (x === y ? 1 : 0));
	const out: (number | undefined)[] = new Array(a.length).fill(undefined);
	for (const [i, j] of map) out[i] = j;
	return out;
}

// A line that differed between OLD loads may vary only where they differed, and only within the character classes seen there.
export function template(a: string, ...others: string[]): Matcher {
	if (others.every((other) => other === a)) return exact(a);
	const ta = a.match(TOKEN) ?? [];
	const tos = others.map((other) => other.match(TOKEN) ?? []);
	const maps = tos.map((to) => tokenMap(ta, to));
	let pattern = '';
	let prevA = -1;
	let prevO = tos.map(() => -1);
	const flush = (endA: number, endO: readonly number[]) => {
		const gaps = [ta.slice(prevA + 1, endA).join(''), ...tos.map((to, k) => to.slice(prevO[k]! + 1, endO[k]).join(''))];
		if (gaps.every((gap) => gap === gaps[0]) && gaps[0] === '') return;
		pattern += gapPattern(gaps);
	};
	for (let i = 0; i < ta.length; i++) {
		const at = maps.map((map) => map[i]);
		if (at.some((j, k) => j === undefined || j <= prevO[k]!)) continue;
		flush(i, at as number[]);
		pattern += escape(ta[i]!);
		prevA = i;
		prevO = at as number[];
	}
	flush(ta.length, tos.map((to) => to.length));
	const regex = new RegExp(`^${pattern}$`, 'su');
	return { source: a, test: (other) => regex.test(other), noisy: true };
}

// Highest-scoring alignment: score(x, y) is 0 for no match, higher for a match worth more.
function align<A, B>(a: readonly A[], b: readonly B[], score: (x: A, y: B) => number): [number, number][] {
	const cols = b.length + 1;
	const table = new Uint32Array((a.length + 1) * cols);
	for (let i = a.length - 1; i >= 0; i--) {
		for (let j = b.length - 1; j >= 0; j--) {
			const s = score(a[i]!, b[j]!);
			table[i * cols + j] = Math.max(s ? table[(i + 1) * cols + j + 1]! + s : 0, table[(i + 1) * cols + j]!, table[i * cols + j + 1]!);
		}
	}
	const pairs: [number, number][] = [];
	let i = 0;
	let j = 0;
	while (i < a.length && j < b.length) {
		const s = score(a[i]!, b[j]!);
		if (s && table[i * cols + j] === table[(i + 1) * cols + j + 1]! + s) pairs.push([i++, j++]);
		else if (table[(i + 1) * cols + j]! >= table[i * cols + j + 1]!) i++;
		else j++;
	}
	return pairs;
}

export interface LineMatcher extends Matcher {
	readonly optional: boolean;
}

// Lines are aligned against the first OLD load; a line some OLD load lacked, or only some had, is optional.
export function lineTemplates(a: readonly string[], ...others: readonly (readonly string[])[]): LineMatcher[] {
	const counterparts = others.map(() => new Map<number, string>());
	const extras = new Map<number, string[]>();
	others.forEach((b, k) => {
		let ia = 0;
		let ib = 0;
		const flushGap = (endA: number, endB: number) => {
			for (let t = 0; t < Math.max(endA - ia, endB - ib); t++) {
				if (ia + t < endA && ib + t < endB) counterparts[k]!.set(ia + t, b[ib + t]!);
				else if (ib + t < endB) extras.set(endA - 1, [...(extras.get(endA - 1) ?? []), b[ib + t]!]);
			}
		};
		for (const [pa, pb] of align(a, b, (x, y) => (x === y ? 1 : 0))) {
			flushGap(pa, pb);
			counterparts[k]!.set(pa, b[pb]!);
			ia = pa + 1;
			ib = pb + 1;
		}
		flushGap(a.length, b.length);
	});
	const out: LineMatcher[] = [];
	const pushExtras = (after: number) => {
		for (const line of extras.get(after) ?? []) out.push({ ...anything(line), optional: true });
	};
	pushExtras(-1);
	a.forEach((line, i) => {
		const seen = counterparts.map((m) => m.get(i));
		if (seen.every((x) => x !== undefined)) out.push({ ...template(line, ...seen), optional: false });
		else out.push({ ...anything(line), optional: true });
		pushExtras(i);
	});
	return out;
}

export interface LineDiff {
	readonly missing: readonly string[];
	readonly unexpected: readonly string[];
	readonly changed: readonly { expected: string; actual: string }[];
	/** Where each line sits: its index in the expected and actual lists, in the same order as the lists above. */
	readonly at?: { readonly missing: readonly number[]; readonly unexpected: readonly number[]; readonly changed: readonly { expected: number; actual: number }[] };
}

export function diffLines(expected: readonly LineMatcher[], actual: readonly string[]): LineDiff {
	const pairs = align(expected, actual, (m, line) => (!m.test(line) ? 0 : m.optional ? 1 : 2));
	const missing: string[] = [];
	const unexpected: string[] = [];
	const changed: { expected: string; actual: string }[] = [];
	const at = { missing: [] as number[], unexpected: [] as number[], changed: [] as { expected: number; actual: number }[] };
	let i = 0;
	let j = 0;
	const flush = (endI: number, endJ: number) => {
		const goneAt = expected.slice(i, endI).flatMap((m, k) => (m.optional ? [] : [i + k]));
		const gone = goneAt.map((k) => expected[k]!.source);
		const added = actual.slice(j, endJ);
		const n = Math.min(gone.length, added.length);
		for (let k = 0; k < n; k++) {
			changed.push({ expected: gone[k]!, actual: added[k]! });
			at.changed.push({ expected: goneAt[k]!, actual: j + k });
		}
		missing.push(...gone.slice(n));
		at.missing.push(...goneAt.slice(n));
		unexpected.push(...added.slice(n));
		at.unexpected.push(...added.slice(n).map((_, k) => j + n + k));
	};
	for (const [pi, pj] of pairs) {
		flush(pi, pj);
		i = pi + 1;
		j = pj + 1;
	}
	flush(expected.length, actual.length);
	return { missing, unexpected, changed, at };
}

export function fieldTemplates(a: Readonly<Record<string, string>>, ...others: readonly Readonly<Record<string, string>>[]): Map<string, LineMatcher> {
	const out = new Map<string, LineMatcher>();
	for (const [key, value] of Object.entries(a)) {
		const seen = others.map((b) => b[key]);
		out.set(key, seen.every((x) => x !== undefined) ? { ...template(value, ...seen), optional: false } : { ...anything(value), optional: true });
	}
	for (const b of others) for (const key of Object.keys(b)) if (!out.has(key)) out.set(key, { ...anything(b[key]!), optional: true });
	return out;
}

export interface FieldDiff {
	readonly key: string;
	readonly expected: string | undefined;
	readonly actual: string | undefined;
}

export function diffFields(expected: Map<string, LineMatcher>, actual: Readonly<Record<string, string>>): FieldDiff[] {
	const diffs: FieldDiff[] = [];
	for (const [key, matcher] of expected) {
		const value = actual[key];
		if (value === undefined) {
			if (!matcher.optional) diffs.push({ key, expected: matcher.source, actual: undefined });
		} else if (!matcher.test(value)) diffs.push({ key, expected: matcher.source, actual: value });
	}
	for (const [key, value] of Object.entries(actual)) if (!expected.has(key)) diffs.push({ key, expected: undefined, actual: value });
	return diffs;
}
