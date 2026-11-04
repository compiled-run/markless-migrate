import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { chromium, type Browser } from 'playwright';
import { defaultEnv } from '../src/check/browser.ts';
import { explore } from '../src/check/journeys.ts';
import { VIEWPORTS } from '../src/check/types.ts';

// Each button reveals the next: "Step 6" is reached by a person in six clicks, "Step 7" only in seven.
const page = `<!doctype html><html lang="en"><head><title>Wizard</title></head><body><main><h1>Wizard</h1>${Array.from({ length: 8 }, (_, i) => `<button id="s${i + 1}" ${i ? 'hidden' : ''} onclick="${i < 7 ? `document.getElementById('s${i + 2}').hidden = false; ` : ''}this.dataset.done = 'yes'">Step ${i + 1}</button>`).join('')}</main></body></html>`;

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

test('a path that keeps revealing controls is explored up to six steps; past that its controls are reported as known uncovered', async () => {
	const explored = await explore(browser, defaultEnv(origin), '/', VIEWPORTS[0]!);
	const step = (n: number) => explored.elements.find((e) => new RegExp(`^button "Step ${n}"`).test(e.element))!;
	for (const n of [5, 6]) assert.ok(step(n).by, `${step(n).element}: ${step(n).reason}`);
	for (const n of [7]) assert.match(step(n)?.reason ?? 'not tracked', /known uncovered: it appears only after \d+ steps/);
});
