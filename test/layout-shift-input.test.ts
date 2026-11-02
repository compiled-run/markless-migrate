import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { chromium, type Browser } from 'playwright';
import { LAUNCH } from '../src/check/browser.ts';
import { readReaction, watchReaction } from '../src/check/journeys.ts';

// A button that pushes the page down by a 300 px banner, at once on a click, or later from a timer no input started.
const page = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Shift</title></head><body style="margin:0">
<main><button id="go" type="button">Show banner</button><p style="height:600px">Content</p></main>
<script>
const banner = () => document.querySelector('main').prepend(Object.assign(document.createElement('div'), { style: 'height:300px', textContent: 'Banner' }));
document.getElementById('go').onclick = banner;
window.later = (ms) => setTimeout(banner, ms);
</script></body></html>`;

let browser: Browser;
before(async () => {
	browser = await chromium.launch({ ...LAUNCH, ignoreDefaultArgs: [...LAUNCH.ignoreDefaultArgs] });
});
after(async () => {
	await browser?.close();
});

const twoFrames = () => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(done, 100))));

test("a layout shift right after a click adds nothing to the step's layout shift score, as Chrome leaves it out of CLS (hadRecentInput); the jump is still read", async () => {
	const tab = await browser.newPage({ viewport: { width: 800, height: 600 } });
	try {
		await tab.setContent(page);
		await tab.evaluate(twoFrames);
		await tab.evaluate(watchReaction);
		await tab.click('#go');
		await tab.evaluate(twoFrames);
		const read = await tab.evaluate(readReaction);
		assert.deepEqual(read.shift, { score: 0, x: 0, y: 300 });
	} finally {
		await tab.close();
	}
});

test('a layout shift with no input before it counts in the score', async () => {
	const tab = await browser.newPage({ viewport: { width: 800, height: 600 } });
	try {
		await tab.setContent(page);
		await tab.evaluate(twoFrames);
		await tab.evaluate(watchReaction);
		await tab.evaluate(() => (window as unknown as { later: (ms: number) => void }).later(0));
		await tab.evaluate(twoFrames);
		const read = await tab.evaluate(readReaction);
		assert.ok(read.shift.score > 0.1, `score ${read.shift.score}`);
	} finally {
		await tab.close();
	}
});
