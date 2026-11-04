import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { chromium, type Browser } from 'playwright';
import { defaultEnv } from '../src/check/browser.ts';
import { explore } from '../src/check/journeys.ts';
import { VIEWPORTS } from '../src/check/types.ts';

// Six alike row menus, used one after another in one journey from the last; using the last one disables the one before it.
const page = `<!doctype html><html lang="en"><head><title>Rows</title></head><body><main><h1>Rows</h1><ul>${Array.from({ length: 6 }, (_, i) => `<li><span>Row ${i + 1}</span> <button onclick="${i === 5 ? 'this.closest(\'li\').previousElementSibling.querySelector(\'button\').disabled = true; ' : ''}this.nextElementSibling.textContent = 'opened'">Open menu</button><output></output></li>`).join('')}</ul></main></body></html>`;

let browser: Browser;
let server: Server;
let origin: string;
before(async () => {
	browser = await chromium.launch();
	server = createServer((_, res) => res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(page));
	origin = await new Promise((done) => server.listen(0, '127.0.0.1', () => done(`http://127.0.0.1:${(server.address() as AddressInfo).port}`)));
});
after(async () => {
	await browser?.close();
	server.closeAllConnections();
	server.close();
});

test('a control left unused because an earlier step of its journey stopped names that step and why', async () => {
	const explored = await explore(browser, defaultEnv(origin), '/', VIEWPORTS[0]!);
	const stopped = explored.elements.filter((e) => /journey stopped before it/.test(e.reason ?? ''));
	assert.ok(stopped.length, JSON.stringify(explored.elements.map((e) => `${e.element}: ${e.by ?? e.reason}`), null, 1));
	for (const e of stopped) assert.match(e.reason!, /the journey stopped before it, at step \d+ \(click button "Open menu" #\d+\): button "Open menu" #\d+ could not be used: disabled/, e.reason);
});
