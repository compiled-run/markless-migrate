import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { chromium, type Browser } from 'playwright';
import { defaultEnv } from '../src/check/browser.ts';
import { explore } from '../src/check/journeys.ts';
import { VIEWPORTS } from '../src/check/types.ts';

// shadcn's direction demo: a "Toggle" popover shows a note longer than a control's name keeps, which listens for clicks itself.
const NOTE = "I used AI to translate the text for demonstration purposes. It's not perfect and may contain errors.";
const html = `<!doctype html><html lang="en"><head><title>Direction</title></head><body><main><h1>Direction</h1>
<button id="t" aria-expanded="false">Toggle</button><div id="pop" hidden><div id="note">${NOTE}</div></div><p id="said"></p></main>
<script>t.addEventListener('click', () => { pop.hidden = !pop.hidden; t.setAttribute('aria-expanded', String(!pop.hidden)); }); note.addEventListener('click', () => { said.textContent = 'noted'; });</script></body></html>`;

let browser: Browser;
let server: Server;
before(async () => {
	browser = await chromium.launch();
	server = createServer((_, res) => res.writeHead(200, { 'content-type': 'text/html' }).end(html));
	await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
});
after(async () => {
	await browser?.close();
	server?.close();
});

test('a clickable whose text is longer than the name it is recorded by is found again by that name and used', async () => {
	const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
	const { elements } = await explore(browser, defaultEnv(origin), '/', VIEWPORTS[0]!);
	const note = elements.find((e) => e.element.startsWith('clickable "I used AI'));
	assert.ok(note, elements.map((e) => e.element).join('\n'));
	assert.equal(note.reason, undefined);
	assert.match(note.by ?? '', /^click button "Toggle", then click clickable "I used AI/);
});
