// The browser page and Base UI menu markup the Base UI menu tests share: a test file importing it gets its browser.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { after, before } from 'node:test';
import { chromium, type Browser, type Page } from 'playwright';
import ts from 'typescript';
import { registryModule } from '../src/convert/parts.ts';

const PARTS = join(import.meta.dirname, '..', 'parts');
// Placement is not under test: a popup goes to the page's corner, a submenu (placed on a side) beside its trigger.
const FLOATING_STUB = `export const computePosition = async (anchor, floating, o) => { if (!/^(right|left)/.test(o.placement)) return { x: 0, y: 0, placement: 'bottom', middlewareData: {} }; const r = anchor.getBoundingClientRect(); return { x: r.right, y: r.top, placement: o.placement, middlewareData: {} }; };
export const autoUpdate = () => () => {};
export const arrow = () => ({}), flip = () => ({}), hide = () => ({}), limitShift = () => ({}), offset = () => ({}), shift = () => ({}), size = () => ({});`;

let browser: Browser;
before(async () => {
	browser = await chromium.launch();
});
after(() => browser.close());

export async function open(body: string, ports: readonly string[], choices: Record<string, unknown> = {}, floating = FLOATING_STUB): Promise<Page> {
	const page = await browser.newPage({ viewport: { width: 1000, height: 800 } });
	const registry = registryModule(ports, '.');
	await page.route('http://parts.test/**', async (route) => {
		const path = new URL(route.request().url()).pathname;
		if (path === '/') return route.fulfill({ contentType: 'text/html; charset=utf-8', body: `<!doctype html><html><head><script type="importmap">{"imports":{"@floating-ui/dom":"/floating.js","@markless/router":"/router.js"}}</script><style>*{box-sizing:border-box}body{margin:0;font:16px sans-serif}[hidden]{display:none!important}[role=menuitem],[role=option]{height:30px}</style></head><body>${body}<script type="module">import { behave, listen } from '/parts/registry.ts'; listen(); for (const type of ['click', 'keydown', 'pointerover', 'pointerout', 'pointerdown', 'focusin', 'focusout']) document.body.addEventListener(type, behave, true); window.ready = true;</script></body></html>` });
		if (path === '/floating.js') return route.fulfill({ contentType: 'text/javascript', body: floating });
		if (path === '/router.js') return route.fulfill({ contentType: 'text/javascript', body: 'export const navigate = (to) => { window.navigatedTo = to; };' });
		if (path === '/parts/choices.ts') return route.fulfill({ contentType: 'text/javascript', body: `export const CHOICES = ${JSON.stringify(choices)};` });
		const text = path === '/parts/registry.ts' ? registry : await readFile(join(PARTS, path.replace(/^\/parts\//, '')), 'utf8');
		return route.fulfill({ contentType: 'text/javascript', body: ts.transpileModule(text, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText });
	});
	await page.goto('http://parts.test/');
	await page.waitForFunction(() => (window as unknown as { ready?: boolean }).ready);
	return page;
}

export const settled = (page: Page) => page.evaluate(() => new Promise<void>((done) => setTimeout(() => setTimeout(done))));
// Keys held as a person types them.
export async function press(page: Page, key: string): Promise<void> {
	await page.keyboard.down(key);
	await page.waitForTimeout(60);
	await page.keyboard.up(key);
	await settled(page);
}
export const state = (page: Page) =>
	page.evaluate(() => {
		const at = document.activeElement;
		const focus = !at || at === document.body ? 'body' : at.matches('[role="menu"], [role="listbox"]') ? 'popup' : (at.getAttribute('data-slot')?.endsWith('trigger') && !at.closest('[role="menu"]') ? `trigger:${at.textContent?.trim()}` : at.textContent?.trim() || at.tagName.toLowerCase());
		const highlighted = [...document.querySelectorAll('[data-highlighted]')].map((e) => e.textContent?.trim()).join('|') || '-';
		const trigger = document.querySelector('[data-slot$="-trigger"]')!;
		return `${trigger.getAttribute('aria-expanded')} focus=${focus} highlighted=${highlighted}`;
	});

// Base UI Menu as convert renders it: the portal keyed by the trigger's id holding the modal menu's inert backdrop, the
// positioner with its focus guard and the popup.
export const menu = (items: readonly string[], disabled: readonly string[] = []) => `<main style="height:3000px;padding:100px"><button type="button" id="before">Before</button>
	<button type="button" id="dd" aria-haspopup="menu" aria-expanded="false" data-slot="dropdown-menu-trigger">Open</button><button type="button" id="after">After</button></main>
	<div data-base-ui-portal hidden data-mm-layer="dd"><div role="presentation" data-base-ui-inert style="position:fixed;inset:0;user-select:none"></div><div data-side="bottom" data-align="start" role="presentation" style="position:absolute;left:0;top:0" data-closed><span data-type="inside" aria-hidden="true" tabindex="0" data-base-ui-focus-guard style="position:fixed;width:1px;height:1px"></span><div tabindex="-1" role="menu" aria-labelledby="dd" data-slot="dropdown-menu-content" data-closed>${items.map((t) => `<div role="menuitem" tabindex="-1" data-slot="dropdown-menu-item"${disabled.includes(t) ? ' aria-disabled="true" data-disabled=""' : ''}>${t}</div>`).join('')}</div></div></div>`;

export const withSub = (dir = 'ltr') =>
	menu(['Team', 'Invite users', 'New Team'])
		.replace('<main ', `<main dir="${dir}" `)
		.replace('<div tabindex="-1" role="menu"', `<div tabindex="-1" dir="${dir}" role="menu"`)
		.replace('data-slot="dropdown-menu-item">Invite users', 'data-slot="dropdown-menu-sub-trigger" id="sub1" aria-haspopup="menu" aria-expanded="false" data-mm-key="dd-sub-1" style="display:block;width:200px">Invite users') +
	`<div data-base-ui-portal hidden data-mm-layer="dd-sub-1"><div data-side="right" data-align="start" data-nested role="presentation" style="position:absolute;left:400px;top:0" data-closed><div tabindex="-1" dir="${dir}" role="menu" data-nested aria-labelledby="sub1" data-slot="dropdown-menu-sub-content" data-closed style="width:200px">${['Email', 'Message'].map((t) => `<div role="menuitem" tabindex="-1" data-slot="dropdown-menu-item">${t}</div>`).join('')}</div></div></div>`;
export const subState = (page: Page) =>
	page.evaluate(() => {
		const sub = document.getElementById('sub1')!;
		const open = !document.querySelector<HTMLElement>('[data-mm-layer="dd-sub-1"]')!.hidden && sub.getAttribute('aria-expanded') === 'true';
		const at = document.activeElement;
		const focus = at?.matches('[role="menu"]') ? (at.hasAttribute('data-nested') ? 'submenu' : 'menu') : at?.textContent?.trim();
		const highlighted = [...document.querySelectorAll('[data-highlighted]')].map((e) => e.textContent?.trim()).join('|') || '-';
		return `menu=${document.getElementById('dd')!.getAttribute('aria-expanded')} sub=${open} focus=${focus} highlighted=${highlighted}${sub.hasAttribute('data-popup-open') ? ' popup-open' : ''}${sub.hasAttribute('data-pressed') ? ' pressed' : ''}`;
	});
