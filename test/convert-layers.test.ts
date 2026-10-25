import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';
import { chromium } from 'playwright';
import ts from 'typescript';
import { atRest } from '../src/convert/at-rest.ts';
import { body, find, outer, parseDocument, walk } from '../src/convert/dom.ts';
import { LAYER_FILL, layerTable, SERVED_LAYER_BYTES } from '../src/convert/document.ts';
import { APP_URL_TOKEN, emitElement, emitHtml, useOrigin } from '../src/convert/tsrx.ts';

const ROOT = join(import.meta.dirname, '..');

test('a layer as HTML is the markup its tsrx renders: collapsed text, the old origin as the token, no style', () => {
	useOrigin('https://old.example');
	const doc = parseDocument(`<body><div role="dialog" hidden data-mm-layer="k" class="a  b"><style>.x{}</style><p>Open   in
	v0 <a href="https://v0.dev/open?url=https://old.example/r/x.json">here</a> &amp; &lt;now&gt;</p><img src="/a.png" alt=""><input value="a&quot;b"></div></body>`);
	const el = find(body(doc), (e) => e.tagName === 'div')!;
	assert.equal(
		emitHtml(el, { extra: ['data-mm-side-offset="4"'] }),
		`<div role="dialog" hidden data-mm-layer="k" class="a  b" data-mm-side-offset="4"><p>Open in v0 <a href="https://v0.dev/open?url=${APP_URL_TOKEN}/r/x.json">here</a> &amp; &lt;now&gt;</p><img src="/a.png" alt=""><input value="a&quot;b"></div>`,
	);
	assert.match(emitElement(el), /APP_URL/);
	useOrigin(undefined);
});

test('a layer from SERVED_LAYER_BYTES up is its shell in the page and its content in a file fetched as the page loads; a small one stays inline', () => {
	const big = `<div data-mm-layer="search" hidden><input /><div data-mm-layer-fill="${LAYER_FILL}"></div></div>`.padEnd(SERVED_LAYER_BYTES + 10, ' ');
	const shell = `<div data-mm-layer="search" hidden><input /><div data-mm-layer-fill="${LAYER_FILL}"></div></div>`;
	const fill = `<p>${'x'.repeat(SERVED_LAYER_BYTES)}</p>`;
	const small = '<div data-mm-layer="tip" hidden>tip</div>';
	const table = layerTable(
		new Map([
			['/', [{ key: 'search', markup: big, shell, fill }, { key: 'tip', markup: small, shell: small, fill: '' }]],
			['/b', [{ key: 'search', markup: big, shell, fill }]],
		]),
	);
	assert.deepEqual(table.served.map((s) => s.html), [fill]);
	const path = table.served[0]!.path;
	assert.match(path, /^\/_converted\/layers\/[0-9a-f]{16}\.html$/);
	const sources = table.files.map((f) => f.source);
	assert.ok(sources.some((s) => s.includes(`<link rel="preload" href="${path}" as="fetch" crossorigin="anonymous" fetchpriority="low" /><template data-mm-layer-src="${path}" data-mm-layer-keys="search"><div data-mm-layer="search" hidden><input /><div data-mm-layer-fill="${path}"></div></div></template>`) && !s.includes('xxxx')));
	assert.ok(sources.some((s) => s.includes(small)));
});

test('a used layer shows its shell at once and its content when the file lands, once, after the page, with the new origin', async () => {
	const source = (file: string) => readFile(join(ROOT, 'parts', file), 'utf8').then((text) => ts.transpileModule(text, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText);
	const reveal = await source('reveal.ts');
	const browser = await chromium.launch();
	try {
		const page = await browser.newPage();
		let fetches = 0;
		let release: () => void = () => {};
		const held = new Promise<void>((resolve) => (release = resolve));
		await page.route('http://app.test/**', async (route) => {
			const path = new URL(route.request().url()).pathname;
			if (path === '/layer.html') {
				fetches++;
				await held;
				return route.fulfill({ contentType: 'text/html', body: `<a href="${APP_URL_TOKEN}/docs">Docs</a>` });
			}
			if (path === '/reveal.js') return route.fulfill({ contentType: 'text/javascript', body: reveal });
			return route.fulfill({ contentType: 'text/html', body: '<!doctype html><body><main>page</main><!--markless:page-end--><template data-mm-layer-src="/layer.html" data-mm-layer-keys="search" data-mm-app-url="https://new.example"><div role="dialog" hidden data-mm-layer="search"><a data-shell href="@@MM_APP_URL@@/home">Home</a><input value=""><div data-mm-layer-fill="/layer.html"></div></div></template></body>' });
		});
		await page.goto('http://app.test/');
		await page.evaluate(async () => {
			const parts = (await import('/reveal.js' as string)) as typeof import('../parts/reveal.ts');
			(globalThis as { parts?: unknown }).parts = parts;
		});
		const shell = await page.evaluate(() => {
			const parts = (globalThis as { parts?: typeof import('../parts/reveal.ts') }).parts!;
			const nodes = parts.layersFor('search');
			return { nodes: nodes.length, links: nodes[0]?.querySelectorAll('[data-mm-layer-fill] a').length, home: nodes[0]?.querySelector('[data-shell]')?.getAttribute('href'), afterPage: document.body.lastElementChild === nodes[0], pending: parts.layersPending() };
		});
		assert.deepEqual(shell, { nodes: 1, links: 0, home: 'https://new.example/home', afterPage: true, pending: true });
		release();
		await page.waitForFunction(() => document.querySelector('[data-mm-layer="search"] a:not([data-shell])'));
		const filled = await page.evaluate(async () => {
			const parts = (globalThis as { parts?: typeof import('../parts/reveal.ts') }).parts!;
			await parts.loadLayers();
			parts.layersFor('search');
			const nodes = document.querySelectorAll('[data-mm-layer="search"]');
			return { nodes: nodes.length, href: nodes[0]?.querySelector('a:not([data-shell])')?.getAttribute('href'), links: nodes[0]?.querySelectorAll('a:not([data-shell])').length, pending: parts.layersPending() };
		});
		assert.deepEqual(filled, { nodes: 1, href: 'https://new.example/docs', links: 1, pending: false });
		assert.equal(fetches, 1);
	} finally {
		await browser.close();
	}
});

test('a layer captured open loses the interaction state the server never renders, and keeps the state it does', () => {
	const doc = parseDocument(`<body><div role="dialog" data-state="open" data-mm-layer="k">
	<div role="option" data-state="checked" aria-selected="true" data-highlighted="">Apple</div><div role="menuitem" data-highlighted="" data-disabled="">Cut</div>
	<button data-slot="tooltip-trigger" data-state="instant-open" aria-describedby="tip">Copy</button><button data-state="delayed-open" aria-describedby="tip2">Paste</button><button aria-describedby="hint">Plain</button>
	<pre><span data-highlighted-line="">x</span><mark data-highlighted-chars="">y</mark></pre><div data-selected="" aria-selected="true" cmdk-item="">First</div></div></body>`);
	for (const el of walk(body(doc))) atRest(el);
	assert.equal(
		outer(find(body(doc), (e) => e.tagName === 'div')!),
		`<div role="dialog" data-state="closed" data-mm-layer="k">
	<div role="option" data-state="checked" aria-selected="false">Apple</div><div role="menuitem" data-disabled="">Cut</div>
	<button data-slot="tooltip-trigger" data-state="closed">Copy</button><button data-state="closed">Paste</button><button aria-describedby="hint">Plain</button>
	<pre><span data-highlighted-line="">x</span><mark data-highlighted-chars="">y</mark></pre><div data-selected="" aria-selected="true" cmdk-item="">First</div></div>`,
	);
});
