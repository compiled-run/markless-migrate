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

// What a calendar's month picker is: its SelectValue follows the calendar's state, the captured listbox still selects the capture's month.
const staleSelect = select
	.replace('<span data-slot="select-value" data-rac="" data-placeholder="true">Select a fruit</span>', '<span data-slot="select-value" data-rac="">Banana</span></button><div data-testid="hidden-select-container"><select><option value=""></option><option value="apple">Apple</option><option value="banana">Banana</option><option value="blueberry">Blueberry</option></select></div><button hidden>')
	.replace('aria-selected="false" tabindex="-1" data-key="apple"', 'aria-selected="true" data-selected="true" tabindex="-1" data-key="apple"');

const searchSelect = `
<div data-slot="select" data-rac=""><button id="t1" data-slot="select-trigger" data-rac="" type="button" data-react-aria-pressable="true" aria-haspopup="listbox" aria-expanded="false"><span data-slot="select-value" data-rac="" data-placeholder="true">Select a fruit</span></button></div>
<!--layers--><div style="display: contents;" hidden data-mm-layer="t1"><div data-slot="select-content" data-rac="" data-trigger="Select" style="position:absolute" role="dialog" tabindex="-1" data-placement="bottom">
<div data-slot="select-input-wrapper" data-rac="" data-empty="true"><div data-slot="input-group" data-rac="" role="group"><input id="q" aria-autocomplete="list" data-slot="select-input" data-rac="" type="search" value="" aria-controls="lb"></div></div>
<div id="lb" data-slot="select-list" data-rac="" role="listbox" aria-label="Suggestions"><section data-rac="" role="group">
<div data-slot="select-item" data-rac="" role="option" aria-selected="false" tabindex="-1" data-key="apple" id="o1"><span>Apple</span><span></span></div>
<div data-slot="select-item" data-rac="" role="option" aria-selected="false" tabindex="-1" data-key="banana" id="o2"><span>Banana</span><span></span></div>
<div data-slot="select-item" data-rac="" role="option" aria-selected="false" tabindex="-1" data-key="blueberry" id="o3"><span>Blueberry</span><span></span></div>
</section></div></div></div>`;

const currencySelect = `
<div data-slot="select" data-rac=""><button id="t1" data-slot="select-trigger" data-rac="" type="button" data-react-aria-pressable="true" aria-haspopup="listbox" aria-expanded="false">$<svg></svg></button></div>
<!--layers--><div style="display: contents;" hidden data-mm-layer="t1"><div data-slot="select-content" data-rac="" data-trigger="Select" style="position:absolute" role="dialog" tabindex="-1" data-placement="bottom">
<div id="lb" data-slot="select-list" data-rac="" role="listbox" tabindex="0">
<div data-slot="select-item" data-rac="" role="option" aria-selected="true" data-selected="true" tabindex="-1" data-key="$" id="o1"><span>$ <span>US Dollar</span></span><span></span></div>
<div data-slot="select-item" data-rac="" role="option" aria-selected="false" tabindex="-1" data-key="€" id="o2"><span>€ <span>Euro</span></span><span></span></div>
<div data-slot="select-item" data-rac="" role="option" aria-selected="false" tabindex="-1" data-key="£" id="o3"><span>£ <span>British Pound</span></span><span></span></div>
</div></div></div>`;

const menu = `
<button id="m1" data-slot="button" data-rac="" type="button" data-react-aria-pressable="true" aria-haspopup="true" aria-expanded="false">Open</button>
<!--layers--><div style="display: contents;" hidden data-mm-layer="m1"><div data-slot="dropdown-menu-content" data-rac="" data-trigger="MenuTrigger" style="position:absolute" role="dialog" tabindex="-1" data-placement="bottom">
<div id="menu" data-rac="" role="menu" tabindex="0">
<div data-rac="" role="menuitem" tabindex="-1" id="i1">Profile</div><div data-rac="" role="menuitem" tabindex="-1" id="i2">Billing</div><div data-rac="" role="menuitem" tabindex="-1" id="i3">Settings</div>
</div></div></div>`;

const submenu = `
<button id="m1" data-slot="button" data-rac="" type="button" data-react-aria-pressable="true" aria-haspopup="true" aria-expanded="false">Open</button>
<!--layers--><div style="display: contents;" hidden data-mm-layer="m1"><div data-slot="dropdown-menu-content" data-rac="" data-trigger="MenuTrigger" style="position:absolute" role="dialog" tabindex="-1" data-placement="bottom">
<div id="menu" data-rac="" role="menu" tabindex="0">
<div data-rac="" role="menuitem" tabindex="-1" id="i1">Team</div><div data-rac="" role="menuitem" tabindex="-1" id="i2" aria-haspopup="menu" aria-expanded="false">Invite users</div>
</div></div></div><div style="display: contents;" hidden data-mm-layer="i2"><div data-rac="" data-trigger="SubmenuTrigger" style="position:absolute" data-placement="right">
<div id="sub" data-rac="" role="menu" tabindex="0"><div data-rac="" role="menuitem" tabindex="-1" id="s1">Email</div><div data-rac="" role="menuitem" tabindex="-1" id="s2">Message</div></div>
</div></div>`;

const dialog = `
<button id="d1" data-slot="button" data-rac="" type="button" data-react-aria-pressable="true" aria-expanded="false">Open Dialog</button>
<!--layers--><div data-slot="dialog-overlay" data-rac="" hidden data-mm-layer="d1"><div data-slot="dialog-content" data-rac=""><div style="clip-path: inset(50%); position:absolute"><button aria-label="Dismiss" tabindex="-1" style="width: 1px; height: 1px;"></button></div>
<section id="dlg" data-slot="dialog" data-rac="" role="dialog" tabindex="-1"><input id="name" data-rac="" value="Pedro"><button id="close" data-rac="" slot="close" type="button">Cancel</button></section></div></div>`;

// A Popover in a right-to-left locale: its DismissButtons carry React Aria's localized label (ar-AE).
const rtlPopover = `
<div dir="rtl"><button id="p1" data-slot="button" data-rac="" type="button" data-react-aria-pressable="true" aria-expanded="false">يسار</button></div>
<!--layers--><div style="display: contents;" hidden data-mm-layer="p1" data-mm-placement="left"><div id="pop" data-slot="popover-content" dir="rtl" data-rac="" data-trigger="DialogTrigger" style="position:absolute" role="dialog" tabindex="-1" data-placement="left"><div style="clip-path: inset(50%); position:absolute; width:1px; height:1px; overflow:hidden"><button aria-label="تجاهل" tabindex="-1" style="width: 1px; height: 1px;"></button></div><h3>الأبعاد</h3><div style="clip-path: inset(50%); position:absolute; width:1px; height:1px; overflow:hidden"><button aria-label="تجاهل" tabindex="-1" style="width: 1px; height: 1px;"></button></div></div></div>`;

const alertDialog = `
<button id="d1" data-slot="button" data-rac="" type="button" data-react-aria-pressable="true" aria-expanded="false">Show Dialog</button>
<!--layers--><div data-slot="alert-dialog-overlay" data-rac="" hidden data-mm-layer="d1" style="position:fixed;inset:0"><div data-slot="alert-dialog-content" data-rac="" style="position:absolute;left:300px;top:200px">
<section id="dlg" data-slot="alert-dialog" data-rac="" role="alertdialog" tabindex="-1"><p>Are you absolutely sure?</p><button id="cancel" data-rac="" slot="close" type="button">Cancel</button><button id="go" data-rac="" type="button">Continue</button></section></div></div>`;

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

const autofocus = `
<div data-slot="command-input-wrapper" data-rac="" data-mm-autofocus=""><input id="f1" data-rac="" type="search"></div>
<div style="height:3000px"></div>
<div data-slot="command-input-wrapper" data-rac="" data-mm-autofocus=""><input id="f2" data-rac="" type="search"></div>
<!--layers--><div hidden data-mm-layer="x"><div data-slot="command-input-wrapper" data-rac="" data-mm-autofocus=""><input id="f3" data-rac="" type="search"></div></div>`;

const preview = `
<button id="hc" data-slot="button" data-rac="" type="button" data-react-aria-pressable="true" aria-haspopup="dialog" aria-expanded="false" data-mm-delay="10" data-mm-close-delay="100">Hover Here</button>
<button id="hd" data-slot="button" data-rac="" type="button" data-react-aria-pressable="true" aria-haspopup="dialog" aria-expanded="false">Default</button>
<!--layers--><span data-focus-scope-start="true" hidden data-mm-layer="hc"></span><div style="display: contents;" hidden data-mm-layer="hc"><div id="card" data-slot="hover-card-content" data-rac="" role="dialog" tabindex="-1" data-trigger="PreviewTrigger" style="position:absolute" data-placement="bottom"><p>@nextjs</p></div></div><span data-focus-scope-end="true" hidden data-mm-layer="hc"></span>
<span data-focus-scope-start="true" hidden data-mm-layer="hd"></span><div style="display: contents;" hidden data-mm-layer="hd"><div id="card2" data-slot="hover-card-content" data-rac="" role="dialog" tabindex="-1" data-trigger="PreviewTrigger" style="position:absolute" data-placement="bottom"><p>Default</p></div></div><span data-focus-scope-end="true" hidden data-mm-layer="hd"></span>`;

const PARTS = ['react-aria/select', 'react-aria/menu', 'react-aria/dialog', 'react-aria/disclosure', 'react-aria/combobox', 'react-aria/tooltip'];

async function open(html: string, parts: readonly string[] = PARTS): Promise<Page> {
	const page = await browser.newPage();
	await page.route('http://app.test/**', async (route) => {
		const path = new URL(route.request().url()).pathname;
		if (path.startsWith('/parts/')) {
			const text = await readFile(join(ROOT, path), 'utf8');
			return route.fulfill({ contentType: 'text/javascript', body: ts.transpileModule(text, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, verbatimModuleSyntax: false } }).outputText });
		}
		// The page in its root, the overlays Markless renders after it, and Tailwind's preflight rule for [hidden].
		const [page, layers = ''] = html.split('<!--layers-->');
		return route.fulfill({ contentType: 'text/html', body: `<!doctype html><meta charset="utf-8"><style>[hidden]:where(:not([hidden='until-found'])){display:none!important}</style><body style="margin:0;padding:40px"><div data-slot="layout">${page}</div>${layers}</body>` });
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
	}, parts);
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

test('Select: the option it opens on is the one its SelectValue shows, though the listbox was captured selecting another', async () => {
	const page = await open(staleSelect);
	await page.focus('#t1');
	await page.keyboard.press('Enter');
	assert.equal(await active(page), 'o2');
	assert.deepEqual(await page.evaluate(() => ['o1', 'o2', 'o3'].map((id) => document.getElementById(id)!.getAttribute('aria-selected'))), ['false', 'true', 'false']);
	assert.equal(await page.evaluate(() => document.querySelector('select')!.value), 'banana');
	await page.keyboard.press('Escape');
	await page.evaluate(() => (document.querySelector('select')!.value = ''));
	await page.keyboard.press('Enter');
	assert.equal(await page.evaluate(() => document.querySelector('select')!.value), 'banana', 'the hidden select follows though the selection already did');
	await page.close();
});

test('Select with a search field: the field takes focus, the options are focused virtually, typing filters and Enter chooses', async () => {
	const page = await open(searchSelect, [...PARTS, 'react-aria/autocomplete']);
	await page.evaluate(() => document.getElementById('t1')!.addEventListener('mmchoose', (e) => ((window as { chosen?: string }).chosen = (e as CustomEvent<string>).detail)));
	await page.focus('#t1');
	await page.keyboard.press('Enter');
	assert.equal(await active(page), 'q');
	assert.equal(await page.getAttribute('#q', 'aria-activedescendant'), 'o1');
	assert.equal(await page.getAttribute('#o1', 'data-focused'), 'true');
	await page.hover('#o3');
	assert.equal(await active(page), 'q', 'hovering moves the virtual focus');
	assert.equal(await page.getAttribute('#q', 'aria-activedescendant'), 'o3');
	await page.keyboard.type('an');
	assert.deepEqual(await page.evaluate(() => ['o1', 'o2', 'o3'].map((id) => document.getElementById(id)!.hidden)), [true, false, true]);
	await page.keyboard.press('ArrowDown');
	assert.equal(await active(page), 'q');
	assert.equal(await page.getAttribute('#q', 'aria-activedescendant'), 'o2');
	await page.keyboard.press('Enter');
	await page.waitForTimeout(50);
	assert.equal(await page.evaluate(() => (window as { chosen?: string }).chosen), 'Banana');
	assert.equal(await active(page), 't1');
	await page.close();
});

test('Select whose trigger renders the chosen key itself: choosing tells the page the key it shows, not the option text', async () => {
	const page = await open(currencySelect);
	await page.evaluate(() => document.getElementById('t1')!.addEventListener('mmchoose', (e) => {
		const t = e.currentTarget as HTMLElement;
		t.firstChild!.textContent = (e as CustomEvent<string>).detail;
	}));
	await page.click('#t1');
	await page.click('#o3');
	await page.waitForTimeout(50);
	assert.equal(await page.evaluate(() => document.getElementById('t1')!.textContent), '£');
	await page.click('#t1');
	await page.click('#o2');
	await page.waitForTimeout(50);
	assert.equal(await page.evaluate(() => document.getElementById('t1')!.textContent), '€');
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

test('Menu: a submenu opened from the keyboard takes focus on its first item, the modal menu leaving it usable', async () => {
	const page = await open(submenu);
	await page.focus('#m1');
	await page.keyboard.press('Enter');
	await page.keyboard.press('ArrowDown');
	assert.equal(await active(page), 'i2');
	await page.keyboard.press('Enter');
	assert.equal(await page.getAttribute('#i2', 'aria-expanded'), 'true');
	assert.equal(await active(page), 's1');
	assert.equal(await page.evaluate(() => document.querySelector<HTMLElement>('[data-mm-layer="i2"]')!.inert), false);
	await page.keyboard.press('ArrowDown');
	assert.equal(await active(page), 's2');
	await page.keyboard.press('ArrowLeft');
	await page.waitForTimeout(50);
	assert.equal(await active(page), 'i2');
	await page.keyboard.press('ArrowRight');
	assert.equal(await active(page), 's1');
	await page.close();
});

test('Menu: a submenu opened by hovering its item leaves focus on the item', async () => {
	const page = await open(submenu);
	await page.click('#m1');
	await page.hover('#i2');
	await page.waitForTimeout(300);
	assert.equal(await page.getAttribute('#i2', 'aria-expanded'), 'true');
	assert.equal(await active(page), 'i2');
	await page.hover('#s2');
	assert.equal(await active(page), 's2');
	await page.close();
});

test('Menu: the pointer heading for an open submenu across the items below its trigger keeps it open, as useSafelyMouseToSubmenu does', async () => {
	const page = await open(submenu.replace('Invite users</div>', 'Invite users</div><div data-rac="" role="menuitem" tabindex="-1" id="i3">New Team</div><div data-rac="" role="menuitem" tabindex="-1" id="i4">GitHub</div>'));
	await page.click('#m1');
	const from = (await page.locator('#i2').boundingBox())!;
	await page.mouse.move(from.x + 10, from.y + from.height / 2);
	await page.waitForTimeout(300);
	assert.equal(await page.getAttribute('#i2', 'aria-expanded'), 'true');
	const to = (await page.locator('#s2').boundingBox())!;
	// Down and right across New Team, a move every 60 ms as a hand makes them.
	for (let i = 1; i <= 6; i++) {
		await page.mouse.move(from.x + 10 + ((to.x + 5 - from.x - 10) * i) / 6, from.y + from.height / 2 + ((to.y + to.height / 2 - from.y - from.height / 2) * i) / 6);
		await page.waitForTimeout(60);
	}
	assert.equal(await page.getAttribute('#i2', 'aria-expanded'), 'true');
	assert.equal(await page.evaluate(() => document.getElementById('menu')!.style.pointerEvents), '');
	await page.close();
});

test('Menu: the pointer moving away from an open submenu onto another item closes it', async () => {
	const page = await open(submenu.replace('Invite users</div>', 'Invite users</div><div data-rac="" role="menuitem" tabindex="-1" id="i3">New Team</div>'));
	await page.click('#m1');
	const from = (await page.locator('#i2').boundingBox())!;
	await page.mouse.move(from.x + 10, from.y + from.height / 2);
	await page.waitForTimeout(300);
	assert.equal(await page.getAttribute('#i2', 'aria-expanded'), 'true');
	for (let i = 1; i <= 3; i++) {
		await page.mouse.move(from.x + 10 - i, from.y + from.height / 2 + (from.height * i) / 3);
		await page.waitForTimeout(60);
	}
	assert.equal(await page.getAttribute('#i2', 'aria-expanded'), 'false');
	assert.equal(await active(page), 'i3');
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

test('Popover: a press outside closes it in any locale, its DismissButton labelled in that locale', async () => {
	const page = await open(rtlPopover);
	await page.click('#p1');
	assert.equal(await active(page), 'pop');
	// The overlay listens for outside presses from a timer after opening; this one runs after it.
	await page.evaluate(() => new Promise((resolve) => setTimeout(resolve)));
	await page.mouse.click(5, 400);
	await page.waitForTimeout(100);
	assert.equal(await page.isVisible('#pop'), false);
	assert.equal(await active(page), 'p1');
	await page.close();
});

test('Dialog: a press outside an alert dialog leaves focus in it, as FocusScope contain restores it', async () => {
	const page = await open(alertDialog);
	await page.click('#d1');
	assert.equal(await active(page), 'dlg');
	await page.mouse.click(20, 400);
	await page.waitForTimeout(100);
	assert.equal(await active(page), 'dlg');
	assert.equal(await page.isVisible('#dlg'), true);
	await page.keyboard.press('Tab');
	assert.equal(await active(page), 'cancel');
	await page.mouse.click(20, 400);
	await page.waitForTimeout(100);
	assert.equal(await active(page), 'cancel');
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

test('ComboBox: while open, everything but its input and popover is hidden from assistive technology, not made inert', async () => {
	const page = await open(combobox);
	await page.focus('#cb');
	await page.keyboard.press('ArrowDown');
	await page.waitForTimeout(50);
	const hidden = () => page.evaluate(() => [...document.querySelectorAll('[aria-hidden="true"]')].map((el) => el.id || el.getAttribute('data-slot') || el.tagName));
	assert.deepEqual(await hidden(), ['cbb']);
	assert.equal(await page.evaluate(() => [...document.querySelectorAll('*')].some((el) => (el as HTMLElement).inert)), false);
	await page.keyboard.press('Escape');
	await page.waitForTimeout(50);
	assert.deepEqual(await hidden(), []);
	assert.equal(await page.evaluate(() => document.querySelectorAll('[role="option"][data-focused]').length), 0, 'closing drops the focused option');
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

test('autoFocus: the last part the page renders with it takes focus once the page is live, without scrolling to it', async () => {
	const page = await open(autofocus);
	assert.equal(await active(page), 'f2');
	assert.equal(await page.evaluate(() => window.scrollY), 0);
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

const fields = `
<input id="f1" data-rac="" type="text" value=""><button id="b1" data-rac="" type="button" data-react-aria-pressable="true">One</button><button id="b2" data-rac="" type="button" data-react-aria-pressable="true">Two</button>
<div id="area" role="button" tabindex="0" data-react-aria-pressable="true">Right click here</div>
<textarea id="ta" data-rac="" disabled data-disabled="true"></textarea><input id="di" data-rac="" disabled data-disabled="true" value="">`;

test('Focus ring: typing in a text field leaves it hidden, Escape then shows it', async () => {
	const page = await open(fields);
	await page.click('#f1');
	assert.equal(await page.getAttribute('#f1', 'data-focus-visible'), null);
	await page.keyboard.type('a');
	assert.equal(await page.getAttribute('#f1', 'data-focus-visible'), null);
	await page.keyboard.press('Escape');
	assert.equal(await page.getAttribute('#f1', 'data-focus-visible'), 'true');
	await page.mouse.down();
	assert.equal(await page.getAttribute('#f1', 'data-focus-visible'), null, 'a press hides it again');
	await page.close();
});

test('Focus ring: focus() from the page keeps the modality, a mouse that only moves over the page does not change it', async () => {
	const page = await open(fields);
	const focus = (id: string) => page.evaluate((id) => document.getElementById(id)!.focus(), id);
	await page.click('#b1');
	await focus('b2');
	assert.deepEqual(await attrs(page, 'b2', ['data-focused', 'data-focus-visible']), { 'data-focused': 'true', 'data-focus-visible': null });
	await page.keyboard.press('Shift');
	await focus('b1');
	assert.equal(await page.getAttribute('#b1', 'data-focus-visible'), null, 'a modifier key alone is no keyboard use');
	await page.keyboard.press('ArrowLeft');
	assert.equal(await page.getAttribute('#b1', 'data-focus-visible'), 'true');
	// The browser's own hover updates after layout: boundary and mouse events without a pointermove.
	await page.evaluate(() => {
		const b = document.getElementById('b2')!;
		b.dispatchEvent(new PointerEvent('pointerover', { bubbles: true, pointerType: 'mouse' }));
		b.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
	});
	await focus('b2');
	assert.equal(await page.getAttribute('#b2', 'data-focus-visible'), 'true');
	await page.click('#b1');
	await page.focus('#b2');
	assert.equal(await page.getAttribute('#b2', 'data-focus-visible'), 'true', 'focus that no event or focus() call of the page led to is virtual');
	await page.close();
});

test('Interaction states: a pressable without data-rac gets none, a disabled TextArea is still hovered', async () => {
	const page = await open(fields);
	await page.hover('#area');
	await page.click('#area');
	assert.deepEqual(await attrs(page, 'area', ['data-hovered', 'data-focused', 'data-pressed']), { 'data-hovered': null, 'data-focused': null, 'data-pressed': null });
	await page.hover('#ta', { force: true });
	assert.equal(await page.getAttribute('#ta', 'data-hovered'), 'true');
	await page.hover('#di', { force: true });
	assert.equal(await page.getAttribute('#di', 'data-hovered'), null);
	await page.close();
});

test('Interaction states: a Group (an input group) is hovered with the field in it, each by its own useHover, and leaving clears both', async () => {
	const page = await open('<div id="grp" data-slot="input-group" data-rac="" role="group" style="padding:20px;width:300px"><textarea id="gta" data-rac="" style="width:200px"></textarea></div><div id="away" style="height:100px"></div>');
	await page.hover('#gta');
	assert.deepEqual([await page.getAttribute('#grp', 'data-hovered'), await page.getAttribute('#gta', 'data-hovered')], ['true', 'true']);
	await page.mouse.move(5, 5);
	await page.hover('#grp', { position: { x: 5, y: 5 } });
	assert.deepEqual([await page.getAttribute('#grp', 'data-hovered'), await page.getAttribute('#gta', 'data-hovered')], ['true', null], 'the group alone, over its padding');
	await page.hover('#away');
	assert.deepEqual([await page.getAttribute('#grp', 'data-hovered'), await page.getAttribute('#gta', 'data-hovered')], [null, null]);
	await page.close();
});

test('PreviewTrigger: a hover opens the card after the trigger\'s own delay, leaving closes it after its close delay; the default waits 600 ms', async () => {
	const page = await open(preview);
	await page.mouse.move(2, 2);
	await page.hover('#hc');
	await page.waitForTimeout(80);
	assert.equal(await page.isVisible('#card'), true);
	assert.equal(await page.getAttribute('#hc', 'aria-expanded'), 'true');
	await page.mouse.move(600, 600);
	await page.waitForTimeout(40);
	assert.equal(await page.isVisible('#card'), true, 'the close delay has not passed');
	await page.waitForTimeout(700);
	assert.equal(await page.isVisible('#card'), false);
	await page.hover('#hd');
	await page.waitForTimeout(300);
	assert.equal(await page.isVisible('#card2'), false);
	await page.waitForTimeout(400);
	assert.equal(await page.isVisible('#card2'), true);
	await page.close();
});

test('Menu: typeahead skips an item whose children were not one string (its textValue is empty)', async () => {
	const page = await open(menu.replace('id="i3">Settings</div>', 'id="i3" data-mm-text-value="">Settings<kbd>⌘S</kbd></div><div data-rac="" role="menuitem" tabindex="-1" id="i4" data-mm-text-value="Support">Support</div>'));
	await page.focus('#m1');
	await page.keyboard.press('Enter');
	assert.equal(await active(page), 'i1');
	await page.keyboard.press('s');
	assert.equal(await active(page), 'i4');
	await page.close();
});
