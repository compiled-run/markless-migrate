import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { after, before, test } from 'node:test';
import { chromium, type Browser } from 'playwright';
import { defaultEnv, openPage } from '../src/check/browser.ts';
import { settle } from '../src/check/capture.ts';
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
