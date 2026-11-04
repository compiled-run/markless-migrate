import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { chromium, type Browser } from 'playwright';
import { defaultEnv } from '../src/check/browser.ts';
import { explore } from '../src/check/journeys.ts';
import { VIEWPORTS } from '../src/check/types.ts';

// Six rows, each with a menu that hides the rest of the page from assistive technology while it is open, as a Radix dropdown does.
// `escape`: Escape closes it; otherwise only a click outside it does.
const rows = (escape: boolean) => `<!doctype html><html lang="en"><head><title>Payments</title><style>[role=menu]{position:fixed;top:40px;left:400px;background:#fff;border:1px solid}</style></head><body><main id="page"><h1>Payments</h1><ul>${Array.from({ length: 6 }, (_, i) => `<li>Payment ${i + 1} <button aria-haspopup="menu" aria-expanded="false" data-row="${i}">Open menu</button></li>`).join('')}</ul></main><div role="menu" id="menu" hidden><div role="menuitem" tabindex="-1">Copy payment ID</div></div><script>
const page = document.getElementById('page'), menu = document.getElementById('menu');
let opener = null;
const close = () => { menu.hidden = true; page.removeAttribute('aria-hidden'); opener?.setAttribute('aria-expanded', 'false'); opener = null; };
for (const b of document.querySelectorAll('[data-row]')) b.onclick = () => { opener = b; b.setAttribute('aria-expanded', 'true'); menu.hidden = false; page.setAttribute('aria-hidden', 'true'); menu.firstElementChild.focus(); };
${escape ? "addEventListener('keydown', (e) => { if (e.key === 'Escape' && !menu.hidden) close(); });" : ''}
addEventListener('pointerdown', (e) => { if (!menu.hidden && !menu.contains(e.target)) close(); });
</script></body></html>`;

let browser: Browser;
let server: Server;
let origin: string;
before(async () => {
	browser = await chromium.launch();
	server = createServer((req, res) => res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(rows(req.url !== '/outside')));
	origin = await new Promise((done) => server.listen(0, '127.0.0.1', () => done(`http://127.0.0.1:${(server.address() as AddressInfo).port}`)));
});
after(async () => {
	await browser?.close();
	server.closeAllConnections();
	server.close();
});

const unused = (elements: readonly { element: string; by?: string; reason?: string }[]) => elements.filter((e) => /^button "Open menu"/.test(e.element) && !e.by).map((e) => `${e.element}: ${e.reason}`);

test('alike controls that each open a menu hiding the page are each used in turn, the menu closed by Escape between them', async () => {
	const explored = await explore(browser, defaultEnv(origin), '/', VIEWPORTS[0]!);
	assert.deepEqual(unused(explored.elements), []);
	const turn = explored.journeys.find((j) => /more alike, each in turn/.test(j.name))!;
	assert.ok(turn.steps.some((s) => s.action === 'key' && s.key === 'Escape'), JSON.stringify(turn.steps));
	assert.ok(!turn.steps.some((s) => s.action === 'outside'), 'Escape closed it on the original, so no click outside is replayed');
});

test('where Escape leaves the menu open on the original, a click outside closes it between them, and both are replayed', async () => {
	const explored = await explore(browser, defaultEnv(origin), '/outside', VIEWPORTS[0]!);
	assert.deepEqual(unused(explored.elements), []);
	const turn = explored.journeys.find((j) => /more alike, each in turn/.test(j.name))!;
	assert.ok(turn.steps.some((s) => s.action === 'outside'), JSON.stringify(turn.steps));
	assert.match(turn.name, /Escape did not close/);
});
