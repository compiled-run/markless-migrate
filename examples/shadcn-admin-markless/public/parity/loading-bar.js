// react-top-loading-bar as NavigationProgress drives it: continuousStart() when the router starts loading another route,
// complete() when it is done; complete() fills the bar, waits waitingTime (1000 ms), fades over transitionTime (300 ms)
// and resets. On the first load the old app calls complete() about 13 ms after DOMContentLoaded (its module script has
// rendered), well before the load event, which waits for images and fonts.
(() => {
	const C = 'var(--muted-foreground)';
	const fill = document.querySelector('[data-parity="loading-bar"] > div');
	const glow = fill && fill.firstElementChild;
	if (!fill || !glow) return;
	const GLOW = `box-shadow: 0 0 10px ${C}, 0 0 10px ${C}; width: 5%; opacity: 1; position: absolute; height: 100%;`;
	let timers = [];
	const later = (ms, run) => timers.push(setTimeout(run, ms));
	const clear = () => {
		for (const t of timers) clearTimeout(t);
		timers = [];
	};
	const fade = (delay, first) => {
		later(delay, () => {
			fill.style.cssText = first ? `height: 100%; background: ${C}; transition: 300ms ease-out; width: 100%; opacity: 0; color: ${C};` : `height: 100%; background: ${C}; width: 100%; opacity: 0; color: ${C}; transition: 300ms ease-out;`;
			later(300, () => {
				fill.style.cssText = `height: 100%; background: ${C}; width: 0%; opacity: 1; color: ${C};`;
				glow.style.cssText = `${GLOW} transform: rotate(2deg) translate(0px, -2px); left: -5.5%;`;
			});
		});
	};
	const begin = () => {
		clear();
		const at = Math.floor(Math.random() * 11) + 10;
		fill.style.cssText = `height: 100%; background: ${C}; width: ${at}%; opacity: 1; color: ${C}; transition: 500ms;`;
		glow.style.cssText = `${GLOW} transition: 500ms; transform: rotate(2deg) translate(0px, -2px); left: ${at - 5.5}%;`;
		pending = true;
	};
	const complete = () => {
		if (!pending) return;
		pending = false;
		fill.style.cssText = `height: 100%; background: ${C}; width: 100%; opacity: 1; color: ${C}; transition: 500ms;`;
		glow.style.cssText = `${GLOW} transition: 500ms; transform: rotate(2deg) translate(0px, -2px); left: 90%;`;
		fade(1000, false);
	};
	let pending = false;
	const first = () => later(13, () => fade(1000, true));
	if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', first, { once: true });
	else first();
	// TanStack Router loads a match on every navigate(), a search-only one too, so the bar runs for each URL change.
	window.navigation?.addEventListener('navigate', (event) => {
		const to = new URL(event.destination.url);
		if (to.origin !== location.origin || event.navigationType === 'reload' || event.hashChange || to.href === location.href) return;
		if (event.destination.sameDocument) {
			begin();
			later(17, complete);
		} else if (!pending) begin();
	});
	// The router fetches the next page before it navigates, so a followed link starts the bar on its click. A link to the
	// page already shown (a menu's Billing on /settings) loads that page's match again at once: the bar runs and completes.
	document.addEventListener('click', (event) => {
		const link = event.target instanceof Element ? event.target.closest('a[href]') : null;
		if (!link || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || (link.target && link.target !== '_self')) return;
		const to = new URL(link.href, location.href);
		if (to.origin !== location.origin) return;
		if (to.pathname + to.search !== location.pathname + location.search) {
			if (!event.defaultPrevented) begin();
		} else if (!link.getAttribute('href').startsWith('#')) {
			begin();
			later(17, complete);
		}
	});
	// A navigate() to the URL already shown (lib/parity/tanstack-react-table/tasks-table.ts) loads the match again.
	document.addEventListener('searchreload', () => {
		begin();
		later(17, complete);
	});
	document.addEventListener('marklessrouterrendered', complete);
})();
