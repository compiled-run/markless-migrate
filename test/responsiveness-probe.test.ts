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
	// Like Next: no main element, and a script with more text than the page beside the content.
	'/plain': `<!doctype html><html lang="en"><title>App</title>
<div id="app"><a href="/plain/next" id="next">Next page</a><p>First page</p></div>
<script>self.payload = ${JSON.stringify('x'.repeat(5000))};
	document.getElementById('next').addEventListener('click', (event) => {
		event.preventDefault();
		history.pushState(null, '', '/plain/next');
		setTimeout(() => (document.querySelector('#app p').textContent = 'Second page'), 200);
	});
</script>`,
	// A debounce that reads Date.now, as lodash's does: it fires 300 ms after the last keystroke.
	'/search': `<!doctype html><html lang="en"><title>Search</title>
<main><input aria-label="Search" id="q"><output id="out"></output></main>
<script>
	const q = document.getElementById('q');
	const out = document.getElementById('out');
	let last = 0;
	let timer;
	const expired = () => {
		const since = Date.now() - last;
		if (since >= 300) {
			timer = undefined;
			out.textContent = 'results for ' + q.value;
		} else timer = setTimeout(expired, 300 - since);
	};
	q.addEventListener('input', () => {
		const until = performance.now() + 15;
		while (performance.now() < until);
		last = Date.now();
		if (timer === undefined) timer = setTimeout(expired, 300);
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
		const body = pages[path.replace(/\/next$/, '')];
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

test('without a main element, the content is the rendered body child with the most text, never a script', async () => {
	const sample = await measureOnce(browser, defaultEnv(origin), '/plain', desktop, { action: 'click', target: { role: 'link', name: 'Next page', nth: 0 } });
	assert.equal(sample.result, 'navigated', JSON.stringify(sample));
	assert.ok((sample.ms ?? 0) >= 200, `navigation measured at ${sample.ms} ms; its content changed at 200 ms`);
});

test('while timing, the clock runs in real time, so a Date.now debounce waits from the last keystroke', async () => {
	const value = 'a long search query typed out';
	const sample = await measureOnce(browser, defaultEnv(origin), '/search', desktop, { action: 'fill', target: { role: 'textbox', name: 'Search', nth: 0 }, value });
	assert.equal(sample.result, 'changed', JSON.stringify(sample));
	const typing = value.length * 15;
	assert.ok((sample.ms ?? 0) >= typing + 300, `result at ${sample.ms} ms; typing takes at least ${typing} ms, then the 300 ms debounce`);
});
