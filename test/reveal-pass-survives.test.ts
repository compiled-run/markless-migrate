// A reload that lays the page out differently, or that fails, must not cost a route every other control's capture:
// shadcn's /examples/dashboard lost its header search dialog that way, and shipped a search button that opens nothing.
import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { chromium, type Browser } from 'playwright';

process.env.MARKLESS_MIGRATE_RETRY_BACKOFF_MS = '50';
const { captureReveals } = await import('../src/convert/reveal.ts');

// Each control adds a panel Escape does not take away, so the page is loaded again after each one. A later load can
// lay the page out differently (`banner`: a notice the server adds), which moves every control.
const page = (banner: boolean) => `<!doctype html><html><body>${banner ? '<div><p>Notice</p></div>' : ''}
<button id="search" aria-expanded="false">Search</button>
<button id="more" aria-expanded="false">More</button>
<script>
for (const id of ['search', 'more']) document.getElementById(id).addEventListener('click', (event) => {
	event.currentTarget.setAttribute('aria-expanded', 'true');
	const panel = Object.assign(document.createElement('div'), { role: 'dialog' });
	panel.textContent = id + ' panel';
	document.body.append(panel);
});
</script></body></html>`;

let browser: Browser;
let server: Server;
let origin: string;
let loads = 0;
let failing = new Set<number>();
let banner = false;
before(async () => {
	browser = await chromium.launch();
	server = createServer((request, res) => {
		if (request.url !== '/') return void res.writeHead(404).end();
		if (failing.has(++loads)) return void res.socket?.destroy();
		res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(page(banner && loads > 1));
	});
	await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
	origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(async () => {
	await browser.close();
	server.close();
});

const shown = (reveals: readonly { key: string; added: readonly { html: string }[] }[]) => Object.fromEntries(reveals.map((r) => [r.key, r.added.map((a) => a.html).join('')]));

test('a reload that moves the controls still uses each one, found again by its key', async () => {
	const dir = await mkdtemp(join(tmpdir(), 'reveal-survives-'));
	loads = 0;
	failing = new Set();
	banner = true;
	try {
		const capture = await captureReveals(browser, origin, '/', dir, [{ name: 'desktop', width: 1280, height: 800, isMobile: false }]);
		assert.deepEqual(shown(capture.reveals), { search: '<div role="dialog">search panel</div>', more: '<div role="dialog">more panel</div>' });
	} finally {
		banner = false;
		await rm(dir, { recursive: true, force: true });
	}
});

test('a reload that fails after a control was used keeps that control and goes on with the rest', async () => {
	const dir = await mkdtemp(join(tmpdir(), 'reveal-survives-'));
	loads = 0;
	// The first load serves; the reload after the search control fails twice (loadPage's own retry included).
	failing = new Set([2, 3]);
	try {
		const capture = await captureReveals(browser, origin, '/', dir, [{ name: 'desktop', width: 1280, height: 800, isMobile: false }]);
		assert.equal(shown(capture.reveals).search, '<div role="dialog">search panel</div>');
		assert.equal(shown(capture.reveals).more, '<div role="dialog">more panel</div>');
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});

test('a route whose page cannot be loaded again fails its pass instead of caching what it had', async () => {
	const dir = await mkdtemp(join(tmpdir(), 'reveal-survives-'));
	loads = 0;
	failing = new Set(Array.from({ length: 50 }, (_, i) => i + 2));
	try {
		await assert.rejects(captureReveals(browser, origin, '/', dir, [{ name: 'desktop', width: 1280, height: 800, isMobile: false }]));
		assert.deepEqual(await readdir(dir).catch(() => []), []);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});
