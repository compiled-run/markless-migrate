// A dialog that opens at load (shadcn /create's welcome dialog) leaves the page behind it inert: a visitor dismisses it
// first, so the page's own controls are used once more with it dismissed, and the dialog's own controls with it open.
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { chromium, type Browser } from 'playwright';
import { captureRouteReveals, openDialogAtLoad } from '../src/convert/reveal.ts';

const PAGE = `<!doctype html><html><body>
<main><button id="search" aria-expanded="false">Search</button></main>
<script>
const opener = (button) => button.addEventListener('click', (event) => {
	event.currentTarget.setAttribute('aria-expanded', 'true');
	const list = Object.assign(document.createElement('div'), { role: 'listbox' });
	list.innerHTML = '<div role="option">' + event.currentTarget.id + ' option</div>';
	document.body.append(list);
});
opener(document.getElementById('search'));
addEventListener('load', () => {
	if (sessionStorage.getItem('dismissed')) return;
	const backdrop = Object.assign(document.createElement('div'), { id: 'backdrop' });
	backdrop.style.cssText = 'position:fixed;inset:0;z-index:1';
	const dialog = Object.assign(document.createElement('div'), { role: 'dialog' });
	dialog.setAttribute('role', 'dialog');
	dialog.setAttribute('data-state', 'open');
	dialog.style.cssText = 'position:fixed;top:40px;left:40px;z-index:2;background:white';
	dialog.innerHTML = '<button id="pick" aria-expanded="false">Pick</button>';
	document.querySelector('main').inert = true;
	document.body.append(backdrop, dialog);
	opener(dialog.querySelector('button'));
	addEventListener('keydown', (event) => {
		if (event.key !== 'Escape') return;
		backdrop.remove();
		dialog.remove();
		document.querySelector('main').inert = false;
	});
});
</script></body></html>`;

let browser: Browser;
let server: Server;
let origin: string;
before(async () => {
	browser = await chromium.launch();
	server = createServer((_request, res) => res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(PAGE));
	await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
	origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(async () => {
	await browser.close();
	server.close();
});

test('a dialog open in the settled page is told from one closed or not a dialog', () => {
	assert.equal(openDialogAtLoad('<div role="dialog" data-open="" data-slot="dialog-content">'), true);
	assert.equal(openDialogAtLoad('<div data-state="open" role="alertdialog">'), true);
	assert.equal(openDialogAtLoad('<div role="dialog" data-state="closed">'), false);
	assert.equal(openDialogAtLoad('<div role="menu" data-state="open">'), false);
});

test("with a dialog open at load, the page's controls behind it are used with it dismissed, and the dialog's own with it open", async () => {
	const dir = await mkdtemp(join(tmpdir(), 'reveal-load-dialog-'));
	try {
		const { reveals } = await captureRouteReveals(browser, origin, '/', dir, { loadDialog: true });
		const keys = new Set(reveals.filter((r) => r.viewport === 'desktop').map((r) => r.key));
		assert.ok(keys.has('pick'), 'the dialog\'s own control');
		assert.ok(keys.has('search'), 'the control behind the dialog');
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});
