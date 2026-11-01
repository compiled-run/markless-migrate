// The Radix menu ports (DropdownMenu, ContextMenu, Menubar) on markup as convert renders it, driven through
// parts/index.ts in a real browser, against what @radix-ui/react-menu 2.1 and react-menubar 1.1 do.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { chromium, type Browser, type Page } from 'playwright';
import ts from 'typescript';
import { registryModule } from '../src/convert/parts.ts';

const PARTS = join(import.meta.dirname, '..', 'parts');
// Placement is not under test: a layer goes below its anchor, or beside it for a right-hand side (a submenu).
const FLOATING_STUB = `export const computePosition = async (anchor, floating, o) => { const r = anchor.getBoundingClientRect(); const right = o.placement.startsWith('right'); return { x: right ? r.right : r.left, y: right ? r.top : r.bottom, placement: o.placement, middlewareData: {} }; };
export const autoUpdate = () => () => {};
export const arrow = () => ({}), flip = () => ({}), hide = () => ({}), limitShift = () => ({}), offset = () => ({}), shift = () => ({}), size = () => ({});`;

let browser: Browser;
before(async () => {
	browser = await chromium.launch();
});
after(() => browser.close());

async function open(body: string, ports: readonly string[]): Promise<Page> {
	const page = await browser.newPage({ viewport: { width: 1000, height: 800 } });
	const registry = registryModule(ports, '.');
	await page.route('http://parts.test/**', async (route) => {
		const path = new URL(route.request().url()).pathname;
		if (path === '/') return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html><head><script type="importmap">{"imports":{"@floating-ui/dom":"/floating.js"}}</script><style>*{box-sizing:border-box}body{margin:0;font:16px sans-serif}[hidden]{display:none!important}[role=menuitem],[role=menuitemcheckbox]{height:30px}[role=menu]{padding:20px;width:240px}</style></head><body>${body}<script type="module">import { behave, listen } from '/parts/registry.ts'; listen(); for (const type of ['click', 'keydown', 'pointerover', 'pointerout', 'pointerdown', 'focusin', 'focusout']) document.body.addEventListener(type, behave, true); window.ready = true;</script></body></html>` });
		if (path === '/floating.js') return route.fulfill({ contentType: 'text/javascript', body: FLOATING_STUB });
		const text = path === '/parts/registry.ts' ? registry : await readFile(join(PARTS, path.replace(/^\/parts\//, '')), 'utf8');
		return route.fulfill({ contentType: 'text/javascript', body: ts.transpileModule(text, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText });
	});
	await page.goto('http://parts.test/');
	await page.waitForFunction(() => (window as unknown as { ready?: boolean }).ready);
	return page;
}

const settled = (page: Page) => page.evaluate(() => new Promise<void>((done) => setTimeout(() => setTimeout(done))));
const highlighted = (page: Page) => page.evaluate(() => [...document.querySelectorAll('[data-highlighted]')].map((e) => e.textContent?.trim()));
const active = (page: Page) => page.evaluate(() => document.activeElement?.getAttribute('data-slot') === 'dropdown-menu-content' || document.activeElement?.getAttribute('role') === 'menu' ? 'content' : (document.activeElement?.textContent?.trim() ?? ''));
// Keys held as a person types them (Radix's roving focus moves focus from a timer).
async function press(page: Page, key: string): Promise<void> {
	await page.keyboard.down(key);
	await page.waitForTimeout(40);
	await page.keyboard.up(key);
	await settled(page);
}

const ITEMS = ['Profile', 'Billing', 'Disabled', 'Settings'];
const dropdown = `<main><button type="button" style="position:fixed;left:20px;top:20px" id="menu" aria-haspopup="menu" aria-expanded="false" data-state="closed" data-slot="dropdown-menu-trigger">Open</button></main>
<div data-mm-layer="menu" hidden data-radix-popper-content-wrapper style="position:fixed;left:40px;top:100px"><div data-slot="dropdown-menu-content" role="menu" id="menu-content" aria-labelledby="menu" data-state="closed" tabindex="-1" data-radix-menu-content="">${ITEMS.map((t) => `<div role="menuitem" tabindex="-1" data-slot="dropdown-menu-item"${t === 'Disabled' ? ' aria-disabled="true" data-disabled=""' : ''}>${t}</div>`).join('')}</div></div>`;

async function hoverItem(page: Page, text: string): Promise<void> {
	const box = (await page.getByText(text, { exact: true }).boundingBox())!;
	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 2 });
	await settled(page);
}

test('Radix DropdownMenu: the highlight is the focused item: the pointer leaving it or a disabled item focuses the content, and the menu reopens with nothing highlighted', async () => {
	const page = await open(dropdown, ['radix/dropdown-menu']);
	await page.getByText('Open').click();
	await settled(page);
	assert.deepEqual(await highlighted(page), []);
	await hoverItem(page, 'Billing');
	assert.deepEqual(await highlighted(page), ['Billing']);
	assert.equal(await active(page), 'Billing');
	// Into the content's padding: MenuItem's onPointerLeave focuses the content.
	const content = (await page.locator('[role="menu"]').boundingBox())!;
	await page.mouse.move(content.x + 5, content.y + 5, { steps: 2 });
	await settled(page);
	assert.deepEqual(await highlighted(page), []);
	assert.equal(await active(page), 'content');
	await hoverItem(page, 'Settings');
	await hoverItem(page, 'Disabled');
	assert.deepEqual(await highlighted(page), []);
	assert.equal(await active(page), 'content');
	await hoverItem(page, 'Profile');
	await press(page, 'Escape');
	assert.equal(await page.getByText('Open').getAttribute('aria-expanded'), 'false');
	await page.getByText('Open').click();
	await settled(page);
	assert.deepEqual(await highlighted(page), []);
	assert.equal(await active(page), 'content');
	await page.close();
});

test('Radix DropdownMenu: from the content ArrowUp and End focus the last item, ArrowDown and Home the first; PageUp and PageDown move as Home and End', async () => {
	const page = await open(dropdown, ['radix/dropdown-menu']);
	await page.getByText('Open').click();
	await settled(page);
	await press(page, 'ArrowUp');
	assert.deepEqual(await highlighted(page), ['Settings']);
	await press(page, 'PageUp');
	assert.deepEqual(await highlighted(page), ['Profile']);
	await press(page, 'PageDown');
	assert.deepEqual(await highlighted(page), ['Settings']);
	await press(page, 'ArrowUp');
	assert.deepEqual(await highlighted(page), ['Billing']);
	await page.close();
});

const MENUS = { File: ['New Tab', 'New Window'], Edit: ['Undo', 'Redo'], View: ['Reload', 'Zoom'] };
const menubar = (dir = 'ltr') => `<main style="padding:40px" dir="${dir}"><div role="menubar" data-slot="menubar" tabindex="0" data-orientation="horizontal" style="display:flex;gap:8px">${Object.keys(MENUS)
	.map((m) => `<button type="button" role="menuitem" id="t-${m}" aria-haspopup="menu" aria-expanded="false" data-state="closed" data-slot="menubar-trigger" tabindex="-1" data-orientation="horizontal">${m}</button>`)
	.join('')}</div></main>
${Object.entries(MENUS)
	.map(([m, items]) => `<div data-mm-layer="t-${m}" hidden data-radix-popper-content-wrapper style="position:fixed;left:40px;top:100px"><div data-slot="menubar-content" role="menu" id="c-${m}" aria-labelledby="t-${m}" data-state="closed" tabindex="-1" data-radix-menu-content="" data-radix-menubar-content="" dir="${dir}">${items.map((t) => `<div role="menuitem" tabindex="-1" data-slot="menubar-item">${t}</div>`).join('')}</div></div>`)
	.join('')}`;

test('Radix Menubar: the focused trigger is highlighted and the arrows rove between closed triggers, looping, with the tab stop following', async () => {
	const page = await open(menubar(), ['radix/dropdown-menu']);
	await page.locator('#t-File').focus();
	assert.deepEqual(await highlighted(page), ['File']);
	await press(page, 'ArrowRight');
	assert.equal(await active(page), 'Edit');
	assert.deepEqual(await highlighted(page), ['Edit']);
	assert.deepEqual(await page.locator('[data-slot="menubar-trigger"]').evaluateAll((ts) => ts.map((t) => t.getAttribute('tabindex'))), ['-1', '0', '-1']);
	await press(page, 'ArrowLeft');
	await press(page, 'ArrowLeft');
	assert.equal(await active(page), 'View');
	await press(page, 'End');
	assert.equal(await active(page), 'View');
	await press(page, 'Home');
	assert.equal(await active(page), 'File');
	// Space opens the focused trigger's menu, on its first item (the keyboard opened it).
	await press(page, 'ArrowRight');
	await press(page, ' ');
	assert.equal(await page.locator('#t-Edit').getAttribute('aria-expanded'), 'true');
	assert.deepEqual(await highlighted(page), ['Undo']);
	await page.close();
});

test('Radix Menubar: an arrow in an open menu opens the neighbour with its content focused and nothing highlighted; Escape focuses and highlights its trigger', async () => {
	const page = await open(menubar(), ['radix/dropdown-menu']);
	await page.locator('#t-File').focus();
	await press(page, 'Enter');
	assert.deepEqual(await highlighted(page), ['New Tab']);
	await press(page, 'ArrowRight');
	assert.equal(await page.locator('#t-Edit').getAttribute('aria-expanded'), 'true');
	assert.equal(await page.locator('#t-File').getAttribute('aria-expanded'), 'false');
	assert.equal(await active(page), 'content');
	assert.deepEqual(await highlighted(page), []);
	await press(page, 'ArrowLeft');
	assert.equal(await page.locator('#t-File').getAttribute('aria-expanded'), 'true');
	await press(page, 'ArrowLeft');
	assert.equal(await page.locator('#t-View').getAttribute('aria-expanded'), 'true');
	await press(page, 'Escape');
	assert.equal(await page.locator('#t-View').getAttribute('aria-expanded'), 'false');
	assert.equal(await active(page), 'View');
	assert.deepEqual(await highlighted(page), ['View']);
	await page.close();
});

test('Radix Menubar in a right-to-left page: ArrowLeft moves to the next trigger', async () => {
	const page = await open(menubar('rtl'), ['radix/dropdown-menu']);
	await page.locator('#t-File').focus();
	await press(page, 'ArrowLeft');
	assert.equal(await active(page), 'Edit');
	await page.close();
});

// A DropdownMenu.Sub as convert renders it: the sub-trigger an item of the menu, its content a layer keyed by its id.
const withSub = `<main><button type="button" style="position:fixed;left:20px;top:20px" id="menu" aria-haspopup="menu" aria-expanded="false" data-state="closed" data-slot="dropdown-menu-trigger">Open</button></main>
<div data-mm-layer="menu" hidden data-radix-popper-content-wrapper><div data-slot="dropdown-menu-content" role="menu" id="menu-content" aria-labelledby="menu" data-state="closed" tabindex="-1" data-radix-menu-content="" data-side="bottom" data-align="start">
<div role="menuitem" tabindex="-1">Team</div><div role="menuitem" id="sub" aria-haspopup="menu" aria-expanded="false" aria-controls="sub-content" data-state="closed" tabindex="-1" data-slot="dropdown-menu-sub-trigger">Invite users</div><div role="menuitem" tabindex="-1">New Team</div><div role="menuitem" tabindex="-1">GitHub</div></div></div>
<div data-mm-layer="sub" hidden data-radix-popper-content-wrapper><div data-slot="dropdown-menu-sub-content" role="menu" id="sub-content" aria-labelledby="sub" data-state="closed" tabindex="-1" data-radix-menu-content="" data-side="right" data-align="start"><div role="menuitem" tabindex="-1">Email</div><div role="menuitem" tabindex="-1">Message</div></div></div>`;

const subOpen = (page: Page) => page.locator('#sub').getAttribute('aria-expanded').then((v) => v === 'true');

test('Radix DropdownMenu.Sub with the mouse: resting on the sub-trigger opens it with focus left there, the pointer crosses to it, a choice in it closes the whole menu', async () => {
	const page = await open(withSub, ['radix/dropdown-menu']);
	await page.getByText('Open').click();
	await settled(page);
	await hoverItem(page, 'Invite users');
	await page.waitForTimeout(150);
	assert.equal(await subOpen(page), true);
	assert.equal(await page.locator('#sub-content').isVisible(), true);
	assert.equal(await active(page), 'Invite users');
	assert.deepEqual(await highlighted(page), ['Invite users']);
	// Down and right across "New Team" to "Message": the grace area keeps the submenu open.
	const from = (await page.locator('#sub').boundingBox())!;
	const to = (await page.getByText('Message', { exact: true }).boundingBox())!;
	await page.mouse.move(to.x + 10, to.y + to.height / 2, { steps: 6 });
	await settled(page);
	void from;
	assert.equal(await subOpen(page), true);
	assert.equal(await active(page), 'Message');
	await page.getByText('Message', { exact: true }).click();
	await settled(page);
	assert.equal(await page.getByText('Open').getAttribute('aria-expanded'), 'false');
	assert.equal(await page.locator('#sub-content').isVisible(), false);
	await page.close();
});

test('Radix DropdownMenu.Sub: the way the pointer heads is its last move in the menu, so drifting back along the sub-trigger and then down to the submenu keeps it open', async () => {
	const page = await open(withSub, ['radix/dropdown-menu']);
	await page.getByText('Open').click();
	await settled(page);
	const from = (await page.locator('#sub').boundingBox())!;
	await page.mouse.move(from.x + from.width - 5, from.y + from.height / 2, { steps: 2 });
	await page.waitForTimeout(150);
	assert.equal(await subOpen(page), true);
	// Back left along the sub-trigger, then right and down across "New Team" to "Message".
	await page.mouse.move(from.x + 20, from.y + from.height / 2, { steps: 4 });
	const to = (await page.getByText('Message', { exact: true }).boundingBox())!;
	await page.mouse.move(to.x + 10, to.y + to.height / 2, { steps: 6 });
	await settled(page);
	assert.equal(await subOpen(page), true);
	assert.equal(await active(page), 'Message');
	await page.close();
});

test('Radix DropdownMenu.Sub: an opening submenu is painted over its menu, as its portal mounts it last, though convert rendered it first', async () => {
	const [menuLayer, subLayer] = withSub.replaceAll('data-radix-popper-content-wrapper>', 'data-radix-popper-content-wrapper style="z-index:50">').split(/(?=<div data-mm-layer="sub")/);
	const page = await open(subLayer!.replace('data-side="right"', 'data-side="right" style="margin-left:-120px"') + menuLayer, ['radix/dropdown-menu']);
	await page.getByText('Open').click();
	await settled(page);
	await page.getByText('Invite users', { exact: true }).focus();
	await press(page, 'ArrowRight');
	assert.equal(await subOpen(page), true);
	const on = (await page.getByText('Email', { exact: true }).boundingBox())!;
	assert.equal(await page.evaluate(([x, y]) => document.elementFromPoint(x!, y!)?.closest('[role=menu]')?.id, [on.x + 5, on.y + 5]), 'sub-content');
	await page.close();
});

test('Radix DropdownMenu.Sub: another item of the parent taking focus closes the submenu', async () => {
	const page = await open(withSub, ['radix/dropdown-menu']);
	await page.getByText('Open').click();
	await settled(page);
	await hoverItem(page, 'Invite users');
	await page.waitForTimeout(150);
	assert.equal(await subOpen(page), true);
	const team = (await page.getByText('Team', { exact: true }).boundingBox())!;
	await page.mouse.move(team.x + 5, team.y + team.height / 2, { steps: 2 });
	await settled(page);
	assert.equal(await subOpen(page), false);
	assert.deepEqual(await highlighted(page), ['Team']);
	await page.close();
});

test('Radix DropdownMenu.Sub from the keyboard: ArrowRight or Enter opens it on its first item, ArrowLeft closes it back to its trigger, Escape closes the whole menu', async () => {
	const page = await open(withSub, ['radix/dropdown-menu']);
	await page.locator('#menu').focus();
	await press(page, 'Enter');
	await press(page, 'ArrowDown');
	assert.equal(await active(page), 'Invite users');
	await press(page, 'ArrowRight');
	assert.equal(await subOpen(page), true);
	assert.equal(await active(page), 'Email');
	// The modal menu hid everything beside it from assistive technology; not its submenu.
	assert.equal(await page.locator('[data-mm-layer="sub"]').getAttribute('aria-hidden'), null);
	await press(page, 'ArrowDown');
	assert.deepEqual(await highlighted(page), ['Message']);
	await press(page, 'ArrowLeft');
	assert.equal(await subOpen(page), false);
	assert.equal(await page.locator('[data-mm-layer="sub"]').getAttribute('aria-hidden'), 'true');
	assert.equal(await active(page), 'Invite users');
	await press(page, 'Enter');
	assert.equal(await active(page), 'Email');
	await press(page, 'Escape');
	assert.equal(await subOpen(page), false);
	assert.equal(await page.getByText('Open').getAttribute('aria-expanded'), 'false');
	assert.equal(await page.evaluate(() => document.activeElement?.id), 'menu');
	await page.close();
});

test('Radix DropdownMenu.Sub: the pointer leaving the sub-trigger off the menu, having only moved down across it, leaves the submenu open and its trigger focused; moving left across it first closes it', async () => {
	const page = await open(withSub, ['radix/dropdown-menu']);
	await page.getByText('Open').click();
	await settled(page);
	await hoverItem(page, 'Team');
	await hoverItem(page, 'Invite users');
	await page.waitForTimeout(150);
	assert.equal(await subOpen(page), true);
	// Straight out to the left in one move: Radix judges the way by the last move across the menu (straight down, so
	// its initial "right"), not by where the pointer went once off it.
	const at = (await page.locator('#sub').boundingBox())!;
	await page.mouse.move(8, at.y + at.height / 2);
	await settled(page);
	assert.equal(await subOpen(page), true);
	assert.equal(await active(page), 'Invite users');
	// Back on it, then left across it and off the menu: the last moves in the menu went left, away from the submenu.
	await hoverItem(page, 'Invite users');
	await page.mouse.move(8, at.y + at.height / 2, { steps: 3 });
	await settled(page);
	assert.equal(await subOpen(page), false);
	await page.close();
});

test('Radix DropdownMenu.Sub: a press outside the menu and its open submenu closes both, focus back on the trigger', async () => {
	const page = await open(withSub, ['radix/dropdown-menu']);
	await page.getByText('Open').click();
	await settled(page);
	await hoverItem(page, 'Invite users');
	await page.waitForTimeout(150);
	assert.equal(await subOpen(page), true);
	await page.mouse.click(5, 790);
	await settled(page);
	assert.equal(await subOpen(page), false);
	assert.equal(await page.getByText('Open').getAttribute('aria-expanded'), 'false');
	assert.equal(await page.evaluate(() => document.activeElement?.id), 'menu');
	await page.close();
});

test('Radix ContextMenu.Sub on a page listing only the context menu port: resting on the sub-trigger opens it, ArrowLeft closes it, ArrowDown moves in the menu', async () => {
	const page = await open(
		`<main><div data-slot="context-menu-trigger" data-state="closed" data-mm-key="ctx" style="position:fixed;left:0;top:0;width:600px;height:300px">Right click here</div></main>
<div data-mm-layer="ctx" hidden data-radix-popper-content-wrapper style="position:fixed;left:40px;top:100px"><div data-slot="context-menu-content" role="menu" id="ctx-content" data-state="closed" tabindex="-1" data-radix-menu-content=""><div role="menuitem" tabindex="-1">Back</div><div role="menuitem" id="csub" aria-haspopup="menu" aria-expanded="false" aria-controls="csub-content" data-state="closed" tabindex="-1" data-slot="context-menu-sub-trigger">More Tools</div></div></div>
<div data-mm-layer="csub" hidden data-radix-popper-content-wrapper><div data-slot="context-menu-sub-content" role="menu" id="csub-content" aria-labelledby="csub" data-state="closed" tabindex="-1" data-radix-menu-content="" data-side="right" data-align="start"><div role="menuitem" tabindex="-1">Save Page</div></div></div>`,
		['radix/context-menu'],
	);
	await page.mouse.click(20, 20, { button: 'right' });
	await settled(page);
	await press(page, 'ArrowDown');
	assert.equal(await active(page), 'Back');
	await hoverItem(page, 'More Tools');
	await page.waitForTimeout(150);
	assert.equal(await page.locator('#csub').getAttribute('aria-expanded'), 'true');
	await press(page, 'ArrowRight');
	assert.equal(await active(page), 'Save Page');
	await press(page, 'ArrowLeft');
	assert.equal(await page.locator('#csub').getAttribute('aria-expanded'), 'false');
	assert.equal(await active(page), 'More Tools');
	await page.close();
});

test("Radix DropdownMenu: an item convert recorded as changing its trigger's text (a version switcher) writes that text in place when chosen", async () => {
	const switcher = `<main><button type="button" style="position:fixed;left:20px;top:20px" id="menu" aria-haspopup="menu" aria-expanded="false" data-state="closed" data-slot="dropdown-menu-trigger"><span>v<!---->1.0.1</span></button></main>
<div data-mm-layer="menu" hidden data-radix-popper-content-wrapper style="position:fixed;left:40px;top:100px"><div data-slot="dropdown-menu-content" role="menu" id="menu-content" aria-labelledby="menu" data-state="closed" tabindex="-1" data-radix-menu-content=""><div role="menuitem" tabindex="-1" data-slot="dropdown-menu-item" data-mm-trigger-text="[[1,&quot;v1.0.1&quot;]]">v1.0.1</div><div role="menuitem" tabindex="-1" data-slot="dropdown-menu-item" data-mm-trigger-text="[[1,&quot;v2.0.0&quot;]]">v2.0.0</div></div></div>`;
	const page = await open(switcher, ['radix/dropdown-menu']);
	await page.click('#menu');
	await settled(page);
	await page.getByText('v2.0.0', { exact: true }).click();
	await settled(page);
	assert.equal(await page.locator('#menu').innerHTML(), '<span>v2.0.0<!----></span>', 'its text runs change in place');
	assert.equal(await page.locator('#menu').getAttribute('aria-expanded'), 'false', 'the menu closed');
	await page.close();
});

test("Radix DropdownMenu: a switcher's chosen item shows its logo variant on the trigger and moves the check mark to itself", async () => {
	const svg = (n: string, extra = '') => `<svg width="8" height="8" data-logo="${n}"${extra}></svg>`;
	const switcher = `<main><button type="button" style="position:fixed;left:20px;top:20px" id="menu" aria-haspopup="menu" aria-expanded="false" data-state="closed" data-slot="dropdown-menu-trigger"><div>${svg('a', ' data-mm-variant-of="0" data-mm-variant="own"')}${svg('a', ' hidden data-mm-variant-of="0" data-mm-variant="0"')}${svg('b', ' hidden data-mm-variant-of="0" data-mm-variant="1"')}</div><span>A</span></button></main>
<div data-mm-layer="menu" hidden data-radix-popper-content-wrapper style="position:fixed;left:40px;top:100px"><div data-slot="dropdown-menu-content" role="menu" id="menu-content" aria-labelledby="menu" data-state="closed" tabindex="-1" data-radix-menu-content=""><div role="menuitem" tabindex="-1" data-slot="dropdown-menu-item" data-mm-trigger-text="[[2,&quot;A&quot;]]" data-mm-trigger-svg="[[0,0]]">A<svg width="8" height="8" data-check data-mm-chosen-mark></svg></div><div role="menuitem" tabindex="-1" data-slot="dropdown-menu-item" data-mm-trigger-text="[[2,&quot;B&quot;]]" data-mm-trigger-svg="[[0,1]]">B<svg width="8" height="8" data-check data-mm-chosen-mark hidden></svg></div></div></div>`;
	const page = await open(switcher, ['radix/dropdown-menu']);
	const shown = () => page.evaluate(() => [[...document.querySelectorAll('#menu svg:not([hidden])')].map((s) => s.getAttribute('data-logo')).join(''), document.querySelector('#menu span')!.textContent, [...document.querySelectorAll('[role=menuitem]')].filter((i) => !i.querySelector('svg')!.hasAttribute('hidden')).map((i) => i.textContent).join('')]);
	await page.click('#menu');
	await settled(page);
	await page.getByText('B', { exact: true }).click();
	await settled(page);
	assert.deepEqual(await shown(), ['b', 'B', 'B']);
	await page.click('#menu');
	await settled(page);
	await page.getByText('A', { exact: true }).click();
	await settled(page);
	assert.deepEqual(await shown(), ['a', 'A', 'A']);
	await page.close();
});
