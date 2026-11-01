// A page that loads slowly alone gets three times its slowest load on later loads: on a slow runner the check's other pages of
// it, loading beside it, otherwise push it past the default and the route is not checked.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import { chromium } from 'playwright';

process.env.MARKLESS_MIGRATE_LOAD_TIMEOUT_MS = '700';
process.env.MARKLESS_MIGRATE_RETRY_BACKOFF_MS = '10';
const { learnedTimeout, loadPage } = await import('../src/check/infrastructure.ts');

test('a later load of a URL waits three times its slowest load so far, never less than the default', async () => {
	let delay = 500;
	const server = createServer((_, res) => setTimeout(() => res.writeHead(200, { 'content-type': 'text/html' }).end('<!doctype html><h1>Slow</h1>'), delay));
	await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
	const browser = await chromium.launch();
	try {
		const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/charts`;
		assert.equal(learnedTimeout(url), 700);
		const page = await browser.newPage();
		await loadPage(page, url);
		assert.ok(learnedTimeout(`${url}?again`) >= 1500, String(learnedTimeout(url)));
		delay = 1100;
		await loadPage(page, url);
		assert.equal(learnedTimeout(`${url.replace('/charts', '/other')}`), 700, 'another URL keeps the default');
	} finally {
		await browser.close();
		server.close();
	}
});
