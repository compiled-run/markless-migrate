// What convert measures of a hover card's delays on the old page, for each library's way of saying it opened.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { chromium, type Browser } from 'playwright';
import { captureHoverDelays } from '../src/convert/toggles.ts';

let browser: Browser;
before(async () => {
	browser = await chromium.launch();
});
after(() => browser.close());

// React Aria's PreviewTrigger: its trigger carries aria-expanded, not data-state; the card opens 100 ms after the pointer arrives and closes 300 ms after it leaves.
const page = `<!doctype html><body style="margin:0;padding:40px"><button id="t" data-rac="" aria-haspopup="dialog" aria-expanded="false" style="touch-callout:none">Hover Here</button>
<script>
const t = document.getElementById('t');
let timer;
t.addEventListener('pointerenter', () => { clearTimeout(timer); timer = setTimeout(() => t.setAttribute('aria-expanded', 'true'), 100); });
t.addEventListener('pointerleave', () => { clearTimeout(timer); timer = setTimeout(() => t.setAttribute('aria-expanded', 'false'), 300); });
</script></body>`;

test('a React Aria preview trigger\'s delays are measured from its aria-expanded', async () => {
	const server = createServer((_, res) => res.writeHead(200, { 'content-type': 'text/html' }).end(page));
	await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
	const { port } = server.address() as { port: number };
	try {
		const dir = await mkdtemp(join(tmpdir(), 'hover-delays-'));
		const { delays } = await captureHoverDelays(browser, `http://127.0.0.1:${port}`, '/', dir, [{ sig: 'button||Hover Here', nth: 0 }]);
		assert.equal(delays.length, 1);
		assert.equal(delays[0]!.sig, 'button||Hover Here');
		assert.ok(delays[0]!.open >= 100 && delays[0]!.open < 200, `open ${delays[0]!.open}`);
		assert.ok(delays[0]!.close >= 300 && delays[0]!.close < 400, `close ${delays[0]!.close}`);
	} finally {
		server.close();
	}
});
