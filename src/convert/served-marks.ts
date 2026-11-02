import type { Document, Element } from './dom.ts';
import { attr, removeAttr, setAttr, walk } from './dom.ts';

// A scroll spy's marks on in-page links: the page's own part starts from what the server sent and marks again from where the
// page is scrolled, so a mark captured at rest would be painted and then taken back on every page shown in place.
const MARKS = ['data-active', 'aria-current'];

const inPage = (el: Element) => el.tagName === 'a' && (attr(el, 'href') ?? '').startsWith('#');

/** Puts each in-page link's scroll-spy marks back as the old page's server sent that link (matched by href and occurrence); returns how many marks changed. */
export function scrollSpyAsServed(doc: Document, served: Document): number {
	const sent = new Map<string, Element[]>();
	for (const el of walk(served)) if (inPage(el)) sent.set(attr(el, 'href')!, [...(sent.get(attr(el, 'href')!) ?? []), el]);
	const seen = new Map<string, number>();
	let n = 0;
	for (const el of walk(doc)) {
		if (!inPage(el)) continue;
		const href = attr(el, 'href')!;
		const i = seen.get(href) ?? 0;
		seen.set(href, i + 1);
		const was = sent.get(href)?.[i];
		if (!was) continue;
		for (const name of MARKS) {
			const value = attr(was, name);
			if (value === attr(el, name)) continue;
			if (value === undefined) removeAttr(el, name);
			else setAttr(el, name, value);
			n++;
		}
	}
	return n;
}
