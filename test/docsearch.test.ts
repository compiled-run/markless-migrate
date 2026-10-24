import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import { chromium } from 'playwright';
import { body, parseDocument } from '../src/convert/dom.ts';
import { bindParts, useDocSearch } from '../src/convert/parts.ts';
import { emitElement } from '../src/convert/tsrx.ts';
import { docsearchConfig } from '../src/usage/docsearch.ts';

const CONFIG = { appId: 'SM9GAGAUKZ', apiKey: '1fad8740c0cf75209d11ae25f1f6f55c', indexName: 'alpinejs' };

test('the DocSearch config is read from a page script or a theme bundle, and nothing else passes for one', () => {
	assert.deepEqual(docsearchConfig(`docsearch({ container: '#docsearch', appId: 'SM9GAGAUKZ', apiKey: '1fad8740c0cf75209d11ae25f1f6f55c', indexName: 'alpinejs' })`), CONFIG);
	assert.deepEqual(docsearchConfig('e.exports={themeConfig:{algolia:{appId:"X1Z85QJPUV",apiKey:"bf7211c161e8205da2f933a02534105a",indexName:"docusaurus-2",contextualSearch:!0}}}'), { appId: 'X1Z85QJPUV', apiKey: 'bf7211c161e8205da2f933a02534105a', indexName: 'docusaurus-2' });
	assert.equal(docsearchConfig('const search = { indexName: "posts", appId: "app", apiKey: "secret" }'), undefined, 'no Algolia application id or search key');
	assert.equal(docsearchConfig('console.log("no search here")'), undefined);
});

test('a DocSearch button gets the docsearch part with its config, and its ⌘ key a Ctrl key beside it', () => {
	const doc = parseDocument('<body><header><button type="button" class="DocSearch DocSearch-Button" aria-label="Search (Command+K)"><span class="DocSearch-Button-Keys"><kbd class="DocSearch-Button-Key">⌘</kbd><kbd class="DocSearch-Button-Key">K</kbd></span></button></header></body>');
	const uses = new Set<string>();
	useDocSearch(CONFIG);
	try {
		const out = emitElement(body(doc), { bind: (el) => bindParts(el, uses) });
		assert.ok(uses.has('docsearch'));
		assert.match(out, /<button type="button" class="DocSearch DocSearch-Button" aria-label="Search \(Command\+K\)" data-mm-docsearch=\{"\{\\"appId\\":\\"SM9GAGAUKZ\\",/);
		assert.match(out, /<kbd class="DocSearch-Button-Key" data-mm-key="apple">⌘<\/kbd><kbd class="DocSearch-Button-Key" data-mm-key="ctrl"><svg/);
		assert.match(out, /<kbd class="DocSearch-Button-Key">K<\/kbd>/, 'the K key is copied as it is');
	} finally {
		useDocSearch(undefined);
	}
	const plain = new Set<string>();
	emitElement(body(doc), { bind: (el) => bindParts(el, plain) });
	assert.ok(!plain.has('docsearch'), 'without a config in usage.json the button is copied as it is');
});

// The part in a page: its head script, and a stand-in for @docsearch/js that draws
// its own button into the container it is given and opens a dialog when that button is clicked.
async function serve(): Promise<{ origin: string; close: () => void; loads: () => number }> {
	let loads = 0;
	const page = `<!doctype html><html><head><script>${'${SCRIPT}'}</script></head><body>
<button type="button" class="DocSearch DocSearch-Button" aria-label="Search (Command+K)" data-mm-docsearch='${JSON.stringify({ ...CONFIG, src: '/docsearch.js' })}'><span>Search</span><kbd class="DocSearch-Button-Key" data-mm-key="apple">⌘</kbd><kbd class="DocSearch-Button-Key" data-mm-key="ctrl">Ctrl</kbd><kbd class="DocSearch-Button-Key">K</kbd></button>
<input id="field">
</body></html>`;
	const server = createServer(async (req, res) => {
		if (req.url === '/docsearch.js') {
			loads++;
			// DocSearch takes a while to arrive, so a press made meanwhile is waiting for it.
			await new Promise((resolve) => setTimeout(resolve, 400));
			return void res.writeHead(200, { 'content-type': 'text/javascript' }).end(`window.docsearch = (o) => { const b = document.createElement('button'); b.className = 'DocSearch-Button'; b.onclick = () => { const d = document.createElement('div'); d.className = 'DocSearch-Modal'; d.textContent = 'search ' + o.indexName; document.body.append(d); }; o.container.append(b); };`);
		}
		const script = (await import('../parts/docsearch.ts')).DOCSEARCH_SCRIPT;
		res.writeHead(200, { 'content-type': 'text/html' }).end(page.replace('${SCRIPT}', script));
	});
	await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
	return { origin: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, close: () => (server.closeAllConnections(), server.close()), loads: () => loads };
}

test('DocSearch loads on the first intent, a press made while it loads opens it, and off Apple platforms the button says Ctrl+K', async () => {
	const site = await serve();
	const browser = await chromium.launch();
	try {
		for (const platform of ['MacIntel', 'Win32']) {
			const context = await browser.newContext();
			await context.addInitScript((p) => Object.defineProperty(navigator, 'platform', { get: () => p }), platform);
			const page = await context.newPage();
			await page.goto(site.origin);
			const before = site.loads();
			assert.equal(await page.locator('.DocSearch-Modal').count(), 0);
			const keys = await page.evaluate(() => [...document.querySelectorAll('[data-mm-key]')].filter((k) => getComputedStyle(k).display !== 'none').map((k) => k.getAttribute('data-mm-key')));
			const label = await page.locator('[data-mm-docsearch]').getAttribute('aria-label');
			if (platform === 'MacIntel') {
				assert.deepEqual(keys, ['apple']);
				assert.equal(label, 'Search (Command+K)');
				// A press before DocSearch is there opens it once it has loaded.
				await page.locator('[data-mm-docsearch]').click();
			} else {
				assert.deepEqual(keys, ['ctrl']);
				assert.equal(label, 'Search (Ctrl+K)');
				await page.locator('#field').focus();
				await page.keyboard.press('Control+k');
			}
			await page.locator('.DocSearch-Modal').waitFor({ timeout: 5000 });
			assert.equal(await page.locator('.DocSearch-Modal').textContent(), 'search alpinejs');
			assert.equal(site.loads() - before, 1, 'DocSearch is fetched once, when it is first asked for');
			await context.close();
		}
		const context = await browser.newContext();
		const page = await context.newPage();
		const before = site.loads();
		await page.goto(site.origin);
		await page.waitForTimeout(300);
		assert.equal(site.loads(), before, 'nothing loads DocSearch before an intent');
		await page.locator('[data-mm-docsearch]').hover();
		await page.waitForTimeout(800);
		assert.equal(site.loads(), before + 1, 'the pointer over the button loads it');
		assert.equal(await page.locator('.DocSearch-Modal').count(), 0, 'without opening it');
		await context.close();
	} finally {
		await browser.close();
		site.close();
	}
});

test('a DocSearch 4 button, which says aria-keyshortcuts and draws its keys once mounted, gets both keys and its own name off Apple platforms', () => {
	const doc = parseDocument('<body><header><button type="button" class="DocSearch DocSearch-Button" aria-label="Search (Meta+k)" aria-keyshortcuts="Meta+k"><span class="DocSearch-Button-Container"><span class="DocSearch-Button-Placeholder">Search</span></span><span class="DocSearch-Button-Keys"></span></button></header></body>');
	const uses = new Set<string>();
	useDocSearch(CONFIG);
	try {
		const out = emitElement(body(doc), { bind: (el) => bindParts(el, uses) });
		assert.match(out, /data-mm-docsearch-keys=\{"\{\\"label\\":\\"Search \(Control\+k\)\\",\\"shortcut\\":\\"Control\+k\\"\}"\}/);
		assert.match(out, /<span class="DocSearch-Button-Keys"><kbd class="DocSearch-Button-Key" data-mm-key="apple">⌘<\/kbd><kbd class="DocSearch-Button-Key DocSearch-Button-Key--ctrl" data-mm-key="ctrl">Ctrl<\/kbd><kbd class="DocSearch-Button-Key">K<\/kbd><\/span>/);
	} finally {
		useDocSearch(undefined);
	}
});

test('before the first paint, a DocSearch 4 button shows ⌘ and its Mac name on Apple platforms, and Ctrl with "Search (Control+k)" elsewhere', async () => {
	const { DOCSEARCH_SCRIPT, APPLE_KEY, CTRL_KEYS } = await import('../parts/docsearch.ts');
	const keys = JSON.stringify({ label: CTRL_KEYS[4].label, shortcut: CTRL_KEYS[4].shortcut });
	const html = `<!doctype html><html><head><script>${DOCSEARCH_SCRIPT}</script></head><body><button type="button" class="DocSearch DocSearch-Button" aria-label="Search (Meta+k)" aria-keyshortcuts="Meta+k" data-mm-docsearch-keys='${keys}'><span class="DocSearch-Button-Keys">${APPLE_KEY}${CTRL_KEYS[4].key}<kbd class="DocSearch-Button-Key">K</kbd></span></button></body></html>`;
	const browser = await chromium.launch();
	try {
		for (const [platform, shown, label, shortcut] of [['MacIntel', 'apple', 'Search (Meta+k)', 'Meta+k'], ['Win32', 'ctrl', 'Search (Control+k)', 'Control+k'], ['Linux x86_64', 'ctrl', 'Search (Control+k)', 'Control+k']] as const) {
			const context = await browser.newContext();
			await context.addInitScript((p) => Object.defineProperty(navigator, 'platform', { get: () => p }), platform);
			const page = await context.newPage();
			await page.setContent(html);
			const visible = await page.evaluate(() => [...document.querySelectorAll('[data-mm-key]')].filter((k) => getComputedStyle(k).display !== 'none').map((k) => `${k.getAttribute('data-mm-key')}:${k.textContent}`));
			assert.deepEqual(visible, [shown === 'apple' ? 'apple:⌘' : 'ctrl:Ctrl'], platform);
			assert.equal(await page.locator('button').getAttribute('aria-label'), label, platform);
			assert.equal(await page.locator('button').getAttribute('aria-keyshortcuts'), shortcut, platform);
			// An in-place navigation that keeps the button writes the server's name again; it is relabelled.
			await page.evaluate(() => {
				const b = document.querySelector('button')!;
				b.setAttribute('aria-label', 'Search (Meta+k)');
				b.setAttribute('aria-keyshortcuts', 'Meta+k');
			});
			await page.waitForFunction((l) => document.querySelector('button')!.getAttribute('aria-label') === l, label);
			assert.equal(await page.locator('button').getAttribute('aria-keyshortcuts'), shortcut, `${platform} after a morph`);
			// An in-place navigation replaces the head: the keys stay one per platform.
			await page.evaluate(() => document.head.replaceChildren());
			await page.waitForTimeout(50);
			const after = await page.evaluate(() => [...document.querySelectorAll('[data-mm-key]')].filter((k) => getComputedStyle(k).display !== 'none').map((k) => k.getAttribute('data-mm-key')));
			assert.deepEqual(after, [shown], `${platform} after the head is replaced`);
			if (shown === 'ctrl') assert.equal(await page.locator('[data-mm-key="ctrl"]').evaluate((k) => Math.round((parseFloat(getComputedStyle(k).marginInlineEnd) / parseFloat(getComputedStyle(k).fontSize)) * 10) / 10), 0.4, 'the visible Ctrl key keeps the first key\'s 0.4em gap');
			await context.close();
		}
	} finally {
		await browser.close();
	}
});

// A page that carries DocSearch's dialog as the old site first draws it, and a stand-in DocSearch that draws the same
// dialog when opened and echoes the query it is given.
const SHELL = '<div class="DocSearch DocSearch-Container" role="button"><div class="DocSearch-Modal"><header class="DocSearch-SearchBar"><form class="DocSearch-Form"><input class="DocSearch-Input" type="search" placeholder="Search docs"></form><button type="reset" class="DocSearch-Cancel">Cancel</button></header><div class="DocSearch-Dropdown"><div class="DocSearch-StartScreen"><p class="DocSearch-Help">No recent searches</p></div></div></div></div>';

test('a press before DocSearch arrives shows its dialog at once, typing goes into it, and DocSearch takes over with the query and focus, with a dialog on screen every frame', async () => {
	const { DOCSEARCH_SCRIPT, shellScript } = await import('../parts/docsearch.ts');
	const page = `<!doctype html><html><head><script>${DOCSEARCH_SCRIPT}</script><script type="text/html" data-mm-docsearch-shell>${shellScript(SHELL)}</script></head><body>
<button type="button" class="DocSearch DocSearch-Button" data-mm-docsearch='${JSON.stringify({ ...CONFIG, src: '/docsearch.js' })}'>Search</button>
</body></html>`;
	const server = createServer(async (req, res) => {
		if (req.url === '/docsearch.js') {
			await new Promise((resolve) => setTimeout(resolve, 1500));
			return void res.writeHead(200, { 'content-type': 'text/javascript' }).end(`window.docsearch = (o) => { const b = document.createElement('button'); b.className = 'DocSearch-Button'; b.onclick = () => { const t = document.createElement('div'); t.innerHTML = ${JSON.stringify(SHELL)}; const c = t.firstElementChild; c.setAttribute('data-real', ''); const i = c.querySelector('input'); i.addEventListener('input', () => { window.__query = i.value; }); document.body.append(c); document.body.classList.add('DocSearch--active'); setTimeout(() => i.focus()); }; o.container.append(b); };`);
		}
		res.writeHead(200, { 'content-type': 'text/html' }).end(page);
	});
	await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
	const browser = await chromium.launch();
	try {
		const tab = await browser.newPage();
		await tab.goto(`http://127.0.0.1:${(server.address() as AddressInfo).port}/`);
		await tab.evaluate(() => {
			const w = window as unknown as { __frames: number[] };
			w.__frames = [];
			const tick = () => {
				if (document.body.classList.contains('DocSearch--active')) w.__frames.push(document.querySelectorAll('.DocSearch-Modal').length);
				requestAnimationFrame(tick);
			};
			requestAnimationFrame(tick);
		});
		await tab.locator('[data-mm-docsearch]').click();
		assert.ok(await tab.evaluate(() => document.body.classList.contains('DocSearch--active')), 'the dialog is on screen at once');
		assert.equal(await tab.evaluate(() => (document.activeElement as HTMLElement | null)?.className), 'DocSearch-Input', 'its input has the focus');
		await tab.keyboard.type('mod');
		await tab.locator('[data-real] .DocSearch-Input').waitFor({ timeout: 5000 });
		await tab.waitForTimeout(100);
		assert.equal(await tab.locator('.DocSearch-Container').count(), 1, 'the shell is gone once DocSearch draws its own');
		assert.equal(await tab.evaluate(() => (window as unknown as { __query?: string }).__query), 'mod', 'DocSearch got the query typed into the shell');
		assert.equal(await tab.locator('[data-real] .DocSearch-Input').inputValue(), 'mod');
		await tab.keyboard.type('el');
		assert.equal(await tab.locator('[data-real] .DocSearch-Input').inputValue(), 'model', 'typing goes on in DocSearch\'s own input');
		const frames = await tab.evaluate(() => (window as unknown as { __frames: number[] }).__frames);
		assert.ok(frames.length > 0 && frames.every((n) => n >= 1), `a dialog in every frame: ${JSON.stringify(frames.slice(0, 40))}`);
		// Escape on the shell closes it, and a later press opens it again.
		const again = await browser.newPage();
		await again.goto(`http://127.0.0.1:${(server.address() as AddressInfo).port}/`);
		await again.locator('[data-mm-docsearch]').click();
		await again.keyboard.press('Escape');
		assert.equal(await again.locator('.DocSearch-Container').count(), 0);
		assert.ok(!(await again.evaluate(() => document.body.classList.contains('DocSearch--active'))));
	} finally {
		await browser.close();
		server.closeAllConnections();
		server.close();
	}
});
