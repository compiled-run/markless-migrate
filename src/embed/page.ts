/**
 * Runs in the page before its own scripts: remembers every embed placeholder (`a.github-button`,
 * `blockquote.twitter-tweet`...) as the parser or a script adds it, with where it stood, so the widget its loader
 * draws in its place can be found once the page settles. It only observes. Must stay self-contained.
 */
export function trackEmbedSlots(slots: readonly { readonly selector: string; readonly after?: boolean; readonly provider: string }[]): void {
	const w = window as unknown as { __marklessMigrateEmbedSlots?: unknown[] };
	if (w.__marklessMigrateEmbedSlots) return;
	const list: { el: Element; parent: Node | null; prev: Node | null; after: boolean; provider: string }[] = [];
	w.__marklessMigrateEmbedSlots = list;
	const seen = new WeakSet<Element>();
	const take = (el: Element, parent: Node | null, prev: Node | null) => {
		if (seen.has(el) || el.closest('[data-markless-embed]')) return;
		for (const s of slots) {
			if (!el.matches(s.selector)) continue;
			seen.add(el);
			list.push({ el, parent: el.parentNode ?? parent, prev: el.parentNode ? el.previousSibling : prev, after: Boolean(s.after), provider: s.provider });
			return;
		}
	};
	new MutationObserver((records) => {
		for (const r of records) {
			for (const n of r.addedNodes) {
				if (n.nodeType !== 1) continue;
				take(n as Element, r.target, r.previousSibling);
				for (const d of (n as Element).querySelectorAll('*')) take(d, null, null);
			}
		}
	}).observe(document, { childList: true, subtree: true });
}

/** Runs in the page: forces every shadow root open, so a study can read what a widget draws into a closed one. Study only. Must stay self-contained. */
export function openShadowRoots(): void {
	const attach = Element.prototype.attachShadow;
	Element.prototype.attachShadow = function (this: Element, init: ShadowRootInit) {
		return attach.call(this, { ...init, mode: 'open' });
	};
}
