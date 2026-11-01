import assert from 'node:assert/strict';
import { test } from 'node:test';
import { notAControl } from '../src/check/run.ts';

// Reasons from the corpus A/A run (the original against itself): a zero-size clickable div and a button under a card's link.
test("a clickable of no size at rest, and one a link or button covers, are not controls left unverified; other reasons still are", () => {
	assert.equal(notAControl('it could not be used on the old page: clickable <div> #2 (no name: matched by structure and position) could not be used: hidden: it has no size (1265x0), still after focusing it'), true);
	assert.equal(notAControl('it could not be used on the old page: button "Deploy Now" could not be used: occluded: covered by a.absolute.inset-0 "Deploy to Vercel" at its centre (1065, 494), still after scrolling it to the middle, focusing it, pressing Escape'), true);
	assert.equal(notAControl('it could not be used on the old page: button "Open" could not be used: occluded: covered by div.overlay at its centre (10, 10)'), false, 'a cover that is no control hides a real one');
	assert.equal(notAControl('out of the journey budget (650 s): raise --journey-budget'), false);
	assert.equal(notAControl(undefined), false);
});

test('a time input is typed in its own format, so its journey runs instead of being left unverified', { timeout: 300_000 }, async () => {
	const { createServer } = await import('node:http');
	const { chromium } = await import('playwright');
	const { runCheck } = await import('../src/check/run.ts');
	const html = '<!doctype html><html lang="en"><head><title>Time</title></head><body><main><h1>Pick a time</h1><label>Time <input type="time" id="t"></label><p id="out">none</p></main><script>document.getElementById("t").addEventListener("change", (e) => { document.getElementById("out").textContent = e.target.value; });</script></body></html>';
	const server = await new Promise<import('node:http').Server>((done) => { const s = createServer((_, res) => res.writeHead(200, { 'content-type': 'text/html' }).end(html)); s.listen(0, '127.0.0.1', () => done(s)); });
	const origin = `http://127.0.0.1:${(server.address() as import('node:net').AddressInfo).port}`;
	const browser = await chromium.launch();
	try {
		const route = (await runCheck({ oldOrigin: origin, newOrigin: origin.replace('127.0.0.1', 'localhost'), routes: ['/'], viewports: [{ name: 'desktop', width: 1280, height: 800, isMobile: false }], browser, responsiveness: undefined, motion: undefined, load: undefined })).routes[0]!;
		assert.deepEqual(route.failures.filter((f) => f.check.startsWith('not exercised')).map((f) => `${f.check}: ${f.actual}`), []);
	} finally {
		await browser.close();
		server.close();
	}
});
