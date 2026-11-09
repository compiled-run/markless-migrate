import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { chromium, type Browser } from 'playwright';
import { LAUNCH } from '../src/check/browser.ts';
import { readReaction, snapshot, watchReaction } from '../src/check/journeys.ts';

// A page with a framework route announcer, which snapshot hides from the accessibility tree while it reads it.
const page = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Own writes</title></head><body>
<main><button id="still" type="button">Does nothing</button><button id="go" type="button">Show</button><p id="out"></p></main>
<next-route-announcer></next-route-announcer>
<script>document.getElementById('go').onclick = () => (document.getElementById('out').textContent = 'Shown');</script>
</body></html>`;

let browser: Browser;
before(async () => {
	browser = await chromium.launch({ ...LAUNCH, ignoreDefaultArgs: [...LAUNCH.ignoreDefaultArgs] });
});
after(async () => {
	await browser?.close();
});

test("reading the page after a step is not the page's first change: a step the page does not answer has no answer time, however late the checker reads it", async () => {
	const tab = await browser.newPage();
	try {
		await tab.setContent(page);
		await tab.evaluate(watchReaction);
		await tab.click('#still');
		await tab.waitForTimeout(300);
		const tree = await snapshot(tab, []);
		assert.ok(tree.some((line) => line.includes('button "Does nothing"')), tree.join('\n'));
		const read = await tab.evaluate(readReaction);
		assert.equal(read.answeredMs, undefined);
		assert.deepEqual(read.changes, []);
		assert.equal(await tab.locator('next-route-announcer').getAttribute('aria-hidden'), null, 'the announcer is shown again');
	} finally {
		await tab.close();
	}
});

test('a step the page answers keeps its answer time when the checker reads the page before the reaction', async () => {
	const tab = await browser.newPage();
	try {
		await tab.setContent(page);
		await tab.evaluate(watchReaction);
		await tab.click('#go');
		await tab.waitForTimeout(300);
		await snapshot(tab, []);
		const read = await tab.evaluate(readReaction);
		assert.ok(read.answeredMs !== undefined && read.answeredMs < 300, String(read.answeredMs));
	} finally {
		await tab.close();
	}
});
