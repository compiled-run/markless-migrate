import { frameworkBuilds } from '../client/builds.ts';
import { frameworkMarkup, frameworkRuntime, scriptLibraries, sealedBy, thirdPartyEmbeds } from './automatic.ts';
import type { Browser, Page, Response } from 'playwright';
import { decodeImages, readPage } from './collect.ts';
import { createHash } from 'node:crypto';
import { captureA11y } from './a11y.ts';
import { isFingerprinted } from './assets.ts';
import { BlockedError, detectChallenge } from './blocked.ts';
import { signInCookies, storageKeys } from './storage.ts';
import { defaultEnv, insideEmbed, openPage, serverRecords, tagHeaders, type SideEnv } from './browser.ts';
import { renderedFonts } from './fonts.ts';
import { captureSourceHints } from './hints-page.ts';
import type { AssetRecord, HttpCapture, HttpHop, PageCapture, RouteCapture, ScriptWeight, Viewport } from './types.ts';
import { request } from './http.ts';
import { LOAD_TIMEOUT_MS, loadPage } from './infrastructure.ts';
import { holdLoops, loopEffects, settleMotion, type LoopEffect } from './loops.ts';
import { liveEmbeds, maskedShot, withoutEmbeds, type LiveEmbed } from './embeds.ts';
import { routeLinks, routePath, shellRoute } from './hash-routes.ts';
import { runtimeMarkers } from './residue.ts';

const ASSET_TYPES = new Set(['image', 'font', 'stylesheet', 'script', 'media']);

/** The page file Markless's router names, in a script tag, as the one that rendered the route. */
export function routeFile(html: string): { routeFile?: string } {
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

/** A route's HTTP answer; a hash-routed app answers every route from its shell at `/`, which is reported under the route. */
export async function captureRouteHttp(env: Pick<SideEnv, 'origin' | 'routing'>, route: string, headers: Record<string, string> = {}): Promise<HttpCapture> {
	if (!shellRoute(route, env.routing)) return captureHttp(env.origin, route, headers);
	const http = await captureHttp(env.origin, '/', headers);
	return { ...http, chain: http.chain.map((hop, i) => (i === 0 ? { ...hop, url: route } : hop)) };
}

export async function captureHttp(origin: string, route: string, headers: Record<string, string> = {}): Promise<HttpCapture> {
	const chain: HttpHop[] = [];
	let url = new URL(route, origin).href;
	const home = new URL(origin).origin;
	for (let hop = 0; hop < 10; hop++) {
		// Cookies, tokens and bypass headers go only to the app's own origin, never to a host a redirect points at.
		const response = await request(url, { redirect: 'manual', headers: new URL(url).origin === home ? headers : Object.fromEntries(Object.entries(headers).filter(([k]) => /^(accept-language|user-agent)$/i.test(k))) });
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

/** Where a browser load of the route ends once it has settled: a single-page app may move its address as it starts. */
export async function landing(browser: Browser, env: SideEnv, route: string, viewport: Viewport): Promise<string | undefined> {
	const { context, page } = await openPage(browser, env, viewport, { shareThirdParty: true });
	try {
		await loadPage(page, new URL(route, env.origin).href);
		await settle(page);
		return toLocal(page.url(), env.origin);
	} catch {
		return undefined;
	} finally {
		await context.close();
	}
}

// A page taller than this many views is read with what its first ones loaded (an endless feed).
const MAX_VIEWS = 150;

export async function settle(page: Page): Promise<void> {
	await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
	// A script lazy loader (an IntersectionObserver per card) loads only what passes through the view: the page is scrolled
	// through a view at a time, not jumped to its end, so every run has loaded the same content before it is read.
	const views = await page.evaluate((max) => Math.min(max, Math.ceil(document.documentElement.scrollHeight / Math.max(1, innerHeight))), MAX_VIEWS).catch(() => 1);
	for (let k = 1; k <= views; k++) await quietAfter(page, () => page.evaluate(async (k) => {
		scrollTo(0, k * innerHeight);
		await new Promise(requestAnimationFrame);
	}, k));
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
		await Promise.all([...document.images].map((img) => Promise.race([ready(img), new Promise((done) => setTimeout(done, 15_000))])));
	});
}

// A finite animation (an entrance effect) is still running or already done depending on how long the page took to
// settle, so computed styles are read at its end. What was moving (`seen`: also while the load settled) is kept first for the reduced-motion check.
export async function finishAnimations(page: Page, seen: readonly string[] = []): Promise<void> {
	await page.evaluate((seen) => {
		const running = document.getAnimations().filter((a) => a.playState === 'running');
		const now = running.map((a) => (a as CSSAnimation).animationName ?? (a as CSSTransition).transitionProperty ?? 'script animation');
		const extra = [...seen];
		for (const name of now) {
			const at = extra.indexOf(name);
			if (at >= 0) extra.splice(at, 1);
		}
		(window as unknown as { __mmMotion?: string[] }).__mmMotion = [...now, ...extra].sort();
		for (const animation of running) {
			const end = animation.effect?.getComputedTiming().endTime;
			if (typeof end === 'number' && Number.isFinite(end) && animation.timeline === document.timeline) animation.finish();
		}
	}, seen);
}

// Text and attribute values of the page, to tell which response fields it shows; a script's or resource hint's URL loads code, it shows nothing.
export function shownText(): string {
	const loads = (el: Element, name: string) => (el.localName === 'script' && name === 'src') || (el.localName === 'link' && name === 'href' && /(^|\s)(preload|modulepreload|prefetch|prerender|preconnect|dns-prefetch|stylesheet)(\s|$)/i.test(el.getAttribute('rel') ?? ''));
	const attributes = [...document.querySelectorAll('*')].flatMap((el) => [...el.attributes].filter((a) => !loads(el, a.name)).map((a) => a.value));
	return [document.title, document.body?.innerText ?? '', ...attributes].join('\n');
}

/** The GET responses each capture's page loaded from its own origin, and the scripts, styles and fonts from others (not an embed's), so a cache can tell whether the page changed. */
export const pageLoads = new WeakMap<PageCapture, readonly string[]>();

/** The GETs each capture's page or its embeds made to other origins for data, and an embed's code: kept with a cached old capture and given to the new page with it. */
export const thirdPartyLoads = new WeakMap<PageCapture, readonly string[]>();

// A response its page left by navigating away (the about:blank before a retried load) never finishes: its body and sizes would wait forever.
function readWithin<T>(work: Promise<T>): Promise<T | undefined> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	return Promise.race([work, new Promise<undefined>((done) => {
		timer = setTimeout(() => done(undefined), LOAD_TIMEOUT_MS);
	})]).finally(() => clearTimeout(timer));
}

export async function capturePage(browser: Browser, env: SideEnv, route: string, viewport: Viewport): Promise<PageCapture> {
	const origin = env.origin;
	const { context, page, log, own } = await openPage(browser, env, viewport, { loops: true, shareThirdParty: true });
	try {
		const pending: Promise<Omit<AssetRecord, 'fingerprinted'> | undefined>[] = [];
		const stylesheets: { url: string; text: string }[] = [];
		const fontHashes = new Map<string, string>();
		const scriptBytes = new Map<string, { bytes: number; source: number }>();
		const runtimes = new Map<string, string>();
		const libraries = new Map<string, string[]>();
		const embedded = new Set<string>();
		const ownScripts = new Set<string>();
		const loaded = new Set<string>();
		const fromOthers = new Set<string>();
		page.on('response', (response: Response) => {
			const type = response.request().resourceType();
			const url = URL.parse(response.url());
			const frameDocument = type === 'document' && response.frame() !== page.mainFrame();
			const ofEmbed = insideEmbed(response.request(), own) || (frameDocument && url !== null && !own(url));
			if (ofEmbed) embedded.add(response.url());
			// The old page's own responses and the code and looks it pulls from other origins; what other origins answer its requests for data is theirs.
			if (url && !ofEmbed && !frameDocument && response.request().method() === 'GET' && /^https?:$/.test(url.protocol) && (own(url) || ['script', 'stylesheet', 'font'].includes(type))) loaded.add(response.url());
			else if (url && !frameDocument && response.request().method() === 'GET' && /^https?:$/.test(url.protocol) && !own(url) && ['script', 'fetch', 'xhr'].includes(type)) fromOthers.add(response.url());
			if (!ASSET_TYPES.has(type) || ofEmbed) return;
			if (type === 'script') ownScripts.add(response.url());
			pending.push(
				readWithin((async () => {
					const sizes = await response.request().sizes().catch(() => undefined);
					const bytes = sizes?.responseBodySize ?? 0;
					if (type === 'script') {
						const body = response.ok() ? await response.body().catch(() => Buffer.alloc(0)) : Buffer.alloc(0);
						scriptBytes.set(response.url(), { bytes, source: body.length });
						const code = body.toString('utf8');
						const runtime = frameworkRuntime(code);
						if (runtime) runtimes.set(toLocal(response.url(), origin), runtime);
						const found = scriptLibraries(code);
						if (found.length) libraries.set(toLocal(response.url(), origin), found);
					}
					if (type === 'font' && response.ok()) fontHashes.set(response.url(), createHash('sha256').update(await response.body()).digest('hex'));
					if (type === 'stylesheet' && response.ok()) stylesheets.push({ url: toLocal(response.url(), origin), text: await response.text() });
					return { url: toLocal(response.url(), origin), type, status: response.status(), contentType: mime(response.headers()['content-type']), bytes };
				})().catch(() => undefined)),
			);
		});
		// A stylesheet that never answered is recorded too (status 0), so a page that rendered without it can be told apart.
		page.on('requestfailed', (request) => {
			if (request.resourceType() === 'stylesheet' && !insideEmbed(request, own)) pending.push(Promise.resolve({ url: toLocal(request.url(), origin), type: 'stylesheet', status: 0, contentType: '', bytes: 0 }));
		});
		await page.coverage.startJSCoverage({ resetOnNavigation: false });
		const navigation = await loadPage(page, new URL(route, origin).href);
		const html = (await navigation?.text().catch(() => '')) ?? '';
		const wall = navigation && detectChallenge({ status: navigation.status(), headers: await navigation.allHeaders(), body: html });
		if (wall) throw new BlockedError({ status: navigation!.status(), ...wall }, origin);
		await settle(page);
		await finishAnimations(page, await settleMotion(page));
		await page.evaluate(holdLoops).catch(() => 0);
		// Marked first, so the page's text, elements and accessibility tree leave every embed's inside to the embed step.
		const marked = await page.evaluate(liveEmbeds, true).catch(() => [] as LiveEmbed[]);
		const collected = await readPage(page, { origin, full: true });
		const loops = await page.evaluate(loopEffects).catch(() => [] as LoopEffect[]);
		const embedTrees = marked.length ? await Promise.all((await page.locator('[data-markless-migrate-embed]').all()).map((l) => l.ariaSnapshot({ timeout: 2000 }).catch(() => ''))) : [];
		const aria = withoutEmbeds(routeLinks(await page.locator('body').ariaSnapshot(), env.routing).split(origin).join('').split('\n'), embedTrees.map((t) => t.split(origin).join('').split('\n')));
		const { shot: screenshot, embeds: live } = await maskedShot(page, (mask) => page.screenshot({ fullPage: true, animations: 'disabled', caret: 'hide', mask }), marked);
		const coverage = await page.coverage.stopJSCoverage();
		await Promise.all(pending);
		const shown = await page.evaluate(shownText);
		const elements = await captureSourceHints(page, await renderedFonts(page, collected.elements, fontHashes));
		const storage = await storageKeys(page, signInCookies(env.storageState));
		const sealed = Object.fromEntries((await context.cookies(page.url()).catch(() => [])).flatMap((c) => {
			const framework = sealedBy(c.value);
			return framework ? [[c.name, framework]] : [];
		}));
		const a11y = viewport.isMobile ? undefined : await captureA11y(page);
		for (const [i, text] of (await page.evaluate(() => [...document.querySelectorAll('style')].map((style) => style.textContent ?? ''))).entries()) {
			if (text.trim()) stylesheets.push({ url: `${toLocal(pageUrlBefore(page), origin)} <style> #${i + 1}`, text });
		}
		const builtTexts = [html, ...stylesheets.map((s) => s.text), ...coverage.map((entry) => entry.source ?? '')];
		// A script served from the build path the page's framework declares is that framework's code, though one chunk alone
		// (a Qwik handler's) carries no marker of its runtime.
		const builds = frameworkBuilds(html);
		for (const url of ownScripts) {
			const local = toLocal(url, origin);
			const path = URL.parse(url)?.pathname;
			const build = path && !runtimes.has(local) ? builds.find((b) => b.path.test(path)) : undefined;
			if (build) runtimes.set(local, `${build.framework} build`);
		}
		const assets: AssetRecord[] = (await Promise.all(pending)).filter((a) => a !== undefined).map((a) => ({ ...a, fingerprinted: isFingerprinted(a.url, builtTexts), ...(runtimes.has(a.url) ? { runtime: runtimes.get(a.url)! } : {}), ...(libraries.has(a.url) ? { libraries: libraries.get(a.url)! } : {}) }));
		const internals = await page.evaluate(frameworkMarkup).catch(() => []);
		const embeds = await page.evaluate(thirdPartyEmbeds).catch(() => []);
		const served = runtimeMarkers(html, 'served');
		const residue = [...served, ...runtimeMarkers(await page.content().catch(() => ''), 'page').filter((m) => !served.some((s) => s.marker === m.marker))];
		const imageUrls = [...new Set(assets.filter((a) => a.type === 'image' && a.status < 400).map((a) => new URL(a.url, origin).href))];
		log.stop();
		const decodedAbsolute = await page.evaluate(decodeImages, imageUrls);
		const decoded = Object.fromEntries(Object.entries(decodedAbsolute).map(([url, size]) => [toLocal(url, origin), size]));
		const pageUrl = page.url();
		const ran = coverage.filter((entry) => entry.url && entry.url !== pageUrl && !(embedded.has(entry.url) && !ownScripts.has(entry.url)));
		// Preloaded modules that never run are downloaded all the same, so every script response counts, not only the ones coverage saw.
		const scripts: ScriptWeight[] = [
			...ran.map((entry) => ({
				url: toLocal(entry.url, origin),
				bytes: scriptBytes.get(entry.url)?.bytes ?? 0,
				source: (entry.source ?? '').length,
				executed: executedBytes(entry.source ?? '', entry.functions),
				content: createHash('sha256').update(entry.source ?? '').digest('hex').slice(0, 16),
			})),
			...[...scriptBytes].filter(([url]) => !ran.some((entry) => entry.url === url)).map(([url, size]) => ({ url: toLocal(url, origin), bytes: size.bytes, source: size.source, executed: 0 })),
		];
		const inline = coverage.filter((entry) => entry.url === pageUrl);
		const inlineExecuted = inline.reduce((sum, entry) => sum + executedBytes(entry.source ?? '', entry.functions), 0);
		await log.settled();
		const server = await serverRecords(env, log.load);
		const captured: PageCapture = {
			viewport: viewport.name,
			finalUrl: toLocal(routePath(pageUrl, env.routing), origin),
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
			...(log.sockets.length ? { sockets: log.sockets.map((s) => ({ url: s.url, frames: [...s.frames] })) } : {}),
			blocked: Object.fromEntries(log.blocked),
			writes: log.writes.map((w) => ({ line: w.line, reason: w.reason, sent: w.sent })),
			storage,
			...(Object.keys(sealed).length ? { sealed } : {}),
			...(internals.length ? { internals } : {}),
			...(embeds.length ? { embeds } : {}),
			...(live.length ? { liveEmbeds: live } : {}),
			...(loops.length ? { loops } : {}),
			...(residue.length ? { residue } : {}),
			weight: {
				downloaded: scripts.reduce((sum, s) => sum + s.bytes, 0),
				source: scripts.reduce((sum, s) => sum + s.source, 0) + inline.reduce((sum, entry) => sum + (entry.source ?? '').length, 0),
				executed: scripts.reduce((sum, s) => sum + s.executed, 0) + inlineExecuted,
				scripts,
			},
		};
		pageLoads.set(captured, [new URL(route, origin).href, ...loaded]);
		thirdPartyLoads.set(captured, [...fromOthers]);
		return captured;
	} finally {
		await context.close();
	}
}

export async function captureRoute(browser: Browser, origin: string, route: string, viewports: readonly Viewport[], env: SideEnv = defaultEnv(origin)): Promise<RouteCapture> {
	const [http, ...captured] = await Promise.all([captureRouteHttp(env, route, tagHeaders(env)), ...viewports.map((viewport) => capturePage(browser, env, route, viewport))]);
	return { origin, route, http, pages: Object.fromEntries(captured.map((page) => [page.viewport, page])) };
}
