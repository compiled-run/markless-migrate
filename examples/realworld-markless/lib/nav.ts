// The old app is a single-page app: a link to the address already shown does nothing, and switching tabs inside a
// page (feeds on the home page, posts and favorites on a profile) keeps the page and reloads only the list.
// Markless 0.4.0 links load a new document, so those two cases are handled here.
// A route answers with what to do once the address has changed, or false when the old app would have loaded a new page.
type SoftRoute = (url: URL) => (() => void) | false;

const routes: SoftRoute[] = [];
const afterSoft: (() => void)[] = [];
let installed = false;

export function onSoftNavigation(route: SoftRoute): void {
	routes.push(route);
}

export function afterSoftNavigation(callback: () => void): void {
	afterSoft.push(callback);
}

export function installNavigation(): void {
	if (installed) return;
	installed = true;
	document.addEventListener('click', (event) => {
		if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
		const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null;
		if (!(anchor instanceof HTMLAnchorElement) || (anchor.target && anchor.target !== '_self')) return;
		const url = new URL(anchor.href);
		if (url.origin !== window.location.origin) return;
		// After the old app's first navigation failed (an unknown route, a guarded page) its router is on no route, so
		// a link to the address shown still loads it.
		const unmatched = (window as { __conduitUnmatched?: boolean }).__conduitUnmatched === true;
		if (!unmatched && url.pathname === window.location.pathname && url.search === window.location.search) {
			event.preventDefault();
			return;
		}
		for (const route of routes) {
			const run = route(url);
			if (run) {
				event.preventDefault();
				window.history.pushState(null, '', url.pathname + url.search);
				run();
				for (const callback of afterSoft) callback();
				return;
			}
		}
	});
}
