import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { chromium, type Browser } from 'playwright';
import { defaultEnv } from '../src/check/browser.ts';
import { explore } from '../src/check/journeys.ts';
import { VIEWPORTS } from '../src/check/types.ts';

let browser: Browser;
let server: Server;
let origin: string;
before(async () => {
	browser = await chromium.launch();
	server = createServer((_, res) => res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end('<!doctype html><html lang="en"><title>Questionnaire</title><main><h1>Questionnaire</h1><form onsubmit="event.preventDefault(); this.nextElementSibling.textContent = \'Sent\'"><label>Answer <input name="action"></label><button>Send</button></form><p></p></main></html>'));
	origin = await new Promise((done) => server.listen(0, '127.0.0.1', () => done(`http://127.0.0.1:${(server.address() as AddressInfo).port}`)));
});
after(async () => {
	await browser?.close();
	server.closeAllConnections();
	server.close();
});

test('a form with a control named "action" is explored: its action is read from the form, not from the control that shadows it', async () => {
	const explored = await explore(browser, defaultEnv(origin), '/', VIEWPORTS[0]!);
	assert.ok(explored.journeys.some((j) => j.steps.some((s) => s.action === 'submit')), JSON.stringify(explored.journeys.map((j) => j.name)));
});
