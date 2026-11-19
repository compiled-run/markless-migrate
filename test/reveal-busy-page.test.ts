// shadcn's React Aria data-table shipped row menus that opened only at mobile, a different row each run: on a busy runner the
// desktop click outlasted its 2 s while the page handled it, or a render replaced the row's button between finding and
// pressing it, and the mobile load recorded the control there.
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { chromium, type Browser } from 'playwright';

process.env.MARKLESS_MIGRATE_RETRY_BACKOFF_MS = '50';
const { captureReveals, incompleteCapture } = await import('../src/convert/reveal.ts');
const { VIEWPORTS } = await import('../src/check/types.ts');

// `menu` shows only below 768 px, so the mobile viewport is loaded too. BUSY: handling a press of `open` holds the main
// thread 2.5 s. REPLACED: `open` sits below the fold and is rendered again the first time it scrolls into view.
const page = (mode: 'busy' | 'replaced') => `<!doctype html><html><head><meta name="viewport" content="width=device-width"><style>
#menu { display: none } @media (max-width: 767px) { #menu { display: inline-block } }
${mode === 'replaced' ? '#open { margin-top: 3000px }' : ''}
</style></head><body>
<button id="menu" aria-expanded="false">Menu</button>
<div id="row"><button id="open" aria-haspopup="menu" aria-expanded="false">Open</button></div>
<script>
document.addEventListener('click', (event) => {
	const b = event.target.closest('button');
	if (!b) return;
	${mode === 'busy' ? "if (b.id === 'open') { const end = performance.now() + 2500; while (performance.now() < end); }" : ''}
	b.setAttribute('aria-expanded', 'true');
	document.body.append(Object.assign(document.createElement('div'), { role: 'menu', textContent: b.id + ' menu' }));
});
${
	mode === 'replaced'
		? `new IntersectionObserver((entries, observer) => {
	if (!entries.some((e) => e.isIntersecting)) return;
	observer.disconnect();
	const old = document.getElementById('open');
	old.replaceWith(old.cloneNode(true));
}).observe(document.getElementById('open'));`
		: ''
}
</script></body></html>`;

let browser: Browser;
let server: Server;
let origin: string;
let mode: 'busy' | 'replaced' = 'busy';
before(async () => {
	browser = await chromium.launch();
	server = createServer((request, res) => {
		if (request.url !== '/') return void res.writeHead(404).end();
		res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(page(mode));
	});
	await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
	origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(async () => {
	await browser.close();
	server.close();
});

const at = (reveals: readonly { key: string; viewport: string }[]) => Object.fromEntries(reveals.map((r) => [r.key, r.viewport]));

test('a press the page takes longer than 2 s to handle is still recorded at that viewport', async () => {
	const dir = await mkdtemp(join(tmpdir(), 'reveal-busy-'));
	mode = 'busy';
	try {
		const capture = await captureReveals(browser, origin, '/', dir, VIEWPORTS);
		assert.deepEqual(at(capture.reveals), { open: 'desktop', menu: 'mobile' });
		assert.equal(incompleteCapture(capture), undefined);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});

test('a control a render replaced between finding and pressing it is pressed as the page now holds it', async () => {
	const dir = await mkdtemp(join(tmpdir(), 'reveal-busy-'));
	mode = 'replaced';
	try {
		const capture = await captureReveals(browser, origin, '/', dir, VIEWPORTS);
		assert.deepEqual(at(capture.reveals), { open: 'desktop', menu: 'mobile' });
		assert.equal(incompleteCapture(capture), undefined);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});
