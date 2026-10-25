// The textValue React Aria's type-to-select matches, read from the old page's collection nodes while capturing.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { chromium, type Browser } from 'playwright';
import { markTextValues } from '../src/convert/rac-text.ts';

let browser: Browser;
before(async () => {
	browser = await chromium.launch();
});
after(() => browser.close());

test('each React Aria item a capture added gets its collection node\'s textValue, empty when its children were not one string', async () => {
	const page = await browser.newPage();
	await page.setContent('<div id="menu" data-rac="" role="menu"><div id="a" data-rac="" role="menuitem">Settings<kbd>⌘S</kbd></div><div id="b" data-rac="" role="menuitem">Support</div></div><div id="c" data-rac="" role="option">Kept</div>');
	await page.evaluate(() => {
		const fiber = (textValue: string) => ({ memoizedProps: { className: 'x' }, return: { memoizedProps: { children: [] }, return: { memoizedProps: { node: { type: 'item', textValue } }, return: null } } });
		Object.assign(document.getElementById('a')!, { __reactFiber$abc: fiber('') });
		Object.assign(document.getElementById('b')!, { __reactFiber$abc: fiber('Support') });
		Object.assign(document.getElementById('c')!, { __reactFiber$abc: fiber('Kept') });
		(window as unknown as { __mmAdded: unknown[] }).__mmAdded = [{ node: document.getElementById('menu') }];
	});
	await page.evaluate(markTextValues);
	assert.deepEqual(await page.evaluate(() => ['a', 'b', 'c'].map((id) => document.getElementById(id)!.getAttribute('data-mm-text-value'))), ['', 'Support', null]);
	await page.close();
});
