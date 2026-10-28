import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { chromium, type Browser } from 'playwright';
import { defaultEnv } from '../src/check/browser.ts';
import { compareJourneys, explore, replayAll } from '../src/check/journeys.ts';
import { VIEWPORTS } from '../src/check/types.ts';

const items = ['Magic UI', 'Aceternity', 'Origin UI', 'Kibo', 'Cult UI'];
const list = `<ul id="list">${items.map((i) => `<li>${i}</li>`).join('')}</ul>`;
const page = (body: string, script = '') => `<!doctype html><html lang="en"><head><title>Directory</title></head><body><main><h1>Directory</h1>${body}</main><script>${script}</script></body></html>`;

const SHAPES: Record<string, { old: string; dead: string }> = {
	'a search box that filters a list in place': {
		old: page(`<input placeholder="Search" aria-label="Search">${list}`, `document.querySelector('input').addEventListener('input', (e) => { const q = e.target.value.toLowerCase(); for (const li of document.querySelectorAll('li')) li.hidden = !li.textContent.toLowerCase().includes(q); });`),
		dead: page(`<input placeholder="Search" aria-label="Search">${list}`),
	},
	'a search box that filters a list and writes the query to the address': {
		old: page(`<input placeholder="Search" aria-label="Search">${list}`, `document.querySelector('input').addEventListener('input', (e) => { const q = e.target.value.toLowerCase(); history.replaceState(null, '', q ? '?q=' + encodeURIComponent(q) : location.pathname); for (const li of document.querySelectorAll('li')) li.hidden = !li.textContent.toLowerCase().includes(q); });`),
		dead: page(`<input placeholder="Search" aria-label="Search">${list}`),
	},
	'a select whose choice swaps the instructions below it': {
		old: page(`<select aria-label="Framework"><option>Next.js</option><option>Vite</option></select><pre id="steps">npx create-next-app</pre>`, `document.querySelector('select').addEventListener('change', (e) => { document.getElementById('steps').textContent = e.target.value === 'Vite' ? 'npm create vite' : 'npx create-next-app'; });`),
		dead: page(`<select aria-label="Framework"><option>Next.js</option><option>Vite</option></select><pre id="steps">npx create-next-app</pre>`),
	},
	'a button that switches the font of a preview beside a text field': {
		old: page(`<label>Name <input></label><button>Font: Inter</button><p id="preview" style="font-family: sans-serif; font-size: 32px">The quick brown fox</p>`, `document.querySelector('button').addEventListener('click', () => { const p = document.getElementById('preview'); p.style.fontFamily = p.style.fontFamily === 'serif' ? 'sans-serif' : 'serif'; });`),
		dead: page(`<label>Name <input></label><button>Font: Inter</button><p id="preview" style="font-family: sans-serif; font-size: 32px">The quick brown fox</p>`),
	},
	'a button that switches the font of a preview': {
		old: page(`<button>Font: Inter</button><p id="preview" style="font-family: sans-serif; font-size: 32px">The quick brown fox</p>`, `document.querySelector('button').addEventListener('click', (e) => { const p = document.getElementById('preview'); const serif = p.style.fontFamily === 'serif'; p.style.fontFamily = serif ? 'sans-serif' : 'serif'; });`),
		dead: page(`<button>Font: Inter</button><p id="preview" style="font-family: sans-serif; font-size: 32px">The quick brown fox</p>`),
	},
};
const DIFFERENT = 'a search box that empties the whole list';
SHAPES[DIFFERENT] = { old: SHAPES['a search box that filters a list in place']!.old, dead: page(`<input placeholder="Search" aria-label="Search">${list}`, `document.querySelector('input').addEventListener('input', () => { document.getElementById('list').replaceChildren(); });`) };
const LAYER = 'a search box that only changes a hidden layer';
SHAPES[LAYER] = { old: SHAPES['a search box that filters a list in place']!.old, dead: page(`<input placeholder="Search" aria-label="Search">${list}<div hidden data-mm-layer="x"><ul id="layer"><li>a</li></ul></div>`, `document.querySelector('input').addEventListener('input', (e) => { document.getElementById('layer').firstElementChild.textContent = e.target.value; });`) };
const RESET = 'a search box whose framework only sets a hidden input\'s attribute to the value it had';
SHAPES[RESET] = { old: SHAPES['a search box that filters a list in place']!.old, dead: page(`<input placeholder="Search" aria-label="Search"><input id="q" name="q" type="checkbox" tabindex="-1" aria-hidden="true" style="clip-path: inset(50%); position: fixed; top: 0; left: 0; width: 1px; height: 1px; margin: -1px">${list}`, `document.querySelector('input').addEventListener('input', () => { const h = document.getElementById('q'); h.removeAttribute('name'); h.setAttribute('name', 'q'); });`) };

let browser: Browser;
let server: Server;
before(async () => {
	browser = await chromium.launch();
	server = createServer((req, res) => {
		const [, side, ...rest] = new URL(req.url ?? '/', 'http://x').pathname.split('/');
		const shape = Object.values(SHAPES)[Number(rest[0])];
		const html = shape && (side === 'old' ? shape.old : side === 'new' ? shape.dead : undefined);
		return html ? res.writeHead(200, { 'content-type': 'text/html' }).end(html) : res.writeHead(404).end();
	});
	await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
});
after(async () => {
	await browser?.close();
	server?.close();
});

const run = async (i: number) => {
	const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
	const viewport = VIEWPORTS[0]!;
	const { journeys } = await explore(browser, defaultEnv(origin), `/old/${i}`, viewport);
	const olds = [await replayAll(browser, defaultEnv(origin), `/old/${i}`, viewport, journeys)];
	const next = await replayAll(browser, defaultEnv(origin), `/new/${i}`, viewport, journeys);
	return compareJourneys(`/${i}`, olds, journeys, next);
};

const EFFECTS: Record<string, { control: string; region: string }> = {
	'a search box that filters a list in place': { control: 'textbox "Search"', region: 'list in main' },
	'a search box that filters a list and writes the query to the address': { control: 'textbox "Search"', region: 'list in main' },
	'a select whose choice swaps the instructions below it': { control: 'combobox "Framework"', region: 'main' },
	'a button that switches the font of a preview': { control: 'button "Font: Inter"', region: 'main' },
	// A screenshot of the page leaves an empty style attribute on its text fields: no region the page changed on its own.
	'a button that switches the font of a preview beside a text field': { control: 'button "Font: Inter"', region: 'main' },
};

for (const name of Object.keys(EFFECTS)) {
	const i = Object.keys(SHAPES).indexOf(name);
	test(`${name}, dead on the port: red, naming the control and the region it changes on the original`, async () => {
		const failures = await run(i);
		const { control, region } = EFFECTS[name]!;
		const dead = failures.find((f) => f.actual.startsWith('nothing changed on the port'));
		assert.ok(dead, failures.map((f) => `${f.check}: ${f.actual}`).join('\n'));
		assert.ok(dead.expected.startsWith(`${control} changes ${region} on the original`), dead.expected);
	});
}

test('a port whose filter answers differently is red, but not as a control that does nothing', async () => {
	const failures = await run(Object.keys(SHAPES).indexOf(DIFFERENT));
	assert.ok(failures.length, 'the different answer is red');
	assert.deepEqual(failures.filter((f) => f.actual.startsWith('nothing changed on the port')).map((f) => f.check), []);
});

test('a hidden layer the port changes is not an answer a visitor sees: the filter is still dead', async () => {
	const failures = await run(Object.keys(SHAPES).indexOf(LAYER));
	assert.ok(failures.some((f) => f.actual.startsWith('nothing changed on the port')), failures.map((f) => `${f.check}: ${f.actual}`).join('\n'));
});

test('an attribute set again to the value it had is no change: the filter is still dead', async () => {
	const failures = await run(Object.keys(SHAPES).indexOf(RESET));
	assert.ok(failures.some((f) => f.actual.startsWith('nothing changed on the port')), failures.map((f) => `${f.check}: ${f.actual}`).join('\n'));
});
