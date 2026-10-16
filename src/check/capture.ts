import type { Browser, BrowserContextOptions, Page, Response } from 'playwright';
import { collectPage, decodeImages } from './collect.ts';
import { createHash } from 'node:crypto';
import { captureA11y } from './a11y.ts';
import { isFingerprinted } from './assets.ts';
import { renderedFonts } from './fonts.ts';
import type { AssetRecord, HttpCapture, HttpHop, PageCapture, RouteCapture, ScriptWeight, Viewport } from './types.ts';

const ASSET_TYPES = new Set(['image', 'font', 'stylesheet', 'script', 'media']);

export function toLocal(url: string, origin: string): string {
	return url.startsWith(origin) ? url.slice(origin.length) || '/' : url;
}

const pageUrlBefore = (page: Page) => page.url();

export function mime(contentType: string | null | undefined): string {
	return (contentType ?? '').split(';')[0]!.trim().toLowerCase();
}

export async function captureHttp(origin: string, route: string, headers: Record<string, string> = {}): Promise<HttpCapture> {
	const chain: HttpHop[] = [];
	let url = new URL(route, origin).href;
	for (let hop = 0; hop < 10; hop++) {
		const response = await fetch(url, { redirect: 'manual', headers });
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

export async function settle(page: Page): Promise<void> {
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

export function contextOptions(viewport: Viewport): BrowserContextOptions {
	return {
		viewport: { width: viewport.width, height: viewport.height },
		isMobile: viewport.isMobile,
		hasTouch: viewport.isMobile,
		deviceScaleFactor: 1,
		reducedMotion: 'reduce',
		colorScheme: 'light',
		serviceWorkers: 'block',
	};
}

export async function capturePage(browser: Browser, origin: string, route: string, viewport: Viewport): Promise<PageCapture> {
	const context = await browser.newContext(contextOptions(viewport));
	try {
		const page = await context.newPage();
		const pending: Promise<Omit<AssetRecord, 'fingerprinted'> | undefined>[] = [];
		const stylesheets: { url: string; text: string }[] = [];
		const fontHashes = new Map<string, string>();
		const scriptBytes = new Map<string, number>();
		page.on('response', (response: Response) => {
			const type = response.request().resourceType();
			if (!ASSET_TYPES.has(type)) return;
			pending.push(
				(async () => {
					const sizes = await response.request().sizes().catch(() => undefined);
					const bytes = sizes?.responseBodySize ?? 0;
					if (type === 'script') scriptBytes.set(response.url(), bytes);
					if (type === 'font' && response.ok()) fontHashes.set(response.url(), createHash('sha256').update(await response.body()).digest('hex'));
					if (type === 'stylesheet' && response.ok()) stylesheets.push({ url: toLocal(response.url(), origin), text: await response.text() });
					return { url: toLocal(response.url(), origin), type, status: response.status(), contentType: mime(response.headers()['content-type']), bytes };
				})().catch(() => undefined),
			);
		});
		await page.coverage.startJSCoverage({ resetOnNavigation: false });
		const navigation = await page.goto(new URL(route, origin).href, { waitUntil: 'load' });
		const html = (await navigation?.text().catch(() => '')) ?? '';
		await settle(page);
		const collected = await page.evaluate(collectPage, { origin, full: true });
		const aria = (await page.locator('body').ariaSnapshot()).split(origin).join('').split('\n');
		const screenshot = await page.screenshot({ fullPage: true, animations: 'disabled', caret: 'hide' });
		const coverage = await page.coverage.stopJSCoverage();
		await Promise.all(pending);
		const elements = await renderedFonts(page, collected.elements, fontHashes);
		const a11y = viewport.isMobile ? undefined : await captureA11y(page);
		for (const [i, text] of (await page.evaluate(() => [...document.querySelectorAll('style')].map((style) => style.textContent ?? ''))).entries()) {
			if (text.trim()) stylesheets.push({ url: `${toLocal(pageUrlBefore(page), origin)} <style> #${i + 1}`, text });
		}
		const builtTexts = [html, ...stylesheets.map((s) => s.text), ...coverage.map((entry) => entry.source ?? '')];
		const assets: AssetRecord[] = (await Promise.all(pending)).filter((a) => a !== undefined).map((a) => ({ ...a, fingerprinted: isFingerprinted(a.url, builtTexts) }));
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
			stylesheets,
			decoded,
			images: collected.images,
			fonts: collected.fonts,
			elements,
			screenshot,
			...(a11y ? { a11y } : {}),
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
