import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { chromium, type Browser } from 'playwright';
import { quiet } from '../src/check/journeys.ts';

// A panel that leaves once its 300 ms exit animation ends, as Radix's Presence removes closed content on animationend.
const PAGE = `<!doctype html><style>@keyframes up { from { height: 40px } to { height: 0 } } #panel { height: 40px; overflow: hidden } #panel.closing { animation: up 300ms ease-out }</style>
<button id="close">Close</button><div id="panel">Shipping</div>
<script>document.getElementById('close').onclick = () => { const p = document.getElementById('panel'); p.className = 'closing'; p.addEventListener('animationend', () => p.remove(), { once: true }); };</script>`;

let browser: Browser;
before(async () => {
	browser = await chromium.launch();
});
after(async () => {
	await browser?.close();
});

test('a step settles once an exit animation of up to a second has ended, so what it removes is gone', async () => {
	const page = await browser.newPage();
	try {
		await page.setContent(PAGE);
		await page.click('#close');
		await quiet(page, () => 0);
		assert.equal(await page.locator('#panel').count(), 0);
	} finally {
		await page.close();
	}
});

test('an endless animation does not hold a step', async () => {
	const page = await browser.newPage();
	try {
		await page.setContent('<!doctype html><style>@keyframes spin { to { rotate: 1turn } } i { display: block; animation: spin 1s linear infinite }</style><i></i>');
		const started = Date.now();
		await quiet(page, () => 0);
		assert.ok(Date.now() - started < 2_000, `quiet took ${Date.now() - started} ms`);
	} finally {
		await page.close();
	}
});
