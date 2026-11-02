import { attr, setAttr, textContent, walk, type Element } from './dom.ts';
import type { Binding } from './tsrx.ts';

/** What plan's libraries.json says of one app handler (src/library/handlers.ts). */
export interface HandlerFact {
	readonly file: string;
	readonly line: number;
	readonly element: string;
	readonly event: string;
	readonly slots: readonly string[];
	readonly words: readonly string[];
	readonly code?: string;
	readonly calls?: Readonly<Record<string, { readonly from: string; readonly imported: string }>>;
	readonly cancels?: boolean;
	readonly refused?: string;
}

/** The ports of the library functions a carried handler may call, by `<package> <export>`: what the page calls instead. */
export const PORTED_CALLS: Readonly<Record<string, string>> = { 'sonner toast': 'sonnerToast' };

export const CARRY_MARK = 'data-mm-carry';

const bare = (s: string) => s.replace(/\s+/g, '');

/** Why a handler is not carried, or undefined when it is: plan refused it, or it calls a library function no port answers. */
export function notCarried(h: HandlerFact): string | undefined {
	if (h.refused) return h.refused;
	if (!h.code) return 'plan wrote no code for it';
	const unported = Object.values(h.calls ?? {}).find((c) => !PORTED_CALLS[`${c.from} ${c.imported}`]);
	return unported ? `calls ${unported.from}'s ${unported.imported}, which no port answers` : undefined;
}

let current: readonly HandlerFact[] = [];

export function useHandlers(facts: readonly HandlerFact[] | undefined): void {
	current = (facts ?? []).filter((h) => !notCarried(h));
}

/** Whether a carried handler calls this port function (`sonnerToast`). */
export const carriesCall = (port: string, facts: readonly HandlerFact[] = current) => facts.some((h) => Object.values(h.calls ?? {}).some((c) => PORTED_CALLS[`${c.from} ${c.imported}`] === port));

/** The text an element shows, with its descendants' attribute values (a placeholder), as one string without whitespace. */
function haystack(el: Element): string {
	let out = bare(textContent(el));
	for (const x of walk(el)) for (const a of x.attrs) if (!/^(class|style|data-mm-)/.test(a.name)) out += bare(a.value);
	return out;
}

/** How many of the words the source fixes for a handler's element the page element shows; 0 when that is too few to tell. */
function score(el: Element, h: HandlerFact, text: string): number {
	const words = h.words.map(bare).filter(Boolean);
	if (!words.length) return 0;
	const hits = words.filter((w) => text.includes(w)).length;
	return hits >= Math.max(1, Math.ceil(words.length / 2)) ? hits : 0;
}

const fits = (el: Element, h: HandlerFact) => {
	const slot = attr(el, 'data-slot');
	return h.slots.length ? slot !== undefined && h.slots.includes(slot) : /^[a-z]/.test(h.element) && el.tagName === h.element;
};

/**
 * Marks each element of `roots` an app handler of the source is given to, with that handler's index: the element that
 * renders with one of its slots (or its tag) and shows most of the text the source fixes for it. A handler two elements
 * fit equally well, or an element two handlers fit equally well, is left alone.
 */
export function markHandlers(roots: readonly Element[], facts: readonly HandlerFact[] = current): number {
	const all = roots.flatMap((r) => [...walk(r)]);
	const texts = new Map<Element, string>();
	const best = new Map<number, { el: Element; score: number; tied: boolean }>();
	for (const [i, h] of facts.entries()) {
		for (const el of all) {
			if (!fits(el, h)) continue;
			const text = texts.get(el) ?? texts.set(el, haystack(el)).get(el)!;
			const s = score(el, h, text);
			if (!s) continue;
			const b = best.get(i);
			if (!b || s > b.score) best.set(i, { el, score: s, tied: false });
			else if (s === b.score) b.tied = true;
		}
	}
	// Copies of one demo (an example kept for each library a site documents) carry the same code: no choice between them.
	const byElement = new Map<Element, { index: number; score: number; tied: boolean }>();
	for (const [index, b] of best) {
		if (b.tied) continue;
		const other = byElement.get(b.el);
		if (!other || b.score > other.score) byElement.set(b.el, { index, score: b.score, tied: false });
		else if (b.score === other.score && facts[other.index]!.code !== facts[index]!.code) other.tied = true;
	}
	let marked = 0;
	for (const [el, m] of byElement) {
		if (m.tied || attr(el, CARRY_MARK)) continue;
		setAttr(el, CARRY_MARK, String(m.index));
		marked++;
	}
	return marked;
}

/** What a carried handler calls in place of a library function: an expression the page can call, and the declarations it reads. */
export interface PortedCall {
	readonly call: string;
	readonly declare: readonly string[];
}

/**
 * The binding of a marked element: its carried handler, written inline (a page resumes its handlers, never its
 * component's setup), given what the page calls for each library function it calls, and listened for on the event its
 * element's part announces once the library would call it (a questionnaire's submit after its own checks), else on the
 * DOM event itself. None when the page has nothing to call for one of them.
 */
export function carriedBinding(el: Element, announced: (el: Element, event: string) => string | undefined, preventDefault: boolean, ported: (el: Element, port: string) => PortedCall | undefined, facts: readonly HandlerFact[] = current): Binding | undefined {
	const at = attr(el, CARRY_MARK);
	const h = at === undefined ? undefined : facts[Number(at)];
	if (!h?.code) return undefined;
	const calls = Object.values(h.calls ?? {}).map((c) => ported(el, PORTED_CALLS[`${c.from} ${c.imported}`]!));
	if (calls.some((c) => !c)) return { omit: [CARRY_MARK] };
	const event = announced(el, h.event) ?? h.event;
	const prop = `on${event[0]!.toUpperCase()}${event.slice(1)}`;
	// Its own name for the event: Markless places a top-level cancel only on a parameter nothing inside declares again.
	const run = `(${h.code})(${calls.map((c) => c!.call).join(', ')})(mmEvent)`;
	return { omit: [CARRY_MARK], declare: calls.flatMap((c) => c!.declare), extra: [`${prop}={(mmEvent) => { ${event === h.event && (preventDefault || h.cancels) ? 'mmEvent.preventDefault(); ' : ''}${run}; }}`] };
}
