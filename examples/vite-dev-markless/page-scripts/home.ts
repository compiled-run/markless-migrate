// The homepage's load-time work (its Vue components' onMounted): the Rive canvases, the sponsor grid and the logo strip.
import { riveSource, type RiveName } from '../components/rive-sources.ts';
import { logoGrid } from './logo-grid.ts';
import { onPage } from './site.ts';
import { loadSponsorTiers } from './sponsor-tiers.ts';

let preloaded = false;

// A timeout, not an animation frame: frames may be held (a background tab, a checker's frozen loops).
function afterFirstPaint(run: () => unknown): void {
	let started = false;
	const go = () => {
		if (started) return;
		started = true;
		setTimeout(() => void run());
	};
	if (performance.getEntriesByType('paint').some((e) => e.name === 'first-contentful-paint')) return go();
	try {
		new PerformanceObserver((list, observer) => {
			if (!list.getEntries().some((e) => e.name === 'first-contentful-paint')) return;
			observer.disconnect();
			go();
		}).observe({ type: 'paint', buffered: true });
	} catch {
		go();
	}
	setTimeout(go, 3000);
}

onPage(() => {
	const canvases = document.querySelectorAll<HTMLCanvasElement>('.marketing-layout canvas[data-rive]');
	if (!canvases.length) return;
	// The runtime and its wasm start once the page has loaded, in a task of their own: a .riv decodes its embedded
	// images, which would otherwise hold the load event back and run the file's parsing in the load event's task.
	// The Rive runtime is its own chunk: evaluating it took a second of a slow phone's main thread before the first paint.
	const start = async () => {
		if (!preloaded) {
			preloaded = true;
			const preload = document.createElement('link');
			preload.rel = 'preload';
			preload.href = riveSource('masthead');
			preload.as = 'fetch';
			preload.crossOrigin = 'anonymous';
			document.head.appendChild(preload);
		}
		const { riveAnimation } = await import('../components/rive.ts');
		for (const canvas of canvases) {
			if (!canvas.isConnected) continue;
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
	};
	// They also wait for the first paint: on a slow phone the load event comes before it, and 500 kB of animation would share the bandwidth the first screen is still painting with.
	if (document.readyState === 'complete') afterFirstPaint(start);
	else window.addEventListener('load', () => afterFirstPaint(start), { once: true });
	const sponsors = document.querySelector('.wrapper--ticks.py-14[data-v-755ff878]');
	if (sponsors) void loadSponsorTiers(sponsors).catch(() => {});
	const logos = document.querySelector<HTMLElement>('.overflow-hidden.py-6[data-v-0fe532eb]');
	if (logos) logoGrid(logos);
});
