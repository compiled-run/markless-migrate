// A page whose cards load as they pass through the view (an IntersectionObserver per card, as ideal-img does) is read with
// every card loaded on every run, not only those the end of the page or a screenshot happened to reach.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import { chromium } from 'playwright';
import { settle } from '../src/check/capture.ts';

const CARDS = 40;
const html = `<!doctype html><body style="margin:0">${Array.from({ length: CARDS }, (_, i) => `<section style="height:900px" data-card="${i}"></section>`).join('')}<script>
const seen = new IntersectionObserver((entries) => { for (const e of entries) if (e.isIntersecting && !e.target.dataset.loaded) { seen.unobserve(e.target); fetch('/card/' + e.target.dataset.card).then((r) => r.text()).then((t) => { e.target.textContent = t; e.target.dataset.loaded = '1'; }); } });
for (const s of document.querySelectorAll('[data-card]')) seen.observe(s);
</script>`;

test('settling scrolls a tall page through a view at a time, so cards a script loads in view are all loaded', async () => {
	const server = createServer((req, res) => (req.url?.startsWith('/card/') ? setTimeout(() => res.end(`card ${req.url.slice(6)}`), 30) : res.writeHead(200, { 'content-type': 'text/html' }).end(html)));
	await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
	const browser = await chromium.launch();
	try {
		const page = await browser.newPage({ viewport: { width: 800, height: 700 } });
		await page.goto(`http://127.0.0.1:${(server.address() as AddressInfo).port}/`);
		await settle(page);
		assert.equal(await page.evaluate(() => document.querySelectorAll('[data-loaded]').length), CARDS);
		assert.equal(await page.evaluate(() => scrollY), 0, 'read from the top, as loaded');
	} finally {
		await browser.close();
		server.close();
	}
});
