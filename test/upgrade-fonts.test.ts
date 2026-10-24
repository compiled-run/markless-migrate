import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { chromium, type Browser } from 'playwright';
import { serve, type Variant } from '../fixtures/late-font/server.ts';
import { routeLoad, type LoadRun, type Metrics } from '../src/check/load.ts';
import { fcpCost, findLateFont, preloadTag, proxy, withPreload } from '../src/upgrade/fonts.ts';
import { acceptUpgrade, summarizeUpgrade, upgrade, writeUpgrade } from '../src/upgrade/index.ts';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let browser: Browser;
const servers: { close(): void }[] = [];
const app = async (variant: Variant) => {
	const { origin, server } = await serve(variant);
	servers.push(server);
	return origin;
};
before(async () => {
	browser = await chromium.launch();
});
after(async () => {
	for (const s of servers) s.close();
	await browser?.close();
});

test('LCP text whose web font the page finds only in its stylesheet is found late, with the font, its display and when it was asked for', async () => {
	const found = await findLateFont(browser, await app('late'), '/');
	assert.ok('late' in found, JSON.stringify(found));
	const f = found.late;
	assert.equal(f.href, '/heading.woff2');
	assert.equal(f.family, 'heading');
	assert.equal(f.type, 'font/woff2');
	assert.equal(f.display, 'auto');
	assert.equal(f.stylesheet, '/site.css');
	assert.match(f.element, /^h1 "The Build Tool for the Web"$/);
	assert.ok(f.requestedAt >= f.stylesheetAt, JSON.stringify(f));
	assert.equal(preloadTag(f), '<link rel="preload" href="/heading.woff2" as="font" type="font/woff2" crossorigin>');
});

test('a font the page already preloads, and an image LCP, are not suggested', async () => {
	const preloaded = await findLateFont(browser, await app('preloaded'), '/');
	assert.ok('none' in preloaded && /already preloads/.test(preloaded.none), JSON.stringify(preloaded));
	const image = await findLateFont(browser, await app('image'), '/');
	assert.ok('none' in image && /is an image/.test(image.none), JSON.stringify(image));
});

test('the preload goes right after the charset, and the proxy serves the page with it and everything else as it was', async () => {
	assert.equal(withPreload('<html><head><meta charset="utf-8"><title>x</title></head></html>', '<link x>'), '<html><head><meta charset="utf-8"><link x><title>x</title></head></html>');
	assert.equal(withPreload('<html><head><title>x</title></head></html>', '<link x>'), '<html><head><link x><title>x</title></head></html>');
	const origin = await app('late');
	const tag = preloadTag({ href: '/heading.woff2', type: 'font/woff2' });
	const [plain, injected] = await Promise.all([proxy(origin, '/'), proxy(origin, '/', tag)]);
	try {
		const html = await (await fetch(`${injected.origin}/`)).text();
		assert.ok(html.includes(`<meta charset="utf-8">${tag}`), html.slice(0, 300));
		assert.ok(!(await (await fetch(`${plain.origin}/`)).text()).includes('rel="preload"'));
		assert.equal((await (await fetch(`${injected.origin}/heading.woff2`)).arrayBuffer()).byteLength, 67792);
		const css = await fetch(`${injected.origin}/site.css`, { headers: { 'accept-encoding': 'gzip' } });
		assert.match(await css.text(), /^@font-face/);
		const found = await findLateFont(browser, injected.origin, '/');
		assert.ok('none' in found && /already preloads/.test(found.none), 'through the proxy, the injected preload is the page\'s own');
	} finally {
		await Promise.all([plain.close(), injected.close()]);
	}
});

const metrics = (lcp: number): Metrics => ({ score: 90, fcp: 1500, lcp, si: 1600, tbt: 0, cls: 0 });
const runs = (lcps: number[]): LoadRun[] => lcps.map((lcp) => ({ metrics: metrics(lcp) }));

test('upgrade suggests the preload with its measured LCP saving, ranks it, and accepting it writes the task', async () => {
	const origin = await app('late');
	const dir = await mkdtemp(join(tmpdir(), 'mm-upgrade-font-'));
	const report = await upgrade({
		origin,
		routes: ['/'],
		newSource: dir,
		buildDir: dir,
		newLibraries: { version: 1, source: dir, libraries: [] } as never,
		browser,
		measurePreload: async (_, font) => ({ font, load: routeLoad(5, runs([2200, 2210, 2190, 2205, 2200]), runs([4200, 4210, 4190, 4205, 4200])), lcpSavingMs: 2000, significant: true }),
	});
	const s = report.suggestions.find((x) => x.kind === 'preload LCP font')!;
	assert.equal(s.id, 'preload-font:/heading.woff2');
	assert.equal(s.verdict, 'suggested');
	assert.equal(s.rank, 1);
	assert.equal(s.saving.lcpMs, 2000);
	const text = summarizeUpgrade(report);
	assert.match(text, /#1 \[suggested\] preload-font:\/heading\.woff2: preload heading \(\/heading\.woff2\), the font of the largest text on \//);
	assert.match(text, /measured: Lighthouse mobile, median of 5 runs each: LCP 4\.20 s now, 2\.20 s with the preload \(2\.00 s sooner/);
	assert.match(text, /add: <link rel="preload" href="\/heading\.woff2" as="font" type="font\/woff2" crossorigin>/);
	await writeUpgrade(report, dir);
	const task = await readFile(await acceptUpgrade(dir, s.id, 'http://before.test'), 'utf8');
	assert.match(task, /Add this to the <head> of the document that renders that page/);
	assert.match(task, /<link rel="preload" href="\/heading\.woff2" as="font" type="font\/woff2" crossorigin>/);
	assert.match(task, /Keep `crossorigin`/);
	assert.match(task, /check --old http:\/\/before\.test --new <this app, upgraded> --all/);
});

test('a preload that does not paint the text sooner beyond noise is kept as it is, with why', async () => {
	const dir = await mkdtemp(join(tmpdir(), 'mm-upgrade-font-'));
	const report = await upgrade({
		origin: await app('late'),
		routes: ['/'],
		newSource: dir,
		buildDir: dir,
		newLibraries: { version: 1, source: dir, libraries: [] } as never,
		browser,
		measurePreload: async (_, font) => ({ font, load: routeLoad(5, runs([4200, 4210, 4190, 4205, 4200]), runs([4200, 4210, 4190, 4205, 4200])), lcpSavingMs: 0, significant: false }),
	});
	const s = report.suggestions.find((x) => x.kind === 'preload LCP font')!;
	assert.equal(s.verdict, 'keep');
	assert.ok(report.limits.some((l) => /a preload did not paint h1 "The Build Tool for the Web" sooner beyond noise/.test(l)));
});

test('a preload that paints the largest text sooner but holds back the first paint beyond noise is not suggested', async () => {
	const dir = await mkdtemp(join(tmpdir(), 'mm-upgrade-font-'));
	const fcp = (lcp: number, f: number): LoadRun => ({ metrics: { ...metrics(lcp), fcp: f } });
	const load = routeLoad(5, [2200, 2210, 2190, 2205, 2200].map((l) => fcp(l, 1600)), [4200, 4210, 4190, 4205, 4200].map((l) => fcp(l, 1150)));
	assert.deepEqual(fcpCost(load), { ms: 450, p: 1 / 252 });
	const report = await upgrade({
		origin: await app('late'),
		routes: ['/'],
		newSource: dir,
		buildDir: dir,
		newLibraries: { version: 1, source: dir, libraries: [] } as never,
		browser,
		measurePreload: async (_, font) => ({ font, load, lcpSavingMs: 2000, significant: true, fcpWorse: fcpCost(load)! }),
	});
	assert.equal(report.suggestions.find((x) => x.kind === 'preload LCP font')!.verdict, 'keep');
	assert.ok(report.limits.some((l) => /not suggested: the preload delays the first paint .*the preload makes FCP 450 ms later beyond noise/.test(l)), report.limits.join('\n'));
});
