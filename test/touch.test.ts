import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import { chromium } from 'playwright';
import { runCheck } from '../src/check/run.ts';
import { judgeTouch, type Tap } from '../src/check/touch-compare.ts';

const page = (script: string) => `<!doctype html><html lang="en"><head><title>Touch</title><meta name="viewport" content="width=device-width"></head><body><main><h1>Plans</h1><button id="details">Show details</button><button id="both">Show price</button><p id="out"></p><p id="price"></p></main><script>${script}document.getElementById("both").addEventListener("click", () => { document.getElementById("price").textContent = "Price: 10 EUR"; });</script></body></html>`;
// The port answers the mouse only: a pointerdown handler that ignores touch, so a finger's tap does nothing.
const OLD = page('document.getElementById("details").addEventListener("click", () => { document.getElementById("out").textContent = "Details shown"; });');
const NEW = page('document.getElementById("details").addEventListener("pointerdown", (e) => { if (e.pointerType === "mouse") document.getElementById("out").textContent = "Details shown"; });');

function serve(html: string): Promise<{ server: Server; origin: string }> {
	return new Promise((done) => {
		const server = createServer((_, res) => res.writeHead(200, { 'content-type': 'text/html' }).end(html));
		server.listen(0, '127.0.0.1', () => done({ server, origin: `http://127.0.0.1:${(server.address() as AddressInfo).port}` }));
	});
}

test('a control that answers a mouse click but not a finger tap is red on the phone, and one that answers both is not', { timeout: 300_000 }, async () => {
	const [old, next] = await Promise.all([serve(OLD), serve(NEW)]);
	const browser = await chromium.launch();
	try {
		const route = (await runCheck({ oldOrigin: old.origin, newOrigin: next.origin, routes: ['/'], viewports: [{ name: 'desktop', width: 1280, height: 800, isMobile: false }], browser, touch: { profiles: ['android'] } })).routes[0]!;
		const taps = route.failures.filter((f) => f.check.startsWith('tap '));
		assert.deepEqual(taps.map((f) => `${f.check} (${f.viewport}): ${f.actual}`), ['tap button "Show details" on an Android phone (Chromium) (android): nothing changes: button "Show details" answers a mouse click but not a tap']);
		assert.equal(route.failures.filter((f) => f.dimension === 'behaviour' && !f.check.startsWith('tap ')).length, 0, 'the desktop click answers alike on both sides');
	} finally {
		await browser.close();
		old.server.close();
		next.server.close();
	}
});

test('what the old page varies between two taps is not held against the port', () => {
	const tap = (added: string[]): Tap => ({ url: '/', navigated: false, added, removed: [] });
	const target = { role: 'button', name: 'Roll', nth: 0 };
	const row = { profiles: [{ profile: 'android' as const, controls: [{ targets: [target], old: [[tap(['- paragraph: Rolled', '- paragraph: 4'])], [tap(['- paragraph: Rolled', '- paragraph: 2'])]], new: [tap(['- paragraph: Rolled', '- paragraph: 5'])] }] }] };
	assert.deepEqual(judgeTouch('/', row), []);
	const silent = { profiles: [{ profile: 'android' as const, controls: [{ targets: [target], old: [[tap(['- paragraph: Rolled'])], [tap(['- paragraph: Rolled'])]], new: [tap([])] }] }] };
	assert.equal(judgeTouch('/', silent).length, 1);
	// What a control reveals is tapped too: a menu item the port answers only for a mouse is red at that tap, named after the taps that led to it.
	const item = { role: 'menuitem', name: 'Archive', nth: 0 };
	const nested = { profiles: [{ profile: 'android' as const, controls: [{ targets: [target, item], old: [[tap(['- menu']), tap(['- paragraph: Archived'])]], new: [tap(['- menu']), tap([])] }] }] };
	assert.deepEqual(judgeTouch('/', nested).map((f) => f.check), ['tap button "Roll", then tap menuitem "Archive" on an Android phone (Chromium)']);
});
