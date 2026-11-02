import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { after, before, test } from 'node:test';
import { chromium, type Browser, type Page } from 'playwright';
import ts from 'typescript';
import { atRest } from '../src/convert/at-rest.ts';
import { chartModel } from '../src/convert/charts.ts';
import { body as bodyOf, outer, parseDocument, walk } from '../src/convert/dom.ts';
import { earlyThemeScript } from '../parts/next-themes.ts';
import { registryModule } from '../src/convert/parts.ts';

// The ports run as the app runs them: parts/index.ts delegating every event to a registry of ports, in a real browser.
const PARTS = join(import.meta.dirname, '..', 'parts');
const SITE = join(import.meta.dirname, '..', 'examples', 'shadcn-ui-markless', 'lib', 'site', 'parts.ts');
// Placement is not under test here; the ports only need @floating-ui/dom's functions to exist (each reference placed against is noted).
const FLOATING_STUB = `export const computePosition = async (reference) => ((globalThis.placedAgainst ??= []).push(reference?.id ?? ''), { x: 0, y: 0, placement: 'bottom', middlewareData: {} });
export const autoUpdate = () => () => {};
export const arrow = () => ({}), flip = () => ({}), hide = () => ({}), limitShift = () => ({}), offset = () => ({}), shift = () => ({}), size = () => ({});`;

// The recharts update animation draws with d3-shape, which the app installs; here, the repo's own copy.
const D3_SHAPE = realpathSync(join(import.meta.dirname, '..', 'node_modules', 'd3-shape'));
const D3 = { 'd3-shape': D3_SHAPE, 'd3-path': join(dirname(D3_SHAPE), 'd3-path') };

let browser: Browser;
before(async () => {
	browser = await chromium.launch();
});
after(async () => {
	await browser.close();
});

// `deliver`: also hand every event to the parts from the body's or the window's capture phase, as a Markless page delegates
// them, before the event reaches the document listener.
// `head`: what the app's Document puts in the head before any module (the inline theme toggle).
async function open(body: string, ports: readonly string[], deliver?: 'body' | 'window', head = '', timezoneId?: string): Promise<Page> {
	const page = await browser.newPage({ viewport: { width: 1000, height: 800 }, ...(timezoneId ? { timezoneId } : {}) });
	// `site`: the shadcn-ui port's own site parts (lib/site/parts.ts), which import the ports as the app's lib/parts.
	const registry = registryModule(ports.filter((p) => p !== 'site'), '.', ports.includes('site') ? './site.ts' : undefined);
	await page.route('http://parts.test/**', async (route) => {
		const path = new URL(route.request().url()).pathname;
		if (path === '/') return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html><head><script type="importmap">{"imports":{"@floating-ui/dom":"/floating.js","@markless/router":"/router.js","d3-shape":"/d3-shape/src/index.js","d3-path":"/d3-path/src/index.js"}}</script><style>*{box-sizing:border-box}body{margin:0;font:16px sans-serif}</style>${head}</head><body>${body}<script>window.pointerLog = []; for (const type of ['pointerover', 'pointermove']) document.addEventListener(type, (e) => { const t = e.target; window.pointerLog.push(type + '@' + Math.round(e.clientX) + ',' + Math.round(e.clientY) + ':' + (t.tagName || '') + '.' + (t.getAttribute && t.getAttribute('class') || '')); }, true);</script><script type="module">import { behave, listen, mount } from '/parts/registry.ts'; listen(); ${deliver ? `for (const type of ['click', 'keydown', 'pointerover', 'pointerout', 'pointerdown', 'focusin', 'focusout']) ${deliver === 'body' ? 'document.body' : 'window'}.addEventListener(type, behave, true);` : ''} window.mountParts = mount; window.ready = true;</script></body></html>` });
		if (path === '/floating.js') return route.fulfill({ contentType: 'text/javascript', body: FLOATING_STUB });
		const d3 = /^\/(d3-shape|d3-path)\/(.*)$/.exec(path);
		if (d3) return route.fulfill({ contentType: 'text/javascript', body: await readFile(join(D3[d3[1] as 'd3-shape' | 'd3-path'], d3[2]!), 'utf8') });
		if (path === '/router.js') return route.fulfill({ contentType: 'text/javascript', body: 'export const navigate = async (href) => { window.navigated = href; };' });
		// What choosing each option did on the old page, which convert writes beside the ports.
		if (path === '/parts/choices.ts') return route.fulfill({ contentType: 'text/javascript', body: 'export const CHOICES = {};' });
		// The site's JSON (its RTL translations) as the module a bundler makes of it.
		if (path.startsWith('/parts/') && path.endsWith('.json')) return route.fulfill({ contentType: 'text/javascript', body: `export default ${await readFile(join(dirname(SITE), path.replace(/^\/parts\//, '')), 'utf8')};` });
		// The site's parts import their siblings in lib/site (the theme toggle, the typeset params) as well as the ports.
		const name = path.replace(/^\/parts\//, '');
		const sibling = path === '/parts/site.ts' ? SITE : await stat(join(PARTS, name)).then(() => undefined, () => join(dirname(SITE), name));
		const text = path === '/parts/registry.ts' ? registry : sibling ? (await readFile(sibling, 'utf8')).replaceAll("'../parts/", "'./") : await readFile(join(PARTS, name), 'utf8');
		return route.fulfill({ contentType: 'text/javascript', body: ts.transpileModule(text, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText });
	});
	await page.goto('http://parts.test/');
	await page.waitForFunction(() => (window as unknown as { ready?: boolean }).ready);
	return page;
}

const transformOf = (page: Page, i = 0) => page.locator('[data-slot="carousel-content"] > div').nth(i).evaluate((el) => (el as HTMLElement).style.transform);

// Chrome dispatches the pointer events of a mouse move with the next frame, after the move resolves: wait for the tooltip's own placement.
async function tooltipAt(page: Page, expected: RegExp): Promise<string> {
	const read = () => page.locator('.recharts-tooltip-wrapper').evaluate((e) => (e as HTMLElement).style.transform);
	const placed = await page.waitForFunction(([source, flags]) => new RegExp(source, flags).test((document.querySelector('.recharts-tooltip-wrapper') as HTMLElement).style.transform), [expected.source, expected.flags] as const, { timeout: 5000 }).then(() => true, () => false);
	if (placed) return read();
	// What the page received, so a placement that never comes says why.
	const seen = await page.evaluate(() => (window as unknown as { pointerLog?: string[] }).pointerLog?.join(' ') ?? '');
	return `${await read()} after pointer events: ${seen}`;
}
const x = (t: string) => Number(/translate3d\((-?[\d.]+)px, (-?[\d.]+)px/.exec(t)?.[1]);
const y = (t: string) => Number(/translate3d\((-?[\d.]+)px, (-?[\d.]+)px/.exec(t)?.[2]);
const settle = (page: Page) => page.waitForTimeout(1200);

// shadcn's Carousel markup with its Tailwind classes as inline styles: a 300 px viewport, the track pulled 16 px left
// (-ml-4) and each slide padded 16 px (pl-4), so a slide is 316 px and Embla's snaps are 0, -316, -632, -948, -1264.
function carousel(options: { basis?: string; align?: string; vertical?: boolean; autoplay?: number; hover?: string; rac?: boolean } = {}): string {
	const slides = Array.from({ length: 5 }, (_, i) => `<div role="group" aria-roledescription="slide" data-slot="carousel-item" style="min-width:0;flex:0 0 ${options.basis ?? '100%'};${options.vertical ? 'padding-top:16px;height:100px' : 'padding-left:16px'}"><div style="height:${options.vertical ? '84px' : '200px'};border:1px solid">${i + 1}</div></div>`).join('');
	return `<div style="padding:80px"><div role="region" aria-roledescription="carousel" data-slot="carousel" style="position:relative;width:300px"${options.align ? ` data-mm-align="${options.align}"` : ''}${options.autoplay ? ` data-mm-autoplay="${options.autoplay}"` : ''}${options.hover ? ` data-mm-autoplay-hover="${options.hover}"` : ''}>
	<div data-slot="carousel-content" style="overflow:hidden;${options.vertical ? 'height:200px' : ''}"><div style="display:flex;${options.vertical ? 'flex-direction:column;margin-top:-16px;height:216px' : 'margin-left:-16px'};transform:translate3d(0px, 0px, 0px)">${slides}</div></div>
	<button data-slot="carousel-previous" disabled${options.rac ? ' data-rac="" data-disabled="true"' : ''} style="position:absolute;left:-48px;top:0">Previous slide</button>
	<button data-slot="carousel-next"${options.rac ? ' data-rac="" tabindex="0"' : ''} style="position:absolute;right:-48px;top:0">Next slide</button></div></div>`;
}

test('carousel: Next and Previous move the track to Embla snaps and disable at the ends; the arrow keys step', async () => {
	const page = await open(carousel(), ['carousel']);
	await page.getByText('Next slide').click();
	await settle(page);
	assert.ok(Math.abs(x(await transformOf(page)) + 316) < 0.5, await transformOf(page));
	assert.equal(await page.getByText('Previous slide').isDisabled(), false);
	await page.getByText('Next slide').focus();
	await page.keyboard.press('ArrowRight');
	await settle(page);
	assert.ok(Math.abs(x(await transformOf(page)) + 632) < 0.5, await transformOf(page));
	for (let i = 0; i < 2; i++) await page.getByText('Next slide').click();
	await settle(page);
	assert.ok(Math.abs(x(await transformOf(page)) + 1264) < 0.5, await transformOf(page));
	assert.equal(await page.getByText('Next slide').isDisabled(), true);
	await page.getByText('Previous slide').focus();
	await page.keyboard.press('ArrowLeft');
	await settle(page);
	assert.ok(Math.abs(x(await transformOf(page)) + 948) < 0.5, await transformOf(page));
	await page.close();
});

test('carousel: a drag on the viewport follows the pointer and settles on the next snap in its direction', async () => {
	const page = await open(carousel(), ['carousel']);
	const box = (await page.locator('[data-slot="carousel-content"]').boundingBox())!;
	await page.mouse.move(box.x + 250, box.y + 100);
	await page.mouse.down();
	for (let s = 1; s <= 6; s++) await page.mouse.move(box.x + 250 - 15 * s, box.y + 100, { steps: 2 });
	const during = x(await transformOf(page));
	assert.ok(during < -60 && during > -120, `follows the pointer: ${during}`);
	await page.mouse.up();
	await settle(page);
	assert.ok(Math.abs(x(await transformOf(page)) + 316) < 0.5, await transformOf(page));
	// A slow drag, the pointer resting before release, settles on the nearest snap: back where it was.
	await page.mouse.move(box.x + 250, box.y + 100);
	await page.mouse.down();
	await page.mouse.move(box.x + 200, box.y + 100, { steps: 4 });
	await page.waitForTimeout(250);
	await page.mouse.up();
	await settle(page);
	assert.ok(Math.abs(x(await transformOf(page)) + 316) < 0.5, await transformOf(page));
	await page.close();
});

test('carousel: align start with three slides in view trims the snaps to the scrollable range; vertical moves on y', async () => {
	const page = await open(carousel({ basis: '33.3333%', align: 'start' }), ['carousel']);
	// Embla measures offsetWidth/offsetLeft: slides 105 px at 0, 105, 211, 316, 421; content 526 px, view 316 px: snaps 0, -105, -210.
	await page.getByText('Next slide').click();
	await settle(page);
	assert.ok(Math.abs(x(await transformOf(page)) + 105) < 0.6, await transformOf(page));
	await page.getByText('Next slide').click();
	await settle(page);
	assert.ok(Math.abs(x(await transformOf(page)) + 210) < 0.6, await transformOf(page));
	assert.equal(await page.getByText('Next slide').isDisabled(), true);
	await page.close();
	const vertical = await open(carousel({ vertical: true, basis: 'auto', align: 'start' }), ['carousel']);
	await vertical.getByText('Next slide').click();
	await settle(vertical);
	assert.ok(Math.abs(y(await transformOf(vertical)) + 100) < 0.5, await transformOf(vertical));
	await vertical.close();
});

test('carousel: with Autoplay it steps on its own every delay from the load, scrolled into view or not', async () => {
	const page = await open(carousel({ autoplay: 400 }), ['carousel']);
	await page.waitForTimeout(1500);
	assert.ok(x(await transformOf(page)) <= -316, await transformOf(page));
	await page.close();
});

test('carousel: Autoplay the old page stopped under the pointer stops on hover for good; one it paused plays again on leave', async () => {
	for (const hover of ['stop', 'pause']) {
		const page = await open(carousel({ autoplay: 300, hover }), ['carousel']);
		await page.evaluate(() => (window as unknown as { mountParts: (a: string) => void }).mountParts('data-mm-autoplay'));
		const box = (await page.locator('[data-slot="carousel-content"]').boundingBox())!;
		await page.mouse.move(box.x + 20, box.y + 20);
		await page.waitForTimeout(900);
		assert.equal(x(await transformOf(page)), 0, `${hover}: no step while the pointer is over it`);
		await page.mouse.move(1, 1);
		await page.waitForTimeout(900);
		assert.equal(x(await transformOf(page)) < 0, hover === 'pause', `${hover}: ${await transformOf(page)} after the pointer left`);
		await page.close();
	}
});


test('carousel: a React Aria Previous and Next switch data-disabled and their tab stop with disabled', async () => {
	const page = await open(carousel({ rac: true }), ['carousel']);
	const attrs = (slot: string) => page.locator(`[data-slot="carousel-${slot}"]`).evaluate((b) => [(b as HTMLButtonElement).disabled, b.getAttribute('data-disabled'), b.getAttribute('tabindex')]);
	await page.locator('[data-slot="carousel-next"]').click();
	assert.deepEqual(await attrs('previous'), [false, null, '0']);
	await page.locator('[data-slot="carousel-previous"]').click();
	assert.deepEqual(await attrs('previous'), [true, 'true', null]);
	await page.close();
});


// A Radix trigger rendered through asChild carries the child Button's data-slot ("button"); its layer's content names
// which part it is.
const popoverLayer = (key: string) => `<div data-mm-layer="${key}" hidden><div data-radix-popper-content-wrapper style="position:fixed;left:0;top:0"><div data-slot="popover-content" role="dialog" id="${key}" data-state="closed" tabindex="-1"><button>Inside</button></div></div></div>`;
const dialogLayer = (key: string) => `<div data-mm-layer="${key}" hidden data-slot="alert-dialog-overlay" data-state="closed"></div><div data-mm-layer="${key}" hidden role="alertdialog" id="${key}" data-slot="alert-dialog-content" data-state="closed"><button data-slot="alert-dialog-cancel">Cancel</button></div>`;

test('asChild: a Radix popover or alert dialog trigger with the child data-slot opens its own layer, as the part its content names', async () => {
	const page = await open(
		`<main><button data-slot="button" type="button" aria-haspopup="dialog" aria-expanded="false" aria-controls="pop" data-state="closed">Open popover</button>
		<button data-slot="button" type="button" aria-haspopup="dialog" aria-expanded="false" aria-controls="ad" data-state="closed">Show dialog</button></main>${popoverLayer('pop')}${dialogLayer('ad')}`,
		['radix/dialog', 'radix/popover'],
	);
	await page.getByText('Open popover').click();
	assert.equal(await page.getByText('Open popover').getAttribute('aria-expanded'), 'true');
	assert.equal(await page.locator('[data-slot="popover-content"]').getAttribute('data-state'), 'open');
	assert.equal(await page.locator('[data-slot="alert-dialog-content"]').getAttribute('data-state'), 'closed');
	await page.keyboard.press('Escape');
	await page.getByText('Show dialog').click();
	assert.equal(await page.getByText('Show dialog').getAttribute('aria-expanded'), 'true');
	assert.equal(await page.locator('[data-slot="alert-dialog-content"]').getAttribute('data-state'), 'open');
	await page.close();
});

test('asChild: a Radix dropdown menu trigger with the child data-slot opens the menu keyed by its id', async () => {
	const page = await open(
		`<main><button data-slot="button" type="button" id="menu" aria-haspopup="menu" aria-expanded="false" data-state="closed">Open</button></main>
		<div data-mm-layer="menu" hidden><div data-radix-popper-content-wrapper style="position:fixed"><div data-slot="dropdown-menu-content" role="menu" id="menu-content" aria-labelledby="menu" data-state="closed" tabindex="-1"><div role="menuitem" tabindex="-1">Profile</div></div></div></div>`,
		['radix/dropdown-menu'],
	);
	await page.getByText('Open').click();
	assert.equal(await page.getByText('Open').getAttribute('aria-expanded'), 'true');
	assert.equal(await page.locator('[role="menu"]').isVisible(), true);
	await page.close();
});

// Radix Tooltip as convert renders it: the content and its hidden role="tooltip" text a layer keyed by the trigger's id.
const tooltipLayer = (key: string, text: string) => `<div data-mm-layer="${key}" hidden data-radix-popper-content-wrapper style="position:fixed"><div data-slot="tooltip-content" data-state="closed">${text}<span id="${key}-text" role="tooltip" style="position:absolute;width:1px;height:1px;overflow:hidden">${text}</span></div></div>`;

test('Radix Tooltip: keyboard focus opens it instant-open; the pointer opens it delayed-open, instant-open within the skip delay after another closed', async () => {
	const page = await open(
		`<main style="padding:200px"><button id="a" data-slot="tooltip-trigger" data-state="closed">Save</button> <button id="b" data-slot="tooltip-trigger" data-state="closed">Print</button></main>${tooltipLayer('a', 'Save file')}${tooltipLayer('b', 'Print file')}`,
		['radix/tooltip'],
	);
	await page.keyboard.press('Tab');
	assert.equal(await page.locator('#a').getAttribute('data-state'), 'instant-open');
	assert.equal(await page.locator('#a').getAttribute('aria-describedby'), 'a-text');
	await page.keyboard.press('Tab');
	assert.equal(await page.locator('#a').getAttribute('data-state'), 'closed');
	assert.equal(await page.locator('#b').getAttribute('data-state'), 'instant-open');
	await page.close();
	const fresh = await open(`<main style="padding:200px"><button id="a" data-slot="tooltip-trigger" data-state="closed">Save</button> <button id="b" data-slot="tooltip-trigger" data-state="closed">Print</button></main>${tooltipLayer('a', 'Save file')}${tooltipLayer('b', 'Print file')}`, ['radix/tooltip']);
	await fresh.getByText('Save', { exact: true }).hover();
	assert.equal(await fresh.locator('#a').getAttribute('data-state'), 'delayed-open');
	await fresh.getByText('Print', { exact: true }).hover();
	assert.equal(await fresh.locator('#b').getAttribute('data-state'), 'instant-open');
	await fresh.close();
});

// The site's Document as convert writes it for ui.shadcn.com: next-themes' options and the toggle controls.json names.
const EARLY_THEME = `<script>${earlyThemeScript({ attribute: 'class', storageKey: 'theme', defaultTheme: 'system', themes: ['light', 'dark'], enableSystem: true, enableColorScheme: true, disableTransitionOnChange: true }, { name: 'Toggle theme', key: 'd' })}</script>`;
const themeFlips = (page: Page) => page.evaluate(() => (window as unknown as { flips?: number }).flips ?? 0);
// Every switch counts, two in one event too: each class change whose darkness differs from the next one's.
const countFlips = (page: Page) =>
	page.evaluate(() => {
		const w = window as unknown as { flips: number };
		w.flips = 0;
		const dark = (c: string | null) => /\bdark\b/.test(c ?? '');
		new MutationObserver((records) => {
			records.forEach((r, i) => {
				if (dark(r.oldValue) !== (i + 1 < records.length ? dark(records[i + 1]!.oldValue) : document.documentElement.classList.contains('dark'))) w.flips++;
			});
		}).observe(document.documentElement, { attributeFilter: ['class'], attributeOldValue: true });
	});

test('the site\'s D theme shortcut, a document listener on the old page, runs with the part that claims the key: in an open Radix menu "d" moves the typeahead and switches the theme once', async () => {
	const page = await open(
		`<main style="padding:200px"><button type="button" id="menu" aria-haspopup="menu" aria-expanded="false" data-state="closed" data-slot="dropdown-menu-trigger">Open</button></main>
		<div data-mm-layer="menu" hidden data-radix-popper-content-wrapper style="position:fixed"><div data-slot="dropdown-menu-content" role="menu" id="menu-content" aria-labelledby="menu" data-state="closed" tabindex="-1">${['Edit', 'Share', 'Delete'].map((t) => `<div role="menuitem" tabindex="-1">${t}</div>`).join('')}</div></div>`,
		['site', 'radix/dropdown-menu'],
		'body',
		EARLY_THEME,
	);
	await countFlips(page);
	// The pointer away from the menu (placed at the corner by the stub): the theme's restyle moves no pointer onto an item.
	await page.mouse.move(990, 790);
	await page.locator('#menu').focus();
	await page.keyboard.press('Enter');
	assert.equal(await page.evaluate(() => document.activeElement?.textContent), 'Edit');
	await page.keyboard.press('d');
	assert.equal(await page.evaluate(() => document.activeElement?.textContent), 'Delete');
	assert.equal(await themeFlips(page), 1);
	await page.close();
});

test("another document's theme switch (the storage event next-themes' ThemeProvider listens for) applies here too", async () => {
	const page = await open('<main>page</main>', ['site']);
	await page.evaluate(() => {
		localStorage.setItem('theme', 'dark');
		window.dispatchEvent(new StorageEvent('storage', { key: 'theme', newValue: 'dark' }));
	});
	assert.deepEqual(await page.evaluate(() => [document.documentElement.classList.contains('dark'), document.documentElement.style.colorScheme]), [true, 'dark']);
	await page.evaluate(() => window.dispatchEvent(new StorageEvent('storage', { key: 'other', newValue: 'light' })));
	assert.equal(await page.evaluate(() => document.documentElement.classList.contains('dark')), true, 'another key is not the theme');
	await page.evaluate(() => window.dispatchEvent(new StorageEvent('storage', { key: 'theme', newValue: null })));
	assert.equal(await page.evaluate(() => document.documentElement.classList.contains('dark')), await page.evaluate(() => matchMedia('(prefers-color-scheme: dark)').matches), 'a cleared theme is the default, the system one');
	assert.equal(await page.evaluate(() => localStorage.getItem('theme')), 'system', 'stored again, as setTheme(defaultTheme) does');
	await page.close();
});

test("in an open Base UI menu a typed key stops at the menu's typeahead, as Base UI's useTypeahead stops it: the site's D shortcut does not see it", async () => {
	const page = await open(
		`<main style="padding:100px"><button type="button" id="dd" aria-haspopup="menu" aria-expanded="false" data-slot="dropdown-menu-trigger">Open</button></main>
		<div data-base-ui-portal hidden data-mm-layer="dd"><div data-side="bottom" data-align="start" role="presentation" style="position:absolute;left:0;top:0" data-closed><div tabindex="-1" role="menu" aria-labelledby="dd" data-slot="dropdown-menu-content" data-closed>${['Edit', 'Share', 'Delete'].map((t) => `<div role="menuitem" tabindex="-1" data-slot="dropdown-menu-item">${t}</div>`).join('')}</div></div></div>`,
		['site', 'base-ui/menu'],
		'body',
		EARLY_THEME,
	);
	await countFlips(page);
	await page.mouse.move(990, 790);
	await page.locator('#dd').focus();
	await page.keyboard.press('ArrowDown');
	assert.equal(await page.evaluate(() => document.activeElement?.textContent), 'Edit');
	await page.keyboard.press('d');
	assert.equal(await page.evaluate(() => document.activeElement?.textContent), 'Delete');
	assert.equal(await themeFlips(page), 0, 'a key the typeahead took');
	await page.keyboard.press('x');
	assert.equal(await themeFlips(page), 0, 'a key matching no item is stopped too');
	await page.keyboard.press('Escape');
	await page.keyboard.press('d');
	assert.equal(await themeFlips(page), 1, 'with the menu closed the shortcut answers');
	await page.close();
});

test("a Base UI menu's radio and checkbox items keep it open when chosen (closeOnClick is false for them), a plain item closes it", async () => {
	const page = await open(
		`<main style="padding:100px"><button type="button" id="dd" aria-haspopup="menu" aria-expanded="false" data-slot="dropdown-menu-trigger">Open</button></main>
		<div data-base-ui-portal hidden data-mm-layer="dd"><div data-side="bottom" data-align="start" role="presentation" style="position:absolute;left:0;top:0" data-closed><div tabindex="-1" role="menu" aria-labelledby="dd" data-slot="dropdown-menu-content" data-closed><div role="menuitemradio" aria-checked="false" tabindex="-1">Inter</div><div role="menuitemcheckbox" aria-checked="false" tabindex="-1">Bold</div><div role="menuitem" tabindex="-1">Reset</div></div></div></div>`,
		['base-ui/menu'],
	);
	const shown = () => page.evaluate(() => !(document.querySelector('[data-mm-layer="dd"]') as HTMLElement).hidden);
	await page.locator('#dd').click();
	assert.equal(await shown(), true);
	await page.getByText('Inter').click();
	assert.equal(await shown(), true, 'a radio item chosen with the pointer');
	await page.getByText('Bold').click();
	assert.equal(await shown(), true, 'a checkbox item chosen with the pointer');
	await page.keyboard.press('ArrowUp');
	assert.equal(await page.evaluate(() => document.activeElement?.textContent), 'Inter');
	await page.keyboard.press('Enter');
	assert.equal(await shown(), true, 'a radio item chosen with Enter');
	await page.getByText('Reset').click();
	await page.waitForFunction(() => (document.querySelector('[data-mm-layer="dd"]') as HTMLElement).hidden, null, { timeout: 2000 });
	await page.close();
});

test("a Base UI menu whose Positioner takes another anchor than its trigger (the portal names it) is placed against that element", async () => {
	const page = await open(
		`<main style="padding:100px"><div id="card"><button type="button" id="dd" aria-haspopup="menu" aria-expanded="false" data-slot="dropdown-menu-trigger">Open</button></div></main>
		<div data-base-ui-portal hidden data-mm-layer="dd" data-mm-anchor="card"><div data-side="top" data-align="center" role="presentation" style="position:absolute;left:0;top:0" data-closed><div tabindex="-1" role="menu" aria-labelledby="dd" data-slot="dropdown-menu-content" data-closed><div role="menuitemradio" aria-checked="false" tabindex="-1">Inter</div></div></div></div>`,
		['base-ui/menu'],
	);
	await page.locator('#dd').click();
	await page.waitForFunction(() => ((globalThis as { placedAgainst?: string[] }).placedAgainst ?? []).length > 0);
	assert.deepEqual([...new Set(await page.evaluate(() => (globalThis as { placedAgainst?: string[] }).placedAgainst))], ['card']);
	await page.close();
});

test("the typeset preview takes its params as CSS variables on <html>, beside the preview fonts' variables: its URL's once idle, then each set the designer posts", async () => {
	const page = await open('<div class="inter_e8e54af-module__r7opxW__variable lora_89cfb44c-module__fAxLeq__variable"><div class="preview-params w-full"><div class="typeset w-full"><h1>Building a Streaming Chatbot</h1></div></div></div><div class="flex"></div>', ['site']);
	assert.deepEqual(await page.evaluate(() => [...document.documentElement.classList]), ['inter_e8e54af-module__r7opxW__variable', 'lora_89cfb44c-module__fAxLeq__variable'], "the preview layout's font variables go on <html>, a page's other classes do not");
	const vars = () => page.evaluate(() => ['--preview-size', '--preview-font', '--preview-font-heading', '--preview-measure'].map((v) => document.documentElement.style.getPropertyValue(v)));
	assert.deepEqual(await vars(), ['15px', "var(--font-geist-sans), 'Geist Variable', sans-serif", "var(--font-geist-sans), 'Geist Variable', sans-serif", '37em']);
	await page.evaluate(() => window.postMessage({ type: 'typeset-params', data: { body: 'inter', heading: 'inherit', mono: 'geist-mono', scale: '18', measure: '60', flow: '1.25em', leading: '1.75', item: 'docs' } }, location.origin));
	await page.waitForFunction(() => document.documentElement.style.getPropertyValue('--preview-size') === '18px');
	assert.deepEqual(await vars(), ['18px', "var(--font-inter), 'Inter Variable', sans-serif", "var(--font-inter), 'Inter Variable', sans-serif", '28em']);
	assert.equal(await page.evaluate(() => location.search), '?body=inter&scale=18&measure=60', 'the preview keeps them in its own URL, as its nuqs setParams did');
	await page.close();
});

// Base UI Combobox as the converter renders it: the list a portal keyed by the input's id, every item's indicator and
// every chip already there, hidden.
const comboboxLayer = (key: string, multi: boolean) => `<div data-mm-layer="${key}" hidden data-base-ui-portal><div data-slot="positioner"><div data-slot="combobox-content" data-closed><div role="status" data-slot="combobox-empty" class="empty">No items found.</div><div role="listbox" id="${key}-list" data-slot="combobox-list"${multi ? ' aria-multiselectable="true"' : ''}>${['Next.js', 'SvelteKit', 'Nuxt.js']
	.map((t, i) => `<div role="option" id="${key}-${i}" aria-selected="${multi && i === 0}" data-slot="combobox-item"${multi && i === 0 ? ' data-selected' : ''}>${t}<span aria-hidden="true" data-mm-indicator${multi && i === 0 ? ' data-selected' : ' hidden'}>✓</span></div>`)
	.join('')}</div></div></div></div>`;

test('combobox: a query nothing matches marks the popup empty; with several values choosing toggles chips, a chip removes itself, clear empties the field', async () => {
	const page = await open(
		`<style>.empty{display:none}[data-empty] .empty{display:block}</style><main>
		<div data-slot="input-group"><span role="button" aria-label="Dismiss" hidden data-mm-shown-with="single"></span><input id="single" role="combobox" aria-haspopup="listbox" aria-expanded="false" data-slot="input-group-control" value="Next.js"><button data-slot="input-group-button" aria-haspopup="listbox">v</button><button data-slot="combobox-clear" data-visible>Clear</button></div>
		<div role="toolbar" data-slot="combobox-chips"><div data-slot="combobox-chip" data-mm-chip="Next.js">Next.js<button data-slot="combobox-chip-remove">x</button></div><div data-slot="combobox-chip" data-mm-chip="SvelteKit" hidden>SvelteKit<button data-slot="combobox-chip-remove">x</button></div><div data-slot="combobox-chip" data-mm-chip="Nuxt.js" hidden>Nuxt.js<button data-slot="combobox-chip-remove">x</button></div><input id="multi" role="combobox" aria-haspopup="listbox" aria-expanded="false" data-slot="combobox-chip-input" value=""></div></main>
		${comboboxLayer('single', false)}${comboboxLayer('multi', true)}`,
		['base-ui/combobox'],
	);
	await page.locator('#single').click();
	assert.equal(await page.locator('[aria-label="Dismiss"]').evaluate((el) => (el as HTMLElement).hidden), false, 'what the list puts beside its input shows with it');
	await page.locator('#single').fill('');
	await page.locator('#single').pressSequentially('zz');
	assert.equal(await page.locator('[data-mm-layer="single"] .empty').isVisible(), true, 'the empty message shows');
	await page.locator('#single').fill('');
	await page.locator('#single').pressSequentially('Sv');
	assert.equal(await page.locator('[data-mm-layer="single"] .empty').isVisible(), false);
	await page.locator('[data-mm-layer="single"] [role="option"]', { hasText: 'SvelteKit' }).click();
	// Emptying the input cleared the value, and with it the clear button (ComboboxClear shows while a value is selected).
	await page.getByText('Clear').click();
	assert.equal(await page.locator('#single').inputValue(), '');
	assert.equal(await page.getByText('Clear').isHidden(), true);

	await page.locator('#multi').click();
	await page.locator('[data-mm-layer="multi"] [role="option"]', { hasText: 'Nuxt.js' }).click();
	assert.equal(await page.locator('[data-mm-chip="Nuxt.js"]').isVisible(), true, 'choosing shows its chip');
	assert.equal(await page.locator('[data-mm-layer="multi"] [role="option"]', { hasText: 'Nuxt.js' }).getAttribute('aria-selected'), 'true');
	assert.equal(await page.locator('[data-mm-layer="multi"] [role="listbox"]').isVisible(), true, 'the list stays open');
	await page.keyboard.press('Escape');
	await page.locator('[data-mm-chip="Next.js"] [data-slot="combobox-chip-remove"]').click();
	assert.equal(await page.locator('[data-mm-chip="Next.js"]').isHidden(), true, 'a removed chip goes');
	assert.equal(await page.locator('[data-mm-layer="multi"] [role="option"]', { hasText: 'Next.js' }).getAttribute('aria-selected'), 'false');
	await page.close();
});

// shadcn's Command demo as cmdk renders it once mounted: the first item selected, Calculator disabled, the empty state
// rendered hidden by the converter.
const commandItem = (id: string, value: string, disabled = false, selected = false) =>
	`<div id="${id}" cmdk-item="" role="option" aria-disabled="${disabled}" aria-selected="${selected}" data-disabled="${disabled}" data-selected="${selected}" data-value="${value}">${value}</div>`;
const COMMAND = `<div cmdk-root="" tabindex="-1"><input cmdk-input="" role="combobox" aria-controls="list" type="text" value=""><div cmdk-list="" role="listbox" id="list" style="height:200px;overflow:auto"><div cmdk-list-sizer=""><div cmdk-empty="" role="presentation" hidden>No results found.</div>
	<div cmdk-group="" role="presentation" data-value="Suggestions"><div cmdk-group-heading="">Suggestions</div><div cmdk-group-items="" role="group">${commandItem('cal', 'Calendar', false, true)}${commandItem('emo', 'Search Emoji')}${commandItem('calc', 'Calculator', true)}</div></div>
	<div cmdk-separator="" role="separator"></div>
	<div cmdk-group="" role="presentation" data-value="Settings"><div cmdk-group-heading="">Settings</div><div cmdk-group-items="" role="group">${commandItem('pro', 'Profile⌘P')}${commandItem('bil', 'Billing⌘B')}${commandItem('set', 'Settings⌘S')}</div></div></div></div></div>`;

async function commandState(page: Page) {
	return page.evaluate(() => {
		const input = document.querySelector('[cmdk-input]')!;
		const shown = [...document.querySelectorAll<HTMLElement>('[cmdk-item]')].filter((i) => i.offsetParent !== null).sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
		const ad = input.getAttribute('aria-activedescendant');
		return {
			order: shown.map((i) => i.id).join(','),
			selected: [...document.querySelectorAll('[cmdk-item][aria-selected="true"]')].map((i) => i.id).join(','),
			ad: ad === document.querySelector('[cmdk-list]')!.getAttribute('aria-activedescendant') ? ad : 'list differs',
			empty: (document.querySelector('[cmdk-empty]') as HTMLElement).offsetParent !== null,
			separator: (document.querySelector('[cmdk-separator]') as HTMLElement).hidden,
		};
	});
}

test('cmdk: command-score filters and sorts the items left after the disabled ones; nothing left shows the empty state', async () => {
	const page = await open(COMMAND, ['cmdk']);
	await page.locator('[cmdk-input]').focus();
	await page.keyboard.type('se');
	assert.deepEqual(await commandState(page), { order: 'emo,set', selected: 'emo', ad: null, empty: false, separator: true });
	await page.keyboard.press('Backspace');
	await page.keyboard.press('Backspace');
	await page.keyboard.type('c');
	assert.deepEqual(await commandState(page), { order: 'calc,cal,emo', selected: 'cal', ad: 'emo', empty: false, separator: true }, 'Calculator, disabled, is not moved; Profile has no c');
	await page.keyboard.type('xq');
	assert.deepEqual(await commandState(page), { order: '', selected: '', ad: null, empty: true, separator: true });
	await page.close();
});

test('cmdk: aria-activedescendant names an item a key or the pointer selected; a search that moves the selection leaves the one before it', async () => {
	const page = await open(COMMAND, ['cmdk']);
	await page.locator('[cmdk-input]').focus();
	await page.keyboard.press('ArrowDown');
	await page.keyboard.press('ArrowDown');
	assert.deepEqual(await commandState(page), { order: 'cal,emo,calc,pro,bil,set', selected: 'pro', ad: 'pro', empty: false, separator: false }, 'ArrowDown skips the disabled item');
	await page.keyboard.type('i');
	assert.deepEqual(await commandState(page), { order: 'emo,pro,bil,set', selected: 'emo', ad: 'pro', empty: false, separator: true });
	await page.keyboard.press('Backspace');
	assert.deepEqual(await commandState(page), { order: 'cal,emo,calc,pro,bil,set', selected: 'cal', ad: 'emo', empty: false, separator: false }, 'cleared, React puts the items back in source order');
	await page.keyboard.press('Alt+ArrowDown');
	assert.equal((await commandState(page)).selected, 'pro', 'Alt with an arrow goes to the next group');
	await page.close();
});

test('cmdk: as each mounted command scrolls its selected item into view, the page ends where the last one below the fold put it; one in a hidden layer moves nothing', async () => {
	const page = await open(`<div style="height:3000px">top</div>${COMMAND}<div style="height:2000px"></div><div data-mm-layer="k" hidden>${COMMAND.replaceAll('id="', 'id="h')}</div>`, ['cmdk']);
	const got = await page.evaluate(() => {
		const item = document.getElementById('cal')!.getBoundingClientRect();
		return { scrollY: Math.round(scrollY), bottom: Math.round(item.bottom), inner: innerHeight };
	});
	assert.ok(got.scrollY > 2000, `the page scrolled to the command (${got.scrollY})`);
	assert.equal(got.bottom, got.inner, 'block: nearest brings the selected item to the bottom edge');
	await page.close();
});

test('cmdk: the wheel turned over the list under a still pointer leaves the selection where the pointer last moved it', async () => {
	const many = Array.from({ length: 30 }, (_, i) => commandItem(`i${i}`, `Item ${i}`, false, i === 0).replace('>Item', ' style="height:30px">Item')).join('');
	const page = await open(`<div cmdk-root="" tabindex="-1"><input cmdk-input="" role="combobox" type="text" value=""><div cmdk-list="" role="listbox" style="height:150px;overflow:auto"><div cmdk-list-sizer=""><div cmdk-group="" role="presentation"><div cmdk-group-items="" role="group">${many}</div></div></div></div></div>`, ['cmdk']);
	const chosen = () => page.evaluate(() => [...document.querySelectorAll('[cmdk-item][aria-selected="true"]')].map((i) => i.id).join(','));
	await page.locator('[cmdk-list]').hover();
	const pointed = await chosen();
	assert.notEqual(pointed, 'i0', 'moving the pointer onto an item selects it');
	await page.mouse.wheel(0, 240);
	await page.waitForFunction(() => document.querySelector('[cmdk-list]')!.scrollTop > 0);
	await page.waitForTimeout(300);
	assert.equal(await chosen(), pointed, 'items scrolling under the pointer do not take the selection');
	await page.mouse.move(10, 400);
	await page.locator('[cmdk-list]').hover();
	assert.notEqual(await chosen(), pointed, 'the next pointer move selects the item it is on');
	await page.close();
});

test('cmdk: a command in a closed layer holds no selection; opening it selects the first item, each time, as cmdk does on mount', async () => {
	const page = await open(`<button id="trigger">Search</button><div data-mm-layer="k" hidden>${COMMAND.replace('aria-selected="true"', 'aria-selected="false"').replace('data-selected="true"', 'data-selected="false"')}</div>`, ['cmdk']);
	await page.evaluate(() => {
		const log: string[] = [];
		(window as unknown as { flips: string[] }).flips = log;
		new MutationObserver((ms) => { for (const m of ms) log.push(`${(m.target as Element).id} ${m.attributeName} ${m.oldValue}->${(m.target as Element).getAttribute(m.attributeName!)}`); }).observe(document.body, { subtree: true, attributes: true, attributeOldValue: true, attributeFilter: ['aria-selected', 'data-selected'] });
	});
	const flips = () => page.evaluate(() => (window as unknown as { flips: string[] }).flips.splice(0));
	for (const round of ['first open', 'reopen']) {
		await page.evaluate(() => ((document.querySelector('[data-mm-layer]') as HTMLElement).hidden = false));
		await page.locator('[cmdk-input]').focus();
		assert.deepEqual(await flips(), ['cal aria-selected false->true', 'cal data-selected false->true'], round);
		assert.deepEqual(await commandState(page), { order: 'cal,emo,calc,pro,bil,set', selected: 'cal', ad: null, empty: false, separator: false }, round);
		await page.keyboard.press('ArrowDown');
		await page.locator('#trigger').focus();
		await page.evaluate(() => ((document.querySelector('[data-mm-layer]') as HTMLElement).hidden = true));
		await page.waitForFunction(() => !document.querySelector('[cmdk-item][aria-selected="true"]'));
		await flips();
	}
	await page.close();
});

test('cmdk: a command in a layer opens again with no search, its first item selected and nothing active', async () => {
	const page = await open(`<button id="trigger">Search</button><div data-mm-layer="k">${COMMAND}</div>`, ['cmdk']);
	await page.locator('[cmdk-input]').focus();
	await page.keyboard.type('bil');
	await page.keyboard.press('ArrowDown');
	// Focus leaves as an outside press starts closing the layer: what it shows stays while it animates out, as React's does.
	await page.locator('#trigger').focus();
	assert.equal(await page.locator('[cmdk-input]').inputValue(), 'bil');
	assert.equal((await commandState(page)).selected, 'bil');
	await page.evaluate(() => (document.querySelector('[data-mm-layer]') as HTMLElement).hidden = true);
	await page.waitForFunction(() => (document.querySelector('[cmdk-input]') as HTMLInputElement).value === '');
	await page.evaluate(() => (document.querySelector('[data-mm-layer]') as HTMLElement).hidden = false);
	await page.locator('[cmdk-input]').focus();
	assert.deepEqual(await commandState(page), { order: 'cal,emo,calc,pro,bil,set', selected: 'cal', ad: null, empty: false, separator: false });
	await page.close();
});

test('cmdk: a list scrolled before its layer closed opens again at the top, so the pointer lands where it did the first time', async () => {
	const many = Array.from({ length: 30 }, (_, i) => commandItem(`i${i}`, `Item ${i}`, false, i === 0).replace('>Item', ' style="height:30px">Item')).join('');
	const page = await open(`<button id="trigger">Search</button><div data-mm-layer="k"><div cmdk-root="" tabindex="-1"><input cmdk-input="" role="combobox" type="text" value=""><div cmdk-list="" role="listbox" style="height:150px;overflow:auto"><div cmdk-list-sizer=""><div cmdk-group="" role="presentation"><div cmdk-group-items="" role="group">${many}</div></div></div></div></div></div>`, ['cmdk']);
	const chosen = () => page.evaluate(() => [...document.querySelectorAll('[cmdk-item][aria-selected="true"]')].map((i) => i.id).join(','));
	await page.locator('[cmdk-input]').focus();
	await page.locator('[cmdk-list]').hover();
	const pointed = await chosen();
	await page.mouse.wheel(0, 240);
	await page.waitForFunction(() => document.querySelector('[cmdk-list]')!.scrollTop > 0);
	await page.locator('#trigger').focus();
	await page.evaluate(() => (document.querySelector('[data-mm-layer]') as HTMLElement).hidden = true);
	await page.waitForFunction(() => !document.querySelector('[cmdk-item][aria-selected="true"]'));
	await page.mouse.move(10, 400);
	await page.evaluate(() => (document.querySelector('[data-mm-layer]') as HTMLElement).hidden = false);
	assert.equal(await page.evaluate(() => document.querySelector('[cmdk-list]')!.scrollTop), 0, 'cmdk mounts the list again, so it starts at the top');
	await page.locator('[cmdk-list]').hover();
	assert.equal(await chosen(), pointed, 'the pointer lands on the item it landed on the first time');
	await page.close();
});

test('cmdk: items the page renders during a search are filtered and sorted by it; with nothing selected, or the selected item gone, the first is', async () => {
	const page = await open(COMMAND, ['cmdk']);
	await page.locator('[cmdk-input]').focus();
	await page.keyboard.type('zz');
	assert.deepEqual(await commandState(page), { order: '', selected: '', ad: null, empty: true, separator: true });
	await page.evaluate(() => {
		const group = document.createElement('div');
		group.setAttribute('cmdk-group', '');
		group.innerHTML = '<div cmdk-group-heading="">Results</div><div cmdk-group-items="" role="group"></div>';
		group.lastElementChild!.innerHTML = ['zz one', 'other', 'zz two'].map((v, i) => `<div id="r${i}" cmdk-item="" role="option" aria-disabled="false" aria-selected="false" data-value="${v}">${v}</div>`).join('');
		document.querySelector('[cmdk-list-sizer]')!.append(group);
	});
	await page.waitForFunction(() => document.querySelector('#r1')!.hasAttribute('hidden'));
	assert.deepEqual(await commandState(page), { order: 'r0,r2', selected: 'r0', ad: null, empty: false, separator: true });
	await page.keyboard.press('ArrowDown');
	await page.evaluate(() => document.querySelector('#r0')!.remove());
	await page.waitForFunction(() => document.querySelector('#r2')!.getAttribute('aria-selected') === 'true');
	assert.equal((await commandState(page)).order, 'r2', 'an item leaving keeps the selection where it is');
	await page.evaluate(() => document.querySelector('#r2')!.remove());
	await page.waitForFunction(() => !document.querySelector('[cmdk-item][aria-selected="true"]:not([hidden])'));
	assert.deepEqual(await commandState(page), { order: '', selected: '', ad: null, empty: true, separator: true }, 'cmdk reads the active item after the selected one left');
	await page.keyboard.press('Backspace');
	await page.keyboard.press('Backspace');
	assert.deepEqual(await commandState(page), { order: 'cal,emo,calc,pro,bil,set,r1', selected: 'cal', ad: null, empty: false, separator: false });
	await page.close();
});

test('cmdk: choosing an item the page renders goes to its data-mm-href, by Enter and by a click', async () => {
	const page = await open(COMMAND.replace('data-value="Search Emoji"', 'data-value="Search Emoji" data-mm-href="/docs/emoji"').replace('data-value="Profile⌘P"', 'data-value="Profile⌘P" data-mm-href="/docs/profile"'), ['cmdk']);
	await page.locator('[cmdk-input]').focus();
	await page.keyboard.press('ArrowDown');
	await page.keyboard.press('Enter');
	const went = () => page.evaluate(() => (window as unknown as { navigated?: string }).navigated);
	assert.equal(await went(), '/docs/emoji');
	await page.locator('#pro').click();
	assert.equal(await went(), '/docs/profile');
	await page.close();
});

test('cmdk: a site\'s own filter is its own Command\'s; every other Command keeps command-score', async () => {
	const page = await open(`<div id="site">${COMMAND}</div><div id="demo">${COMMAND}</div>`, ['cmdk']);
	await page.evaluate(async () => {
		const { configure } = await import('/parts/cmdk.ts' as string);
		configure({ applies: (root: HTMLElement) => root.parentElement!.id === 'site', filter: (value: string, search: string) => (value.toLowerCase().includes(search.toLowerCase()) ? 1 : 0) });
	});
	const shown = (id: string) => page.locator(`#${id} [cmdk-item]:not([hidden])`).evaluateAll((els) => els.map((e) => e.id).join(','));
	for (const id of ['site', 'demo']) {
		await page.locator(`#${id} [cmdk-input]`).focus();
		await page.keyboard.type('sg');
	}
	assert.equal(await shown('site'), '', 'no value holds "sg"');
	assert.equal(await shown('demo'), 'set', 'Settings holds s then g');
	await page.close();
});

test('a Radix trigger with its own id has its layer under the id, while aria-controls names the content', async () => {
	const page = await open(
		`<main style="padding-top:300px"><button data-slot="popover-trigger" id="date-picker-simple" type="button" aria-haspopup="dialog" aria-expanded="false" aria-controls="content-1" data-state="closed">Pick a date</button></main>
		<div data-mm-layer="date-picker-simple" hidden data-radix-popper-content-wrapper style="position:fixed"><div data-slot="popover-content" role="dialog" id="content-1" data-state="closed" tabindex="-1">Calendar</div></div>`,
		['radix/popover'],
	);
	await page.getByText('Pick a date').click();
	assert.equal(await page.getByText('Pick a date').getAttribute('aria-expanded'), 'true');
	assert.equal(await page.locator('#content-1').getAttribute('data-state'), 'open');
	await page.getByText('Pick a date').click();
	assert.equal(await page.getByText('Pick a date').getAttribute('aria-expanded'), 'false', 'a second press closes it');
	await page.close();
});

test('a Radix popover, non-modal, focuses its first control that is not a link and loops Tab inside, as its FocusScope does', async () => {
	const page = await open(
		`<main><button data-slot="popover-trigger" aria-haspopup="dialog" aria-expanded="false" aria-controls="pop" data-state="closed">Open</button>
		<button data-slot="popover-trigger" aria-haspopup="dialog" aria-expanded="false" aria-controls="text" data-state="closed">Read</button><a href="#after">After</a></main>
		<div data-mm-layer="pop" hidden><div data-radix-popper-content-wrapper style="position:fixed;left:0;top:100px"><div data-slot="popover-content" role="dialog" id="pop" data-state="closed" tabindex="-1"><a href="#home">Home</a><button>One</button><button style="display:none">Gone</button><button>Two</button></div></div></div>
		<div data-mm-layer="text" hidden><div data-radix-popper-content-wrapper style="position:fixed;left:0;top:200px"><div data-slot="popover-content" role="dialog" id="text" data-state="closed" tabindex="-1">Only text</div></div></div>`,
		['radix/popover'],
	);
	await page.getByText('Open').click();
	assert.equal(await focusOf(page), 'button:One', 'the link before it is skipped');
	await page.keyboard.press('Tab');
	assert.equal(await focusOf(page), 'button:Two');
	await page.keyboard.press('Tab');
	assert.equal(await focusOf(page), 'a:Home', 'Tab from the last shown control wraps to the first');
	await page.keyboard.press('Shift+Tab');
	assert.equal(await focusOf(page), 'button:Two', 'Shift+Tab from the first wraps to the last');
	assert.equal(await page.getByText('Open').getAttribute('aria-expanded'), 'true');
	await page.keyboard.press('Escape');
	await page.getByText('Read').click();
	assert.equal(await focusOf(page), 'div[dialog]:Only text');
	await page.keyboard.press('Tab');
	assert.equal(await focusOf(page), 'div[dialog]:Only text', 'with nothing to tab to, focus stays on the content');
	await page.close();
});

test('recharts: the pointer picks the point whose range it is in, the tooltip goes where recharts puts it, the arrow keys step, leaving hides', async () => {
	const facts = JSON.stringify({ w: 300, h: 100, v: [5, 5, 290, 90], m: 'x', g: [[0, 99, 0], [100, 199, 1], [200, 300, 2]], sp: [5, 95], p: [[50, null], [150, null], [250, null]], k: [[0, 50, 60], [1, 150, 60], [2, 250, 60]] });
	const page = await open(
		`<div style="padding:50px"><div class="recharts-wrapper" style="position:relative;width:300px;height:100px" data-mm-chart="1"><svg class="recharts-surface" tabindex="0" width="300" height="100" style="display:block" data-mm-facts='${facts}'></svg><div class="recharts-tooltip-wrapper" style="visibility: hidden; position: absolute; top: 0px; left: 0px;"><div style="width:40px;height:20px">tip</div></div></div></div><button>after</button>`,
		['recharts'],
	);
	await page.evaluate(() => (window as unknown as { mountParts: (a: string) => void }).mountParts('data-mm-chart'));
	await page.evaluate(() => {
		(window as unknown as { seen: number[] }).seen = [];
		document.querySelector('.recharts-wrapper')!.addEventListener('mmchart', (e) => (window as unknown as { seen: number[] }).seen.push((e as CustomEvent<number>).detail));
	});
	const tip = page.locator('.recharts-tooltip-wrapper');
	await page.mouse.move(60, 100);
	await page.mouse.move(210, 100, { steps: 4 });
	assert.match(await tooltipAt(page, /translate\(150px, 60px\)/), /translate\(150px, 60px\)/, 'x as the old page placed it, y the pointer\'s past the offset');
	assert.deepEqual(await page.evaluate(() => (window as unknown as { seen: number[] }).seen), [0, 1]);
	assert.equal(await tip.evaluate((e) => (e as HTMLElement).style.visibility), 'visible');
	await page.mouse.move(210, 130);
	assert.match(await tooltipAt(page, /translate\(150px, 50px\)/), /translate\(150px, 50px\)/, 'flipped above the pointer where it would leave the view box');
	await page.mouse.move(5, 5);
	assert.equal(await tooltipAt(page, /^$/), '', 'hidden, it drops its place, so it comes in from the corner next time as recharts\' does');
	assert.equal(await tip.evaluate((e) => (e as HTMLElement).style.visibility), 'hidden');
	await page.locator('svg.recharts-surface').focus();
	await page.keyboard.press('ArrowRight');
	assert.match(await tooltipAt(page, /translate\(150px, 60px\)/), /translate\(150px, 60px\)/);
	assert.deepEqual((await page.evaluate(() => (window as unknown as { seen: number[] }).seen)).slice(-3), [-1, 0, 1], 'focus shows the first point, the arrow the next');
	await page.keyboard.press('Escape');
	assert.equal(await tooltipAt(page, /^$/), '');
	assert.equal(await tip.evaluate((e) => (e as HTMLElement).style.visibility), 'hidden');
	await page.close();
});

test('Base UI dialog locks scroll as @base-ui/utils useScrollLock does: the body stops scrolling (a stable gutter on <html> where scrollbars take room), put back on close', async () => {
	const page = await open(
		`<main style="height:3000px"><button data-slot="dialog-trigger" data-base-ui-click-trigger aria-haspopup="dialog" aria-expanded="false" id="dlg" type="button">Open Dialog</button></main>
		<div data-mm-layer="dlg" hidden data-base-ui-portal><div role="presentation" data-base-ui-inert aria-hidden="true" style="position:fixed;inset:0"></div><div data-slot="dialog-overlay"></div><div role="dialog" data-slot="dialog-content" data-closed tabindex="-1" style="position:relative;z-index:1"><button data-slot="dialog-close">Close</button></div></div>`,
		['base-ui/dialog'],
	);
	const bar = await page.evaluate(() => innerWidth - document.documentElement.clientWidth);
	await page.getByText('Open Dialog').click();
	await page.waitForFunction(() => document.body.style.overflowY === 'hidden');
	assert.deepEqual(await page.evaluate(() => [document.documentElement.style.scrollbarGutter, document.documentElement.style.paddingRight]), [bar > 0 ? 'stable' : '', '']);
	await page.getByText('Close').click();
	await page.waitForFunction(() => document.body.style.overflowY === '');
	assert.equal(await page.evaluate(() => document.documentElement.style.scrollbarGutter), '');
	await page.close();
});

test('a plain button a page opens its dialog from (no ARIA) opens the dialog captured under its key', async () => {
	const page = await open(
		`<main style="padding-top:300px"><button data-slot="button" data-mm-key="p:1.2" type="button">Open Menu</button></main>${dialogLayer('p:1.2').replace('role="alertdialog"', 'role="dialog"').replace(/alert-dialog/g, 'dialog').replace(/ id="p:1.2"/, '')}`,
		['radix/dialog'],
	);
	await page.getByText('Open Menu').click();
	assert.equal(await page.locator('[role="dialog"]').getAttribute('data-state'), 'open');
	assert.equal(await page.getByText('Open Menu').getAttribute('aria-expanded'), null, 'the button gets no ARIA it did not have');
	await page.keyboard.press('Escape');
	assert.equal(await page.locator('[role="dialog"]').getAttribute('data-state'), 'closed');
	await page.close();
});

// sidebar-13's settings dialog: its state opens it on mount, so the page came with it open and Radix's marks on the rest.
const shownDialog = `<main data-aria-hidden="true" aria-hidden="true"><button data-slot="dialog-trigger" type="button" aria-haspopup="dialog" aria-expanded="true" aria-controls="dlg" data-state="open">Open Dialog</button><button type="button">Behind</button></main>
	<div data-state="open" data-slot="dialog-overlay" style="position:fixed;inset:0"></div><div role="dialog" id="dlg" data-state="open" data-slot="dialog-content" tabindex="-1" style="pointer-events:auto;position:fixed;top:40px;left:40px"><a href="#x">Link</a><button type="button" data-slot="dialog-close">Close</button></div>`;

for (const how of ['Escape', 'outside', 'close'] as const)
	test(`a Radix dialog the page shows open at load is taken as open: focus moves into it, and ${how === 'close' ? 'its Close' : how === 'Escape' ? 'Escape' : 'a press outside'} closes it and shows the page again`, async () => {
		const page = await open(shownDialog, ['radix/dialog']);
		await page.evaluate(() => (document.body.style.pointerEvents = 'none'));
		await page.waitForFunction(() => document.activeElement?.getAttribute('data-slot') === 'dialog-close', undefined, { timeout: 3000 }).catch(() => {});
		assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('data-slot')), 'dialog-close', 'Radix focuses its first tabbable control that is not a link');
		if (how === 'Escape') await page.keyboard.press('Escape');
		else if (how === 'outside') await page.mouse.click(600, 700);
		else await page.getByText('Close').click();
		await page.waitForTimeout(100);
		assert.deepEqual(await page.evaluate(() => ({ state: document.getElementById('dlg')!.getAttribute('data-state'), trigger: document.querySelector('[data-slot="dialog-trigger"]')!.getAttribute('aria-expanded'), main: document.querySelector('main')!.getAttribute('aria-hidden'), body: document.body.style.pointerEvents })), { state: 'closed', trigger: 'false', main: null, body: '' });
		await page.getByText('Open Dialog').click();
		await page.waitForTimeout(100);
		assert.deepEqual(await page.evaluate(() => ({ state: document.getElementById('dlg')!.getAttribute('data-state'), shown: document.getElementById('dlg')!.checkVisibility(), focus: document.activeElement?.getAttribute('data-slot') })), { state: 'open', shown: true, focus: 'dialog-close' }, 'its trigger opens it again');
		await page.close();
	});

// Markless finds a bound element by its place in the page's element order, counted once on first use: moved before then, it is not found.
test('a Radix dialog holding Markless handlers (the docs palette) opens where the page rendered it; one without them goes to the end of the page', async () => {
	for (const bound of [true, false]) {
		const layer = dialogLayer('ad').replace(/alert-dialog/g, 'dialog').replace('role="alertdialog"', 'role="dialog"').replace('<button data-slot="dialog-cancel">Cancel</button>', `<input${bound ? ' m:on="input:0"' : ''}>`);
		const page = await open(`<div data-async-container><main><button data-slot="dialog-trigger" type="button" aria-haspopup="dialog" aria-expanded="false" aria-controls="ad" data-state="closed">Search</button></main>${layer}<div id="later"></div><!--markless:page-end--></div>`, ['radix/dialog']);
		await page.getByText('Search').click();
		assert.equal(await page.locator('[role="dialog"]').getAttribute('data-state'), 'open');
		const order = await page.evaluate(() => [...document.querySelector('[data-async-container]')!.children].map((e) => e.id || e.getAttribute('data-slot') || e.tagName.toLowerCase()).join(','));
		assert.equal(order, bound ? 'main,dialog-overlay,ad,later' : 'main,later,dialog-overlay,ad');
		await page.close();
	}
});

test('shadcn-ui site: a code block\'s copy button writes what it copied on the old page and shows Copied with the check for 2 s', async () => {
	const icon = '<svg class="lucide lucide-copy"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"></rect><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"></path></svg>';
	const button = `<button data-slot="code-block-copy-button" type="button" aria-label="Copy">${icon}</button>`;
	const page = await open(`<div data-slot="code-block">${button}</div><div data-slot="code-block">${button}</div><template data-mm-clipboard="button|code-block-copy-button|#1" data-mm-text="second block"></template>`, ['site']);
	await page.evaluate(() => {
		const w = window as unknown as { written: string[] };
		w.written = [];
		Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: (t: string) => (w.written.push(t), Promise.resolve()) } });
	});
	const second = page.locator('[data-slot="code-block-copy-button"]').nth(1);
	await second.click();
	await page.waitForTimeout(100);
	const look = () => second.evaluate((b) => [b.getAttribute('aria-label'), b.getAttribute('data-copied'), b.querySelector('svg')!.getAttribute('class'), b.querySelector('rect')!.getAttribute('display')]);
	assert.deepEqual(await page.evaluate(() => (window as unknown as { written: string[] }).written), ['second block']);
	assert.deepEqual(await look(), ['Copied', 'true', 'lucide lucide-check', 'none']);
	await page.waitForTimeout(2100);
	assert.deepEqual(await look(), ['Copy', null, 'lucide lucide-copy', null]);
	await page.close();
});

test('shadcn-ui site: the block viewer\'s npx command button draws lucide\'s check over its Terminal icon (a polyline and a line) for 2 s', async () => {
	const icon = '<svg class="lucide lucide-terminal" viewBox="0 0 24 24"><polyline points="4 17 10 11 4 5"></polyline><line x1="12" x2="20" y1="19" y2="19"></line></svg>';
	const page = await open(`<button data-slot="button" type="button">${icon}<span>npx shadcn add sidebar-07</span></button><template data-mm-clipboard="button|button|npx shadcn add sidebar-07#0" data-mm-text="npx shadcn@latest add sidebar-07"></template>`, ['site']);
	await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: () => Promise.resolve() } }));
	await page.locator('button').click();
	await page.waitForTimeout(100);
	const look = () => page.locator('button svg').evaluate((svg) => [svg.getAttribute('class'), ...[...svg.children].map((c) => `${c.tagName}:${c.getAttribute('points') ?? c.getAttribute('d') ?? c.getAttribute('x1')}${c.getAttribute('display') ? ' hidden' : ''}`)]);
	assert.deepEqual(await look(), ['lucide lucide-check', 'polyline:20 6 9 17 4 12', 'line:12 hidden'], 'the check is drawn, not just the terminal hidden');
	await page.waitForTimeout(2100);
	assert.deepEqual(await look(), ['lucide lucide-terminal', 'polyline:4 17 10 11 4 5', 'line:12']);
	await page.close();
});

test('shadcn-ui site: the block viewer\'s Refresh Preview loads the block\'s frame again', async () => {
	const page = await open(`<div id="sidebar-03" data-view="preview"><div><button data-slot="button" title="Refresh Preview"><span class="sr-only">Refresh Preview</span></button></div><iframe height="100"></iframe></div>`, ['site']);
	let loads = 0;
	await page.route('http://parts.test/frame/**', (route) => (loads++, route.fulfill({ contentType: 'text/html', body: '<p>block</p>' })));
	await page.evaluate(() => (document.querySelector('iframe')!.src = '/frame/sidebar-03'));
	await page.waitForFunction(() => document.querySelector('iframe')!.contentDocument?.querySelector('p'));
	const before = loads;
	await page.getByRole('button', { name: 'Refresh Preview' }).click();
	await page.waitForTimeout(500);
	assert.equal(loads, before + 1, 'setIframeKey mounts the frame afresh, which loads its page again');
	await page.close();
});

test('shadcn-ui site: a long code block\'s Expand opens it and reads Collapse, and its fade under the code opens it too', async () => {
	const page = await open(
		`<figure><pre id="_R_1_" data-state="closed" class="data-[state=closed]:max-h-64"><code>line</code></pre><button data-slot="button" type="button" aria-expanded="false" aria-controls="_R_1_">Expand</button><button type="button" tabindex="-1" aria-hidden="true">Expand</button></figure>`,
		['site'],
	);
	const look = () => page.evaluate(() => { const pre = document.querySelector('pre')!; const [button, fade] = document.querySelectorAll('button'); return [pre.dataset.state, button!.getAttribute('aria-expanded'), button!.textContent, fade!.hidden].join(' '); });
	const nodes = () => page.evaluate(() => document.querySelectorAll('*').length);
	const before = await nodes();
	await page.getByRole('button', { name: 'Expand' }).click();
	assert.equal(await look(), 'open true Collapse true');
	await page.getByRole('button', { name: 'Collapse' }).click();
	assert.equal(await look(), 'closed false Expand false');
	await page.locator('button[aria-hidden]').click();
	assert.equal(await look(), 'open true Collapse true', 'the fade opens it (it is not there while open)');
	assert.equal(await nodes(), before, 'no node is added or removed');
	await page.close();
});

test('shadcn-ui site: an RTL preview\'s language selector writes the example\'s text, direction and data-lang in that language', async () => {
	const badge = (t: string) => `<span data-slot="badge">${t}</span>`;
	const page = await open(
		`<div data-slot="component-preview"><div><button type="button" role="combobox" data-slot="select-trigger" dir="ltr" data-name="language-selector"><span data-slot="select-value">Arabic (العربية)</span></button></div>
		<div data-slot="preview" dir="rtl" data-lang="ar"><div class="flex" dir="rtl">${badge('شارة')}${badge('ثانوي')}${badge('مدمر')}${badge('مخطط')}${badge('متحقق')}${badge('إشارة مرجعية')}<span>١٢</span><p>3 مدمر</p></div></div></div>
		<script>window.choose = (label) => (document.querySelector('[data-slot="select-value"]').textContent = label);</script>`,
		['site'],
		'body',
		'<meta charset="utf-8">',
	);
	await page.locator('[data-name="language-selector"]').click();
	const look = () => page.evaluate(() => { const p = document.querySelector('[data-slot="preview"]')!; return [p.getAttribute('dir'), p.getAttribute('data-lang'), p.firstElementChild!.getAttribute('dir'), p.textContent].join(' | '); });
	await page.evaluate(() => (window as unknown as { choose: (l: string) => void }).choose('Hebrew (עברית)'));
	await page.waitForFunction(() => document.querySelector('[data-slot="preview"]')!.getAttribute('data-lang') === 'he');
	assert.equal(await look(), 'rtl | he | rtl | תגמשניהרסניקווי מתארמאומתסימנייה123 הרסני');
	await page.evaluate(() => (window as unknown as { choose: (l: string) => void }).choose('English'));
	await page.waitForFunction(() => document.querySelector('[data-slot="preview"]')!.getAttribute('dir') === 'ltr');
	assert.equal(await look(), 'ltr |  | ltr | BadgeSecondaryDestructiveOutlineVerifiedBookmark123 Destructive');
	await page.evaluate(() => (window as unknown as { choose: (l: string) => void }).choose('Arabic (العربية)'));
	await page.waitForFunction(() => document.querySelector('[data-slot="preview"]')!.getAttribute('dir') === 'rtl');
	assert.equal(await look(), 'rtl | ar | rtl | شارةثانويمدمرمخططمتحققإشارة مرجعية١٢3 مدمر');
	await page.close();
});

test('shadcn-ui site: an RTL preview\'s language reaches the layers its controls open, by capture key, opened after the switch, and their placement', async () => {
	// Base UI's dropdown-menu-rtl: its trigger keyed by the capture, its menu a layer, align end in Arabic and start otherwise.
	const page = await open(
		`<div data-slot="component-preview"><div><button type="button" role="combobox" data-slot="select-trigger" dir="ltr" data-name="language-selector"><span data-slot="select-value">Arabic (العربية)</span></button></div>
		<div data-slot="preview" dir="rtl" data-lang="ar"><button data-slot="dropdown-menu-trigger" data-mm-key="p:1" dir="rtl">افتح القائمة</button></div></div>
		<script>
		history.replaceState(null, '', '/docs/components/base/dropdown-menu');
		window.choose = (label) => (document.querySelector('[data-slot="select-value"]').textContent = label);
		window.mount = () => document.body.insertAdjacentHTML('beforeend', '<div data-mm-layer="p:1"><div data-side="bottom" data-align="end" data-mm-align="end"><div role="menu" dir="rtl" data-lang="ar"><div role="menuitem">الحساب</div><div role="menuitem">١٢</div></div></div></div>');
		</script>`,
		['site'],
		'body',
		'<meta charset="utf-8">',
	);
	await page.locator('[data-name="language-selector"]').click();
	await page.evaluate(() => (window as unknown as { choose: (l: string) => void }).choose('English'));
	await page.waitForFunction(() => document.querySelector('[data-mm-key="p:1"]')!.textContent === 'Open');
	await page.evaluate(() => (window as unknown as { mount: () => void }).mount());
	await page.waitForFunction(() => document.querySelector('[role="menu"]')!.getAttribute('dir') === 'ltr');
	const look = () => page.evaluate(() => { const l = document.querySelector('[data-mm-layer]')!.firstElementChild!; return [l.getAttribute('data-align'), l.getAttribute('data-mm-align'), l.textContent].join(' | '); });
	assert.equal(await look(), 'start | start | Account12');
	await page.evaluate(() => (window as unknown as { choose: (l: string) => void }).choose('Arabic (العربية)'));
	await page.waitForFunction(() => document.querySelector('[role="menu"]')!.getAttribute('dir') === 'rtl');
	assert.equal(await look(), 'end | end | الحساب١٢');
	await page.close();
});

test('a control listed as a download saves the file its use saved on the old page: name, type and content', async () => {
	const page = await open(
		`<div data-slot="code-block"><button aria-label="Download">D</button></div><template data-mm-download="button||D#0" data-mm-name="route.ts" data-mm-type="text/plain" data-mm-text="import { streamText } from &quot;ai&quot;"></template>`,
		[],
		'body',
	);
	const [saved] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download' }).click()]);
	assert.equal(saved.suggestedFilename(), 'route.ts');
	const path = await saved.path();
	assert.equal(await readFile(path, 'utf8'), 'import { streamText } from "ai"');
	await page.close();
});

test('shadcn-ui site: a package manager list a page brings in place shows the kept choice before it is painted', async () => {
	const page = await open('<main id="main"></main>', ['site'], 'body');
	await page.evaluate(() => localStorage.setItem('config', JSON.stringify({ style: 'new-york-v4', packageManager: 'npm', installationType: 'cli' })));
	const seen = await page.evaluate(
		() =>
			new Promise<string>((done) => {
				const tab = (v: string, on: boolean) => `<button role="tab" aria-controls="r-content-${v}" aria-selected="${on}">${v}</button>`;
				// The page an in-place navigation swaps in, its tab state its own (the converter's mousedown handler).
				document.getElementById('main')!.innerHTML = `<div role="tablist">${tab('pnpm', true)}${tab('npm', false)}</div>`;
				const list = document.querySelector('[role="tablist"]')!;
				list.addEventListener('mousedown', (e) => { const t = (e.target as Element).closest('[role="tab"]'); for (const x of list.querySelectorAll('[role="tab"]')) x.setAttribute('aria-selected', String(x === t)); });
				requestAnimationFrame(() => done([...list.querySelectorAll('[aria-selected="true"]')].map((t) => t.textContent).join()));
			}),
	);
	assert.equal(seen, 'npm', 'chosen before the next frame');
	await page.close();
});

test('shadcn-ui site: a long code block in a Collapsible reads Collapse on both its triggers while open, Expand once closed', async () => {
	// The Collapsible's state is the converter's (DisclosurePlan): here a click handler flips the root's data-state.
	const page = await open(
		`<div data-state="closed" data-slot="collapsible"><div data-slot="collapsible-trigger" aria-expanded="false"><button data-slot="button" type="button">Expand</button></div><div data-slot="collapsible-content" data-state="closed"><figure><pre>code</pre></figure></div><button data-slot="collapsible-trigger" type="button" aria-expanded="false">Expand</button></div>
		<script>document.addEventListener('click', (e) => { if (!e.target.closest('[data-slot="collapsible-trigger"]')) return; const r = document.querySelector('[data-slot="collapsible"]'); setTimeout(() => r.setAttribute('data-state', r.getAttribute('data-state') === 'open' ? 'closed' : 'open')); });</script>`,
		['site'],
		'body',
	);
	const labels = () => page.evaluate(() => [...document.querySelectorAll('button')].map((b) => b.textContent).join(','));
	await page.getByRole('button', { name: 'Expand' }).first().click();
	await page.waitForTimeout(50);
	assert.equal(await labels(), 'Collapse,Collapse');
	await page.getByRole('button', { name: 'Collapse' }).last().click();
	await page.waitForTimeout(50);
	assert.equal(await labels(), 'Expand,Expand');
	await page.close();
});

test('shadcn-ui site: a copy control whose label followed the copy on the old page (a message\'s Copy) reads that label for 2 s', async () => {
	const icon = '<svg class="lucide lucide-copy" width="24" height="24"><rect></rect><path d="M4 16"></path></svg>';
	const page = await open(`<button data-slot="tooltip-trigger" type="button" aria-label="Copy">${icon}</button><template data-mm-clipboard="button|tooltip-trigger|#0" data-mm-text="reply" data-mm-label="Copied"></template>`, ['site']);
	await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: () => Promise.resolve(), write: () => Promise.resolve() } }));
	await page.locator('button').click();
	await page.waitForTimeout(100);
	const look = () => page.locator('button').evaluate((b) => [b.getAttribute('aria-label'), b.querySelector('svg')!.getAttribute('class')]);
	assert.deepEqual(await look(), ['Copied', 'lucide lucide-check']);
	await page.waitForTimeout(2100);
	assert.deepEqual(await look(), ['Copy', 'lucide lucide-copy']);
	await page.close();
});

test('shadcn-ui site: a copy button pressed with Enter keeps focus when the clipboard API refuses and the copy falls back to a selection', async () => {
	const icon = '<svg width="24" height="24"><rect></rect><path d="M4 16"></path></svg>';
	const page = await open(`<button data-slot="code-block-copy-button" type="button" aria-label="Copy">${icon}</button><template data-mm-clipboard="button|code-block-copy-button|#0" data-mm-text="code"></template>`, ['site']);
	await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: () => Promise.reject(new Error('denied')), write: () => Promise.reject(new Error('denied')) } }));
	await page.locator('button').focus();
	await page.keyboard.press('Enter');
	await page.waitForTimeout(100);
	assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('data-slot')), 'code-block-copy-button');
	await page.close();
});

test('shadcn-ui site: an input group\'s Copy button shows tabler\'s check for 2 s once it has copied', async () => {
	const icon = '<svg width="24" height="24"><path d="M7 7m0 2.667"></path><path d="M4.012 16.737"></path></svg>';
	const page = await open(`<button data-slot="button" type="button" aria-label="Copy" title="Copy">${icon}</button><template data-mm-clipboard="button|button|#0" data-mm-text="https://x.com/shadcn"></template>`, ['site']);
	await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: () => Promise.resolve() } }));
	await page.locator('button').click();
	await page.waitForTimeout(100);
	const look = () => page.locator('button svg').evaluate((svg) => [svg.getAttribute('class'), [...svg.querySelectorAll('path')].map((p) => `${p.getAttribute('d')}${p.getAttribute('display') ? ' hidden' : ''}`)]);
	assert.deepEqual(await look(), ['tabler-icon tabler-icon-check ', ['M5 12l5 5l10 -10', 'M4.012 16.737 hidden']]);
	await page.waitForTimeout(2100);
	assert.deepEqual(await look(), [null, ['M7 7m0 2.667', 'M4.012 16.737']]);
	await page.close();
});

test('a vaul drawer opens with focus left on its trigger and no trap until focus enters it; a Radix dialog still focuses its first control', async () => {
	const layer = (key: string, slot: string, vaul: boolean) => `<div data-mm-layer="${key}" hidden data-slot="${slot}-overlay" data-state="closed"></div><div data-mm-layer="${key}" hidden role="dialog" id="${key}" data-slot="${slot}-content"${vaul ? ' data-vaul-drawer="" data-vaul-drawer-direction="bottom"' : ''} data-state="closed"><button>Submit ${key}</button></div>`;
	const page = await open(
		`<main><button data-slot="drawer-trigger" aria-haspopup="dialog" aria-expanded="false" aria-controls="dr" data-state="closed">Open Drawer</button><button>Page</button>
		<button data-slot="dialog-trigger" aria-haspopup="dialog" aria-expanded="false" aria-controls="dl" data-state="closed">Open Dialog</button></main>${layer('dr', 'drawer', true)}${layer('dl', 'dialog', false)}`,
		['radix/dialog'],
	);
	await page.getByText('Open Drawer').focus();
	await page.keyboard.press('Enter');
	await settled(page);
	assert.equal(await page.locator('#dr').getAttribute('data-state'), 'open');
	assert.equal(await focusOf(page), 'button:Open Drawer');
	await page.keyboard.press('Tab');
	assert.equal(await focusOf(page), 'button:Page', 'Tab walks the page behind');
	await page.keyboard.press('Escape');
	await settled(page);
	await page.getByText('Open Dialog').focus();
	await page.keyboard.press('Enter');
	await settled(page);
	assert.equal(await focusOf(page), 'button:Submit dl');
	await page.close();
});

test('a Radix vertical slider steps up with ArrowUp and follows the pointer from the bottom', async () => {
	const page = await open(
		`<div style="padding:50px"><span data-orientation="vertical" data-slot="slider" data-state="x" style="position:relative;display:block;height:200px;width:20px"><span data-slot="slider-track" style="position:absolute;inset:0"><span data-slot="slider-range" style="position:absolute;bottom:0%;top:50%;left:0;right:0"></span></span><span style="position:absolute;bottom:calc(50% + 0px)"><span role="slider" aria-valuemin="0" aria-valuemax="100" aria-valuenow="50" aria-orientation="vertical" data-orientation="vertical" tabindex="0" data-slot="slider-thumb" style="display:block;width:16px;height:16px"></span></span></span></div>`,
		['slider'],
	);
	await page.locator('[role="slider"]').focus();
	await page.keyboard.press('ArrowUp');
	assert.equal(await page.locator('[role="slider"]').getAttribute('aria-valuenow'), '51');
	assert.match(await page.locator('[data-slot="slider-range"]').evaluate((e) => (e as HTMLElement).style.top), /^49%$/);
	const box = (await page.locator('[data-slot="slider"]').boundingBox())!;
	await page.mouse.move(box.x + 10, box.y + box.height * 0.25);
	await page.mouse.down();
	await page.mouse.up();
	assert.equal(await page.locator('[role="slider"]').getAttribute('aria-valuenow'), '75', 'a press a quarter down the track is 75');
	await page.close();
});

test('a React Aria range slider: each thumb is bounded by its neighbour and the slider\'s ends, Page Up steps a tenth of the range', async () => {
	const thumb = (left: number, min: number, max: number, value: number, k: number) =>
		`<div data-slot="slider-thumb" style="position:absolute;left:${left}%;width:12px;height:12px" data-rac=""><div><input tabindex="0" id="t-${k}" type="range" min="${min}" max="${max}" step="5" aria-valuetext="${value}" value="${value}"></div></div>`;
	const page = await open(
		`<div style="padding:50px;width:300px"><div data-slot="slider" data-rac="" role="group" data-orientation="horizontal" style="position:relative;width:200px;height:12px"><div data-slot="slider-track" data-rac="" style="position:relative;height:4px"><div data-slot="slider-range" style="position:absolute;inset-inline-start:25%;width:25%;height:100%"></div></div>${thumb(25, 0, 50, 25, 0)}${thumb(50, 25, 100, 50, 1)}</div></div>`,
		['slider'],
	);
	const values = () => page.locator('input').evaluateAll((els) => els.map((e) => `${(e as HTMLInputElement).value} ${e.getAttribute('min')}-${e.getAttribute('max')}`).join(' | '));
	await page.locator('#t-0').focus();
	await page.keyboard.press('PageUp');
	assert.equal(await values(), '35 0-50 | 50 35-100', 'Page Up is (max - min) / 10 = 10, not step x 10; the neighbour\'s min follows');
	await page.locator('#t-1').focus();
	await page.keyboard.press('ArrowRight');
	assert.equal(await values(), '35 0-55 | 55 35-100', 'the upper thumb moves up to the slider\'s max, not the lower thumb\'s');
	await page.keyboard.press('End');
	assert.equal(await values(), '35 0-100 | 100 35-100');
	await page.close();
});

test('a Radix range slider steps by its step, a thumb passes its neighbour and focus follows the value, Home and End set the first and last value', async () => {
	const thumb = (left: number, value: number, label: string) =>
		`<span style="position:absolute;left:calc(${left}% + 0px)"><span role="slider" aria-label="${label}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${value}" tabindex="0" data-slot="slider-thumb" style="display:block;width:16px;height:16px"></span></span>`;
	const page = await open(
		`<div style="padding:50px"><span data-slot="slider" data-orientation="horizontal" data-mm-step="5" style="position:relative;display:block;width:200px;height:20px"><span data-slot="slider-track"><span data-slot="slider-range" style="position:absolute;left:25%;right:70%"></span></span>${thumb(25, 25, 'Minimum')}${thumb(30, 30, 'Maximum')}</span></div>`,
		['slider'],
	);
	const state = () => page.evaluate(() => [[...document.querySelectorAll('[role="slider"]')].map((t) => t.getAttribute('aria-valuenow')).join(','), document.activeElement?.getAttribute('aria-label')]);
	await page.locator('[aria-label="Minimum"]').focus();
	await page.keyboard.press('ArrowRight');
	assert.deepEqual(await state(), ['30,30', 'Minimum']);
	await page.keyboard.press('ArrowRight');
	assert.deepEqual(await state(), ['30,35', 'Maximum'], 'the values are sorted and focus moves to the thumb holding the moved value');
	await page.keyboard.press('Home');
	assert.deepEqual(await state(), ['0,35', 'Minimum'], 'Home sets the first value');
	await page.keyboard.press('End');
	assert.deepEqual(await state(), ['0,100', 'Maximum']);
	await page.close();
});

test('a Base UI vertical slider steps up with ArrowUp and follows the pointer from the bottom, its thumbs inset by half their height', async () => {
	const page = await open(
		`<div style="padding:50px"><div data-orientation="vertical" role="group" data-slot="slider" style="height:216px;width:16px"><div data-orientation="vertical" data-base-ui-slider-control="" style="position:relative;height:216px;width:16px"><div data-slot="slider-track" style="position:relative;height:100%"><div data-base-ui-slider-indicator="" style="position:absolute;--start-position:50%;bottom:0px;height:var(--start-position)" data-slot="slider-range"></div></div><div data-orientation="vertical" data-index="0" style="--position:50%;position:absolute;bottom:var(--position);left:50%;translate:-50% 50%;width:16px;height:16px" data-slot="slider-thumb"><input aria-orientation="vertical" aria-valuenow="50" max="100" min="0" step="1" type="range" value="50" style="position:fixed;top:0;left:0;width:1px;height:1px;opacity:0"></div></div></div></div>`,
		['slider'],
	);
	const state = () => page.evaluate(() => [document.querySelector('input')!.value, (document.querySelector('[data-slot="slider-thumb"]') as HTMLElement).style.getPropertyValue('--position')]);
	await page.locator('input').focus();
	await page.keyboard.press('ArrowUp');
	assert.deepEqual(await state(), ['51', '50.9259%'], '(8 + 0.51 x 200) / 216');
	const box = (await page.locator('[data-base-ui-slider-control]').boundingBox())!;
	await page.mouse.move(box.x + 8, box.y + 8 + 200 * 0.25);
	await page.mouse.down();
	await page.mouse.up();
	assert.deepEqual(await state(), ['75', '73.1481%'], 'a quarter of the 200 px travel down from the top is 75');
	await page.close();
});

test('react-textarea-autosize: an autosize textarea grows with each line typed and shrinks back, from its inline important height; a plain one is left alone', async () => {
	const css = 'box-sizing:border-box;width:300px;padding:10px 12px;border:1px solid;font:16px/24px sans-serif;resize:none';
	const page = await open(`<textarea id="auto" placeholder="Autoresize textarea..." style="${css};height: 40px !important;"></textarea><textarea id="plain" style="${css};height:40px"></textarea>`, ['textarea-autosize']);
	const height = (id: string) => page.evaluate((id) => Math.round(document.getElementById(id)!.getBoundingClientRect().height), id);
	await page.waitForFunction(() => document.getElementById('auto')!.style.height !== '40px');
	assert.equal(await height('auto'), 46, 'mounted: one row (24) plus padding (20) and border (2)');
	await page.locator('#auto').fill('');
	await page.locator('#auto').pressSequentially('one\ntwo\nthree');
	assert.equal(await height('auto'), 94, 'three rows');
	assert.equal(await page.locator('#auto').evaluate((t: HTMLTextAreaElement) => t.style.getPropertyPriority('height')), 'important');
	await page.keyboard.press('Backspace');
	for (let i = 0; i < 10; i++) await page.keyboard.press('Backspace');
	assert.equal(await height('auto'), 46, 'back to one row');
	await page.locator('#plain').pressSequentially('one\ntwo\nthree');
	assert.equal(await height('plain'), 40);
	await page.close();
});

test('react-resizable-panels: a press on a separator focuses it; once released it is inactive until the pointer moves again', async () => {
	const page = await open(
		`<div style="padding:50px"><div data-group="" style="display:flex;width:400px;height:100px"><div data-panel="" style="flex:50 1 0px"></div><div role="separator" tabindex="0" aria-valuenow="50" data-separator="inactive" style="width:8px;flex:0 0 auto"></div><div data-panel="" style="flex:50 1 0px"></div></div><button>after</button></div>`,
		['resizable'],
	);
	const separator = page.locator('[role="separator"]');
	const box = (await separator.boundingBox())!;
	await page.mouse.move(box.x + 4, box.y + 50);
	await page.mouse.down();
	assert.equal(await separator.evaluate((e) => e === document.activeElement), true, 'onDocumentPointerDown focuses the separator');
	assert.equal(await separator.getAttribute('data-separator'), 'active');
	await page.mouse.move(box.x + 44, box.y + 50, { steps: 4 });
	await page.mouse.up();
	assert.equal(await separator.getAttribute('data-separator'), 'inactive', 'onDocumentPointerUp sets the interaction inactive');
	assert.equal(await separator.getAttribute('aria-valuenow'), '60.204', 'the drag is a share of the panels\' 392 px, not the group\'s 400');
	await page.close();
});


test('react-resizable-panels: the resize cursor covers the page while a separator is pointed at or dragged, and goes once it is inactive', async () => {
	const panels = (dir: string, size: string) => `<div data-group="" style="display:flex;flex-direction:${dir};${size}"><div data-panel="" style="flex:50 1 0px"></div><div role="separator" tabindex="0" aria-valuenow="50" data-separator="inactive" style="${dir === 'row' ? 'width' : 'height'}:8px;flex:0 0 auto"></div><div data-panel="" style="flex:50 1 0px"></div></div>`;
	const page = await open(`<div style="padding:50px">${panels('row', 'width:400px;height:100px')}<p id="away">away</p>${panels('column', 'width:200px;height:300px')}</div>`, ['resizable']);
	const cursor = () => page.evaluate(() => `${getComputedStyle(document.getElementById('away')!).cursor} ${document.adoptedStyleSheets.flatMap((s) => [...s.cssRules].map((r) => r.cssText)).join(' ').includes('touch-action: none') ? 'no-touch' : ''}`.trim());
	for (const [n, want] of [[0, 'ew-resize'], [1, 'ns-resize']] as const) {
		const box = (await page.locator('[role="separator"]').nth(n).boundingBox())!;
		const [x, y] = [box.x + box.width / 2, box.y + box.height / 2];
		await page.mouse.move(x, y);
		assert.equal(await cursor(), want, 'pointed at');
		await page.mouse.down();
		await page.mouse.move(x + 20, y + 20, { steps: 3 });
		assert.equal(await cursor(), `${want} no-touch`, 'while dragged');
		await page.mouse.up();
		assert.equal(await cursor(), 'auto', 'released, it is inactive');
		await page.mouse.move(x + 21, y + 21);
		await page.mouse.move(5, 5);
		assert.equal(await cursor(), 'auto', 'pointed away');
	}
	await page.close();
});

test('react-resizable-panels: a press within the separator\'s 10 px hit area drags it, though another element is on top there', async () => {
	// The second panel is drawn over the separator, as a block viewer's panel is once a viewport button has resized it.
	const page = await open(
		`<div style="padding:50px"><div data-group="" style="display:flex;width:400px;height:100px"><div data-panel="" style="flex:50 1 0px"></div><div role="separator" tabindex="0" aria-valuenow="50" data-separator="inactive" style="width:2px;flex:0 0 auto"></div><div data-panel="" style="flex:50 1 0px;margin-left:-2px;position:relative;background:#eee"></div></div></div>`,
		['resizable'],
	);
	const separator = page.locator('[role="separator"]');
	const box = (await separator.boundingBox())!;
	await page.mouse.move(box.x + 4, box.y + 50);
	await page.mouse.down();
	assert.equal(await separator.getAttribute('data-separator'), 'active', 'the press is within 10 px around the separator');
	await page.mouse.move(box.x + 44, box.y + 50, { steps: 4 });
	await page.mouse.up();
	assert.equal(await separator.getAttribute('aria-valuenow'), '60', 'dragged by 40 of the panels\' 400 px');
	await page.close();
});

test('react-resizable-panels: the arrows do not follow the text direction, and the other orientation\'s arrows do nothing', async () => {
	const page = await open(
		`<div dir="rtl" style="padding:50px"><div data-group="" style="display:flex;width:400px;height:100px"><div data-panel="" style="flex:50 1 0px"></div><div role="separator" tabindex="0" aria-valuenow="50" data-separator="inactive" style="width:8px;flex:0 0 auto"></div><div data-panel="" style="flex:50 1 0px"></div></div></div>`,
		['resizable'],
	);
	const separator = page.locator('[role="separator"]');
	await separator.focus();
	const now = () => separator.getAttribute('aria-valuenow');
	await page.keyboard.press('ArrowLeft');
	assert.equal(await now(), '45', 'ArrowLeft shrinks the panel before the separator in RTL too');
	await page.keyboard.press('ArrowDown');
	assert.equal(await now(), '45');
	assert.equal(await page.evaluate(() => scrollY), 0, 'and is prevented');
	await page.close();
});

test('Radix NavigationMenu: a press opens the trigger\'s content in the viewport rendered beside the list, Escape closes it', async () => {
	const page = await open(
		`<nav data-slot="navigation-menu"><ul><li><button id="t1" data-slot="navigation-menu-trigger" data-state="closed" aria-expanded="false" aria-controls="c1">Components</button></li></ul>
		<div hidden data-mm-shown-with="t1"><div data-slot="navigation-menu-viewport" data-state="open"><div data-slot="navigation-menu-content" id="c1" data-state="open" style="width:300px;height:120px">Alert Dialog</div></div></div></nav>`,
		['radix/navigation-menu'],
	);
	await page.getByText('Components').click();
	assert.equal(await page.getByText('Components').getAttribute('aria-expanded'), 'true');
	assert.equal(await page.getByText('Alert Dialog').isVisible(), true);
	assert.equal(await page.locator('[data-slot="navigation-menu-viewport"]').evaluate((e) => (e as HTMLElement).style.getPropertyValue('--radix-navigation-menu-viewport-width')), '300px');
	await page.keyboard.press('Escape');
	assert.equal(await page.getByText('Components').getAttribute('aria-expanded'), 'false');
	assert.equal(await page.getByText('Alert Dialog').isVisible(), false);
	await page.close();
});

// Radix NavigationMenu as convert renders it: each trigger's focus proxy and its viewport with the content beside the
// list, shown with the trigger (data-mm-shown-with its id); the content inside the viewport has no data-state.
const PROXY = 'aria-hidden="true" tabindex="0" style="position:absolute;width:1px;height:1px;overflow:hidden" hidden';
const navigationMenu = `<nav data-slot="navigation-menu" data-orientation="horizontal" dir="ltr" data-viewport="true"><div style="position:relative"><ul data-slot="navigation-menu-list" style="display:flex;gap:8px;list-style:none">
	<li><button id="t1" data-slot="navigation-menu-trigger" data-state="closed" aria-expanded="false" aria-controls="c1">Getting started</button><span ${PROXY} data-mm-shown-with="t1"></span></li>
	<li><button id="t2" data-slot="navigation-menu-trigger" data-state="closed" aria-expanded="false" aria-controls="c2">Components</button><span ${PROXY} data-mm-shown-with="t2"></span></li>
	<li><a data-slot="navigation-menu-link" href="#docs">Docs</a></li></ul></div>
	<div><div hidden data-mm-shown-with="t1" data-slot="navigation-menu-viewport" data-state="open"><div data-slot="navigation-menu-content" id="c1" aria-labelledby="t1"><a data-slot="navigation-menu-link" href="#intro">Introduction</a> <a data-slot="navigation-menu-link" href="#install">Installation</a></div></div>
	<div hidden data-mm-shown-with="t2" data-slot="navigation-menu-viewport" data-state="open"><div data-slot="navigation-menu-content" id="c2" aria-labelledby="t2"><a data-slot="navigation-menu-link" href="#alert">Alert Dialog</a></div></div></div></nav><button id="after">After</button>`;
const focused = (page: Page) => page.evaluate(() => document.activeElement?.textContent?.trim());
async function hold(page: Page, key: string): Promise<void> {
	await page.keyboard.down(key);
	await page.waitForTimeout(40);
	await page.keyboard.up(key);
	await settled(page);
}

test('Radix NavigationMenu: moving to another trigger morphs one frame, from the open viewport\'s size to the new content\'s, while the old content slides out and the new slides in', async () => {
	// shadcn's viewport (duration-100 transitions its size, zoom-in on open) and the contents' data-motion keyframes.
	const css = `<style>[data-slot=navigation-menu-viewport]{position:relative;overflow:hidden;background:white;box-shadow:0 0 0 1px #ccc;width:var(--radix-navigation-menu-viewport-width);height:var(--radix-navigation-menu-viewport-height);transition-duration:100ms}[data-slot=navigation-menu-viewport][data-state=open]{animation:zoom 150ms}@keyframes zoom{from{transform:scale(.9)}}[data-slot=navigation-menu-content]{position:absolute;top:0;left:0}[data-motion=to-start]{animation:out 200ms forwards}[data-motion=from-end]{animation:in 200ms}@keyframes out{to{opacity:0;translate:-208px}}@keyframes in{from{opacity:0;translate:208px}}#c1{width:300px;height:120px}#c2{width:500px;height:200px}</style>`;
	const page = await open(`${css}<div style="padding:40px">${navigationMenu.replace('<div><div hidden', '<div style="position:absolute;top:100%;left:0;display:flex;justify-content:center"><div hidden')}</div>`, ['radix/navigation-menu']);
	await page.getByText('Getting started').click();
	await page.waitForTimeout(300);
	const frame = () =>
		page.evaluate(() =>
			new Promise<string[]>((done) =>
				requestAnimationFrame(() =>
					done(
						[...document.querySelectorAll<HTMLElement>('[data-slot=navigation-menu-viewport]')]
							.filter((v) => !v.hidden)
							.map((v) => {
								const r = v.getBoundingClientRect();
								const c = v.querySelector<HTMLElement>('[data-slot=navigation-menu-content]')!;
								return `${c.id} ${Math.round(r.width)}x${Math.round(r.height)} ${Number(getComputedStyle(c).opacity).toFixed(1)} ${getComputedStyle(v).backgroundColor === 'rgba(0, 0, 0, 0)' ? 'clear' : 'framed'} ${new DOMMatrixReadOnly(getComputedStyle(v).transform).m11}`;
							}),
					),
				),
			),
		);
	await page.getByText('Components').hover();
	const first = await frame();
	assert.equal(first.length, 2, 'the old content is still there, sliding out');
	assert.match(first[0]!, /^c1 \d+x\d+ \S+ clear 1$/, 'over the new frame, its own cleared');
	assert.match(first[1]!, /^c2 (\d+)x(\d+) \S+ framed 1$/, 'the new viewport does not zoom in');
	const [w, h] = /c2 (\d+)x(\d+)/.exec(first[1]!)!.slice(1).map(Number) as [number, number];
	assert.ok(w < 500 && h < 200, `it grows from the old size, at ${w}x${h} on its first frame`);
	await page.waitForTimeout(400);
	assert.deepEqual(await frame(), ['c2 500x200 1.0 framed 1']);
	await page.close();
});

test('Radix NavigationMenu from the keyboard: ArrowDown on an open trigger enters its content, Tab goes through the content via the focus proxy and on to the next trigger, the arrows rove the list', async () => {
	const page = await open(navigationMenu, ['radix/navigation-menu']);
	await page.locator('#t1').focus();
	await hold(page, 'ArrowRight');
	assert.equal(await focused(page), 'Components');
	await hold(page, 'End');
	assert.equal(await focused(page), 'Docs');
	await hold(page, 'ArrowRight');
	assert.equal(await focused(page), 'Docs');
	await hold(page, 'Home');
	assert.equal(await focused(page), 'Getting started');
	await hold(page, 'Enter');
	assert.equal(await page.locator('#t1').getAttribute('aria-expanded'), 'true');
	assert.equal(await page.locator('#c1').getAttribute('data-state'), null);
	await hold(page, 'ArrowDown');
	assert.equal(await focused(page), 'Introduction');
	await hold(page, 'ArrowRight');
	assert.equal(await focused(page), 'Installation');
	await hold(page, 'Tab');
	assert.equal(await focused(page), 'Components');
	assert.equal(await page.locator('#t1').getAttribute('aria-expanded'), 'true');
	await page.keyboard.press('Shift+Tab');
	await settled(page);
	assert.equal(await focused(page), 'Installation');
	await page.locator('#t1').focus();
	await hold(page, 'Tab');
	assert.equal(await focused(page), 'Introduction');
	await page.close();
});

test('a Base UI dialog a page opens from a plain button opens under the button\'s key', async () => {
	const page = await open(
		`<main><button data-slot="button" data-mm-key="p:3.1" type="button">Open Menu</button></main>
		<div data-mm-layer="p:3.1" hidden data-base-ui-portal><div role="dialog" data-slot="dialog-content" data-closed tabindex="-1"><input placeholder="Type a command"></div></div>`,
		['base-ui/dialog'],
	);
	await page.getByText('Open Menu').click();
	assert.equal(await page.locator('[role="dialog"]').isVisible(), true);
	assert.equal(await page.getByText('Open Menu').getAttribute('aria-expanded'), null);
	await page.close();
});

test('a Radix dialog opened from a trigger whose child has its own -trigger data-slot (AttachmentTrigger) opens', async () => {
	const page = await open(
		`<main><button data-slot="attachment-trigger" type="button" aria-label="Preview" aria-haspopup="dialog" aria-expanded="false" aria-controls="att" data-state="closed">Preview</button></main>
		<div data-mm-layer="att" hidden data-slot="dialog-overlay" data-state="closed"></div><div data-mm-layer="att" hidden role="dialog" id="att" data-slot="dialog-content" data-state="closed"><button data-slot="dialog-close">Close</button></div>`,
		['radix/dialog'],
	);
	await page.getByText('Preview').click();
	assert.equal(await page.locator('#att').getAttribute('data-state'), 'open');
	assert.equal(await page.getByText('Preview').getAttribute('aria-expanded'), 'true');
	await page.close();
});

test('a Radix dialog returns focus on close to its own Trigger only: one a plain button opened leaves focus on the body', async () => {
	const layer = (key: string) => `<div data-mm-layer="${key}" hidden data-slot="dialog-overlay" data-state="closed"></div><div data-mm-layer="${key}" hidden role="dialog" data-slot="dialog-content" data-state="closed"><input placeholder="Search ${key}"></div>`;
	const page = await open(
		`<main><button data-slot="button" data-mm-key="p:1" type="button">Open Menu</button>
		<button data-slot="dialog-trigger" aria-haspopup="dialog" aria-expanded="false" aria-controls="p:2" data-state="closed">Search</button></main>${layer('p:1')}${layer('p:2')}`,
		['radix/dialog'],
	);
	const onBody = () => page.evaluate(() => document.activeElement === document.body);
	await page.getByText('Open Menu').click();
	await settled(page);
	assert.equal(await page.locator('[data-mm-layer="p:1"][role="dialog"]').getAttribute('data-state'), 'open');
	await page.keyboard.press('Escape');
	await settled(page);
	assert.equal(await onBody(), true, await focusOf(page));
	await page.getByText('Search').click();
	await settled(page);
	await page.keyboard.press('Escape');
	await settled(page);
	assert.equal(await focusOf(page), 'button:Search');
	await page.close();
});

test('recharts: an SVG scaled to its container maps the pointer and the tooltip through its scale', async () => {
	const facts = JSON.stringify({ w: 300, h: 100, v: [5, 5, 290, 90], m: 'x', g: [[0, 149, 0], [150, 300, 1]], p: [[50, 20], [200, 20]] });
	const page = await open(
		`<div class="recharts-wrapper" style="position:relative;width:600px;height:200px" data-mm-chart="1"><svg class="recharts-surface" viewBox="0 0 300 100" style="width:100%;height:100%;display:block" data-mm-facts='${facts}'></svg><svg class="recharts-surface" style="display:none" data-mm-facts='{}'></svg><div class="recharts-tooltip-wrapper" style="visibility: hidden; position: absolute; top: 0px; left: 0px;">tip</div></div>`,
		['recharts'],
	);
	await page.evaluate(() => (window as unknown as { mountParts: (a: string) => void }).mountParts('data-mm-chart'));
	const tip = page.locator('.recharts-tooltip-wrapper');
	await page.mouse.move(250, 100);
	assert.match(await tooltipAt(page, /translate\(100px, 40px\)/), /translate\(100px, 40px\)/, 'state 0 at x 125 in the SVG, its translate doubled');
	await page.mouse.move(350, 100);
	assert.match(await tooltipAt(page, /translate\(400px, 40px\)/), /translate\(400px, 40px\)/);
	await page.close();
});

test('recharts: a radar\'s tooltip follows the pointer\'s radius on the point\'s axis, as recharts anchors it', async () => {
	const facts = JSON.stringify({ w: 200, h: 200, v: [0, 0, 200, 200], m: 'a', c: [100, 100], g: [[45, 135, 0], [225, 315, 1]], sp: [0, 100], p: [[null, null], [null, null]], q: [90, 270] });
	const page = await open(
		`<div class="recharts-wrapper" style="position:relative;width:200px;height:200px" data-mm-chart="1"><svg class="recharts-surface" width="200" height="200" style="display:block" data-mm-facts='${facts}'></svg><div class="recharts-tooltip-wrapper" style="visibility: hidden; position: absolute; top: 0px; left: 0px;"><div style="width:40px;height:20px">tip</div></div></div>`,
		['recharts'],
	);
	await page.evaluate(() => (window as unknown as { mountParts: (a: string) => void }).mountParts('data-mm-chart'));
	const tip = page.locator('.recharts-tooltip-wrapper');
	await page.mouse.move(120, 40);
	assert.match(await tooltipAt(page, /translate\(110px, 46\.7\d*px\)/), /translate\(110px, 46\.7\d*px\)/, 'at the pointer\'s radius (63) straight up the axis, past the offset');
	await page.close();
});

test('recharts: a pointer already over the chart when it loads gets the tooltip from its first move, with no pointerover', async () => {
	const facts = JSON.stringify({ w: 300, h: 100, v: [5, 5, 290, 90], m: 'x', g: [[0, 149, 0], [150, 300, 1]], p: [[50, 20], [200, 20]] });
	const page = await open(
		`<div class="recharts-wrapper" style="position:relative;width:300px;height:100px" data-mm-chart="1"><svg class="recharts-surface" width="300" height="100" style="display:block" data-mm-facts='${facts}'></svg><div class="recharts-tooltip-wrapper" style="visibility: hidden; position: absolute; top: 0px; left: 0px;">tip</div></div>`,
		['recharts'],
	);
	// Chrome on Linux can send this page pointer events at 0,0, over the chart, when the tooltip shows: park the real cursor outside it.
	await page.mouse.move(600, 400);
	await page.evaluate(() => (window as unknown as { mountParts: (a: string) => void }).mountParts('data-mm-chart'));
	await page.evaluate(() => document.querySelector('svg.recharts-surface')!.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: 200, clientY: 50 })));
	assert.match(await tooltipAt(page, /translate\(200px, 20px\)/), /translate\(200px, 20px\)/);
	await page.close();
});

test('recharts: a pie\'s sector under the pointer is its point, and the tooltip stays where recharts put it for that sector', async () => {
	const facts = JSON.stringify({ w: 200, h: 200, v: [5, 5, 190, 190], m: 'i', g: [[0, 0, 0], [1, 1, 1]], p: [[120, 40], [30, 120]] });
	const page = await open(
		`<div class="recharts-wrapper" style="position:relative;width:200px;height:200px" data-mm-chart="1"><svg class="recharts-surface" width="200" height="200" style="display:block" data-mm-facts='${facts}'><g class="recharts-pie-sector"><path d="M100,100 L200,100 A100,100 0 0 0 100,0 Z"></path></g><g class="recharts-pie-sector"><path d="M100,100 L100,0 A100,100 0 1 0 200,100 Z"></path></g></svg><div class="recharts-tooltip-wrapper" style="visibility: hidden; position: absolute; top: 0px; left: 0px;">tip</div></div>`,
		['recharts'],
	);
	await page.evaluate(() => (window as unknown as { mountParts: (a: string) => void }).mountParts('data-mm-chart'));
	const tip = page.locator('.recharts-tooltip-wrapper');
	await page.mouse.move(160, 40);
	assert.match(await tooltipAt(page, /translate\(120px, 40px\)/), /translate\(120px, 40px\)/);
	await page.mouse.move(40, 160);
	assert.match(await tooltipAt(page, /translate\(30px, 120px\)/), /translate\(30px, 120px\)/);
	await page.close();
});

test('clock: a marked date is written for the visitor\'s clock and zone once the parts load, and again when its content changes', async () => {
	const page = await open(
		`<p data-mm-clock='[{"x":"January 17, 2026","in":2}]'>published on January 17, 2026.</p><input data-mm-clock='[{"x":"June 01, 2025","at":1748736000000}]' value="June 01, 2025"><div data-mm-clock='[{"*":2026}]'><span id="tip">Apr 5, 2024</span></div>`,
		['clock'],
	);
	const expected = await page.evaluate(() => {
		const day = (d: Date) => `${d.toLocaleDateString('en-US', { month: 'long' })} ${d.getDate()}, ${d.getFullYear()}`;
		const june = new Date(1748736000000);
		return [`published on ${day(new Date(Date.now() + 2 * 86_400_000))}.`, `${june.toLocaleDateString('en-US', { month: 'long' })} ${String(june.getDate()).padStart(2, '0')}, ${june.getFullYear()}`];
	});
	assert.equal(await page.locator('p').textContent(), expected[0]);
	assert.equal(await page.locator('input').inputValue(), expected[1]);
	await page.locator('#tip').evaluate((el) => (el.firstChild!.nodeValue = 'Apr 9, 2024'));
	assert.equal(await page.locator('#tip').textContent(), await page.evaluate(() => `Apr ${new Date(Date.UTC(2024, 3, 9)).getDate()}, 2024`), 'a tooltip Markless writes later');
	await page.close();
});

test('clock: a chart region\'s "May" moved to April is written in the form the axis names its months, west of UTC', async () => {
	const page = await open(`<div data-mm-clock='[{"*":2026}]'><svg><g><text><tspan>Apr 5</tspan></text></g><g><text><tspan>Jun 29</tspan></text></g></svg><span id="tip">May 1, 2024</span></div>`, ['clock'], undefined, '', 'America/Chicago');
	assert.equal(await page.locator('#tip').textContent(), 'Apr 30, 2024');
	assert.deepEqual(await page.locator('tspan').allTextContents(), ['Apr 4', 'Jun 28']);
	await page.close();
});

test('Radix ScrollArea: the scrollbar rendered beside the content shows on hover, its thumb sized and moved with the scroll', async () => {
	const rows = Array.from({ length: 40 }, (_, i) => `<div style="height:20px">row ${i}</div>`).join('');
	const page = await open(
		`<div data-slot="scroll-area" style="position:relative;width:200px;height:200px"><div data-slot="scroll-area-viewport" style="overflow:hidden scroll;height:100%">${rows}</div><div hidden data-mm-shown-with="p:1"><div data-slot="scroll-area-scrollbar" data-orientation="vertical" data-state="hidden" style="position:absolute;top:0;right:0;bottom:0;width:10px"><div data-slot="scroll-area-thumb" style="height:var(--radix-scroll-area-thumb-height)"></div></div></div></div>`,
		['radix/scroll-area'],
	);
	await page.mouse.move(100, 100);
	assert.equal(await page.locator('[data-slot="scroll-area-scrollbar"]').getAttribute('data-state'), 'visible');
	assert.equal(await page.locator('[data-slot="scroll-area-scrollbar"]').evaluate((e) => (e as HTMLElement).style.getPropertyValue('--radix-scroll-area-thumb-height')), '50px', '200 of 800 px in view on a 200 px track');
	await page.mouse.wheel(0, 300);
	await page.waitForTimeout(200);
	assert.match(await page.locator('[data-slot="scroll-area-thumb"]').evaluate((e) => (e as HTMLElement).style.transform), /translate3d\(0px, 75px, 0px\)/);
	await page.close();
});

test('Radix ScrollArea: a press on the track brings the thumb\'s centre under the pointer, a thumb drag scrolls with the pointer, the wheel over the scrollbar scrolls, and it hides 600 ms after the pointer leaves', async () => {
	const rows = Array.from({ length: 40 }, (_, i) => `<div style="height:20px;width:600px">row ${i}</div>`).join('');
	const page = await open(
		`<div data-slot="scroll-area" style="position:relative;width:200px;height:200px"><div data-slot="scroll-area-viewport" style="overflow:scroll;height:100%;scrollbar-width:none">${rows}</div><div hidden data-mm-shown-with="p:1"><div data-slot="scroll-area-scrollbar" data-orientation="vertical" data-state="hidden" style="position:absolute;top:0;right:0;bottom:0;width:10px"><div data-slot="scroll-area-thumb" style="height:var(--radix-scroll-area-thumb-height)"></div></div></div><div hidden data-mm-shown-with="p:1"><div data-slot="scroll-area-scrollbar" data-orientation="horizontal" data-state="hidden" style="position:absolute;left:0;right:0;bottom:0;height:10px"><div data-slot="scroll-area-thumb" style="width:var(--radix-scroll-area-thumb-width);height:10px"></div></div></div></div>`,
		['radix/scroll-area'],
	);
	const scroll = () => page.locator('[data-slot="scroll-area-viewport"]').evaluate((v) => [v.scrollLeft, v.scrollTop]);
	await page.mouse.move(100, 100);
	await page.mouse.click(195, 175);
	assert.deepEqual(await scroll(), [0, 600], 'the thumb (50 px) centred at 175 is at the end of the 200 px track');
	await page.mouse.move(195, 175);
	await page.mouse.down();
	await page.mouse.move(195, 115, { steps: 4 });
	await page.mouse.up();
	assert.deepEqual(await scroll(), [0, 360], 'the point pressed stays under the pointer: 60 px of track is 240 px of scroll');
	await page.mouse.move(195, 100);
	await page.mouse.wheel(0, 40);
	await page.waitForTimeout(100);
	assert.deepEqual(await scroll(), [0, 400]);
	await page.mouse.click(20, 195);
	assert.deepEqual(await scroll(), [0, 400], 'the horizontal thumb pressed at its own point does not move');
	await page.mouse.click(180, 195);
	assert.equal((await scroll())[0], 400, 'a press at the horizontal track\'s end scrolls to the end');
	await page.mouse.move(400, 400);
	await page.waitForTimeout(300);
	assert.equal(await page.locator('[data-slot="scroll-area-scrollbar"]').first().getAttribute('data-state'), 'visible');
	await page.waitForTimeout(450);
	assert.equal(await page.locator('[data-slot="scroll-area-scrollbar"]').first().getAttribute('data-state'), 'hidden');
	await page.close();
});

test('Base UI ScrollArea: the thumb follows the scroll with the overflow edges and scrolling state; a press on the track centres the thumb there, a thumb drag and the wheel over the scrollbar scroll', async () => {
	const rows = Array.from({ length: 40 }, (_, i) => `<div style="height:20px">row ${i}</div>`).join('');
	const page = await open(
		`<div role="presentation" data-slot="scroll-area" style="position:relative;width:200px;height:200px" data-has-overflow-y="" data-overflow-y-end=""><div role="presentation" tabindex="0" data-slot="scroll-area-viewport" style="overflow:scroll;height:100%;scrollbar-width:none" data-has-overflow-y="" data-overflow-y-end="">${rows}</div><div data-orientation="vertical" data-slot="scroll-area-scrollbar" data-has-overflow-y="" data-overflow-y-end="" style="position:absolute;top:0;bottom:0;inset-inline-end:0;width:10px;--scroll-area-thumb-height:50px"><div data-orientation="vertical" data-slot="scroll-area-thumb" style="height:var(--scroll-area-thumb-height);transform:translate3d(0px,0px,0px)"></div></div></div>`,
		['base-ui/scroll-area'],
	);
	const state = () =>
		page.evaluate(() => {
			const v = document.querySelector<HTMLElement>('[data-slot="scroll-area-viewport"]')!;
			const bar = document.querySelector<HTMLElement>('[data-slot="scroll-area-scrollbar"]')!;
			const thumb = document.querySelector<HTMLElement>('[data-slot="scroll-area-thumb"]')!;
			return { top: v.scrollTop, thumb: Math.round(new DOMMatrixReadOnly(getComputedStyle(thumb).transform).m42), attrs: ['data-hovering', 'data-scrolling', 'data-overflow-y-start', 'data-overflow-y-end'].filter((a) => bar.hasAttribute(a)).join(' ') };
		});
	await page.mouse.move(100, 100);
	assert.deepEqual(await state(), { top: 0, thumb: 0, attrs: 'data-hovering data-overflow-y-end' });
	await page.mouse.wheel(0, 300);
	await page.waitForTimeout(100);
	assert.deepEqual(await state(), { top: 300, thumb: 75, attrs: 'data-hovering data-scrolling data-overflow-y-start data-overflow-y-end' });
	await page.waitForTimeout(600);
	assert.equal((await state()).attrs, 'data-hovering data-overflow-y-start data-overflow-y-end', 'scrolling ends 500 ms after');
	await page.mouse.click(195, 25);
	assert.deepEqual(await state(), { top: 0, thumb: 0, attrs: 'data-hovering data-scrolling data-overflow-y-end' }, 'the thumb centred at 25 px is at the start');
	await page.mouse.move(195, 10);
	await page.mouse.down();
	await page.mouse.move(195, 85, { steps: 4 });
	await page.mouse.up();
	assert.equal((await state()).top, 300, '75 px of the 150 px of thumb travel is half the 600 px of scroll');
	await page.mouse.move(195, 150);
	await page.mouse.wheel(0, 60);
	await page.waitForTimeout(100);
	assert.equal((await state()).top, 360);
	await page.mouse.move(400, 400);
	assert.equal((await state()).attrs.includes('data-hovering'), false);
	await page.close();
});

test('a press on a Radix roving group itself leaves focus on the group; Tab into it moves on to its checked item', async () => {
	const page = await open(
		`<main style="padding:40px"><button id="before">Before</button><div role="radiogroup" tabindex="0" id="g" style="padding:20px;outline:none"><button role="radio" aria-checked="false" tabindex="-1">A</button><button role="radio" aria-checked="true" tabindex="-1">B</button></div></main>`,
		['radix/roving'],
	);
	const box = (await page.locator('#g').boundingBox())!;
	await page.mouse.click(box.x + 4, box.y + 4);
	assert.equal(await focusOf(page), 'div[radiogroup]:AB');
	await page.locator('#before').focus();
	await page.keyboard.press('Tab');
	assert.equal(await focusOf(page), 'button[radio]:B');
	await page.close();
});

test('a Radix roving item focused, by Tab into its group, a press or an arrow, becomes the one item in the tab order (Radix RovingFocusGroup)', async () => {
	const item = (t: string, selected: boolean) => `<button role="tab" aria-selected="${selected}" tabindex="-1" data-orientation="horizontal" data-radix-collection-item="">${t}</button>`;
	const page = await open(`<main><button id="before">Before</button><div role="tablist" tabindex="0" data-orientation="horizontal" style="outline:none">${item('A', true)}${item('B', false)}${item('C', false)}</div><button id="after">After</button></main>`, ['radix/roving']);
	await page.evaluate(async () => {
		const { roving } = await import('/parts/radix/roving.ts' as string);
		document.querySelector('[role="tablist"]')!.addEventListener('keydown', (e) => roving(e as KeyboardEvent));
	});
	const stops = () => page.$$eval('[role="tab"]', (tabs) => tabs.map((t) => `${t.textContent}:${t.getAttribute('tabindex')}`).join(' '));
	await page.locator('#before').focus();
	await page.keyboard.press('Tab');
	assert.equal(await focusOf(page), 'button[tab]:A');
	assert.equal(await stops(), 'A:0 B:-1 C:-1', 'Tab into the group moves on to the selected item, which becomes the tab stop');
	await page.keyboard.press('ArrowRight');
	assert.equal(await focusOf(page), 'button[tab]:B');
	assert.equal(await stops(), 'A:-1 B:0 C:-1');
	await page.locator('[role="tab"]', { hasText: 'C' }).click();
	assert.equal(await stops(), 'A:-1 B:-1 C:0', 'a press makes the pressed item the tab stop');
	await page.close();
});

test('React Aria tabs keep React Aria\'s keys: Left/Right also step a vertical list, Up/Down only a vertical one, disabled tabs are skipped', async () => {
	const tabs = (orientation: string, p: string) => `<div role="tablist" aria-orientation="${orientation}" data-rac="" data-slot="tabs-list"><div role="tab" data-rac="" tabindex="0" id="${p}a">${p}A</div><div role="tab" data-rac="" tabindex="-1">${p}B</div><div role="tab" data-rac="" tabindex="-1" aria-disabled="true" data-disabled="true">${p}C</div></div>`;
	const page = await open(`${tabs('vertical', 'V')}${tabs('horizontal', 'H')}`, ['radix/roving']);
	await page.evaluate(async () => {
		const { roving } = await import('/parts/radix/roving.ts' as string);
		for (const list of document.querySelectorAll('[role="tablist"]')) list.addEventListener('keydown', (e) => roving(e as KeyboardEvent));
	});
	await page.locator('#Va').focus();
	const keys: [string, string][] = [['ArrowRight', 'VB'], ['ArrowRight', 'VA'], ['ArrowLeft', 'VB'], ['ArrowDown', 'VA'], ['ArrowUp', 'VB'], ['End', 'VB'], ['Home', 'VA']];
	for (const [key, to] of keys) {
		await page.keyboard.press(key);
		assert.equal(await focusOf(page), `div[tab]:${to}`, key);
	}
	await page.locator('#Ha').focus();
	await page.keyboard.press('ArrowDown');
	assert.equal(await focusOf(page), 'div[tab]:HA', 'Up/Down do nothing in a horizontal list');
	await page.keyboard.press('ArrowLeft');
	assert.equal(await focusOf(page), 'div[tab]:HB', 'ArrowLeft wraps past the disabled last tab');
	await page.close();
});

// Radix Select as shadcn renders it (item-aligned), the content Markless renders at the end of the body.
const FRUITS = ['Apple', 'Banana', 'Blueberry', 'Grapes', 'Pineapple'];
const HIDDEN = '<style>[hidden]{display:none!important}</style>';
const radixSelect = (layerAttrs: (i: number) => string = () => '') =>
	`${HIDDEN}<main style="padding:200px"><button type="button" role="combobox" aria-controls="fruit" aria-expanded="false" data-state="closed" data-placeholder="" data-slot="select-trigger"><span data-slot="select-value" style="pointer-events:none">Select a fruit</span></button></main>
	<div style="display:flex;flex-direction:column;position:fixed" hidden data-mm-layer="fruit"><div role="listbox" id="fruit" data-state="closed" data-slot="select-content" tabindex="-1" style="display:flex;flex-direction:column;outline:none"><div data-radix-select-viewport role="presentation" style="position:relative;flex:1;overflow:hidden auto"><div role="group">${FRUITS.map((f, i) => `<div role="option" aria-labelledby="fruit-${i}" aria-selected="false" data-state="unchecked" tabindex="-1" data-slot="select-item"${layerAttrs(i)}><span data-mm-indicator hidden></span><span id="fruit-${i}">${f}</span></div>`).join('')}</div></div></div></div>`;

// Base UI Select (alignItemWithTrigger): its portal with the backdrop, the positioner, the popup and the listbox.
const baseSelect = `${HIDDEN}<main style="padding:200px"><button type="button" id="base" role="combobox" aria-expanded="false" aria-haspopup="listbox" data-slot="select-trigger"><span data-slot="select-value">Select a fruit</span></button></main>
	<div data-base-ui-portal hidden data-mm-layer="base"><div role="presentation" data-base-ui-inert style="position:fixed;inset:0"></div><div data-side="none" data-align="center" role="presentation" style="position:fixed" data-closed><div data-side="none" tabindex="-1" role="presentation" data-slot="select-content" data-closed><div role="listbox" style="position:relative">${FRUITS.map((f) => `<div role="option" aria-selected="false" tabindex="-1" data-slot="select-item"><div>${f}</div></div>`).join('')}</div></div></div></div>`;

// What a select's own key handling queued (its focus moves run on a timer) has run.
const settled = (page: Page) => page.evaluate(() => new Promise<void>((done) => setTimeout(() => setTimeout(done))));
async function selectState(page: Page): Promise<string> {
	await settled(page);
	return page.evaluate(() => {
		const trigger = document.querySelector('[data-slot="select-trigger"]')!;
		const at = document.activeElement;
		const focus = at === trigger ? 'trigger' : at?.getAttribute('role') === 'option' ? at.textContent!.trim() : at?.tagName.toLowerCase();
		const highlighted = [...document.querySelectorAll('[role="option"][data-highlighted]')].map((o) => o.textContent!.trim());
		return `${trigger.getAttribute('aria-expanded')} focus=${focus} highlighted=${highlighted.join('|') || '-'} value=${trigger.querySelector('[data-slot="select-value"]')!.textContent}`;
	});
}

for (const deliver of ['body', 'window'] as const) {
	test(`Radix Select, events delivered at the ${deliver}'s capture: the key that opens it is not also a move inside it`, async () => {
		const page = await open(radixSelect(), ['radix/select'], deliver);
		await page.evaluate(() => document.querySelector('[data-slot="select-trigger"]')!.addEventListener('mmchoose', (e) => (document.querySelector('[data-slot="select-value"]')!.textContent = (e as CustomEvent<string>).detail)));
		await page.locator('[data-slot="select-trigger"]').focus();
		const steps: [string, string][] = [
			['ArrowDown', 'true focus=Apple highlighted=Apple value=Select a fruit'],
			['ArrowDown', 'true focus=Banana highlighted=Banana value=Select a fruit'],
			['ArrowDown', 'true focus=Blueberry highlighted=Blueberry value=Select a fruit'],
			['Enter', 'false focus=trigger highlighted=- value=Blueberry'],
			['ArrowDown', 'true focus=Blueberry highlighted=Blueberry value=Blueberry'],
			['ArrowDown', 'true focus=Grapes highlighted=Grapes value=Blueberry'],
			['Escape', 'false focus=trigger highlighted=- value=Blueberry'],
			['ArrowUp', 'true focus=Blueberry highlighted=Blueberry value=Blueberry'],
		];
		for (const [key, expected] of steps) {
			await page.keyboard.press(key);
			assert.equal(await selectState(page), expected, `after ${key}`);
		}
		await page.close();
	});
}

test('Radix Select with no value opens focused on the first enabled option, from Space, Enter or a press', async () => {
	const page = await open(radixSelect((i) => (i === 0 ? ' data-disabled=""' : '')), ['radix/select'], 'body');
	const trigger = page.locator('[data-slot="select-trigger"]');
	await trigger.focus();
	for (const [key, expected] of [
		['Space', 'true focus=Banana highlighted=Banana value=Select a fruit'],
		['ArrowDown', 'true focus=Blueberry highlighted=Blueberry value=Select a fruit'],
		['Escape', 'false focus=trigger highlighted=- value=Select a fruit'],
		['Enter', 'true focus=Banana highlighted=Banana value=Select a fruit'],
		['Escape', 'false focus=trigger highlighted=- value=Select a fruit'],
	]) {
		await page.keyboard.press(key!);
		assert.equal(await selectState(page), expected, `after ${key}`);
	}
	await trigger.click();
	assert.equal(await selectState(page), 'true focus=Banana highlighted=Banana value=Select a fruit', 'after a press');
	await page.close();
});

test('a select layer captured with options highlighted is converted at rest: only the option the pointer is on is highlighted', async () => {
	// The capture left Banana and Grapes highlighted (the pointer and focus as they were when it was recorded).
	const doc = parseDocument(`<body>${radixSelect((i) => (i === 1 || i === 3 ? ' data-highlighted=""' : ''))}</body>`);
	for (const el of walk(bodyOf(doc))) if (el.attrs.some((a) => a.name === 'data-mm-layer')) for (const x of [el, ...walk(el)]) atRest(x);
	const page = await open(outer(bodyOf(doc)).replace(/^<body>|<\/body>$/g, ''), ['radix/select'], 'body');
	assert.equal(await page.locator('[data-highlighted]').count(), 0);
	await page.locator('[data-slot="select-trigger"]').click();
	await page.locator('[role="option"]', { hasText: 'Blueberry' }).hover();
	assert.equal(await selectState(page), 'true focus=Blueberry highlighted=Blueberry value=Select a fruit');
	await page.close();
});

test('a Radix select layer captured open is converted at rest with no option aria-selected: the chosen one becomes so as it takes focus, as SelectItem sets isSelected && isFocused', async () => {
	// Captured open, the chosen Banana was focused: aria-selected true.
	const captured = radixSelect().replace('aria-labelledby="fruit-1" aria-selected="false" data-state="unchecked"', 'aria-labelledby="fruit-1" aria-selected="true" data-state="checked"');
	const doc = parseDocument(`<body>${captured}</body>`);
	for (const el of walk(bodyOf(doc))) if (el.attrs.some((a) => a.name === 'data-mm-layer')) for (const x of [el, ...walk(el)]) atRest(x);
	const page = await open(outer(bodyOf(doc)).replace(/^<body>|<\/body>$/g, ''), ['radix/select'], 'body');
	const banana = page.locator('[role="option"]', { hasText: 'Banana' });
	assert.deepEqual([await banana.getAttribute('aria-selected'), await banana.getAttribute('data-state')], ['false', 'checked']);
	await page.evaluate(() => {
		const option = [...document.querySelectorAll('[role="option"]')].find((o) => o.textContent === 'Banana')!;
		(window as any).changes = [];
		new MutationObserver((records) => { for (const r of records) (window as any).changes.push(`${r.oldValue}>${option.getAttribute('aria-selected')}`); }).observe(option, { attributes: true, attributeFilter: ['aria-selected'], attributeOldValue: true });
	});
	await page.locator('[data-slot="select-trigger"]').focus();
	await page.keyboard.press('Enter');
	await settled(page);
	assert.equal(await page.evaluate(() => document.activeElement?.textContent), 'Banana');
	assert.deepEqual(await page.evaluate(() => (window as any).changes), ['false>true']);
	await page.close();
});

test('a Base UI select icon carries data-popup-open while its select is open, as SelectIcon does', async () => {
	const page = await open(baseSelect.replace('<span data-slot="select-value">Select a fruit</span>', '<span data-slot="select-value">Select a fruit</span><svg aria-hidden="true" width="8" height="8"><path d="m6 9 6 6 6-6"></path>&#9660;</svg>'), ['base-ui/select'], 'body');
	const icon = () => page.locator('[data-slot="select-trigger"] svg').evaluate((s) => s.hasAttribute('data-popup-open'));
	assert.equal(await icon(), false);
	await page.locator('[data-slot="select-trigger"]').click();
	assert.match(await selectState(page), /^true/);
	assert.equal(await icon(), true);
	await page.keyboard.press('Escape');
	assert.match(await selectState(page), /^false/);
	assert.equal(await icon(), false);
	await page.close();
});

test('a Base UI select opened by a press shows no focus ring on its option, nor on its trigger once an option is chosen', async () => {
	const page = await open(baseSelect, ['base-ui/select'], 'body');
	await page.locator('[data-slot="select-trigger"]').click();
	assert.match(await selectState(page), /^true/);
	const ring = () => page.evaluate(() => `${document.activeElement?.getAttribute('role') ?? document.activeElement?.tagName}:${document.activeElement?.matches(':focus-visible')}`);
	assert.equal(await ring(), 'option:false', 'Base UI focuses the option after a mouse focused the trigger');
	await page.locator('[role="option"]', { hasText: 'Banana' }).click();
	assert.match(await selectState(page), /^false/);
	assert.equal(await ring(), 'combobox:false');
	await page.close();
});

test('a press outside a Radix or Base UI select closes it with focus back on its trigger, as each library does', async () => {
	for (const [markup, port] of [
		[radixSelect(), 'radix/select'],
		[baseSelect, 'base-ui/select'],
	] as const) {
		const page = await open(markup, [port], 'body');
		await page.locator('[data-slot="select-trigger"]').click();
		await page.locator('[role="option"]', { hasText: 'Banana' }).hover();
		assert.match(await selectState(page), /^true focus=Banana/, port);
		await page.mouse.click(5, 790);
		assert.match(await selectState(page), /^false focus=trigger/, port);
		await page.close();
	}
});

test('a Base UI select opened inside a Base UI drawer is part of it: choosing an option, whose list is portaled outside the drawer, leaves the drawer open', async () => {
	const page = await open(
		`<main><button type="button" id="code" data-slot="drawer-trigger" data-base-ui-click-trigger aria-haspopup="dialog" aria-expanded="false">Get Code</button></main>
		<div data-base-ui-portal hidden data-mm-layer="code"><div role="presentation" data-slot="drawer-viewport"><div role="dialog" tabindex="-1" data-slot="drawer-popup" data-swipe-direction="right" data-closed><button type="button" id="fw" role="combobox" aria-expanded="false" aria-haspopup="listbox" data-slot="select-trigger"><span data-slot="select-value">Next.js</span></button></div></div></div>
		<div data-base-ui-portal hidden data-mm-layer="fw"><div data-side="bottom" data-align="end" role="presentation" style="position:absolute" data-closed><div tabindex="-1" role="presentation" data-slot="select-content" data-closed><div role="listbox">${['Next.js', 'Vite'].map((f) => `<div role="option" aria-selected="${f === 'Next.js'}" tabindex="-1" data-slot="select-item"><div>${f}</div></div>`).join('')}</div></div></div></div>`,
		['base-ui/dialog', 'base-ui/select'],
		'body',
	);
	await page.getByText('Get Code').click();
	await page.waitForTimeout(50);
	await page.locator('#fw').click();
	await page.locator('[role="option"]', { hasText: 'Vite' }).click();
	await page.waitForTimeout(50);
	assert.equal(await page.locator('[role="option"]', { hasText: 'Vite' }).getAttribute('aria-selected'), 'true');
	assert.equal(await page.locator('[role="dialog"]').isVisible(), true, 'the drawer stays open');
	await page.mouse.click(5, 790);
	await page.waitForFunction(() => (document.querySelector('[data-mm-layer="code"]') as HTMLElement).hidden, null, { timeout: 2000 });
	await page.close();
});

test('a Radix dropdown menu closed by a press outside returns focus to its trigger, as its modal FocusScope does', async () => {
	const page = await open(
		`<main style="padding:200px"><button type="button" id="menu" aria-haspopup="menu" aria-expanded="false" data-state="closed" data-slot="dropdown-menu-trigger">Open</button></main>
		<div data-mm-layer="menu" hidden data-radix-popper-content-wrapper style="position:fixed"><div data-slot="dropdown-menu-content" role="menu" id="menu-content" aria-labelledby="menu" data-state="closed" tabindex="-1"><div role="menuitem" tabindex="-1">Profile</div></div></div>`,
		['radix/dropdown-menu'],
		'body',
	);
	await page.getByText('Open').click();
	assert.equal(await page.getByText('Open').getAttribute('aria-expanded'), 'true');
	// Radix, too, listens for a press outside from a timer after opening.
	await settled(page);
	await page.mouse.click(5, 790);
	await settled(page);
	assert.equal(await page.getByText('Open').getAttribute('aria-expanded'), 'false');
	assert.equal(await page.evaluate(() => document.activeElement?.id), 'menu');
	await page.close();
});

test('a React Aria select opened by a press delivered before the document stays open: that press is not one outside it', async () => {
	const page = await open(
		`${HIDDEN}<div data-slot="select" data-rac=""><button id="t1" data-slot="select-trigger" data-rac="" type="button" data-react-aria-pressable="true" aria-haspopup="listbox" aria-expanded="false"><span data-slot="select-value" data-rac="" data-placeholder="true">Select a fruit</span></button></div>
		<div style="display: contents;" hidden data-mm-layer="t1"><div data-slot="select-content" data-rac="" data-trigger="Select" style="position:absolute" role="dialog" tabindex="-1" data-placement="bottom"><div id="lb" data-slot="select-list" data-rac="" role="listbox" tabindex="0">${FRUITS.map((f, i) => `<div data-slot="select-item" data-rac="" role="option" aria-selected="false" tabindex="-1" id="o${i}"><span>${f}</span></div>`).join('')}</div></div></div>`,
		['react-aria/select'],
		'window',
	);
	const box = (await page.locator('#t1').boundingBox())!;
	await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
	await settled(page);
	assert.equal(await page.locator('#t1').getAttribute('aria-expanded'), 'true');
	await page.close();
});

test("Radix Select in a form: its hidden native select's change chooses the option with that text, and choosing sets it and fires its change, as Radix's BubbleSelect", async () => {
	const native = `<select aria-hidden="true" tabindex="-1" style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)"><option value=""></option>${FRUITS.map((f) => `<option value="${f.toLowerCase()}">${f}</option>`).join('')}</select>`;
	const markup = radixSelect().replace('<main style="padding:200px">', '<main style="padding:200px"><form>').replace('</button></main>', `</button>${native}</form></main>`);
	const page = await open(markup, ['radix/select'], 'body');
	await page.evaluate(() => {
		const value = document.querySelector('[data-slot="select-value"]')!;
		document.querySelector('[data-slot="select-trigger"]')!.addEventListener('mmchoose', (e) => (value.textContent = (e as CustomEvent<string>).detail));
		(window as any).changes = [];
		document.querySelector('form')!.addEventListener('change', (e) => (window as any).changes.push((e.target as HTMLSelectElement).value));
	});
	const hidden = page.locator('select[aria-hidden="true"]');
	await hidden.selectOption('banana', { force: true });
	assert.equal(await selectState(page), 'false focus=body highlighted=- value=Banana');
	assert.equal(await page.locator('[data-slot="select-trigger"]').getAttribute('data-placeholder'), null);
	assert.equal(await page.locator('[role="option"][data-state="checked"]').textContent(), 'Banana');
	await page.locator('[data-slot="select-trigger"]').focus();
	await page.evaluate(() => ((window as any).changes = []));
	for (const [key, expected] of [
		['Enter', 'true focus=Banana highlighted=Banana value=Banana'],
		['ArrowDown', 'true focus=Blueberry highlighted=Blueberry value=Banana'],
		['Enter', 'false focus=trigger highlighted=- value=Blueberry'],
	]) {
		await page.keyboard.press(key!);
		assert.equal(await selectState(page), expected, `after ${key}`);
	}
	assert.equal(await hidden.inputValue(), 'blueberry');
	assert.deepEqual(await page.evaluate(() => (window as any).changes), ['blueberry']);
	await hidden.selectOption('', { force: true });
	assert.equal(await selectState(page), 'false focus=trigger highlighted=- value=Select a fruit');
	assert.equal(await page.locator('[data-slot="select-trigger"]').getAttribute('data-placeholder'), '');
	await page.close();
});

// React Aria's Table markup as it serves it: the table is the tab stop until focus enters it.
function racTable(): string {
	const row = (name: string, k: number) => `<tr role="row" tabindex="-1" data-key="r${k}"><td role="rowheader" tabindex="-1" data-key="r${k}a">${name}</td><td role="gridcell" tabindex="-1" data-key="r${k}b">$${k}</td><td role="gridcell" tabindex="-1" data-key="r${k}c"><button>Open ${name}</button></td></tr>`;
	return `<button id="before">before</button><table data-rac="" data-collection="c" role="grid" tabindex="0" aria-label="Products"><thead role="rowgroup"><tr role="row"><th role="columnheader" tabindex="-1" data-key="a">Product</th><th role="columnheader" tabindex="-1" data-key="b">Price</th><th role="columnheader" tabindex="-1" data-key="c">Actions</th></tr></thead><tbody role="rowgroup">${['Mouse', 'Keyboard', 'Monitor'].map(row).join('')}</tbody></table><button id="after">after</button>`;
}
const focusOf = (page: Page) => page.evaluate(() => { const a = document.activeElement!; return `${a.tagName.toLowerCase()}${a.getAttribute('role') ? `[${a.getAttribute('role')}]` : ''}:${(a.textContent ?? '').trim().slice(0, 14)}`; });

test('React Aria Table: Tab enters on the first row and leaves the table; the table stops being a tab stop and focus comes back to the row', async () => {
	const page = await open(racTable(), ['react-aria/interactions', 'react-aria/grid']);
	await page.locator('#before').focus();
	await page.keyboard.press('Tab');
	assert.equal(await focusOf(page), 'tr[row]:Mouse$0Open Mo');
	assert.equal(await page.locator('table').getAttribute('tabindex'), '-1');
	assert.equal(await page.locator('tr[data-key="r0"]').getAttribute('tabindex'), '0');
	await page.keyboard.press('ArrowDown');
	assert.equal(await focusOf(page), 'tr[row]:Keyboard$1Open');
	await page.keyboard.press('Tab');
	assert.equal(await focusOf(page), 'button:after');
	await page.keyboard.press('Shift+Tab');
	assert.equal(await focusOf(page), 'tr[row]:Keyboard$1Open', 'the row focus left from is the one tab stop');
	await page.keyboard.press('Shift+Tab');
	assert.equal(await focusOf(page), 'button:before');
	await page.close();
});

test('React Aria Table: Left from a row goes to its last cell\'s button, Up and Down keep the column, Up from the first row reaches its header, Home and End stay in the header row', async () => {
	const page = await open(racTable(), ['react-aria/interactions', 'react-aria/grid']);
	await page.locator('#before').focus();
	await page.keyboard.press('Tab');
	await page.keyboard.press('ArrowLeft');
	assert.equal(await focusOf(page), 'button:Open Mouse');
	await page.keyboard.press('ArrowDown');
	assert.equal(await focusOf(page), 'button:Open Keyboard', 'a menu button in the cell does not take the arrow');
	await page.keyboard.press('ArrowRight');
	assert.equal(await focusOf(page), 'tr[row]:Keyboard$1Open', 'past the last cell focus goes back to the row');
	await page.keyboard.press('ArrowRight');
	assert.equal(await focusOf(page), 'td[rowheader]:Keyboard');
	await page.keyboard.press('ArrowUp');
	await page.keyboard.press('ArrowUp');
	assert.equal(await focusOf(page), 'th[columnheader]:Product');
	await page.keyboard.press('End');
	assert.equal(await focusOf(page), 'th[columnheader]:Actions');
	await page.keyboard.press('ArrowRight');
	assert.equal(await focusOf(page), 'th[columnheader]:Product', 'the header row wraps');
	await page.keyboard.press('k');
	assert.equal(await focusOf(page), 'tr[row]:Keyboard$1Open', 'typing finds the row by its row header');
	await page.close();
});

// React Aria's ToggleButtonGroup markup: every item is tabbable; the toolbar, not each item, owns the keys.
function racToolbar(options: { single?: boolean; dir?: string } = {}): string {
	const item = (label: string, k: number) => (options.single ? `<button data-rac="" type="button" tabindex="0" role="radio" aria-checked="${k === 0}">${label}</button>` : `<button data-rac="" type="button" tabindex="0" aria-pressed="false">${label}</button>`);
	return `<button id="before">before</button><div data-rac="" role="${options.single ? 'radiogroup' : 'toolbar'}" aria-orientation="horizontal"${options.dir ? ` dir="${options.dir}"` : ''}>${['A', 'B', 'C'].map(item).join('')}</div><button id="after">after</button>`;
}

test('React Aria ToggleButtonGroup: Left and Right move focus without wrapping or choosing, Up and Down do nothing in a horizontal group', async () => {
	const page = await open(racToolbar({ single: true }), ['toggle']);
	await page.getByText('A', { exact: true }).focus();
	await page.keyboard.press('ArrowDown');
	assert.equal(await focused(page), 'A');
	await page.keyboard.press('ArrowRight');
	assert.equal(await focused(page), 'B');
	assert.equal(await page.getByText('B', { exact: true }).getAttribute('aria-checked'), 'false', 'the arrows only move focus');
	await page.keyboard.press('ArrowRight');
	await page.keyboard.press('ArrowRight');
	assert.equal(await focused(page), 'C', 'no wrapping past the last item');
	await page.keyboard.press('ArrowLeft');
	assert.equal(await focused(page), 'B');
	await page.close();
	const rtl = await open(racToolbar({ dir: 'rtl' }), ['toggle']);
	await rtl.getByText('A', { exact: true }).focus();
	await rtl.keyboard.press('ArrowLeft');
	assert.equal(await focused(rtl), 'B', 'right to left, Left moves on');
	await rtl.close();
});

test('React Aria ToggleButtonGroup: Tab leaves the group from any item, and coming back returns to the item it left', async () => {
	const page = await open(racToolbar(), ['toggle']);
	await page.getByText('A', { exact: true }).focus();
	await page.keyboard.press('ArrowRight');
	await page.keyboard.press('Tab');
	assert.equal(await focused(page), 'after');
	await page.keyboard.press('Shift+Tab');
	assert.equal(await focused(page), 'B', 'focus returns to the item it left from');
	await page.keyboard.press('Shift+Tab');
	assert.equal(await focused(page), 'before');
	await page.close();
});

test('React Aria RadioGroup: the arrows choose the next radio, wrapping, in reading order in a vertical group read right to left', async () => {
	const radio = (v: string, checked: boolean) => `<label data-rac=""><input type="radio" name="g" value="${v}" tabindex="${checked ? 0 : -1}"${checked ? ' checked' : ''}>${v}</label>`;
	const page = await open(`<div data-rac="" role="radiogroup" aria-orientation="vertical" dir="rtl">${radio('a', false)}${radio('b', true)}${radio('c', false)}</div><button>after</button>`, ['toggle']);
	const value = () => page.evaluate(() => [(document.activeElement as HTMLInputElement).value, (document.querySelector('input:checked') as HTMLInputElement).value, [...document.querySelectorAll('input')].map((i) => i.tabIndex).join('')].join(':'));
	await page.locator('input[value="b"]').focus();
	await page.keyboard.press('ArrowRight');
	assert.equal(await value(), 'c:c:-1-10', 'a vertical group keeps Right as next, and the chosen radio is the one tab stop');
	await page.keyboard.press('ArrowDown');
	assert.equal(await value(), 'a:a:0-1-1', 'wrapping');
	await page.keyboard.press('ArrowLeft');
	assert.equal(await value(), 'c:c:-1-10');
	await page.keyboard.press('Tab');
	assert.equal(await page.evaluate(() => document.activeElement?.textContent), 'after');
	await page.close();
});

test('React Aria RadioGroup with nothing chosen: every radio is a tab stop until focus enters, then only the one focused', async () => {
	const radio = (v: string) => `<label data-rac=""><input type="radio" name="g" value="${v}" tabindex="0">${v}</label>`;
	const page = await open(`<button>before</button><div data-rac="" role="radiogroup" aria-orientation="vertical">${radio('a')}${radio('b')}</div><button>after</button>`, ['toggle']);
	await page.getByText('before').focus();
	await page.keyboard.press('Tab');
	await page.keyboard.press('Tab');
	assert.equal(await page.evaluate(() => document.activeElement?.textContent), 'after');
	assert.equal(await page.evaluate(() => [...document.querySelectorAll('input')].map((i) => i.tabIndex).join('')), '00', 'leaving with nothing chosen makes every radio a tab stop again');
	await page.close();
});

// Radix ToggleGroup and RadioGroup markup after hydration: the group is the tab stop until an item takes focus.
function radixGroup(options: { role: 'group' | 'radiogroup'; pressed?: boolean; dir?: string }): string {
	const item = (label: string, k: number) => `<button type="button" ${options.pressed ? `aria-pressed="false" data-state="off"` : `role="radio" aria-checked="${k === 0}" data-state="${k === 0 ? 'on' : 'off'}"`} tabindex="-1" data-radix-collection-item="" onclick="${options.role === 'radiogroup' ? `for (const b of this.parentElement.children) { b.setAttribute('aria-checked', String(b === this)); }` : ''}">${label}</button>`;
	return `<button id="before">before</button><div role="${options.role}" dir="${options.dir ?? 'ltr'}" tabindex="0">${['A', 'B', 'C'].map(item).join('')}</div><button id="after">after</button>`;
}
async function holdKey(page: Page, key: string): Promise<void> {
	await page.keyboard.down(key);
	await page.waitForTimeout(60);
	await page.keyboard.up(key);
	await page.waitForTimeout(30);
}

test('Radix ToggleGroup: arrows, Home and End move focus in either axis, looping, and the focused item is the tab stop', async () => {
	const page = await open(radixGroup({ role: 'group', pressed: true }), ['toggle']);
	await page.getByText('A', { exact: true }).focus();
	await holdKey(page, 'ArrowRight');
	assert.equal(await focused(page), 'B');
	await holdKey(page, 'ArrowDown');
	assert.equal(await focused(page), 'C');
	await holdKey(page, 'ArrowRight');
	assert.equal(await focused(page), 'A', 'looping');
	await holdKey(page, 'End');
	assert.equal(await focused(page), 'C');
	assert.equal(await page.evaluate(() => [...document.querySelectorAll('[data-radix-collection-item]')].map((b) => b.getAttribute('tabindex')).join(',')), '-1,-1,0');
	assert.equal(await page.getByText('C', { exact: true }).getAttribute('aria-pressed'), 'false', 'arrows only move focus');
	await page.close();
});

test('Radix RadioGroup: a held arrow chooses the radio it moves to and Enter does nothing; a Radix Checkbox ignores Enter', async () => {
	const page = await open(`${radixGroup({ role: 'radiogroup' })}<button role="checkbox" aria-checked="false" data-state="unchecked" onclick="this.setAttribute('aria-checked', String(this.getAttribute('aria-checked') !== 'true'))">box</button>`, ['toggle']);
	await page.getByText('A', { exact: true }).focus();
	await holdKey(page, 'ArrowDown');
	assert.equal(await focused(page), 'B');
	assert.equal(await page.getByText('B', { exact: true }).getAttribute('aria-checked'), 'true');
	await page.getByText('C', { exact: true }).focus();
	await page.keyboard.press('Enter');
	assert.equal(await page.getByText('C', { exact: true }).getAttribute('aria-checked'), 'false');
	await page.getByText('box').focus();
	await page.keyboard.press('Enter');
	assert.equal(await page.getByText('box').getAttribute('aria-checked'), 'false');
	await page.keyboard.press(' ');
	assert.equal(await page.getByText('box').getAttribute('aria-checked'), 'true');
	await page.close();
});

// Base UI ToggleGroup as shadcn renders it: the wrapper writes its own data-orientation; Base UI's is a prop.
function baseGroup(options: { dataOrientation?: string; orientation?: string } = {}): string {
	const item = (label: string, k: number) => `<button type="button" aria-disabled="false" tabindex="${k === 0 ? 0 : -1}" aria-pressed="false">${label}</button>`;
	return `<div role="group" data-orientation="${options.dataOrientation ?? 'horizontal'}"${options.orientation ? ` data-mm-orientation="${options.orientation}"` : ''}>${['A', 'B', 'C'].map(item).join('')}</div>`;
}

test('Base UI ToggleGroup: the arrows of its own orientation move focus, looping, Home and End go to the ends, and the item focused is the tab stop', async () => {
	const page = await open(baseGroup({ dataOrientation: 'vertical' }), ['toggle']);
	await page.getByText('A', { exact: true }).focus();
	await page.keyboard.press('ArrowDown');
	assert.equal(await focused(page), 'A', 'its orientation is horizontal whatever data-orientation the wrapper writes');
	await page.keyboard.press('ArrowRight');
	assert.equal(await focused(page), 'B');
	await page.keyboard.press('End');
	assert.equal(await focused(page), 'C');
	await page.keyboard.press('ArrowRight');
	assert.equal(await focused(page), 'A', 'looping');
	assert.equal(await page.evaluate(() => [...document.querySelectorAll('button')].map((b) => b.getAttribute('tabindex')).join(',')), '0,-1,-1');
	await page.close();
	const vertical = await open(baseGroup({ orientation: 'vertical' }), ['toggle']);
	await vertical.getByText('A', { exact: true }).focus();
	await vertical.keyboard.press('ArrowDown');
	assert.equal(await focused(vertical), 'B', 'an orientation the source passes is followed');
	await vertical.close();
});

test('Base UI Checkbox: its hidden input, focused by a click on its label, hands focus to the control; Enter submits the form around it', async () => {
	const page = await open(`<form onsubmit="event.preventDefault(); window.submitted = (window.submitted ?? 0) + 1"><span role="checkbox" tabindex="0" id="c">x</span><input type="checkbox" aria-hidden="true" id="i" tabindex="-1"><label for="i">Label</label><button>Send</button></form><script type="module">import { focusControl, submitForm } from '/parts/toggle.ts'; document.getElementById('i').addEventListener('focus', focusControl); document.getElementById('c').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); submitForm(e); } });</script>`, ['toggle']);
	await page.getByText('Label').click();
	assert.equal(await page.evaluate(() => document.activeElement?.id), 'c');
	await page.keyboard.press('Enter');
	await page.waitForTimeout(50);
	assert.equal(await page.evaluate(() => (window as unknown as { submitted?: number }).submitted), 1);
	await page.close();
});

// sonner's CSS rules the stack relies on (sonner injects them).
const SONNER_CSS = '[data-sonner-toaster]{position:fixed;width:var(--width);list-style:none;padding:0;margin:0}[data-sonner-toaster][data-y-position=top]{top:24px}[data-sonner-toaster][data-x-position=center]{left:50%}[data-sonner-toaster][data-x-position=left]{left:24px}[data-sonner-toast]{position:absolute;box-sizing:border-box;width:var(--width)}[data-sonner-toast][data-y-position=top]{top:0}';
function sonnerPage(toasts: readonly { label: string; position?: string; duration?: number; phases?: { at: number; type: string; inner: string }[] }[]): string {
	const T = { id: 'tst0', position: 'top-center', gap: 14, visibleToasts: 3, expand: false, hotkey: ['altKey', 'KeyT'], style: '--width: 356px; --gap: 14px;' };
	const specs = toasts.map((t, k) => ({ view: k, ...(t.position ? { position: t.position } : {}), duration: t.duration ?? 4000, dismissible: true, promise: Boolean(t.phases), style: '', phases: (t.phases ?? [{ at: 0, type: '', inner: '' }]).map((p) => ({ at: p.at, ...(p.type ? { type: p.type } : {}), attrs: { tabindex: '0', 'data-sonner-toast': '' } })) }));
	const inner = toasts.map((t) => (t.phases ?? [{ inner: `<div data-title="" style="height:50px">${t.label}</div>` }]).map((p) => p.inner));
	// A keyed renderer of the toaster's lists and their toasts standing in for Markless's @for over its state, as convert's
	// NotifyPlan renders it, the lists' handlers taking the toasts' events.
	const script = `import { sonnerAdd, sonnerList } from '/parts/sonner.ts';
const T = ${JSON.stringify(T)}, SPECS = ${JSON.stringify(specs)}, INNER = ${JSON.stringify(inner)};
const section = document.querySelector('section');
const commit = (view) => {
	const lists = new Map([...section.children].map((ol) => [ol.dataset.key, ol]));
	view.lists.forEach((list, i) => {
		let ol = lists.get(list.position);
		if (!ol) { ol = document.createElement('ol'); ol.dataset.key = list.position; ol.setAttribute('data-sonner-toaster', 'true'); for (const e of ['mouseenter', 'mousemove', 'mouseleave', 'pointerdown', 'pointerup', 'pointermove', 'click', 'focusin', 'focusout']) ol.addEventListener(e, (event) => sonnerList(T, list.position, event, commit)); }
		ol.setAttribute('data-y-position', list.y); ol.setAttribute('data-x-position', list.x); ol.setAttribute('style', list.style);
		if (section.children[i] !== ol) section.insertBefore(ol, section.children[i] ?? null);
		const items = new Map([...ol.children].map((li) => [li.dataset.id, li]));
		list.items.forEach((item, j) => {
			let li = items.get(String(item.id));
			if (!li) { li = document.createElement('li'); li.dataset.id = String(item.id); }
			for (const [n, v] of Object.entries(item.a)) if (v === undefined) li.removeAttribute(n); else li.setAttribute(n, v);
			const [k, p] = item.view.split('.').map(Number);
			if (li.dataset.view !== item.view) { li.dataset.view = item.view; li.innerHTML = INNER[k][p]; }
			if (ol.children[j] !== li) ol.insertBefore(li, ol.children[j] ?? null);
		});
		for (const extra of [...ol.children].slice(list.items.length)) extra.remove();
	});
	for (const extra of [...section.children].slice(view.lists.length)) extra.remove();
};
document.querySelectorAll('button[data-k]').forEach((b) => b.addEventListener('click', () => sonnerAdd(T, SPECS[Number(b.dataset.k)], commit)));`;
	return `<style>${SONNER_CSS}</style><div style="padding-top:300px">${toasts.map((t, k) => `<button data-k="${k}">${t.label}</button>`).join('')}</div><section aria-label="Notifications alt+T" data-mm-toaster="tst0"></section><script type="module">${script}</script>`;
}
const readToasts = () => [...document.querySelectorAll('section > ol')].map((ol) => `${ol.getAttribute('data-y-position')}-${ol.getAttribute('data-x-position')}:` + [...ol.querySelectorAll('li')].map((li) => `${li.textContent}[i=${li.getAttribute('data-index')} front=${li.getAttribute('data-front')} exp=${li.getAttribute('data-expanded')} removed=${li.getAttribute('data-removed')} offset=${li.style.getPropertyValue('--offset')} z=${li.style.getPropertyValue('--z-index')}]`).join(' '));
const toastState = (page: Page) => page.evaluate(readToasts);
// Each distinct toast state from now until the toaster renders no list, with when it began (timers can only run late).
const recordToasts = (page: Page) => page.evaluate((read) => new Promise<{ state: string; at: number }[]>((resolve) => {
	const now = () => (0, eval)(`(${read})`)().join(' ');
	const seen: { state: string; at: number }[] = [];
	new MutationObserver(() => {
		const state = now();
		if (state === seen.at(-1)?.state) return;
		seen.push({ state, at: performance.now() });
		if (!state) resolve(seen);
	}).observe(document.querySelector('section')!, { subtree: true, childList: true, attributes: true, characterData: true });
}), readToasts.toString());
// The phases of a recorded life: each first state that shows other text or another removed flag, with when it began.
const phasesOf = (states: readonly { state: string; at: number }[]) => states.map((s) => ({ state: s.state.replace(/\[.*?removed=(\w+).*?\]/g, '[removed=$1]'), at: s.at })).filter((s, k, all) => k === 0 || s.state !== all[k - 1]!.state);
const untilToasts = (page: Page, expected: string) => page.waitForFunction(([read, want]) => (0, eval)(`(${read})`)().join(' ') === want, [readToasts.toString(), expected]);

test('sonner: each use adds a toast at the front of the stack, hovering expands it with each toast lifted by the heights before it', async () => {
	const page = await open(sonnerPage([{ label: 'A' }, { label: 'B' }]), ['sonner']);
	await page.getByRole('button', { name: 'A' }).click();
	await untilToasts(page, 'top-center:A[i=0 front=true exp=false removed=false offset=0px z=1]');
	await page.waitForFunction(() => document.querySelector('section li')?.getAttribute('data-mounted') === 'true');
	await page.getByRole('button', { name: 'B' }).click();
	await page.getByRole('button', { name: 'A' }).click();
	await untilToasts(page, 'top-center:A[i=0 front=true exp=false removed=false offset=0px z=3] B[i=1 front=false exp=false removed=false offset=64px z=2] A[i=2 front=false exp=false removed=false offset=128px z=1]');
	const box = (await page.locator('section li').first().boundingBox())!;
	await page.mouse.move(box.x + 10, box.y + 10);
	await page.waitForFunction(() => document.querySelector('section li')?.getAttribute('data-expanded') === 'true');
	assert.match((await toastState(page))[0]!, /^top-center:A\[i=0 front=true exp=true/);
	assert.match((await page.locator('section ol').getAttribute('style')) ?? '', /^--front-toast-height: 50px; --width: 356px;/);
	await page.close();
});

test('sonner: a toast for a position no toast uses yet gets its own list after the toaster\'s, and leaves 200 ms after its lifetime', async () => {
	const page = await open(sonnerPage([{ label: 'L', position: 'top-left', duration: 400 }]), ['sonner']);
	const seen = recordToasts(page);
	await page.getByRole('button', { name: 'L' }).click();
	const states = await seen;
	assert.ok(states.some((s) => s.state === 'top-center: top-left:L[i=0 front=true exp=false removed=false offset=0px z=1]'));
	const phases = phasesOf(states);
	assert.deepEqual(phases.map((s) => s.state), ['top-center: top-left:L[removed=false]', 'top-center: top-left:L[removed=true]', ''], 'with no toast left the toaster renders no list');
	const [lived, left] = [phases[1]!.at - phases[0]!.at, phases[2]!.at - phases[1]!.at];
	assert.ok(lived >= 380 && left >= 190, `lived ${lived} ms, then left ${left} ms after`);
	await page.close();
});

test('sonner: a promise toast shows its loading markup, then its result, and its lifetime starts with the result', async () => {
	const page = await open(sonnerPage([{ label: 'P', duration: 300, phases: [{ at: 0, type: 'loading', inner: '<div data-title="">Loading...</div>' }, { at: 500, type: 'success', inner: '<div data-title="">Done</div>' }] }]), ['sonner']);
	const seen = recordToasts(page);
	await page.getByRole('button', { name: 'P' }).click();
	const phases = phasesOf(await seen);
	assert.deepEqual(phases.map((s) => s.state), ['top-center:Loading...[removed=false]', 'top-center:Done[removed=false]', 'top-center:Done[removed=true]', '']);
	assert.ok(phases[1]!.at - phases[0]!.at >= 480, 'a loading toast has no timer');
	assert.ok(phases[2]!.at - phases[1]!.at >= 280, 'its lifetime starts with the result');
	await page.close();
});

test('sonner: a toast\'s action button dismisses it through its list\'s handlers, and a held press on the list pauses every timer', async () => {
	const page = await open(sonnerPage([{ label: 'A', duration: 1000, phases: [{ at: 0, type: '', inner: '<div data-title="" style="height:50px">A</div><button data-button="" data-action="">Undo</button>' }] }]), ['sonner']);
	await page.getByRole('button', { name: 'A' }).click();
	await page.waitForFunction(() => document.querySelector('section li')?.getAttribute('data-mounted') === 'true');
	const box = (await page.locator('section li').boundingBox())!;
	await page.mouse.move(box.x + 10, box.y + 10);
	await page.mouse.down();
	await page.waitForTimeout(1500);
	assert.match((await toastState(page))[0]!, /removed=false/, 'pressed and hovered, the timer waits');
	await page.mouse.up();
	await page.getByRole('button', { name: 'Undo' }).click();
	await page.waitForFunction(() => document.querySelector('section li')?.getAttribute('data-removed') === 'true');
	await page.close();
});

test('shadcn-ui site: a chart\'s frame captured shown but still loading when it is mounted goes transparent at once, without fading out', async () => {
	const css = '<style>.transition-opacity{transition-property:opacity;transition-duration:300ms}.opacity-0{opacity:0}.opacity-100{opacity:1}</style>';
	const page = await open(`${css}<div style="height:5000px"></div><iframe src="/frame/slow" class="w-full border-none transition-opacity duration-300 opacity-100" height="100" loading="lazy" title="chart"></iframe>`, ['site']);
	let release!: () => void;
	const held = new Promise<void>((done) => (release = done));
	await page.route('http://parts.test/frame/**', async (route) => {
		await held;
		await route.fulfill({ contentType: 'text/html', body: '<svg></svg>' });
	});
	await page.locator('iframe').scrollIntoViewIfNeeded();
	await page.evaluate(() => {
		const w = window as unknown as { faded: number; mountParts: (a: string) => void };
		w.faded = 0;
		document.querySelector('iframe')!.addEventListener('transitionrun', () => w.faded++);
		w.mountParts('iframe[loading]');
	});
	await page.waitForTimeout(400);
	assert.match(await page.locator('iframe').evaluate((f) => f.className), / opacity-0$/);
	assert.equal(await page.evaluate(() => (window as unknown as { faded: number }).faded), 0, 'the old frame starts transparent: nothing fades out');
	release();
	await page.close();
});

test('shadcn-ui site: a chart\'s frame stays transparent until its page has loaded, then shows, whatever the capture caught it in', async () => {
	const frame = (name: string, opacity: string) => `<iframe src="/frame/${name}" class="w-full border-none transition-opacity duration-300 ${opacity}" height="100" loading="lazy" title="chart-${name}"></iframe>`;
	const page = await open(`<div style="height:5000px"></div>${frame('slow', 'opacity-100')}<div style="height:5000px"></div>${frame('loaded', 'opacity-0')}`, ['site']);
	let release!: () => void;
	const held = new Promise<void>((done) => (release = done));
	await page.route('http://parts.test/frame/**', async (route) => {
		if (route.request().url().endsWith('/slow')) await held;
		await route.fulfill({ contentType: 'text/html', body: '<svg class="recharts-surface"></svg>' });
	});
	const classOf = (i: number) => page.locator('iframe').nth(i).evaluate((f) => f.className);
	const loaded = (i: number) => page.waitForFunction((i) => document.querySelectorAll('iframe')[i]!.contentDocument?.querySelector('svg') != null, i);
	const mount = () => page.evaluate(() => (window as unknown as { mountParts: (a: string) => void }).mountParts('iframe[loading]'));

	await page.locator('iframe').nth(1).scrollIntoViewIfNeeded();
	await loaded(1);
	await mount();
	assert.match(await classOf(1), / opacity-100$/, 'a frame already loaded when it is mounted shows');

	await page.locator('iframe').nth(0).scrollIntoViewIfNeeded();
	await mount();
	assert.match(await classOf(0), / opacity-0$/, 'a frame still loading is transparent');
	release();
	await loaded(0);
	await page.waitForFunction(() => document.querySelector('iframe')!.className.endsWith(' opacity-100'));
	await page.close();
});

test("day picker: a key DayPicker handles on a day does not scroll the page, even when the page's render removes that day's button at once", async () => {
	const page = await open('<div style="height:3000px"></div><div data-mm-day-picker><table><tbody><tr><td role="gridcell"><button id="d">6</button></td></tr></tbody></table></div><div style="height:3000px"></div>', []);
	const prevented = await page.evaluate(async () => {
		const { dayPickerEvent, dayPickerView } = await import('/parts/day-picker.ts' as string);
		const loc = { ws: 0, fwcd: 1, full: 'PP', months: {}, days: {}, ord: [] };
		const config = { loc, mode: 'single', interactive: true, n: 1, caption: 'label', cls: {} };
		const button = document.getElementById('d')!;
		const root = document.querySelector('[data-mm-day-picker]')!;
		let result = false;
		root.addEventListener('keydown', (event) => {
			// A month change rendered in the same task replaces the grid's cells.
			queueMicrotask(() => button.remove());
			dayPickerEvent(config, dayPickerView(config, 20000), event, 'k');
		});
		window.addEventListener('keydown', (event) => setTimeout(() => (result = event.defaultPrevented)), true);
		button.focus();
		button.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true }));
		await new Promise((r) => setTimeout(r, 50));
		return result;
	});
	assert.equal(prevented, true);
	await page.close();
});

// recharts 3.8's easing.js, as an oracle for the frames the part draws: Newton's method with its own stopping rule.
function rechartsEase(t0: number): number {
	const poly = (p: number[], t: number) => p.map((q, i) => q * t ** i).reduce((a, b) => a + b);
	const fx = [0, 0.75, -0.75, 1];
	const fy = [0, 0.3, 2.4, -1.7];
	const t = t0 > 1 ? 1 : t0;
	let x = t;
	for (let i = 0; i < 8; ++i) {
		const e = poly(fx, x) - t;
		const der = poly([0.75, -1.5, 3, 0], x);
		if (Math.abs(e - t) < 1e-4 || der < 1e-4) return poly(fy, x);
		x = Math.min(1, Math.max(0, x - e / der));
	}
	return poly(fy, x);
}

test('recharts: a control switching the chart moves each mark from its old shape to the new one, timed, eased and drawn as recharts animates an update', async () => {
	const { area, line, curveMonotoneX } = await import('d3-shape');
	type P = [number, number];
	const lineA: P[] = [[10, 80], [60, 20], [110, 60], [160, 30]];
	const lineB: P[] = [[10, 30], [60, 70], [110, 20], [160, 60]];
	const areaA: P[] = [[10, 50], [40, 60], [70, 40], [100, 70], [130, 45], [160, 55]];
	const areaB: P[] = [[10, 20], [85, 75], [160, 30]];
	const drawLine = (ps: readonly P[]) => line().curve(curveMonotoneX)(ps as P[])!;
	const drawArea = (ps: readonly P[]) => area().curve(curveMonotoneX).y0(95)(ps as P[])!;
	const geo = (k: string) => JSON.stringify({ k, t: 'monotone', l: 'horizontal', a: [0, 1500, 'ease'] });
	const bar = ([x, y, w, h]: readonly number[]) => `x="${x}" y="${y}" width="${w}" height="${h}" radius="0" data-mm-geo='${JSON.stringify({ k: 'bar', a: [0, 1500, 'ease'] })}'`;
	const rect = ([x, y, w, h]: readonly number[]) => `M ${x},${y} h ${w} v ${h} h ${-w!} Z`;
	const barA = [170, 40, 20, 55];
	const barB = [170, 10, 20, 85];
	const facts = JSON.stringify({ w: 200, h: 100, v: [5, 5, 190, 90], m: 'x', g: [], p: [], z: 5 });
	// Each drawing covers the widths it is nearest to; a control's drawings may split the widths differently.
	const svg = (ln: readonly P[], ar: readonly P[], br: readonly number[], style: string, widths: string) =>
		`<svg class="recharts-surface" width="200" height="100" style="${style}" data-mm-b="${widths}" data-mm-facts='${facts}'><path class="recharts-curve recharts-area-area" d="${drawArea(ar)}" data-mm-geo='${geo('area')}'></path><path class="recharts-curve recharts-line-curve" d="${drawLine(ln)}" data-mm-geo='${geo('line')}'></path><path class="recharts-rectangle" d="${rect(br)}" ${bar(br)}></path></svg>`;
	const page = await open(
		`<div data-mm-morph><button>Mobile</button><div class="recharts-wrapper" style="position:relative;width:200px;height:100px" data-mm-chart="1">${svg(lineA, areaA, barA, 'display:block', '0 1 2')}${svg(lineB, areaB, barB, 'display: none;', '2 3')}<div class="recharts-tooltip-wrapper" style="visibility: hidden"></div></div></div>`,
		['recharts'],
	);
	await page.evaluate(() => (window as unknown as { mountParts: (a: string) => void }).mountParts('data-mm-chart'));
	// The pointer over the card fetches the animation before its control is used; the module is in once it and
	// d3-shape's modules have all loaded (the same module record the part imported).
	// From outside the card: a pointer already resting on the button (a layout's synthetic move at 0,0) sends no pointerover.
	const view = page.viewportSize()!;
	await page.mouse.move(view.width - 1, view.height - 1);
	await page.hover('button');
	await page
		.waitForFunction(() => performance.getEntriesByType('resource').some((e) => e.name.endsWith('/parts/recharts-motion.ts')), undefined, { timeout: 10_000 })
		.catch(async () => assert.fail(`hovering the button did not fetch recharts-motion.ts; pointer events seen: ${await page.evaluate(() => JSON.stringify((window as unknown as { pointerLog: string[] }).pointerLog))}`));
	await page.evaluate('import("/parts/recharts-motion.ts")');
	type Sample = { ts: number; d: string[] };
	const run = await page.evaluate(
		() =>
			new Promise<{ sync: string[]; frames: Sample[]; moved: boolean }>((resolve) => {
				const [a, b] = [...document.querySelectorAll('svg.recharts-surface')] as SVGSVGElement[];
				const read = () => [...b!.querySelectorAll('path')].map((p) => p.getAttribute('d') ?? '');
				const frames: Sample[] = [];
				let sync: string[] = [];
				const sample = (ts: number) => {
					frames.push({ ts, d: read() });
					if (frames.length < 120) requestAnimationFrame(sample);
					else resolve({ sync, frames, moved: b!.parentElement!.hasAttribute('data-mm-moved') });
				};
				requestAnimationFrame(() => {
					a!.setAttribute('style', 'display: none;');
					b!.setAttribute('style', 'display:block');
					queueMicrotask(() => (sync = read()));
					requestAnimationFrame(sample);
				});
			}),
	);
	assert.ok(run.moved, 'the chart is marked as switched, so its entry animation does not play again');
	// recharts maps each new point to the old one at its index scaled by the old count: 6 points to 3 take 0, 2 and 4.
	const t0 = [drawArea([areaA[0]!, areaA[2]!, areaA[4]!]), drawLine(lineA), rect(barA)];
	assert.deepEqual(run.sync, t0, 'before the first paint, the new SVG holds the old shapes');
	// The sample taken in frame j+1 reads what frame j painted. recharts' clock begins in frame 5 (the facts' lag); React
	// paints the shape for frame j-1's time in frame j.
	const painted = run.frames.map((f) => f.d);
	const time = (j: number) => run.frames[j - 1]!.ts;
	const begin = time(5);
	for (let j = 1; j < painted.length; j++) {
		if (j < 7) {
			assert.deepEqual(painted[j], t0, `frame ${j}: the old shapes hold until the frame after the clock's first tick`);
			continue;
		}
		const t = (time(j - 1) - begin) / 1500;
		if (t >= 1) {
			assert.deepEqual(painted[j], [drawArea(areaB), drawLine(lineB), rect(barB)], `frame ${j}: the new shapes once the animation ends`);
			continue;
		}
		const e = rechartsEase(t);
		const near = (from: readonly P[], i: number, n: number) => from[Math.floor((i * from.length) / n)]!;
		const mix = (from: readonly P[], to: readonly P[]) => to.map((p, i) => [near(from, i, to.length)[0] + e * (p[0] - near(from, i, to.length)[0]), near(from, i, to.length)[1] + e * (p[1] - near(from, i, to.length)[1])] as P);
		const box = barA.map((v, i) => v + e * (barB[i]! - v));
		const round = (n: number) => Math.round(n * 1e4) / 1e4;
		assert.deepEqual(painted[j], [drawArea(mix(areaA, areaB)), drawLine(mix(lineA, lineB)), `M ${round(box[0]!)},${round(box[1]!)} h ${round(box[2]!)} v ${round(box[3]!)} h ${round(-box[2]!)} Z`], `frame ${j} at ${Math.round(time(j - 1) - begin)} ms`);
	}
	assert.ok(time(painted.length - 1) - begin > 1550, 'the samples reach the end of the animation');
});

test('cmdk: a search keeps the groups where they are, sorts the items it kept, then puts back the ones it brings back where React mounts them, and selects the first', async () => {
	const page = await open(COMMAND, ['cmdk']);
	await page.locator('[cmdk-input]').focus();
	await page.keyboard.type('cal');
	assert.deepEqual((await commandState(page)).order, 'calc,cal');
	for (let k = 0; k < 2; k++) await page.keyboard.press('Backspace');
	// cmdk 1.1.1 sorts the mounted items synchronously; Search Emoji mounts after, before the next item React renders after it.
	const back = await commandState(page);
	assert.deepEqual([back.order, back.selected], ['emo,calc,cal', 'emo']);
	await page.keyboard.press('Backspace');
	// Its group lookup never matches (it queries a group by its id among their values): the groups never move.
	const cleared = await commandState(page);
	assert.deepEqual([cleared.order, cleared.selected, cleared.separator], ['emo,calc,cal,pro,bil,set', 'emo', false]);
	await page.close();
});

// recharts 3.8's getTicks with interval preserveEnd (getTicksEnd), as an oracle: from the last tick back, each kept
// where its text fits before the one after it, minTickGap apart; the last one's text pulled inside the end.
function preserveEnd(coords: readonly number[], widths: readonly number[], start: number, end: number, gap: number): { i: number; at: number }[] {
	const out: { i: number; at: number }[] = [];
	for (let i = coords.length - 1; i >= 0; i--) {
		const w = widths[i]!;
		const over = coords[i]! + w / 2 - end;
		const at = i === coords.length - 1 && over > 0 ? coords[i]! - over : coords[i]!;
		if (at < start || at > end) continue;
		if (at - w / 2 - start >= 0 && at + w / 2 - end <= 0) {
			out.unshift({ i, at });
			end = at - (w / 2 + gap);
		}
	}
	return out;
}

test('recharts: behind UTC, the axis shows the ticks recharts keeps for the dates read a day earlier, measured in the tick\'s font', async () => {
	const labels = ['Apr 1', 'Apr 2', 'Apr 3', 'Apr 4', 'Apr 5', 'Apr 6', 'Apr 7', 'Apr 8', 'Apr 9', 'Apr 10', 'Apr 11', 'Apr 12'];
	const coords = labels.map((_, i) => 10 + i * 25);
	const axis = { t: 'xAxis', o: 'bottom', box: [10, 170, 280, 30], vb: [0, 0, 300, 200], gap: 8, iv: 'preserveEnd', ts: 6, tm: 8, off: 0, c: coords, l: labels };
	const facts = JSON.stringify({ w: 300, h: 200, v: [10, 0, 280, 170], m: 'x', g: [], p: [], a: [axis] });
	// What the capture shows in UTC: every third tick from the end.
	const shown = [2, 5, 8, 11];
	const tick = (i: number) => `<g class="recharts-layer recharts-cartesian-axis-tick-label"><text class="recharts-text recharts-cartesian-axis-tick-value" x="${coords[i]}" y="184" text-anchor="middle" fill="#666" style="font-size:12px"><tspan x="${coords[i]}" dy="0.71em">${labels[i]}</tspan></text></g>`;
	const line = (i: number) => `<g class="recharts-layer recharts-cartesian-axis-tick"><line class="recharts-cartesian-axis-tick-line" x1="${coords[i]}" y1="176" x2="${coords[i]}" y2="170"></line></g>`;
	// Convert's spare ticks: copies of the first, hidden, which the part shows when more ticks fit.
	const spares = (html: string) => html.replace('<g class="recharts-layer', '<g display="none" class="recharts-layer').repeat(4);
	const body = `<div data-slot="chart" data-mm-clock='[{"*":2024}]' style="width:300px;font:12px monospace"><div class="recharts-wrapper" style="position:relative;width:300px;height:200px" data-mm-chart="1"><svg class="recharts-surface" width="300" height="200" viewBox="0 0 300 200" data-mm-facts='${facts}'><g class="recharts-layer recharts-cartesian-axis recharts-xAxis xAxis"><g class="recharts-cartesian-axis-ticks recharts-xAxis-ticks"><g class="recharts-cartesian-axis-tick-lines recharts-xAxis-tick-lines">${shown.map(line).join('')}${spares(line(shown[0]!))}</g></g></g><g class="recharts-zIndex-layer_2000"><g class="recharts-cartesian-axis-tick-labels recharts-xAxis-tick-labels">${shown.map(tick).join('')}${spares(tick(shown[0]!))}</g></g></svg><div class="recharts-tooltip-wrapper" style="visibility:hidden"></div></div></div>`;
	const read = (page: Page) =>
		page.evaluate(() => ({
			labels: [...document.querySelectorAll('.recharts-xAxis-tick-labels > g:not([display="none"]) text')].map((t) => `${t.textContent}@${t.getAttribute('x')}`),
			lines: [...document.querySelectorAll('.recharts-xAxis-tick-lines > g:not([display="none"]) line')].map((l) => l.getAttribute('x1')),
		}));
	for (const zone of ['UTC', 'Asia/Tokyo']) {
		const page = await open(body, ['recharts', 'clock'], undefined, '', zone);
		await page.evaluate(() => (window as unknown as { mountParts: (a: string) => void }).mountParts('data-mm-chart'));
		await page.waitForTimeout(300);
		assert.deepEqual((await read(page)).labels, shown.map((i) => `${labels[i]}@${coords[i]}`), `${zone}: the capture's ticks`);
		await page.close();
	}
	const page = await open(body, ['recharts', 'clock'], undefined, '', 'America/Los_Angeles');
	await page.evaluate(() => (window as unknown as { mountParts: (a: string) => void }).mountParts('data-mm-chart'));
	await page.evaluate(() => (window as unknown as { mountParts: (a: string) => void }).mountParts('data-mm-clock'));
	const west = ['Mar 31', ...labels.slice(0, -1)];
	const widths = await page.evaluate((texts) => {
		const span = document.createElement('span');
		Object.assign(span.style, { position: 'absolute', top: '-20000px', whiteSpace: 'pre', fontSize: '12px' });
		document.body.appendChild(span);
		return texts.map((t) => ((span.textContent = t), span.getBoundingClientRect().width));
	}, west);
	const expected = preserveEnd(coords, widths, 0, 300, 8);
	assert.notDeepEqual(expected.map((e) => e.i), shown, 'the west dates keep other ticks');
	// The clock relabels the ticks a day earlier before the part lays them out again: wait for the layout, not the text.
	const want = expected.map((e) => `${west[e.i]}@${e.at}`).join(',');
	await page.waitForFunction((w) => [...document.querySelectorAll('.recharts-xAxis-tick-labels > g:not([display="none"]) text')].map((t) => `${t.textContent}@${t.getAttribute('x')}`).join(',') === w, want, { timeout: 5000 }).catch(() => {});
	const seen = await read(page);
	assert.deepEqual(seen.labels, expected.map((e) => `${west[e.i]}@${e.at}`));
	assert.deepEqual(seen.lines, expected.map((e) => String(coords[e.i])), 'each kept tick\'s line at its coordinate');
	await page.close();
});

test('capture: a chart\'s axes are read off React\'s current tree, not the stale fiber a DOM node may still point at', async () => {
	const page = await browser.newPage();
	await page.setContent('<svg class="recharts-surface"><g class="recharts-cartesian-axis"></g></svg>');
	const axes = await page.evaluate(`(() => {
		const chartModel = ${chartModel.toString()};
		const props = (n) => ({ ticks: Array.from({ length: n }, (_, i) => ({ coordinate: i, value: i })), orientation: 'bottom', tickFormatter: undefined, axisType: 'xAxis', x: 0, y: 0, width: 10, height: 10, viewBox: {} });
		// React's two trees: the root points at the current one; the axis' DOM node kept the fiber of the first render.
		const stale = { memoizedProps: props(91) };
		const fresh = { memoizedProps: props(8), alternate: stale };
		stale.alternate = fresh;
		const rootFresh = { child: fresh };
		const fiberRoot = { current: rootFresh };
		rootFresh.stateNode = fiberRoot;
		// A stale fiber's return can point into the current tree: only the walk from the root tells them apart.
		stale.return = rootFresh;
		fresh.return = rootFresh;
		document.querySelector('g')['__reactFiber$x'] = stale;
		return chartModel(document.querySelector('svg')).axes.map((a) => a && a.c.length);
	})()`);
	assert.deepEqual(axes, [8]);
	await page.close();
});

test('recharts: at a width the capture did not see, the drawing is laid out as recharts lays it out: band, whole-pixel bar size, ticks, grid and tooltip areas', async () => {
	// Captured at 400 x 200, plot box [10, 0, 380, 170]: four bands of 95 px; recharts' bar is 10% in from each side and
	// its size truncated, 76 px.
	const cats = ['Q1', 'Q2', 'Q3', 'Q4'];
	const band = (w: number) => (w - 20) / 4;
	const bar = (w: number, i: number) => ({ x: 10 + band(w) * i + band(w) * 0.1, width: Math.trunc(band(w) - 2 * band(w) * 0.1) });
	const heights = [100, 60, 140, 30];
	const rect = (x: number, y: number, w: number, h: number) => `M ${x},${y} h ${w} v ${h} h ${-w} Z`;
	const axis = { t: 'xAxis', o: 'bottom', box: [10, 170, 380, 30], vb: [0, 0, 400, 200], gap: 5, iv: 'preserveEnd', ts: 6, tm: 2, off: band(400) / 2, pad: [0, 0], c: cats.map((_, i) => 10 + band(400) * (i + 0.5)), l: cats };
	const segments = cats.map((_, i) => [10 + band(400) * i, 10 + band(400) * (i + 1), i]);
	const facts = JSON.stringify({ w: 400, h: 200, v: [10, 0, 380, 170], m: 'x', g: segments, sp: [0, 170], p: cats.map(() => [null, null]), a: [axis], b: { gap: 4, cat: '10%', groups: [{}] }, l: 'horizontal' });
	const bars = heights.map((h, i) => { const b = bar(400, i); return `<g class="recharts-layer recharts-bar-rectangle"><path class="recharts-rectangle" x="${b.x}" y="${170 - h}" width="${b.width}" height="${h}" radius="0" d="${rect(b.x, 170 - h, b.width, h)}" data-mm-geo='{"k":"bar"}'></path></g>`; }).join('');
	const grid = [0, 85, 170].map((y) => `<line x="10" y="0" width="380" height="170" x1="10" y1="${y}" x2="390" y2="${y}"></line>`).join('');
	const ticks = cats.map((c, i) => `<g class="recharts-layer recharts-cartesian-axis-tick-label"><text class="recharts-text recharts-cartesian-axis-tick-value" width="380" height="30" x="${axis.c[i]}" y="178" style="font-size:12px"><tspan x="${axis.c[i]}" dy="0.71em">${c}</tspan></text></g>`).join('');
	const svg = `<svg class="recharts-surface" width="400" height="200" viewBox="0 0 400 200" style="width:100%;height:100%" data-mm-facts='${facts}'><defs><clipPath id="c"><rect x="10" y="0" width="380" height="170"></rect></clipPath></defs><g class="recharts-cartesian-grid"><g class="recharts-cartesian-grid-horizontal">${grid}</g></g><g class="recharts-layer recharts-bar"><g class="recharts-layer recharts-bar-rectangles">${bars}</g></g><g class="recharts-layer recharts-cartesian-axis recharts-xAxis xAxis"><g class="recharts-cartesian-axis-ticks recharts-xAxis-ticks"></g></g><g class="recharts-zIndex-layer_2000"><g class="recharts-cartesian-axis-tick-labels recharts-xAxis-tick-labels">${ticks}</g></g></svg>`;
	const page = await open(`<div style="width:600px;height:200px"><div class="recharts-wrapper" style="position:relative;width:100%;height:100%" data-mm-chart="1">${svg}<div class="recharts-tooltip-wrapper" style="visibility:hidden"></div></div></div>`, ['recharts', 'clock']);
	await page.evaluate(() => (window as unknown as { mountParts: (a: string) => void }).mountParts('data-mm-chart'));
	await page.waitForFunction(() => document.querySelector('svg.recharts-surface')!.getAttribute('width') === '600', undefined, { timeout: 5000 }).catch(() => {});
	const seen = await page.evaluate(() => {
		const svg = document.querySelector('svg.recharts-surface')!;
		const attrs = (el: Element, names: string[]) => names.map((n) => el.getAttribute(n));
		return {
			svg: attrs(svg, ['width', 'height', 'viewBox']),
			clip: attrs(svg.querySelector('clipPath rect')!, ['x', 'y', 'width', 'height']),
			bars: [...svg.querySelectorAll('path.recharts-rectangle')].map((p) => attrs(p, ['x', 'y', 'width', 'height', 'd'])),
			grid: [...svg.querySelectorAll('.recharts-cartesian-grid-horizontal line')].map((l) => attrs(l, ['width', 'x1', 'x2', 'y1'])),
			ticks: [...svg.querySelectorAll('.recharts-xAxis-tick-labels text')].map((t) => `${t.textContent}@${t.getAttribute('x')}/${t.getAttribute('width')}`),
		};
	});
	assert.deepEqual(seen.svg, ['600', '200', '0 0 600 200']);
	assert.deepEqual(seen.clip, ['10', '0', '580', '170']);
	assert.deepEqual(seen.bars, heights.map((h, i) => { const b = bar(600, i); return [String(Math.round(b.x * 1e4) / 1e4), String(170 - h), String(b.width), String(h), rect(Math.round(b.x * 1e4) / 1e4, 170 - h, b.width, h)]; }), 'each band 145 px, its bar 116 px');
	assert.deepEqual(seen.grid, [0, 85, 170].map((y) => ['580', '10', '590', String(y)]));
	assert.deepEqual(seen.ticks, cats.map((c, i) => `${c}@${10 + band(600) * (i + 0.5)}/580`));
	// The pointer over the third band's middle at the new width picks its point.
	const picked = page.evaluate(() => new Promise<number>((resolve) => document.querySelector('.recharts-wrapper')!.addEventListener('mmchart', (e) => resolve((e as CustomEvent<number>).detail), { once: true })));
	const box = (await page.locator('svg.recharts-surface').boundingBox())!;
	await page.mouse.move(box.x + 10 + band(600) * 2.5, box.y + 100);
	assert.equal(await picked, 2);
	await page.close();
});

test('recharts: a switch moves the marks from the drawing that was on screen, not from the same state\'s drawing for another width', async () => {
	const { line, curveMonotoneX } = await import('d3-shape');
	type P = [number, number];
	const draw = (ps: readonly P[]) => line().curve(curveMonotoneX)(ps as P[])!;
	const shownA: P[] = [[10, 80], [60, 20], [110, 60]];
	const otherWidthA: P[] = [[10, 10], [30, 10], [50, 10]];
	const toB: P[] = [[10, 30], [60, 70], [110, 20]];
	const geo = JSON.stringify({ k: 'line', t: 'monotone', l: 'horizontal', a: [0, 1500, 'ease'] });
	const facts = JSON.stringify({ w: 200, h: 100, v: [5, 5, 190, 90], m: 'x', g: [], p: [], z: 0 });
	const svg = (ps: readonly P[], style: string, widths: string, cls = '') => `<svg class="recharts-surface ${cls}" width="200" height="100" style="${style}" data-mm-b="${widths}" data-mm-facts='${facts}'><path class="recharts-curve recharts-line-curve" d="${draw(ps)}" data-mm-geo='${geo}'></path></svg>`;
	// The first drawing is the same state at a width the container does not have (a container query hides it).
	const page = await open(`<style>.narrow{display:none!important}</style><div data-mm-morph><button>Mobile</button><div class="recharts-wrapper" style="position:relative;width:200px;height:100px" data-mm-chart="1">${svg(otherWidthA, 'display:block', '2 3', 'narrow')}${svg(shownA, 'display:block', '1 2')}${svg(toB, 'display: none;', '1 2 3')}<div class="recharts-tooltip-wrapper" style="visibility: hidden"></div></div></div>`, ['recharts']);
	await page.evaluate(() => (window as unknown as { mountParts: (a: string) => void }).mountParts('data-mm-chart'));
	await page.hover('button');
	await page.evaluate('import("/parts/recharts-motion.ts")');
	await page.waitForTimeout(50);
	const first = await page.evaluate(
		() =>
			new Promise<string>((resolve) => {
				const [a, b, c] = [...document.querySelectorAll('svg.recharts-surface')] as SVGSVGElement[];
				a!.setAttribute('style', 'display: none;');
				b!.setAttribute('style', 'display: none;');
				c!.setAttribute('style', 'display:block');
				queueMicrotask(() => resolve(c!.querySelector('path')!.getAttribute('d')!));
			}),
	);
	assert.equal(first, draw(shownA), 'the marks start where the drawing on screen had them');
	await page.close();
});

test('recharts: at another width, a LabelList label sits where getCartesianPosition puts it against its new bar, and the grid keeps the lines getTicks keeps', async () => {
	const band = (w: number) => (w - 20) / 2;
	const bar = (w: number, i: number) => ({ x: 10 + band(w) * i + band(w) * 0.1, width: Math.trunc(band(w) * 0.8) });
	const tops = [50, 110];
	const axis = { t: 'xAxis', o: 'bottom', box: [10, 170, 380, 30], vb: [0, 0, 400, 200], gap: 5, iv: 'preserveEnd', ts: 6, tm: 2, off: band(400) / 2, pad: [0, 0], c: [0, 1].map((i) => 10 + band(400) * (i + 0.5)), l: ['A', 'B'] };
	// Five grid lines at the drawing's capture, the tallest; a 70 px plot keeps three of them for a 16 px body font.
	const gy = [0, 0.25, 0.5, 0.75, 1];
	const facts = (h: number) => JSON.stringify({ w: 400, h, v: [10, 0, 380, h - 30], m: 'x', g: [], p: [], a: [{ ...axis, box: [10, h - 30, 380, 30], vb: [0, 0, 400, h] }], b: { gap: 4, cat: '10%', groups: [{}] }, l: 'horizontal', gy });
	const bars = tops.map((y, i) => { const b = bar(400, i); return `<g class="recharts-layer recharts-bar-rectangle"><path class="recharts-rectangle" x="${b.x}" y="${y}" width="${b.width}" height="${170 - y}" radius="0" d="M ${b.x},${y} h ${b.width} v ${170 - y} h ${-b.width} Z" data-mm-geo='{"k":"bar"}'></path></g>`; }).join('');
	const labels = tops.map((y, i) => { const b = bar(400, i); return `<text class="recharts-text" width="${b.width}" height="${y}" offset="12" x="${b.x + b.width / 2}" y="${y - 12}"><tspan x="${b.x + b.width / 2}" dy="0em">${i}</tspan></text>`; }).join('');
	const grid = gy.map((f) => `<line x="10" y="0" width="380" height="170" x1="10" y1="${170 - f * 170}" x2="390" y2="${170 - f * 170}"></line>`).join('');
	const svg = `<svg class="recharts-surface" width="400" height="200" viewBox="0 0 400 200" style="width:100%;height:100%" data-mm-facts='${facts(200)}'><g class="recharts-cartesian-grid"><g class="recharts-cartesian-grid-horizontal">${grid}</g></g><g class="recharts-layer recharts-bar" id="recharts-bar-x"><g class="recharts-layer recharts-bar-rectangles">${bars}</g></g><g class="recharts-layer recharts-label-list" data-mm-geo='{"k":"labels","s":"recharts-bar-x","p":"top","o":12}'>${labels}</g></svg>`;
	const page = await open(`<div id="box" style="width:600px;height:200px"><div class="recharts-wrapper" style="position:relative;width:100%;height:100%" data-mm-chart="1">${svg}<div class="recharts-tooltip-wrapper" style="visibility:hidden"></div></div></div>`, ['recharts', 'clock']);
	await page.evaluate(() => (window as unknown as { mountParts: (a: string) => void }).mountParts('data-mm-chart'));
	await page.waitForFunction(() => document.querySelector('svg.recharts-surface')!.getAttribute('width') === '600', undefined, { timeout: 5000 }).catch(() => {});
	const read = () => page.evaluate(() => ({
		labels: [...document.querySelectorAll('.recharts-label-list text')].map((t) => [t.getAttribute('x'), t.getAttribute('y'), t.getAttribute('width'), t.getAttribute('height'), t.querySelector('tspan')!.getAttribute('x')]),
		grid: [...document.querySelectorAll('.recharts-cartesian-grid-horizontal line:not([display="none"])')].map((l) => l.getAttribute('y1')),
	}));
	const wide = await read();
	assert.deepEqual(wide.labels, tops.map((y, i) => { const b = bar(600, i); const x = String(b.x + b.width / 2); return [x, String(y - 12), String(b.width), String(y), x]; }), 'top: the bar\'s middle, offset above it; clamped to its width and the room above');
	assert.deepEqual(wide.grid, gy.map((f) => String(170 - f * 170)), 'a tall plot keeps every line');
	// recharts' getTicks over the grid's ticks, each as tall as a line of the body's font, minTickGap 5 apart.
	await page.evaluate(() => (document.getElementById('box')!.style.height = '100px'));
	await page.waitForFunction(() => document.querySelector('svg.recharts-surface')!.getAttribute('height') === '100', undefined, { timeout: 5000 }).catch(() => {});
	const lineHeight = await page.evaluate(() => { const s = document.createElement('span'); s.textContent = '0'; s.style.position = 'absolute'; document.body.appendChild(s); return s.getBoundingClientRect().height; });
	// recharts' getTicksEnd for an axis whose ticks run up the plot (sign -1, from the bottom of the 100 px chart to its top).
	const coords = gy.map((f) => 70 - f * 70);
	const kept: number[] = [];
	let end = 0;
	for (let i = coords.length - 1; i >= 0; i--) {
		const c = coords[i]!;
		const over = -(c - lineHeight / 2 - end);
		const at = i === coords.length - 1 && over > 0 ? c + over : c;
		if (-at < -100 || -at > -end) continue;
		if (-(at + lineHeight / 2 - 100) >= 0 && -(at - lineHeight / 2 - end) <= 0) {
			kept.unshift(c);
			end = at + lineHeight / 2 + 5;
		}
	}
	const expected = [...kept, ...(kept.includes(0) ? [] : [0]), ...(kept.includes(70) ? [] : [70])];
	assert.ok(expected.length < 5, `a short plot keeps fewer lines (${expected})`);
	assert.deepEqual((await read()).grid, expected.map(String));
	await page.close();
});

test('recharts: at another width, a step line\'s corners stay halfway between its points, as curveStep draws them', async () => {
	const { line, curveStep } = await import('d3-shape');
	type P = [number, number];
	const xs = (w: number) => [10, 10 + (w - 20) / 2, w - 10];
	const ys = [150, 60, 110];
	const draw = (w: number) => line().curve(curveStep).digits(3)(xs(w).map((x, i) => [x, ys[i]!] as P))!;
	const axis = { t: 'xAxis', o: 'bottom', box: [10, 170, 380, 30], vb: [0, 0, 400, 200], gap: 5, iv: 'preserveEnd', ts: 6, tm: 2, off: 0, pad: [0, 0], c: xs(400), l: ['a', 'b', 'c'] };
	const facts = JSON.stringify({ w: 400, h: 200, v: [10, 0, 380, 170], m: 'x', g: [], p: [], a: [axis], l: 'horizontal' });
	const svg = `<svg class="recharts-surface" width="400" height="200" viewBox="0 0 400 200" style="width:100%;height:100%" data-mm-facts='${facts}'><path class="recharts-curve recharts-line-curve" d="${draw(400)}" data-mm-geo='{"k":"line","t":"step","l":"horizontal"}'></path><g class="recharts-layer recharts-cartesian-axis recharts-xAxis xAxis"></g></svg>`;
	const page = await open(`<div style="width:600px;height:200px"><div class="recharts-wrapper" style="position:relative;width:100%;height:100%" data-mm-chart="1">${svg}<div class="recharts-tooltip-wrapper" style="visibility:hidden"></div></div></div>`, ['recharts', 'clock']);
	await page.evaluate(() => (window as unknown as { mountParts: (a: string) => void }).mountParts('data-mm-chart'));
	await page.waitForFunction(() => document.querySelector('svg.recharts-surface')!.getAttribute('width') === '600', undefined, { timeout: 5000 }).catch(() => {});
	assert.equal(await page.locator('path.recharts-line-curve').getAttribute('d'), draw(600));
	await page.close();
});

test('recharts: behind UTC, ticks a formatter wrote with toLocaleDateString read as the visitor\'s page writes them, where no clock part does', async () => {
	const values = ['2024-07-15', '2024-07-16', '2024-07-17', '2024-07-18'];
	const utc = ['Mon', 'Tue', 'Wed', 'Thu'];
	const coords = [50, 150, 250, 350];
	const axis = { t: 'xAxis', o: 'bottom', box: [0, 170, 400, 30], vb: [0, 0, 400, 200], gap: 5, iv: 'preserveEnd', ts: 6, tm: 2, off: 50, pad: [0, 0], c: coords, l: utc, v: values, f: { weekday: 'short' }, lo: 'en-US' };
	const facts = JSON.stringify({ w: 400, h: 200, v: [0, 0, 400, 170], m: 'x', g: [], p: [], a: [axis], l: 'horizontal' });
	const tick = (i: number) => `<g class="recharts-layer recharts-cartesian-axis-tick-label"><text class="recharts-text recharts-cartesian-axis-tick-value" x="${coords[i]}" y="178" style="font-size:12px"><tspan x="${coords[i]}" dy="0.71em">${utc[i]}</tspan></text></g>`;
	const svg = `<svg class="recharts-surface" width="400" height="200" viewBox="0 0 400 200" style="width:100%;height:100%" data-mm-facts='${facts}'><g class="recharts-layer recharts-cartesian-axis recharts-xAxis xAxis"></g><g class="recharts-zIndex-layer_2000"><g class="recharts-cartesian-axis-tick-labels recharts-xAxis-tick-labels">${coords.map((_, i) => tick(i)).join('')}</g></g></svg>`;
	const body = `<div style="width:400px;height:200px"><div class="recharts-wrapper" style="position:relative;width:100%;height:100%" data-mm-chart="1">${svg}<div class="recharts-tooltip-wrapper" style="visibility:hidden"></div></div></div>`;
	const read = (page: Page) => page.evaluate(() => [...document.querySelectorAll('.recharts-xAxis-tick-labels text')].map((t) => t.textContent));
	const utcPage = await open(body, ['recharts', 'clock'], undefined, '', 'Asia/Tokyo');
	await utcPage.evaluate(() => (window as unknown as { mountParts: (a: string) => void }).mountParts('data-mm-chart'));
	await utcPage.waitForTimeout(300);
	assert.deepEqual(await read(utcPage), utc, 'east of UTC the capture stands');
	await utcPage.close();
	const page = await open(body, ['recharts', 'clock'], undefined, '', 'America/Los_Angeles');
	await page.evaluate(() => (window as unknown as { mountParts: (a: string) => void }).mountParts('data-mm-chart'));
	await page.waitForFunction(() => document.querySelector('.recharts-xAxis-tick-labels text')?.textContent === 'Sun', undefined, { timeout: 5000 }).catch(() => {});
	assert.deepEqual(await read(page), ['Sun', 'Mon', 'Tue', 'Wed']);
	await page.close();
	// In a chart whose tooltip dates the clock part writes (a region of fixed instants), weekdays alone are still the page's to write.
	const region = await open(`<div data-slot="chart" data-mm-clock='[{"*":2024}]'>${body}</div>`, ['recharts', 'clock'], undefined, '', 'America/Los_Angeles');
	await region.evaluate(() => (window as unknown as { mountParts: (a: string) => void }).mountParts('data-mm-chart'));
	await region.evaluate(() => (window as unknown as { mountParts: (a: string) => void }).mountParts('data-mm-clock'));
	await region.waitForFunction(() => document.querySelector('.recharts-xAxis-tick-labels text')?.textContent === 'Sun', undefined, { timeout: 5000 }).catch(() => {});
	assert.deepEqual(await read(region), ['Sun', 'Mon', 'Tue', 'Wed']);
	await region.close();
});

test('recharts: an RTL preview\'s language, as the site part sets it on the preview, picks the chart\'s drawing for that language', async () => {
	const svg = (style: string) => `<svg class="recharts-surface" width="200" height="100" style="${style}" data-mm-facts='{"w":200,"h":100,"v":[0,0,200,100],"m":"x","g":[],"p":[]}'></svg>`;
	const page = await open(`<div data-slot="component-preview"><div data-slot="preview" dir="rtl" data-lang="ar"><div class="recharts-wrapper" style="position:relative;width:200px;height:100px" data-mm-chart="1" data-mm-lang="">${svg('display:block')}<div class="recharts-tooltip-wrapper" style="visibility:hidden"></div></div></div></div>`, ['recharts']);
	await page.evaluate(() => {
		(window as unknown as { langs: string[] }).langs = [];
		document.querySelector('.recharts-wrapper')!.addEventListener('mmlang', (e) => (window as unknown as { langs: string[] }).langs.push((e as CustomEvent<string>).detail));
		(window as unknown as { mountParts: (a: string) => void }).mountParts('data-mm-chart');
	});
	await page.evaluate(() => {
		const preview = document.querySelector('[data-slot="preview"]')!;
		preview.setAttribute('dir', 'ltr');
		preview.removeAttribute('data-lang');
	});
	await page.waitForTimeout(50);
	await page.evaluate(() => {
		const preview = document.querySelector('[data-slot="preview"]')!;
		preview.setAttribute('dir', 'rtl');
		preview.setAttribute('data-lang', 'he');
	});
	await page.waitForTimeout(50);
	assert.deepEqual(await page.evaluate(() => (window as unknown as { langs: string[] }).langs), ['en', 'he'], 'English where the preview reads left to right, else its data-lang');
	await page.close();
});

test('recharts: on a page narrower than where the old card started otherwise, the card makes its choice through its select, and the chart does not move for it', async () => {
	const svg = (style: string, b: string) => `<svg class="recharts-surface" width="200" height="100" style="${style}" data-mm-b="${b}" data-mm-facts='{"w":200,"h":100,"v":[0,0,200,100],"m":"x","g":[],"p":[],"z":0}'><path class="recharts-curve recharts-line-curve" d="M0,50L200,50" data-mm-geo='{"k":"line","t":"linear","l":"horizontal","a":[0,1500,"ease"]}'></path></svg>`;
	// What the card's handler does on the choice: Markless shows the chosen drawing.
	const handler = `<script>window.seen = []; document.addEventListener('mmchoose', (e) => { window.seen.push(e.detail); const [a, b] = document.querySelectorAll('svg.recharts-surface'); a.setAttribute('style', 'display: none;'); b.setAttribute('style', 'display:block'); }, true);</script>`;
	const body = (w: number) => `${handler}<div data-mm-morph><button data-slot="select-trigger">Last 3 months</button><div class="recharts-wrapper" style="position:relative;width:200px;height:100px" data-mm-chart="1" data-mm-start='{"w":${w},"l":"Last 7 days"}'>${svg('display:block', '0')}${svg('display: none;', '0')}<div class="recharts-tooltip-wrapper" style="visibility:hidden"></div></div></div>`;
	for (const [w, expected] of [[1100, ['Last 7 days']], [768, []]] as const) {
		const page = await open(body(w), ['recharts']);
		await page.evaluate(() => (window as unknown as { mountParts: (a: string) => void }).mountParts('data-mm-chart'));
		await page.waitForTimeout(150);
		const seen = await page.evaluate(() => ({ seen: (window as unknown as { seen: string[] }).seen, moved: document.querySelector('.recharts-wrapper')!.hasAttribute('data-mm-moved') }));
		assert.deepEqual(seen.seen, expected, `the page is 1000 px wide; the card starts otherwise below ${w} px`);
		assert.equal(seen.moved, false, 'its entry animation plays for the chosen drawing');
		await page.close();
	}
});

test('recharts: a pie at another size is drawn as recharts draws it there: its centre, its percent radius and its fixed inner radius, its centre text', async () => {
	// Captured at 300 x 300, plot [5, 5, 290, 290]: outer radius 80% of 145, inner 60; an active sector 10 px past it.
	const geo = (ir: number, or: number, a0: number, a1: number) => JSON.stringify({ k: 'sector', r: [ir, or], a: [a0, a1], p: [60, '80%', '50%', '50%'] });
	const facts = JSON.stringify({ w: 300, h: 300, v: [5, 5, 290, 290], m: 'i', g: [[0, 0, 0], [1, 1, 1]], p: [[null, null], [null, null]], pl: [0, '80%', '50%', '50%'] });
	const svg = `<svg class="recharts-surface" width="300" height="300" viewBox="0 0 300 300" style="width:100%;height:100%" data-mm-facts='${facts}'><defs><clipPath id="c"><rect x="5" y="5" width="290" height="290"></rect></clipPath></defs><g class="recharts-layer recharts-pie"><g class="recharts-layer recharts-pie-sector"><path class="recharts-sector" cx="150" cy="150" d="M0,0" data-mm-geo='${geo(60, 126, 0, 90)}'></path></g><g class="recharts-layer recharts-pie-sector"><path class="recharts-sector" cx="150" cy="150" d="M0,0" data-mm-geo='${geo(60, 116, 90, 360)}'></path></g></g><text x="150" y="150"><tspan x="150" y="150">42</tspan><tspan x="150" y="174">Visitors</tspan></text></svg>`;
	const page = await open(`<div style="width:280px;height:280px"><div class="recharts-wrapper" style="position:relative;width:100%;height:100%" data-mm-chart="1">${svg}<div class="recharts-tooltip-wrapper" style="visibility:hidden"></div></div></div>`, ['recharts', 'clock']);
	await page.evaluate(() => (window as unknown as { mountParts: (a: string) => void }).mountParts('data-mm-chart'));
	await page.waitForFunction(() => document.querySelector('svg.recharts-surface')!.getAttribute('width') === '280', undefined, { timeout: 5000 }).catch(() => {});
	const seen = await page.evaluate(() => ({
		sectors: [...document.querySelectorAll('path.recharts-sector')].map((p) => [p.getAttribute('cx'), p.getAttribute('cy'), p.getAttribute('d')]),
		text: [...document.querySelectorAll('text, tspan')].map((t) => `${t.getAttribute('x')},${t.getAttribute('y')}`),
	}));
	// At 280 x 280 the plot is 270 square: centre 140, outer radius 0.8 * 135 = 108; the active sector 10 px past it.
	const nums = (d: string) => (d.match(/-?\d*\.?\d+/g) ?? []).map(Number);
	const [active, rest] = seen.sectors;
	assert.deepEqual(active!.slice(0, 2), ['140', '140']);
	assert.deepEqual(nums(active![2]!).slice(0, 4), [140 + 118, 140, 118, 118], 'the active sector starts at angle 0 on its 118 px arc');
	assert.ok(nums(rest![2]!).includes(108) && nums(rest![2]!).includes(60), 'the rest at 108 px, the inner radius kept at 60');
	assert.deepEqual(seen.text, ['140,140', '140,140', '140,164'], 'the centre text moves with the centre');
	await page.close();
});

test('recharts: a radar at another size scales what is inside its outer radius and keeps its axis labels as far past it', async () => {
	// Captured at 300 x 300, plot [5, 5, 290, 290]: centre 150, outer radius 80% of 145 = 116.
	const facts = JSON.stringify({ w: 300, h: 300, v: [5, 5, 290, 290], m: 'a', c: [150, 150], g: [[0, 360, 0]], sp: [0, 116], p: [[null, null]], q: [90], pl: [0, '80%', '50%', '50%'] });
	const svg = `<svg class="recharts-surface" width="300" height="300" viewBox="0 0 300 300" style="width:100%;height:100%" data-mm-facts='${facts}'><g class="recharts-polar-grid"><circle class="recharts-polar-grid-concentric-circle" cx="150" cy="150" r="116"></circle></g><g class="recharts-layer recharts-radar"><g class="recharts-layer recharts-radar-polygon"><path class="recharts-polygon" d="M150,92L208,150L150,150Z"></path></g></g><g class="recharts-layer recharts-polar-angle-axis"><g class="recharts-layer recharts-polar-angle-axis-ticks"><g class="recharts-layer recharts-polar-angle-axis-tick"><text class="recharts-text recharts-polar-angle-axis-tick-value" x="150" y="26"><tspan x="150" dy="0em">Jan</tspan></text></g></g></g></svg>`;
	const page = await open(`<div style="width:280px;height:280px"><div class="recharts-wrapper" style="position:relative;width:100%;height:100%" data-mm-chart="1">${svg}<div class="recharts-tooltip-wrapper" style="visibility:hidden"></div></div></div>`, ['recharts', 'clock']);
	await page.evaluate(() => (window as unknown as { mountParts: (a: string) => void }).mountParts('data-mm-chart'));
	await page.waitForFunction(() => document.querySelector('svg.recharts-surface')!.getAttribute('width') === '280', undefined, { timeout: 5000 }).catch(() => {});
	const seen = await page.evaluate(() => ({
		grid: ['cx', 'cy', 'r'].map((a) => document.querySelector('circle')!.getAttribute(a)),
		polygon: document.querySelector('path.recharts-polygon')!.getAttribute('d'),
		label: [document.querySelector('text')!.getAttribute('x'), document.querySelector('text')!.getAttribute('y'), document.querySelector('tspan')!.getAttribute('x')],
		facts: JSON.parse(document.querySelector('svg')!.getAttribute('data-mm-facts')!) as { c: number[]; sp: number[] },
	}));
	// At 280: centre 140, outer radius 108; the polygon's 58 px is half the radius, 54 px; the label 8 px past it.
	assert.deepEqual(seen.grid, ['140', '140', '108']);
	assert.equal(seen.polygon, 'M140,86L194,140L140,140Z');
	assert.deepEqual(seen.label, ['140', '24', '140']);
	assert.deepEqual(seen.facts.c, [140, 140]);
	assert.deepEqual(seen.facts.sp, [0, 108]);
	await page.close();
});

test('recharts: a card that started otherwise on the old page chooses once, on load, even where its chart is not scrolled to', async () => {
	const page = await open(`<script>window.chosen = []; document.addEventListener('mmchoose', (e) => window.chosen.push(e.detail), true);</script><div style="height:3000px"></div><div data-mm-morph><button data-slot="select-trigger">Last 3 months</button><div class="recharts-wrapper" data-mm-chart="1" data-mm-start='{"w":5000,"l":"Last 7 days"}'><svg class="recharts-surface"></svg></div></div>`, ['recharts']);
	await page.waitForFunction(() => (window as unknown as { chosen: string[] }).chosen.length > 0, undefined, { timeout: 5000 }).catch(() => {});
	assert.deepEqual(await page.evaluate(() => (window as unknown as { chosen: string[] }).chosen), ['Last 7 days'], 'chosen when the page is idle, the chart off screen');
	await page.evaluate(() => (window as unknown as { mountParts: (a: string) => void }).mountParts('data-mm-chart'));
	await page.waitForTimeout(100);
	assert.deepEqual(await page.evaluate(() => (window as unknown as { chosen: string[] }).chosen), ['Last 7 days'], 'not again when it scrolls into view');
	await page.close();
});

test('recharts: a card\'s select choice presses the button of the same text, which holds the card\'s one range', async () => {
	const page = await open(`<div data-mm-morph><button data-mm-variant="1" aria-checked="true" onclick="window.pressed.push('A')">Last 3 months</button><button data-mm-variant="2" aria-checked="false" onclick="window.pressed.push('B')">Last 30 days</button><button data-slot="select-trigger">Last 3 months</button><div class="recharts-wrapper" data-mm-chart="1"><svg class="recharts-surface"></svg></div></div><script>window.pressed = [];</script>`, ['recharts']);
	await page.evaluate(() => (window as unknown as { mountParts: (a: string) => void }).mountParts('data-mm-chart'));
	await page.evaluate(() => {
		const trigger = document.querySelector('[data-slot="select-trigger"]')!;
		for (const text of ['Last 30 days', 'Last 3 months', 'Last 7 days']) trigger.dispatchEvent(new CustomEvent('mmchoose', { bubbles: true, detail: text }));
	});
	assert.deepEqual(await page.evaluate(() => (window as unknown as { pressed: string[] }).pressed), ['B'], 'the button already pressed, or none of that text, is left');
	await page.close();
});

test('shadcn-ui site: the forms demo counts its description as it is typed, as its onChange set the length', async () => {
	const page = await open('<div data-slot="input-group"><textarea id="description" name="description"></textarea><div data-slot="input-group-addon"><span>0/100 characters</span></div></div>', ['site'], 'body');
	await page.locator('textarea').click();
	await page.keyboard.type('hi!');
	assert.equal(await page.locator('span').textContent(), '3/100 characters');
	await page.close();
});

test('shadcn-ui site: the RTL example\'s GPU count takes typed numbers from 1 to 99, puts anything else back, and its buttons step it and stop at the ends', async () => {
	const page = await open('<div data-slot="button-group"><input id="rtl-gpu-count" value="98"><button type="button" aria-label="decrease">-</button><button type="button" aria-label="increase">+</button></div>', ['site'], 'body');
	const input = page.locator('#rtl-gpu-count');
	const [minus, plus] = [page.locator('button').nth(0), page.locator('button').nth(1)];
	await plus.click();
	assert.equal(await input.inputValue(), '99');
	assert.equal(await plus.isDisabled(), true, 'at 99 the increase button is disabled');
	await input.click();
	await page.keyboard.press('End');
	await page.keyboard.type('x');
	assert.equal(await input.inputValue(), '99', 'a value out of range is put back');
	await input.fill('');
	assert.equal(await input.inputValue(), '99');
	await minus.click();
	assert.equal(await input.inputValue(), '98');
	assert.equal(await plus.isDisabled(), false);
	await page.close();
});

test('shadcn-ui site: the drawer demo\'s goal steps by 10 between 200 and 400, its buttons disabled at the ends', async () => {
	const page = await open('<div data-slot="drawer-content"><div><button type="button"><span class="sr-only">Decrease</span></button><div><div>390</div><div>Calories/day</div></div><button type="button"><span class="sr-only">Increase</span></button></div></div>', ['site'], 'body');
	const goal = page.getByText('390', { exact: true });
	await page.locator('button').nth(1).click();
	assert.equal(await page.locator('[data-slot=drawer-content] > div > div > div').first().textContent(), '400');
	assert.equal(await page.locator('button').nth(1).isDisabled(), true);
	await page.locator('button').nth(0).click();
	assert.equal(await page.locator('[data-slot=drawer-content] > div > div > div').first().textContent(), '390');
	void goal;
	await page.close();
});

test("Base UI RadioGroup: Home and End neither move focus nor choose, and are not prevented (the page scrolls); a group of another library's radios still goes to its ends", async () => {
	const group = (prefix: string) => `<div role="radiogroup">${['a', 'b', 'c'].map((v, i) => `<span role="radio" tabindex="${i === 1 ? 0 : -1}" id="${prefix}${v}" aria-checked="${i === 1}">${v}</span>`).join('')}</div>`;
	const page = await open(`${group('base-ui-')}${group('other-')}<div style="height:3000px"></div>`, ['toggle']);
	await page.evaluate(async () => {
		const part = '/parts/toggle.ts';
		const { radioKeys } = (await import(part)) as { radioKeys: (event: KeyboardEvent, choose: boolean) => void };
		for (const g of document.querySelectorAll('[role=radiogroup]')) g.addEventListener('keydown', (e) => radioKeys(e as KeyboardEvent, true));
		for (const r of document.querySelectorAll<HTMLElement>('[role=radio]')) r.addEventListener('click', () => { for (const o of r.parentElement!.children) o.setAttribute('aria-checked', String(o === r)); });
	});
	const state = () => page.evaluate(() => `${document.activeElement?.id} ${[...document.querySelectorAll('[role=radio][aria-checked=true]')].map((r) => r.id).join(',')}`);
	await page.locator('#base-ui-b').focus();
	await page.evaluate(() => window.addEventListener('keydown', (e) => ((window as unknown as { prevented: boolean }).prevented = e.defaultPrevented), { once: true }));
	await page.keyboard.press('End');
	await page.waitForTimeout(50);
	assert.equal(await state(), 'base-ui-b base-ui-b,other-b');
	assert.equal(await page.evaluate(() => (window as unknown as { prevented: boolean }).prevented), false, 'End is left to the page');
	await page.keyboard.press('Home');
	assert.equal(await state(), 'base-ui-b base-ui-b,other-b');
	await page.locator('#other-b').focus();
	await page.keyboard.press('End');
	assert.equal(await state(), 'other-c base-ui-b,other-c');
	await page.close();
});
