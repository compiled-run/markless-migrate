import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { body, outer, parseDocument } from '../src/convert/dom.ts';
import { appendBodyCss, foldBodyStyles, type Prepared } from '../src/convert/index.ts';

test("a page's own body <style> elements leave the markup in order, a template's and an @import's stay", () => {
	const doc = parseDocument(
		'<html><head></head><body><main><style>.a{color:red}</style><section><style media="print">.b{color:blue}</style></section></main>' +
			'<template><style>.t{color:green}</style></template><style>@import "/x.css";.c{}</style><style>.d{color:black}</style></body></html>',
	);
	assert.deepEqual(foldBodyStyles(body(doc)), ['.a{color:red}', '@media print{.b{color:blue}}', '.d{color:black}']);
	const markup = outer(body(doc));
	assert.doesNotMatch(markup, /\.a\{|\.b\{|\.d\{/);
	assert.match(markup, /\.t\{color:green\}/);
	assert.match(markup, /@import/);
});

test("the folded CSS is appended to the page's last same-origin stylesheet as a new file; a page without one links its own", async () => {
	const dir = await mkdtemp(join(tmpdir(), 'fold-'));
	try {
		await mkdir(join(dir, 'chunks'), { recursive: true });
		await writeFile(join(dir, 'chunks/main.used-aaaaaaaaaaaa.css'), '.main{}');
		await writeFile(join(dir, 'chunks/first.css'), '.first{}');
		const page = (head: Prepared['head'], bodyCss: string[]) => ({ head, bodyCss }) as unknown as Prepared;
		const withSheet = page(
			[
				{ tag: 'link', attrs: { rel: 'stylesheet', href: '/chunks/first.css' } },
				{ tag: 'link', attrs: { rel: 'stylesheet', href: '/chunks/main.used-aaaaaaaaaaaa.css' } },
				{ tag: 'link', attrs: { rel: 'stylesheet', href: 'https://cdn.test/x.css' } },
			],
			['.a{}', '.b{}'],
		);
		const without = page([{ tag: 'meta', attrs: { charset: 'utf-8' } }], ['.c{}']);
		const untouched = page([{ tag: 'link', attrs: { rel: 'stylesheet', href: '/chunks/first.css' } }], []);
		assert.equal(await appendBodyCss(dir, [withSheet, without, untouched]), 1);
		const href = withSheet.head[1]!.attrs.href!;
		assert.match(href, /^\/chunks\/main\.used-[0-9a-f]{12}\.css$/);
		assert.notEqual(href, '/chunks/main.used-aaaaaaaaaaaa.css');
		assert.equal(await readFile(join(dir, href), 'utf8'), '.main{}\n.a{}\n.b{}');
		assert.equal(withSheet.head[0]!.attrs.href, '/chunks/first.css');
		const own = without.head.at(-1)!;
		assert.equal(own.tag, 'link');
		assert.equal(await readFile(join(dir, own.attrs.href!), 'utf8'), '.c{}');
		assert.equal(untouched.head[0]!.attrs.href, '/chunks/first.css');
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});
