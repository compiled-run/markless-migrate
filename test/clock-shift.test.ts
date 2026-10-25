import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { chromium, type Browser } from 'playwright';
import { defaultEnv } from '../src/check/browser.ts';
import { checkClock, clockDifferences } from '../src/check/clock-shift.ts';
import { VIEWPORTS } from '../src/check/types.ts';

const PAGES = {
	'/live': `<p>Published <time id="t"></time></p><script>t.textContent = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });</script>`,
	// What a converter that ran under check's frozen clock writes: the old page's text at that instant.
	'/baked': '<p>Published <time>January 15, 2026</time></p>',
	'/still': '<p>Opening hours: 9 to 5</p>',
} as const;

function serve(map: Record<string, string>): Promise<{ server: Server; origin: string }> {
	const server = createServer((req, res) => {
		const page = map[new URL(req.url ?? '/', 'http://x').pathname];
		if (page === undefined) return void res.writeHead(404).end();
		res.writeHead(200, { 'content-type': 'text/html' }).end(`<!doctype html><html lang="en"><title>Clock</title><main>${page}</main></html>`);
	});
	return new Promise((done) => server.listen(0, '127.0.0.1', () => done({ server, origin: `http://127.0.0.1:${(server.address() as AddressInfo).port}` })));
}

let browser: Browser;
let old: string;
let port: string;
const servers: Server[] = [];
before(async () => {
	browser = await chromium.launch();
	const a = await serve({ '/': PAGES['/live'], '/still': PAGES['/still'] });
	const b = await serve({ '/': PAGES['/baked'], '/still': PAGES['/still'] });
	servers.push(a.server, b.server);
	old = a.origin;
	port = b.origin;
});
after(async () => {
	await browser?.close();
	for (const s of servers) s.close();
});

test('a port that shows the date check froze the clock to is red, naming both dates', async () => {
	const [f, ...rest] = await checkClock(browser, { old: defaultEnv(old), new: defaultEnv(port) }, '/', VIEWPORTS[0]!);
	assert.deepEqual(rest, []);
	assert.equal(f!.dimension, 'rendered');
	assert.match(f!.check, /^text that follows the clock, with the clock at 2026-02-24 19:00 Pacific\/Auckland instead of 2026-01-15 12:00 UTC$/);
	assert.match(f!.expected, /old shows "February 25, 2026" \(at 2026-01-15 12:00 UTC it showed "January 15, 2026"\)/);
	assert.match(f!.actual, /still shows "January 15, 2026", what the old page shows at 2026-01-15 12:00 UTC, the instant check freezes the clock to; it does not show "February 25, 2026"/);
});

test('a port that follows the clock, and a page with no time in it, are green', async () => {
	assert.deepEqual(await checkClock(browser, { old: defaultEnv(old), new: defaultEnv(old) }, '/', VIEWPORTS[0]!), []);
	assert.deepEqual(await checkClock(browser, { old: defaultEnv(old), new: defaultEnv(port) }, '/still', VIEWPORTS[0]!), []);
});

test('only text the old page changes with the clock counts, and text that differs between loads at one instant is noise', () => {
	assert.deepEqual(clockDifferences(['Menu', 'Jan 15'], ['Menu', 'Jan 15'], ['Menu', 'Feb 25'], ['Menu', 'Jan 15']), { followed: ['Feb 25'], baked: ['Jan 15'] });
	assert.deepEqual(clockDifferences(['Menu', 'Jan 15'], ['Menu', 'Jan 15'], ['Menu', 'Feb 25'], ['Menu', 'Feb 25']), { followed: [], baked: [] });
	assert.deepEqual(clockDifferences(['Menu'], ['Menu'], ['Menu'], ['Other']), { followed: [], baked: [] });
	// A server's own time, or a tip it rotates: different on every load, so a new page showing one of its values is no frozen clock.
	assert.deepEqual(clockDifferences(['Rendered at 10:00:01'], ['Rendered at 10:00:03'], ['Rendered at 10:00:02'], ['Rendered at 10:00:01']), { followed: [], baked: [] });
});
