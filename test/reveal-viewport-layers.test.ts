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
		assert.equal(capture.oneViewport?.length, 1);
		assert.match(capture.oneViewport![0]!, /^open \(shown at desktop, recorded at mobile; at desktop: could not click: /);
		assert.match(incompleteCapture(capture) ?? '', /open \(shown at desktop, recorded at mobile; at desktop: could not click: /);
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

// shadcn's React Aria data-table shipped row menus that opened only at mobile, a different row each run: on a busy runner the
// desktop click outlasted its 2 s while the page handled it, or a render replaced the row's button between finding and
// pressing it, and the mobile load recorded the control there.
// `menu` shows only below 768 px, so the mobile viewport is loaded too. BUSY: handling a press of `open` holds the main
// thread 2.5 s. REPLACED: `open` sits below the fold and is rendered again the first time it scrolls into view.
const busyPage = (mode: 'busy' | 'replaced') => `<!doctype html><html><head><meta name="viewport" content="width=device-width"><style>
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

const at = (reveals: readonly { key: string; viewport: string }[]) => Object.fromEntries(reveals.map((r) => [r.key, r.viewport]));

const serveBusy = async (mode: 'busy' | 'replaced') => {
	const s = createServer((request, res) => (request.url === '/' ? res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(busyPage(mode)) : res.writeHead(404).end()));
	await new Promise<void>((done) => s.listen(0, '127.0.0.1', done));
	return { server: s, origin: `http://127.0.0.1:${(s.address() as AddressInfo).port}` };
};

test('a press the page takes longer than 2 s to handle is still recorded at that viewport', async () => {
	const dir = await mkdtemp(join(tmpdir(), 'reveal-busy-'));
	const busy = await serveBusy('busy');
	try {
		const capture = await captureReveals(browser, busy.origin, '/', dir, VIEWPORTS);
		assert.deepEqual(at(capture.reveals), { open: 'desktop', menu: 'mobile' });
		assert.equal(incompleteCapture(capture), undefined);
	} finally {
		busy.server.close();
		await rm(dir, { recursive: true, force: true });
	}
});

test('a control a render replaced between finding and pressing it is pressed as the page now holds it', async () => {
	const dir = await mkdtemp(join(tmpdir(), 'reveal-busy-'));
	const busy = await serveBusy('replaced');
	try {
		const capture = await captureReveals(browser, busy.origin, '/', dir, VIEWPORTS);
		assert.deepEqual(at(capture.reveals), { open: 'desktop', menu: 'mobile' });
		assert.equal(incompleteCapture(capture), undefined);
	} finally {
		busy.server.close();
		await rm(dir, { recursive: true, force: true });
	}
});
