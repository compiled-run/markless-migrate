import { parseFragment } from 'parse5';
import { childrenOf, isElement, isText, outer, textContent, type Element, type Node } from './dom.ts';
import { emitElement, lit } from './tsrx.ts';

// What a control shows of the values chosen in a list (a faceted filter's trigger: a badge per chosen value's label, or
// their count past some number), recorded with each value chosen alone and with two and three chosen, as one template:
// a text equal to the count reads it, an element repeated once per chosen value is a @for over their labels, and markup
// that changes past a count is an arm on it.

export interface Chosen {
	/** The labels of the values chosen, in the order the control lists them. */
	readonly labels: readonly string[];
	/** What the control shows then, as HTML. */
	readonly html: string;
}

const meaningful = (nodes: readonly Node[]) => nodes.filter((n) => isElement(n) || (isText(n) && n.value.trim() !== ''));
const nodesOf = (html: string) => meaningful(childrenOf(parseFragment(html) as unknown as Element));
const same = (a: Node, b: Node) => (isText(a) && isText(b) ? a.value === b.value : isElement(a) && isElement(b) && outer(a) === outer(b));
const shape = (n: Node) => (isElement(n) ? `<${n.tagName}${n.attrs.map((a) => ` ${a.name}="${a.value}"`).join('')}>` : '#t');

interface Variant {
	readonly n: number;
	readonly labels: readonly string[];
	readonly nodes: readonly Node[];
}

/**
 * The template for what the variants show, reading the count from `count` and the labels from `labels`; undefined when
 * they differ otherwise. With `hide`, markup that shows past a count is rendered always and hidden by that expression
 * instead of an arm (a value from another file's state, which Markless rebuilds no arm on), as is all of it while `hide`.
 */
export function chosenTemplate(chosen: readonly Chosen[], count: string, labels: string, hide?: string): string | undefined {
	const variants = chosen.map((c) => ({ n: c.labels.length, labels: c.labels, nodes: nodesOf(c.html) }));
	return sequence(variants, count, labels, false, hide);
}

const either = (a: string | null | undefined, b: string) => (a ? `(${a}) || (${b})` : b);

// `hide`: undefined renders arms; a string or null (nothing more to hide by) renders every side, hidden on the others.
function sequence(variants: readonly Variant[], count: string, labels: string, lone = false, hide?: string | null): string | undefined {
	const first = variants[0]!;
	if (variants.every((v) => v.nodes.length === first.nodes.length && v.nodes.every((n, i) => shape(n) === shape(first.nodes[i]!))))
		return first.nodes.map((_, i) => node(variants.map((v) => ({ ...v, node: v.nodes[i]! })), count, labels, lone, hide)).reduce<string | undefined>((all, part) => (all === undefined || part === undefined ? undefined : all + part), '');
	// An element per chosen label between what every variant shows before and after.
	const repeated = repetition(variants, labels, hide);
	if (repeated !== undefined) return repeated;
	// Markup that changes past a count: an arm on it (or both sides, each hidden on the other's), each side a template of its own.
	const counts = [...new Set(variants.map((v) => v.n))].sort((a, b) => a - b);
	for (const t of counts.slice(0, -1)) {
		const low = variants.filter((v) => v.n <= t);
		const high = variants.filter((v) => v.n > t);
		const tracked = hide !== undefined;
		const a = sequence(low, count, labels, low.length === 1, tracked ? either(hide, `${count} > ${t}`) : undefined);
		const b = sequence(high, count, labels, high.length === 1, tracked ? either(hide, `${count} <= ${t}`) : undefined);
		if (a !== undefined && b !== undefined) return tracked ? `${b}${a}` : `@if (${count} > ${t}) { <>${b}</> } @else { <>${a}</> }`;
	}
	return undefined;
}

function repetition(variants: readonly Variant[], labels: string, hide?: string | null): string | undefined {
	const base = variants[0]!;
	const before = base.nodes.findIndex((n) => isElement(n) && textContent(n).includes(base.labels[0] ?? '\u0000'));
	if (before < 0) return undefined;
	const after = base.nodes.length - before - base.n;
	if (!variants.every((v) => v.n > 0 && v.nodes.length === before + v.n + after)) return undefined;
	const hole = 'MMCHOSENLABEL';
	// The element with its label's text (a text node of its own) as the hole.
	const item = (v: Variant, k: number) => {
		const el = v.nodes[before + k];
		if (!el || !isElement(el)) return undefined;
		const copy = nodesOf(outer(el))[0] as Element;
		const texts: { value: string }[] = [];
		const visit = (n: Node) => (isText(n) ? texts.push(n) : isElement(n) ? childrenOf(n).forEach(visit) : undefined);
		visit(copy);
		const at = texts.filter((t) => t.value.trim() === v.labels[k]);
		if (at.length !== 1) return undefined;
		at[0]!.value = hole;
		return outer(copy);
	};
	const template = item(base, 0);
	if (!template || !variants.every((v) => v.labels.every((_, k) => item(v, k) === template))) return undefined;
	if (!variants.every((v) => v.nodes.slice(0, before).every((n, i) => same(n, base.nodes[i]!)) && v.nodes.slice(before + v.n).every((n, i) => same(n, base.nodes[before + base.n + i]!)))) return undefined;
	if (hide && [...base.nodes.slice(0, before), ...base.nodes.slice(before + base.n)].some((n) => isText(n))) return undefined;
	const emit = (nodes: readonly Node[]) => nodes.map((n) => (isText(n) ? `{${lit(n.value)}}` : hidden(n as Element, hide))).join('');
	const each = hidden(nodesOf(template)[0] as Element, hide).replace(hole, '{l}');
	return `${emit(base.nodes.slice(0, before))}@for (const l of ${labels}; key l) { ${each} }${emit(base.nodes.slice(before + base.n))}`;
}

/** An element as tsrx, hidden while `hide` holds. */
const hidden = (el: Element, hide: string | null | undefined, children?: string): string => emitElement(el, { bind: (x) => (x === el ? { ...(hide ? { omit: ['hidden'], extra: [`hidden={${hide}}`] } : {}), ...(children !== undefined ? { children } : {}) } : undefined) });

function node(variants: readonly (Variant & { readonly node: Node })[], count: string, labels: string, lone: boolean, hide?: string | null): string | undefined {
	const first = variants[0]!.node;
	// One variant alone on its side of a count (three chosen): a text holding that count as a word reads it.
	const counted = lone && isText(first) && new RegExp(`(^|\\D)${variants[0]!.n}(\\D|$)`).test(first.value);
	// A text cannot be hidden: shown on one side of a count, it is no template.
	if (typeof hide === 'string' && isText(first)) return undefined;
	if (!counted && (!lone || isText(first)) && variants.every((v) => same(v.node, first))) return isText(first) ? `{${lit(first.value)}}` : hidden(first as Element, hide);
	if (isText(first)) {
		const parts = variants.map((v) => (v.node as { value: string }).value.split(String(v.n)));
		if (parts.every((p) => p.length === 2 && p[0] === parts[0]![0] && p[1] === parts[0]![1])) return `${parts[0]![0] ? `{${lit(parts[0]![0])}}` : ''}{${count}}${parts[0]![1] ? `{${lit(parts[0]![1])}}` : ''}`;
		return undefined;
	}
	const children = sequence(variants.map((v) => ({ ...v, nodes: meaningful(childrenOf(v.node as Element)) })), count, labels, lone, hide === undefined ? undefined : null);
	return children === undefined ? undefined : hidden(first as Element, hide, children);
}
