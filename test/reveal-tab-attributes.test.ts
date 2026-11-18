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

// shadcn's block viewer: the tabs add nothing, they switch the wrapper's data-view, which CSS reads to show the code.
const PAGE = `<!doctype html><html><body><div id="b" data-view="preview"><div role="tablist">
<button role="tab" aria-selected="true" aria-controls="radix-r-content-preview">Preview</button>
<button role="tab" aria-selected="false" aria-controls="radix-r-content-code">Code</button>
</div><div class="code">code</div></div>
<script>
for (const tab of document.querySelectorAll('[role=tab]')) tab.addEventListener('click', () => {
	for (const t of document.querySelectorAll('[role=tab]')) t.setAttribute('aria-selected', String(t === tab));
	document.getElementById('b').dataset.view = tab.getAttribute('aria-controls').split('-content-')[1];
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

test('a tab whose use adds nothing records the attributes it set outside its tab list', async () => {
	const dir = await mkdtemp(join(tmpdir(), 'reveal-tab-attributes-'));
	try {
		const capture = await captureReveals(browser, origin, '/', dir, [VIEWPORTS[0]!]);
		assert.deepEqual(
			capture.reveals.map((r) => ({ key: r.key, added: r.added, changed: r.changed })),
			[{ key: 'radix-r-content-code', added: [], changed: [{ path: [0], name: 'data-view', value: 'code' }] }],
		);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});
