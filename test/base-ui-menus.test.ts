// The Base UI menu and select ports on markup as convert renders it, driven through parts/index.ts in a real browser,
// against what @base-ui/react 1.6 (Menu, Select, the floating-ui hooks it ships, @base-ui/utils useScrollLock) does.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { chromium, type Browser, type Page } from 'playwright';
import ts from 'typescript';
import { registryModule } from '../src/convert/parts.ts';

const PARTS = join(import.meta.dirname, '..', 'parts');
// Placement is not under test: a popup goes to the page's corner, a submenu (placed on a side) beside its trigger.
const FLOATING_STUB = `export const computePosition = async (anchor, floating, o) => { if (!/^(right|left)/.test(o.placement)) return { x: 0, y: 0, placement: 'bottom', middlewareData: {} }; const r = anchor.getBoundingClientRect(); return { x: r.right, y: r.top, placement: o.placement, middlewareData: {} }; };
export const autoUpdate = () => () => {};
export const arrow = () => ({}), flip = () => ({}), hide = () => ({}), limitShift = () => ({}), offset = () => ({}), shift = () => ({}), size = () => ({});`;

let browser: Browser;
before(async () => {
	browser = await chromium.launch();
});
after(() => browser.close());

async function open(body: string, ports: readonly string[], choices: Record<string, unknown> = {}, floating = FLOATING_STUB): Promise<Page> {
	const page = await browser.newPage({ viewport: { width: 1000, height: 800 } });
	const registry = registryModule(ports, '.');
	await page.route('http://parts.test/**', async (route) => {
		const path = new URL(route.request().url()).pathname;
		if (path === '/') return route.fulfill({ contentType: 'text/html; charset=utf-8', body: `<!doctype html><html><head><script type="importmap">{"imports":{"@floating-ui/dom":"/floating.js"}}</script><style>*{box-sizing:border-box}body{margin:0;font:16px sans-serif}[hidden]{display:none!important}[role=menuitem],[role=option]{height:30px}</style></head><body>${body}<script type="module">import { behave, listen } from '/parts/registry.ts'; listen(); for (const type of ['click', 'keydown', 'pointerover', 'pointerout', 'pointerdown', 'focusin', 'focusout']) document.body.addEventListener(type, behave, true); window.ready = true;</script></body></html>` });
		if (path === '/floating.js') return route.fulfill({ contentType: 'text/javascript', body: floating });
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

test('a Base UI menu trigger names its popup in aria-controls while the popup is mounted, as MenuTrigger does', async () => {
	const page = await open(menu(FRUITS).replace('role="menu" aria-labelledby="dd"', 'role="menu" id="dd-popup" aria-labelledby="dd"'), ['base-ui/menu']);
	const controls = () => page.evaluate(() => document.getElementById('dd')!.getAttribute('aria-controls'));
	assert.equal(await controls(), null);
	await page.click('#dd');
	await settled(page);
	assert.equal(await controls(), 'dd-popup');
	await press(page, 'Escape');
	await page.waitForTimeout(100);
	assert.equal(await controls(), null);
	await page.close();
});

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

const disabledSelect = select.replace('data-slot="select-item"><div>Grapes', 'data-slot="select-item" aria-disabled="true" data-disabled=""><div>Grapes').replace(/data-slot="select-item"><div>(\w+)</g, (_, f: string) => `data-slot="select-item" data-mm-value="${f.toLowerCase()}"><div>${f}<`);
const selectState = (page: Page) => page.evaluate(() => `${document.querySelector('[data-slot="select-value"]')!.textContent} input=${(document.getElementById('base-ui-x-hidden-input') as HTMLInputElement).value}`);
async function withValue(page: Page): Promise<void> {
	await page.evaluate(() => document.querySelector('[data-slot="select-trigger"]')!.addEventListener('mmchoose', (e) => (document.querySelector('[data-slot="select-value"]')!.textContent = (e as CustomEvent<string>).detail)));
}

test('Base UI select keys: ArrowUp opens at the last enabled option, the arrows stop at the ends and on disabled options, which cannot be chosen', async () => {
	const page = await open(disabledSelect.replace('<div>Pineapple', '<div>Pineapple</div></div><div role="option" aria-selected="false" tabindex="-1" data-slot="select-item" aria-disabled="true" data-disabled=""><div>Kiwi'), ['base-ui/select']);
	await page.locator('#base').focus();
	for (const [key, expected] of [
		['ArrowUp', 'true focus=Pineapple highlighted=Pineapple'],
		['ArrowDown', 'true focus=Kiwi highlighted=Kiwi'],
		['ArrowDown', 'true focus=Kiwi highlighted=Kiwi'],
		['Enter', 'true focus=Kiwi highlighted=Kiwi'],
		['Home', 'true focus=Apple highlighted=Apple'],
		['ArrowUp', 'true focus=Apple highlighted=Apple'],
		['Escape', 'false focus=trigger:Select a fruit highlighted=-'],
		['ArrowDown', 'true focus=Apple highlighted=Apple'],
	] as const) {
		await press(page, key);
		assert.equal((await state(page)).replace(/ highlighted=.*\|/, ' highlighted='), expected, `after ${key}`);
	}
	await page.close();
});

test("choosing a Base UI select option shows the label convert recorded for it, not the option's own text, as Select.Value shows the Root's items' label", async () => {
	const months = select.replace(/data-slot="select-item"><div>(\w+)</g, (_, f: string) => (f === 'Banana' ? 'data-slot="select-item" data-mm-value="02" data-mm-text="02"><div>٠٢<' : `data-slot="select-item"><div>${f}<`));
	const page = await open(months, ['base-ui/select']);
	await withValue(page);
	await page.locator('#base').click();
	await page.locator('[role="option"]', { hasText: '٠٢' }).click();
	await settled(page);
	assert.equal(await selectState(page), '02 input=02');
	// Reopened, the chosen option is the one selected.
	await press(page, 'Enter');
	assert.equal(await page.locator('[role="option"][aria-selected="true"]').textContent(), '٠٢');
	await page.close();
});

test('Base UI select typeahead: open, a letter highlights the next enabled option starting with it; closed, it chooses it; the hidden input takes the value', async () => {
	const page = await open(disabledSelect, ['base-ui/select']);
	await withValue(page);
	await page.locator('#base').focus();
	await press(page, 'Enter');
	for (const [key, expected] of [
		['b', 'Banana'],
		['b', 'Blueberry'],
		['g', 'Blueberry'],
	] as const) {
		await press(page, key);
		assert.match(await state(page), new RegExp(`^true focus=${expected} `), `after ${key}`);
	}
	await page.waitForTimeout(600);
	await press(page, 'p');
	await press(page, 'Enter');
	assert.equal(await selectState(page), 'Pineapple input=pineapple');
	assert.match(await state(page), /^false focus=trigger/);
	await page.waitForTimeout(600);
	await press(page, 'a');
	assert.equal(await selectState(page), 'Apple input=apple');
	assert.match(await state(page), /^false /, 'typing on a closed select does not open it');
	await page.close();
});

test("a closed Base UI select's backdrop goes inert at once and away once the list's exit ends, as InternalBackdrop unmounts with the list", async () => {
	const page = await open(select, ['base-ui/select']);
	const backdrop = () => page.evaluate(() => { const b = document.querySelector<HTMLElement>('[data-base-ui-inert]')!; return `${b.hidden ? 'hidden' : 'shown'}${b.hasAttribute('inert') ? ' inert' : ''}`; });
	await page.locator('#base').focus();
	await press(page, 'Enter');
	assert.equal(await backdrop(), 'shown');
	await press(page, 'Escape');
	await page.waitForTimeout(100);
	assert.equal(await backdrop(), 'hidden inert');
	await press(page, 'Enter');
	assert.equal(await backdrop(), 'shown');
	await page.close();
});

test('the pointer leaving a Base UI select option for no other unhighlights it and focuses the select popup', async () => {
	const page = await open(select, ['base-ui/select']);
	await page.locator('#base').click();
	await page.locator('[role="option"]', { hasText: 'Banana' }).hover();
	assert.match(await state(page), /^true focus=Banana highlighted=Banana/);
	await page.mouse.move(990, 790, { steps: 3 });
	await settled(page);
	assert.equal(await page.evaluate(() => [document.activeElement?.getAttribute('data-slot'), document.querySelectorAll('[data-highlighted]').length].join(' ')), 'select-content 0');
	await page.close();
});

// A dropdown menu with a submenu as convert renders it: the submenu's own portal is a layer keyed by its menu's key and
// its trigger's place, which its trigger carries (captureBaseSubmenus).
const withSub = (dir = 'ltr') =>
	menu(['Team', 'Invite users', 'New Team'])
		.replace('<main ', `<main dir="${dir}" `)
		.replace('<div tabindex="-1" role="menu"', `<div tabindex="-1" dir="${dir}" role="menu"`)
		.replace('data-slot="dropdown-menu-item">Invite users', 'data-slot="dropdown-menu-sub-trigger" id="sub1" aria-haspopup="menu" aria-expanded="false" data-mm-key="dd-sub-1" style="display:block;width:200px">Invite users') +
	`<div data-base-ui-portal hidden data-mm-layer="dd-sub-1"><div data-side="right" data-align="start" data-nested role="presentation" style="position:absolute;left:400px;top:0" data-closed><div tabindex="-1" dir="${dir}" role="menu" data-nested aria-labelledby="sub1" data-slot="dropdown-menu-sub-content" data-closed style="width:200px">${['Email', 'Message'].map((t) => `<div role="menuitem" tabindex="-1" data-slot="dropdown-menu-item">${t}</div>`).join('')}</div></div></div>`;
const subState = (page: Page) =>
	page.evaluate(() => {
		const sub = document.getElementById('sub1')!;
		const open = !document.querySelector<HTMLElement>('[data-mm-layer="dd-sub-1"]')!.hidden && sub.getAttribute('aria-expanded') === 'true';
		const at = document.activeElement;
		const focus = at?.matches('[role="menu"]') ? (at.hasAttribute('data-nested') ? 'submenu' : 'menu') : at?.textContent?.trim();
		const highlighted = [...document.querySelectorAll('[data-highlighted]')].map((e) => e.textContent?.trim()).join('|') || '-';
		return `menu=${document.getElementById('dd')!.getAttribute('aria-expanded')} sub=${open} focus=${focus} highlighted=${highlighted}${sub.hasAttribute('data-popup-open') ? ' popup-open' : ''}${sub.hasAttribute('data-pressed') ? ' pressed' : ''}`;
	});

test('a Base UI submenu from the keyboard: ArrowRight, Enter or Space open it on its first item, ArrowLeft and Escape close it back onto its trigger', async () => {
	const page = await open(withSub(), ['base-ui/menu']);
	await page.locator('#dd').focus();
	for (const [key, expected] of [
		['Enter', 'menu=true sub=false focus=Team highlighted=Team'],
		['ArrowDown', 'menu=true sub=false focus=Invite users highlighted=Invite users'],
		['ArrowRight', 'menu=true sub=true focus=Email highlighted=Email popup-open'],
		['ArrowDown', 'menu=true sub=true focus=Message highlighted=Message popup-open'],
		['ArrowLeft', 'menu=true sub=false focus=Invite users highlighted=Invite users'],
		['Enter', 'menu=true sub=true focus=Email highlighted=Email popup-open'],
		['Escape', 'menu=true sub=false focus=Invite users highlighted=Invite users'],
		[' ', 'menu=true sub=true focus=Email highlighted=Email popup-open'],
		['Tab', 'menu=true sub=false focus=Invite users highlighted=Invite users'],
		['ArrowRight', 'menu=true sub=true focus=Email highlighted=Email popup-open'],
		['Enter', 'menu=false sub=false focus=Open highlighted=-'],
	] as const) {
		await press(page, key);
		assert.equal(await subState(page), expected, `after ${key}`);
	}
	await page.close();
});

test('a Base UI submenu right to left opens with ArrowLeft and closes with ArrowRight', async () => {
	const page = await open(withSub('rtl'), ['base-ui/menu']);
	await page.locator('#dd').focus();
	for (const key of ['Enter', 'ArrowDown']) await press(page, key);
	await press(page, 'ArrowLeft');
	assert.equal(await subState(page), 'menu=true sub=true focus=Email highlighted=Email popup-open');
	await press(page, 'ArrowRight');
	assert.equal(await subState(page), 'menu=true sub=false focus=Invite users highlighted=Invite users');
	await page.close();
});

test('a Base UI submenu opens once the pointer rests on its trigger, focus staying there; choosing in it closes every menu', async () => {
	const page = await open(withSub(), ['base-ui/menu']);
	await page.locator('#dd').click();
	await page.getByText('Invite users').hover();
	await page.waitForTimeout(250);
	assert.equal(await subState(page), 'menu=true sub=true focus=Invite users highlighted=Invite users popup-open');
	const box = (await page.getByText('Message').boundingBox())!;
	await page.mouse.move(box.x + 20, box.y + box.height / 2, { steps: 4 });
	await settled(page);
	assert.equal(await subState(page), 'menu=true sub=true focus=Message highlighted=Message popup-open');
	await page.getByText('Message').click();
	await settled(page);
	assert.equal(await subState(page), 'menu=false sub=false focus=Open highlighted=-');
	assert.equal(await page.evaluate(() => document.querySelector<HTMLElement>('[data-slot="dropdown-menu-content"]')!.style.pointerEvents), '');
	await page.close();
});

test("a mouse press on a Base UI submenu trigger does not open it: the pointer's 100 ms rest does, as useClick ignores the mouse with openOnHover", async () => {
	const page = await open(withSub(), ['base-ui/menu']);
	await page.locator('#dd').click();
	const box = (await page.getByText('Invite users').boundingBox())!;
	await page.mouse.move(box.x + 20, box.y + box.height / 2);
	await page.mouse.down();
	await page.mouse.up();
	await settled(page);
	assert.match(await subState(page), /sub=false/, 'still closed right after the press');
	await page.waitForTimeout(250);
	assert.match(await subState(page), /sub=true/, 'open once the pointer rested 100 ms');
	await page.close();
});

test('the pointer leaving a Base UI submenu trigger away from its submenu closes the submenu, with nothing highlighted', async () => {
	const page = await open(withSub(), ['base-ui/menu']);
	await page.locator('#dd').click();
	await page.getByText('Invite users').hover();
	await page.waitForTimeout(250);
	assert.match(await subState(page), /sub=true/);
	// The jump a test pointer makes: while the submenu shields its menu, New Team is not hovered.
	const box = (await page.getByText('New Team').boundingBox())!;
	await page.mouse.move(box.x + 30, box.y + box.height / 2);
	await settled(page);
	assert.equal(await subState(page), 'menu=true sub=false focus=menu highlighted=-');
	await page.mouse.move(box.x + 40, box.y + box.height / 2);
	await settled(page);
	assert.equal(await subState(page), 'menu=true sub=false focus=New Team highlighted=New Team');
	await page.close();
});

test('a press in the menu a Base UI submenu opened from closes only the submenu; a press outside both closes both', async () => {
	const page = await open(withSub().replace('data-slot="dropdown-menu-content" data-closed', 'data-slot="dropdown-menu-content" data-closed style="padding:20px"'), ['base-ui/menu']);
	await page.locator('#dd').focus();
	for (const key of ['Enter', 'ArrowDown', 'ArrowRight']) await press(page, key);
	assert.match(await subState(page), /sub=true/);
	await settled(page);
	const box = (await page.locator('[data-slot="dropdown-menu-content"]').boundingBox())!;
	await page.mouse.click(box.x + box.width - 5, box.y + box.height - 5);
	await settled(page);
	assert.match(await subState(page), /^menu=true sub=false focus=menu/);
	for (const key of ['ArrowDown', 'ArrowDown', 'ArrowRight']) await press(page, key);
	assert.match(await subState(page), /^menu=true sub=true/);
	await settled(page);
	await page.mouse.click(990, 790);
	await settled(page);
	assert.match(await subState(page), /^menu=false sub=false/);
	await page.close();
});

test('a Base UI context menu opened under the pointer highlights nothing until it moves; ArrowLeft closes it, as its root is nested in the trigger area', async () => {
	const page = await open(
		`<main style="padding:20px"><div data-slot="context-menu-trigger" data-mm-key="ctx" style="width:600px;height:300px;border:1px dashed">Right click here</div></main>
		<div data-base-ui-portal hidden data-mm-layer="ctx"><div role="presentation" style="position:absolute;left:0;top:0" data-closed><div tabindex="-1" role="menu" data-slot="context-menu-content" data-closed style="width:200px">${['Back', 'Forward', 'Reload'].map((t) => `<div role="menuitem" tabindex="-1" data-slot="context-menu-item">${t}</div>`).join('')}</div></div></div>`,
		['base-ui/context-menu'],
	);
	// The stub places the menu at the page's corner: under the pointer that opens it.
	await page.mouse.click(30, 30, { button: 'right' });
	await settled(page);
	const st = () => page.evaluate(() => `${!document.querySelector<HTMLElement>('[data-mm-layer="ctx"]')!.hidden} focus=${document.activeElement?.getAttribute('role') ?? document.activeElement?.tagName} highlighted=${[...document.querySelectorAll('[data-highlighted]')].map((e) => e.textContent).join('|') || '-'} pressed=${document.querySelector('[data-slot="context-menu-trigger"]')!.hasAttribute('data-pressed')}`);
	assert.equal(await st(), 'true focus=menu highlighted=- pressed=true');
	await press(page, 'ArrowDown');
	assert.equal(await st(), 'true focus=menuitem highlighted=Back pressed=true');
	await press(page, 'ArrowLeft');
	assert.equal(await st(), 'false focus=BODY highlighted=- pressed=false');
	await page.close();
});

test("a click on a Base UI context menu's submenu trigger leaves the menu open and its submenu opens; choosing in the submenu closes both", async () => {
	const page = await open(
		`<main style="padding:20px"><div data-slot="context-menu-trigger" data-mm-key="ctx" style="width:600px;height:300px;border:1px dashed">Right click here</div></main>
		<div data-base-ui-portal hidden data-mm-layer="ctx"><div role="presentation" style="position:absolute;left:0;top:0" data-closed><div tabindex="-1" role="menu" data-slot="context-menu-content" data-closed style="width:200px"><div role="menuitem" tabindex="-1" data-slot="context-menu-item">Back</div><div role="menuitem" tabindex="-1" id="sub1" aria-haspopup="menu" aria-expanded="false" data-mm-key="ctx-sub-1" data-slot="context-menu-sub-trigger">More Tools</div></div></div></div>
		<div data-base-ui-portal hidden data-mm-layer="ctx-sub-1"><div data-side="right" data-align="start" data-nested role="presentation" style="position:absolute;left:400px;top:0" data-closed><div tabindex="-1" role="menu" data-side="right" data-align="start" data-nested aria-labelledby="sub1" data-slot="context-menu-sub-content" data-closed style="width:200px">${['Save Page', 'Developer Tools'].map((t) => `<div role="menuitem" tabindex="-1" data-slot="context-menu-item">${t}</div>`).join('')}</div></div></div>`,
		['base-ui/context-menu'],
	);
	const st = () => page.evaluate(() => `menu=${!document.querySelector<HTMLElement>('[data-mm-layer="ctx"]')!.hidden} sub=${!document.querySelector<HTMLElement>('[data-mm-layer="ctx-sub-1"]')!.hidden && document.getElementById('sub1')!.getAttribute('aria-expanded') === 'true'}`);
	await page.mouse.click(30, 30, { button: 'right' });
	await settled(page);
	assert.equal(await st(), 'menu=true sub=false');
	await page.getByText('More Tools').click();
	await page.waitForTimeout(250);
	assert.equal(await st(), 'menu=true sub=true');
	const box = (await page.getByText('Save Page').boundingBox())!;
	await page.mouse.move(box.x + 20, box.y + box.height / 2, { steps: 4 });
	await settled(page);
	assert.equal(await st(), 'menu=true sub=true');
	await page.getByText('Save Page').click();
	await settled(page);
	assert.equal(await st(), 'menu=false sub=false');
	await page.close();
});

test('a Base UI select placed below its trigger (no alignItemWithTrigger) stays aligned to its start, as its positioner says', async () => {
	// Floating UI's autoUpdate runs a placement again later (a resize, a layout shift): only the select's own may.
	const floating = `export const computePosition = async (anchor, floating, o) => ({ x: o.placement.endsWith('-start') ? 10 : 99, y: 0, placement: o.placement, middlewareData: {} });
export const autoUpdate = (a, f, update) => { const t = setTimeout(update, 50); return () => clearTimeout(t); };
export const arrow = () => ({}), flip = () => ({}), hide = () => ({}), limitShift = () => ({}), offset = () => ({}), shift = () => ({}), size = () => ({});`;
	const page = await open(`<main style="padding:100px"><button type="button" id="cur" role="combobox" aria-haspopup="listbox" aria-expanded="false" data-slot="select-trigger">$</button></main>
	<div data-base-ui-portal hidden data-mm-layer="cur"><div role="presentation" data-base-ui-inert style="position:fixed;inset:0"></div><div data-side="bottom" data-align="start" role="presentation" style="position:absolute;left:0;top:0" data-closed><div tabindex="-1" role="presentation" data-slot="select-content" data-closed><div role="listbox"><div role="option" aria-selected="true" tabindex="-1" data-slot="select-item"><div>$ US Dollar</div></div><div role="option" aria-selected="false" tabindex="-1" data-slot="select-item"><div>€ Euro</div></div></div></div></div></div>`, ['base-ui/select'], {}, floating);
	await page.locator('#cur').click();
	await page.waitForTimeout(200);
	assert.equal(await page.evaluate(() => document.querySelector<HTMLElement>('[data-mm-layer="cur"] > [data-side]')!.style.transform), 'translate(10px, 0px)');
	await page.close();
});

// Floating UI as the part calls it: which element anchors the popup and the offsets it is placed with.
const RECORDING_FLOATING = `export const computePosition = async (anchor, floating, o) => { window.placed = { anchor: anchor.getAttribute('data-slot') ?? anchor.tagName, placement: o.placement, middleware: o.middleware.map((m) => m && m.options) }; return { x: 0, y: 0, placement: o.placement, middlewareData: {} }; };
export const autoUpdate = () => () => {};
export const arrow = () => ({}), flip = () => ({}), hide = () => ({}), limitShift = () => ({}), size = () => ({}), shift = () => ({});
export const offset = (options) => ({ options });`;
const combo = (input: string, content: string) => `<main style="padding:100px">${input}</main><div data-base-ui-portal hidden data-mm-layer="c1"><div role="presentation" data-side="bottom" data-align="start" style="position:absolute"><div data-slot="combobox-content" data-side="bottom" data-align="start" ${content} data-closed><div role="listbox" id="c1-list"><div role="option" aria-selected="false" tabindex="-1">Next.js</div></div></div></div></div>`;

test("a Base UI combobox with chips is placed off its chips, the anchor shadcn hands its content (data-chips)", async () => {
	const page = await open(combo('<div data-slot="combobox-chips" style="width:320px"><span>chip</span><input id="c1" role="combobox" aria-haspopup="listbox" aria-expanded="false" data-slot="combobox-chip-input"></div>', 'data-chips="true"'), ['base-ui/combobox'], {}, RECORDING_FLOATING);
	await page.locator('#c1').click();
	await page.waitForTimeout(100);
	assert.equal(await page.evaluate(() => (window as unknown as { placed: { anchor: string } }).placed.anchor), 'combobox-chips');
	await page.close();
});

test("a Base UI combobox's own alignOffset (convert reads it per instance) moves its popup along its side", async () => {
	const page = await open(combo('<div data-slot="input-group"><input id="c1" role="combobox" aria-haspopup="listbox" aria-expanded="false" data-slot="input-group-control"></div>', 'data-chips="false" data-mm-align-offset="-28" data-mm-side-offset="6"'), ['base-ui/combobox'], {}, RECORDING_FLOATING);
	await page.locator('#c1').click();
	await page.waitForTimeout(100);
	const placed = await page.evaluate(() => (window as unknown as { placed: { anchor: string; middleware: unknown[] } }).placed);
	assert.equal(placed.anchor, 'input-group-control');
	assert.deepEqual(placed.middleware[0], { mainAxis: 6, crossAxis: -28, alignmentAxis: -28 });
	await page.close();
});

// A context menu with a plain item, a checkbox and a radio item; `marks` adds convert's per-instance closeOnClick.
const choiceMenu = (marks: Record<string, string> = {}) => `<main style="padding:20px"><div data-slot="context-menu-trigger" data-mm-key="ctx" style="width:600px;height:300px;border:1px dashed">Right click here</div></main>
	<div data-base-ui-portal hidden data-mm-layer="ctx"><div role="presentation" style="position:absolute;left:0;top:0" data-closed><div tabindex="-1" role="menu" data-slot="context-menu-content" data-closed style="width:200px">${[
		['menuitem', 'Back'],
		['menuitemcheckbox', 'Show Full URLs'],
		['menuitemradio', 'Colm Tuite'],
	]
		.map(([role, t]) => `<div role="${role}" tabindex="-1"${role === 'menuitem' ? '' : ' aria-checked="false"'}${marks[t!] === undefined ? '' : ` data-mm-close-on-click="${marks[t!]}"`}>${t}</div>`)
		.join('')}</div></div></div>`;

test("a press on a Base UI context menu's checkbox or radio item leaves the menu open, a plain item closes it, as each item's closeOnClick default says", async () => {
	const page = await open(choiceMenu(), ['base-ui/context-menu']);
	const shown = () => page.evaluate(() => !document.querySelector<HTMLElement>('[data-mm-layer="ctx"]')!.hidden);
	await page.mouse.click(30, 30, { button: 'right' });
	await settled(page);
	for (const item of ['Show Full URLs', 'Colm Tuite']) {
		await page.getByText(item).click();
		await settled(page);
		assert.equal(await shown(), true, item);
	}
	await page.getByText('Back').click();
	await settled(page);
	assert.equal(await shown(), false);
	await page.close();
});

test('a Base UI menu item given closeOnClick, as convert writes it per instance, closes or keeps the menu open as told', async () => {
	const page = await open(choiceMenu({ 'Show Full URLs': 'true', Back: 'false' }), ['base-ui/context-menu']);
	const shown = () => page.evaluate(() => !document.querySelector<HTMLElement>('[data-mm-layer="ctx"]')!.hidden);
	await page.mouse.click(30, 30, { button: 'right' });
	await settled(page);
	await page.getByText('Back').click();
	await settled(page);
	assert.equal(await shown(), true);
	await page.getByText('Show Full URLs').click();
	await settled(page);
	assert.equal(await shown(), false);
	await page.close();
});

test('a Base UI dropdown radio item given closeOnClick closes the menu; one without it keeps it open', async () => {
	const page = await open(menu(['Apple', 'Banana']).replace('<div role="menuitem" tabindex="-1" data-slot="dropdown-menu-item">Apple', '<div role="menuitemradio" aria-checked="false" tabindex="-1" data-mm-close-on-click="true">Apple').replace('<div role="menuitem" tabindex="-1" data-slot="dropdown-menu-item">Banana', '<div role="menuitemradio" aria-checked="false" tabindex="-1">Banana'), ['base-ui/menu']);
	await page.getByText('Open').click();
	await settled(page);
	await page.getByText('Banana').click();
	await settled(page);
	assert.match(await state(page), /^true /);
	await page.getByText('Apple').click();
	await settled(page);
	assert.match(await state(page), /^false /);
	await page.close();
});
