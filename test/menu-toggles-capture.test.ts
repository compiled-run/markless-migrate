// convert's capture of a menu's checkbox and radio items on a page that renders them as the libraries do: a menu
// portaled to the end of the body on open, removed on close, its items' state the page's (kept) or the menu's own (reset).
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { chromium, type Browser } from 'playwright';
import { captureMenuToggles } from '../src/convert/menu-toggles.ts';
import type { Reveal } from '../src/convert/reveal.ts';

const PAGE = `<!doctype html><html><body><button id="kept">Kept</button><button id="reset">Reset</button><script>
const page = { bar: false, theme: 'light', wrap: false };
let ids = 0;
const item = (role, text, on) => '<div id="r' + ++ids + '" role="' + role + '" aria-checked="' + on + '" data-state="' + (on ? 'checked' : 'unchecked') + '"><span>' + (on ? '<svg data-check=""></svg>' : '') + '</span>' + text + '</div>';
let menu;
const close = () => { menu?.remove(); menu = undefined; document.getElementById('sub')?.remove(); };
// Radix-like: the page holds the state; a choice closes the menu.
document.getElementById('kept').addEventListener('click', () => {
	close();
	menu = document.createElement('div');
	const draw = () => (menu.innerHTML = '<div role="menu">' + item('menuitemcheckbox', 'Status Bar', page.bar) + '<div role="group">' + ['light', 'dark'].map((t) => item('menuitemradio', t, page.theme === t)).join('') + '</div>' + item('menuitemcheckbox', 'Fixed', true) + '<div role="menuitem" aria-haspopup="menu" data-mm-key="kept-sub-1">More</div></div>');
	draw();
	menu.addEventListener('mouseover', (e) => {
		if (!e.target.closest('[aria-haspopup]') || document.getElementById('sub')) return;
		const sub = document.createElement('div');
		sub.id = 'sub';
		const drawSub = () => (sub.innerHTML = '<div role="menu">' + item('menuitemcheckbox', 'Wrap', page.wrap) + '</div>');
		drawSub();
		sub.addEventListener('click', () => { page.wrap = !page.wrap; close(); });
		document.body.append(sub);
	});
	menu.addEventListener('click', (e) => {
		const el = e.target.closest('[role^=menuitem]');
		if (!el || el.hasAttribute('aria-haspopup')) return;
		if (el.textContent === 'Status Bar') page.bar = !page.bar;
		else if (el.getAttribute('role') === 'menuitemradio') page.theme = el.textContent;
		close();
	});
	document.body.append(menu);
});
// Base-like uncontrolled: the menu holds the state, stays open on a choice, and starts over when it opens again.
document.getElementById('reset').addEventListener('click', () => {
	close();
	const own = { urls: false };
	menu = document.createElement('div');
	const draw = () => (menu.innerHTML = '<div role="menu">' + item('menuitemcheckbox', 'Full URLs', own.urls) + '</div>');
	draw();
	menu.addEventListener('click', (e) => { if (e.target.closest('[role^=menuitem]')) { own.urls = !own.urls; draw(); } });
	document.body.append(menu);
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
</script></body></html>`;

let browser: Browser;
let server: Server;
let origin: string;
before(async () => {
	browser = await chromium.launch();
	server = createServer((_, res) => res.writeHead(200, { 'content-type': 'text/html' }).end(PAGE));
	await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
	origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(async () => {
	await browser.close();
	server.close();
});

const reveal = (key: string, path: number[], html: string): Reveal => ({ key, path, sig: `button||${key}`, nth: 0, action: 'click', viewport: 'desktop', added: [{ into: 'body', before: -1, html }] });

test("captureMenuToggles: a menu's checkbox and radio items with their markup on and off, kept by the page or reset with the menu; an item no press changes is left out", async () => {
	const dir = await mkdtemp(join(tmpdir(), 'menu-toggles-'));
	try {
		const found = await captureMenuToggles(browser, origin, '/', dir, [
			reveal('kept', [0], '<div role="menu"><div role="menuitemcheckbox" aria-checked="false">Status Bar</div><div role="menuitem" aria-haspopup="menu" data-mm-key="kept-sub-1">More</div></div>'),
			reveal('reset', [1], '<div role="menu"><div role="menuitemcheckbox" aria-checked="false">Full URLs</div></div>'),
			{ key: 'kept-sub-1', path: [-1], action: 'hover', viewport: 'desktop', added: [{ into: 'body', before: -1, html: '<div role="menu"><div role="menuitemcheckbox" aria-checked="false">Wrap</div></div>' }] },
		]);
		assert.deepEqual(found.find((m) => m.key === 'kept-sub-1')?.groups.map((g) => [g.kind, g.lasts, g.controls[0]!.sig]), [['toggle', 'kept', 'div||Wrap']], 'a submenu, opened through its menu');
		const kept = found.find((m) => m.key === 'kept')!;
		assert.deepEqual(kept.groups.map((g) => [g.kind, g.lasts, g.controls.map((c) => `${c.sig}:${c.initial}`)]), [
			['toggle', 'kept', ['div||Status Bar:false']],
			['radio', 'kept', ['div||light:true', 'div||dark:false']],
		]);
		const bar = kept.groups[0]!.controls[0]!;
		assert.equal(bar.on.attrs['aria-checked'], 'true');
		assert.equal(bar.off.attrs['aria-checked'], 'false');
		assert.match(bar.on.inner, /data-check/);
		assert.equal(bar.on.attrs.id, bar.off.attrs.id, 'an id generated on each opening is not part of the state');
		const reset = found.find((m) => m.key === 'reset')!;
		assert.deepEqual(reset.groups.map((g) => [g.kind, g.lasts]), [['toggle', 'reset']]);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});
