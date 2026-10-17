import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { chromium, type Browser, type Page } from 'playwright';
import { defaultEnv } from '../src/check/browser.ts';
import { openSession, quiet } from '../src/check/journeys.ts';
import { VIEWPORTS } from '../src/check/types.ts';

const LIST = '<script>addEventListener("load", () => fetch("/api/articles").then((r) => r.json()).then((items) => { for (const item of items) document.getElementById("list").append(Object.assign(document.createElement("li"), { textContent: item })); }));</script><ul id="list"></ul>';
// Each page sends the visitor on with a new document load after it has loaded and gone quiet, as a guard that checks who you are does; the landing page fetches its list once it has loaded.
const PAGES: Record<string, string> = {
	'/editor': '<!doctype html><title>Editor</title><meta http-equiv="refresh" content="1.5;url=/"><p>Checking who you are</p>',
	'/settings': '<!doctype html><title>Settings</title><p>Checking who you are</p><script>addEventListener("load", () => fetch("/api/me").then(() => setTimeout(() => location.assign("/"), 300)))</script>',
	'/': `<!doctype html><title>Home</title>${LIST}`,
};

let server: Server;
let origin: string;
let browser: Browser;
before(async () => {
	browser = await chromium.launch();
	server = createServer((req, res) => {
		if (req.url === '/api/me') return void res.writeHead(200, { 'content-type': 'application/json' }).end('{"user":null}');
		if (req.url === '/api/articles') return void setTimeout(() => res.writeHead(200, { 'content-type': 'application/json' }).end('["Article A","Article B"]'), 300);
		const page = PAGES[req.url ?? ''];
		res.writeHead(page ? 200 : 404, { 'content-type': 'text/html' }).end(page ?? 'not found');
	});
	await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
	origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(async () => {
	await browser?.close();
	server?.close();
});

for (const route of ['/editor', '/settings']) {
	test(`a journey on ${route} starts on the page its redirect loads, once that document has loaded and its requests have finished`, async () => {
		const session = await openSession(browser, defaultEnv(origin), route, VIEWPORTS[0]!);
		try {
			assert.equal(new URL(session.page.url()).pathname, '/');
			assert.deepEqual(await session.page.locator('#list li').allTextContents(), ['Article A', 'Article B']);
		} finally {
			await session.close();
		}
	});
}

test('time the checker itself was stalled does not count as quiet: a request that started meanwhile is waited for', async () => {
	let inflight = 0;
	let polls = 0;
	const page = { waitForLoadState: async () => {}, evaluate: async () => 0, url: () => 'http://x/' } as unknown as Page;
	const count = () => {
		if (++polls === 2) {
			// The event loop is held for 300 ms; the request that began in that time is only seen once it is free again.
			const until = Date.now() + 300;
			while (Date.now() < until);
			setImmediate(() => (inflight = 1));
			setTimeout(() => (inflight = 0), 400);
		}
		return inflight;
	};
	const started = Date.now();
	await quiet(page, count);
	assert.ok(Date.now() - started >= 700, `quiet returned after ${Date.now() - started} ms, while the request was still in flight`);
	assert.equal(inflight, 0);
});
