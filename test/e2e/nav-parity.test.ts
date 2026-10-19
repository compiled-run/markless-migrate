import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { chromium, type Browser } from 'playwright';
import { serve, type Variant } from '../../fixtures/nav-parity/server.ts';
import { defaultEnv } from '../../src/check/browser.ts';
import { checkNavigation, type NavigationResult } from '../../src/check/nav-parity.ts';
import { runCheck } from '../../src/check/run.ts';

const ROUTES = ['/', '/docs/', '/lib/'];
const DESKTOP = [{ name: 'desktop', width: 1280, height: 800, isMobile: false }];

describe('navigation: a page reached in place matches a fresh load of it', { concurrency: 3 }, () => {
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
	const check = async (variant: Variant): Promise<NavigationResult> => checkNavigation(browser, defaultEnv(await app(variant)), ROUTES, { concurrency: 3 });
	const lines = (r: NavigationResult) => r.failures.map((f) => `${f.route} ${f.check}: ${f.expected} / ${f.actual}`).join('\n');

	test('a router that swaps pages as a fresh load shows them is green, plain, after the theme toggle, back and forward', async () => {
		const result = await check('fresh');
		assert.deepEqual(result.failures, [], lines(result));
		assert.ok(result.pairs.length >= 4, JSON.stringify(result.pairs));
		assert.ok(result.pairs.every((p) => p.inPlace && !p.error), JSON.stringify(result.pairs));
		assert.ok(result.pairs.some((p) => p.variant === 'toggled' && p.control === 'button "Toggle dark theme"'), JSON.stringify(result.pairs));
	});

	test('the homepage\'s data-theme kept on the next page is red, naming the attribute, with the fix hint', async () => {
		const result = await check('stale-html');
		const html = result.failures.find((f) => f.route === '/docs/' && f.check === 'in place from /: <html> attributes');
		assert.ok(html, lines(result));
		assert.match(html.actual, /data-theme=dark/);
		assert.match(html.hint, /only/);
		assert.ok(result.failures.some((f) => f.route === '/docs/' && /^in place from \/: computed styles of .*\bbody\b/.test(f.check)), lines(result));
		assert.ok(result.failures.some((f) => f.route === '/docs/' && f.check === 'in place from /: screenshot'), lines(result));
		assert.ok(result.shots.some((s) => s.route === '/docs/' && s.shot.label === 'navigation: in place from /'), JSON.stringify(result.shots.map((s) => s.shot.label)));
		assert.ok(!result.failures.some((f) => f.route === '/lib/' && /script files/.test(f.check)), lines(result));
		// Turning the theme back to light on the page reached in place leaves it dark: the kept data-theme still forces it.
		assert.ok(result.failures.some((f) => f.route === '/docs/' && f.check === 'in place from /, then clicking button "Toggle dark theme" again: screenshot'), lines(result));
	});

	test('a swapped-in page whose library never ran is red: the file, the global, the console error and the click', async () => {
		const result = await check('scripts');
		const at = (check: string) => result.failures.find((f) => f.route === '/lib/' && f.check.endsWith(check));
		assert.equal(at(': script files run')?.expected, '/lib.js', lines(result));
		assert.match(at(': globals the page\'s scripts define')?.expected ?? '', /\blib\b/, lines(result));
		assert.match(at(': console errors')?.actual ?? '', /lib is not defined/, lines(result));
		assert.ok(result.failures.some((f) => f.route === '/lib/' && /then clicking button "Greet again": DOM$/.test(f.check)), lines(result));
		assert.ok(!result.failures.some((f) => /<html> attributes/.test(f.check)), lines(result));
	});

	test('check reports it as the navigation dimension of the destination route, with the old app reached the same way, and leaves it out unasked', async () => {
		const base = { oldOrigin: await app('fresh'), newOrigin: await app('stale-html'), routes: ROUTES, browser, viewports: DESKTOP, journeys: { budgetMs: 1, maxJourneys: 0 } };
		const report = await runCheck({ ...base, navigation: {} });
		const docs = report.routes.find((r) => r.route === '/docs/')!;
		assert.equal(docs.dimensions.navigation, 'fail');
		assert.ok(docs.failures.some((f) => f.dimension === 'navigation' && f.check === 'in place from /: <html> attributes'));
		const against = docs.failures.find((f) => f.check === 'in place from /: <html> class and data-* attributes, against the old app reached the same way');
		assert.match(against?.actual ?? '', /data-theme=dark/, docs.failures.map((f) => f.check).join('\n'));
		assert.ok(docs.shots.some((s) => s.label === 'navigation: in place from /'));
		assert.ok(report.navigation && report.navigation.pairs > 0 && report.navigation.loads > 0);
		const without = await runCheck(base);
		assert.ok(without.routes.every((r) => r.dimensions.navigation === 'skipped'));
		assert.equal(without.navigation, undefined);
	});

	test('a difference the old app shows too when reached the same way is its own: not reported', async () => {
		const stale = await app('stale-html');
		const result = await checkNavigation(browser, defaultEnv(await app('stale-html')), ROUTES, { concurrency: 3, old: defaultEnv(stale) });
		assert.deepEqual(result.failures.filter((f) => f.dimension === 'navigation'), [], lines(result));
		assert.ok(result.pairs.some((p) => (p.sameOnOld ?? 0) > 0), JSON.stringify(result.pairs));
	});
});
