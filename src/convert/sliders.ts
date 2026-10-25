import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Browser } from 'playwright';
import { defaultEnv, openPage } from '../check/browser.ts';
import { settle } from '../check/capture.ts';
import { loadPage } from '../check/infrastructure.ts';
import { VIEWPORTS } from '../check/types.ts';

export interface SliderFacts {
	readonly sig: string;
	readonly nth: number;
	/** The value one arrow key moves a thumb by: Radix renders no attribute for its `step`. */
	readonly step: number;
}

// A Radix slider: thumbs with role="slider" of their own, not React Aria's (data-rac) or Base UI's (a range input).
const RADIX = '[data-slot="slider"]:not([data-rac]):not(:has([data-base-ui-slider-control]))';

/** Each Radix slider's step on the old page, from what one arrow key does to its first thumb (and undone). */
export async function captureSliders(browser: Browser, origin: string, route: string, dir: string): Promise<{ readonly route: string; readonly sliders: readonly SliderFacts[] }> {
	const file = join(dir, `${createHash('sha256').update(`slider:${route}`).digest('hex').slice(0, 16)}.json`);
	const cached = await readFile(file, 'utf8').then((text) => JSON.parse(text) as { route: string; sliders: SliderFacts[] }, () => undefined);
	if (cached && cached.route === route) return cached;
	const { context, page } = await openPage(browser, defaultEnv(origin), VIEWPORTS[0]!);
	const sliders: SliderFacts[] = [];
	try {
		await loadPage(page, new URL(route, origin).href);
		await settle(page);
		const roots = page.locator(RADIX);
		const count = await roots.count();
		for (let i = 0; i < count; i++) {
			const root = roots.nth(i);
			const thumb = root.locator('[role="slider"]').first();
			if (!(await thumb.count()) || (await root.getAttribute('data-disabled')) !== null || !(await thumb.isVisible().catch(() => false))) continue;
			const read = async () => Number(await thumb.getAttribute('aria-valuenow'));
			const press = async (key: string) => {
				await thumb.focus();
				await page.keyboard.down(key);
				await page.waitForTimeout(60);
				await page.keyboard.up(key);
				await page.waitForTimeout(60);
			};
			const before = await read();
			await press('ArrowUp');
			let step = (await read()) - before;
			if (step) await press('ArrowDown');
			else {
				await press('ArrowDown');
				step = before - (await read());
				if (step) await press('ArrowUp');
			}
			if (!(step > 0)) continue;
			const place = await root.evaluate((el) => {
				const sigOf = (e: Element) => `${e.tagName.toLowerCase()}|${e.getAttribute('data-slot') ?? ''}|${(e.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 60)}`;
				let nth = 0;
				for (const e of document.body.querySelectorAll('*')) {
					if (e === el) break;
					if (!e.closest('template') && sigOf(e) === sigOf(el)) nth++;
				}
				return { sig: sigOf(el), nth };
			});
			sliders.push({ sig: place.sig, nth: place.nth, step: Number(step.toFixed(10)) });
		}
	} finally {
		await context.close().catch(() => {});
	}
	const capture = { route, sliders };
	await mkdir(dir, { recursive: true });
	await writeFile(file, JSON.stringify(capture));
	return capture;
}
