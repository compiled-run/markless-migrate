// convert's capture of Base UI submenus, on a page that mounts them as Base UI does: a submenu trigger's popup is put in
// its own portal at the end of the body once the pointer rests on the trigger, and the ids are new on every mount.
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { chromium, type Browser } from 'playwright';
import { captureBaseSubmenus, type Reveal } from '../src/convert/reveal.ts';

const PAGE = `<!doctype html><html><body><button id="t" aria-haspopup="menu" aria-expanded="false">Open</button><script>
const t = document.getElementById('t');
let n = 0;
const portal = (html) => { const p = document.createElement('div'); p.setAttribute('data-base-ui-portal', ''); p.innerHTML = '<div role="presentation">' + html + '</div>'; document.body.append(p); return p; };
t.addEventListener('click', () => {
	const m = ++n;
	const root = portal('<div role="menu" aria-labelledby="t"><div role="menuitem">Team</div>'
		+ '<div role="menuitem" id="base-ui-_r_' + m + 'a_" aria-haspopup="menu" aria-expanded="false">Invite users</div>'
		+ '<div role="menuitem" id="base-ui-_r_' + m + 'b_" aria-haspopup="menu" aria-expanded="false" aria-disabled="true" data-disabled="">Disabled</div>'
		+ '<div role="menuitem" id="base-ui-_r_' + m + 'c_" aria-haspopup="menu" aria-expanded="false">Share</div></div>');
	// Base UI's MenuRoot: a submenu opens on hover only once the pointer has moved on the menu (allowMouseEnter).
	let allow = false;
	root.querySelector('[role="menu"]').addEventListener('pointermove', () => (allow = true));
	for (const [k, text] of [['a', 'Email'], ['c', 'Link']]) {
		const item = root.querySelector('#base-ui-_r_' + m + k + '_');
		item.addEventListener('pointermove', () => allow && setTimeout(() => {
			if (item.getAttribute('aria-expanded') === 'true') return;
			item.setAttribute('aria-expanded', 'true');
			const sub = portal('<div role="menu" data-nested="" id="_r_' + m + k + 'p_" aria-labelledby="' + item.id + '"><div role="menuitem">' + text + '</div></div>');
			sub.dataset.sub = '';
		}, 100));
	}
});
document.addEventListener('keydown', (e) => {
	if (e.key !== 'Escape') return;
	const subs = document.querySelectorAll('[data-sub]');
	for (const s of subs) s.remove();
	for (const i of document.querySelectorAll('[aria-expanded="true"][role="menuitem"]')) i.setAttribute('aria-expanded', 'false');
	if (!subs.length) for (const p of document.querySelectorAll('[data-base-ui-portal]')) p.remove();
});
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

test('captureBaseSubmenus: each enabled submenu trigger of a revealed Base UI menu is hovered, and the portal it mounts is a reveal keyed by the menu and its place', async () => {
	const dir = await mkdtemp(join(tmpdir(), 'base-submenus-'));
	try {
		const recorded = '<div data-base-ui-portal=""><div role="presentation"><div role="menu" aria-labelledby="t"><div role="menuitem">Team</div><div role="menuitem" id="base-ui-_r_xa_" aria-haspopup="menu" aria-expanded="false">Invite users</div><div role="menuitem" id="base-ui-_r_xb_" aria-haspopup="menu" aria-expanded="false" aria-disabled="true" data-disabled="">Disabled</div><div role="menuitem" id="base-ui-_r_xc_" aria-haspopup="menu" aria-expanded="false">Share</div></div></div></div>';
		const menu: Reveal = { key: 't', path: [0], sig: 'button||Open', nth: 0, action: 'click', viewport: 'desktop', added: [{ into: 'body', before: -1, html: recorded }] };
		const [marked, ...found] = await captureBaseSubmenus(browser, origin, '/', dir, [menu]);
		assert.equal(marked!.key, 't');
		assert.equal(marked!.added[0]!.html, recorded.replace('id="base-ui-_r_xa_"', 'id="base-ui-_r_xa_" data-mm-key="t-sub-0"').replace('id="base-ui-_r_xc_"', 'id="base-ui-_r_xc_" data-mm-key="t-sub-2"'));
		assert.deepEqual(found.map((r) => [r.key, r.action, r.added.map((a) => a.into)]), [['t-sub-0', 'hover', ['body']], ['t-sub-2', 'hover', ['body']]]);
		// The submenu's own portal, labelled by the trigger under the id the menu's reveal has.
		assert.match(found[0]!.added[0]!.html, /^<div data-base-ui-portal="" data-sub=""><div role="presentation"><div role="menu" data-nested="" [^>]*aria-labelledby="base-ui-_r_xa_">.*Email/);
		assert.match(found[1]!.added[0]!.html, /aria-labelledby="base-ui-_r_xc_">.*Link/);
		assert.deepEqual(await captureBaseSubmenus(browser, origin, '/other', dir, [{ ...menu, added: [{ into: 'body', before: -1, html: '<div data-base-ui-portal=""><div role="menu"></div></div>' }] }]), []);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});
