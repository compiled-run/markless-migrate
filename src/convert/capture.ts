import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Browser, Page } from 'playwright';
import { defaultEnv, openPage } from '../check/browser.ts';
import { finishAnimations, settle } from '../check/capture.ts';
import { loadPage, servedHtml } from '../check/infrastructure.ts';
import { VIEWPORTS, type Viewport } from '../check/types.ts';
import { MEASURE_WIDTHS, readImages, readImageWidths, type ImageFacts } from './images.ts';
import { fontPreloadsInFirstScreen, LATE_CANDIDATE, lateFontsInFirstScreen, markLateFontCandidates } from './fonts.ts';
import { instancePropMarks, instanceSpecs, legacyInstanceProps, markInstanceProps } from './instance-props.ts';
import { marksOf, missingMarks, type Mark, type Marked } from './marks.ts';

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
	readonly lateFonts?: readonly { readonly id: string; readonly key: string; readonly urls?: readonly string[]; readonly face?: { readonly family: string; readonly src: string; readonly descriptors: Readonly<Record<string, string>> } }[];
	/** The web fonts a first screen draws that the page does not preload and that do not swap: the file each was fetched from. */
	readonly firstScreenFonts?: readonly string[];
	/** The same for the `font-display: swap` faces. */
	readonly swapFirstScreenFonts?: readonly string[];
	/** The font files the page preloads that no first screen draws. */
	readonly offscreenFontPreloads?: readonly string[];
	/** The font files the page preloads that a first screen draws, every face naming which is `font-display: swap`. */
	readonly swapFontPreloads?: readonly string[];
	/** The version of each mark written on the documents (pageMarks): a capture lacking one that applies to it is taken again. */
	readonly marks?: Marked;
	/** Before marks: COMMAND_EMPTY when the commands' empty states were kept. */
	readonly commandEmpty?: number;
	/** Before marks: 1 when each instance's props were written on its elements (instance-props.ts). */
	readonly instanceProps?: number;
	/** FONT_FACTS when the page's web fonts were read (fonts.ts); a capture without them is taken again. */
	readonly fonts?: number;
}

/** The version of the font facts a capture records: lateFonts, the first-screen fonts, offscreenFontPreloads and swapFontPreloads. */
export const FONT_FACTS = 4;

const key = (route: string) => createHash('sha256').update(route).digest('hex').slice(0, 16);

/** Captures (and reveals) taken before commands' empty states were kept are taken again where they hold a cmdk input. */
export const COMMAND_EMPTY = 1;
export const commandEmptyMark: Mark = { id: 'command-empty', version: COMMAND_EMPTY, applies: (html) => html.includes('cmdk-input') };

/** The marks a page's settled documents are written with. */
export const pageMarks = (): Mark[] => [commandEmptyMark, ...instancePropMarks()];

/** The marks a capture was written with, from its own record or, before marks, the version fields it had then. */
export const markedOf = (capture: { readonly marks?: Marked; readonly commandEmpty?: number; readonly instanceProps?: number }, also: Marked = {}): Marked => capture.marks ?? { ...also, ...(capture.commandEmpty !== undefined ? { [commandEmptyMark.id]: capture.commandEmpty } : {}), ...legacyInstanceProps(capture.instanceProps) };

/**
 * cmdk renders [cmdk-empty] only while a search leaves nothing: each command (in `added` content only, when given) is
 * searched for text no item holds, its empty state kept, the search cleared, and the empty state put back, hidden, where
 * cmdk rendered it, so the port can show it.
 */
export async function keepCommandEmpty(page: Page, added?: string): Promise<void> {
	await page
		.evaluate(async (added) => {
			const frame = () => new Promise((done) => requestAnimationFrame(() => setTimeout(done, 0)));
			const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
			const type = (input: HTMLInputElement, text: string) => {
				setValue.call(input, text);
				input.dispatchEvent(new Event('input', { bubbles: true }));
			};
			const scopes = added ? ((window as unknown as Record<string, { node: Element }[] | undefined>)[added] ?? []).map((a) => a.node) : [document.body];
			for (const root of scopes.flatMap((s) => [...s.querySelectorAll('[cmdk-root]')])) {
				const input = root.querySelector<HTMLInputElement>('input[cmdk-input]');
				if (!root.isConnected || root.querySelector('[cmdk-empty]') || !input || input.value) continue;
				type(input, '\uE000\uE001');
				let empty: Element | null = null;
				for (let i = 0; i < 10 && !(empty = root.querySelector('[cmdk-empty]')); i++) await frame();
				const parent = empty?.parentElement;
				const next = empty?.nextElementSibling;
				const kept = empty?.cloneNode(true) as HTMLElement | undefined;
				type(input, '');
				for (let i = 0; i < 10 && root.querySelector('[cmdk-empty]'); i++) await frame();
				await frame();
				if (!kept || !parent?.isConnected || root.querySelector('[cmdk-empty]')) continue;
				kept.hidden = true;
				parent.insertBefore(kept, next?.parentElement === parent ? next : parent.firstElementChild);
			}
		}, added)
		.catch(() => {});
}

/**
 * Loads a route the way `check` loads it (the same frozen environment, the same settling) and keeps the document the
 * old page ends up showing. What a server sends is often not what a visitor sees: a skeleton the client replaces, a
 * streamed boundary swapped in by an inline script. Cached by route under `dir`.
 */
export async function capturePage(browser: Browser, origin: string, route: string, dir: string, viewports: readonly Viewport[] = VIEWPORTS): Promise<CapturedPage> {
	const file = join(dir, `${key(route)}.json`);
	const cached = await readFile(file, 'utf8').then((text) => JSON.parse(text) as CapturedPage, () => undefined);
	const marks = pageMarks();
	if (cached && cached.route === route && !missingMarks(Object.values(cached.settled), markedOf(cached), marks).length && cached.fonts === FONT_FACTS) return cached;
	let server = '';
	let status = 0;
	const settled: Record<string, string> = {};
	const images: Record<string, ImageFacts> = {};
	let lateFonts: NonNullable<CapturedPage['lateFonts']>[number][] = [];
	let firstScreenFonts: string[] = [];
	let swapFirstScreenFonts: string[] = [];
	let offscreenFontPreloads: string[] = [];
	let swapFontPreloads: string[] = [];
	for (const viewport of viewports) {
		const env = defaultEnv(origin);
		const { context, page } = await openPage(browser, env, viewport);
		try {
			const response = await loadPage(page, new URL(route, origin).href);
			if (!server) {
				server = await servedHtml(page, response);
				status = response?.status() ?? 0;
			}
			await settle(page);
			await finishAnimations(page);
			await keepCommandEmpty(page);
			const faces = viewport === viewports[0] ? await page.evaluate(markLateFontCandidates, LATE_CANDIDATE).catch(() => []) : [];
			await page.evaluate(markInstanceProps, { specs: instanceSpecs(), added: false }).catch(() => {});
			settled[viewport.name] = await page.evaluate(() => `<!DOCTYPE html>${document.documentElement.outerHTML}`);
			images[viewport.name] = await page.evaluate(readImages);
			if (viewport === viewports[0]) {
				// A phone's first screen, by the same page at a phone's width: a face either first screen draws is not late.
				const phone = viewports.find((v) => v.isMobile);
				let shownOnPhone: string[] = [];
				const preloads = await page.evaluate(fontPreloadsInFirstScreen).catch(() => ({ preloaded: [], drawn: [], swap: [] }));
				const drawn = new Set(preloads.drawn);
				if (phone && (faces.length || preloads.preloaded.length)) {
					await page.setViewportSize({ width: phone.width, height: phone.height });
					if (faces.length) shownOnPhone = await page.evaluate(lateFontsInFirstScreen, LATE_CANDIDATE);
					if (preloads.preloaded.length) for (const u of (await page.evaluate(fontPreloadsInFirstScreen).catch(() => preloads)).drawn) drawn.add(u);
				}
				offscreenFontPreloads = preloads.preloaded.filter((u) => !drawn.has(u));
				swapFontPreloads = preloads.swap.filter((u) => drawn.has(u));
				lateFonts = faces.filter((f) => !f.firstScreen && !shownOnPhone.includes(f.id)).map((f) => ({ id: f.id, key: f.key, urls: f.urls, face: f.face }));
				const first = faces.filter((f) => !f.preloaded && (f.firstScreen || shownOnPhone.includes(f.id)));
				firstScreenFonts = first.filter((f) => f.face.descriptors.display !== 'swap').map((f) => f.url);
				swapFirstScreenFonts = first.filter((f) => f.face.descriptors.display === 'swap').map((f) => f.url);
				images[viewport.name] = await withWidths(page, images[viewport.name]!, viewport);
			}
		} finally {
			await context.close().catch(() => {});
		}
	}
	const captured: CapturedPage = { route, status, server, settled, images, marks: marksOf(marks), fonts: FONT_FACTS, ...(lateFonts.length ? { lateFonts } : {}), ...(firstScreenFonts.length ? { firstScreenFonts } : {}), ...(swapFirstScreenFonts.length ? { swapFirstScreenFonts } : {}), ...(offscreenFontPreloads.length ? { offscreenFontPreloads } : {}), ...(swapFontPreloads.length ? { swapFontPreloads } : {}) };
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
