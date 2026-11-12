// A Base UI submenu the pointer reached, against @base-ui/react 1.6's safePolygon and useHoverFloatingInteraction.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { open, settled, withSub, subState } from './base-ui-menu-harness.ts';

test('once the pointer is in a Base UI submenu, leaving it for the page keeps it open; then a move onto another item of its menu closes it', async () => {
	const page = await open(withSub(), ['base-ui/menu']);
	await page.locator('#dd').click();
	await page.getByText('Invite users').hover();
	await page.waitForTimeout(250);
	// Beside its trigger, as Base UI places it (the stub leaves it on the menu).
	await page.evaluate(() => (document.querySelector<HTMLElement>('[data-mm-layer="dd-sub-1"] [role="presentation"]')!.style.translate = '400px 0'));
	const email = (await page.getByText('Email').boundingBox())!;
	await page.mouse.move(email.x + 20, email.y + email.height / 2, { steps: 4 });
	await settled(page);
	assert.match(await subState(page), /sub=true/, 'in the submenu');
	await page.mouse.move(email.x + 400, email.y + 200, { steps: 5 });
	await page.waitForTimeout(100);
	assert.match(await subState(page), /sub=true/, 'left for the page');
	const team = (await page.getByText('New Team').boundingBox())!;
	await page.mouse.move(team.x + 30, team.y + team.height / 2, { steps: 5 });
	await settled(page);
	assert.equal(await subState(page), 'menu=true sub=false focus=New Team highlighted=New Team');
	await page.close();
});
