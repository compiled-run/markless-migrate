// convert's capture of React Aria submenus, on a page that mounts them as React Aria does: the menu's popover is put at
// the end of the body when it opens, its ids counted on from what mounted before, and a submenu's popover is put there too
// once the pointer rests on its trigger item.
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { chromium, type Browser } from 'playwright';
import { captureRacSubmenus, type Reveal } from '../src/convert/reveal.ts';

const PAGE = `<!doctype html><html><body><div role="button" data-react-aria-pressable="true" id="react-aria-_r_0_" style="width:300px;height:200px">Right click here</div><script>
let n = 4;
const area = document.getElementById('react-aria-_r_0_');
const popover = (trigger, html) => { const p = document.createElement('div'); p.dataset.trigger = trigger; p.innerHTML = html; document.body.append(p); return p; };
area.addEventListener('contextmenu', (e) => {
	e.preventDefault();
	const id = 'react-aria-_r_' + (n += 3) + '_';
	const menu = popover('MenuTrigger', '<div role="menu"><div role="menuitem" data-rac="">Back</div><div role="menuitem" data-rac="" id="' + id + '" aria-haspopup="menu" aria-expanded="false">More Tools</div></div>');
	const item = menu.querySelector('[aria-haspopup]');
	item.addEventListener('pointermove', () => setTimeout(() => {
		if (item.getAttribute('aria-expanded') === 'true') return;
		item.setAttribute('aria-expanded', 'true');
		popover('SubmenuTrigger', '<div role="menu" aria-labelledby="' + id + '"><div role="menuitem" data-rac="">Save Page</div></div>');
	}, 200));
});
document.addEventListener('keydown', (e) => {
	if (e.key === 'Escape') for (const p of document.querySelectorAll('[data-trigger]')) p.remove();
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

test("captureRacSubmenus: a context menu's submenu is captured from a right click, keyed by its trigger item's id as the menu's reveal has it", async () => {
	const dir = await mkdtemp(join(tmpdir(), 'rac-submenus-'));
	try {
		const recorded = '<div data-trigger="MenuTrigger"><div role="menu"><div role="menuitem" data-rac="">Back</div><div role="menuitem" data-rac="" id="react-aria-_r_2_" aria-haspopup="menu" aria-expanded="false">More Tools</div></div></div>';
		const menu: Reveal = { key: 'react-aria-_r_0_', path: [0], sig: 'div||Right click here', nth: 0, action: 'contextmenu', viewport: 'desktop', added: [{ into: 'body', before: -1, html: recorded }] };
		const found = await captureRacSubmenus(browser, origin, '/', dir, [menu]);
		assert.deepEqual(found.map((r) => [r.key, r.action]), [['react-aria-_r_2_', 'hover']]);
		assert.match(found[0]!.added[0]!.html, /^<div data-trigger="SubmenuTrigger"><div role="menu" aria-labelledby="react-aria-_r_2_">.*Save Page/);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});
