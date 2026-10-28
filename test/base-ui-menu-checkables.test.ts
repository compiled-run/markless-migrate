// The Base UI menu ports switching the checkable items convert marked (markMenuCheckables), against @base-ui/react 1.6.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Page } from 'playwright';
import { open, settled, press, state, menu } from './base-ui-menu-harness.ts';

// An item convert marked switchable (markMenuCheckables): both states' attributes, and both indicators.
const switchable = (lasts: string) =>
	menu(['Apple', 'Banana']).replace(
		'<div role="menuitem" tabindex="-1" data-slot="dropdown-menu-item">Banana</div>',
		`<div role="menuitemcheckbox" aria-checked="false" data-unchecked="" tabindex="-1" data-mm-toggle="${lasts}" data-mm-on='{"aria-checked":"true","data-checked":"","data-unchecked":null}' data-mm-off='{"aria-checked":"false","data-checked":null,"data-unchecked":""}'><span data-mm-when="off"></span><span data-mm-when="on" hidden>✓</span>Banana</div>`,
	);
const banana = (page: Page) => page.evaluate(() => { const el = document.querySelector('[role="menuitemcheckbox"]')!; return `${el.getAttribute('aria-checked')} ${el.hasAttribute('data-checked') ? 'checked' : 'unchecked'} ${[...el.querySelectorAll<HTMLElement>('[data-mm-when]')].filter((s) => !s.hidden).map((s) => s.dataset.mmWhen).join()}`; });

for (const [lasts, reopened] of [['reset', 'false unchecked off'], ['kept', 'true checked on']] as const)
	test(`a Base UI checkbox item convert marked switches in the open menu, and the menu opens again with it ${lasts === 'reset' ? 'as it was (its own state unmounted)' : 'as chosen (the page kept it)'}`, async () => {
		const page = await open(switchable(lasts), ['base-ui/menu']);
		await page.locator('#dd').click();
		await settled(page);
		await page.getByText('Banana').click();
		await settled(page);
		assert.equal(await banana(page), 'true checked on');
		assert.match(await state(page), /^true /, 'a checkbox item leaves the menu open');
		await press(page, 'Escape');
		await page.waitForTimeout(300);
		await page.locator('#dd').click();
		await settled(page);
		assert.equal(await banana(page), reopened);
		await page.close();
	});
