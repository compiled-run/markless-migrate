import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import { after, before, test } from 'node:test';
import { serve } from '../../fixtures/slow-network/server.ts';
import { browserInstalled, NETWORK_BROWSERS, networkRun } from '../../src/check/slow-network.ts';
import type { NetworkProfile } from '../../src/check/throttle.ts';

const LINK: NetworkProfile = { name: 'test', label: 'test link', downBytesPerSecond: 64_000, upBytesPerSecond: 64_000, rttMs: 200, source: 'test' };
let server: Server;
let origin = '';
before(async () => ({ origin, server } = await serve()));
after(() => server.close());

test('a tab clicked from the moment it paints answers only once its handler has come over the slow link, and the run says what crossed it', async () => {
	const run = await networkRun(`${origin}/`, LINK, 'chromium', { timeoutMs: 30_000 });
	assert.equal(run.error, undefined);
	const script = run.requests.find((r) => r.url.endsWith('/app.js'));
	assert.ok(script, run.requests.map((r) => r.url).join(', '));
	assert.ok(run.ttfb! >= 600, `a loopback origin goes through the link too: TTFB ${run.ttfb} ms`);
	assert.ok(run.fcp! < run.answered!, `painted at ${run.fcp} ms, answered at ${run.answered} ms`);
	assert.ok(run.answered! >= script.end, `answered at ${run.answered} ms, before its handler arrived at ${script.end} ms`);
	assert.ok(script.end - script.start >= 700, `48 kB at 64 kB/s took ${script.end - script.start} ms`);
	assert.ok(run.clicks >= 2, `clicked ${run.clicks} times: the first clicks came before the handler`);
	assert.ok(run.bytes >= 48_000 && run.bytesByAnswer! >= 48_000, `${run.bytes} bytes`);
	assert.ok(run.jsDownloaded >= 48_000, `${run.jsDownloaded} bytes of JS`);
	assert.ok(run.jsExecutedByAnswer! > 100 && run.jsExecutedByAnswer! < 5_000, `executed ${run.jsExecutedByAnswer} bytes: the padding never ran`);
});

for (const name of NETWORK_BROWSERS) {
	test(`${name}: the first painted frame is the fallback text, before a swapped-in web font arrives`, { skip: browserInstalled(name) || process.env.CI ? false : `${name} is not installed` }, async () => {
		const late = await serve(48_000, 96_000);
		try {
			// WebKit sends loopback origins past any proxy; a name the proxy maps to the server reaches it in every browser.
			const run = await networkRun('http://late.test/', LINK, name, { timeoutMs: 30_000, hosts: { 'late.test': new URL(late.origin).host } });
			assert.equal(run.error, undefined);
			const font = run.requests.find((r) => r.url.endsWith('/late.woff2'))!;
			assert.ok(run.firstFrame! > run.ttfb!, `painted at ${run.firstFrame} ms, before the page's first byte at ${run.ttfb} ms`);
			assert.ok(run.firstFrame! < font.end - 800, `first painted frame at ${run.firstFrame} ms, the font arrived at ${font.end} ms`);
		} finally {
			late.server.close();
		}
	});
}

test('in Chromium the first painted frame is where FCP says the page painted, also when a stylesheet holds the paint back', async () => {
	const blocked = await serve(48_000, 0, true, 64_000);
	try {
		const run = await networkRun(`${blocked.origin}/`, LINK, 'chromium', { timeoutMs: 30_000 });
		const sheet = run.requests.find((r) => r.url.endsWith('/blocking.css'))!;
		assert.ok(run.fcp! >= sheet.end, `FCP at ${run.fcp} ms, the stylesheet arrived at ${sheet.end} ms`);
		assert.ok(Math.abs(run.firstFrame! - run.fcp!) < 400, `first painted frame at ${run.firstFrame} ms, FCP at ${run.fcp} ms`);
	} finally {
		blocked.server.close();
	}
});

test('a control that never answers is an error, not a time', async () => {
	const run = await networkRun(`${origin}/`, LINK, 'chromium', { timeoutMs: 6_000, control: '[role="tab"][aria-selected="true"]' });
	assert.match(run.error ?? '', /never answered a click within 6 s/);
	assert.equal(run.answered, undefined);
});

test('a run told to stop waiting for the answer records when it stopped, not an error, and does not wait out its timeout', async () => {
	const started = Date.now();
	const run = await networkRun(`${origin}/`, LINK, 'chromium', { timeoutMs: 30_000, answerBy: 1_500, control: '[role="tab"][aria-selected="true"]' });
	assert.equal(run.error, undefined);
	assert.equal(run.answered, undefined);
	assert.ok(run.answeredAfter !== undefined && run.answeredAfter >= 1_500, `stopped after ${run.answeredAfter} ms`);
	assert.ok(run.firstFrame !== undefined, 'the first frame is still read');
	assert.ok(Date.now() - started < 20_000, `took ${Date.now() - started} ms`);
});

const DESKTOP = [{ name: 'desktop', width: 1280, height: 800, isMobile: false }];

test('check is red on the slow network when the new page answers later beyond the old page\'s own noise, naming the cell and what came first', async () => {
	const { runCheck } = await import('../../src/check/run.ts');
	const { summarize } = await import('../../src/check/summary.ts');
	const { renderHtml } = await import('../../src/check/html.ts');
	const heavier = await serve(120_000);
	try {
		const report = await runCheck({ oldOrigin: origin, newOrigin: heavier.origin, routes: ['/'], viewports: DESKTOP, only: 'load', load: { runs: 4, psi: false, network: { profiles: ['regular-3g'], browsers: ['chromium'], runs: 4, concurrency: 2 } } });
		const route = report.routes[0]!;
		const f = route.failures.find((x) => x.check === 'page load: slow network, chromium Regular 3G (768 kbit/s, 100 ms RTT): First click answered');
		assert.ok(f, route.failures.map((x) => x.check).join('\n'));
		assert.equal(route.dimensions.load, 'fail');
		assert.match(f.actual, /worse, beyond the [\d.]+ s the old page's own runs differ by or the measurement can tell apart \(p = 0\.0\d+\); before the answer the new page finished \d+ kB \([\d.]+ s of the link\): script \/app\.js 12\d\.\d kB/);
		assert.match(summarize(report), /slow network: 1 of 1 browser and network cells measured, [\d.]+ min/);
		assert.match(summarize(report), /First click answered [\d.]+ s -> [\d.]+ s \(slower\)/);
		assert.match(renderHtml(report, () => 'x.png'), /<strong>slower<\/strong> by [\d.]+ s \(old against old: ±/);
	} finally {
		heavier.server.close();
	}
});

test('the same page against itself is not red on the slow network, and a page with nothing to click is timed to its paint', async () => {
	const { runCheck } = await import('../../src/check/run.ts');
	const { summarize } = await import('../../src/check/summary.ts');
	const [a, b] = await Promise.all([serve(48_000, 0, false), serve(48_000, 0, false)]);
	try {
		const report = await runCheck({ oldOrigin: a.origin, newOrigin: b.origin, routes: ['/'], viewports: DESKTOP, only: 'load', load: { runs: 4, psi: false, network: { profiles: ['regular-3g'], browsers: ['chromium'], runs: 4, concurrency: 2 } } });
		const network = report.routes[0]!.load!.network!;
		assert.ok(!('unavailable' in network));
		assert.ok(network.new.cells[0]!.runs.every((r) => r.noControl && !r.error && r.firstFrame !== undefined), JSON.stringify(network.new.cells[0]!.runs.map((r) => r.error)));
		assert.deepEqual(report.routes[0]!.failures.filter((f) => /slow network/.test(f.check)), []);
		assert.match(summarize(report), /nothing to click on either page/);
	} finally {
		a.server.close();
		b.server.close();
	}
});


test('a resource only Firefox requests turns the route red in the Firefox cell alone, and the same page without it is green in every browser', async () => {
	const { measureRoutesNetwork } = await import('../../src/check/slow-network.ts');
	const { networkFailures } = await import('../../src/check/slow-network-verdicts.ts');
	const [old, slower, same] = await Promise.all([serve(), serve(48_000, 0, true, 0, 120_000), serve()]);
	try {
		// WebKit sends loopback origins past any proxy; names the proxy maps reach the servers in every browser.
		const hosts = { 'old.test': new URL(old.origin).host, 'slower.test': new URL(slower.origin).host, 'same.test': new URL(same.origin).host };
		const options = { profiles: ['regular-3g'], browsers: [...NETWORK_BROWSERS], runs: 4, concurrency: 2, hosts, afterAnswerMs: 2_000, timeoutMs: 60_000 };
		const red = (await measureRoutesNetwork({ old: 'http://old.test', new: 'http://slower.test' }, ['/'], options)).get('/')!;
		const failing = networkFailures('/', red).map((f) => f.check);
		assert.ok(failing.length && failing.every((c) => c.startsWith('page load: slow network, firefox ')), networkFailures('/', red).map((f) => `${f.check}: ${f.expected} / ${f.actual}`).join('\n'));
		assert.ok(red.new.cells.every((c) => !c.unavailable), 'every browser measured');
		const green = (await measureRoutesNetwork({ old: 'http://old.test', new: 'http://same.test' }, ['/'], options)).get('/')!;
		assert.deepEqual(networkFailures('/', green).map((f) => f.check), []);
	} finally {
		for (const s of [old, slower, same]) s.server.close();
	}
});
