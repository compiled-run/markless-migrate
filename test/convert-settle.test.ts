// convert's wait for what a gesture started: it ends once the page has nothing left to run within the pause it replaces,
// and never later than that pause.
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { chromium, type Browser, type Page } from 'playwright';
import { settle, STILL_MS, trackSettling } from '../src/convert/settle.ts';

const PAGES: Record<string, string> = {
	'/still': '',
	// A delayed change: a hover card's open delay.
	'/timer': `setTimeout(() => document.body.append('late'), 200);`,
	// A frame chain that writes for 12 frames, as a script-driven entrance does.
	'/frames': `let n = 0; const step = () => { document.body.style.opacity = String(n / 12); if (++n <= 12) requestAnimationFrame(step); }; requestAnimationFrame(step);`,
	// A loop that never ends and changes nothing: a ticker's own clock.
	'/loop': `const tick = () => requestAnimationFrame(tick); tick();`,
	// A fetch answered after 250 ms, then shown.
	'/fetch': `fetch('/slow').then((r) => r.text()).then((t) => document.body.append(t));`,
	// A timer due after the pause: a tooltip group's skip-delay window.
	'/later': `setTimeout(() => document.body.append('later'), 5000);`,
};

let browser: Browser;
let server: Server;
let origin: string;
before(async () => {
	browser = await chromium.launch();
	server = createServer((request, res) => {
		if (request.url === '/slow') return void setTimeout(() => res.writeHead(200).end('fetched'), 250);
		res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(`<!doctype html><html><body><button>go</button><script>document.querySelector('button').onclick = () => { ${PAGES[request.url!] ?? ''} };</script></body></html>`);
	});
	await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
	origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(async () => {
	await browser.close();
	server.close();
});

async function timed(path: string, cap: number, tracked = true): Promise<{ ms: number; page: Page; close: () => Promise<void> }> {
	const context = await browser.newContext();
	if (tracked) await trackSettling(context);
	const page = await context.newPage();
	await page.goto(origin + path);
	await settle(page, 1000);
	await page.click('button');
	const start = Date.now();
	await settle(page, cap);
	return { ms: Date.now() - start, page, close: () => context.close() };
}

test('a page with nothing left to run settles after it has been still a while, well before the pause', async () => {
	const { ms, close } = await timed('/still', 1500);
	await close();
	assert.ok(ms >= STILL_MS && ms < 600, `${ms} ms`);
});

test('a timer due within the pause, a frame chain and a request are waited for, and what they did is in the page', async () => {
	for (const [path, text] of [['/timer', 'late'], ['/fetch', 'fetched']] as const) {
		const { ms, page, close } = await timed(path, 1500);
		const body = await page.evaluate(() => document.body.textContent);
		await close();
		assert.ok(body?.includes(text), `${path}: ${body}`);
		assert.ok(ms < 1200, `${path}: ${ms} ms`);
	}
	const { page, close } = await timed('/frames', 1500);
	const opacity = await page.evaluate(() => document.body.style.opacity);
	await close();
	assert.equal(opacity, '1');
});

test('a loop that changes nothing does not hold the wait up', async () => {
	const { ms, close } = await timed('/loop', 1500);
	await close();
	assert.ok(ms < 800, `${ms} ms`);
});

test('a timer due after the pause keeps the whole pause, as what comes next may depend on how long this step took', async () => {
	const { ms, close } = await timed('/later', 700);
	await close();
	assert.ok(ms >= 690, `${ms} ms`);
});

test('a page opened without the tracker waits the whole pause', async () => {
	const { ms, close } = await timed('/still', 700, false);
	await close();
	assert.ok(ms >= 690, `${ms} ms`);
});
