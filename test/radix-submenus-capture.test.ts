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

// A submenu holding sub-triggers of its own (Radix's Submenus story: Bookmarks, then WorkOS), portaled or mounted inside it.
const NESTED = `<!doctype html><html><body><button id="t" aria-haspopup="menu" aria-expanded="false">Open</button><script>
const t = document.getElementById('t');
let mount = 0;
const wrap = (html, into) => { const w = document.createElement('div'); w.setAttribute('data-radix-popper-content-wrapper', ''); w.innerHTML = html; into.append(w); return w; };
const sub = (n, k, label) => '<div role="menuitem" id="radix-' + n + '-s' + k + '" aria-controls="radix-' + n + '-c' + k + '" aria-haspopup="menu" aria-expanded="false">' + label + '</div>';
const content = (n, k, inner) => '<div role="menu" data-radix-menu-content="" data-side="right" id="radix-' + n + '-c' + k + '" aria-labelledby="radix-' + n + '-s' + k + '">' + inner + '</div>';
// The fiber React gives the content: its PopperContent was passed SubContent's sideOffset.
const fiber = (el, props) => { const popper = { tag: 11, type: () => null, stateNode: null, memoizedProps: props, return: null, child: null, sibling: null, alternate: null }; el.__reactFiber$t = { tag: 5, type: 'div', stateNode: el, memoizedProps: {}, return: popper, child: null, sibling: null, alternate: null }; popper.child = el.__reactFiber$t; };
const opens = (n, k, into, inner, then) => {
	const item = document.getElementById('radix-' + n + '-s' + k);
	item.addEventListener('pointermove', () => setTimeout(() => {
		if (item.getAttribute('aria-expanded') === 'true') return;
		item.setAttribute('aria-expanded', 'true');
		fiber(wrap(content(n, k, inner), into()).firstElementChild, { sideOffset: 12, alignOffset: -6 });
		then?.();
	}, 100));
};
t.addEventListener('click', () => {
	const n = ++mount;
	t.setAttribute('aria-expanded', 'true');
	const root = wrap('<div role="menu" data-radix-menu-content=""><div role="menuitem">New Tab</div>' + sub(n, 1, 'Bookmarks') + '</div>', document.body);
	opens(n, 1, () => document.body, '<div role="menuitem">Inbox</div>' + sub(n, 2, 'WorkOS'), () => {
		opens(n, 2, () => document.body, '<div role="menuitem">Stitches</div>' + sub(n, 3, 'Advanced'), () => {
			const holder = document.getElementById('radix-' + n + '-c2');
			opens(n, 3, () => holder, '<div role="menuitem">Regex</div>');
		});
	});
});
document.addEventListener('keydown', (e) => { if (e.key !== 'Escape') return; for (const w of document.querySelectorAll('[data-radix-popper-content-wrapper]')) w.remove(); t.setAttribute('aria-expanded', 'false'); });
</script></body></html>`;

let browser: Browser;
let server: Server;
let origin: string;
before(async () => {
	browser = await chromium.launch();
	server = createServer((req, res) => res.writeHead(200, { 'content-type': 'text/html' }).end(req.url === '/nested' ? NESTED : PAGE));
	await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
	origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(async () => {
	await browser.close();
	server.close();
});

test('captureRadixSubmenus: each enabled sub-trigger of a revealed Radix menu is hovered, and the content it mounts, portaled or inside the menu, is a reveal keyed by the menu and its place', async () => {
	const dir = await mkdtemp(join(tmpdir(), 'radix-submenus-'));
	try {
		const recorded = '<div data-radix-popper-content-wrapper=""><div role="menu" data-radix-menu-content=""><div role="menuitem">Team</div><div role="menuitem" id="radix-a" aria-controls="radix-ac" aria-haspopup="menu">Invite users</div><div role="menuitem" id="radix-b" aria-haspopup="menu" data-disabled="">Disabled</div><div role="menuitem" id="radix-c" aria-controls="radix-cc" aria-haspopup="menu">Share</div></div></div>';
		const menu: Reveal = { key: 't', path: [0], sig: 'button||Open', nth: 0, action: 'click', viewport: 'desktop', added: [{ into: 'body', before: -1, html: recorded }] };
		const [marked, ...found] = await captureRadixSubmenus(browser, origin, '/', dir, [menu]);
		// The menu's reveal, its sub-triggers keyed by the menu's key and their place in it.
		assert.equal(marked!.key, 't');
		assert.equal(marked!.added[0]!.html, recorded.replace('id="radix-a"', 'id="radix-a" data-mm-key="t-sub-0"').replace('id="radix-c"', 'id="radix-c" data-mm-key="t-sub-2"'));
		assert.deepEqual(found.map((r) => [r.key, r.action, r.added.map((a) => a.into)]), [['t-sub-0', 'hover', ['body']], ['t-sub-2', 'hover', ['body']]]);
		// Under the ids the menu's reveal has, though Radix gave the items new ones.
		assert.match(found[0]!.added[0]!.html, /^<div data-radix-popper-content-wrapper=""><div [^>]*id="radix-ac" aria-labelledby="radix-a">.*Email/);
		assert.match(found[1]!.added[0]!.html, /^<div data-radix-popper-content-wrapper=""><div [^>]*id="radix-cc" aria-labelledby="radix-c">.*Link/);
		// A menu without a sub-trigger is not opened again.
		assert.deepEqual(await captureRadixSubmenus(browser, origin, '/other', dir, [{ ...menu, added: [{ into: 'body', before: -1, html: '<div data-radix-menu-content=""></div>' }] }]), []);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});

test('captureRadixSubmenus: a submenu inside a submenu is a reveal too, keyed by the submenu holding it, its trigger there marked with that key', async () => {
	const dir = await mkdtemp(join(tmpdir(), 'radix-submenus-'));
	try {
		const recorded = '<div data-radix-popper-content-wrapper=""><div role="menu" data-radix-menu-content=""><div role="menuitem">New Tab</div><div role="menuitem" id="radix-a" aria-controls="radix-ac" aria-haspopup="menu" aria-expanded="false">Bookmarks</div></div></div>';
		const menu: Reveal = { key: 't', path: [0], sig: 'button||Open', nth: 0, action: 'click', viewport: 'desktop', added: [{ into: 'body', before: -1, html: recorded }] };
		const [, ...found] = await captureRadixSubmenus(browser, origin, '/nested', dir, [menu]);
		assert.deepEqual(found.map((r) => r.key), ['t-sub-0', 't-sub-0-sub-0', 't-sub-0-sub-0-sub-0']);
		const holds = (key: string, text: string) => assert.match(found.find((r) => r.key === key)!.added.map((a) => a.html).join(''), new RegExp(`>${text}<`), `${key} shows ${text}`);
		holds('t-sub-0', 'Inbox');
		holds('t-sub-0-sub-0', 'Stitches');
		holds('t-sub-0-sub-0-sub-0', 'Regex');
		// Marked with what its instance was given, as a menu's own reveal is.
		assert.match(found[0]!.added[0]!.html, /data-mm-side-offset="12" data-mm-align-offset="-6"/);
		// Each nested sub-trigger, in the submenu holding it, names the submenu it opens.
		const trigger = (key: string, text: string) => {
			const html = found.find((r) => r.key === key)!.added.map((a) => a.html).join('');
			const tag = [...html.matchAll(/<div [^>]*aria-haspopup="menu"[^>]*>([^<]*)</g)].find((m) => m[1] === text)?.[0] ?? '';
			return /data-mm-key="([^"]+)"/.exec(tag)?.[1];
		};
		assert.equal(trigger('t-sub-0', 'WorkOS'), 't-sub-0-sub-0');
		assert.equal(trigger('t-sub-0-sub-0', 'Advanced'), 't-sub-0-sub-0-sub-0');
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});
