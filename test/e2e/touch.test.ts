import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import { chromium } from 'playwright';
import { runCheck } from '../../src/check/run.ts';

// A menu the port opens when a mouse pointer comes over it, as hover menus filter by pointerType: a finger's tap never opens it.
const page = (open: string) => `<!doctype html><html lang="en"><head><title>Menu</title><meta name="viewport" content="width=device-width"></head><body><main><h1>Store</h1><button id="menu" aria-expanded="false">Categories</button><ul id="list" hidden><li>Shoes</li><li>Hats</li></ul></main><script>const b = document.getElementById("menu"); const show = () => { document.getElementById("list").hidden = false; b.setAttribute("aria-expanded", "true"); }; ${open}</script></body></html>`;

function serve(html: string): Promise<{ server: Server; origin: string }> {
	return new Promise((done) => {
		const server = createServer((_, res) => res.writeHead(200, { 'content-type': 'text/html' }).end(html));
		server.listen(0, '127.0.0.1', () => done({ server, origin: `http://127.0.0.1:${(server.address() as AddressInfo).port}` }));
	});
}

test('a menu that opens for a mouse pointer alone is red when a finger taps it on an iPhone in WebKit and on an Android phone in Chromium', { timeout: 300_000 }, async () => {
	const [old, next] = await Promise.all([serve(page('b.addEventListener("click", show);')), serve(page('b.addEventListener("pointerenter", (e) => { if (e.pointerType === "mouse") show(); });'))]);
	const browser = await chromium.launch();
	try {
		const route = (await runCheck({ oldOrigin: old.origin, newOrigin: next.origin, routes: ['/'], viewports: [{ name: 'desktop', width: 1280, height: 800, isMobile: false }], browser, touch: {} })).routes[0]!;
		const taps = route.failures.filter((f) => f.check.startsWith('tap '));
		assert.deepEqual(taps.map((f) => f.viewport).sort(), ['android', 'iphone'], route.failures.map((f) => `${f.check}: ${f.actual}`).join('\n'));
		const iphone = taps.find((f) => f.viewport === 'iphone')!;
		assert.equal(iphone.check, 'tap button "Categories" on an iPhone (WebKit)');
		assert.match(iphone.expected, /listitem: Hats/);
	} finally {
		await browser.close();
		old.server.close();
		next.server.close();
	}
});
