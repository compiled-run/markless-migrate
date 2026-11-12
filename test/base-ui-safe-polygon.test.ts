// The way to a Base UI submenu, against @base-ui/react 1.6's safePolygon (blockPointerEvents).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Page } from 'playwright';
import { open, settled, withSub, subState } from './base-ui-menu-harness.ts';

// The submenu beside its trigger as Base UI places it (the stub leaves it on the menu).
const beside = (page: Page, side: 'left' | 'right') =>
	page.evaluate((side) => {
		const positioner = document.querySelector<HTMLElement>('[data-mm-layer="dd-sub-1"] [role="presentation"]')!;
		positioner.setAttribute('data-side', side);
		positioner.style.translate = side === 'right' ? '400px 60px' : '-400px 60px';
	}, side);

test("Base UI's safe polygon: heading down across New Team to the submenu keeps it open", async () => {
	const page = await open(withSub(), ['base-ui/menu']);
	await page.locator('#dd').click();
	const from = (await page.getByText('Invite users').boundingBox())!;
	await page.mouse.move(from.x + 150, from.y + from.height / 2, { steps: 3 });
	await page.waitForTimeout(250);
	await beside(page, 'right');
	const to = (await page.getByText('Message').boundingBox())!;
	for (let i = 1; i <= 4; i++) {
		await page.mouse.move(from.x + 150 + ((to.x + 20 - from.x - 150) * i) / 4, from.y + from.height / 2 + ((to.y + to.height / 2 - from.y - from.height / 2) * i) / 4);
		await page.waitForTimeout(16);
	}
	await settled(page);
	assert.match(await subState(page), /sub=true/);
	await page.close();
});

test("Base UI's safe polygon: the pointer resting on its way to the submenu, short of it, closes it 40 ms later", async () => {
	const page = await open(withSub(), ['base-ui/menu']);
	await page.locator('#dd').click();
	const from = (await page.getByText('Invite users').boundingBox())!;
	await page.mouse.move(from.x + 150, from.y + from.height / 2, { steps: 3 });
	await page.waitForTimeout(250);
	await beside(page, 'right');
	// Below the trigger's height (out of the trough between them), inside the polygon to the submenu's near edge.
	await page.mouse.move(from.x + 380, from.y + from.height / 2 + 45, { steps: 20 });
	await page.waitForTimeout(100);
	assert.match(await subState(page), /sub=false/);
	await page.close();
});

test('right to left, the pointer leaving a Base UI submenu trigger straight down from beside the submenu closes it', async () => {
	const page = await open(withSub('rtl'), ['base-ui/menu']);
	await page.locator('#dd').click();
	const from = (await page.getByText('Invite users').boundingBox())!;
	await page.mouse.move(from.x + 15, from.y + from.height / 2, { steps: 3 });
	await page.waitForTimeout(250);
	await beside(page, 'left');
	assert.match(await subState(page), /sub=true/);
	await page.mouse.move(from.x + 15, from.y + from.height * 1.5, { steps: 2 });
	await page.waitForTimeout(100);
	assert.match(await subState(page), /sub=false/);
	await page.close();
});

test('the pointer stepping off a Base UI submenu trigger straight onto the submenu beside it keeps it open', async () => {
	const page = await open(withSub(), ['base-ui/menu']);
	await page.locator('#dd').click();
	const from = (await page.getByText('Invite users').boundingBox())!;
	await page.mouse.move(from.x + from.width - 20, from.y + from.height / 2, { steps: 3 });
	await page.waitForTimeout(250);
	await page.evaluate(([right, top]) => {
		const positioner = document.querySelector<HTMLElement>('[data-mm-layer="dd-sub-1"] [role="presentation"]')!;
		positioner.setAttribute('data-side', 'right');
		positioner.style.translate = `${right! - 4}px ${top! - 3}px`;
	}, [from.x + from.width, from.y]);
	await page.mouse.move(from.x + from.width - 2, from.y + from.height / 2);
	await page.mouse.move(from.x + from.width + 1, from.y + from.height / 2 + 13);
	await settled(page);
	assert.match(await subState(page), /sub=true/);
	await page.close();
});
