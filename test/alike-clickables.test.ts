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

// A story list whose "hide" spans each send a signed-out visitor to the login page, as Hacker News does.
const stories = Array.from({ length: 8 }, (_, i) => `<p>story ${i + 1} <span class="hide" data-n="${i + 1}">hide</span></p>`).join('');
const leaving = `<!doctype html><html lang="en"><head><title>Stories</title></head><body><main>${stories}</main>
<script>for (const h of document.querySelectorAll('.hide')) h.addEventListener('click', () => { location.href = '/login?hide=' + h.dataset.n; });</script></body></html>`;
const login = '<!doctype html><html lang="en"><head><title>Login</title></head><body><main><h1>Login</h1></main></body></html>';

let browser: Browser;
let server: Server;
before(async () => {
	browser = await chromium.launch();
	server = createServer((req, res) => {
		const path = new URL(req.url ?? '/', 'http://x').pathname;
		const page = path === '/' ? html : path === '/stories' ? leaving : path === '/login' ? login : undefined;
		return page ? res.writeHead(200, { 'content-type': 'text/html' }).end(page) : res.writeHead(404).end();
	});
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

test('alike clickables that each leave the page are still each used: the rest of the turn starts again from the page', async () => {
	const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
	const { elements } = await explore(browser, defaultEnv(origin), '/stories', VIEWPORTS[0]!);
	const hides = elements.filter((e) => /^clickable "hide"/.test(e.element));
	assert.equal(hides.length, 8);
	assert.deepEqual(hides.filter((e) => !e.journeys?.length && !e.by).map((e) => `${e.element}: ${e.reason}`), [], 'every hide is used by a journey');
});
