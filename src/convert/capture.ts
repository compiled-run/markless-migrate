import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Browser, Page } from 'playwright';
import { defaultEnv, openPage } from '../check/browser.ts';
import { finishAnimations, settle } from '../check/capture.ts';
import { loadPage } from '../check/infrastructure.ts';
import { VIEWPORTS, type Viewport } from '../check/types.ts';
import { MEASURE_WIDTHS, readImages, readImageWidths, type ImageFacts } from './images.ts';
import { LATE_CANDIDATE, lateFontsInFirstScreen, markLateFontCandidates } from './fonts.ts';

/** One route of the old site as a visitor's browser holds it once the page has settled, beside what its server sent. */
export interface CapturedPage {
	readonly route: string;
	readonly status: number;
	/** The HTML the old server answered with, before any script ran. */
	readonly server: string;
	/** The document after load, under the checker's frozen clock, seed and environment, per viewport name. */
	readonly settled: Readonly<Record<string, string>>;
	/** Where each image was drawn, per viewport name; absent from a capture taken before it was recorded. */
	readonly images?: Readonly<Record<string, ImageFacts>>;
	/** The web fonts (by the id their blocks carry in the desktop document) whose text no first screen shows, with the face each one is. */
	readonly lateFonts?: readonly { readonly id: string; readonly key: string }[];
	/** The web fonts a first screen draws that the page does not preload: the file each was fetched from. */
	readonly firstScreenFonts?: readonly string[];
}

const key = (route: string) => createHash('sha256').update(route).digest('hex').slice(0, 16);

/**
 * Loads a route the way `check` loads it (the same frozen environment, the same settling) and keeps the document the
 * old page ends up showing. What a server sends is often not what a visitor sees: a skeleton the client replaces, a
 * streamed boundary swapped in by an inline script. Cached by route under `dir`.
 */
export async function capturePage(browser: Browser, origin: string, route: string, dir: string, viewports: readonly Viewport[] = VIEWPORTS): Promise<CapturedPage> {
	const file = join(dir, `${key(route)}.json`);
	const cached = await readFile(file, 'utf8').then((text) => JSON.parse(text) as CapturedPage, () => undefined);
	if (cached && cached.route === route) return cached;
	let server = '';
	let status = 0;
	const settled: Record<string, string> = {};
	const images: Record<string, ImageFacts> = {};
	let lateFonts: { id: string; key: string }[] = [];
	let firstScreenFonts: string[] = [];
	for (const viewport of viewports) {
		const env = defaultEnv(origin);
		const { context, page } = await openPage(browser, env, viewport);
		try {
			const response = await loadPage(page, new URL(route, origin).href);
			if (!server) {
				server = (await response?.text().catch(() => '')) ?? '';
				status = response?.status() ?? 0;
			}
			await settle(page);
			await finishAnimations(page);
			const faces = viewport === viewports[0] ? await page.evaluate(markLateFontCandidates, LATE_CANDIDATE).catch(() => []) : [];
			settled[viewport.name] = await page.evaluate(() => `<!DOCTYPE html>${document.documentElement.outerHTML}`);
			images[viewport.name] = await page.evaluate(readImages);
			if (viewport === viewports[0]) {
				// A phone's first screen, by the same page at a phone's width: a face either first screen draws is not late.
				const phone = viewports.find((v) => v.isMobile);
				let shownOnPhone: string[] = [];
				if (phone && faces.length) {
					await page.setViewportSize({ width: phone.width, height: phone.height });
					shownOnPhone = await page.evaluate(lateFontsInFirstScreen, LATE_CANDIDATE);
				}
				lateFonts = faces.filter((f) => !f.firstScreen && !shownOnPhone.includes(f.id)).map((f) => ({ id: f.id, key: f.key }));
				firstScreenFonts = faces.filter((f) => f.firstScreen || shownOnPhone.includes(f.id)).map((f) => f.url);
				images[viewport.name] = await withWidths(page, images[viewport.name]!, viewport);
			}
		} finally {
			await context.close().catch(() => {});
		}
	}
	const captured: CapturedPage = { route, status, server, settled, images, ...(lateFonts.length ? { lateFonts } : {}), ...(firstScreenFonts.length ? { firstScreenFonts } : {}) };
	await mkdir(dir, { recursive: true });
	await writeFile(file, JSON.stringify(captured));
	return captured;
}

// The page resized to each measuring width, after its document was kept: what its images' boxes do between the captured viewports.
async function withWidths(page: Page, facts: ImageFacts, viewport: Viewport): Promise<ImageFacts> {
	const at: Record<string, number>[] = facts.images.map(() => ({}));
	for (const width of MEASURE_WIDTHS) {
		await page.setViewportSize({ width, height: viewport.height });
		const widths = await page.evaluate(readImageWidths);
		if (widths.length !== facts.images.length) return facts;
		widths.forEach((w, i) => (at[i]![String(width)] = w));
	}
	await page.setViewportSize({ width: viewport.width, height: viewport.height });
	return { ...facts, images: facts.images.map((img, i) => ({ ...img, widths: at[i]! })) };
}

/** A captured route held by its status; the documents (a few MB each) are read from the cache when needed. */
export interface CapturedRef {
	readonly route: string;
	readonly status: number;
	load(): Promise<CapturedPage>;
}

/** Captures every route, `concurrency` at a time, reporting progress through `log`. */
export async function captureAll(browser: Browser, origin: string, routes: readonly string[], dir: string, options: { concurrency?: number; log?: (line: string) => void } = {}): Promise<CapturedRef[]> {
	const out: CapturedRef[] = new Array(routes.length);
	let next = 0;
	let done = 0;
	const worker = async () => {
		while (next < routes.length) {
			const index = next++;
			const route = routes[index]!;
			const { status } = await capturePage(browser, origin, route, dir);
			out[index] = { route, status, load: () => capturePage(browser, origin, route, dir) };
			done++;
			options.log?.(`captured ${done}/${routes.length} ${route}`);
		}
	};
	await Promise.all(Array.from({ length: Math.max(1, options.concurrency ?? 4) }, worker));
	return out;
}
