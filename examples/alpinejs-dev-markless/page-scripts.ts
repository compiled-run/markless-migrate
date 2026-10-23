// The docs layout's own scripts, run as the page parses (as Alpine's x-data on the layout ran at start), written without
// < and & so they read the same inside <script>.

/** Alpine's visibleNavHighlighter on the contents aside: the last heading above the window's middle line, on load and on scroll (throttled 50ms). */
export const CONTENTS_HIGHLIGHTER = `(() => {
	const headings = () => document.querySelectorAll('[listen-for-intersection-of-titles] h2:not([no-sidebar]), [listen-for-intersection-of-titles] h3:not([no-sidebar]), [listen-for-intersection-of-titles] h4:not([no-sidebar])');
	const report = () => {
		const middle = window.innerHeight / 2;
		const byDistance = {};
		headings().forEach((heading) => { byDistance[heading.getBoundingClientRect().top - middle] = heading; });
		const closest = Math.max(...Object.keys(byDistance).filter((top) => 0 > top));
		const id = closest >= 0 || [Infinity, NaN, -Infinity].includes(closest) ? null : byDistance[closest].id;
		document.querySelectorAll('[data-toc] a').forEach((link) => {
			const on = link.hash === '#' + id;
			link.classList.toggle('font-medium', on);
			link.classList.toggle('text-gray-900', on);
		});
	};
	let throttled = false;
	window.addEventListener('scroll', () => {
		if (throttled) return;
		report();
		throttled = true;
		setTimeout(() => { throttled = false; }, 50);
	}, { passive: true });
	report();
	// A client-side navigation swaps in the next page's contents aside.
	new MutationObserver((records) => { if (records.some((r) => [...r.addedNodes].some((n) => n.nodeType === 1 ? n.matches('[data-toc]') || !!n.querySelector('[data-toc]') : false))) report(); }).observe(document.body, { childList: true, subtree: true });
})();`;

/** $persist writes each value to localStorage when the page starts, if it is not there yet. */
export function persistDefaults(values: Readonly<Record<string, string>>): string {
	return `(() => { const values = ${JSON.stringify(values)}; try { Object.keys(values).forEach((key) => { if (localStorage.getItem(key) === null) localStorage.setItem(key, values[key]); }); } catch {} })();`;
}

/** DocSearch (Algolia) loads on the first intent to search (hover, focus or press of the search button, Cmd/Ctrl+K or /), and a press or shortcut made while it loads opens it once it has. Off Apple platforms the button shows and announces Ctrl+K, as DocSearch's own button does, before the first paint. */
export const DOCSEARCH_ON_INTENT = `(() => {
	if (window.__docsearchOnIntent) return;
	window.__docsearchOnIntent = true;
	if (!/(Mac|iPhone|iPod|iPad)/i.test(navigator.platform)) {
		const sheet = new CSSStyleSheet();
		sheet.replaceSync('#docsearch .docsearch-key-apple { display: none } #docsearch .docsearch-key-ctrl { display: flex }');
		document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
		const label = () => { for (const el of document.querySelectorAll('#docsearch .DocSearch-Button')) if (el.getAttribute('aria-label') !== 'Search (Ctrl+K)') el.setAttribute('aria-label', 'Search (Ctrl+K)'); };
		new MutationObserver((records) => { if (records.some((record) => record.addedNodes.length)) label(); }).observe(document.documentElement, { childList: true, subtree: true });
	}
	let state = 0;
	let pending = false;
	let holder = null;
	const open = () => { const button = holder ? holder.querySelector('.DocSearch-Button') : null; if (button) button.click(); };
	const load = () => {
		if (state) return;
		state = 1;
		const script = document.createElement('script');
		script.src = 'https://cdn.jsdelivr.net/npm/@docsearch/js@3';
		script.onload = () => {
			holder = document.createElement('div');
			holder.hidden = true;
			document.body.append(holder);
			docsearch({ container: holder, appId: 'SM9GAGAUKZ', apiKey: '1fad8740c0cf75209d11ae25f1f6f55c', indexName: 'alpinejs' });
			state = 2;
			if (pending) { pending = false; open(); }
		};
		script.onerror = () => { state = 0; script.remove(); };
		document.head.append(script);
	};
	const request = () => { if (state === 2) open(); else { pending = true; load(); } };
	const button = (event) => event.target instanceof Element ? event.target.closest('#docsearch .DocSearch-Button') : null;
	for (const type of ['pointerover', 'pointerdown', 'touchstart', 'focusin']) document.addEventListener(type, (event) => { if (button(event)) load(); }, { capture: true, passive: true });
	document.addEventListener('click', (event) => { if (button(event)) request(); }, true);
	const editing = (target) => target instanceof Element ? target.isContentEditable || ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName) : false;
	document.addEventListener('keydown', (event) => {
		if (state === 2 || pending) return;
		const shortcut = String(event.key).toLowerCase() === 'k' ? event.metaKey || event.ctrlKey : event.key === '/' ? !editing(event.target) : false;
		if (!shortcut || !document.querySelector('#docsearch')) return;
		event.preventDefault();
		request();
	}, true);
})();`;
