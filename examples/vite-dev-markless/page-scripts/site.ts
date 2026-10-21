// What VitePress's client does on every page of the site, installed once per document: search shortcuts and
// buttons, same-page links, the stored appearance, and a hook that reruns per-page set-up after each in-place navigation.
import { loadIcons } from './icons.ts';

// The theme's enhanceApp puts its variant on the root before the app mounts, not in the served page: the first paint
// uses the stylesheet's default variant (its primary-button background among them) until this runs.
document.documentElement.setAttribute('data-variant', 'vite');

export const RENDERED = 'marklessrouterrendered';

/** Runs `setup` for the page shown now and again for each page the router swaps in, with whether it is a navigation. */
export function onPage(setup: (navigated: boolean) => void): void {
	setup(false);
	document.addEventListener(RENDERED, () => setup(true));
}

const isEditing = (target: EventTarget | null) =>
	target instanceof HTMLElement && (target.isContentEditable || target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA');

const openSearch = () => void import('./search.ts').then((search) => search.openSearch());
// The search box and its index (145 kB) load when search opens, as VitePress loads its own.
const SEARCH_BUTTON = '.VPNavBarSearchButton, button[aria-label="Search"]';
// VitePress's useDark stores the appearance it starts with.
if (localStorage.getItem('vitepress-theme-appearance') === null) localStorage.setItem('vitepress-theme-appearance', 'auto');

window.addEventListener('keydown', (event) => {
	if ((event.key === 'k' && (event.ctrlKey || event.metaKey)) || (event.key === '/' && !isEditing(event.target))) {
		event.preventDefault();
		openSearch();
	}
});

document.addEventListener('click', (event) => {
	if ((event.target as Element | null)?.closest(SEARCH_BUTTON)) openSearch();
});

/** VitePress's scrollTo: the target scrolls to the top and takes focus without scrolling again. */
export function scrollToHash(hash: string): void {
	let target: HTMLElement | null = null;
	try {
		target = hash ? document.getElementById(decodeURIComponent(hash).slice(1)) : null;
	} catch {}
	if (!target) {
		window.scrollTo(0, 0);
		return;
	}
	const element = target;
	requestAnimationFrame(() => {
		element.scrollIntoView({ block: 'start' });
		element.focus({ preventScroll: true });
		if (document.activeElement === element || element.hasAttribute('tabindex')) return;
		const restore = () => {
			element.removeAttribute('tabindex');
			element.removeEventListener('blur', restore);
		};
		element.setAttribute('tabindex', '-1');
		element.addEventListener('blur', restore);
		element.focus({ preventScroll: true });
		if (document.activeElement !== element) restore();
	});
}

// VitePress's router follows a link to `page.html` as the clean `page` it redirects to, in place. The Markless router knows
// pages by their clean path, so while it reads a link (prefetch on intent, follow on click) the link points there; the
// written href comes back once the event is handled.
for (const type of ['pointerdown', 'touchstart', 'focusin', 'click'])
	window.addEventListener(
		type,
		(event) => {
			const link = event.target instanceof Element ? event.target.closest('a[href]') : null;
			const href = link?.getAttribute('href');
			if (!link || !href || link.hasAttribute('target')) return;
			const url = new URL(href, link.baseURI);
			if (url.origin !== location.origin || !url.pathname.endsWith('.html')) return;
			url.pathname = url.pathname.slice(0, -'.html'.length).replace(/\/index$/, '/');
			link.setAttribute('href', url.pathname + url.search + url.hash);
			setTimeout(() => link.setAttribute('href', href));
		},
		{ capture: true, passive: true },
	);

// VitePress's router: a link to the page already shown changes the hash in history and scrolls to it.
window.addEventListener(
	'click',
	(event) => {
		if (
			event.defaultPrevented ||
			!(event.target instanceof Element) ||
			event.target.closest('button') ||
			event.button !== 0 ||
			event.ctrlKey ||
			event.shiftKey ||
			event.altKey ||
			event.metaKey
		)
			return;
		const link = event.target.closest('a');
		if (!link || link.closest('.vp-raw') || link.hasAttribute('download') || link.hasAttribute('target')) return;
		const href = link.getAttribute('href');
		if (href == null) return;
		const next = new URL(href, link.baseURI);
		if (next.origin !== location.origin || next.pathname !== location.pathname || next.search !== location.search) return;
		event.preventDefault();
		if (next.hash !== location.hash) {
			const old = location.href;
			history.replaceState({ ...history.state, scrollPosition: window.scrollY }, '');
			history.pushState({}, '', next.href);
			window.dispatchEvent(new HashChangeEvent('hashchange', { oldURL: old, newURL: next.href }));
		}
		scrollToHash(next.hash);
	},
	{ capture: true },
);

onPage(() => {
	loadIcons();
	// VitePress normalizes the address to the page's own path once it has resolved the route (`/guide` -> `/guide/`).
	const canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href;
	if (canonical) {
		const path = new URL(canonical).pathname;
		if (path !== location.pathname && path.replace(/\/$/, '') === location.pathname.replace(/\/$/, ''))
			history.replaceState(history.state, '', path + location.search + location.hash);
	}
});
