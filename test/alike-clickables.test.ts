import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { chromium, type Browser } from 'playwright';
import { defaultEnv } from '../src/check/browser.ts';
import { explore } from '../src/check/journeys.ts';
import { VIEWPORTS } from '../src/check/types.ts';

// A comment thread: every comment's "[-]" is a span with its own click listener that folds that comment and its replies away.
const comment = (n: number, reply = '') => `<div class="c"><span class="t">[-]</span><div class="body"><p>comment ${n}</p>${reply}</div></div>`;
const comments = Array.from({ length: 6 }, (_, i) => comment(2 * i + 1, comment(2 * i + 2))).join('');
const html = `<!doctype html><html lang="en"><head><title>Thread</title></head><body><main>${comments}</main>
<script>for (const t of document.querySelectorAll('.t')) t.addEventListener('click', () => { const p = t.nextElementSibling; p.hidden = !p.hidden; t.textContent = p.hidden ? '[+1]' : '[-]'; });</script></body></html>`;

let browser: Browser;
let server: Server;
before(async () => {
	browser = await chromium.launch();
	server = createServer((req, res) => (req.url === '/' ? res.writeHead(200, { 'content-type': 'text/html' }).end(html) : res.writeHead(404).end()));
	await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
});
after(async () => {
	await browser?.close();
	server?.close();
});

test('clickable elements alike in name and kind (a comment thread\'s "[-]") are each used, the rest of them in turn in one session rather than one page load each', async () => {
	const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
	const { journeys, elements } = await explore(browser, defaultEnv(origin), '/', VIEWPORTS[0]!);
	const toggles = elements.filter((e) => /^clickable "\[-\]"/.test(e.element));
	assert.equal(toggles.length, 12);
	assert.deepEqual(toggles.filter((e) => !e.journeys?.length && !e.by).map((e) => `${e.element}: ${e.reason}`), [], 'every toggle is used by a journey');
	const batch = journeys.find((j) => /and \d+ more alike, each in turn/.test(j.name));
	assert.ok(batch, journeys.map((j) => j.name).join('\n'));
	assert.equal(batch.steps.length, 10, 'the first two are used on their own, the other ten in turn');
	assert.ok(journeys.filter((j) => /^click clickable "\[-\]"/.test(j.name) && !j.name.includes("more alike")).length <= 3, journeys.map((j) => j.name).join('\n'));
});
