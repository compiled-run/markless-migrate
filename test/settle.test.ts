import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { chromium, type Browser, type Page } from 'playwright';
import { markUse, settle, trackRequests, trackTimers } from '../src/check/settle.ts';

const PAGES: Record<string, string> = {
	debounced: `<button onclick="setTimeout(() => out.textContent = 'searched', 300)">Search</button><p id="out">idle</p>`,
	transition: `<style>#panel { opacity: 0; transition: opacity 400ms linear } #panel.open { opacity: 1 }</style><button onclick="panel.classList.add('open')">Open</button><div id="panel" ontransitionend="out.textContent = 'shown'">Panel</div><p id="out">idle</p>`,
	fetches: `<button onclick="fetch('/slow').then((r) => r.text()).then((t) => out.textContent = t)">Load</button><p id="out">idle</p>`,
	ambient: `<style>@keyframes spin { to { rotate: 360deg } } i { display: inline-block; animation: spin 1s linear infinite }</style><i>*</i><button>Nothing</button><p id="out">idle</p>`,
	leaves: `<a href="/ambient">Away</a><p id="out">idle</p>`,
};

let browser: Browser;
let origin = '';
let server: Server;
before(async () => {
	browser = await chromium.launch();
	server = createServer((req, res) => {
		const path = new URL(req.url ?? '/', 'http://x').pathname.slice(1);
		if (path === 'slow') return void setTimeout(() => res.writeHead(200, { 'content-type': 'text/plain' }).end('loaded'), 300);
		res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(`<!doctype html><html><body>${PAGES[path] ?? ''}</body></html>`);
	});
	await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
	origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(async () => {
	await browser?.close();
	server?.closeAllConnections();
	server?.close();
});

async function used(name: string, control: string, cap = 1500): Promise<{ page: Page; ms: number; text: string }> {
	const context = await browser.newContext();
	await context.addInitScript(trackTimers);
	const page = await context.newPage();
	const net = trackRequests(page);
	await page.goto(`${origin}/${name}`);
	await net.quiet(100, 5000);
	await markUse(page);
	await page.getByText(control).click();
	const t0 = Date.now();
	await settle(page, net, cap);
	const ms = Date.now() - t0;
	const text = await page.locator('#out').textContent().catch(() => '');
	await context.close();
	return { page, ms, text: text ?? '' };
}

test('a use is settled once the timer it set has run, not before', async () => {
	const { ms, text } = await used('debounced', 'Search');
	assert.equal(text, 'searched');
	assert.ok(ms >= 280 && ms < 1000, `settled in ${ms} ms`);
});

test('a use is settled once the transition it started has ended and what that changed holds still', async () => {
	const { ms, text } = await used('transition', 'Open');
	assert.equal(text, 'shown');
	assert.ok(ms >= 380 && ms < 1200, `settled in ${ms} ms`);
});

test('a use is settled once the request it sent has answered and the page drew the answer', async () => {
	const { ms, text } = await used('fetches', 'Load');
	assert.equal(text, 'loaded');
	assert.ok(ms >= 280 && ms < 1200, `settled in ${ms} ms`);
});

test('an animation the page ran before the use (an endless spinner) does not hold the settle, and a use that changes nothing settles in a few frames', async () => {
	const { ms } = await used('ambient', 'Nothing');
	assert.ok(ms < 400, `settled in ${ms} ms`);
});

test('a use that leaves the page waits out the cap instead of failing', async () => {
	const { ms } = await used('leaves', 'Away', 600);
	assert.ok(ms < 1500, `settled in ${ms} ms`);
});
