import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { chromium, type Browser } from 'playwright';
import { captureReveals } from '../src/convert/reveal.ts';
import { VIEWPORTS } from '../src/check/types.ts';

const page = `<!doctype html><html><body><div id="page"><header><a href="/">Stars <span id="stars">0</span></a></header>
<div style="height: 3000px"></div>
<main><div data-slot="code"><div class="wrap"><button type="button" onclick="this.parentElement.innerHTML = '<pre>source</pre>'">View Code</button></div></div></main>
</div><script>
addEventListener('scroll', () => document.getElementById('stars').replaceChildren('1.2k'), { once: true });
</script></body></html>`;

let browser: Browser;
let server: Server;
let origin: string;
before(async () => {
	browser = await chromium.launch();
	server = createServer((_request, res) => res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(page));
	await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
	origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(async () => {
	await browser.close();
	server.close();
});

test('a control that takes itself away replaces only what its use changed, not what changed while the page scrolled to it', async () => {
	const dir = await mkdtemp(join(tmpdir(), 'reveal-replace-'));
	try {
		const capture = await captureReveals(browser, origin, '/', dir, [VIEWPORTS[0]!], [['[data-slot="code"] button', 'click']], { controls: [], tag: 'listed-v2:' });
		assert.deepEqual(
			capture.reveals.flatMap((r) => r.added),
			[{ into: 'replace', before: 1, html: '<pre>source</pre>' }],
		);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});
