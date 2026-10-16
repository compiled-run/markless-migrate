import type { Browser, Page, Response } from 'playwright';
import { collectPage, decodeImages } from './collect.ts';
import type { AssetRecord, HttpCapture, HttpHop, PageCapture, RouteCapture, ScriptWeight, Viewport } from './types.ts';

const ASSET_TYPES = new Set(['image', 'font', 'stylesheet', 'script', 'media']);

export function toLocal(url: string, origin: string): string {
	return url.startsWith(origin) ? url.slice(origin.length) || '/' : url;
}

export function mime(contentType: string | null | undefined): string {
	return (contentType ?? '').split(';')[0]!.trim().toLowerCase();
}

export async function captureHttp(origin: string, route: string): Promise<HttpCapture> {
	const chain: HttpHop[] = [];
	let url = new URL(route, origin).href;
	for (let hop = 0; hop < 10; hop++) {
		const response = await fetch(url, { redirect: 'manual' });
		await response.body?.cancel();
		chain.push({ url: toLocal(url, origin), status: response.status });
		const location = response.headers.get('location');
		if (response.status >= 300 && response.status < 400 && location) {
			url = new URL(location, url).href;
			continue;
		}
		return { chain, status: response.status, contentType: mime(response.headers.get('content-type')) };
	}
	throw new Error(`more than 10 redirects starting at ${route}`);
}

// Bytes a V8 coverage entry ran: inner ranges are painted after the outer ranges that contain them.
export function executedBytes(source: string, functions: readonly { ranges: readonly { startOffset: number; endOffset: number; count: number }[] }[]): number {
	const ranges = functions.flatMap((f) => f.ranges).sort((a, b) => a.startOffset - b.startOffset || b.endOffset - a.endOffset);
	const used = new Uint8Array(source.length);
	for (const range of ranges) used.fill(range.count > 0 ? 1 : 0, range.startOffset, Math.min(range.endOffset, source.length));
	let total = 0;
	for (const byte of used) total += byte;
	return total;
}

async function settle(page: Page): Promise<void> {
	await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
	await page.evaluate(async () => {
		scrollTo(0, document.documentElement.scrollHeight);
		await new Promise(requestAnimationFrame);
		scrollTo(0, 0);
		await document.fonts.ready;
		const loaded = (img: HTMLImageElement) => (img.complete ? Promise.resolve() : new Promise((done) => img.addEventListener('loadend', done, { once: true })));
		await Promise.all([...document.images].map((img) => loaded(img).then(() => img.decode().catch(() => {}))));
	});
}

export async function capturePage(browser: Browser, origin: string, route: string, viewport: Viewport): Promise<PageCapture> {
	const context = await browser.newContext({
		viewport: { width: viewport.width, height: viewport.height },
		isMobile: viewport.isMobile,
		hasTouch: viewport.isMobile,
		deviceScaleFactor: 1,
		reducedMotion: 'reduce',
		serviceWorkers: 'block',
	});
	try {
		const page = await context.newPage();
		const pending: Promise<AssetRecord | undefined>[] = [];
		const scriptBytes = new Map<string, number>();
		page.on('response', (response: Response) => {
			const type = response.request().resourceType();
			if (!ASSET_TYPES.has(type)) return;
			pending.push(
				(async () => {
					const sizes = await response.request().sizes().catch(() => undefined);
					const bytes = sizes?.responseBodySize ?? 0;
					if (type === 'script') scriptBytes.set(response.url(), bytes);
					return { url: toLocal(response.url(), origin), type, status: response.status(), contentType: mime(response.headers()['content-type']), bytes };
				})().catch(() => undefined),
			);
		});
		await page.coverage.startJSCoverage({ resetOnNavigation: false });
		await page.goto(new URL(route, origin).href, { waitUntil: 'load' });
		await settle(page);
		const collected = await page.evaluate(collectPage, { origin, full: true });
		const aria = (await page.locator('body').ariaSnapshot()).split(origin).join('').split('\n');
		const screenshot = await page.screenshot({ fullPage: true, animations: 'disabled', caret: 'hide' });
		const coverage = await page.coverage.stopJSCoverage();
		const assets = (await Promise.all(pending)).filter((a): a is AssetRecord => a !== undefined);
		const imageUrls = [...new Set(assets.filter((a) => a.type === 'image' && a.status < 400).map((a) => new URL(a.url, origin).href))];
		const decodedAbsolute = await page.evaluate(decodeImages, imageUrls);
		const decoded = Object.fromEntries(Object.entries(decodedAbsolute).map(([url, size]) => [toLocal(url, origin), size]));
		const pageUrl = page.url();
		const scripts: ScriptWeight[] = coverage
			.filter((entry) => entry.url && entry.url !== pageUrl)
			.map((entry) => ({
				url: toLocal(entry.url, origin),
				bytes: scriptBytes.get(entry.url) ?? 0,
				source: (entry.source ?? '').length,
				executed: executedBytes(entry.source ?? '', entry.functions),
			}));
		const inline = coverage.filter((entry) => entry.url === pageUrl);
		const inlineExecuted = inline.reduce((sum, entry) => sum + executedBytes(entry.source ?? '', entry.functions), 0);
		return {
			viewport: viewport.name,
			finalUrl: toLocal(pageUrl, origin),
			aria,
			text: collected.text,
			seo: collected.seo,
			assets,
			decoded,
			images: collected.images,
			fonts: collected.fonts,
			elements: collected.elements,
			screenshot,
			weight: {
				downloaded: scripts.reduce((sum, s) => sum + s.bytes, 0),
				source: scripts.reduce((sum, s) => sum + s.source, 0) + inline.reduce((sum, entry) => sum + (entry.source ?? '').length, 0),
				executed: scripts.reduce((sum, s) => sum + s.executed, 0) + inlineExecuted,
				scripts,
			},
		};
	} finally {
		await context.close();
	}
}

export async function captureRoute(browser: Browser, origin: string, route: string, viewports: readonly Viewport[]): Promise<RouteCapture> {
	const [http, ...captured] = await Promise.all([captureHttp(origin, route), ...viewports.map((viewport) => capturePage(browser, origin, route, viewport))]);
	return { origin, route, http, pages: Object.fromEntries(captured.map((page) => [page.viewport, page])) };
}
