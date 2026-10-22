import type { Browser, Page } from 'playwright';
import type { EmbedUse } from './types.ts';

export interface LoadCost {
	readonly bytes: number;
	readonly requests: number;
	readonly fcpMs?: number;
	readonly lcpMs?: number;
}

export interface EmbedCost {
	readonly route: string;
	/** The page as it is. */
	readonly with: LoadCost;
	/** The same page with the embed's hosts blocked: what a static component in its place would leave. */
	readonly without: LoadCost;
	/** What the embed alone costs: its frames' requests and its loaders. */
	readonly embed: { readonly bytes: number; readonly requests: number };
}

/** Runs in the page before it loads: records FCP and LCP. Must stay self-contained. */
function paintTimings(): void {
	const w = window as unknown as { __marklessMigratePaint: { fcp?: number; lcp?: number } };
	w.__marklessMigratePaint = {};
	new PerformanceObserver((list) => {
		for (const e of list.getEntries()) if (e.name === 'first-contentful-paint') w.__marklessMigratePaint.fcp = e.startTime;
	}).observe({ type: 'paint', buffered: true });
	new PerformanceObserver((list) => {
		const last = list.getEntries().at(-1);
		if (last) w.__marklessMigratePaint.lcp = last.startTime;
	}).observe({ type: 'largest-contentful-paint', buffered: true });
}

const hostsOf = (use: Pick<EmbedUse, 'attributes' | 'loaders' | 'url'>) => new Set([use.attributes.src, ...use.loaders].flatMap((u) => (u && URL.parse(u) ? [new URL(u).hostname] : [])));

async function measure(browser: Browser, url: string, block: ReadonlySet<string> | undefined, embedHosts: ReadonlySet<string>): Promise<{ load: LoadCost; embed: { bytes: number; requests: number } }> {
	const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
	const page: Page = await context.newPage();
	try {
		const cdp = await context.newCDPSession(page);
		await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
		await page.addInitScript(paintTimings);
		if (block?.size) await page.route('**/*', (route) => (block.has(new URL(route.request().url()).hostname) ? route.abort() : route.fallback()));
		const sizes: Promise<{ bytes: number; embed: boolean }>[] = [];
		page.on('requestfinished', (request) => {
			const host = URL.parse(request.url())?.hostname ?? '';
			const embed = request.frame() !== page.mainFrame() || embedHosts.has(host);
			sizes.push(request.sizes().then((s) => ({ bytes: s.responseBodySize + s.responseHeadersSize, embed }), () => ({ bytes: 0, embed })));
		});
		await page.goto(url, { waitUntil: 'load', timeout: 60_000 });
		await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
		await page.waitForTimeout(1500);
		const paint = await page.evaluate(() => (window as unknown as { __marklessMigratePaint: { fcp?: number; lcp?: number } }).__marklessMigratePaint);
		const all = await Promise.all(sizes);
		const mine = all.filter((s) => s.embed);
		return {
			load: { bytes: all.reduce((n, s) => n + s.bytes, 0), requests: all.length, ...(paint.fcp !== undefined ? { fcpMs: Math.round(paint.fcp) } : {}), ...(paint.lcp !== undefined ? { lcpMs: Math.round(paint.lcp) } : {}) },
			embed: { bytes: mine.reduce((n, s) => n + s.bytes, 0), requests: mine.length },
		};
	} finally {
		await context.close();
	}
}

/** What a kept embed costs on its first route, measured on a phone with the CPU slowed 4x: the page as it is, and with the embed's hosts blocked. */
export async function embedCost(browser: Browser, origin: string, use: EmbedUse): Promise<EmbedCost> {
	const route = use.routes[0]!;
	const url = new URL(route, origin).href;
	const hosts = hostsOf(use);
	const before = await measure(browser, url, undefined, hosts);
	const after = await measure(browser, url, hosts, hosts);
	return { route, with: before.load, without: after.load, embed: before.embed };
}
