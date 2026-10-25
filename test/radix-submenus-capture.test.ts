// convert's capture of Radix submenus, on a page that mounts them as Radix does: a sub-trigger's content is added to
// the body 100 ms after the pointer moves onto it, and Escape unmounts the whole menu.
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { chromium, type Browser } from 'playwright';
import { captureRadixSubmenus, type Reveal } from '../src/convert/reveal.ts';

// Each open mounts the menu afresh, with new ids, as Radix's useId gives them.
const PAGE = `<!doctype html><html><body><button id="t" aria-haspopup="menu" aria-expanded="false">Open</button><script>
const t = document.getElementById('t');
let mount = 0;
const menu = (html, into = document.body) => { const w = document.createElement('div'); w.setAttribute('data-radix-popper-content-wrapper', ''); w.innerHTML = html; into.append(w); return w; };
t.addEventListener('click', () => {
	const n = ++mount;
	t.setAttribute('aria-expanded', 'true');
	const root = menu('<div role="menu" data-radix-menu-content=""><div role="menuitem">Team</div>'
		+ '<div role="menuitem" id="radix-' + n + '-s1" aria-controls="radix-' + n + '-c1" aria-haspopup="menu" aria-expanded="false">Invite users</div>'
		+ '<div role="menuitem" id="radix-' + n + '-s2" aria-haspopup="menu" aria-expanded="false" data-disabled="">Disabled</div>'
		+ '<div role="menuitem" id="radix-' + n + '-s3" aria-controls="radix-' + n + '-c3" aria-haspopup="menu" aria-expanded="false">Share</div></div>');
	const sub = (k, into, text) => {
		const item = root.querySelector('#radix-' + n + '-s' + k);
		item.addEventListener('pointermove', () => setTimeout(() => { if (item.getAttribute('aria-expanded') === 'true') return; item.setAttribute('aria-expanded', 'true'); menu('<div role="menu" data-radix-menu-content="" data-side="right" id="radix-' + n + '-c' + k + '" aria-labelledby="radix-' + n + '-s' + k + '"><div role="menuitem">' + text + '</div></div>', into()); }, 100));
	};
	sub(1, () => document.body, 'Email');
	// Menubar's and ContextMenu's shadcn SubContent is not portaled: Radix mounts it inside the parent menu.
	sub(3, () => root.firstElementChild, 'Link');
});
document.addEventListener('keydown', (e) => { if (e.key !== 'Escape') return; for (const w of document.querySelectorAll('[data-radix-popper-content-wrapper]')) w.remove(); t.setAttribute('aria-expanded', 'false'); });
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

test('captureRadixSubmenus: each enabled sub-trigger of a revealed Radix menu is hovered, and the content it mounts, portaled or inside the menu, is a reveal keyed by its id', async () => {
	const dir = await mkdtemp(join(tmpdir(), 'radix-submenus-'));
	try {
		const recorded = '<div data-radix-popper-content-wrapper=""><div role="menu" data-radix-menu-content=""><div role="menuitem">Team</div><div role="menuitem" id="radix-a" aria-controls="radix-ac" aria-haspopup="menu">Invite users</div><div role="menuitem" id="radix-b" aria-haspopup="menu" data-disabled="">Disabled</div><div role="menuitem" id="radix-c" aria-controls="radix-cc" aria-haspopup="menu">Share</div></div></div>';
		const menu: Reveal = { key: 't', path: [0], sig: 'button||Open', nth: 0, action: 'click', viewport: 'desktop', added: [{ into: 'body', before: -1, html: recorded }] };
		const found = await captureRadixSubmenus(browser, origin, '/', dir, [menu]);
		assert.deepEqual(found.map((r) => [r.key, r.action, r.added.map((a) => a.into)]), [['radix-a', 'hover', ['body']], ['radix-c', 'hover', ['body']]]);
		assert.match(found[0]!.added[0]!.html, /^<div data-radix-popper-content-wrapper=""><div [^>]*id="radix-ac" aria-labelledby="radix-a">.*Email/);
		assert.match(found[1]!.added[0]!.html, /^<div data-radix-popper-content-wrapper=""><div [^>]*id="radix-cc" aria-labelledby="radix-c">.*Link/);
		// A menu without a sub-trigger is not opened again.
		assert.deepEqual(await captureRadixSubmenus(browser, origin, '/other', dir, [{ ...menu, added: [{ into: 'body', before: -1, html: '<div data-radix-menu-content=""></div>' }] }]), []);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});
