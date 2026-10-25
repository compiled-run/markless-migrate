import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import { after, before, test } from 'node:test';
import { serve } from '../../fixtures/slow-network/server.ts';
import { networkRun } from '../../src/check/slow-network.ts';
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

test('a control that never answers is an error, not a time', async () => {
	const run = await networkRun(`${origin}/`, LINK, 'chromium', { timeoutMs: 6_000, control: '[role="tab"][aria-selected="true"]' });
	assert.match(run.error ?? '', /never answered a click within 6 s/);
	assert.equal(run.answered, undefined);
});
