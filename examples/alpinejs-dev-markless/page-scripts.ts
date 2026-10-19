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
