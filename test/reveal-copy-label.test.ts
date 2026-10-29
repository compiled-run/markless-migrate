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

// examples/*/message-pattern.tsx: the reply's Copy action reads "Copied" once it has copied; the user's keeps "Copy".
const PAGE = `<!doctype html><html><body><div data-slot="preview">
<button data-slot="tooltip-trigger" aria-label="Copy" onclick="navigator.clipboard.writeText('question')">c</button>
<button data-slot="tooltip-trigger" aria-label="Copy" onclick="navigator.clipboard.writeText('reply'); this.setAttribute('aria-label', 'Copied')">c</button>
</div></body></html>`;

let browser: Browser;
let server: Server;
let origin: string;
before(async () => {
	browser = await chromium.launch();
	server = createServer((_, res) => res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(PAGE));
	await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
	origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(async () => {
	await browser.close();
	server.close();
});

test('a copy control records the label it took once it had copied, where it changed', async () => {
	const dir = await mkdtemp(join(tmpdir(), 'reveal-copy-label-'));
	try {
		const capture = await captureReveals(browser, origin, '/', dir, [VIEWPORTS[0]!], [['[data-slot="preview"] button[aria-label="Copy"]', 'copy']], { controls: [], tag: 'listed-v2:' });
		assert.deepEqual(capture.reveals.map((r) => r.added), [[{ into: 'clipboard', before: -1, html: 'question' }], [{ into: 'clipboard', before: -1, html: 'reply', label: 'Copied' }]]);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});
