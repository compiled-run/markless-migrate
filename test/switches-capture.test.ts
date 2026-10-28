// A site-listed control that switches attributes in place (a sidebar's trigger), captured off the old page.
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { chromium, type Browser } from 'playwright';
import { captureSwitches } from '../src/convert/toggles.ts';

// A React Aria button: the pointer over it marks it hovered, a press marks it pressed and focus-visible stays; each use
// toggles the sidebar.
const PAGE = `<!doctype html><html><body><div id="sb" data-slot="sidebar" data-state="expanded">Sidebar</div>
<button id="t" data-slot="sidebar-trigger" data-rac="" data-react-aria-pressable="true">Toggle Sidebar</button><script>
const t = document.getElementById('t');
t.addEventListener('pointerenter', () => t.setAttribute('data-hovered', 'true'));
t.addEventListener('pointerdown', () => t.setAttribute('data-pressed', 'true'));
t.addEventListener('pointerup', () => t.removeAttribute('data-pressed'));
t.addEventListener('focus', () => t.setAttribute('data-focused', 'true'));
t.addEventListener('click', () => { const sb = document.getElementById('sb'); sb.setAttribute('data-state', sb.getAttribute('data-state') === 'expanded' ? 'collapsed' : 'expanded'); });
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

test("a React Aria trigger is a switch: its own hover, press and focus states are its part's, not what it switched", async () => {
	const dir = await mkdtemp(join(tmpdir(), 'switches-'));
	try {
		const got = await captureSwitches(browser, origin, '/', dir, ['[data-slot="sidebar-trigger"]']);
		assert.deepEqual(got.skipped, []);
		assert.deepEqual(got.switches.map((s) => s.changes.map((c) => `${c.sig.split('|')[1]} ${c.attr} ${c.before}->${c.after}`)), [['sidebar data-state expanded->collapsed']]);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});
