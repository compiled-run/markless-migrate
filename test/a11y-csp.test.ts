import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import { chromium } from 'playwright';
import { captureA11y } from '../src/check/a11y.ts';

test('a page whose Content-Security-Policy forbids inline scripts is still audited (a redirect to GitHub sign-in crashed the check)', async () => {
	const server = createServer((_request, response) => {
		response.writeHead(200, { 'content-type': 'text/html', 'content-security-policy': "script-src 'none'" });
		response.end('<main><img src="x.png"><button>Go</button></main>');
	}).listen(0, '127.0.0.1');
	const browser = await chromium.launch();
	try {
		const page = await browser.newPage();
		await page.goto(`http://127.0.0.1:${(server.address() as AddressInfo).port}/`);
		const capture = await captureA11y(page);
		assert.ok('image-alt' in capture.violations);
		assert.deepEqual(capture.focusOrder, ['button "Go"']);
	} finally {
		await browser.close();
		server.close();
	}
});
