import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { chromium, type Browser } from 'playwright';

process.env.MARKLESS_MIGRATE_LOAD_TIMEOUT_MS = '1500';
process.env.MARKLESS_MIGRATE_RETRY_BACKOFF_MS = '100';
const { captureRoute } = await import('../src/check/capture.ts');
const { VIEWPORTS } = await import('../src/check/types.ts');

let browser: Browser;
let server: Server;
let stylesheets = 0;
before(async () => {
	browser = await chromium.launch();
	server = createServer((req, res) => {
		if (req.url === '/site.css') {
			// The first load's stylesheet stops part way, so that load times out and is retried; the retry's arrives whole.
			if (stylesheets++ === 0) return void res.writeHead(200, { 'content-type': 'text/css', 'content-length': '2000000' }).write(Buffer.alloc(300_000, 32));
			return void res.writeHead(200, { 'content-type': 'text/css' }).end('main { color: rgb(1, 2, 3); }');
		}
		res.writeHead(200, { 'content-type': 'text/html' }).end('<!doctype html><html lang="en"><title>Home</title><link rel="stylesheet" href="/site.css"><main><h1>Home</h1></main>');
	});
	await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
});
after(async () => {
	await browser.close();
	server.closeAllConnections();
	server.close();
});

test('a page whose first load timed out mid-stylesheet and loaded on the retry is captured, not left waiting on the dropped stylesheet', async () => {
	const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
	const captured = await Promise.race([captureRoute(browser, origin, '/', [VIEWPORTS[0]!]), new Promise<'stuck'>((done) => setTimeout(() => done('stuck'), 20_000).unref())]);
	assert.notEqual(captured, 'stuck', 'the capture waited on the stylesheet its first load dropped');
	assert.match(JSON.stringify(captured), /Home/);
});
