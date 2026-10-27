import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { chromium, type Browser, type Page } from 'playwright';
import ts from 'typescript';
import { cleanDocument, frameworkBuilds } from '../src/convert/clean.ts';
import { attr, body, find, parseDocument, walk } from '../src/convert/dom.ts';
import { markupPorts, QWIK_HANDLER_MARKS, useMarkupLibraries } from '../src/convert/parts.ts';
import { SelectPlan } from '../src/convert/stateful.ts';

// A Qwik UI select as Qwik serves it, cut to one item: the item's indicator host is empty and the check icon waits in
// the <q:template> after it, for Qwik to project once the item is selected.
const SELECT = `<div role="group" data-closed="" data-qui-select-root class="select"><div id="s1-label">Fruit</div><button id="s1-trigger" aria-haspopup="listbox" aria-controls="s1-panel" aria-expanded="false" data-closed="" q:id="4" on:click="q-a.js#s_b"><span id="s1-value" data-closed="" data-value>Pick one</span></button><div id="s1-root"><div hidden data-floating="absolute" id="s1-panel" data-closed="" role="listbox" popover="manual"><div id="s1-0" tabIndex="-1" data-item role="option" aria-selected="false"><span tabIndex="-1">Apple</span><span aria-hidden="true"></span><q:template q:slot hidden aria-hidden="true"><svg data-icon viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"></polyline></svg></q:template></div></div></div></div>`;
const page = (inner: string) => `<!DOCTYPE html><html q:container="paused" q:base="/build/"><head></head><body>${inner}</body></html>`;

test("content Qwik keeps for a slot it has not projected goes into its host, hidden, for a part to show", () => {
	const html = page(SELECT);
	const doc = parseDocument(html);
	cleanDocument(doc, { builds: frameworkBuilds(html).map((b) => b.path), frameworkScripts: new Set(), origin: 'http://old' }, new Map());
	assert.equal(find(doc, (el) => el.tagName === 'q:template'), undefined);
	const host = find(doc, (el) => el.tagName === 'span' && attr(el, 'aria-hidden') === 'true')!;
	const svg = find(host, (el) => el.tagName === 'svg');
	assert.ok(svg, 'the icon is in its host');
	assert.equal(attr(svg!, 'hidden'), '', 'and hidden until the item is selected');
	assert.equal(attr(svg!, 'aria-hidden'), undefined);
});

test("a Qwik UI select's shown value is Markless state its trigger's mmchoose sets", () => {
	const doc = parseDocument(page(SELECT));
	const plan = new SelectPlan();
	assert.equal(plan.add(body(doc), () => false), 1);
	const trigger = find(doc, (el) => attr(el, 'id') === 's1-trigger')!;
	const value = find(doc, (el) => attr(el, 'id') === 's1-value')!;
	assert.match(plan.bind(trigger)!.extra!.join(' '), /onMmchoose=/);
	assert.equal(plan.bind(value)!.children, '{sel0}');
	assert.match(plan.bind(value)!.declare!.join(' '), /state\("Pick one"\)/);
});

test('Qwik UI parts are placed by their own markup, only on a site whose source imports @qwik-ui/headless', () => {
	const doc = parseDocument(page(`<div data-qui-tabs-root><div role="tablist"></div></div>${SELECT}<div data-accordion><div data-collapsible id="c1"></div></div><dialog id="m1-root"></dialog><div data-qui-dropdown></div>`));
	const placed = () => [...new Set([...walk(doc)].flatMap((el) => markupPorts(el)))].sort();
	useMarkupLibraries([]);
	assert.deepEqual(placed(), []);
	useMarkupLibraries(['@qwik-ui/headless']);
	assert.deepEqual(placed(), ['qwik-ui/collapsible', 'qwik-ui/dropdown', 'qwik-ui/modal', 'qwik-ui/select', 'qwik-ui/tabs']);
	useMarkupLibraries([]);
});

// The ports run as the app runs them: parts/index.ts delegating every event to a registry of ports, in a real browser.
const PARTS = join(import.meta.dirname, '..', 'parts');
const FLOATING_STUB = `export const computePosition = async () => ({ x: 0, y: 0, placement: 'bottom', middlewareData: {} });
export const autoUpdate = () => () => {};
export const arrow = () => ({}), flip = () => ({}), hide = () => ({}), offset = () => ({}), shift = () => ({});`;

let browser: Browser;
before(async () => {
	browser = await chromium.launch();
});
after(async () => {
	await browser?.close();
});

async function open(markup: string, ports: readonly string[]): Promise<Page> {
	const p = await browser.newPage({ viewport: { width: 1000, height: 800 } });
	const registry = `${ports.map((m, i) => `import * as p${i} from './${m}.ts';`).join('\n')}\nexport const PARTS = [${ports.map((_, i) => `p${i}`).join(', ')}];`;
	await p.route('http://parts.test/**', async (route) => {
		const path = new URL(route.request().url()).pathname;
		if (path === '/') return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html><head><script type="importmap">{"imports":{"@floating-ui/dom":"/floating.js"}}</script><style>[hidden]{display:none!important}[role=listbox][data-closed]{display:none}</style></head><body>${markup}<script type="module">import { behave, listen } from '/parts/index.ts'; listen(); window.ready = true;</script></body></html>` });
		if (path === '/floating.js') return route.fulfill({ contentType: 'text/javascript', body: FLOATING_STUB });
		if (path === '/parts/choices.ts') return route.fulfill({ contentType: 'text/javascript', body: 'export const CHOICES = {};' });
		const text = path === '/parts/registry.ts' ? registry : await readFile(join(PARTS, path.replace(/^\/parts\//, '')), 'utf8');
		return route.fulfill({ contentType: 'text/javascript', body: ts.transpileModule(text, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText });
	});
	await p.goto('http://parts.test/');
	await p.waitForFunction(() => (window as unknown as { ready?: boolean }).ready);
	return p;
}

const attrs = (p: Page, selector: string, names: readonly string[]) => p.locator(selector).evaluate((el, n) => Object.fromEntries(n.map((a) => [a, el.getAttribute(a)])), names);
const focused = (p: Page) => p.evaluate(() => document.activeElement?.id || document.activeElement?.textContent?.trim() || '');

const TABS = `<div data-qui-tabs-root><div role="tablist"><button type="button" role="tab" id="t_a" aria-controls="p_a" aria-selected="true" data-state="selected" tabindex="0" class="tab selected bold">A</button><button type="button" role="tab" id="t_b" aria-controls="p_b" aria-selected="false" data-state="unselected" tabindex="-1" class="tab">B</button><button type="button" role="tab" id="t_c" aria-selected="false" data-state="unselected" tabindex="-1" class="tab">C</button></div><div role="tabpanel" id="p_a" tabindex="0">one</div><div role="tabpanel" id="p_b" tabindex="0" hidden>two</div><div role="tabpanel" id="p_c" tabindex="0" hidden>three</div></div>`;

test('tabs: a click selects, with the classes the old page gave the selected tab; arrows only move focus, wrapping', async () => {
	const p = await open(TABS, ['qwik-ui/tabs']);
	await p.click('#t_b');
	assert.deepEqual(await attrs(p, '#t_b', ['aria-selected', 'data-state', 'tabindex', 'class']), { 'aria-selected': 'true', 'data-state': 'selected', tabindex: '0', class: 'tab selected bold' });
	assert.deepEqual(await attrs(p, '#t_a', ['aria-selected', 'data-state', 'tabindex', 'class']), { 'aria-selected': 'false', 'data-state': 'unselected', tabindex: '-1', class: 'tab' });
	assert.deepEqual(await p.evaluate(() => [...document.querySelectorAll('[role=tabpanel]')].map((e) => (e as HTMLElement).hidden)), [true, false, true]);
	await p.keyboard.press('ArrowRight');
	assert.equal(await focused(p), 't_c');
	await p.keyboard.press('ArrowRight');
	assert.equal(await focused(p), 't_a', 'wraps past the last tab');
	assert.equal(await p.getAttribute('#t_b', 'aria-selected'), 'true', 'moving focus selects nothing');
	await p.keyboard.press('End');
	assert.equal(await focused(p), 't_c');
	await p.keyboard.press('Enter');
	assert.equal(await p.getAttribute('#t_c', 'aria-selected'), 'true');
	await p.close();
});

const SELECT_PAGE = `<div role="group" data-closed="" data-qui-select-root><div id="s1-label">Fruit</div><button id="s1-trigger" aria-haspopup="listbox" aria-controls="s1-panel" aria-expanded="false" data-closed=""><span id="s1-value" data-closed="" data-value>Pick one</span></button><div id="s1-root"><div hidden data-floating="absolute" id="s1-panel" data-closed="" role="listbox" popover="manual">${['Apple', 'Banana', 'Blueberry'].map((f, i) => `<div id="s1-${i}" tabindex="-1" data-item role="option" aria-selected="false" aria-disabled="false"><span tabindex="-1">${f}</span><span aria-hidden="true"><svg hidden viewBox="0 0 1 1"></svg></span></div>`).join('')}</div></div></div><button id="after">after</button>`;

test('select: opens on click with the first item highlighted and focused, arrows move, Enter chooses and closes', async () => {
	const p = await open(SELECT_PAGE, ['qwik-ui/select']);
	const chosen = p.evaluate(() => new Promise<string>((done) => document.addEventListener('mmchoose', (e) => done((e as CustomEvent<string>).detail))));
	await p.click('#s1-trigger');
	assert.deepEqual(await attrs(p, '#s1-trigger', ['aria-expanded', 'data-open', 'data-closed']), { 'aria-expanded': 'true', 'data-open': '', 'data-closed': null });
	assert.equal(await p.locator('#s1-panel').evaluate((el) => el.matches(':popover-open') && !(el as HTMLElement).hidden), true);
	assert.equal(await focused(p), 's1-0');
	assert.equal(await p.getAttribute('#s1-0', 'data-highlighted'), '');
	await p.keyboard.press('ArrowDown');
	assert.equal(await focused(p), 's1-1');
	await p.keyboard.press('ArrowDown');
	await p.keyboard.press('ArrowDown');
	assert.equal(await focused(p), 's1-2', 'no looping by default');
	await p.keyboard.press('Enter');
	assert.equal(await chosen, 'Blueberry');
	assert.deepEqual(await attrs(p, '#s1-2', ['aria-selected', 'data-selected']), { 'aria-selected': 'true', 'data-selected': '' });
	assert.equal(await p.locator('#s1-2 svg').evaluate((e) => (e as unknown as HTMLElement).hidden), false, "the chosen item's indicator shows");
	assert.equal(await p.locator('#s1-0 svg').evaluate((e) => (e as unknown as HTMLElement).hidden), true);
	assert.equal(await p.getAttribute('#s1-trigger', 'aria-expanded'), 'false');
	assert.equal(await focused(p), 's1-trigger');
	await p.close();
});

test('select: typing on the closed trigger chooses by text, the same letter again the next match; a press outside closes', async () => {
	const p = await open(SELECT_PAGE, ['qwik-ui/select']);
	await p.focus('#s1-trigger');
	await p.keyboard.press('b');
	assert.equal(await p.getAttribute('#s1-1', 'aria-selected'), 'true');
	await p.keyboard.press('b');
	assert.equal(await p.getAttribute('#s1-2', 'aria-selected'), 'true');
	assert.equal(await p.getAttribute('#s1-trigger', 'aria-expanded'), 'false');
	await p.click('#s1-trigger');
	await p.mouse.click(900, 700);
	assert.equal(await p.getAttribute('#s1-trigger', 'aria-expanded'), 'false');
	await p.close();
});

const ACCORDION = `<div data-accordion>${[1, 2].map((n) => `<div data-collapsible id="i${n}" data-closed=""><h3><button id="i${n}-trigger" aria-controls="i${n}-content" aria-expanded="false" data-closed="">Item ${n}</button></h3><div id="i${n}-content" data-collapsible-content role="region" hidden>Body ${n}</div></div>`).join('')}</div>`;

test('accordion: one item open at a time; the content height is measured for its animation; Down moves between triggers', async () => {
	const p = await open(ACCORDION, ['qwik-ui/collapsible']);
	await p.click('#i1-trigger');
	assert.deepEqual(await attrs(p, '#i1', ['data-open', 'data-closed']), { 'data-open': '', 'data-closed': null });
	assert.equal(await p.locator('#i1-content').evaluate((e) => (e as HTMLElement).hidden), false);
	assert.match((await p.getAttribute('#i1-content', 'style')) ?? '', /--qwikui-collapsible-content-height: \d+px/);
	await p.click('#i2-trigger');
	assert.equal(await p.getAttribute('#i1-trigger', 'aria-expanded'), 'false');
	assert.equal(await p.locator('#i1-content').evaluate((e) => (e as HTMLElement).hidden), true);
	assert.equal(await p.getAttribute('#i2-trigger', 'aria-expanded'), 'true');
	await p.keyboard.press('ArrowDown');
	assert.equal(await focused(p), 'i1-trigger', 'wraps to the first trigger');
	await p.close();
});

const MODAL = `<div><button aria-haspopup="dialog" aria-expanded="false" data-closed="">Open</button><dialog id="m1-root" data-state="closed" data-closed=""><h2 id="m1-title">Title</h2><input id="name"><button type="button" data-mm-close>Close</button></dialog></div><div style="height:3000px"></div>`;

test('modal: opens modal and locks the page, Tab stays inside, Escape and its close button close it', async () => {
	const p = await open(MODAL, ['qwik-ui/modal']);
	await p.getByText('Open').click();
	assert.equal(await p.locator('dialog').evaluate((d) => (d as HTMLDialogElement).open && d.matches(':modal')), true);
	assert.deepEqual(await attrs(p, 'dialog', ['data-state', 'data-open']), { 'data-state': 'open', 'data-open': '' });
	assert.equal(await p.evaluate(() => document.body.hasAttribute('data-noscroll-target-scroll-disabled') && getComputedStyle(document.body).overflow), 'hidden');
	assert.equal(await focused(p), 'name');
	await p.keyboard.press('Tab');
	await p.keyboard.press('Tab');
	assert.equal(await focused(p), 'name', 'Tab wraps inside the dialog');
	await p.keyboard.press('Escape');
	assert.equal(await p.locator('dialog').evaluate((d) => (d as HTMLDialogElement).open), false);
	assert.equal(await p.evaluate(() => document.body.hasAttribute('data-noscroll-target-scroll-disabled')), false);
	await p.getByText('Open').click();
	await p.getByText('Close').click();
	assert.equal(await p.getAttribute('dialog', 'data-state'), 'closed');
	await p.close();
});

test("Qwik's manifest names each handler's source: a library handler a port needs marks its element, the site's own are named", () => {
	const html = page(`<dialog id="m1-root"><button type="button" on:click="q-Ab.js#s_close[0]">x</button><button on:click="q-Cd.js#s_theme">Dark</button><button on:click="q-Ef.js#s_other">Other</button></dialog>`);
	const doc = parseDocument(html);
	const symbols = new Map([
		['s_close', { origin: '../../../packages/kit-headless/src/components/modal/modal-close.tsx', name: 'modal-close.tsx_HModalClose_component_handleClick' }],
		['s_theme', { origin: 'components/header/header.tsx', name: 'header.tsx_DarkModeToggle_component_Button_onClick' }],
		['s_other', { origin: '../../../node_modules/some-lib/x.tsx', name: 'x.tsx_thing' }],
	]);
	cleanDocument(doc, { builds: frameworkBuilds(html).map((b) => b.path), frameworkScripts: new Set(), origin: 'http://old', qwik: { symbols, marks: QWIK_HANDLER_MARKS } }, new Map());
	const [close, theme, other] = [...walk(doc)].filter((el) => el.tagName === 'button');
	assert.equal(attr(close!, 'data-mm-close'), '');
	assert.equal(attr(close!, 'data-mm-qwik'), undefined, "a library's handler is the port's, not the site's");
	assert.equal(attr(theme!, 'data-mm-qwik'), 'click:header.tsx_DarkModeToggle_component_Button_onClick');
	assert.equal(attr(other!, 'data-mm-qwik'), undefined);
	assert.equal(attr(close!, 'on:click'), undefined);
});

test("a site handler's captured strings come from the page's paused state, so its part knows what each control applies", () => {
	const state = JSON.stringify({ refs: { '3l': '9m fp 0', '3n': '9n fp 0' }, ctx: {}, objs: Object.assign(new Array(400).fill(''), { [parseInt('9m', 36)]: 'base-slate', [parseInt('9n', 36)]: 'base-gray', [parseInt('fp', 36)]: { themeSig: '9h' }, 0: '\u0012fr' }) });
	const html = page(`<button q:id="3l" on:click="q-A.js#s_base">a</button><button q:id="3n" on:click="q-A.js#s_base">b</button><script type="qwik/json">${state}</script>`);
	const doc = parseDocument(html);
	const symbols = new Map([['s_base', { origin: 'components/make-it-yours/make-it-yours.tsx', name: 'make-it-yours.tsx_make_it_yours_component_div_div_Button_onClick' }]]);
	cleanDocument(doc, { builds: frameworkBuilds(html).map((b) => b.path), frameworkScripts: new Set(), origin: 'http://old', qwik: { symbols, marks: QWIK_HANDLER_MARKS } }, new Map());
	const [a, b] = [...walk(doc)].filter((el) => el.tagName === 'button');
	assert.equal(attr(a!, 'data-mm-qwik-captures'), '["base-slate"]');
	assert.equal(attr(b!, 'data-mm-qwik-captures'), '["base-gray"]');
	assert.equal(attr(a!, 'q:id'), undefined);
});

const GROUP = `<div role="group" data-qui-togglegroup-root data-orientation="horizontal" dir="ltr">${['L', 'C', 'R'].map((x, i) => `<button type="button" data-qui-togglegroup-item id="g${x}" aria-pressed="false" aria-disabled="false" tabindex="${i ? -1 : 0}">${x}</button>`).join('')}</div>`;

test('toggle group: arrows move focus along the orientation without pressing, stopping at the ends', async () => {
	const p = await open(GROUP, ['qwik-ui/toggle-group']);
	await p.focus('#gL');
	await p.keyboard.press('ArrowRight');
	assert.equal(await focused(p), 'gC');
	await p.keyboard.press('ArrowDown');
	assert.equal(await focused(p), 'gC', 'Down does nothing horizontally');
	await p.keyboard.press('ArrowRight');
	await p.keyboard.press('ArrowRight');
	assert.equal(await focused(p), 'gR', 'no wrapping without loop');
	assert.equal(await p.getAttribute('#gR', 'aria-pressed'), 'false');
	await p.close();
});

const CAROUSEL = `<div role="group" data-qui-carousel aria-roledescription="carousel" slidesperview="1" move="1"><div data-qui-carousel-viewport style="overflow:hidden;width:200px"><div data-qui-carousel-scroller data-align="start" style="display:flex;gap:10px;transition:none">${[0, 1, 2].map((i) => `<div data-qui-carousel-slide id="k-${i}" aria-roledescription="slide" style="flex:0 0 200px;height:50px"${i ? ' inert' : ' data-active'}>${i}</div>`).join('')}</div></div><button data-qui-carousel-prev aria-label="previous slide" disabled aria-disabled="true">prev</button><button data-qui-carousel-next aria-label="next slide">next</button><div role="tablist">${[0, 1, 2].map((i) => `<button role="tab" aria-label="Slide ${i + 1}" aria-controls="k-${i}" tabindex="${i ? -1 : 0}"${i ? '' : ' data-active aria-selected="true"'}>${i}</button>`).join('')}</div></div>`;

test('carousel: Next moves the track one slide and its gap, marks the slide active and the bullet selected; it stops at the end', async () => {
	const p = await open(CAROUSEL, ['qwik-ui/carousel']);
	await p.getByText('next').click();
	assert.equal(await p.locator('[data-qui-carousel-scroller]').evaluate((e) => (e as HTMLElement).style.transform), 'translate3d(-210px, 0px, 0px)');
	assert.equal(await p.locator('#k-1').evaluate((e) => e.hasAttribute('data-active') && !(e as HTMLElement).inert), true);
	assert.equal(await p.locator('#k-0').evaluate((e) => (e as HTMLElement).inert), true);
	assert.equal(await p.getByRole('tab', { name: 'Slide 2' }).getAttribute('aria-selected'), 'true');
	assert.equal(await p.getByText('prev').isDisabled(), false);
	await p.getByText('next').click();
	assert.equal(await p.getByText('next').isDisabled(), true, 'Next is disabled at the last stop');
	await p.getByRole('tab', { name: 'Slide 1' }).click();
	assert.equal(await p.locator('[data-qui-carousel-scroller]').evaluate((e) => (e as HTMLElement).style.transform), 'translate3d(0px, 0px, 0px)');
	await p.close();
});
