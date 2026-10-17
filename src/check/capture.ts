import type { Browser, Page, Response } from 'playwright';
import { collectPage, decodeImages } from './collect.ts';
import { createHash } from 'node:crypto';
import { captureA11y } from './a11y.ts';
import { isFingerprinted } from './assets.ts';
import { BlockedError, detectChallenge } from './blocked.ts';
import { defaultEnv, openPage, serverRecords, tagHeaders, type SideEnv } from './browser.ts';
import { renderedFonts } from './fonts.ts';
import { captureSourceHints } from './hints-page.ts';
import type { AssetRecord, HttpCapture, HttpHop, PageCapture, RouteCapture, ScriptWeight, Viewport } from './types.ts';

const ASSET_TYPES = new Set(['image', 'font', 'stylesheet', 'script', 'media']);

// Markless's router names the page file that rendered the route in a script tag.
function routeFile(html: string): { routeFile?: string } {
	const json = /<script type="@markless\/core\/route">([^<]*)<\/script>/.exec(html)?.[1];
	try {
		const file = json ? (JSON.parse(json) as { file?: unknown }).file : undefined;
		return typeof file === 'string' ? { routeFile: file } : {};
	} catch {
		return {};
	}
}

/** The URL on the app's own origin as a path, with the origin written into it (`?callbackUrl=http%3A%2F%2F...`) as `{origin}`. */
export function toLocal(url: string, origin: string): string {
	const local = url.startsWith(origin) ? url.slice(origin.length) || '/' : url;
	return local === url ? url : originInQuery(local, origin);
}

export function originInQuery(path: string, origin: string): string {
	return path.split(encodeURIComponent(origin)).join(encodeURIComponent('{origin}')).split(origin).join('{origin}');
}

const pageUrlBefore = (page: Page) => page.url();

export function mime(contentType: string | null | undefined): string {
	return (contentType ?? '').split(';')[0]!.trim().toLowerCase();
}

export async function captureHttp(origin: string, route: string, headers: Record<string, string> = {}): Promise<HttpCapture> {
	const chain: HttpHop[] = [];
	let url = new URL(route, origin).href;
	const home = new URL(origin).origin;
	for (let hop = 0; hop < 10; hop++) {
		// Cookies, tokens and bypass headers go only to the app's own origin, never to a host a redirect points at.
		const response = await fetch(url, { redirect: 'manual', headers: new URL(url).origin === home ? headers : Object.fromEntries(Object.entries(headers).filter(([k]) => /^(accept-language|user-agent)$/i.test(k))) });
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

// After a scroll, until no request has been in flight for a moment: a script lazy loader (IntersectionObserver, a
// waypoint) starts its fetch on the scroll and may cancel it on the next one, so it gets to finish first.
async function quietAfter(page: Page, scroll: () => Promise<void>): Promise<void> {
	const pending = new Set<unknown>();
	const add = (request: unknown) => pending.add(request);
	const done = (request: unknown) => pending.delete(request);
	page.on('request', add);
	page.on('requestfinished', done);
	page.on('requestfailed', done);
	try {
		await scroll();
		const deadline = Date.now() + 3_000;
		let quietSince = Date.now();
		while (Date.now() < deadline) {
			if (pending.size) quietSince = Date.now();
			else if (Date.now() - quietSince >= 200) break;
			await new Promise((wake) => setTimeout(wake, 25));
		}
	} finally {
		page.off('request', add);
		page.off('requestfinished', done);
		page.off('requestfailed', done);
	}
}

export async function settle(page: Page): Promise<void> {
	await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
	await quietAfter(page, () =>
		page.evaluate(async () => {
			scrollTo(0, document.documentElement.scrollHeight);
			await new Promise(requestAnimationFrame);
		}),
	);
	await page.evaluate(async () => {
		for (const img of document.images) {
			if (img.complete || img.loading !== 'lazy' || !img.getClientRects().length) continue;
			img.scrollIntoView({ block: 'center' });
			await new Promise(requestAnimationFrame);
		}
		scrollTo(0, 0);
		await document.fonts.ready;
		// <img> fires load or error, never loadend; a lazy one that is not rendered never loads, and neither load nor decode settles.
		const ready = (img: HTMLImageElement) =>
			(img.complete
				? Promise.resolve()
				: new Promise((done) => {
						img.addEventListener('load', done, { once: true });
						img.addEventListener('error', done, { once: true });
					})
			).then(() => img.decode().catch(() => {}));
		await Promise.all([...document.images].map((img) => Promise.race([ready(img), new Promise((done) => setTimeout(done, 5000))])));
	});
}

// A finite animation (an entrance effect) is still running or already done depending on how long the page took to
// settle, so computed styles are read at its end. What was moving is kept first for the reduced-motion check.
export async function finishAnimations(page: Page): Promise<void> {
	await page.evaluate(() => {
		const running = document.getAnimations().filter((a) => a.playState === 'running');
		(window as unknown as { __mmMotion?: string[] }).__mmMotion = running.map((a) => (a as CSSAnimation).animationName ?? (a as CSSTransition).transitionProperty ?? 'script animation').sort();
		for (const animation of running) {
			const end = animation.effect?.getComputedTiming().endTime;
			if (typeof end === 'number' && Number.isFinite(end)) animation.finish();
		}
	});
}

// Text and attribute values of the page, to tell which response fields it shows.
function shownText(): string {
	const attributes = [...document.querySelectorAll('*')].flatMap((el) => [...el.attributes].map((a) => a.value));
	return [document.title, document.body?.innerText ?? '', ...attributes].join('\n');
}

export async function capturePage(browser: Browser, env: SideEnv, route: string, viewport: Viewport): Promise<PageCapture> {
	const origin = env.origin;
	const { context, page, log } = await openPage(browser, env, viewport);
	try {
		const pending: Promise<Omit<AssetRecord, 'fingerprinted'> | undefined>[] = [];
		const stylesheets: { url: string; text: string }[] = [];
		const fontHashes = new Map<string, string>();
		const scriptBytes = new Map<string, { bytes: number; source: number }>();
		page.on('response', (response: Response) => {
			const type = response.request().resourceType();
			if (!ASSET_TYPES.has(type)) return;
			pending.push(
				(async () => {
					const sizes = await response.request().sizes().catch(() => undefined);
					const bytes = sizes?.responseBodySize ?? 0;
					if (type === 'script') scriptBytes.set(response.url(), { bytes, source: response.ok() ? (await response.body().catch(() => Buffer.alloc(0))).length : 0 });
					if (type === 'font' && response.ok()) fontHashes.set(response.url(), createHash('sha256').update(await response.body()).digest('hex'));
					if (type === 'stylesheet' && response.ok()) stylesheets.push({ url: toLocal(response.url(), origin), text: await response.text() });
					return { url: toLocal(response.url(), origin), type, status: response.status(), contentType: mime(response.headers()['content-type']), bytes };
				})().catch(() => undefined),
			);
		});
		await page.coverage.startJSCoverage({ resetOnNavigation: false });
		const navigation = await page.goto(new URL(route, origin).href, { waitUntil: 'load' });
		const html = (await navigation?.text().catch(() => '')) ?? '';
		const wall = navigation && detectChallenge({ status: navigation.status(), headers: await navigation.allHeaders(), body: html });
		if (wall) throw new BlockedError({ status: navigation!.status(), ...wall }, origin);
		await settle(page);
		await finishAnimations(page);
		const collected = await page.evaluate(collectPage, { origin, full: true });
		const aria = (await page.locator('body').ariaSnapshot()).split(origin).join('').split('\n');
		const screenshot = await page.screenshot({ fullPage: true, animations: 'disabled', caret: 'hide' });
		const coverage = await page.coverage.stopJSCoverage();
		await Promise.all(pending);
		const shown = await page.evaluate(shownText);
		const elements = await captureSourceHints(page, await renderedFonts(page, collected.elements, fontHashes));
		const a11y = viewport.isMobile ? undefined : await captureA11y(page);
		for (const [i, text] of (await page.evaluate(() => [...document.querySelectorAll('style')].map((style) => style.textContent ?? ''))).entries()) {
			if (text.trim()) stylesheets.push({ url: `${toLocal(pageUrlBefore(page), origin)} <style> #${i + 1}`, text });
		}
		const builtTexts = [html, ...stylesheets.map((s) => s.text), ...coverage.map((entry) => entry.source ?? '')];
		const assets: AssetRecord[] = (await Promise.all(pending)).filter((a) => a !== undefined).map((a) => ({ ...a, fingerprinted: isFingerprinted(a.url, builtTexts) }));
		const imageUrls = [...new Set(assets.filter((a) => a.type === 'image' && a.status < 400).map((a) => new URL(a.url, origin).href))];
		log.stop();
		const decodedAbsolute = await page.evaluate(decodeImages, imageUrls);
		const decoded = Object.fromEntries(Object.entries(decodedAbsolute).map(([url, size]) => [toLocal(url, origin), size]));
		const pageUrl = page.url();
		const ran = coverage.filter((entry) => entry.url && entry.url !== pageUrl);
		// Preloaded modules that never run are downloaded all the same, so every script response counts, not only the ones coverage saw.
		const scripts: ScriptWeight[] = [
			...ran.map((entry) => ({
				url: toLocal(entry.url, origin),
				bytes: scriptBytes.get(entry.url)?.bytes ?? 0,
				source: (entry.source ?? '').length,
				executed: executedBytes(entry.source ?? '', entry.functions),
			})),
			...[...scriptBytes].filter(([url]) => !ran.some((entry) => entry.url === url)).map(([url, size]) => ({ url: toLocal(url, origin), bytes: size.bytes, source: size.source, executed: 0 })),
		];
		const inline = coverage.filter((entry) => entry.url === pageUrl);
		const inlineExecuted = inline.reduce((sum, entry) => sum + executedBytes(entry.source ?? '', entry.functions), 0);
		await log.settled();
		const server = await serverRecords(env, log.load);
		return {
			viewport: viewport.name,
			finalUrl: toLocal(pageUrl, origin),
			...routeFile(html),
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
			network: { records: [...log.records, ...(server ?? [])], server: server !== undefined, shown },
			blocked: Object.fromEntries(log.blocked),
			writes: log.writes.map((w) => ({ line: w.line, reason: w.reason, sent: w.sent })),
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

export async function captureRoute(browser: Browser, origin: string, route: string, viewports: readonly Viewport[], env: SideEnv = defaultEnv(origin)): Promise<RouteCapture> {
	const [http, ...captured] = await Promise.all([captureHttp(origin, route, tagHeaders(env)), ...viewports.map((viewport) => capturePage(browser, env, route, viewport))]);
	return { origin, route, http, pages: Object.fromEntries(captured.map((page) => [page.viewport, page])) };
}
