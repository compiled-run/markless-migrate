import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { chromium } from 'playwright';
import { LATE_FONT, LATE_FONTS_SCRIPT } from '../parts/late-fonts.ts';
import { capturePage } from '../src/convert/capture.ts';
import { attr, parseDocument, walk } from '../src/convert/dom.ts';
import { applyLateFonts, fontPreloads, fontPreloadsInFirstScreen, withoutOffscreenFontPreloads, LATE_CANDIDATE, lateFontsInFirstScreen, markLateFontCandidates, MAX_FONT_PRELOADS } from '../src/convert/fonts.ts';

const PAGE = (head = '', mark = '') => `<!doctype html><html><head>${head}<style>
@font-face{font-family:Latin;src:url(/latin.woff2) format("woff2");unicode-range:U+0000-00FF,U+2014}
@font-face{font-family:Arabic;src:url(/arabic.woff2) format("woff2");unicode-range:U+0600-06FF}
body{font-family:Latin,Arabic,sans-serif;margin:0}
</style></head><body><h1>Top — first screen</h1><div style="height:3000px"></div><section id="rtl"><p dir="rtl"${mark}>زر حذف</p></section></body></html>`;

test('a web font only text below every first screen draws is found, and its blocks wait for the load', async () => {
	const fetched: string[] = [];
	let head = '';
	let mark = '';
	const server = createServer((req, res) => {
		if (req.url === '/') return void res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(PAGE(head, mark));
		fetched.push(req.url ?? '');
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
			[['Latin', true], ['Arabic', false]],
			'the Latin face draws the first screen; Arabic draws only the section below it',
		);
		assert.equal(faces[0]!.url, `${origin}/latin.woff2`, 'the first-screen face, with the file it was fetched from');
		await page.setViewportSize({ width: 390, height: 844 });
		assert.deepEqual(await page.evaluate(lateFontsInFirstScreen, LATE_CANDIDATE), [faces[0]!.id], "at a phone's width only the Latin face's block is in the first screen");
		const html = await page.evaluate(() => document.documentElement.outerHTML);
		const doc = parseDocument(html);
		assert.equal(applyLateFonts(doc, faces.filter((f) => !f.firstScreen).map((f) => f.id)), 1);
		const marked = [...walk(doc)].filter((el) => attr(el, LATE_FONT) !== undefined);
		assert.deepEqual(marked.map((el) => el.tagName), ['p']);
		assert.ok(![...walk(doc)].some((el) => attr(el, LATE_CANDIDATE) !== undefined), 'no candidate mark is left');

		// The converted page: the Arabic font is fetched only after the load event.
		fetched.length = 0;
		head = `<script>${LATE_FONTS_SCRIPT}</script>`;
		mark = ` ${LATE_FONT}`;
		const next = await browser.newPage({ viewport: { width: 1280, height: 800 } });
		const order: string[] = [];
		next.on('request', (r) => order.push(r.url().replace(origin, '')));
		await next.exposeFunction('__loaded', () => order.push('load'));
		await next.addInitScript(() => addEventListener('load', () => (window as unknown as { __loaded(): void }).__loaded()));
		await next.goto(origin, { waitUntil: 'load' });
		await next.waitForTimeout(500);
		assert.ok(order.indexOf('/latin.woff2') >= 0 && order.indexOf('/latin.woff2') < order.indexOf('load'), order.join(' '));
		assert.ok(order.indexOf('/arabic.woff2') > order.indexOf('load'), `the Arabic font after the load, and still fetched: ${order.join(' ')}`);
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
		assert.deepEqual(fresh.lateFonts?.map((f) => f.key.split('|')[0]), ['Arabic']);
		const [file] = await readdir(dir);
		const { fonts: _, lateFonts: __, ...before } = fresh;
		await writeFile(join(dir, file!), JSON.stringify(before));
		served = 0;
		const again = await capturePage(browser, origin, '/', dir);
		assert.ok(served > 0, 'the page was loaded again');
		assert.deepEqual(again.lateFonts?.map((f) => f.key.split('|')[0]), ['Arabic']);
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
	assert.deepEqual(withoutOffscreenFontPreloads(tags, [`${o}/mono.woff2`, 'https://cdn.example/x.woff2'], o), [tags[0], tags[1], tags[3]]);
});
