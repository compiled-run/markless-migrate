// The homepage's load-time work (its Vue components' onMounted): the Rive canvases, the sponsor grid and the logo strip.
import { riveAnimation, riveSource, type RiveName } from '../components/rive.ts';
import { logoGrid } from './logo-grid.ts';
import { onPage } from './site.ts';
import { loadSponsorTiers } from './sponsor-tiers.ts';

let preloaded = false;

onPage(() => {
	const canvases = document.querySelectorAll<HTMLCanvasElement>('.marketing-layout canvas[data-rive]');
	if (!canvases.length) return;
	if (!preloaded) {
		preloaded = true;
		const preload = document.createElement('link');
		preload.rel = 'preload';
		preload.href = riveSource('masthead');
		preload.as = 'fetch';
		preload.crossOrigin = 'anonymous';
		document.head.appendChild(preload);
	}
	for (const canvas of canvases) {
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
	const sponsors = document.querySelector('.wrapper--ticks.py-14[data-v-755ff878]');
	if (sponsors) void loadSponsorTiers(sponsors).catch(() => {});
	const logos = document.querySelector<HTMLElement>('.overflow-hidden.py-6[data-v-0fe532eb]');
	if (logos) logoGrid(logos);
});
