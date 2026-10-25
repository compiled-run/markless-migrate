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

const PAGE = `<!doctype html><html><body><button id="t" aria-haspopup="menu" aria-expanded="false">Open</button><script>
const t = document.getElementById('t');
const menu = (html) => { const w = document.createElement('div'); w.setAttribute('data-radix-popper-content-wrapper', ''); w.innerHTML = html; document.body.append(w); return w; };
t.addEventListener('click', () => {
	t.setAttribute('aria-expanded', 'true');
	const root = menu('<div role="menu" data-radix-menu-content=""><div role="menuitem">Team</div><div role="menuitem" id="radix-s1" aria-haspopup="menu" aria-expanded="false">Invite users</div><div role="menuitem" id="radix-s2" aria-haspopup="menu" aria-expanded="false" data-disabled="">Disabled</div></div>');
	const sub = root.querySelector('#radix-s1');
	let timer = 0;
	sub.addEventListener('pointermove', () => { if (!timer && sub.getAttribute('aria-expanded') === 'false') timer = setTimeout(() => { sub.setAttribute('aria-expanded', 'true'); menu('<div role="menu" data-radix-menu-content="" data-side="right" aria-labelledby="radix-s1"><div role="menuitem">Email</div></div>'); }, 100); });
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

test('captureRadixSubmenus: each enabled sub-trigger of a revealed Radix menu is hovered, and the content it mounts is a reveal keyed by its id', async () => {
	const dir = await mkdtemp(join(tmpdir(), 'radix-submenus-'));
	try {
		const menu: Reveal = { key: 't', path: [0], sig: 'button||Open', nth: 0, action: 'click', viewport: 'desktop', added: [{ into: 'body', before: -1, html: '<div data-radix-popper-content-wrapper=""><div role="menu" data-radix-menu-content=""><div role="menuitem" id="radix-s1" aria-haspopup="menu">Invite users</div></div></div>' }] };
		const found = await captureRadixSubmenus(browser, origin, '/', dir, [menu]);
		assert.deepEqual(found.map((r) => [r.key, r.action]), [['radix-s1', 'hover']]);
		assert.equal(found[0]!.added.length, 1);
		assert.match(found[0]!.added[0]!.html, /^<div data-radix-popper-content-wrapper="">.*aria-labelledby="radix-s1".*Email/);
		// A menu without a sub-trigger is not opened again.
		assert.deepEqual(await captureRadixSubmenus(browser, origin, '/other', dir, [{ ...menu, added: [{ into: 'body', before: -1, html: '<div data-radix-menu-content=""></div>' }] }]), []);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});
