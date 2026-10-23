import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import { chromium } from 'playwright';
import { holdNavigations } from '../src/embed/check.ts';

// A page that keeps requests in flight while a slow context route (the checker's own) answers each one.
test('holding and releasing navigations over and over while requests are in flight answers every request once', async () => {
	const server = createServer((req, res) => {
		if (req.url === '/') {
			res.setHeader('content-type', 'text/html');
			res.end('<script>setInterval(() => { for (let i = 0; i < 20; i++) fetch("/x?" + Math.random()); }, 5)</script>');
		} else if (req.url === '/next') {
			res.setHeader('content-type', 'text/html');
			res.end('<p>next</p>');
		} else setTimeout(() => res.end('ok'), 5);
	});
	await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
	const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
	const unhandled: unknown[] = [];
	const onUnhandled = (error: unknown) => unhandled.push(error);
	process.on('unhandledRejection', onUnhandled);
	const browser = await chromium.launch();
	try {
		const context = await browser.newContext();
		await context.route('**/*', async (route) => {
			await new Promise((resolve) => setTimeout(resolve, 2));
			return route.continue();
		});
		const page = await context.newPage();
		await page.goto(origin);
		for (let i = 0; i < 30; i++) {
			const release = await holdNavigations(page, () => {});
			await page.waitForTimeout(20);
			release();
		}
		const seen: string[] = [];
		let reported!: () => void;
		const reachedHold = new Promise<void>((resolve) => (reported = resolve));
		const release = await holdNavigations(page, (url) => {
			seen.push(url);
			reported();
		});
		await page.evaluate((url) => void (location.href = url), `${origin}/next`).catch(() => {});
		// Under the page's request load the navigation reaches the route late; wait for it (or for it to have gone through), not for a fixed time.
		await Promise.race([reachedHold, page.waitForURL(`${origin}/next`, { timeout: 15_000 }).catch(() => {})]);
		release();
		assert.deepEqual(seen, [`${origin}/next`], 'a navigation while held is aborted and reported');
		assert.equal(new URL(page.url()).pathname, '/', 'the held navigation did not happen');
		await page.waitForTimeout(100);
		assert.equal(unhandled.length, 0, `no request is answered twice: ${unhandled.map(String).slice(0, 2).join('; ')}`);
	} finally {
		process.off('unhandledRejection', onUnhandled);
		await browser.close();
		server.closeAllConnections();
		server.close();
	}
});
