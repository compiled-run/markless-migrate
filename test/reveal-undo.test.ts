// Putting a page back after a control was used, so the next control is used on the same page rather than a fresh load:
// what Escape leaves behind that a fresh load would not have (focus on the trigger, an emptied style attribute, an
// accordion item the gesture opened or closed) is undone too, and the page is loaded again only when it still differs.
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { chromium, type Browser } from 'playwright';
import { captureReveals } from '../src/convert/reveal.ts';
import { VIEWPORTS } from '../src/check/types.ts';

const PAGE = `<!doctype html><html><body>
<div id="accordion">
<button id="one" aria-expanded="true" aria-controls="p1">One</button><div id="p1">First panel</div>
<button id="two" aria-expanded="false" aria-controls="p2">Two</button><div id="p2" hidden>Second panel</div>
</div>
<button id="menu" aria-haspopup="menu" aria-expanded="false">Menu</button>
<button id="other" aria-haspopup="menu" aria-expanded="false">Other</button>
<script>
// A single accordion: opening an item closes the open one.
for (const [id, panel] of [['one', 'p1'], ['two', 'p2']]) document.getElementById(id).addEventListener('click', () => {
	const open = document.getElementById(id).getAttribute('aria-expanded') === 'true';
	for (const [other, p] of [['one', 'p1'], ['two', 'p2']]) {
		document.getElementById(other).setAttribute('aria-expanded', String(!open && other === id));
		document.getElementById(p).hidden = open || other !== id;
	}
});
// A menu that locks scroll while open and marks its trigger while it has focus, as React Aria does.
for (const id of ['menu', 'other']) {
	const trigger = document.getElementById(id);
	trigger.addEventListener('focus', () => trigger.setAttribute('data-focused', 'true'));
	trigger.addEventListener('blur', () => trigger.removeAttribute('data-focused'));
	trigger.addEventListener('click', () => {
		const menu = document.createElement('div');
		menu.setAttribute('role', 'menu');
		menu.textContent = id + ' items';
		document.body.append(menu);
		document.body.style.overflow = 'hidden';
		trigger.setAttribute('aria-expanded', 'true');
		addEventListener('keydown', function close(e) {
			if (e.key !== 'Escape') return;
			removeEventListener('keydown', close);
			menu.remove();
			document.body.style.overflow = '';
			trigger.setAttribute('aria-expanded', 'false');
			trigger.focus();
		});
	});
}
</script></body></html>`;

let browser: Browser;
let server: Server;
let origin: string;
let loads = 0;
before(async () => {
	browser = await chromium.launch();
	server = createServer((_request, res) => {
		loads++;
		res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(PAGE);
	});
	await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
	origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(async () => {
	await browser.close();
	server.close();
});

test('the controls of a page are used one after another on one load when each use can be put back', async () => {
	const dir = await mkdtemp(join(tmpdir(), 'reveal-undo-'));
	try {
		loads = 0;
		const capture = await captureReveals(browser, origin, '/', dir, [VIEWPORTS[0]!]);
		assert.deepEqual(
			capture.reveals.map((r) => [r.sig, r.added.map((a) => a.html)]),
			[
				['button||Menu', ['<div role="menu">menu items</div>']],
				['button||Other', ['<div role="menu">other items</div>']],
			],
		);
		assert.equal(loads, 1);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});
