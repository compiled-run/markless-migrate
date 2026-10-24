import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { chromium, type Browser, type Page } from 'playwright';
import ts from 'typescript';

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

async function open(body: string, ports: readonly string[]): Promise<Page> {
	const page = await browser.newPage({ viewport: { width: 1000, height: 800 } });
	const registry = `${ports.map((p, i) => `import * as p${i} from './${p}.ts';`).join('\n')}\nexport const PARTS = [${ports.map((_, i) => `p${i}`).join(', ')}];`;
	await page.route('http://parts.test/**', async (route) => {
		const path = new URL(route.request().url()).pathname;
		if (path === '/') return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html><head><script type="importmap">{"imports":{"@floating-ui/dom":"/floating.js"}}</script><style>*{box-sizing:border-box}body{margin:0;font:16px sans-serif}</style></head><body>${body}<script>window.pointerLog = []; for (const type of ['pointerover', 'pointermove']) document.addEventListener(type, (e) => { const t = e.target; window.pointerLog.push(type + '@' + Math.round(e.clientX) + ',' + Math.round(e.clientY) + ':' + (t.tagName || '') + '.' + (t.getAttribute && t.getAttribute('class') || '')); }, true);</script><script type="module">import { listen } from '/parts/index.ts'; import { mount } from '/parts/index.ts'; listen(); window.mountParts = mount; window.ready = true;</script></body></html>` });
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
function carousel(options: { basis?: string; align?: string; vertical?: boolean; autoplay?: number } = {}): string {
	const slides = Array.from({ length: 5 }, (_, i) => `<div role="group" aria-roledescription="slide" data-slot="carousel-item" style="min-width:0;flex:0 0 ${options.basis ?? '100%'};${options.vertical ? 'padding-top:16px;height:100px' : 'padding-left:16px'}"><div style="height:${options.vertical ? '84px' : '200px'};border:1px solid">${i + 1}</div></div>`).join('');
	return `<div style="padding:80px"><div role="region" aria-roledescription="carousel" data-slot="carousel" style="position:relative;width:300px"${options.align ? ` data-mm-align="${options.align}"` : ''}${options.autoplay ? ` data-mm-autoplay="${options.autoplay}"` : ''}>
	<div data-slot="carousel-content" style="overflow:hidden;${options.vertical ? 'height:200px' : ''}"><div style="display:flex;${options.vertical ? 'flex-direction:column;margin-top:-16px;height:216px' : 'margin-left:-16px'};transform:translate3d(0px, 0px, 0px)">${slides}</div></div>
	<button data-slot="carousel-previous" disabled style="position:absolute;left:-48px;top:0">Previous slide</button>
	<button data-slot="carousel-next" style="position:absolute;right:-48px;top:0">Next slide</button></div></div>`;
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

test('carousel: with Autoplay it steps on its own every delay', async () => {
	const page = await open(carousel({ autoplay: 400 }), ['carousel']);
	await page.evaluate(() => (window as unknown as { mountParts: (a: string) => void }).mountParts('data-mm-autoplay'));
	await page.waitForTimeout(1500);
	assert.ok(x(await transformOf(page)) <= -316, await transformOf(page));
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
