import { attr, elementChildren, isElement, setAttr, textContent, walk, type Element } from './dom.ts';

/** What plan's libraries.json says of one part the source renders through its child (src/library/composition.ts). */
export interface CompositionFact {
	readonly part: string;
	readonly slots: readonly string[];
	readonly text?: string;
	readonly label?: string;
	readonly within?: string;
	readonly siblings?: readonly (string | null)[];
	readonly index?: number;
}

/** The attribute naming the part an element renders when its own data-slot is its child's: `data-mm-part="dialog-close"`. */
export const PART_MARK = 'data-mm-part';

// The source's text joins JSX text with spaces and is cut at 80 characters; the page's has its own whitespace.
const MAX_TEXT = 80;
const bare = (s: string) => s.replace(/\s+/g, '');
const sameText = (page: string, source: string) => {
	const a = bare(page);
	const b = bare(source);
	return a === b || (source.length >= MAX_TEXT && a.startsWith(b));
};

interface Indexed {
	readonly bySlot: ReadonlyMap<string, readonly CompositionFact[]>;
	/** Sites whose element carries no slot the source names: known by their label. */
	readonly labelled: readonly CompositionFact[];
}

const index = (facts: readonly CompositionFact[]): Indexed => {
	const bySlot = new Map<string, CompositionFact[]>();
	for (const c of facts) for (const s of c.slots) (bySlot.get(s) ?? bySlot.set(s, []).get(s)!).push(c);
	return { bySlot, labelled: facts.filter((c) => !c.slots.length && c.label !== undefined) };
};

let current: Indexed = index([]);

export function useCompositions(facts: readonly CompositionFact[] | undefined): void {
	current = index(facts ?? []);
}

const nearestSlot = (el: Element): string | undefined => {
	for (let p = el.parentNode as Element | null; p && isElement(p); p = p.parentNode as Element | null) {
		const s = attr(p, 'data-slot');
		if (s) return s;
	}
	return undefined;
};

/**
 * How well an element answers a site: 0 not at all, 1 inside the element the source puts it in, 2 in its row there too.
 * A site whose surroundings the page never shows (a trigger whose parent is a Root, which renders no element) locates
 * nothing: its part finds such an element by the ARIA and layer it carries.
 */
function fits(el: Element, c: CompositionFact, shown: ReadonlySet<string>): number {
	if (c.text !== undefined && !sameText(textContent(el), c.text)) return 0;
	if (c.label !== undefined && attr(el, 'aria-label') !== c.label) return 0;
	if (c.within === undefined || !shown.has(c.within) || nearestSlot(el) !== c.within) return 0;
	if (!c.siblings || c.index === undefined) return c.text !== undefined || c.label !== undefined ? 1 : 0;
	const row = el.parentNode && isElement(el.parentNode as Element) ? elementChildren(el.parentNode as Element) : [];
	if (row.length !== c.siblings.length || row[c.index] !== el) return 0;
	if (c.text === undefined && c.label === undefined && c.siblings.every((t) => t === null)) return 0;
	return c.siblings.every((t, i) => t === null || sameText(textContent(row[i]!), t)) ? 2 : 0;
}

/**
 * Writes the part's role on each element of `roots` that the source renders as a library part through its child (Radix
 * asChild, Base UI render), so the part's port knows it though its data-slot is the child's. An element is that site's
 * when it carries one of its slots and its text or label, its nearest slotted ancestor is the element the source puts it
 * in and, where the source fixes the row it stands in, it stands at its place in that row.
 */
export function markCompositions(roots: readonly Element[], facts: readonly CompositionFact[] | Indexed = current): number {
	const { bySlot, labelled } = Array.isArray(facts) ? index(facts) : (facts as Indexed);
	if (!bySlot.size && !labelled.length) return 0;
	const shown = new Set<string>();
	const all = roots.flatMap((r) => [...walk(r)]);
	for (const el of all) {
		const s = attr(el, 'data-slot');
		if (s) shown.add(s);
	}
	let marked = 0;
	for (const el of all) {
		if (attr(el, PART_MARK)) continue;
		const slot = attr(el, 'data-slot');
		const candidates = slot ? (bySlot.get(slot) ?? []) : attr(el, 'aria-label') !== undefined ? labelled : [];
		// Sites of different parts that fit equally well leave it unmarked.
		let parts = new Set<string>();
		let best = 0;
		for (const c of candidates) {
			const score = fits(el, c, shown);
			if (score > best) [parts, best] = [new Set([c.part]), score];
			else if (score && score === best) parts.add(c.part);
		}
		if (parts.size !== 1) continue;
		setAttr(el, PART_MARK, [...parts][0]!);
		marked++;
	}
	return marked;
}
