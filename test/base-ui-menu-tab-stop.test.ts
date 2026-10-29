// The Base UI menu's tab stop, against @base-ui/react 1.6's CompositeList.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { open, press, menu } from './base-ui-menu-harness.ts';

test('the highlighted Base UI menu item is the tab stop, as its composite list does', async () => {
	const page = await open(menu(['Apple', 'Banana', 'Blueberry']), ['base-ui/menu']);
	await page.locator('#dd').focus();
	await press(page, 'ArrowDown');
	await press(page, 'ArrowDown');
	assert.equal(await page.evaluate(() => [...document.querySelectorAll('[role="menuitem"]')].map((e) => `${e.textContent}:${e.getAttribute('tabindex')}`).join(' ')), 'Apple:-1 Banana:0 Blueberry:-1');
	await page.close();
});
