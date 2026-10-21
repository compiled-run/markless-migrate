import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { chromium, type Browser } from 'playwright';
import { serve, type Variant } from '../../fixtures/page-load/server.ts';
import { renderHtml } from '../../src/check/html.ts';
import { runCheck } from '../../src/check/run.ts';
import { summarize } from '../../src/check/summary.ts';

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
		assert.equal(load.old.runs.length, 4);
		assert.equal(load.new.runs.length, 4);
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
		assert.match(summary, /page load \(Lighthouse, mobile, median of 4[^)]*\): .*LCP .* \(worse\)/);
		assert.match(renderHtml(report, () => 'x.png'), /Page load filmstrip/);
	});

	test('the same page on both sides is not red, in a full check', async () => {
		const report = await runCheck({ oldOrigin: await app('old'), newOrigin: await app('equal'), routes: ['/'], browser, viewports: DESKTOP, journeys: { budgetMs: 2000 }, load: { runs: 4 } });
		const route = report.routes[0]!;
		assert.equal(route.dimensions.load, 'pass', JSON.stringify(route.load?.verdicts));
		assert.equal(route.load?.new.detail?.filmstrip, undefined);
	});
});
