import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { chromium, type Browser } from 'playwright';
import { serve, type Variant } from '../../fixtures/page-load/server.ts';
import { renderHtml } from '../../src/check/html.ts';
import { runCheck } from '../../src/check/run.ts';
import { summarize } from '../../src/check/summary.ts';
import { serve as serveFont } from '../../fixtures/late-font/server.ts';
import { describePreload, findLateFont, measurePreload } from '../../src/upgrade/fonts.ts';

const DESKTOP = [{ name: 'desktop', width: 1280, height: 800, isMobile: false }];

describe('page load: Lighthouse mobile metrics, old vs new, a median of several runs each', () => {
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
	const loadOnly = (oldOrigin: string, newOrigin: string) => runCheck({ oldOrigin, newOrigin, routes: ['/'], browser, viewports: DESKTOP, only: 'load', load: { runs: 4 } });

	test('a page behind a render-blocking script, fetching animation data before its heading paints, is red on paint times, naming what it waited for', async () => {
		const report = await loadOnly(await app('old'), await app('slow'));
		const route = report.routes[0]!;
		assert.equal(route.only, 'load');
		assert.equal(route.dimensions.load, 'fail');
		assert.equal(route.dimensions.rendered, 'skipped', 'with --only load every other dimension is skipped, not passed');
		assert.ok(route.failures.every((f) => f.dimension === 'load'));
		const load = route.load!;
		// --load-runs 4, and as many again when a metric is worse than its floor but not yet beyond the noise between runs.
		assert.ok([4, 8].includes(load.old.runs.length), String(load.old.runs.length));
		assert.equal(load.new.runs.length, load.old.runs.length);
		const lcp = route.failures.find((f) => f.check === 'page load: Largest Contentful Paint (Lighthouse, mobile)');
		assert.ok(lcp, route.failures.map((f) => f.check).join('\n'));
		assert.ok(route.failures.some((f) => f.check === 'page load: First Contentful Paint (Lighthouse, mobile)'));
		assert.match(lcp.actual, /LCP element body > main > p "A fast page about a fast tool/);
		assert.match(lcp.actual, /began before it and count toward it, largest: \/blocking\.js /);
		assert.match(lcp.actual, /\/animation\.bin /);
		assert.match(lcp.actual, /render-blocking: \/blocking\.js/);
		assert.match(lcp.expected, /old: LCP element body > main > p /);
		assert.ok(load.new.detail?.filmstrip?.length, 'a red route keeps the filmstrip of its median run');
		const summary = summarize(report);
		assert.match(summary, /FAIL +\/ +\[load\] +only page load compared \(--only load\)/);
		assert.match(summary, new RegExp(`page load, PageSpeed-equivalent \\(lab; Lighthouse mobile, median of ${load.old.runs.length}[^)]*\\): .*LCP .* \\(worse\\)`));
		assert.match(renderHtml(report, () => 'x.png'), /Page load filmstrip/);
	});

	test('the same page on both sides is not red, in a full check', async () => {
		const report = await runCheck({ oldOrigin: await app('old'), newOrigin: await app('equal'), routes: ['/'], browser, viewports: DESKTOP, journeys: { maxJourneys: 5 }, load: { runs: 4 } });
		const route = report.routes[0]!;
		assert.equal(route.dimensions.load, 'pass', JSON.stringify(route.load?.verdicts));
		assert.equal(route.load?.new.detail?.filmstrip, undefined);
	});

	// Simulated, this preload paints the heading sooner; applied for real it does not, since the font's bytes delay the stylesheet the
	// first paint waits for. The suggestion follows the real load, with PageSpeed Insights' simulated score beside it.
	test('a preload of the late font of the largest text is judged on the real load, with the simulated score reported beside it', async () => {
		const { origin, server } = await serveFont('late');
		servers.push(server);
		const found = await findLateFont(browser, origin, '/');
		assert.ok('late' in found, JSON.stringify(found));
		const m = await measurePreload(origin, found.late, { runs: 4 });
		assert.ok(m.simulated && m.simulated.lcpSavingMs > 100, JSON.stringify(m.simulated));
		assert.equal(m.significant, false, JSON.stringify(m.load.verdicts));
		assert.match(describePreload(m), /as PageSpeed Insights simulates it, LCP [\d.]+ (ms|s) sooner with the preload/);
	});
});

test("the served HTML is asked for again when the browser evicted it from its cache, and a different answer is refused", async () => {
	const { createServer } = await import('node:http');
	const { servedHtml } = await import('../../src/check/infrastructure.ts');
	let hits = 0;
	const server = createServer((req, res) => req.url !== '/' ? res.writeHead(404).end() : res.writeHead(++hits > 2 ? 503 : 200, { 'content-type': 'text/html' }).end('<!doctype html><script src="/_next/static/a.js"></script>'));
	await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
	const browser = await chromium.launch();
	try {
		const page = await browser.newPage();
		const response = (await page.goto(`http://127.0.0.1:${(server.address() as { port: number }).port}/`))!;
		const evicted = Object.assign(Object.create(response), { text: () => Promise.reject(new Error('Request content was evicted from inspector cache')) });
		assert.match(await servedHtml(page, evicted), /_next\/static/);
		await assert.rejects(servedHtml(page, evicted), /asked again the server answered 503/);
	} finally {
		await browser.close();
		server.close();
	}
});
