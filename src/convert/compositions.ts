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
 * Writes the part's role on each element of `roots` that the source renders as a library part through its child (Radix
 * asChild, Base UI render), so the part's port knows it though its data-slot is the child's. An element is that site's
 * when it carries one of its slots and its text or label, sits in the element the source puts it in (when the page
 * shows that slot at all) and, where the source fixes the row it stands in, stands at its place in that row.
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
		const hit = candidates.find((c) => {
			if (c.text !== undefined && !sameText(textContent(el), c.text)) return false;
			if (c.label !== undefined && attr(el, 'aria-label') !== c.label) return false;
			const placed = c.within !== undefined && shown.has(c.within);
			if (placed && nearestSlot(el) !== c.within) return false;
			if (placed && c.siblings && c.index !== undefined) {
				const row = el.parentNode && isElement(el.parentNode as Element) ? elementChildren(el.parentNode as Element) : [];
				if (row.length !== c.siblings.length || row[c.index] !== el) return false;
				if (c.siblings.some((t, i) => t !== null && !sameText(textContent(row[i]!), t))) return false;
				return true;
			}
			return c.text !== undefined || c.label !== undefined;
		});
		if (!hit) continue;
		setAttr(el, PART_MARK, hit.part);
		marked++;
	}
	return marked;
}
