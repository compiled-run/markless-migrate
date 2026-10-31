import assert from 'node:assert/strict';
import { test } from 'node:test';
import { open } from './base-ui-menu-harness.ts';

// vaul's Drawer is Radix Dialog: its Drawer.Close (shadcn's DrawerClose, data-slot="drawer-close") is a Dialog.Close.
test("a Radix drawer's own close button closes it", async () => {
	const page = await open(
		`<main><button type="button" aria-haspopup="dialog" aria-expanded="false" aria-controls="d1" data-state="closed" data-slot="drawer-trigger">Open Drawer</button></main><div data-mm-layer="d1" hidden data-slot="drawer-overlay" data-state="closed"></div><div data-mm-layer="d1" hidden role="dialog" id="d1" data-slot="drawer-content" data-state="closed" data-vaul-drawer=""><button type="button" data-slot="drawer-close">Close</button></div>`,
		['radix/dialog'],
	);
	await page.getByText('Open Drawer').click();
	await page.waitForTimeout(100);
	assert.equal(await page.locator('[role="dialog"]').getAttribute('data-state'), 'open');
	await page.getByText('Close').click();
	await page.waitForTimeout(400);
	assert.equal(await page.locator('[role="dialog"]').getAttribute('data-state'), 'closed');
	assert.equal(await page.locator('[role="dialog"]').isVisible(), false);
	await page.close();
});
