// The Radix menu ports (DropdownMenu, ContextMenu, Menubar) on markup as convert renders it, driven through
// parts/index.ts in a real browser, against what @radix-ui/react-menu 2.1 and react-menubar 1.1 do.
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

async function open(body: string, ports: readonly string[], extra = ''): Promise<Page> {
	const page = await browser.newPage({ viewport: { width: 1000, height: 800 } });
	const registry = `${extra}\n${ports.map((p, i) => `import * as p${i} from './${p}.ts';`).join('\n')}\nexport const PARTS = [${extra ? '...EXTRA, ' : ''}${ports.map((_, i) => `p${i}`).join(', ')}];`;
	await page.route('http://parts.test/**', async (route) => {
		const path = new URL(route.request().url()).pathname;
		if (path === '/') return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html><head><script type="importmap">{"imports":{"@floating-ui/dom":"/floating.js"}}</script><style>*{box-sizing:border-box}body{margin:0;font:16px sans-serif}[hidden]{display:none!important}[role=menuitem],[role=menuitemcheckbox]{height:30px}[role=menu]{padding:20px;width:240px}</style></head><body>${body}<script type="module">import { behave, listen } from '/parts/index.ts'; listen(); for (const type of ['click', 'keydown', 'pointerover', 'pointerout', 'pointerdown', 'focusin', 'focusout']) document.body.addEventListener(type, behave, true); window.ready = true;</script></body></html>` });
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
const dropdown = `<main><button type="button" style="position:fixed;right:20px;bottom:20px" id="menu" aria-haspopup="menu" aria-expanded="false" data-state="closed" data-slot="dropdown-menu-trigger">Open</button></main>
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
