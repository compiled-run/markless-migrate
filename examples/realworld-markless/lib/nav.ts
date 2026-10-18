// The old app is a single-page app: a link to the address already shown does nothing, and switching tabs inside a
// page (feeds on the home page, posts and favorites on a profile) keeps the page and reloads only the list, where the
// router would fetch the next page. This listener runs before the router's, which leaves a prevented click alone.
// A route answers with what to do once the address has changed, or false when the old app would have loaded a new page.
type SoftRoute = (url: URL) => (() => void) | false;

// Each page's routes, dropped once a navigation has replaced the page that registered them.
const routes = new Map<Element | null | undefined, SoftRoute>();
const afterSoft = new Map<Element | null | undefined, () => void>();
let installed = false;

export function onSoftNavigation(owner: Element | null | undefined, route: SoftRoute): void {
	routes.set(owner, route);
}

export function afterSoftNavigation(owner: Element | null | undefined, callback: () => void): void {
	afterSoft.set(owner, callback);
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
		(window as { __conduitUnmatched?: boolean }).__conduitUnmatched = false;
		if (!unmatched && url.pathname === window.location.pathname && url.search === window.location.search) {
			event.preventDefault();
			return;
		}
		for (const [owner, route] of routes) {
			if (!owner?.isConnected) {
				routes.delete(owner);
				continue;
			}
			const run = route(url);
			if (run) {
				event.preventDefault();
				window.history.pushState(null, '', url.pathname + url.search);
				run();
				for (const [owner, callback] of afterSoft) if (owner?.isConnected) callback();
				else afterSoft.delete(owner);
				return;
			}
		}
	}, true);
}

// A navigation the old app's router made in place (after signing in, a guard sending a visitor on), made the same way
// through the Markless router: it handles a click on a link to one of its pages.
export function navigate(path: string, replace = false): void {
	const link = document.createElement('a');
	link.href = path;
	if (replace) link.setAttribute('data-markless-router-replace', '');
	link.hidden = true;
	document.body.append(link);
	link.click();
	link.remove();
}
