import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import { chromium } from 'playwright';
import { LATE_FONT, LATE_FONTS_SCRIPT } from '../parts/late-fonts.ts';
import { attr, parseDocument, walk } from '../src/convert/dom.ts';
import { applyLateFonts, fontPreloads, LATE_CANDIDATE, lateFontsInFirstScreen, markLateFontCandidates, MAX_FONT_PRELOADS } from '../src/convert/fonts.ts';

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
