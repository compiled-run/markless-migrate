// shadcn's Base UI dropdown-menu page shipped 13 menu triggers with a layer at mobile and none at desktop: the desktop
// read came before React hydrated and gave the triggers aria-expanded, and only the mobile load found them.
import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { chromium, type Browser } from 'playwright';

process.env.MARKLESS_MIGRATE_RETRY_BACKOFF_MS = '50';
const { captureReveals, incompleteCapture } = await import('../src/convert/reveal.ts');
const { VIEWPORTS } = await import('../src/check/types.ts');

// `menu` shows only below 768 px, so the mobile viewport is loaded too. `open` is marked late on the first load (LATE),
// and with COVERED a layer over the page at desktop takes its click.
const page = (late: boolean, covered: boolean) => `<!doctype html><html><head><meta name="viewport" content="width=device-width"><style>
#menu { display: none } @media (max-width: 767px) { #menu { display: inline-block } }
${covered ? '#cover { position: fixed; inset: 0; z-index: 10 } @media (max-width: 767px) { #cover { display: none } }' : ''}
</style></head><body>
${covered ? '<div id="cover"></div>' : ''}
<button id="menu" aria-expanded="false">Menu</button>
<button id="open" aria-haspopup="menu"${late ? '' : ' aria-expanded="false"'}>Open</button>
<script>
${late ? "setTimeout(() => document.getElementById('open').setAttribute('aria-expanded', 'false'), 2500);" : ''}
for (const b of document.querySelectorAll('button')) b.addEventListener('click', (event) => {
	event.currentTarget.setAttribute('aria-expanded', 'true');
	document.body.append(Object.assign(document.createElement('div'), { role: 'menu', textContent: event.currentTarget.id + ' menu' }));
});
</script></body></html>`;

// The page as capturePage keeps it once settled: every control marked.
const settledDoc = (covered: boolean) => page(false, covered);

let browser: Browser;
let server: Server;
let origin: string;
let loads = 0;
let covered = false;
before(async () => {
	browser = await chromium.launch();
	server = createServer((request, res) => {
		if (request.url !== '/') return void res.writeHead(404).end();
		res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(page(++loads === 1, covered));
	});
	await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
	origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(async () => {
	await browser.close();
	server.close();
});

test('a control the page marks only after its first read is used at that viewport, waiting for what the settled page marks', async () => {
	const dir = await mkdtemp(join(tmpdir(), 'reveal-viewport-'));
	loads = 0;
	covered = false;
	try {
		const settled = { desktop: settledDoc(false), mobile: settledDoc(false) };
		const capture = await captureReveals(browser, origin, '/', dir, VIEWPORTS, [], { settled });
		const at = Object.fromEntries(capture.reveals.map((r) => [r.key, r.viewport]));
		assert.deepEqual(at, { open: 'desktop', menu: 'mobile' });
		assert.equal(incompleteCapture(capture), undefined);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});

test('a control shown at desktop whose layer only mobile recorded makes the capture incomplete, and it is not stored', async () => {
	const dir = await mkdtemp(join(tmpdir(), 'reveal-viewport-'));
	loads = 1;
	covered = true;
	try {
		const capture = await captureReveals(browser, origin, '/', dir, VIEWPORTS, [], { settled: { desktop: settledDoc(true), mobile: settledDoc(true) } });
		assert.deepEqual(capture.oneViewport, ['open (shown at desktop, recorded at mobile)']);
		assert.match(incompleteCapture(capture) ?? '', /open \(shown at desktop, recorded at mobile\)/);
		assert.deepEqual(await readdir(dir).catch(() => []), []);
	} finally {
		covered = false;
		await rm(dir, { recursive: true, force: true });
	}
});

test('a route whose controls have a layer at only one of the viewports that show them fails, naming them', () => {
	assert.equal(incompleteCapture({ oneViewport: [] }), undefined);
	assert.equal(
		incompleteCapture({ oneViewport: ['open (shown at desktop, recorded at mobile)'] }),
		'capture incomplete: open (shown at desktop, recorded at mobile) has a layer only at a viewport other than one that shows it, so it opens nothing there',
	);
	assert.equal(
		incompleteCapture({ lost: ['edit (desktop)'], oneViewport: ['open (shown at desktop, recorded at mobile)'] }),
		'capture incomplete: edit (desktop) not found on the page loaded again, so their reveals are missing; open (shown at desktop, recorded at mobile) has a layer only at a viewport other than one that shows it, so it opens nothing there',
	);
});
