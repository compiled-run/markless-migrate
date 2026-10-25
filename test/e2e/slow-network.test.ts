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
	test(`${name}: the first painted frame is the fallback text, before a swapped-in web font arrives`, { skip: browserInstalled(name) ? false : `${name} is not installed` }, async () => {
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

test('in Chromium the first painted frame is where FCP says the page painted', async () => {
	const run = await networkRun(`${origin}/`, LINK, 'chromium', { timeoutMs: 30_000 });
	assert.ok(Math.abs(run.firstFrame! - run.fcp!) < 400, `first painted frame at ${run.firstFrame} ms, FCP at ${run.fcp} ms`);
});

test('a control that never answers is an error, not a time', async () => {
	const run = await networkRun(`${origin}/`, LINK, 'chromium', { timeoutMs: 6_000, control: '[role="tab"][aria-selected="true"]' });
	assert.match(run.error ?? '', /never answered a click within 6 s/);
	assert.equal(run.answered, undefined);
});

test('check --only load with --slow-network puts both sides cold loads in the summary and the report beside the lab, not as a verdict', async () => {
	const { runCheck } = await import('../../src/check/run.ts');
	const { summarize } = await import('../../src/check/summary.ts');
	const { renderHtml } = await import('../../src/check/html.ts');
	const heavier = await serve(120_000);
	try {
		const report = await runCheck({ oldOrigin: origin, newOrigin: heavier.origin, routes: ['/'], viewports: [{ name: 'desktop', width: 1280, height: 800, isMobile: false }], only: 'load', load: { runs: 4, psi: false, network: { profiles: ['regular-3g'], runs: 1 } } });
		const network = report.routes[0]!.load!.network!;
		assert.ok(!('unavailable' in network));
		const [old, next] = [network.old.cells[0]!, network.new.cells[0]!];
		assert.equal(old.profile, 'regular-3g');
		assert.ok(next.median.answered! > old.median.answered!, `new answered at ${next.median.answered} ms, old at ${old.median.answered} ms: 72 kB more script on 96 kB/s`);
		assert.ok(report.routes[0]!.failures.every((f) => !/slow network/i.test(f.check)), 'shown, not a verdict');
		assert.match(summarize(report), /slow network, chromium Regular 3G \(768 kbit\/s, 100 ms RTT\) \(median of 1 cold loads\): First click answered [\d.]+ s -> [\d.]+ s, Painted to first click answered/);
		const html = renderHtml(report, () => 'x.png');
		assert.match(html, /<h4>Slow network <small>/);
		assert.match(html, /<td>First click answered<\/td><td>[\d.]+ s<\/td><td>[\d.]+ s<\/td>/);
	} finally {
		heavier.server.close();
	}
});
