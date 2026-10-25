import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { chromium, type Browser, type Page } from 'playwright';
import ts from 'typescript';
import { atRest } from '../src/convert/at-rest.ts';
import { body as bodyOf, outer, parseDocument, walk } from '../src/convert/dom.ts';

// The ports run as the app runs them: parts/index.ts delegating every event to a registry of ports, in a real browser.
const PARTS = join(import.meta.dirname, '..', 'parts');
// Placement is not under test here; the ports only need @floating-ui/dom's functions to exist.
const FLOATING_STUB = `export const computePosition = async () => ({ x: 0, y: 0, placement: 'bottom', middlewareData: {} });
export const autoUpdate = () => () => {};
export const arrow = () => ({}), flip = () => ({}), hide = () => ({}), limitShift = () => ({}), offset = () => ({}), shift = () => ({}), size = () => ({});`;

let browser: Browser;
before(async () => {
	browser = await chromium.launch();
});
after(async () => {
	await browser.close();
});

// `deliver`: also hand every event to the parts from the body's or the window's capture phase, as a Markless page delegates
// them, before the event reaches the document listener.
async function open(body: string, ports: readonly string[], deliver?: 'body' | 'window'): Promise<Page> {
	const page = await browser.newPage({ viewport: { width: 1000, height: 800 } });
	const registry = `${ports.map((p, i) => `import * as p${i} from './${p}.ts';`).join('\n')}\nexport const PARTS = [${ports.map((_, i) => `p${i}`).join(', ')}];`;
	await page.route('http://parts.test/**', async (route) => {
		const path = new URL(route.request().url()).pathname;
		if (path === '/') return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html><head><script type="importmap">{"imports":{"@floating-ui/dom":"/floating.js"}}</script><style>*{box-sizing:border-box}body{margin:0;font:16px sans-serif}</style></head><body>${body}<script>window.pointerLog = []; for (const type of ['pointerover', 'pointermove']) document.addEventListener(type, (e) => { const t = e.target; window.pointerLog.push(type + '@' + Math.round(e.clientX) + ',' + Math.round(e.clientY) + ':' + (t.tagName || '') + '.' + (t.getAttribute && t.getAttribute('class') || '')); }, true);</script><script type="module">import { behave, listen, mount } from '/parts/index.ts'; listen(); ${deliver ? `for (const type of ['click', 'keydown', 'pointerover', 'pointerout', 'pointerdown', 'focusin', 'focusout']) ${deliver === 'body' ? 'document.body' : 'window'}.addEventListener(type, behave, true);` : ''} window.mountParts = mount; window.ready = true;</script></body></html>` });
		if (path === '/floating.js') return route.fulfill({ contentType: 'text/javascript', body: FLOATING_STUB });
		const text = path === '/parts/registry.ts' ? registry : await readFile(join(PARTS, path.replace(/^\/parts\//, '')), 'utf8');
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
	await page.keyboard.press('Escape');
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

test('Base UI dialog locks scroll as @base-ui/utils does: a stable gutter on <html>, the body not scrolling, both put back on close', async () => {
	const page = await open(
		`<main style="height:3000px"><button data-slot="dialog-trigger" data-base-ui-click-trigger aria-haspopup="dialog" aria-expanded="false" id="dlg" type="button">Open Dialog</button></main>
		<div data-mm-layer="dlg" hidden data-base-ui-portal><div data-slot="dialog-overlay"></div><div role="dialog" data-slot="dialog-content" data-closed tabindex="-1"><button data-slot="dialog-close">Close</button></div></div>`,
		['base-ui/dialog'],
	);
	await page.getByText('Open Dialog').click();
	assert.deepEqual(await page.evaluate(() => [document.documentElement.style.scrollbarGutter, document.body.style.overflowY, document.documentElement.style.paddingRight]), ['stable', 'hidden', '']);
	await page.getByText('Close').click();
	assert.deepEqual(await page.evaluate(() => [document.documentElement.style.scrollbarGutter, document.body.style.overflowY]), ['', '']);
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
