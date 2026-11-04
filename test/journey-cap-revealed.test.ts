import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { chromium, type Browser } from 'playwright';
import { defaultEnv } from '../src/check/browser.ts';
import { explore } from '../src/check/journeys.ts';
import { VIEWPORTS } from '../src/check/types.ts';

// A tool behind a first-visit dialog: at load only "Get Started" is usable; it uncovers 60 controls, more than the 60-journey minimum leaves room for.
const TOOLS = 60;
const page = `<!doctype html><html lang="en"><head><title>Create</title></head><body><div id="app" aria-hidden="true"><main><h1>Create</h1>${Array.from({ length: TOOLS }, (_, i) => `<button onclick="this.textContent='Tool ${i} on'">Tool ${i}</button>`).join('')}</main></div><div role="dialog" aria-modal="true" aria-label="Welcome" id="hello"><p>Build your own</p><button onclick="document.getElementById('hello').remove(); document.getElementById('app').removeAttribute('aria-hidden')">Get Started</button></div></body></html>`;

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

test('controls a step reveals count toward the journey budget: what a first-visit dialog uncovers is explored, not left out of the budget', async () => {
	const explored = await explore(browser, defaultEnv(origin), '/', VIEWPORTS[0]!);
	const left = explored.elements.filter((e) => /out of the journey budget/.test(e.reason ?? ''));
	assert.deepEqual(left.map((e) => e.element), []);
	assert.equal(explored.elements.filter((e) => /^button "Tool \d+"/.test(e.element) && e.by).length, TOOLS);
});
