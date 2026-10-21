import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { chromium, type Browser } from 'playwright';
import { clockLine, isClock } from '../src/check/clock.ts';
import { runCheck } from '../src/check/run.ts';
import { VIEWPORTS } from '../src/check/types.ts';

const page = (reading: string, tagline = 'Starts soon') => `<!doctype html><html lang="en"><title>Live</title><style>@media (min-width: 640px) { h1 { color: #646cff } }</style><main><h1>Live</h1><p>${tagline}</p><h2>${reading}</h2></main>`;

let browser: Browser;
const servers: Server[] = [];
before(async () => {
	browser = await chromium.launch();
});
after(async () => {
	await browser?.close();
	for (const s of servers) s.close();
});
const serve = (body: string) =>
	new Promise<string>((done) => {
		const s = createServer((_, res) => res.writeHead(200, { 'content-type': 'text/html' }).end(body));
		servers.push(s);
		s.listen(0, '127.0.0.1', () => done(`http://127.0.0.1:${(s.address() as AddressInfo).port}`));
	});
const check = async (old: string, next: string) => (await runCheck({ oldOrigin: await serve(old), newOrigin: await serve(next), routes: ['/'], viewports: [VIEWPORTS[0]!], browser })).routes[0]!;

test('a clock reads as a clock: d:hh:mm:ss and hh:mm:ss are clocks, a count, a ratio in prose or a version is not', () => {
	assert.ok(isClock('63:02:59:59') && isClock(' 12:30:05 ') && isClock('04:59'));
	assert.ok(!isClock('42') && !isClock('3:2 ratio') && !isClock('v8.3.4'));
	assert.equal(clockLine('- heading "63:02:59:59" [level=2]'), '- heading "<clock>" [level=2]');
	assert.equal(clockLine('- heading "Live in 63:02:59:59" [level=2]'), undefined, 'only a line that is a clock');
});

test('a countdown at another second on each side is no rendered or visual difference; other text still is', async () => {
	const ticked = await check(page('63:02:59:59'), page('63:03:00:00'));
	assert.deepEqual(ticked.failures.filter((f) => ['rendered', 'visual'].includes(f.dimension)).map((f) => f.check), [], 'the screenshot at each forced viewport width included');
	const changed = await check(page('63:02:59:59'), page('63:02:59:59', 'Starts later'));
	assert.ok(changed.failures.some((f) => f.dimension === 'rendered' && f.check === 'visible text'), 'a changed tagline is red');
	assert.ok(changed.failures.some((f) => f.dimension === 'visual' && f.check.startsWith('screenshot in viewport width')), 'and red at a forced viewport width too');
	const gone = await check(page('63:02:59:59'), page(''));
	assert.ok(gone.failures.some((f) => f.dimension === 'rendered'), 'a clock the new page lost is red');
});
