// The React Aria ports on markup captured from react-aria-components 1.20 as shadcn/ui renders it: a Select, a Menu, a
// modal Dialog and a DisclosureGroup, used with the mouse and the keyboard as React Aria answers them.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { chromium, type Browser, type Page } from 'playwright';
import ts from 'typescript';

const ROOT = join(import.meta.dirname, '..');
let browser: Browser;

before(async () => {
	browser = await chromium.launch();
});
after(() => browser.close());

const select = `
<div data-slot="select" data-rac=""><button id="t1" data-slot="select-trigger" data-rac="" type="button" data-react-aria-pressable="true" aria-haspopup="listbox" aria-expanded="false"><span data-slot="select-value" data-rac="" data-placeholder="true">Select a fruit</span></button></div>
<!--layers--><div style="display: contents;" hidden data-mm-layer="t1"><div data-slot="select-content" data-rac="" data-trigger="Select" style="position:absolute" role="dialog" tabindex="-1" data-placement="bottom">
<div id="lb" data-slot="select-list" data-rac="" role="listbox" tabindex="0" style="overflow:visible">
<div data-slot="select-item" data-rac="" role="option" aria-selected="false" tabindex="-1" data-key="apple" id="o1"><span>Apple</span><span></span></div>
<div data-slot="select-item" data-rac="" role="option" aria-selected="false" tabindex="-1" data-key="banana" id="o2"><span>Banana</span><span></span></div>
<div data-slot="select-item" data-rac="" role="option" aria-selected="false" tabindex="-1" data-key="blueberry" id="o3"><span>Blueberry</span><span></span></div>
</div></div></div>`;

const menu = `
<button id="m1" data-slot="button" data-rac="" type="button" data-react-aria-pressable="true" aria-haspopup="true" aria-expanded="false">Open</button>
<!--layers--><div style="display: contents;" hidden data-mm-layer="m1"><div data-slot="dropdown-menu-content" data-rac="" data-trigger="MenuTrigger" style="position:absolute" role="dialog" tabindex="-1" data-placement="bottom">
<div id="menu" data-rac="" role="menu" tabindex="0">
<div data-rac="" role="menuitem" tabindex="-1" id="i1">Profile</div><div data-rac="" role="menuitem" tabindex="-1" id="i2">Billing</div><div data-rac="" role="menuitem" tabindex="-1" id="i3">Settings</div>
</div></div></div>`;

const dialog = `
<button id="d1" data-slot="button" data-rac="" type="button" data-react-aria-pressable="true" aria-expanded="false">Open Dialog</button>
<!--layers--><div data-slot="dialog-overlay" data-rac="" hidden data-mm-layer="d1"><div data-slot="dialog-content" data-rac=""><div style="clip-path: inset(50%); position:absolute"><button aria-label="Dismiss" tabindex="-1"></button></div>
<section id="dlg" data-slot="dialog" data-rac="" role="dialog" tabindex="-1"><input id="name" data-rac="" value="Pedro"><button id="close" data-rac="" slot="close" type="button">Cancel</button></section></div></div>`;

const accordion = `
<div data-slot="accordion" data-rac="">
<div data-slot="accordion-item" data-rac="" data-expanded="true"><h3><button id="a1" data-rac="" type="button" aria-expanded="true" aria-controls="p1" slot="trigger">One</button></h3><div id="p1" data-rac="" role="group" aria-hidden="false" style="--disclosure-panel-width: auto; --disclosure-panel-height: auto;"><div>First</div></div></div>
<div data-slot="accordion-item" data-rac=""><h3><button id="a2" data-rac="" type="button" aria-expanded="false" aria-controls="p2" slot="trigger">Two</button></h3><div id="p2" data-rac="" role="group" aria-hidden="true" hidden="until-found" style="--disclosure-panel-width: 0px; --disclosure-panel-height: 0px;"><div>Second</div></div></div>
</div>`;

const combobox = `
<div data-rac=""><div data-slot="input-group" data-rac="" role="group"><input id="cb" aria-label="Framework" type="text" role="combobox" aria-expanded="false" data-rac="" value=""><button id="cbb" data-slot="combobox-trigger" data-rac="" type="button" tabindex="-1" aria-label="Show suggestions" aria-haspopup="listbox" aria-expanded="false"></button></div></div>
<!--layers--><div style="display: contents;" hidden data-mm-layer="cbb"><div data-slot="combobox-content" data-rac="" data-trigger="ComboBox" style="position:absolute" data-placement="bottom">
<div id="cbl" data-rac="" role="listbox"><div data-rac="" role="option" aria-selected="false" id="c1">Next.js</div><div data-rac="" role="option" aria-selected="false" id="c2">SvelteKit</div><div data-rac="" role="option" aria-selected="false" id="c3">Nuxt.js</div></div>
</div></div>`;

const comboboxEmpty = combobox.replace('</div></div>\n</div></div>', '</div><div role="option" hidden data-mm-empty=""><div data-slot="combobox-empty">No items found.</div></div></div>\n</div></div>');

const chips = `
<div data-rac=""><div data-slot="combobox-chips" data-rac="" role="group"><div data-rac=""><div data-slot="combobox-chip-list"><div id="grid" data-rac="" role="grid" tabindex="0">
<div id="k1" data-slot="combobox-chip" data-rac="" role="row" tabindex="0" data-key="Next.js"><div role="gridcell">Next.js<button id="r1" data-rac="" type="button" slot="remove" aria-label="Remove"></button></div></div>
<div id="k2" data-slot="combobox-chip" data-rac="" role="row" tabindex="0" data-key="Nuxt.js" hidden><div role="gridcell">Nuxt.js<button id="r2" data-rac="" type="button" slot="remove" aria-label="Remove"></button></div></div>
</div></div></div><input id="mc" aria-label="Frameworks" type="text" role="combobox" aria-expanded="false" data-slot="combobox-chip-input" data-rac="" value=""></div></div>
<!--layers--><div style="display: contents;" hidden data-mm-layer="mc"><div data-slot="combobox-content" data-rac="" data-trigger="ComboBox" style="position:absolute" data-placement="bottom">
<div id="ml" data-rac="" role="listbox" aria-multiselectable="true"><div data-rac="" role="option" aria-selected="true" data-selected="true" data-key="Next.js" id="m1o">Next.js</div><div data-rac="" role="option" aria-selected="false" data-key="Nuxt.js" id="m2o">Nuxt.js</div></div>
</div></div>`;

const tooltip = `
<button id="tt" data-slot="button" data-rac="" type="button" data-react-aria-pressable="true">Hover</button>
<!--layers--><div hidden data-mm-layer="tt"><div id="tip" data-slot="tooltip-content" data-rac="" role="tooltip" data-placement="top" style="position:absolute"><p>Add to library</p></div></div>`;

const PARTS = ['react-aria/select', 'react-aria/menu', 'react-aria/dialog', 'react-aria/disclosure', 'react-aria/combobox', 'react-aria/tooltip'];

async function open(html: string): Promise<Page> {
	const page = await browser.newPage();
	await page.route('http://app.test/**', async (route) => {
		const path = new URL(route.request().url()).pathname;
		if (path.startsWith('/parts/')) {
			const text = await readFile(join(ROOT, path), 'utf8');
			return route.fulfill({ contentType: 'text/javascript', body: ts.transpileModule(text, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, verbatimModuleSyntax: false } }).outputText });
		}
		// The page in its root, the overlays Markless renders after it, and Tailwind's preflight rule for [hidden].
		const [page, layers = ''] = html.split('<!--layers-->');
		return route.fulfill({ contentType: 'text/html', body: `<!doctype html><style>[hidden]:where(:not([hidden='until-found'])){display:none!important}</style><body style="margin:0;padding:40px"><div data-slot="layout">${page}</div>${layers}</body>` });
	});
	await page.goto('http://app.test/');
	await page.evaluate(async (parts) => {
		const loaded = await Promise.all(parts.map((p) => import(`/parts/${p}.ts`)));
		const seen = new WeakSet<Event>();
		for (const type of ['click', 'keydown', 'pointerover', 'pointerout', 'pointerdown', 'input', 'focusin', 'focusout']) {
			document.addEventListener(type, (event) => {
				if (seen.has(event) || !(event.target instanceof Element)) return;
				seen.add(event);
				for (const part of loaded) if (part[type]?.(event.target, event)) return;
			});
		}
	}, PARTS);
	return page;
}

const active = (page: Page) => page.evaluate(() => document.activeElement?.id ?? document.activeElement?.tagName);
const attrs = (page: Page, id: string, names: string[]) => page.evaluate(([id, names]) => Object.fromEntries((names as string[]).map((n) => [n, document.getElementById(id as string)!.getAttribute(n)])), [id, names] as const);

test('Select: a press opens the listbox focused, hover focuses an option, releasing on it chooses and closes', async () => {
	const page = await open(select);
	await page.evaluate(() => document.getElementById('t1')!.addEventListener('mmchoose', (e) => ((window as { chosen?: string }).chosen = (e as CustomEvent<string>).detail)));
	await page.click('#t1');
	await page.waitForTimeout(50);
	assert.equal(await active(page), 'lb');
	assert.deepEqual(await attrs(page, 't1', ['aria-expanded', 'data-pressed', 'aria-controls']), { 'aria-expanded': 'true', 'data-pressed': 'true', 'aria-controls': 'lb' });
	assert.equal(await page.evaluate(() => document.querySelector('[data-slot="layout"]')!.hasAttribute('inert')), true);
	await page.hover('#o2');
	assert.equal(await active(page), 'o2');
	assert.deepEqual(await attrs(page, 'o2', ['tabindex', 'data-focused']), { tabindex: '0', 'data-focused': 'true' });
	await page.click('#o2');
	await page.waitForTimeout(50);
	assert.equal(await page.evaluate(() => (window as { chosen?: string }).chosen), 'Banana');
	assert.deepEqual(await attrs(page, 'o2', ['aria-selected', 'data-selected']), { 'aria-selected': 'true', 'data-selected': 'true' });
	assert.equal(await active(page), 't1');
	assert.deepEqual(await attrs(page, 't1', ['aria-expanded', 'data-pressed']), { 'aria-expanded': 'false', 'data-pressed': null });
	assert.equal(await page.evaluate(() => document.querySelector('[data-slot="select-value"]')!.hasAttribute('data-placeholder')), false);
	await page.close();
});

test('Select: the keyboard opens on the selected option, moves without wrapping, pages to the end and types ahead', async () => {
	const page = await open(select);
	await page.focus('#t1');
	await page.keyboard.press('ArrowDown');
	assert.equal(await active(page), 'o1');
	assert.equal(await page.getAttribute('#o1', 'data-focus-visible'), 'true');
	await page.keyboard.press('ArrowUp');
	assert.equal(await active(page), 'o1');
	await page.keyboard.press('PageDown');
	assert.equal(await active(page), 'o3');
	await page.keyboard.press('b');
	assert.equal(await active(page), 'o3', 'typeahead starts from the focused option');
	await page.keyboard.press('a');
	assert.equal(await active(page), 'o2');
	await page.waitForTimeout(1100);
	await page.keyboard.press('Enter');
	assert.equal(await page.getAttribute('#o2', 'aria-selected'), 'true');
	await page.keyboard.press('Enter');
	assert.equal(await active(page), 'o2', 'reopening focuses the selected option');
	await page.keyboard.press('Escape');
	await page.waitForTimeout(50);
	assert.equal(await active(page), 't1');
	assert.equal(await page.getAttribute('#t1', 'aria-expanded'), 'false');
	await page.close();
});

test('Menu: Enter opens on the first item, the arrows wrap, Escape closes and focus returns', async () => {
	const page = await open(menu);
	await page.focus('#m1');
	await page.keyboard.press('Enter');
	assert.equal(await active(page), 'i1');
	await page.keyboard.press('ArrowUp');
	assert.equal(await active(page), 'i3');
	await page.keyboard.press('ArrowDown');
	assert.equal(await active(page), 'i1');
	await page.keyboard.press('Escape');
	await page.waitForTimeout(50);
	assert.equal(await active(page), 'm1');
	assert.equal(await page.isHidden('[data-mm-layer="m1"]'), true);
	await page.click('#m1');
	assert.equal(await active(page), 'menu', 'a press focuses the menu itself');
	await page.click('#i2');
	await page.waitForTimeout(50);
	assert.equal(await page.getAttribute('#m1', 'aria-expanded'), 'false');
	await page.close();
});

test('Dialog: a press opens it focused, Tab stays inside, its close button closes it', async () => {
	const page = await open(dialog);
	await page.click('#d1');
	assert.equal(await active(page), 'dlg');
	await page.keyboard.press('Tab');
	assert.equal(await active(page), 'name');
	await page.keyboard.press('Tab');
	assert.equal(await active(page), 'close');
	await page.keyboard.press('Tab');
	assert.equal(await active(page), 'name');
	await page.click('#close');
	await page.waitForTimeout(50);
	assert.equal(await active(page), 'd1');
	assert.equal(await page.getAttribute('#d1', 'aria-expanded'), 'false');
	await page.close();
});

test('Disclosure: expanding one collapses the other in its group', async () => {
	const page = await open(accordion);
	await page.click('#a2');
	await page.waitForTimeout(50);
	assert.deepEqual(await attrs(page, 'p2', ['hidden', 'aria-hidden']), { hidden: null, 'aria-hidden': 'false' });
	assert.deepEqual(await attrs(page, 'p1', ['hidden', 'aria-hidden']), { hidden: 'until-found', 'aria-hidden': 'true' });
	assert.equal(await page.getAttribute('#a1', 'aria-expanded'), 'false');
	assert.equal(await page.evaluate(() => document.getElementById('a2')!.closest('[data-slot="accordion-item"]')!.getAttribute('data-expanded')), 'true');
	assert.equal(await page.evaluate(() => document.getElementById('p2')!.style.getPropertyValue('--disclosure-panel-height')), 'auto');
	await page.close();
});

test('Disclosure: the page binding the trigger to its own state first (an icon that swaps) does not undo the expansion', async () => {
	const page = await open(accordion);
	await page.evaluate(() => {
		const t = document.getElementById('a2')!;
		t.addEventListener('click', () => t.setAttribute('aria-expanded', String(t.getAttribute('aria-expanded') !== 'true')));
	});
	await page.click('#a2');
	await page.waitForTimeout(50);
	assert.deepEqual(await attrs(page, 'p2', ['hidden', 'aria-hidden']), { hidden: null, 'aria-hidden': 'false' });
	assert.equal(await page.getAttribute('#a2', 'aria-expanded'), 'true');
	await page.click('#a2');
	await page.waitForTimeout(50);
	assert.deepEqual(await attrs(page, 'p2', ['hidden', 'aria-hidden']), { hidden: 'until-found', 'aria-hidden': 'true' });
	assert.equal(await page.getAttribute('#a2', 'aria-expanded'), 'false');
	await page.close();
});

test('ComboBox: typing shows the options containing the text, ArrowDown and Enter choose with focus kept in the input', async () => {
	const page = await open(combobox);
	await page.click('#cb');
	await page.keyboard.type('xt');
	await page.waitForTimeout(50);
	assert.equal(await page.getAttribute('#cb', 'aria-expanded'), 'true');
	assert.deepEqual(await page.evaluate(() => ['c1', 'c2', 'c3'].map((id) => document.getElementById(id)!.hidden)), [false, true, false]);
	await page.keyboard.press('ArrowDown');
	await page.keyboard.press('ArrowDown');
	assert.equal(await page.getAttribute('#cb', 'aria-activedescendant'), 'c3');
	assert.equal(await active(page), 'cb');
	await page.keyboard.press('Enter');
	await page.waitForTimeout(50);
	assert.equal(await page.inputValue('#cb'), 'Nuxt.js');
	assert.equal(await page.getAttribute('#cb', 'aria-expanded'), 'false');
	await page.fill('#cb', 'zz');
	assert.equal(await page.getAttribute('#cb', 'aria-expanded'), 'false', 'no option contains it, so it stays closed');
	await page.close();
});

test('ComboBox: with an empty state, typing that matches nothing keeps the popover open on it', async () => {
	const page = await open(comboboxEmpty);
	await page.click('#cb');
	await page.keyboard.type('zz');
	await page.waitForTimeout(50);
	assert.equal(await page.getAttribute('#cb', 'aria-expanded'), 'true');
	assert.equal(await page.getAttribute('#cbl', 'data-empty'), 'true');
	assert.equal(await page.isVisible('[data-slot="combobox-empty"]'), true);
	await page.fill('#cb', 'n');
	await page.waitForTimeout(50);
	assert.equal(await page.getAttribute('#cbl', 'data-empty'), null);
	assert.equal(await page.isVisible('[data-slot="combobox-empty"]'), false);
	await page.close();
});

test('ComboBox with chips: ArrowDown opens, choosing toggles an option and its chip, the remove button of a chip takes it back', async () => {
	const page = await open(chips);
	await page.focus('#mc');
	await page.keyboard.press('ArrowDown');
	await page.waitForTimeout(50);
	assert.equal(await page.getAttribute('#mc', 'aria-expanded'), 'true');
	await page.click('#m2o');
	await page.waitForTimeout(50);
	assert.equal(await page.getAttribute('#m2o', 'aria-selected'), 'true');
	assert.equal(await page.isVisible('#k2'), true);
	assert.equal(await page.getAttribute('#mc', 'aria-expanded'), 'true', 'the popover stays open');
	assert.equal(await page.inputValue('#mc'), '');
	await page.click('#r1');
	await page.waitForTimeout(50);
	assert.equal(await page.isVisible('#k1'), false);
	assert.equal(await page.getAttribute('#m1o', 'aria-selected'), 'false');
	await page.close();
});

test('Tooltip: a hover after the pointer moved shows it and describes the trigger; Escape hides it', async () => {
	const page = await open(tooltip);
	await page.mouse.move(2, 2);
	await page.mouse.move(4, 4);
	await page.hover('#tt');
	await page.waitForTimeout(50);
	assert.equal(await page.isVisible('#tip'), true);
	assert.equal(await page.getAttribute('#tt', 'aria-describedby'), 'tip');
	assert.equal(await page.getAttribute('#tt', 'aria-expanded'), null);
	await page.keyboard.press('Escape');
	await page.waitForTimeout(50);
	assert.equal(await page.isVisible('#tip'), false);
	await page.close();
});
