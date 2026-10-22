import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Browser } from 'playwright';
import { defaultEnv, openPage } from '../check/browser.ts';
import { finishAnimations, settle } from '../check/capture.ts';
import { loadPage } from '../check/infrastructure.ts';
import { VIEWPORTS, type Viewport } from '../check/types.ts';

/** One route of the old site as a visitor's browser holds it once the page has settled, beside what its server sent. */
export interface CapturedPage {
	readonly route: string;
	readonly status: number;
	/** The HTML the old server answered with, before any script ran. */
	readonly server: string;
	/** The document after load, under the checker's frozen clock, seed and environment, per viewport name. */
	readonly settled: Readonly<Record<string, string>>;
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
			settled[viewport.name] = await page.evaluate(() => `<!DOCTYPE html>${document.documentElement.outerHTML}`);
		} finally {
			await context.close().catch(() => {});
		}
	}
	const captured: CapturedPage = { route, status, server, settled };
	await mkdir(dir, { recursive: true });
	await writeFile(file, JSON.stringify(captured));
	return captured;
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
