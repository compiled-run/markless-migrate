// The chart sweep moves the pointer inside the page: each move must reach the page as a real pointer's does (the
// same events, targets and coordinates), or recharts would answer it differently.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { chromium, type Browser, type Page } from 'playwright';
import { installProbe } from '../src/convert/charts.ts';

const PAGE = `<!doctype html><html><body style="margin:0"><div id="outer" style="position:absolute;left:20px;top:20px;width:200px;height:200px"><div id="inner" style="position:absolute;left:50px;top:50px;width:50px;height:50px"></div></div><div id="side" style="position:absolute;left:300px;top:20px;width:50px;height:50px"></div></body></html>`;
const PATH: readonly [number, number][] = [[5, 5], [40.9999995, 30.25], [80.5, 80.9999999], [90, 90], [320.4, 30], [5, 5]];

let browser: Browser;
before(async () => (browser = await chromium.launch()));
after(() => browser.close());

async function recorded(move: (page: Page, x: number, y: number) => Promise<void>): Promise<string[]> {
	const page = await browser.newPage();
	await page.setContent(PAGE);
	await page.evaluate(installProbe);
	await page.evaluate(() => {
		const log: string[] = ((window as unknown as { log: string[] }).log = []);
		for (const type of ['pointerover', 'pointerenter', 'pointerout', 'pointerleave', 'pointermove', 'mouseover', 'mouseenter', 'mouseout', 'mouseleave', 'mousemove'])
			document.addEventListener(type, (e) => {
				const m = e as MouseEvent;
				const name = (t: EventTarget | null) => (t instanceof Element ? t.id || t.tagName.toLowerCase() : String(t));
				log.push(`${type} ${name(e.target)} ${m.clientX},${m.clientY} related=${name(m.relatedTarget)}`);
			}, true);
	});
	for (const [x, y] of PATH) await move(page, x, y);
	const log = await page.evaluate(() => (window as unknown as { log: string[] }).log);
	await page.close();
	return log;
}

test("the sweep's pointer reaches the page as a real one does: the same events in order, on the same targets, at the same coordinates", async () => {
	const real = await recorded((page, x, y) => page.mouse.move(x, y));
	const swept = await recorded((page, x, y) => page.evaluate(([x, y]) => window.__mmc!.move(x, y), [x, y] as const));
	assert.ok(real.length > PATH.length, real.join('\n'));
	assert.deepEqual(swept, real);
});
