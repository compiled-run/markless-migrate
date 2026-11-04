import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { chromium, type Browser } from 'playwright';
import { defaultEnv } from '../src/check/browser.ts';
import { explore } from '../src/check/journeys.ts';
import { VIEWPORTS } from '../src/check/types.ts';

// Radios drawn as Base UI's field cards: each indicator (role=radio) sits under its label's content, which a person clicks; the label drives a hidden input.
const card = (value: string, checked: boolean) => `<label for="t-${value}" style="position:relative;display:block;width:240px;height:48px;border:1px solid"><span role="radio" aria-checked="${checked}" aria-labelledby="l-${value}" style="position:absolute;left:8px;top:16px;width:16px;height:16px;border:1px solid"></span><span id="l-${value}" style="position:absolute;inset:0;padding:14px 32px">${value}</span></label><input type="radio" name="t" id="t-${value}" value="${value}" ${checked ? 'checked' : ''} style="position:absolute;width:1px;height:1px;opacity:0" tabindex="-1" aria-hidden="true">`;
const page = `<!doctype html><html lang="en"><head><title>Template</title></head><body><main><h1>Template</h1><div role="radiogroup" aria-label="Template">${card('Next.js', true)}${card('Vite', false)}${card('Astro', false)}</div></main><script>
for (const input of document.querySelectorAll('input[name=t]')) input.addEventListener('change', () => { for (const r of document.querySelectorAll('[role=radio]')) r.setAttribute('aria-checked', String(r.getAttribute('aria-labelledby') === 'l-' + input.value)); });
</script></body></html>`;

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

test('a radio whose indicator lies under its own label card is used through the label, as a person clicks the card', async () => {
	const explored = await explore(browser, defaultEnv(origin), '/', VIEWPORTS[0]!);
	const radios = explored.elements.filter((e) => /^radio "/.test(e.element));
	assert.equal(radios.length, 3, JSON.stringify(explored.elements));
	assert.deepEqual(radios.filter((e) => !e.by).map((e) => `${e.element}: ${e.reason}`), []);
	const vite = explored.journeys.find((j) => j.name === 'click radio "Vite"')!;
	assert.match(vite.expected[0]!.state?.join(' ') ?? JSON.stringify(vite.expected[0]), /aria-checked: false → true/);
});
