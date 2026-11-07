// Every picture of the page loaded, at each width, old and new: the page is scrolled through so a lazy picture below the first screen loads as it does for a reader, then each one is read.
import type { Browser } from 'playwright';
import type { SideEnv } from './browser.ts';
import { openSession } from './journeys.ts';
import { judgeMedia, type MediaRow, type Picture } from './media-compare.ts';
import type { Viewport } from './types.ts';

/** How long the pictures a scroll through the page asked for may take to arrive. */
const LOAD_MS = 5_000;

// Runs in the page: down to the bottom a screen at a time and back to the top, then waits for every picture to finish, and reads each.
export async function loadedPictures(waitMs: number): Promise<Picture[]> {
	const frame = () => new Promise<void>((done) => requestAnimationFrame(() => setTimeout(done, 50)));
	for (let y = 0; y < document.documentElement.scrollHeight; y += innerHeight) {
		scrollTo(0, y);
		await frame();
	}
	scrollTo(0, 0);
	await frame();
	const until = performance.now() + waitMs;
	while (performance.now() < until && [...document.images].some((img) => !img.complete)) await new Promise((done) => setTimeout(done, 50));
	const local = (url: string) => {
		const u = URL.parse(url, location.href);
		return u && u.origin === location.origin ? `${u.pathname}${u.search}` : url;
	};
	return [...document.images].map((img): Picture => {
		const r = img.getBoundingClientRect();
		return {
			src: local(img.currentSrc || img.src),
			naturalWidth: img.naturalWidth,
			naturalHeight: img.naturalHeight,
			broken: img.complete && img.naturalWidth === 0 && Boolean(img.currentSrc || img.getAttribute('src')),
			...(!img.complete ? { pending: true } : {}),
			...(/\s\d+w\s*(,|$)/.test(img.getAttribute('srcset') ?? '') || img.parentElement instanceof HTMLPictureElement ? { picks: true } : {}),
			...(r.width > 0 && r.height > 0 ? { box: { x: Math.round(r.x + scrollX), y: Math.round(r.y + scrollY), width: Math.round(r.width), height: Math.round(r.height) } } : {}),
		};
	});
}

async function pictures(browser: Browser, env: SideEnv, route: string, viewport: Viewport): Promise<Picture[]> {
	const session = await openSession(browser, env, route, viewport);
	try {
		return await session.page.evaluate(loadedPictures, LOAD_MS);
	} finally {
		await session.close();
	}
}

/** Each width's pictures on both sides, the old side again where the first load and the new one differ. */
export async function observeMedia(browser: Browser, sides: { readonly old: SideEnv; readonly new: SideEnv }, route: string, viewports: readonly Viewport[]): Promise<MediaRow> {
	const out: MediaRow['viewports'][number][] = [];
	for (const viewport of viewports) {
		const [old, next] = await Promise.all([pictures(browser, sides.old, route, viewport), pictures(browser, sides.new, route, viewport)]);
		const differs = judgeMedia(route, { viewports: [{ viewport: viewport.name, olds: [old], next }] }).length > 0;
		out.push({ viewport: viewport.name, olds: differs ? [old, await pictures(browser, sides.old, route, viewport)] : [old], next });
	}
	return { viewports: out };
}
