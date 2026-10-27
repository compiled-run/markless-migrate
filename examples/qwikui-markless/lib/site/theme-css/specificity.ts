// Selector specificity as the `specificity` package computes it (Selectors Level 4), for extract-theme-css.ts: that
// package parses with css-tree, whose namespace re-exports Markless cannot bundle yet (repros/namespace-reexport).
export interface Specificity {
	readonly A: number;
	readonly B: number;
	readonly C: number;
}

const ZERO: Specificity = { A: 0, B: 0, C: 0 };
const add = (x: Specificity, y: Specificity): Specificity => ({ A: x.A + y.A, B: x.B + y.B, C: x.C + y.C });
const max = (list: readonly Specificity[]) => list.reduce((m, s) => (compare(s, m) > 0 ? s : m), ZERO);

// The argument of a functional pseudo-class, from just after its "(" to its matching ")".
function argument(text: string, from: number): { arg: string; end: number } {
	let depth = 1;
	let i = from;
	for (; i < text.length && depth; i++) {
		if (text[i] === '(') depth++;
		else if (text[i] === ')') depth--;
	}
	return { arg: text.slice(from, i - 1), end: i };
}

function splitList(text: string): string[] {
	const out: string[] = [];
	let depth = 0;
	let start = 0;
	for (let i = 0; i < text.length; i++) {
		if (text[i] === '(' || text[i] === '[') depth++;
		else if (text[i] === ')' || text[i] === ']') depth--;
		else if (text[i] === ',' && depth === 0) {
			out.push(text.slice(start, i));
			start = i + 1;
		}
	}
	out.push(text.slice(start));
	return out.map((s) => s.trim()).filter(Boolean);
}

function ofComplex(selector: string): Specificity {
	let s = ZERO;
	let i = 0;
	const name = /^-?[_a-zA-Z -￿][-\w -￿]*|^\*/;
	while (i < selector.length) {
		const ch = selector[i]!;
		if (ch === '#') {
			s = add(s, { A: 1, B: 0, C: 0 });
			i += 1 + (name.exec(selector.slice(i + 1))?.[0].length ?? 0);
		} else if (ch === '.') {
			s = add(s, { A: 0, B: 1, C: 0 });
			i += 1 + (name.exec(selector.slice(i + 1))?.[0].length ?? 0);
		} else if (ch === '[') {
			s = add(s, { A: 0, B: 1, C: 0 });
			i = selector.indexOf(']', i) + 1 || selector.length;
		} else if (ch === ':') {
			const element = selector[i + 1] === ':';
			const start = i + (element ? 2 : 1);
			const id = name.exec(selector.slice(start))?.[0] ?? '';
			let end = start + id.length;
			const lower = id.toLowerCase();
			if (selector[end] === '(') {
				const { arg, end: after } = argument(selector, end + 1);
				end = after;
				if (lower === 'where') {
					// none
				} else if (lower === 'is' || lower === 'not' || lower === 'has' || lower === 'matches' || lower === '-webkit-any' || lower === '-moz-any') s = add(s, max(splitList(arg).map(ofComplex)));
				else if ((lower === 'nth-child' || lower === 'nth-last-child') && / of /i.test(arg)) s = add(add(s, { A: 0, B: 1, C: 0 }), max(splitList(arg.replace(/^[\s\S]*? of /i, '')).map(ofComplex)));
				else s = add(s, element ? { A: 0, B: 0, C: 1 } : { A: 0, B: 1, C: 0 });
			} else if (element || ['before', 'after', 'first-line', 'first-letter'].includes(lower)) s = add(s, { A: 0, B: 0, C: 1 });
			else s = add(s, { A: 0, B: 1, C: 0 });
			i = end;
		} else if (/[\s>+~,]/.test(ch)) i++;
		else {
			const type = name.exec(selector.slice(i))?.[0];
			if (type) {
				if (type !== '*') s = add(s, { A: 0, B: 0, C: 1 });
				i += type.length;
			} else i++;
		}
	}
	return s;
}

/** The specificity of a selector; of a selector list, its most specific selector's. */
export function calculate(selector: string): Specificity {
	return max(splitList(selector).map(ofComplex));
}

export function compare(a: Specificity, b: Specificity): number {
	return Math.sign(a.A - b.A || a.B - b.B || a.C - b.C);
}
