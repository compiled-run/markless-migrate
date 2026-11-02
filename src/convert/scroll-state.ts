// Capture scrolls through a page so its lazy content loads, and a scroll spy (a table of contents' active link) follows
// along: what the scroll handed from element to element is put back as the page had it before capture scrolled.

interface ScrollState {
	readonly observer: MutationObserver;
	/** Each attribute a mutation changed once the page scrolled, with its value from before that first change. */
	readonly before: Map<Element, Map<string, string | null>>;
	/** `<attr>=<value>`, or `class.<token>`: what one element lost while another gained it in the same update. */
	readonly handed: Set<string>;
}

/** Page function, run before capture scrolls: watches what the page's own scripts change once it scrolls. */
export function watchScrollState(): void {
	const g = globalThis as typeof globalThis & { __mmScrollState__?: ScrollState };
	if (g.__mmScrollState__) return;
	let scrolled = false;
	addEventListener('scroll', () => (scrolled = true), { capture: true, passive: true });
	const before = new Map<Element, Map<string, string | null>>();
	const handed = new Set<string>();
	const tokens = (v: string | null) => new Set((v ?? '').split(/\s+/).filter(Boolean));
	const observer = new MutationObserver((records) => {
		if (!scrolled) return;
		const from = new Map<Element, Map<string, string | null>>();
		for (const r of records) {
			if (r.type !== 'attributes' || !r.attributeName) continue;
			const el = r.target as Element;
			for (const seen of [before, from]) {
				let at = seen.get(el);
				if (!at) seen.set(el, (at = new Map()));
				if (!at.has(r.attributeName)) at.set(r.attributeName, r.oldValue);
			}
		}
		const gained = new Map<string, Set<Element>>();
		const lost = new Map<string, Set<Element>>();
		const add = (to: Map<string, Set<Element>>, key: string, el: Element) => (to.get(key) ?? to.set(key, new Set()).get(key)!).add(el);
		for (const [el, attrs] of from) {
			for (const [name, was] of attrs) {
				const now = el.getAttribute(name);
				if (now === was) continue;
				if (name === 'class') {
					const a = tokens(was);
					const b = tokens(now);
					for (const t of b) if (!a.has(t)) add(gained, `class.${t}`, el);
					for (const t of a) if (!b.has(t)) add(lost, `class.${t}`, el);
				} else {
					add(gained, `${name}=${now}`, el);
					add(lost, `${name}=${was}`, el);
				}
			}
		}
		for (const [key, els] of gained) if ([...(lost.get(key) ?? [])].some((el) => !els.has(el))) handed.add(key);
	});
	observer.observe(document, { subtree: true, attributes: true, attributeOldValue: true });
	Object.defineProperty(g, '__mmScrollState__', { value: { observer, before, handed } satisfies ScrollState });
}

/** Page function, run once capture has scrolled back: puts back what the scroll handed between elements. Returns how many attributes. */
export function restoreScrollState(): number {
	const state = (globalThis as typeof globalThis & { __mmScrollState__?: ScrollState }).__mmScrollState__;
	if (!state) return 0;
	state.observer.disconnect();
	const tokens = (v: string | null) => new Set((v ?? '').split(/\s+/).filter(Boolean));
	let restored = 0;
	for (const [el, attrs] of state.before) {
		if (!el.isConnected) continue;
		for (const [name, was] of attrs) {
			const now = el.getAttribute(name);
			if (now === was) continue;
			if (name === 'class') {
				const a = tokens(was);
				const b = tokens(now);
				const back = [...new Set([...a, ...b])].filter((t) => a.has(t) !== b.has(t) && state.handed.has(`class.${t}`));
				for (const t of back) el.classList.toggle(t, a.has(t));
				if (back.length) restored++;
			} else if (state.handed.has(`${name}=${was}`) || state.handed.has(`${name}=${now}`)) {
				if (was === null) el.removeAttribute(name);
				else el.setAttribute(name, was);
				restored++;
			}
		}
	}
	return restored;
}
