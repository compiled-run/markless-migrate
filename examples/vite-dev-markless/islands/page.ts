import { riveAnimation, riveSource, type RiveName } from '../components/rive.ts';
import { logoGrid } from './logo-grid.ts';

const preload = document.createElement('link');
preload.rel = 'preload';
preload.href = riveSource('masthead');
preload.as = 'fetch';
preload.crossOrigin = 'anonymous';
document.head.appendChild(preload);

for (const canvas of document.querySelectorAll<HTMLCanvasElement>('canvas[data-rive]')) {
	const [desktopSrc, desktopWidth, desktopHeight, mobileSrc, mobileWidth, mobileHeight] = canvas.dataset.rive!.split(' ');
	riveAnimation({
		desktopSrc: desktopSrc as RiveName,
		mobileSrc: mobileSrc as RiveName,
		desktopWidth: Number(desktopWidth),
		desktopHeight: Number(desktopHeight),
		mobileWidth: Number(mobileWidth),
		mobileHeight: Number(mobileHeight),
	})(canvas);
}

const logos = document.querySelector<HTMLElement>('.overflow-hidden.py-6[data-v-0fe532eb]');
if (logos) logoGrid(logos);

const isEditing = (target: EventTarget | null) =>
	target instanceof HTMLElement && (target.isContentEditable || target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA');

const openSearch = () => void import('./search.ts').then((search) => search.openSearch());

window.addEventListener('keydown', (event) => {
	if ((event.key === 'k' && (event.ctrlKey || event.metaKey)) || (event.key === '/' && !isEditing(event.target))) {
		event.preventDefault();
		openSearch();
	}
});

document.addEventListener('click', (event) => {
	if ((event.target as Element | null)?.closest('.VPNavBarSearchButton, button[aria-label="Search"]')) openSearch();
});

// VitePress's router: a link to the page already shown scrolls to its hash (or the top) instead of reloading.
window.addEventListener(
	'click',
	(event) => {
		if (event.defaultPrevented || !(event.target instanceof Element) || event.target.closest('button') || event.button !== 0 || event.ctrlKey || event.shiftKey || event.altKey || event.metaKey) return;
		const link = event.target.closest('a');
		if (!link || link.hasAttribute('download') || link.hasAttribute('target')) return;
		const href = link.getAttribute('href');
		if (href == null) return;
		const next = new URL(href, link.baseURI);
		if (next.origin !== location.origin || next.pathname !== location.pathname || next.search !== location.search) return;
		event.preventDefault();
		if (next.hash !== location.hash) history.pushState({}, '', next.href);
		const target = next.hash ? document.getElementById(decodeURIComponent(next.hash.slice(1))) : null;
		if (target) target.scrollIntoView();
		else window.scrollTo(0, 0);
	},
	{ capture: true },
);
