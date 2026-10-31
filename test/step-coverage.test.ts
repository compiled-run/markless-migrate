// Exploring the original records, per journey, how many blocks of its code the journey ran that no journey before it
// in the plan had: the measure that shows a repeated use reaching nothing new and a new path reaching new code.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import { chromium } from 'playwright';
import { defaultEnv } from '../src/check/browser.ts';
import { explore } from '../src/check/journeys.ts';

const js = `function open(out) { out.textContent = 'opened ' + Date.now(); }
function sort(out) { const items = ['b', 'c', 'a']; items.sort(); for (let i = 0; i < 3; i++) { if (items[i] > 'a') out.textContent += items[i]; else out.textContent = items[i]; } }
const go = () => open(document.querySelector('#out'));
document.querySelector('#a').onclick = go;
document.querySelector('#b').onclick = () => sort(document.querySelector('#out'));
document.querySelector('#c').onclick = go;`;
const html = `<!doctype html><main><button id="a">Open</button><button id="b">Sort</button><button id="c">Open again</button><p id="out"></p></main><script src="/app.js"></script>`;

test("a journey's new code is what it ran first in the plan: a second button calling the same handler adds nothing", async () => {
	const server = createServer((req, res) => (req.url === '/app.js' ? res.writeHead(200, { 'content-type': 'text/javascript' }).end(js) : res.writeHead(200, { 'content-type': 'text/html' }).end(html)));
	await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
	const browser = await chromium.launch();
	try {
		const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
		const read = async () => {
			const { journeys } = await explore(browser, defaultEnv(origin), '/', { name: 'desktop', width: 1280, height: 800, isMobile: false }, { maxJourneys: 3 });
			return Object.fromEntries(journeys.map((j) => [j.name, j.newCode]));
		};
		const first = await read();
		assert.ok((first['click button "Open"'] ?? 0) > 0, JSON.stringify(first));
		assert.ok((first['click button "Sort"'] ?? 0) > 0, JSON.stringify(first));
		assert.equal(first['click button "Open again"'], 0, JSON.stringify(first));
		assert.deepEqual(await read(), first, 'the same counts on another run');
	} finally {
		await browser.close();
		server.close();
	}
});

test('pruning keeps every element its first journey and leaves out later ones that reach no new code', async () => {
	const page = `<!doctype html><main>${Array.from({ length: 6 }, (_, i) => `<button class="b">Item ${i}</button>`).join('')}<p id="out"></p></main><script src="/app.js"></script>`;
	const code = `const out = document.querySelector('#out'); const go = (e) => { out.textContent = e.target.textContent; }; for (const b of document.querySelectorAll('.b')) b.onclick = go;`;
	const server = createServer((req, res) => (req.url === '/app.js' ? res.writeHead(200, { 'content-type': 'text/javascript' }).end(code) : res.writeHead(200, { 'content-type': 'text/html' }).end(page)));
	await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
	const browser = await chromium.launch();
	try {
		const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
		const viewport = { name: 'desktop', width: 1280, height: 800, isMobile: false };
		const full = await explore(browser, defaultEnv(origin), '/', viewport, {});
		const pruned = await explore(browser, defaultEnv(origin), '/', viewport, { prune: true });
		const used = (x: typeof full) => new Set(x.journeys.map((j) => j.steps.at(-1)!.target.name));
		assert.deepEqual(used(pruned), used(full), 'every element still has a journey');
		assert.ok(pruned.journeys.length < full.journeys.length, `${pruned.journeys.length} of ${full.journeys.length}`);
		assert.equal(pruned.pruned, full.journeys.length - pruned.journeys.length);
	} finally {
		await browser.close();
		server.close();
	}
});
