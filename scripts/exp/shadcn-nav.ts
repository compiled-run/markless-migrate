// Scratch (owner-approved measurement, 2026-10-31): in-place navigation click to paint, original against port.
// node scripts/exp/shadcn-nav.ts <out.json> <runs> <old origin> <new origin> <browsers,> <profiles,>
import { writeFileSync } from 'node:fs';
import { chromium, firefox, webkit, type Browser, type Page } from 'playwright';
import { startThrottle, type NetworkProfile } from '../../src/check/throttle.ts';

const [, , out, runsArg, oldOrigin, newOrigin, browsersArg, profilesArg] = process.argv as string[];
const KBIT = 1000 / 8;
const profiles: Record<string, NetworkProfile | undefined> = {
	unthrottled: undefined,
	'fast-4g': { name: 'fast-4g', label: 'Fast 4G (9 Mbit/s, 60 ms RTT)', downBytesPerSecond: 9000 * KBIT, upBytesPerSecond: 1500 * KBIT, rttMs: 60, source: 'Chrome DevTools Fast 4G' },
};
// The links each step clicks, all present on the page it starts from on both sites.
const STEPS: readonly { readonly name: string; readonly to?: string; readonly back?: true }[] = [
	{ name: 'home → docs', to: '/docs/installation' },
	{ name: 'docs → component', to: '/docs/components/base/button' },
	{ name: 'component → blocks', to: '/blocks' },
	{ name: 'blocks → charts', to: '/charts/area' },
	{ name: 'charts → components index', to: '/docs/components' },
	{ name: 'Back', back: true },
	{ name: '→ /create', to: '/create' },
	{ name: '→ /docs/directory', to: '/docs/directory' },
];
const launch = async (name: string, profile: NetworkProfile | undefined): Promise<{ browser: Browser; close: () => Promise<void> }> => {
	const throttle = profile ? await startThrottle(profile) : undefined;
	const proxy = throttle ? { proxy: { server: (throttle as unknown as { proxy: string }).proxy, bypass: '' } } : {};
	const browser =
		name === 'chromium'
			? await chromium.launch({ ...proxy, args: ['--disable-quic'] })
			: name === 'firefox'
				? await firefox.launch({ ...proxy, firefoxUserPrefs: { 'network.http.http3.enable': false } })
				: await webkit.launch(proxy);
	return { browser, close: async () => { await browser.close(); await (throttle as unknown as { close?: () => Promise<void> } | undefined)?.close?.(); } };
};
const settle = (page: Page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
type Req = { url: string; start: number; ttfb?: number; end?: number; worker?: boolean; type: string };
async function step(page: Page, origin: string, s: (typeof STEPS)[number], log: Req[]) {
	const before = await page.evaluate(() => ({ title: document.title, path: location.pathname }));
	const t0 = await page.evaluate(() => performance.now());
	const e0 = Date.now();
	const mark = log.length;
	if (s.back) await page.goBack({ waitUntil: 'commit' });
	else {
		const link = page.locator(`a[href="${s.to}"]`).filter({ visible: true }).first();
		if (!(await link.count())) return { error: `no visible link to ${s.to} on ${before.path}` };
		await link.click({ noWaitAfter: true });
	}
	await page.waitForFunction((b) => location.pathname !== b.path && document.title !== b.title, before, { timeout: 30_000 }).catch(() => undefined);
	await settle(page);
	const t1 = await page.evaluate(() => performance.now());
	const e1 = Date.now();
	const navigated = await page.evaluate(() => location.pathname);
	const fullLoad = await page.evaluate((t) => performance.getEntriesByType('navigation').some((e) => e.startTime > t - 1), t0).catch(() => false);
	const during = log.slice(mark).filter((r) => r.start >= e0 - 5 && r.start <= e1).map((r) => ({ ...r, start: r.start - e0, end: r.end === undefined ? undefined : r.end - e0, url: r.url.replace(origin, '') }));
	return { ms: Math.round(t1 - t0), to: navigated, fullLoad, requests: during };
}
const rows: Record<string, unknown>[] = [];
for (const profileName of profilesArg!.split(','))
	for (const browserName of browsersArg!.split(','))
		for (let run = 0; run < Number(runsArg); run++)
			for (const [side, origin] of [['old', oldOrigin], ['new', newOrigin]] as const) {
				const { browser, close } = await launch(browserName, profiles[profileName]);
				const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
				const log: Req[] = [];
				const at = new Map<string, Req>();
				page.on('request', (r) => { if (!r.url().startsWith(origin!)) return; const q: Req = { url: r.url(), start: Date.now(), type: r.resourceType() }; at.set(r.url() + r.method(), q); log.push(q); });
				page.on('requestfinished', (r) => { const q = at.get(r.url() + r.method()); if (q) q.end = Date.now(); });
				page.on('response', (res) => { const q = at.get(res.url() + res.request().method()); if (!q) return; q.worker = !res.headers()['cf-cache-status']; const t = res.request().timing(); q.ttfb = t.responseStart > 0 ? Math.round(t.responseStart) : undefined; });
				try {
					await page.goto(`${origin}/`, { waitUntil: 'load', timeout: 120_000 });
					for (const pass of ['cold', 'warm']) {
						if (pass === 'warm') await page.goto(`${origin}/`, { waitUntil: 'load', timeout: 120_000 });
						await page.waitForTimeout(3000);
						for (const s of STEPS) {
							const r = await step(page, origin!, s, log);
							const row = { profile: profileName, browser: browserName, side, run, pass, step: s.name, ...r };
							rows.push(row);
							console.log(JSON.stringify({ ...row, requests: (r as { requests?: unknown[] }).requests?.length }));
							await page.waitForTimeout(1500);
						}
					}
				} catch (error) {
					rows.push({ profile: profileName, browser: browserName, side, run, error: String(error).slice(0, 300) });
				}
				await close();
				writeFileSync(out!, JSON.stringify(rows, null, 1));
			}
