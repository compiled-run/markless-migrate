// A control the capture cannot find on the page loaded again was skipped in silence: shadcn's Base UI menubar shipped
// 2 of its 16 menus that way. Such a capture is incomplete: it names the controls, is never stored, and fails convert.
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { chromium, type Browser } from 'playwright';

process.env.MARKLESS_MIGRATE_RETRY_BACKOFF_MS = '50';
const { captureReveals, incompleteCapture } = await import('../src/convert/reveal.ts');

const DESKTOP = [{ name: 'desktop', width: 1280, height: 800, isMobile: false }] as const;

// Each control adds a panel Escape does not take away, so the page is loaded again after each one; with `gone`, a page
// loaded again has no "more" control at all.
const page = (more: boolean) => `<!doctype html><html><body>
<button id="search" aria-expanded="false">Search</button>
${more ? '<button id="more" aria-expanded="false">More</button>' : ''}
<script>
for (const b of document.querySelectorAll('button')) b.addEventListener('click', (event) => {
	event.currentTarget.setAttribute('aria-expanded', 'true');
	document.body.append(Object.assign(document.createElement('div'), { role: 'dialog', textContent: event.currentTarget.id + ' panel' }));
});
</script></body></html>`;

let browser: Browser;
let server: Server;
let origin: string;
let loads = 0;
let gone = false;
before(async () => {
	browser = await chromium.launch();
	server = createServer((request, res) => {
		if (request.url !== '/') return void res.writeHead(404).end();
		res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(page(!(gone && ++loads > 1)));
	});
	await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
	origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(async () => {
	await browser.close();
	server.close();
});

test('a control not found on the page loaded again makes the capture incomplete, and it is not stored', async () => {
	const dir = await mkdtemp(join(tmpdir(), 'reveal-incomplete-'));
	loads = 0;
	gone = true;
	try {
		const capture = await captureReveals(browser, origin, '/', dir, DESKTOP);
		assert.deepEqual(capture.lost, ['more (desktop)']);
		assert.ok(!capture.skipped.some((s) => s.startsWith('more ')), 'a lost control is not a skip');
		assert.deepEqual(await readdir(dir).catch(() => []), []);
	} finally {
		gone = false;
		await rm(dir, { recursive: true, force: true });
	}
});

test('a stored capture that skipped a control as not found again is captured again', async () => {
	const dir = await mkdtemp(join(tmpdir(), 'reveal-incomplete-'));
	try {
		const first = await captureReveals(browser, origin, '/', dir, DESKTOP);
		const [file] = await readdir(dir);
		await mkdir(dir, { recursive: true });
		await writeFile(join(dir, file!), JSON.stringify({ ...first, reveals: first.reveals.filter((r) => r.key !== 'more'), skipped: ['more (desktop): not found on the page loaded again'] }));
		const again = await captureReveals(browser, origin, '/', dir, DESKTOP);
		assert.deepEqual(again.reveals.map((r) => r.key).sort(), ['more', 'search']);
		assert.deepEqual(again.skipped, []);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});

test('a route whose capture lost controls fails, naming them', () => {
	assert.equal(incompleteCapture({ lost: [] }), undefined);
	assert.equal(incompleteCapture({}), undefined);
	assert.equal(incompleteCapture({ lost: ['edit (desktop)', 'view (desktop)'] }), 'capture incomplete: edit (desktop), view (desktop) not found on the page loaded again, so their reveals are missing');
});
