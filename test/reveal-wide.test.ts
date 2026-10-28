// A control a page shows only on wide screens (shadcn's home Payout card, from 1440 px) is still used once, at a wide
// viewport, when neither the desktop nor the phone viewport shows it.
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { chromium, type Browser } from 'playwright';
import { captureRouteReveals } from '../src/convert/reveal.ts';

const PAGE = `<!doctype html><html><head><style>.wide-only{display:none}@media (min-width:1440px){.wide-only{display:block}}</style></head><body>
<button id="always" aria-expanded="false">Menu</button>
<div class="wide-only"><button id="currency" aria-expanded="false" aria-haspopup="listbox">USD</button></div>
<script>
for (const id of ['always', 'currency']) document.getElementById(id).addEventListener('click', (event) => {
	event.currentTarget.setAttribute('aria-expanded', 'true');
	const list = Object.assign(document.createElement('div'), { role: 'listbox' });
	list.innerHTML = '<div role="option">' + id + ' option</div>';
	document.body.append(list);
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

test('a control only a wide screen shows is used at a wide viewport; one the desktop shows is not used again', async () => {
	const dir = await mkdtemp(join(tmpdir(), 'reveal-wide-'));
	try {
		const { reveals } = await captureRouteReveals(browser, origin, '/', dir);
		const by = (key: string) => reveals.filter((r) => r.key === key).map((r) => `${r.viewport}:${r.added.map((a) => a.html).join('')}`);
		assert.deepEqual(by('currency'), ['wide:<div role="option">currency option</div>'].map((s) => s.replace(':', ':<div role="listbox">') + '</div>'));
		assert.deepEqual(by('always').map((s) => s.split(':')[0]), ['desktop']);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});
