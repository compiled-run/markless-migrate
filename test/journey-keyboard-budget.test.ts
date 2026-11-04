import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { chromium, type Browser } from 'playwright';
import { defaultEnv } from '../src/check/browser.ts';
import { explore } from '../src/check/journeys.ts';
import { VIEWPORTS } from '../src/check/types.ts';

// A customizer: 70 buttons of one toolbar, and two stand-alone ones; with Enter and Space each, their keyboard paths outnumber the 1.5 a control the cap gives.
const TOOLS = 70;
const page = `<!doctype html><html lang="en"><head><title>Customize</title></head><body><main><h1>Customize</h1><div role="toolbar" aria-label="Options">${Array.from({ length: TOOLS }, (_, i) => `<button onclick="this.textContent = 'Option ${i} chosen'">Option ${i}</button>`).join('')}</div><button onclick="this.textContent='Saved'">Save</button><button onclick="this.textContent='Reset done'">Reset</button></main></body></html>`;

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

test("every control's keyboard paths run: alike ones pressed in turn in one journey each key, the rest alone, none left out of the budget", async () => {
	const explored = await explore(browser, defaultEnv(origin), '/', VIEWPORTS[0]!);
	assert.equal(explored.skipped, 0, 'no keyboard path left out');
	const names = explored.journeys.map((j) => j.name);
	for (const key of ['Enter', 'Space']) {
		const turn = explored.journeys.find((j) => j.name.startsWith(`press ${key} on button "Option 0" and ${TOOLS - 1} more alike, each in turn`));
		assert.ok(turn, `${key}: ${JSON.stringify(names.filter((n) => n.startsWith('press')).slice(0, 6))}`);
		assert.equal(turn.expected.filter((r) => !r.failed).length, TOOLS, 'each member pressed and compared');
	}
	assert.ok(names.includes('press Enter on button "Save"') && names.includes('press Space on button "Reset"'), 'a control in no holder is pressed alone');
});
