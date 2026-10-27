// The Base UI NavigationMenu port on markup as convert renders it, driven through parts/index.ts in a real browser,
// against what @base-ui/react 1.6 (NavigationMenuTrigger, its focus guards, the list and content CompositeRoots) does.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { chromium, type Browser, type Page } from 'playwright';
import ts from 'typescript';
import { registryModule } from '../src/convert/parts.ts';

const PARTS = join(import.meta.dirname, '..', 'parts');
const FLOATING_STUB = `export const computePosition = async () => ({ x: 0, y: 0, placement: 'bottom', middlewareData: {} });
export const autoUpdate = () => () => {};
export const arrow = () => ({}), flip = () => ({}), hide = () => ({}), limitShift = () => ({}), offset = () => ({}), shift = () => ({}), size = () => ({});`;

let browser: Browser;
before(async () => {
	browser = await chromium.launch();
});
after(() => browser.close());

// The registry is convert's: the ports in module order.
async function open(body: string, ports: readonly string[]): Promise<Page> {
	const page = await browser.newPage({ viewport: { width: 1000, height: 800 } });
	const registry = registryModule(ports, '.');
	await page.route('http://parts.test/**', async (route) => {
		const path = new URL(route.request().url()).pathname;
		if (path === '/') return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html><head><script type="importmap">{"imports":{"@floating-ui/dom":"/floating.js"}}</script><style>*{box-sizing:border-box}body{margin:0;font:16px sans-serif}[hidden]{display:none!important}[role=option]{height:30px}</style></head><body>${body}<script type="module">import { behave, listen } from '/parts/registry.ts'; listen(); for (const type of ['click', 'keydown', 'pointerover', 'pointerout', 'pointerdown', 'focusin', 'focusout', 'input']) document.body.addEventListener(type, behave, true); window.ready = true;</script></body></html>` });
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

// shadcn's NavigationMenu on Base UI as convert renders it: triggers keyed to their portal (positioner > nav popup with
// the viewport's focus guard > content), a plain link in the list, and what follows the menu on the page.
const content = (key: string, links: readonly string[]) => `<div data-base-ui-portal hidden data-mm-layer="${key}"><div data-side="bottom" data-align="start" role="presentation" style="position:absolute;left:0;top:300px" data-closed><nav id="${key}-popup" tabindex="-1" data-closed><span aria-hidden="true" tabindex="0" data-base-ui-focus-guard style="position:fixed;width:1px;height:1px"></span><div><div data-slot="navigation-menu-content" data-closed><ul>${links.map((l) => `<li><a data-slot="navigation-menu-link" href="#${l}">${l}</a></li>`).join('')}</ul></div></div></nav></div></div>`;
const trigger = (key: string, label: string) => `<li data-slot="navigation-menu-item"><button type="button" tabindex="0" aria-expanded="false" data-base-ui-navigation-menu-trigger data-slot="navigation-menu-trigger" data-mm-key="${key}">${label}</button></li>`;
const MENU = `<main><nav data-slot="navigation-menu"><ul data-slot="navigation-menu-list">${trigger('t1', 'Getting started')}${trigger('t2', 'Components')}<li data-slot="navigation-menu-item"><a data-slot="navigation-menu-link" href="#docs">Docs</a></li></ul></nav><button type="button">After</button></main>${content('t1', ['Introduction', 'Installation'])}${content('t2', ['Alert Dialog', 'Hover Card'])}`;
const state = (page: Page) =>
	page.evaluate(() => {
		const t = [...document.querySelectorAll('[data-slot="navigation-menu-trigger"]')].map((b) => `${b.textContent}:${b.getAttribute('aria-expanded')}${b.hasAttribute('data-popup-open') ? '+open' : ''}${b.hasAttribute('data-pressed') ? '+pressed' : ''}`);
		const open = [...document.querySelectorAll<HTMLElement>('[data-mm-layer]')].filter((l) => !l.hidden).map((l) => l.dataset.mmLayer);
		return { triggers: t.join(' '), open: open.join(' ') || '-', focus: document.activeElement?.textContent?.trim() ?? '' };
	});

test('Base UI NavigationMenu: the trigger shows its open state; Enter opens with focus at the content\'s start, Tab and Shift+Tab move through and out, Escape returns to the trigger', async () => {
	const page = await open(MENU, ['base-ui/navigation-menu']);
	await page.getByText('Getting started').focus();
	await press(page, 'Enter');
	assert.deepEqual(await state(page), { triggers: 'Getting started:true+open+pressed Components:false', open: 't1', focus: 'Introduction' });
	await press(page, 'Tab');
	assert.equal((await state(page)).focus, 'Installation');
	await press(page, 'Tab');
	assert.deepEqual(await state(page), { triggers: 'Getting started:true+open+pressed Components:false', open: 't1', focus: 'Components' }, 'past its last link, on after the trigger, still in the menu');
	await page.getByText('Introduction').focus();
	await page.keyboard.press('Shift+Tab');
	await settled(page);
	assert.equal((await state(page)).focus, 'Getting started');
	await press(page, 'Tab');
	assert.equal((await state(page)).focus, 'Introduction', 'Tab from the open trigger enters its content');
	await press(page, 'Escape');
	await page.waitForFunction(() => document.querySelector<HTMLElement>('[data-mm-layer="t1"]')!.hidden);
	assert.deepEqual(await state(page), { triggers: 'Getting started:false Components:false', open: '-', focus: 'Getting started' });
	await page.close();
});

test('Base UI NavigationMenu keys: the side arrows move along the list without wrapping, ArrowDown opens, the arrows wrap in the content', async () => {
	const page = await open(MENU, ['base-ui/navigation-menu']);
	await page.getByText('Getting started').focus();
	await press(page, 'ArrowLeft');
	assert.equal((await state(page)).focus, 'Getting started', 'no wrap');
	await press(page, 'ArrowRight');
	await press(page, 'ArrowRight');
	assert.deepEqual(await state(page), { triggers: 'Getting started:false Components:false', open: '-', focus: 'Docs' });
	await press(page, 'ArrowLeft');
	await press(page, 'ArrowDown');
	assert.deepEqual(await state(page), { triggers: 'Getting started:false Components:true+open+pressed', open: 't2', focus: 'Alert Dialog' });
	await press(page, 'ArrowUp');
	assert.equal((await state(page)).focus, 'Hover Card');
	await press(page, 'ArrowRight');
	assert.equal((await state(page)).focus, 'Alert Dialog');
	await page.close();
});

test('Base UI NavigationMenu: Tab past the last link of the last trigger\'s content leaves the menu and closes it', async () => {
	const page = await open(MENU, ['base-ui/navigation-menu']);
	await page.getByText('Components').focus();
	await press(page, 'Enter');
	await press(page, 'Tab');
	await press(page, 'Tab');
	assert.equal((await state(page)).focus, 'Docs', 'the list\'s link follows the trigger');
	await page.getByText('Hover Card').focus();
	await page.getByText('Docs').evaluate((a) => a.remove());
	await press(page, 'Tab');
	await page.waitForFunction(() => document.querySelector<HTMLElement>('[data-mm-layer="t2"]')!.hidden);
	assert.deepEqual(await state(page), { triggers: 'Getting started:false Components:false', open: '-', focus: 'After' });
	await page.close();
});
