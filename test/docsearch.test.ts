import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { stripTypeScriptTypes } from 'node:module';
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

// The part in a page: the document listeners the converted root installs, and a stand-in for @docsearch/js that draws
// its own button into the container it is given and opens a dialog when that button is clicked.
async function serve(): Promise<{ origin: string; close: () => void; loads: () => number }> {
	const part = stripTypeScriptTypes(await readFile(new URL('../parts/docsearch.ts', import.meta.url), 'utf8'));
	let loads = 0;
	const page = `<!doctype html><html><head><script>${'${PLATFORM}'}</script></head><body>
<button type="button" class="DocSearch DocSearch-Button" aria-label="Search (Command+K)" data-mm-docsearch='${JSON.stringify({ ...CONFIG, src: '/docsearch.js' })}'><span>Search</span><kbd class="DocSearch-Button-Key" data-mm-key="apple">⌘</kbd><kbd class="DocSearch-Button-Key" data-mm-key="ctrl">Ctrl</kbd><kbd class="DocSearch-Button-Key">K</kbd></button>
<input id="field">
<script type="module">
import * as part from '/part.js';
for (const type of ['pointerover', 'pointerdown', 'focusin', 'click', 'keydown']) document.addEventListener(type, (event) => part[type]?.(event.target, event));
</script></body></html>`;
	const server = createServer(async (req, res) => {
		if (req.url === '/part.js') return void res.writeHead(200, { 'content-type': 'text/javascript' }).end(part);
		if (req.url === '/docsearch.js') {
			loads++;
			// DocSearch takes a while to arrive, so a press made meanwhile is waiting for it.
			await new Promise((resolve) => setTimeout(resolve, 400));
			return void res.writeHead(200, { 'content-type': 'text/javascript' }).end(`window.docsearch = (o) => { const b = document.createElement('button'); b.className = 'DocSearch-Button'; b.onclick = () => { const d = document.createElement('div'); d.className = 'DocSearch-Modal'; d.textContent = 'search ' + o.indexName; document.body.append(d); }; o.container.append(b); };`);
		}
		const platform = (await import('../parts/docsearch.ts')).PLATFORM_KEYS_SCRIPT;
		res.writeHead(200, { 'content-type': 'text/html' }).end(page.replace('${PLATFORM}', platform));
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
	const { PLATFORM_KEYS_SCRIPT, APPLE_KEY, CTRL_KEYS } = await import('../parts/docsearch.ts');
	const keys = JSON.stringify({ label: CTRL_KEYS[4].label, shortcut: CTRL_KEYS[4].shortcut });
	const html = `<!doctype html><html><head><script>${PLATFORM_KEYS_SCRIPT}</script></head><body><button type="button" class="DocSearch DocSearch-Button" aria-label="Search (Meta+k)" aria-keyshortcuts="Meta+k" data-mm-docsearch-keys='${keys}'><span class="DocSearch-Button-Keys">${APPLE_KEY}${CTRL_KEYS[4].key}<kbd class="DocSearch-Button-Key">K</kbd></span></button></body></html>`;
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
			await context.close();
		}
	} finally {
		await browser.close();
	}
});
