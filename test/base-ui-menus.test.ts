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
		const focus = !at || at === document.body ? 'body' : at.matches('[role="menu"], [role="listbox"]') ? 'popup' : (at.getAttribute('data-slot')?.endsWith('trigger') ? `trigger:${at.textContent?.trim()}` : at.textContent?.trim() || at.tagName.toLowerCase());
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
