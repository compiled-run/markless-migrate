// A layer the app's own state opens (a dialog opened from the app's button): the opener carries that state, the
// layer's port follows it, and announces its own opening and closing there as the library calls onOpenChange.

/** On an element the app's state opens a layer from (its key's opener): that state, which the layer's port follows. */
export const LAYER_OPEN_ATTRIBUTE = 'data-mm-open';
/** Announced on that element when the layer opens or closes by itself, its detail whether it is open. */
export const LAYER_OPEN_EVENT = 'mmopen';

export const followsOpen = (el: Element) => el.hasAttribute(LAYER_OPEN_ATTRIBUTE);
export const announceOpen = (opener: HTMLElement, open: boolean) => followsOpen(opener) && opener.dispatchEvent(new CustomEvent<boolean>(LAYER_OPEN_EVENT, { detail: open }));

const followers = new Set<(opener: HTMLElement, open: boolean) => void>();
/** Runs `sync` with each opener's open state now and on every change the app's state writes. */
export function followOpen(sync: (opener: HTMLElement, open: boolean) => void): void {
	if (followers.has(sync)) return;
	followers.add(sync);
	const run = (el: HTMLElement) => sync(el, el.getAttribute(LAYER_OPEN_ATTRIBUTE) === 'true');
	new MutationObserver((records) => {
		for (const r of records) if (r.target instanceof HTMLElement) run(r.target);
	}).observe(document.documentElement, { subtree: true, attributes: true, attributeFilter: [LAYER_OPEN_ATTRIBUTE] });
	for (const el of document.querySelectorAll<HTMLElement>(`[${LAYER_OPEN_ATTRIBUTE}]`)) run(el);
}
