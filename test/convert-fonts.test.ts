import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { chromium } from 'playwright';
import { LATE_FONT } from '../parts/late-fonts.ts';
import { capturePage } from '../src/convert/capture.ts';
import { attr, parseDocument, walk } from '../src/convert/dom.ts';
import { applyLateFonts, fontPreloads, fontPreloadsInFirstScreen, withoutFontPreloads, LATE_CANDIDATE, lateFontsInFirstScreen, markLateFontCandidates, MAX_FONT_PRELOADS } from '../src/convert/fonts.ts';

const PAGE = (head = '', mark = '') => `<!doctype html><html><head>${head}<style>
@font-face{font-family:Latin;src:url(/latin.woff2) format("woff2");unicode-range:U+0000-00FF,U+2014}
@font-face{font-family:Arabic;src:url(/arabic.woff2) format("woff2");unicode-range:U+0600-06FF;font-display:swap}
@font-face{font-family:Arabic;src:url(/arabic-latin.woff2) format("woff2");unicode-range:U+0000-00FF}
body{font-family:Latin,Arabic,sans-serif;margin:0}
.ar{font-family:Arabic,Latin}
</style></head><body><h1>Top — first screen</h1><div style="height:3000px"></div><section id="rtl"><p dir="rtl" class="ar"${mark}>زر حذف</p></section></body></html>`;

test('a web font only text below every first screen draws is found, by the family the browser picks for each character, spaces too', async () => {
	const server = createServer((req, res) => {
		if (req.url === '/') return void res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(PAGE());
		res.writeHead(200, { 'content-type': 'font/woff2' }).end(Buffer.alloc(64));
	});
	await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
	const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
	const browser = await chromium.launch();
	try {
		const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
		await page.goto(origin, { waitUntil: 'load' });
		await page.waitForTimeout(300);
		const faces = await page.evaluate(markLateFontCandidates, LATE_CANDIDATE);
		assert.deepEqual(
			faces.map((f) => [f.family, f.firstScreen]),
			[['Latin', true], ['Arabic', false], ['Arabic', false]],
			"the Latin face draws the first screen; Arabic's faces draw only the section below it, its Latin one the space there",
		);
		assert.deepEqual(faces[1]!.face, { family: 'Arabic', src: `url("${origin}/arabic.woff2") format("woff2")`, descriptors: { unicodeRange: 'U+600-6FF', display: 'swap' } }, 'the face as FontFace takes it');
		assert.equal(faces[0]!.url, `${origin}/latin.woff2`, 'the first-screen face, with the file it was fetched from');
		await page.setViewportSize({ width: 390, height: 844 });
		assert.deepEqual(await page.evaluate(lateFontsInFirstScreen, LATE_CANDIDATE), [faces[0]!.id], "at a phone's width only the Latin face's block is in the first screen");
		const html = await page.evaluate(() => document.documentElement.outerHTML);
		const doc = parseDocument(html);
		assert.equal(applyLateFonts(doc, faces.filter((f) => !f.firstScreen).map((f) => f.id)), 1);
		const marked = [...walk(doc)].filter((el) => attr(el, LATE_FONT) !== undefined);
		assert.deepEqual(marked.map((el) => el.tagName), ['p']);
		assert.ok(![...walk(doc)].some((el) => attr(el, LATE_CANDIDATE) !== undefined), 'no candidate mark is left');

	} finally {
		await browser.close();
		server.close();
	}
});

test('first-screen fonts only a stylesheet names are preloaded: same-origin woff2, at most four with the page\'s own', () => {
	const o = 'https://site.example';
	assert.deepEqual(fontPreloads([`${o}/a.woff2`, `${o}/a.woff2`, 'https://fonts.gstatic.com/b.woff2', `${o}/c.ttf`, `${o}/d.woff2`], o, 0), [{ href: '/a.woff2' }, { href: '/d.woff2' }]);
	assert.equal(fontPreloads([`${o}/a.woff2`, `${o}/b.woff2`], o, MAX_FONT_PRELOADS - 1).length, 1);
});

test('a capture cached before its page\'s font facts were recorded is taken again, so a late font is found on it', async () => {
	let served = 0;
	const server = createServer((req, res) => {
		if (req.url === '/') {
			served++;
			return void res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(PAGE());
		}
		res.writeHead(200, { 'content-type': 'font/woff2' }).end(Buffer.alloc(64));
	});
	await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
	const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
	const dir = await mkdtemp(join(tmpdir(), 'mm-fonts-'));
	const browser = await chromium.launch();
	try {
		const fresh = await capturePage(browser, origin, '/', dir);
		assert.deepEqual(fresh.lateFonts?.map((f) => f.key.split('|')[0]), ['Arabic', 'Arabic']);
		const [file] = await readdir(dir);
		const { fonts: _, lateFonts: __, ...before } = fresh;
		await writeFile(join(dir, file!), JSON.stringify(before));
		served = 0;
		const again = await capturePage(browser, origin, '/', dir);
		assert.ok(served > 0, 'the page was loaded again');
		assert.deepEqual(again.lateFonts?.map((f) => f.key.split('|')[0]), ['Arabic', 'Arabic']);
		served = 0;
		await capturePage(browser, origin, '/', dir);
		assert.equal(served, 0, 'a capture with its font facts is kept');
	} finally {
		await browser.close();
		server.close();
		await rm(dir, { recursive: true, force: true });
	}
});

test('a font the page preloads that no first screen draws is found, so its preload can go', async () => {
	const page = `<!doctype html><html><head>
<link rel="preload" href="/latin.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/mono.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/hebrew-latin.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="https://cdn.example/other.woff2" as="font" type="font/woff2" crossorigin>
<style>
@font-face{font-family:Latin;src:url(/latin.woff2) format("woff2");unicode-range:U+0000-00FF}
@font-face{font-family:Mono;src:url(/mono.woff2) format("woff2");unicode-range:U+0000-00FF}
@font-face{font-family:Hebrew;src:url(/hebrew-latin.woff2) format("woff2");unicode-range:U+0000-00FF}
body{font-family:Latin,sans-serif;margin:0}
code{font-family:Mono,monospace}
.he{font-family:Hebrew,Latin}
</style></head><body><h1>Install</h1><p class="he" hidden>shalom</p><div style="height:3000px"></div><pre><code>npx shadcn add tabs</code></pre></body></html>`;
	const server = createServer((req, res) => {
		if (req.url === '/') return void res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(page);
		res.writeHead(200, { 'content-type': 'font/woff2' }).end(Buffer.alloc(64));
	});
	await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
	const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
	const browser = await chromium.launch();
	try {
		const tab = await browser.newPage({ viewport: { width: 1280, height: 800 } });
		await tab.goto(origin, { waitUntil: 'load' });
		const desktop = await tab.evaluate(fontPreloadsInFirstScreen);
		assert.deepEqual(desktop.preloaded, [`${origin}/latin.woff2`, `${origin}/mono.woff2`, `${origin}/hebrew-latin.woff2`], 'the preloads a face of the page names; a file no face names is not judged');
		assert.deepEqual(desktop.drawn, [`${origin}/latin.woff2`], 'the heading draws Latin; the code is below the first screen and the Hebrew line is hidden');
		await tab.setViewportSize({ width: 390, height: 844 });
		assert.deepEqual((await tab.evaluate(fontPreloadsInFirstScreen)).drawn, [`${origin}/latin.woff2`]);
	} finally {
		await browser.close();
		server.close();
	}
});

test("a font preload no first screen needs is dropped from the page's head; the others stay", () => {
	const o = 'https://site.example';
	const link = (href: string) => ({ tag: 'link' as const, attrs: { rel: 'preload', href, as: 'font', crossorigin: '' } });
	const tags = [{ tag: 'meta' as const, attrs: { charset: 'utf-8' } }, link('/latin.woff2'), link('/mono.woff2'), { tag: 'link' as const, attrs: { rel: 'stylesheet', href: '/mono.woff2' } }, link('https://cdn.example/x.woff2')];
	assert.deepEqual(withoutFontPreloads(tags, [`${o}/mono.woff2`, 'https://cdn.example/x.woff2'], o), [tags[0], tags[1], tags[3]]);
});

test('a preloaded font every face of which swaps is found, so text paints in a fallback first; a font that hides its text until it arrives keeps its preload', async () => {
	const page = `<!doctype html><html><head>
<link rel="preload" href="/sans.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/icons.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/mixed.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/optional.woff2" as="font" type="font/woff2" crossorigin>
<style>
@font-face{font-family:Sans;src:url(/sans.woff2) format("woff2");font-display:swap}
@font-face{font-family:Icons;src:url(/icons.woff2) format("woff2");font-display:block}
@font-face{font-family:Mixed;src:url(/mixed.woff2) format("woff2");font-display:swap;font-weight:400}
@font-face{font-family:Mixed;src:url(/mixed.woff2) format("woff2");font-weight:700}
@font-face{font-family:Opt;src:url(/optional.woff2) format("woff2");font-display:optional}
@font-face{font-family:Swapped;src:url(/swapped.woff2) format("woff2");font-display:swap}
@font-face{font-family:Auto;src:url(/auto.woff2) format("woff2")}
body{font-family:Sans,sans-serif;margin:0}
i{font-family:Icons}
b{font-family:Mixed}
small{font-family:Opt}
h2{font-family:Swapped}
h3{font-family:Auto}
</style></head><body><h1>Tabs</h1><i>x</i><b>bold</b><small>fine</small><h2>Install</h2><h3>Body copy</h3></body></html>`;
	const server = createServer((req, res) => {
		if (req.url === '/') return void res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(page);
		res.writeHead(200, { 'content-type': 'font/woff2' }).end(Buffer.alloc(64));
	});
	await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
	const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
	const browser = await chromium.launch();
	const dir = await mkdtemp(join(tmpdir(), 'mm-fonts-'));
	try {
		const tab = await browser.newPage({ viewport: { width: 1280, height: 800 } });
		await tab.goto(origin, { waitUntil: 'load' });
		const found = await tab.evaluate(fontPreloadsInFirstScreen);
		assert.deepEqual(found.drawn, [`${origin}/sans.woff2`, `${origin}/icons.woff2`, `${origin}/mixed.woff2`, `${origin}/optional.woff2`]);
		assert.deepEqual(found.swap, [`${origin}/sans.woff2`], 'icons block, one Mixed face blocks (auto), optional may never be used unless preloaded');
		const captured = await capturePage(browser, origin, '/', dir);
		assert.deepEqual(captured.swapFontPreloads, [`${origin}/sans.woff2`]);
		assert.deepEqual(captured.firstScreenFonts, [`${origin}/auto.woff2`], 'a first-screen face only a stylesheet names that swaps is not preloaded either; one that hides its text until it arrives is');
	} finally {
		await browser.close();
		server.close();
		await rm(dir, { recursive: true, force: true });
	}
});
