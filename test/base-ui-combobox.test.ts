// The Base UI Combobox port on markup as convert renders it, driven through parts/index.ts in a real browser, against
// what @base-ui/react 1.6 (AriaCombobox, ComboboxInput, ComboboxTrigger, the floating-ui hooks it ships) does.
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

// The registry lists the ports sorted, as writeParts writes it.
async function open(body: string, ports: readonly string[]): Promise<Page> {
	const page = await browser.newPage({ viewport: { width: 1000, height: 800 } });
	const sorted = [...ports].sort();
	const registry = `${sorted.map((p, i) => `import * as p${i} from './${p}.ts';`).join('\n')}\nexport const PARTS = [${sorted.map((_, i) => `p${i}`).join(', ')}];`;
	await page.route('http://parts.test/**', async (route) => {
		const path = new URL(route.request().url()).pathname;
		if (path === '/') return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html><head><meta charset="utf-8"><script type="importmap">{"imports":{"@floating-ui/dom":"/floating.js"}}</script><style>*{box-sizing:border-box}body{margin:0;font:16px sans-serif}[hidden]{display:none!important}[role=option]{height:30px}</style></head><body>${body}<script type="module">import { behave, listen } from '/parts/index.ts'; listen(); for (const type of ['click', 'keydown', 'pointerover', 'pointerout', 'pointerdown', 'focusin', 'focusout', 'input']) document.body.addEventListener(type, behave, true); window.ready = true;</script></body></html>` });
		if (path === '/floating.js') return route.fulfill({ contentType: 'text/javascript', body: FLOATING_STUB });
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
const focused = (page: Page) => page.evaluate(() => (document.activeElement === document.body ? 'body' : (document.activeElement?.getAttribute('data-slot') ?? document.activeElement?.tagName.toLowerCase())));

// shadcn's Combobox on Base UI as convert renders it: the input group (input, trigger button, clear), the hidden form
// input AriaCombobox renders after the root's parts, and the list's layer keyed by the input's id.
const item = (key: string, i: number, label: string, detail?: string, selected = false) => `<div role="option" id="${key}-${i}" tabindex="-1" aria-selected="${selected}" data-slot="combobox-item"${selected ? ' data-selected' : ''}>${detail ? `<div data-slot="item"><div data-slot="item-title">${label}</div><p data-slot="item-description">${detail}</p></div>` : label}<span aria-hidden="true" data-mm-indicator${selected ? ' data-selected' : ' hidden'}>✓</span></div>`;
const layer = (key: string, options: string, multi = false) => `<div data-mm-layer="${key}" hidden data-base-ui-portal><div data-side="bottom" data-align="start" role="presentation" style="position:absolute;left:0;top:300px" data-closed><div data-slot="combobox-content" data-closed><div role="listbox" id="${key}-list" data-slot="combobox-list"${multi ? ' aria-multiselectable="true"' : ''}>${options}</div></div></div></div>`;
const FRAMEWORKS = ['Next.js', 'SvelteKit', 'Nuxt.js'];
const single = (opts: { value?: string; custom?: boolean } = {}) => `<main style="padding-top:200px"><form><div><div data-slot="input-group" role="group"><input id="cb" type="text" role="combobox" aria-expanded="false" aria-haspopup="listbox" aria-autocomplete="list" data-slot="input-group-control" value="${opts.value ?? ''}"><div role="group" data-slot="input-group-addon"><button type="button" data-slot="input-group-button" aria-haspopup="listbox" aria-expanded="false"${opts.value ? '' : ' data-placeholder=""'} tabindex="0">v</button><button type="button" data-slot="combobox-clear"${opts.value ? '' : ' hidden'}>x</button></div></div><input id="base-ui-_R_1_-hidden-input" tabindex="-1" aria-hidden="true" value="${opts.value ?? ''}" style="position:fixed;width:1px;height:1px"></div></form><button type="button" id="after">After</button></main>
	${layer('cb', opts.custom ? [['Argentina', 'South America (ar)'], ['Australia', 'Oceania (au)'], ['Brazil', 'South America (br)']].map(([l, d], i) => item('cb', i, l!, d)).join('') : FRAMEWORKS.map((f, i) => item('cb', i, f, undefined, f === opts.value)).join(''))}`;
const state = (page: Page) =>
	page.evaluate(() => {
		const input = document.querySelector<HTMLInputElement>('#cb')!;
		const button = document.querySelector('[data-slot="input-group-button"]')!;
		const ad = input.getAttribute('aria-activedescendant');
		return {
			expanded: input.getAttribute('aria-expanded'),
			button: `${button.getAttribute('aria-expanded')}${button.hasAttribute('data-pressed') ? ' pressed' : ''}`,
			pressed: input.hasAttribute('data-pressed'),
			value: input.value,
			hidden: document.querySelector<HTMLInputElement>('[id$="-hidden-input"]')!.value,
			highlighted: [...document.querySelectorAll('[role="option"][data-highlighted]')].map((o) => o.textContent).join('|') || null,
			active: ad ? document.getElementById(ad)?.textContent ?? null : null,
			focus: document.activeElement?.getAttribute('data-slot') ?? document.activeElement?.id ?? null,
		};
	});

test('Base UI Combobox trigger button: a press toggles the list, Enter and Space too while focus stays on it, ArrowDown opens and moves to the input', async () => {
	const page = await open(single(), ['base-ui/combobox']);
	const button = page.locator('[data-slot="input-group-button"]');
	await button.click();
	assert.deepEqual(await state(page), { expanded: 'true', button: 'true pressed', pressed: true, value: '', hidden: '', highlighted: null, active: null, focus: 'input-group-control' });
	await button.click();
	assert.equal((await state(page)).expanded, 'false', 'a second press closes it');
	assert.equal((await state(page)).button, 'false');
	await button.focus();
	await press(page, 'Enter');
	assert.deepEqual([(await state(page)).expanded, (await state(page)).focus], ['true', 'input-group-button']);
	await press(page, ' ');
	assert.deepEqual([(await state(page)).expanded, (await state(page)).focus], ['false', 'input-group-button']);
	await press(page, 'ArrowDown');
	assert.deepEqual([(await state(page)).expanded, (await state(page)).focus], ['true', 'input-group-control']);
	await page.close();
});

test('Base UI Combobox: choosing writes the item\'s label into the input and the hidden form input; Escape on the closed input clears both', async () => {
	const page = await open(single(), ['base-ui/combobox']);
	await page.locator('#cb').click();
	await page.locator('[role="option"]', { hasText: 'SvelteKit' }).click();
	assert.deepEqual(await state(page), { expanded: 'false', button: 'false', pressed: false, value: 'SvelteKit', hidden: 'SvelteKit', highlighted: null, active: null, focus: 'input-group-control' });
	await page.locator('#cb').click();
	assert.deepEqual([(await state(page)).highlighted, (await state(page)).active], ['SvelteKit✓', 'SvelteKit✓'], 'opening highlights the selected item');
	await press(page, 'Escape');
	assert.equal((await state(page)).value, 'SvelteKit', 'the Escape that closes it keeps the value');
	await page.waitForFunction(() => document.querySelector<HTMLElement>('[data-mm-layer="cb"]')!.hidden);
	await press(page, 'Escape');
	assert.deepEqual([(await state(page)).value, (await state(page)).hidden], ['', '']);
	assert.equal(await page.locator('[role="option"][aria-selected="true"]').count(), 0);
	assert.equal(await page.locator('[data-slot="input-group-button"]').getAttribute('data-placeholder'), '');
	await page.close();
});

test('Base UI Combobox: the clear button empties the hidden form input too', async () => {
	const page = await open(single({ value: 'Next.js' }), ['base-ui/combobox']);
	await page.locator('[data-slot="combobox-clear"]').click();
	assert.deepEqual([(await state(page)).value, (await state(page)).hidden], ['', '']);
	await page.close();
});

test('Base UI Combobox: an item with more than its label writes and matches only the label', async () => {
	const page = await open(single({ custom: true }), ['base-ui/combobox']);
	await page.locator('#cb').pressSequentially('oce');
	assert.equal(await page.locator('[role="option"]:not([hidden])').count(), 0, 'the description is not matched');
	await page.locator('#cb').fill('');
	await page.locator('#cb').pressSequentially('aus');
	await press(page, 'ArrowDown');
	await press(page, 'Enter');
	assert.deepEqual([(await state(page)).value, (await state(page)).hidden], ['Australia', 'Australia']);
	await page.close();
});

test('Base UI Combobox keys: the arrows pass the ends to no item (loopFocus), Enter with nothing highlighted closes', async () => {
	const page = await open(single(), ['base-ui/combobox']);
	await page.locator('#cb').focus();
	await press(page, 'ArrowDown');
	assert.equal((await state(page)).highlighted, 'Next.js✓', 'ArrowDown opens on the first item');
	await press(page, 'ArrowUp');
	assert.equal((await state(page)).highlighted, null);
	await press(page, 'ArrowUp');
	assert.equal((await state(page)).highlighted, 'Nuxt.js✓');
	await press(page, 'ArrowDown');
	assert.deepEqual([(await state(page)).highlighted, (await state(page)).active], [null, null]);
	await press(page, 'Enter');
	assert.equal((await state(page)).expanded, 'false');
	await page.close();
});

const chips = `<main style="padding-top:200px"><div role="toolbar" data-slot="combobox-chips">${FRAMEWORKS.map((f, i) => `<div data-slot="combobox-chip" data-mm-chip="${f}"${i ? ' hidden' : ''}>${f}<button data-slot="combobox-chip-remove">x</button></div>`).join('')}<input id="cb" role="combobox" aria-haspopup="listbox" aria-expanded="false" data-slot="combobox-chip-input" value=""></div></main>${layer('cb', FRAMEWORKS.map((f, i) => item('cb', i, f, undefined, i === 0)).join(''), true)}`;

test('Base UI Combobox with several values: opening highlights the last chosen, and choosing keeps the highlight and aria-activedescendant', async () => {
	const page = await open(chips, ['base-ui/combobox']);
	const read = () => page.evaluate(() => [document.querySelector('[data-highlighted]')?.textContent ?? null, document.getElementById(document.querySelector('#cb')!.getAttribute('aria-activedescendant') ?? '')?.textContent ?? null]);
	await page.locator('#cb').click();
	assert.deepEqual(await read(), ['Next.js✓', 'Next.js✓']);
	await press(page, 'ArrowDown');
	await press(page, 'Enter');
	assert.deepEqual(await read(), ['SvelteKit✓', 'SvelteKit✓']);
	assert.equal(await page.locator('[data-mm-chip="SvelteKit"]').isVisible(), true);
	await press(page, 'Escape');
	await page.locator('#cb').click();
	assert.deepEqual(await read(), ['SvelteKit✓', 'SvelteKit✓'], 'the last chosen');
	await page.close();
});

const popupBox = `<main style="padding-top:200px"><div><button type="button" data-slot="combobox-trigger" aria-haspopup="dialog" aria-expanded="false" role="combobox" tabindex="0" id="box">Select country<span>v</span></button><input id="base-ui-_R_2_-hidden-input" tabindex="-1" aria-hidden="true" value=""></div></main>
	<div data-mm-layer="box" hidden data-base-ui-portal><div data-side="bottom" role="presentation" style="position:absolute;left:0;top:300px" data-closed><div role="dialog" id="box-popup" data-slot="combobox-content" data-closed><input id="search" role="combobox" aria-haspopup="listbox" aria-expanded="false" data-slot="input-group-control" value=""><div role="listbox" id="box-list">${['Argentina', 'Japan'].map((c, i) => item('box', i, c)).join('')}</div></div></div></div>`;

test('Base UI Combobox popup variant: Enter on the trigger opens it with the search input focused; choosing writes the label to the trigger and the hidden input', async () => {
	const page = await open(popupBox, ['base-ui/combobox']);
	await page.locator('#box').focus();
	await press(page, 'Enter');
	assert.equal(await page.evaluate(() => document.activeElement?.id), 'search');
	assert.equal(await page.locator('#box').getAttribute('aria-expanded'), 'true');
	await press(page, 'ArrowDown');
	await press(page, 'Enter');
	assert.equal(await page.locator('#box').evaluate((b) => b.firstChild!.textContent), 'Argentina');
	assert.equal(await page.locator('[id$="-hidden-input"]').inputValue(), 'Argentina');
	await page.close();
});
