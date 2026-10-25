// The Base UI menu and select ports on markup as convert renders it, driven through parts/index.ts in a real browser,
// against what @base-ui/react 1.6 (Menu, Select, the floating-ui hooks it ships, @base-ui/utils useScrollLock) does.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { chromium, type Browser, type Page } from 'playwright';
import ts from 'typescript';

const PARTS = join(import.meta.dirname, '..', 'parts');
const FLOATING_STUB = `export const computePosition = async () => ({ x: 0, y: 0, placement: 'bottom', middlewareData: {} });
export const autoUpdate = () => () => {};
export const arrow = () => ({}), flip = () => ({}), hide = () => ({}), limitShift = () => ({}), offset = () => ({}), shift = () => ({}), size = () => ({});`;

let browser: Browser;
before(async () => {
	browser = await chromium.launch();
});
after(() => browser.close());

async function open(body: string, ports: readonly string[], choices: Record<string, unknown> = {}): Promise<Page> {
	const page = await browser.newPage({ viewport: { width: 1000, height: 800 } });
	const registry = `${ports.map((p, i) => `import * as p${i} from './${p}.ts';`).join('\n')}\nexport const PARTS = [${ports.map((_, i) => `p${i}`).join(', ')}];`;
	await page.route('http://parts.test/**', async (route) => {
		const path = new URL(route.request().url()).pathname;
		if (path === '/') return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html><head><script type="importmap">{"imports":{"@floating-ui/dom":"/floating.js"}}</script><style>*{box-sizing:border-box}body{margin:0;font:16px sans-serif}[hidden]{display:none!important}[role=menuitem],[role=option]{height:30px}</style></head><body>${body}<script type="module">import { behave, listen } from '/parts/index.ts'; listen(); for (const type of ['click', 'keydown', 'pointerover', 'pointerout', 'pointerdown', 'focusin', 'focusout']) document.body.addEventListener(type, behave, true); window.ready = true;</script></body></html>` });
		if (path === '/floating.js') return route.fulfill({ contentType: 'text/javascript', body: FLOATING_STUB });
		if (path === '/parts/choices.ts') return route.fulfill({ contentType: 'text/javascript', body: `export const CHOICES = ${JSON.stringify(choices)};` });
		const text = path === '/parts/registry.ts' ? registry : await readFile(join(PARTS, path.replace(/^\/parts\//, '')), 'utf8');
		return route.fulfill({ contentType: 'text/javascript', body: ts.transpileModule(text, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText });
	});
	await page.goto('http://parts.test/');
	await page.waitForFunction(() => (window as unknown as { ready?: boolean }).ready);
	return page;
}

const settled = (page: Page) => page.evaluate(() => new Promise<void>((done) => setTimeout(() => setTimeout(done))));
// Keys held as a person types them.
async function press(page: Page, key: string): Promise<void> {
	await page.keyboard.down(key);
	await page.waitForTimeout(60);
	await page.keyboard.up(key);
	await settled(page);
}
const state = (page: Page) =>
	page.evaluate(() => {
		const at = document.activeElement;
		const focus = !at || at === document.body ? 'body' : at.matches('[role="menu"], [role="listbox"]') ? 'popup' : (at.getAttribute('data-slot')?.endsWith('trigger') && !at.closest('[role="menu"]') ? `trigger:${at.textContent?.trim()}` : at.textContent?.trim() || at.tagName.toLowerCase());
		const highlighted = [...document.querySelectorAll('[data-highlighted]')].map((e) => e.textContent?.trim()).join('|') || '-';
		const trigger = document.querySelector('[data-slot$="-trigger"]')!;
		return `${trigger.getAttribute('aria-expanded')} focus=${focus} highlighted=${highlighted}`;
	});

// Base UI Menu as convert renders it: the portal keyed by the trigger's id holding the modal menu's inert backdrop, the
// positioner with its focus guard and the popup.
const menu = (items: readonly string[], disabled: readonly string[] = []) => `<main style="height:3000px;padding:100px"><button type="button" id="before">Before</button>
	<button type="button" id="dd" aria-haspopup="menu" aria-expanded="false" data-slot="dropdown-menu-trigger">Open</button><button type="button" id="after">After</button></main>
	<div data-base-ui-portal hidden data-mm-layer="dd"><div role="presentation" data-base-ui-inert style="position:fixed;inset:0;user-select:none"></div><div data-side="bottom" data-align="start" role="presentation" style="position:absolute;left:0;top:0" data-closed><span data-type="inside" aria-hidden="true" tabindex="0" data-base-ui-focus-guard style="position:fixed;width:1px;height:1px"></span><div tabindex="-1" role="menu" aria-labelledby="dd" data-slot="dropdown-menu-content" data-closed>${items.map((t) => `<div role="menuitem" tabindex="-1" data-slot="dropdown-menu-item"${disabled.includes(t) ? ' aria-disabled="true" data-disabled=""' : ''}>${t}</div>`).join('')}</div></div></div>`;

const FRUITS = ['Apple', 'Banana', 'Blueberry', 'Grapes', 'Pineapple'];
const select = `<main style="height:3000px;padding:200px"><button type="button" id="before">Before</button><button type="button" id="base" role="combobox" aria-expanded="false" aria-haspopup="listbox" data-slot="select-trigger"><span data-slot="select-value">Select a fruit</span></button><input id="base-ui-x-hidden-input" tabindex="-1" aria-hidden="true" value="" style="position:fixed;width:1px;height:1px;clip-path:inset(50%)"><button type="button" id="after">After</button></main>
	<div data-base-ui-portal hidden data-mm-layer="base"><div role="presentation" data-base-ui-inert style="position:fixed;inset:0"></div><div data-side="none" data-align="center" role="presentation" style="position:fixed" data-closed><div data-side="none" tabindex="-1" role="presentation" data-slot="select-content" data-closed><div role="listbox" style="position:relative">${FRUITS.map((f) => `<div role="option" aria-selected="false" tabindex="-1" data-slot="select-item"><div>${f}</div></div>`).join('')}</div></div></div></div>`;

test('Base UI menu and select triggers carry data-pressed while their popup is open, as pressableTriggerOpenStateMapping maps it', async () => {
	for (const [markup, port, popup] of [
		[menu(['Profile', 'Billing']), 'base-ui/menu', 'dropdown-menu-trigger'],
		[select, 'base-ui/select', 'select-trigger'],
	] as const) {
		const page = await open(markup, [port]);
		const trigger = page.locator(`[data-slot="${popup}"]`);
		await trigger.focus();
		await press(page, 'Enter');
		assert.deepEqual(await trigger.evaluate((t) => [t.getAttribute('aria-expanded'), t.hasAttribute('data-popup-open'), t.hasAttribute('data-pressed')]), ['true', true, true], port);
		await press(page, 'Escape');
		assert.deepEqual(await trigger.evaluate((t) => [t.getAttribute('aria-expanded'), t.hasAttribute('data-popup-open'), t.hasAttribute('data-pressed')]), ['false', false, false], port);
		await page.close();
	}
	// A dialog's trigger maps only data-popup-open (triggerOpenStateMapping).
	const page = await open(`<button data-slot="dialog-trigger" data-base-ui-click-trigger aria-haspopup="dialog" aria-expanded="false" id="dlg" type="button">Open Dialog</button><div data-mm-layer="dlg" hidden data-base-ui-portal><div role="dialog" data-slot="dialog-content" data-closed tabindex="-1"><button data-slot="dialog-close">Close</button></div></div>`, ['base-ui/dialog']);
	await page.getByText('Open Dialog').click();
	assert.deepEqual(await page.locator('#dlg').evaluate((t) => [t.hasAttribute('data-popup-open'), t.hasAttribute('data-pressed')]), [true, false]);
	await page.close();
});

test('an open Base UI menu or select locks page scroll as useScrollLock does with overlay scrollbars, and puts it back on close', async () => {
	for (const [markup, port, slot] of [
		[menu(['Profile', 'Billing']), 'base-ui/menu', 'dropdown-menu-trigger'],
		[select, 'base-ui/select', 'select-trigger'],
	] as const) {
		const page = await open(markup, [port]);
		// Headless Chromium's scroll bars take no width: the overlay branch, which hides overflow on the scrolling element.
		assert.equal(await page.evaluate(() => innerWidth - document.documentElement.clientWidth), 0);
		await page.locator(`[data-slot="${slot}"]`).focus();
		await press(page, 'Enter');
		assert.deepEqual(await page.evaluate(() => [document.body.style.overflowY, document.body.style.overflowX, document.documentElement.style.overflowY, document.documentElement.style.scrollbarGutter]), ['hidden', 'hidden', '', ''], port);
		await press(page, 'Escape');
		assert.deepEqual(await page.evaluate(() => [document.body.style.overflowY, document.body.style.overflowX]), ['', ''], port);
		await page.close();
	}
});

test('Tab in an open Base UI menu or select closes it and focuses what follows its trigger; Shift+Tab closes it onto the trigger', async () => {
	for (const [markup, port, slot] of [
		[menu(['Profile', 'Billing']), 'base-ui/menu', 'dropdown-menu-trigger'],
		[select, 'base-ui/select', 'select-trigger'],
	] as const) {
		const page = await open(markup, [port]);
		const trigger = page.locator(`[data-slot="${slot}"]`);
		await trigger.focus();
		await press(page, 'Enter');
		assert.equal(await trigger.getAttribute('aria-expanded'), 'true', port);
		await press(page, 'Tab');
		assert.equal(await trigger.getAttribute('aria-expanded'), 'false', port);
		assert.equal(await page.evaluate(() => document.activeElement?.id), 'after', port);
		await trigger.focus();
		await press(page, 'Enter');
		await page.keyboard.down('Shift');
		await press(page, 'Tab');
		await page.keyboard.up('Shift');
		assert.equal(await trigger.getAttribute('aria-expanded'), 'false', port);
		assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('data-slot')), slot, port);
		await page.close();
	}
});

test('Base UI menu keys: opening skips disabled items, the arrows loop over every item, End reaches a disabled last one, ArrowUp opens at the last', async () => {
	const page = await open(menu(['Disabled first', 'Profile', 'Billing', 'Settings', 'API'], ['Disabled first', 'API']), ['base-ui/menu']);
	await page.locator('#dd').focus();
	const steps: [string, string][] = [
		['Enter', 'true focus=Profile highlighted=Profile'],
		['ArrowDown', 'true focus=Billing highlighted=Billing'],
		['End', 'true focus=API highlighted=API'],
		['ArrowDown', 'true focus=Disabled first highlighted=Disabled first'],
		['ArrowUp', 'true focus=API highlighted=API'],
		['Home', 'true focus=Disabled first highlighted=Disabled first'],
		['Escape', 'false focus=trigger:Open highlighted=-'],
		['ArrowUp', 'true focus=Settings highlighted=Settings'],
		['Escape', 'false focus=trigger:Open highlighted=-'],
		[' ', 'true focus=Profile highlighted=Profile'],
	];
	for (const [key, expected] of steps) {
		await press(page, key);
		assert.equal(await state(page), expected, `after ${key}`);
	}
	await page.close();
});

test('Base UI menu typeahead: a letter moves to the next item starting with it, the same letter again cycles, a word matches as typed', async () => {
	const page = await open(menu(['Profile', 'Billing', 'Settings', 'Support', 'Sign out']), ['base-ui/menu']);
	await page.locator('#dd').focus();
	await press(page, 'Enter');
	for (const [key, expected] of [
		['s', 'Settings'],
		['s', 'Support'],
		['s', 'Sign out'],
		['s', 'Settings'],
	] as const) {
		await press(page, key);
		assert.equal(await state(page), `true focus=${expected} highlighted=${expected}`, `after ${key}`);
	}
	await page.waitForTimeout(600);
	await press(page, 'b');
	assert.equal(await state(page), 'true focus=Billing highlighted=Billing');
	await page.waitForTimeout(600);
	for (const key of ['s', 'i']) await press(page, key);
	assert.equal(await state(page), 'true focus=Sign out highlighted=Sign out');
	// Space continues a typing session rather than choosing the item.
	await page.waitForTimeout(600);
	for (const key of ['s', 'i', 'g', 'n', ' ']) await press(page, key);
	assert.equal(await state(page), 'true focus=Sign out highlighted=Sign out');
	await page.close();
});

test('a Base UI menu opened by a press focuses its popup with nothing highlighted, each time; ArrowDown then highlights the first item', async () => {
	const page = await open(menu(['Profile', 'Billing', 'Settings']), ['base-ui/menu']);
	await page.locator('#dd').click();
	assert.equal(await state(page), 'true focus=popup highlighted=-');
	await page.getByText('Billing').hover();
	assert.equal(await state(page), 'true focus=Billing highlighted=Billing');
	await page.getByText('Billing').click();
	await settled(page);
	assert.equal(await state(page), 'false focus=trigger:Open highlighted=-');
	await page.locator('#dd').click();
	assert.equal(await state(page), 'true focus=popup highlighted=-');
	await press(page, 'ArrowDown');
	assert.equal(await state(page), 'true focus=Profile highlighted=Profile');
	await page.close();
});

test('the pointer leaving a Base UI menu item for the menu around it unhighlights it and focuses the menu', async () => {
	const page = await open(menu(['Profile', 'Billing']).replace('data-slot="dropdown-menu-content"', 'data-slot="dropdown-menu-content" style="padding:20px"'), ['base-ui/menu']);
	await page.locator('#dd').click();
	await page.getByText('Profile').hover();
	assert.equal(await state(page), 'true focus=Profile highlighted=Profile');
	const box = (await page.locator('[role="menu"]').boundingBox())!;
	await page.mouse.move(box.x + 5, box.y + 5, { steps: 3 });
	await settled(page);
	assert.equal(await state(page), 'true focus=popup highlighted=-');
	await page.close();
});

test("a Base UI submenu's trigger is an item of its menu: the arrows move past it and a press on it does not close the menu", async () => {
	const page = await open(menu(['Team', 'Invite users', 'New Team']).replace('data-slot="dropdown-menu-item">Invite users', 'data-slot="dropdown-menu-sub-trigger" aria-haspopup="menu" aria-expanded="false">Invite users'), ['base-ui/menu']);
	await page.locator('#dd').focus();
	for (const [key, expected] of [
		['Enter', 'true focus=Team highlighted=Team'],
		['ArrowDown', 'true focus=Invite users highlighted=Invite users'],
		['ArrowDown', 'true focus=New Team highlighted=New Team'],
	] as const) {
		await press(page, key);
		assert.equal(await state(page), expected, `after ${key}`);
	}
	await page.getByText('Invite users').click();
	await settled(page);
	assert.match(await state(page), /^true /);
	await page.close();
});

test('a Base UI menu that opens under a still pointer highlights nothing until the pointer moves, as Base UI highlights on mousemove', async () => {
	const page = await open(menu(['Profile', 'Billing']).replace('style="position:absolute;left:0;top:0"', 'style="position:absolute;left:0;top:0;width:300px"'), ['base-ui/menu']);
	await page.evaluate(() => {
		const t = document.getElementById('dd')!;
		Object.assign(t.style, { position: 'fixed', left: '0', top: '0', width: '300px', height: '40px', zIndex: '1' });
	});
	await page.mouse.move(150, 20);
	await page.mouse.down();
	await page.mouse.up();
	// The menu's first item now lies under the pointer.
	await page.evaluate(() => (document.getElementById('dd')!.style.pointerEvents = 'none'));
	await page.waitForTimeout(100);
	assert.equal(await state(page), 'true focus=popup highlighted=-');
	await page.mouse.move(152, 22);
	await settled(page);
	assert.equal(await state(page), 'true focus=Profile highlighted=Profile');
	await page.close();
});

test('the keys scroll the Base UI menu item they move to into view, as useListNavigation does for keyboard moves', async () => {
	const page = await open(menu(Array.from({ length: 30 }, (_, i) => `Item ${i + 1}`)), ['base-ui/menu']);
	await page.locator('#dd').focus();
	await press(page, 'Enter');
	const at = await page.evaluate(() => scrollY);
	await press(page, 'ArrowUp');
	assert.equal(await state(page), 'true focus=Item 30 highlighted=Item 30');
	assert.ok((await page.evaluate(() => scrollY)) > at, 'the page scrolled the last item into view');
	await page.close();
});

test('the side arrows in an open Base UI menubar menu open the next menu focused, with nothing highlighted', async () => {
	const bar = (id: string, text: string) => `<button type="button" role="menuitem" id="${id}" aria-haspopup="menu" aria-expanded="false" data-slot="menubar-trigger">${text}</button>`;
	const layer = (id: string, items: readonly string[]) => `<div data-base-ui-portal hidden data-mm-layer="${id}"><div role="presentation" style="position:absolute;left:0;top:0" data-closed><div tabindex="-1" role="menu" aria-labelledby="${id}" data-slot="menubar-content" data-closed>${items.map((t) => `<div role="menuitem" tabindex="-1" data-slot="menubar-item">${t}</div>`).join('')}</div></div></div>`;
	const page = await open(`<main style="padding:100px"><div role="menubar" data-slot="menubar">${bar('m1', 'File')}${bar('m2', 'Edit')}</div></main>${layer('m1', ['New Tab', 'Print'])}${layer('m2', ['Undo', 'Redo'])}`, ['base-ui/menu']);
	await page.locator('#m1').focus();
	await press(page, 'ArrowDown');
	assert.equal(await page.evaluate(() => document.activeElement?.textContent), 'New Tab');
	await press(page, 'ArrowRight');
	assert.deepEqual(await page.evaluate(() => [document.getElementById('m2')!.getAttribute('aria-expanded'), document.activeElement?.getAttribute('aria-labelledby'), document.querySelectorAll('[data-highlighted]').length]), ['true', 'm2', 0]);
	await page.close();
});

test('the arrows, Home and End rove focus and the Tab stop between closed Base UI menubar triggers, looping, as its CompositeRoot does', async () => {
	const bar = (id: string, text: string, i: number) => `<button type="button" role="menuitem" id="${id}" tabindex="${i ? -1 : 0}" aria-haspopup="menu" aria-expanded="false" data-slot="menubar-trigger">${text}</button>`;
	const page = await open(`<main style="padding:100px"><div role="menubar" data-slot="menubar">${['File', 'Edit', 'View'].map((t, i) => bar(`m${i}`, t, i)).join('')}</div></main>`, ['base-ui/menu']);
	await page.locator('#m0').focus();
	const at = () => page.evaluate(() => `${document.activeElement?.textContent} ${[...document.querySelectorAll('[data-slot="menubar-trigger"]')].map((t) => (t as HTMLElement).tabIndex).join(',')}`);
	for (const [key, expected] of [
		['ArrowRight', 'Edit -1,0,-1'],
		['ArrowRight', 'View -1,-1,0'],
		['ArrowRight', 'File 0,-1,-1'],
		['ArrowLeft', 'View -1,-1,0'],
		['Home', 'File 0,-1,-1'],
		['End', 'View -1,-1,0'],
	] as const) {
		await press(page, key);
		assert.equal(await at(), expected, `after ${key}`);
	}
	await page.close();
});
