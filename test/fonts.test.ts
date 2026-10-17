import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { chromium, type Browser } from 'playwright';
import { renderedFonts } from '../src/check/fonts.ts';
import type { ElementSnapshot } from '../src/check/types.ts';

let browser: Browser;
before(async () => {
	browser = await chromium.launch();
});
after(() => browser?.close());

test('each element gets the font of its own node, whatever order the snapshot lists them in', async () => {
	const page = await browser.newPage();
	try {
		await page.setContent('<p id="serif" style="font-family:serif">serif text</p><p id="mono" style="font-family:monospace">mono text</p>');
		const fontsOf = async (order: string[]) => {
			await page.evaluate((ids) => {
				(window as unknown as { __mmElements: Element[] }).__mmElements = ids.map((id) => document.getElementById(id)!);
			}, order);
			const snapshots = order.map((id) => ({ text: id }) as unknown as ElementSnapshot);
			return (await renderedFonts(page, snapshots, new Map())).map((el) => el.font);
		};
		const [serif, mono] = await fontsOf(['serif', 'mono']);
		assert.notEqual(serif, mono);
		assert.deepEqual(await fontsOf(['mono', 'serif']), [mono, serif]);
	} finally {
		await page.close();
	}
});
