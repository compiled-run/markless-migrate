import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { chromium, type Browser } from 'playwright';
import { clickOnce } from '../src/check/click.ts';
import { runCheck } from '../src/check/run.ts';

// A chart's axis labels as recharts draws them: one group that listens for clicks, its labels at both ends, the surface behind the gap between them.
const chart = `<!doctype html><html lang="en"><head><title>Chart</title></head><body><main><h1>Visitors</h1><svg role="application" tabindex="0" width="600" height="120" viewBox="0 0 600 120"><rect width="600" height="120" fill="#eee"></rect><g id="ticks"><text x="10" y="100">Mon</text><text x="550" y="100">Sat</text></g></svg><p id="said">Nothing chosen</p></main><script>
document.getElementById('ticks').addEventListener('click', () => { document.getElementById('said').textContent = 'Axis chosen'; });
</script></body></html>`;

let browser: Browser;
let server: Server;
let origin: string;
before(async () => {
	browser = await chromium.launch();
	server = createServer((_, res) => res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(chart));
	origin = await new Promise((done) => server.listen(0, '127.0.0.1', () => done(`http://127.0.0.1:${(server.address() as AddressInfo).port}`)));
});
after(async () => {
	await browser?.close();
	server.closeAllConnections();
	server.close();
});

test('a control whose box centre is a gap between what it draws is clicked on what it draws, as a person clicks an axis label', async () => {
	const page = await browser.newPage();
	try {
		await page.goto(origin);
		await clickOnce(page.locator('#ticks'), { timeout: 2_000 });
		assert.equal(await page.textContent('#said'), 'Axis chosen');
	} finally {
		await page.close();
	}
});

test('the chart checked against itself exercises its axis labels', async () => {
	const report = await runCheck({ oldOrigin: origin, newOrigin: origin, routes: ['/'] });
	const unused = report.routes[0]!.failures.filter((f) => /not exercised/.test(f.check));
	assert.deepEqual(unused.map((f) => `${f.check}: ${f.actual}`), []);
});
