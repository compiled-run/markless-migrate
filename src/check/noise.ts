export type Matcher = { readonly source: string; readonly test: (value: string) => boolean; readonly noisy: boolean };

const TOKEN = /\d+|[\p{L}]+|\s+|./gu;
const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function exact(value: string): Matcher {
	return { source: value, test: (other) => other === value, noisy: false };
}

export function anything(source: string): Matcher {
	return { source, test: () => true, noisy: true };
}

// Two loads of OLD give a and b: once any token differs, every number in the line may vary and differing words may be anything.
export function template(a: string, b: string): Matcher {
	if (a === b) return exact(a);
	const ta = a.match(TOKEN) ?? [];
	const tb = b.match(TOKEN) ?? [];
	if (ta.length !== tb.length) return anything(a);
	const pattern = ta.map((token, i) => (/^\d+$/.test(token) && /^\d+$/.test(tb[i]!) ? '\\d+' : token === tb[i] ? escape(token) : '.+?')).join('');
	const regex = new RegExp(`^${pattern}$`, 'su');
	return { source: a, test: (other) => regex.test(other), noisy: true };
}

function lcs<A, B>(a: readonly A[], b: readonly B[], same: (x: A, y: B) => boolean): [number, number][] {
	const rows = a.length + 1;
	const cols = b.length + 1;
	const table = new Uint32Array(rows * cols);
	for (let i = a.length - 1; i >= 0; i--) {
		for (let j = b.length - 1; j >= 0; j--) {
			table[i * cols + j] = same(a[i]!, b[j]!) ? table[(i + 1) * cols + j + 1]! + 1 : Math.max(table[(i + 1) * cols + j]!, table[i * cols + j + 1]!);
		}
	}
	const pairs: [number, number][] = [];
	let i = 0;
	let j = 0;
	while (i < a.length && j < b.length) {
		if (same(a[i]!, b[j]!)) {
			pairs.push([i++, j++]);
		} else if (table[(i + 1) * cols + j]! >= table[i * cols + j + 1]!) i++;
		else j++;
	}
	return pairs;
}

export interface LineMatcher extends Matcher {
	readonly optional: boolean;
}

export function lineTemplates(a: readonly string[], b: readonly string[]): LineMatcher[] {
	const pairs = lcs(a, b, (x, y) => x === y);
	const out: LineMatcher[] = [];
	let ia = 0;
	let ib = 0;
	const flushGap = (endA: number, endB: number) => {
		const gapA = a.slice(ia, endA);
		const gapB = b.slice(ib, endB);
		for (let k = 0; k < Math.max(gapA.length, gapB.length); k++) {
			const x = gapA[k];
			const y = gapB[k];
			if (x !== undefined && y !== undefined) out.push({ ...template(x, y), optional: false });
			else out.push({ ...anything(x ?? y!), optional: true });
		}
	};
	for (const [pa, pb] of pairs) {
		flushGap(pa, pb);
		out.push({ ...exact(a[pa]!), optional: false });
		ia = pa + 1;
		ib = pb + 1;
	}
	flushGap(a.length, b.length);
	return out;
}

export interface LineDiff {
	readonly missing: readonly string[];
	readonly unexpected: readonly string[];
	readonly changed: readonly { expected: string; actual: string }[];
}

export function diffLines(expected: readonly LineMatcher[], actual: readonly string[]): LineDiff {
	const pairs = lcs(expected, actual, (m, line) => m.test(line));
	const missing: string[] = [];
	const unexpected: string[] = [];
	const changed: { expected: string; actual: string }[] = [];
	let i = 0;
	let j = 0;
	const flush = (endI: number, endJ: number) => {
		const gone = expected.slice(i, endI).filter((m) => !m.optional).map((m) => m.source);
		const added = actual.slice(j, endJ);
		const n = Math.min(gone.length, added.length);
		for (let k = 0; k < n; k++) changed.push({ expected: gone[k]!, actual: added[k]! });
		missing.push(...gone.slice(n));
		unexpected.push(...added.slice(n));
	};
	for (const [pi, pj] of pairs) {
		flush(pi, pj);
		i = pi + 1;
		j = pj + 1;
	}
	flush(expected.length, actual.length);
	return { missing, unexpected, changed };
}

export function fieldTemplates(a: Readonly<Record<string, string>>, b: Readonly<Record<string, string>>): Map<string, LineMatcher> {
	const out = new Map<string, LineMatcher>();
	for (const [key, value] of Object.entries(a)) {
		out.set(key, key in b ? { ...template(value, b[key]!), optional: false } : { ...anything(value), optional: true });
	}
	for (const key of Object.keys(b)) if (!(key in a)) out.set(key, { ...anything(b[key]!), optional: true });
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
