import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { chromium, type Browser } from 'playwright';
import { defaultEnv } from '../src/check/browser.ts';
import { measureOnce, speeds } from '../src/check/responsiveness.ts';

const pages: Record<string, string> = {
	// Like Docusaurus: an attribute on <html> changes at once, the next page's content paints 200 ms later.
	'/nav': `<!doctype html><html lang="en"><title>Docs</title>
<nav><a href="/nav/next" id="next">Next page</a></nav>
<main><h1>First page</h1><p>Intro text.</p></main>
<script>
	document.getElementById('next').addEventListener('click', (event) => {
		event.preventDefault();
		document.documentElement.setAttribute('data-navigating', 'true');
		document.body.classList.add('loading');
		document.title = 'Next';
		history.pushState(null, '', '/nav/next');
		setTimeout(() => {
			document.querySelector('main').innerHTML = '<h1>Next page</h1><p>Other text.</p>';
			document.documentElement.removeAttribute('data-navigating');
		}, 200);
	});
</script>`,
};

let browser: Browser;
let server: Server;
let origin: string;
before(async () => {
	browser = await chromium.launch();
	server = createServer((request, response) => {
		const path = new URL(request.url ?? '/', 'http://x').pathname;
		const body = pages[path === '/nav/next' ? '/nav' : path];
		if (!body) return void response.writeHead(404).end();
		response.writeHead(200, { 'content-type': 'text/html' }).end(body);
	});
	await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
	origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(async () => {
	server?.close();
	await browser?.close();
});

const desktop = speeds(4)[0]!;

test('a navigation ends when the next page content paints, not when <html>, <head> or <body> attributes change', async () => {
	const sample = await measureOnce(browser, defaultEnv(origin), '/nav', desktop, { action: 'click', target: { role: 'link', name: 'Next page', nth: 0 } });
	assert.equal(sample.result, 'navigated', JSON.stringify(sample));
	assert.ok((sample.ms ?? 0) >= 200, `navigation measured at ${sample.ms} ms, before its content painted at 200 ms`);
});
