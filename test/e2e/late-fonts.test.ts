import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import { LATE_FONT, LATE_FONTS_SCRIPT, lateFontsConfig } from '../../parts/late-fonts.ts';
import { browserInstalled, NETWORK_BROWSERS, networkRun } from '../../src/check/slow-network.ts';
import type { NetworkProfile } from '../../src/check/throttle.ts';

const LINK: NetworkProfile = { name: 'test', label: 'test link', downBytesPerSecond: 64_000, upBytesPerSecond: 64_000, rttMs: 100, source: 'test' };

// A tab whose handler arrives in a 48 kB module, a first screen in a Latin face, and far below it a right-to-left demo
// whose Arabic face (32 kB) the page's stylesheet does not declare: the converted page names it in its late-font list.
async function serve(near = false): Promise<{ origin: string; server: Server }> {
	const late = lateFontsConfig([{ family: 'Arabic', src: 'url(/arabic.woff2) format("woff2")', descriptors: { unicodeRange: 'U+0600-06FF', display: 'swap' } }]);
	const page = `<!doctype html><html><head><title>Tabs</title><script>${LATE_FONTS_SCRIPT}</script><script type="application/json" ${late.attribute}>${late.text}</script>
<style>@font-face{font-family:Latin;src:url(/latin.woff2) format("woff2");font-display:swap}body{font-family:Latin,sans-serif;margin:0}button{all:unset}.rtl{font-family:Arabic,sans-serif}</style>
<link rel="modulepreload" href="/app.js"><script type="module" src="/app.js"></script></head>
<body><main><h1>Tabs</h1><div role="tablist"><button role="tab" aria-selected="true">One</button><button role="tab" aria-selected="false">Two</button></div>
<div style="height:${near ? 200 : 4000}px"></div><section ${LATE_FONT} class="rtl" dir="rtl"><p>زر حذف</p></section></main></body></html>`;
	const app = `function neverCalled() { return ${JSON.stringify('x'.repeat(48_000))}; }
for (const tab of document.querySelectorAll('[role=tab]')) tab.addEventListener('click', () => { for (const t of document.querySelectorAll('[role=tab]')) t.setAttribute('aria-selected', String(t === tab)); });`;
	const server = createServer((req, res) => {
		if (req.url === '/latin.woff2') res.writeHead(200, { 'content-type': 'font/woff2' }).end(Buffer.alloc(2_000, 1));
		else if (req.url === '/arabic.woff2') res.writeHead(200, { 'content-type': 'font/woff2' }).end(Buffer.alloc(32_000, 2));
		else if (req.url === '/app.js') res.writeHead(200, { 'content-type': 'text/javascript' }).end(app);
		else if (req.url === '/') res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(page);
		else res.writeHead(404).end();
	});
	await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
	return { origin: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, server };
}

for (const name of NETWORK_BROWSERS) {
	test(`${name}: a web font only text far below the first screen draws is fetched once the page's scripts have come over the link, not with them`, { skip: browserInstalled(name) || process.env.CI ? false : `${name} is not installed` }, async () => {
		const { origin, server } = await serve();
		try {
			// WebKit sends loopback origins past any proxy; a name the proxy maps to the server reaches it in every browser.
			const run = await networkRun('http://late.test/', LINK, name, { timeoutMs: 30_000, hosts: { 'late.test': new URL(origin).host } });
			assert.equal(run.error, undefined);
			const app = run.requests.find((r) => r.url.endsWith('/app.js'))!;
			const arabic = run.requests.find((r) => r.url.endsWith('/arabic.woff2'));
			assert.ok(arabic, `the late font is still fetched: ${run.requests.map((r) => r.url).join(' ')}`);
			// The proxy marks the script's end once its last byte is written; the browser may ask for the font in the same millisecond.
			assert.ok(arabic.start >= app.end - 20, `the Arabic font started at ${arabic.start} ms, before the script finished at ${app.end} ms`);
		} finally {
			server.close();
		}
	});

	test(`${name}: the late font is fetched before the scripts arrive when its text is near the screen`, { skip: browserInstalled(name) || process.env.CI ? false : `${name} is not installed` }, async () => {
		const { origin, server } = await serve(true);
		try {
			const run = await networkRun('http://late.test/', LINK, name, { timeoutMs: 30_000, hosts: { 'late.test': new URL(origin).host } });
			assert.equal(run.error, undefined);
			const app = run.requests.find((r) => r.url.endsWith('/app.js'))!;
			const arabic = run.requests.find((r) => r.url.endsWith('/arabic.woff2'));
			assert.ok(arabic && arabic.start < app.end, `the Arabic font started at ${arabic?.start} ms, the script finished at ${app.end} ms`);
		} finally {
			server.close();
		}
	});
}
