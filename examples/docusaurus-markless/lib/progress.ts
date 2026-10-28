// theme-classic's nprogress client module: the bar shows when a navigation takes longer than 200 ms.
import nprogress from 'nprogress';

nprogress.configure({ showSpinner: false });
let progressTimer: ReturnType<typeof setTimeout> | undefined;
let shownPath = '';
let started = false;
function routeUpdate(): void {
	clearTimeout(progressTimer);
	progressTimer = setTimeout(() => nprogress.start(), 200);
}
function routeDidUpdate(): void {
	clearTimeout(progressTimer);
	nprogress.done();
}
export function startProgress(): void {
	if (started) return;
	started = true;
	shownPath = location.pathname;
	document.addEventListener('click', (event) => {
		const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('a[href]') : null;
		const mouse = event as MouseEvent;
		if (link && !link.target && link.origin === location.origin && link.pathname !== location.pathname && !mouse.button && !mouse.metaKey && !mouse.ctrlKey && !mouse.shiftKey && !mouse.altKey) routeUpdate();
	});
	window.addEventListener('popstate', () => {
		if (location.pathname !== shownPath) routeUpdate();
	});
	document.addEventListener('marklessrouterrendered', () => {
		routeDidUpdate();
		shownPath = location.pathname;
	});
}
