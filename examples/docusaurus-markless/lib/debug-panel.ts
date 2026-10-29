// The debug panel's pages (/__docusaurus/debug/*) have no theme layout around them: what runs there is the JSON trees,
// the navigation progress bar and the colour mode following the OS, without the rest of the theme's script.
import { initJsonViews } from './json-view.ts';
import { hint, readHints } from './page-hints.ts';
import { startProgress } from './progress.ts';

const THEME_KEY = 'theme-189';

function storedChoice(): string | null | undefined {
	try {
		return window.localStorage.getItem(THEME_KEY);
	} catch {
		return undefined;
	}
}

function initPage(): void {
	readHints(document.body);
	initJsonViews(hint);
}

let booted = false;
export function debugBoot(): void {
	if (booted) return;
	booted = true;
	startProgress();
	initPage();
	document.addEventListener('marklessrouterrendered', initPage);
	// React Router turns a link to the address already shown (the active nav link) into history.replace and renders
	// nothing new; captured before the router's own listener so the page is not fetched and swapped again.
	document.addEventListener(
		'click',
		(event) => {
			const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('a[href]') : null;
			if (!link || link.target || link.hasAttribute('download') || link.origin !== location.origin) return;
			if (event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
			if (link.pathname !== location.pathname || link.search !== location.search || link.hash !== location.hash) return;
			event.preventDefault();
			history.replaceState(history.state, '', link.href);
		},
		true,
	);
	const dark = window.matchMedia('(prefers-color-scheme: dark)');
	dark.addEventListener('change', () => {
		const saved = storedChoice();
		if (saved === 'light' || saved === 'dark') return;
		document.documentElement.setAttribute('data-theme', dark.matches ? 'dark' : 'light');
		document.documentElement.setAttribute('data-theme-choice', 'system');
	});
}
