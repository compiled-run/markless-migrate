// A control the site lists as a download (a code block's Download button): the file its use saved on the old page,
// with its name and type, so the port saves the same.
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

// registry/*/examples/code-block-example.tsx's download(): a Blob URL on an anchor with a download name, clicked.
const PAGE = `<!doctype html><html><body><div data-slot="code-block"><button aria-label="Download">D</button></div>
<script>
document.querySelector('button').addEventListener('click', () => {
	const url = URL.createObjectURL(new Blob(['import { streamText } from "ai"\\n'], { type: 'text/plain' }));
	const link = document.createElement('a');
	link.href = url;
	link.download = 'route.ts';
	link.click();
	URL.revokeObjectURL(url);
});
</script></body></html>`;

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

test('a listed "download" control records the file its use saved: its name, type and content', async () => {
	const dir = await mkdtemp(join(tmpdir(), 'reveal-download-'));
	try {
		const capture = await captureReveals(browser, origin, '/', dir, [VIEWPORTS[0]!], [['[data-slot="code-block"] button[aria-label="Download"]', 'download']], { controls: [], tag: 'listed-v2:' });
		const [reveal] = capture.reveals;
		assert.ok(reveal, JSON.stringify(capture));
		assert.deepEqual(reveal.added, [{ into: 'download', before: -1, html: JSON.stringify({ name: 'route.ts', type: 'text/plain', text: 'import { streamText } from "ai"\n' }) }]);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});
