import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { chromium, type Browser } from 'playwright';
import { dir, serve } from '../../fixtures/responsiveness/server.ts';
import { renderHtml } from '../../src/check/html.ts';
import { runCheck } from '../../src/check/run.ts';
import { summarize } from '../../src/check/summary.ts';
import type { Report } from '../../src/check/types.ts';

const DESKTOP = [{ name: 'desktop', width: 1280, height: 800, isMobile: false }];

describe('responsiveness: the first use of each control and each link, old vs new, at desktop speed and at 4x CPU', { concurrency: 2 }, () => {
	let browser: Browser;
	const servers: { close(): void }[] = [];
	const app = async (variant: Parameters<typeof serve>[0], delay = 0) => {
		const { origin, server } = await serve(variant, delay);
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
	const check = (oldOrigin: string, newOrigin: string, sourceDirs?: { old: string; new: string }): Promise<Report> => runCheck({ oldOrigin, newOrigin, routes: ['/'], browser, viewports: DESKTOP, responsiveness: {}, ...(sourceDirs ? { sourceDirs } : {}) });

	test('a click handler that imports a 500 KB module on first use, and a link that loads the next page in full from a slow server, fail', async () => {
		const report = await check(await app('old'), await app('slow', 300), { old: dir('old'), new: dir('slow') });
		const route = report.routes[0]!;
		assert.equal(route.dimensions.responsiveness, 'fail');
		const timing = route.responsiveness!;
		const add = timing.controls.find((c) => c.control === 'button "Add"')!;
		assert.equal(add.kind, 'in-page');
		const throttled = add.speeds.find((s) => s.speed === 'throttled')!;
		assert.equal(throttled.ok, false);
		assert.match(throttled.problems.join('\n'), /fetched code on the first interaction: \/big\.js \(\d+\.\d kB\)/);
		assert.match(throttled.cause ?? '', /code fetch: \/big\.js/);
		const failure = route.failures.find((f) => f.dimension === 'responsiveness' && f.check === 'first interaction with button "Add" (4x CPU, mobile)');
		assert.ok(failure, route.failures.map((f) => f.check).join('\n'));
		assert.match(failure.expected, /^old \d+ ms \(runs [\d ms,]+\)/);
		// Slower than the old as well as fetching code: confirmed by five runs a side taken in turn.
		assert.match(failure.actual, /^new \d+ ms \(runs \d+ ms(, \d+ ms){4}\); likely cause: code fetch: \/big\.js.*runs again in turn: old (\d+ ms, ){4}\d+ ms, new/);
		assert.match(failure.where ?? '', /^old index\.html:14 renders button "Add"; new index\.html:14 renders it$/);
		const next = timing.controls.find((c) => c.control === 'link "Next page"')!;
		assert.equal(next.kind, 'navigation');
		const nav = next.speeds.find((s) => s.speed === 'throttled')!;
		assert.equal(nav.ok, false);
		assert.equal(nav.new.length, 5, 'a slower control is confirmed by five runs a side');
		assert.ok(nav.new.every((s) => s.result === 'reloaded' && (s.server?.ttfb ?? 0) >= 290), JSON.stringify(nav.new));
		assert.ok(nav.spread, 'the variance between the runs is reported');
		assert.match(nav.cause ?? '', /a full page load where the old app navigates in the page/);
		assert.match(nav.cause ?? '', /server time \d+ ms to answer.*outside this timing/);
		assert.ok(next.speeds.find((s) => s.speed === 'desktop')!.ok, 'navigation is held to the old app at the throttled speed only');
		const text = summarize(report);
		assert.match(text, /First interaction: old \d+ ms → new \d+ ms \(4x CPU\)/);
		assert.match(text, /Navigation: old \d+ ms → new \d+ ms \(4x CPU\)/);
		assert.match(text, /slowest first interaction button "Add": old \d+ ms → new \d+ ms/);
		assert.ok(report.responsiveness?.navigation?.throttled?.new! > report.responsiveness!.navigation!.throttled!.old!);
		const html = renderHtml(report);
		assert.match(html, /<p class="headline"><strong>First interaction: old \d+ ms → new \d+ ms \(4x CPU\)/);
		assert.match(html, /<table class="timings">/);
	});

	test('the same app answering in 1 ms on one side and 300 ms on the other navigates alike: both get the same network, and server time is reported beside the timing', async () => {
		const report = await check(await app('slow'), await app('slow', 300), { old: dir('slow'), new: dir('slow') });
		const timing = report.routes[0]!.responsiveness!;
		assert.equal(timing.latencyMs, 40);
		const nav = timing.controls.find((c) => c.control === 'link "Next page"')!;
		for (const s of nav.speeds) assert.ok(s.ok, `${s.speed}: ${s.problems.join('; ')}`);
		const throttled = nav.speeds.find((s) => s.speed === 'throttled')!;
		assert.ok(throttled.new.every((s) => (s.server?.ttfb ?? 0) >= 290 && !s.cold), JSON.stringify(throttled.new));
		assert.ok(throttled.old.every((s) => (s.server?.ttfb ?? 999) < 290), JSON.stringify(throttled.old));
		assert.match(summarize(report), /Network while timing: every response reaches either page 40 ms after it is asked for/);
	});

	test('the same handlers on both sides pass, and the slowest control is measured twice so the report states the variance', async () => {
		const report = await check(await app('old'), await app('equal'));
		const route = report.routes[0]!;
		assert.equal(route.dimensions.responsiveness, 'pass', route.failures.filter((f) => f.dimension === 'responsiveness').map((f) => `${f.check}: ${f.actual}`).join('\n'));
		const timed = route.responsiveness!.controls;
		assert.deepEqual(timed.map((c) => `${c.control} ${c.kind}`).sort(), ['button "Add" in-page', 'button "Wide only" in-page', 'link "Next page" navigation']);
		const wide = timed.find((c) => c.control === 'button "Wide only"')!.speeds.find((s) => s.speed === 'throttled')!;
		assert.deepEqual([wide.ok, wide.new[0]?.failed], [true, 'button "Wide only" is not shown at 412x823'], 'a control the phone layout hides is reported, not timed');
		for (const c of timed) for (const s of c.speeds) assert.ok(s.new.every((x) => x.fetches.every((f) => f.kind !== 'code')));
		const twice = timed.flatMap((c) => c.speeds).filter((s) => s.spread);
		assert.ok(twice.length >= 1, 'the variance is measured');
		const add = timed.find((c) => c.kind === 'in-page')!.speeds.find((s) => s.speed === 'desktop')!;
		assert.ok(add.new.every((s) => s.result === 'changed' && s.warmMs !== undefined), JSON.stringify(add.new));
		assert.ok((add.newMs ?? 999) < 200);
	});
});
