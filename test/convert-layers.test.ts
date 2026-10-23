import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';
import { chromium } from 'playwright';
import ts from 'typescript';
import { body, find, parseDocument } from '../src/convert/dom.ts';
import { layerTable, SERVED_LAYER_BYTES } from '../src/convert/document.ts';
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

test('a layer from SERVED_LAYER_BYTES up is a file the page names, not markup in every page; a small one stays inline', () => {
	const big = `<div data-mm-layer="search" hidden>${'x'.repeat(SERVED_LAYER_BYTES)}</div>`;
	const html = `<div data-mm-layer="search" hidden>${'x'.repeat(SERVED_LAYER_BYTES)}</div>`;
	const small = '<div data-mm-layer="tip" hidden>tip</div>';
	const table = layerTable(
		new Map([
			['/', [{ key: 'search', markup: big, html }, { key: 'tip', markup: small, html: small }]],
			['/b', [{ key: 'search', markup: big, html }]],
		]),
	);
	assert.deepEqual(table.served.map((s) => s.html), [html]);
	const path = table.served[0]!.path;
	assert.match(path, /^\/_converted\/layers\/[0-9a-f]{16}\.html$/);
	const sources = table.files.map((f) => f.source);
	assert.ok(sources.some((s) => s.includes(`<template data-mm-layer-src="${path}" data-mm-layer-keys="search"></template>`) && !s.includes('xxxx')));
	assert.ok(sources.some((s) => s.includes(small)));
});

test('the parts mount a served layer once, on idle or first use, with the new origin in place of the token', async () => {
	const source = (file: string) => readFile(join(ROOT, 'parts', file), 'utf8').then((text) => ts.transpileModule(text, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, rewriteRelativeImportExtensions: true } }).outputText);
	const reveal = await source('reveal.ts');
	const browser = await chromium.launch();
	try {
		const page = await browser.newPage();
		let fetches = 0;
		await page.route('http://app.test/**', async (route) => {
			const path = new URL(route.request().url()).pathname;
			if (path === '/layer.html') {
				fetches++;
				return route.fulfill({ contentType: 'text/html', body: `<div role="dialog" hidden data-mm-layer="search"><a href="${APP_URL_TOKEN}/docs">Docs</a></div>` });
			}
			if (path === '/reveal.js') return route.fulfill({ contentType: 'text/javascript', body: reveal });
			return route.fulfill({ contentType: 'text/html', body: '<!doctype html><body><main>page</main><template data-mm-layer-src="/layer.html" data-mm-layer-keys="search" data-mm-app-url="https://new.example"></template></body>' });
		});
		await page.goto('http://app.test/');
		const result = await page.evaluate(async () => {
			const parts = (await import('/reveal.js' as string)) as typeof import('../parts/reveal.ts');
			const before = parts.layersFor('search').length;
			const pending = parts.layersPending();
			await parts.loadLayers();
			await parts.loadLayers();
			const nodes = parts.layersFor('search');
			return { before, pending, after: nodes.length, href: nodes[0]?.querySelector('a')?.getAttribute('href'), hidden: nodes[0]?.hidden, last: document.body.lastElementChild === nodes[0], left: parts.layersPending() };
		});
		assert.deepEqual(result, { before: 0, pending: true, after: 1, href: 'https://new.example/docs', hidden: true, last: true, left: false });
		assert.equal(fetches, 1);
	} finally {
		await browser.close();
	}
});
