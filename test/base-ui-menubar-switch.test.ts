// A Base UI menubar as convert renders shadcn's: each open trigger's focus guards beside it (shown with its layer), a
// mouse press that leaves the trigger its own focus, then the pointer or the side arrows moving to another menu.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Page } from 'playwright';
import { open, press, settled } from './base-ui-menu-harness.ts';

const GUARD = 'style="clip-path:inset(50%);overflow:hidden;width:1px;height:1px;margin:-1px;position:fixed;top:0;left:0"';
const guard = (key: string) => `<span data-type="outside" aria-hidden="true" tabindex="0" data-base-ui-focus-guard="" ${GUARD} hidden data-mm-shown-with="${key}"></span>`;
const trigger = (id: string, text: string, i: number) => `<button type="button" aria-disabled="false" tabindex="${i ? -1 : 0}" aria-haspopup="menu" id="${id}" role="menuitem" data-slot="menubar-trigger" aria-expanded="false" style="padding:4px 8px">${text}</button>${guard(id)}`;
const layer = (id: string, items: readonly string[]) =>
	`<div data-base-ui-portal hidden data-mm-layer="${id}"><div role="presentation" style="position:absolute;left:0;top:300px" data-closed><span data-type="inside" aria-hidden="true" tabindex="0" data-base-ui-focus-guard ${GUARD}></span><div tabindex="-1" role="menu" aria-labelledby="${id}" data-slot="menubar-content" data-closed>${items.map((t) => `<div role="menuitem" tabindex="-1" data-slot="menubar-item">${t}</div>`).join('')}</div></div></div>`;
const MENUS = [
	['m1', 'File', ['New Tab', 'Print']],
	['m2', 'Edit', ['Undo', 'Redo']],
	['m3', 'View', ['Zoom In', 'Zoom Out']],
] as const;
const markup = (dir: 'ltr' | 'rtl') => `<main style="padding:100px" dir="${dir}"><div role="menubar" data-slot="menubar" style="display:flex;gap:4px">${MENUS.map(([id, text], i) => trigger(id, text, i)).join('')}${guard('m1')}</div></main>${MENUS.map(([id, , items]) => layer(id, items)).join('')}`;
const expanded = (page: Page) => page.evaluate(() => [...document.querySelectorAll('[data-slot="menubar-trigger"]')].map((t) => `${t.textContent}:${t.getAttribute('aria-expanded')}`).join(' '));
const shownMenu = (page: Page) => page.evaluate(() => [...document.querySelectorAll<HTMLElement>('[role="menu"]')].filter((m) => m.getClientRects().length).map((m) => m.getAttribute('aria-labelledby')).join(','));

test('with a Base UI menubar menu opened by a mouse press, the pointer on another trigger opens that menu, past the focus guards between them', async () => {
	const page = await open(markup('ltr'), ['base-ui/menu']);
	await page.locator('#m1').click();
	await settled(page);
	assert.equal(await expanded(page), 'File:true Edit:false View:false');
	await page.locator('#m2').hover();
	await settled(page);
	assert.equal(await expanded(page), 'File:false Edit:true View:false');
	assert.equal(await shownMenu(page), 'm2');
	assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-labelledby')), 'm2', 'the menu switched to has focus');
	await page.locator('#m3').hover();
	await settled(page);
	assert.equal(await expanded(page), 'File:false Edit:false View:true');
	await page.close();
});

for (const dir of ['ltr', 'rtl'] as const) {
	test(`the side arrows move between open Base UI menubar menus, looping (${dir})`, async () => {
		const page = await open(markup(dir), ['base-ui/menu']);
		const [next, back] = dir === 'ltr' ? ['ArrowRight', 'ArrowLeft'] : ['ArrowLeft', 'ArrowRight'];
		await page.locator('#m1').click();
		await settled(page);
		await press(page, next);
		assert.equal(await expanded(page), 'File:false Edit:true View:false');
		await press(page, next);
		assert.equal(await expanded(page), 'File:false Edit:false View:true');
		await press(page, next);
		assert.equal(await expanded(page), 'File:true Edit:false View:false', 'past the last menu, the first');
		await press(page, back);
		assert.equal(await expanded(page), 'File:false Edit:false View:true');
		assert.equal(await shownMenu(page), 'm3');
		await page.close();
	});
}

test("with Radix's menu part loaded too, as on a site that ships both, a Base UI menubar trigger is never marked highlighted", async () => {
	const page = await open(markup('ltr'), ['base-ui/menu', 'radix/dropdown-menu']);
	const marked = () => page.evaluate(() => [...document.querySelectorAll('[data-slot="menubar-trigger"][data-highlighted]')].map((t) => t.textContent).join(',') || 'none');
	await page.locator('#m1').focus();
	await press(page, 'ArrowRight');
	assert.equal(await page.evaluate(() => document.activeElement?.textContent), 'Edit');
	assert.equal(await marked(), 'none', 'moving along the bar');
	await page.locator('#m1').click();
	await settled(page);
	await page.mouse.click(900, 700);
	await settled(page);
	assert.equal(await expanded(page), 'File:false Edit:false View:false');
	assert.equal(await marked(), 'none', 'closed by a click outside');
	await page.close();
});
