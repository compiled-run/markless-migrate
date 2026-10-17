import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { after, before, test } from 'node:test';
import { chromium, type Browser } from 'playwright';
import { defaultEnv, openPage } from '../src/check/browser.ts';
import { finishAnimations, settle } from '../src/check/capture.ts';
import { VIEWPORTS } from '../src/check/types.ts';

let browser: Browser;
before(async () => {
	browser = await chromium.launch();
});
after(() => browser?.close());

const PAGE = `<!doctype html><body style="margin:0">
<div style="height:3000px"></div>
<img id="middle" loading="lazy" src="/a.png" width="10" height="10">
<div style="height:3000px"></div>
<div style="display:none"><img id="hidden" loading="lazy" src="/b.png" width="10" height="10"></div>
<img id="bottom" loading="lazy" src="/c.png" width="10" height="10">
</body>`;

test('settle loads lazy images below the fold and does not wait forever on ones that never load', async () => {
	const png = await readFile(new URL('../fixtures/markless-site/public/hero.png', import.meta.url));
	const env = defaultEnv('http://127.0.0.1:1');
	const { context, page } = await openPage(browser, env, VIEWPORTS[0]!);
	try {
		await page.route('http://127.0.0.1:1/', (route) => route.fulfill({ body: PAGE, contentType: 'text/html' }));
		await page.route('http://127.0.0.1:1/*.png', (route) => route.fulfill({ body: png, contentType: 'image/png' }));
		await page.goto('http://127.0.0.1:1/');
		const started = Date.now();
		const outcome = await Promise.race([settle(page).then(() => 'settled'), new Promise((done) => setTimeout(() => done('hung'), 30_000))]);
		assert.equal(outcome, 'settled');
		assert.ok(Date.now() - started < 20_000, `settle took ${Date.now() - started} ms`);
		const complete = await page.evaluate(() => Object.fromEntries([...document.images].map((img) => [img.id, img.complete && img.naturalWidth > 0])));
		assert.deepEqual(complete, { middle: true, hidden: false, bottom: true });
		assert.equal(await page.evaluate(() => scrollY), 0);
	} finally {
		await context.close();
	}
});

test('computed styles are read at the end of a finite animation, and what was moving is kept for the motion check', async () => {
	const env = defaultEnv('http://127.0.0.1:1');
	const { context, page } = await openPage(browser, env, VIEWPORTS[0]!);
	try {
		const html = '<!doctype html><style>@keyframes pop{from{opacity:0}to{opacity:1}}#a{animation:pop 5s}@keyframes spin{to{transform:rotate(1turn)}}#b{animation:spin 1s infinite}</style><div id="a">a</div><div id="b">b</div>';
		await page.route('http://127.0.0.1:1/', (route) => route.fulfill({ body: html, contentType: 'text/html' }));
		await page.goto('http://127.0.0.1:1/');
		await finishAnimations(page);
		assert.equal(await page.evaluate(() => getComputedStyle(document.getElementById('a')!).opacity), '1');
		assert.deepEqual(await page.evaluate(() => (window as unknown as { __mmMotion: string[] }).__mmMotion), ['pop', 'spin']);
		assert.deepEqual(await page.evaluate(() => document.getAnimations().map((a) => a.playState)), ['running']);
	} finally {
		await context.close();
	}
});

// Like a waypoint lazy loader: it fetches when the element comes into view and cancels if it leaves before the response.
const LAZY = `<!doctype html><body style="margin:0"><div style="height:3000px"></div><div id="lazy" style="height:10px"></div><script>
const el = document.getElementById('lazy');
let controller;
new IntersectionObserver(([entry]) => {
	if (entry.isIntersecting && !controller && !el.dataset.done) {
		controller = new AbortController();
		fetch('/slow', { signal: controller.signal }).then(() => { el.dataset.done = 'yes'; }).catch(() => {}).finally(() => { controller = undefined; });
	} else if (!entry.isIntersecting && controller) controller.abort();
}).observe(el);
</script></body>`;

test('settle waits at the bottom of the page until a script lazy loader has its response', async () => {
	const env = defaultEnv('http://127.0.0.1:1');
	const { context, page } = await openPage(browser, env, VIEWPORTS[0]!);
	try {
		await page.route('http://127.0.0.1:1/', (route) => route.fulfill({ body: LAZY, contentType: 'text/html' }));
		await page.route('http://127.0.0.1:1/slow', async (route) => {
			await new Promise((done) => setTimeout(done, 400));
			await route.fulfill({ body: 'ok', contentType: 'text/plain' });
		});
		await page.goto('http://127.0.0.1:1/');
		await settle(page);
		assert.equal(await page.evaluate(() => document.getElementById('lazy')!.dataset.done), 'yes');
	} finally {
		await context.close();
	}
});
