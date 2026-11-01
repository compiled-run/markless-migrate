import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { browserInstalled, networkRun, throttledAddress } from '../src/check/slow-network.ts';
import type { NetworkProfile } from '../src/check/throttle.ts';

const LINK: NetworkProfile = { name: 'test', label: 'test link', downBytesPerSecond: 200_000, upBytesPerSecond: 200_000, rttMs: 100, source: 'test' };
const SCRIPT = `document.querySelector('button').addEventListener('click', (e) => e.currentTarget.setAttribute('aria-expanded', 'true'));/*${'x'.repeat(40_000)}*/`;
const DATA = JSON.stringify({ pad: 'y'.repeat(20_000) });
// Preload links, as a Qwik page loads its code: WebKit sends those past its proxy on a loopback origin, where it proxies the document.
const PAGE = `<!doctype html><html><head><title>t</title><link rel="modulepreload" href="/app.js"><link rel="preload" href="/data.json" as="fetch" crossorigin="anonymous"></head><body><button aria-expanded="false">More</button><script type="module" async>await fetch('/data.json', { mode: 'cors', credentials: 'omit' }).then((r) => r.json()); await import('/app.js');</script></body></html>`;

let server: Server;
let origin = '';
before(async () => {
	server = createServer((req, res) => {
		if (req.url === '/app.js') return res.writeHead(200, { 'content-type': 'text/javascript' }).end(SCRIPT);
		if (req.url === '/data.json') return res.writeHead(200, { 'content-type': 'application/json' }).end(DATA);
		return res.writeHead(200, { 'content-type': 'text/html' }).end(PAGE);
	});
	await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
	origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(() => server.close());

test('WebKit reaches a loopback page by a name the throttle maps back, since it sends loopback origins past its proxy', () => {
	const port = new URL(origin).port;
	const webkit = throttledAddress(`${origin}/docs/?q=1`, 'webkit');
	assert.equal(new URL(webkit.url).hostname.endsWith('.test'), true);
	assert.equal(new URL(webkit.url).pathname + new URL(webkit.url).search, '/docs/?q=1');
	assert.deepEqual(Object.values(webkit.hosts), [`127.0.0.1:${port}`]);
	assert.equal(webkit.original(`${webkit.url}#x`), `${origin}/docs/?q=1#x`);
	assert.equal(webkit.original('https://cdn.example/a.js'), 'https://cdn.example/a.js');
	assert.equal(throttledAddress('http://localhost:4000/', 'webkit').hosts[new URL(throttledAddress('http://localhost:4000/', 'webkit').url).hostname], 'localhost:4000');
	for (const browser of ['chromium', 'firefox'] as const) assert.deepEqual(throttledAddress(`${origin}/`, browser).hosts, {}, `${browser} is told to proxy loopback`);
	assert.deepEqual(throttledAddress('https://qwikui.com/', 'webkit').hosts, {});
});

test('a WebKit run on a loopback page sends every request through the throttle, and reports them by their own address', { skip: !browserInstalled('webkit') && 'webkit is not installed' }, async () => {
	const run = await networkRun(`${origin}/`, LINK, 'webkit', { firstFrame: false, afterAnswerMs: 500, timeoutMs: 30_000 });
	assert.equal(run.error, undefined);
	const urls = [...new Set(run.requests.map((r) => r.url))].sort();
	assert.deepEqual(urls, [`${origin}/`, `${origin}/app.js`, `${origin}/data.json`]);
	assert.ok(run.bytes > SCRIPT.length + DATA.length + PAGE.length, `the throttle carried ${run.bytes} bytes, fewer than the page, its script and its data`);
	// 60 kB at 200 kB/s is 300 ms on the link, plus round trips: unthrottled it answers in a few ms.
	assert.ok((run.answered ?? 0) > 400, `answered at ${run.answered} ms`);
});
