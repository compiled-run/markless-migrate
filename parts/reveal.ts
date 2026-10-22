import { CLIPBOARD } from './clipboard.ts';

// What the old page showed on use is rendered by Markless, hidden: a portal at the end of the body marked with its
// control's key (data-mm-layer), and the content a control replaces its container's with (data-mm-after). Parts only
// switch attributes on those nodes; they never insert or remove one.

/** The nodes a control portals, for this viewport when the page has a variant of its own for it. */
export function layersFor(key: string): HTMLElement[] {
	const all = [...document.querySelectorAll<HTMLElement>(`[data-mm-layer="${CSS.escape(key)}"]`)];
	const mobile = matchMedia('(max-width: 767px)').matches;
	const own = all.filter((n) => (n.dataset.mmViewport === 'mobile') === mobile);
	return own.length ? own : all.filter((n) => !n.dataset.mmViewport);
}

/** A control that took itself away on the old page (View Code): its container's content switches to what it then showed. */
export function swap(control: Element): boolean {
	const key = control.getAttribute('data-mm-replace');
	if (!key) return false;
	const container = control.closest(`:has(> [data-mm-after="${CSS.escape(key)}"])`);
	if (!container) return false;
	for (const el of container.querySelectorAll<HTMLElement>(`:scope > [data-mm-before="${CSS.escape(key)}"]`)) el.hidden = true;
	for (const el of container.querySelectorAll<HTMLElement>(`:scope > [data-mm-after="${CSS.escape(key)}"]`)) el.hidden = false;
	return true;
}

// The capture's signature of a control: its tag, data-slot and text, and which element with them it is in document order.
function signature(el: Element): string {
	return `${el.tagName.toLowerCase()}|${el.getAttribute('data-slot') ?? ''}|${(el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 60)}`;
}

/** What a copy control wrote on the old page, loaded from the page's own module; undefined for a control that copied nothing. */
export function clipboardFor(control: Element): Promise<string> | undefined {
	const page = CLIPBOARD[location.pathname.replace(/\/$/, '') || '/'];
	if (!page) return undefined;
	const sig = signature(control);
	let nth = 0;
	for (const el of document.body.querySelectorAll('*')) {
		if (el === control) break;
		if (signature(el) === sig) nth++;
	}
	const key = `${sig}#${nth}`;
	if (!page.keys.includes(key)) return undefined;
	return page.load().then((m) => m.default[key] ?? '');
}
