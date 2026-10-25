// The Base UI Dialog, Drawer and Popover ports on markup as convert renders it, driven through parts/index.ts in a real
// browser, against what @base-ui/react 1.6 does.
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
		if (path === '/') return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html><head><script type="importmap">{"imports":{"@floating-ui/dom":"/floating.js"}}</script><style>*{box-sizing:border-box}body{margin:0;font:16px sans-serif}[hidden]{display:none!important}[role=option]{height:30px}</style></head><body>${body}<script type="module">import { behave, listen } from '/parts/index.ts'; listen(); for (const type of ['click', 'keydown', 'pointerover', 'pointerout', 'pointerdown', 'focusin', 'focusout', 'input']) document.body.addEventListener(type, behave, true); window.ready = true;</script></body></html>` });
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
const pageState = (page: Page) => page.evaluate(() => ({ hidden: document.querySelector('main')!.getAttribute('aria-hidden'), gutter: document.documentElement.style.scrollbarGutter, overflow: document.body.style.overflowY }));

// DialogPortal's InternalBackdrop, rendered only for a modal dialog or drawer.
const INTERNAL_BACKDROP = '<div role="presentation" data-base-ui-inert aria-hidden="true" style="position:fixed;inset:0;user-select:none"></div>';

test('Base UI Popover: its trigger has Dialog.Trigger\'s markup, yet it opens as a popover, ahead of the dialog port in the registry', async () => {
	const page = await open(
		`<main style="height:3000px;padding-top:200px"><button type="button" data-slot="button" data-base-ui-click-trigger aria-haspopup="dialog" aria-expanded="false" data-mm-key="p:1">Open Popover</button><button type="button" data-slot="dialog-trigger" data-base-ui-click-trigger aria-haspopup="dialog" aria-expanded="false" id="dlg">Open Dialog</button></main>
		<div data-base-ui-portal hidden data-mm-layer="p:1"><div data-side="bottom" data-align="center" role="presentation" data-closed><div role="dialog" tabindex="-1" data-slot="popover-content" data-side="bottom" data-closed><button type="button">Inside</button></div></div></div>
		<div data-base-ui-portal hidden data-mm-layer="dlg">${INTERNAL_BACKDROP}<div data-slot="dialog-overlay"></div><div role="dialog" data-slot="sheet-content" data-side="right" data-closed tabindex="-1" style="position:relative;z-index:1"><button data-slot="dialog-close">Close</button></div></div>`,
		['base-ui/dialog', 'base-ui/popover'],
	);
	await page.getByText('Open Popover').click();
	assert.equal(await page.locator('[data-slot="popover-content"]').getAttribute('data-open'), '');
	assert.equal(await page.getByText('Open Popover').getAttribute('aria-expanded'), 'true');
	assert.deepEqual(await pageState(page), { hidden: null, gutter: '', overflow: '' }, 'a popover leaves the page as it is');
	assert.equal(await page.evaluate(() => document.activeElement?.textContent), 'Inside', 'focus moves to its first tabbable element');
	await page.getByText('Open Popover').click();
	assert.equal(await page.getByText('Open Popover').getAttribute('aria-expanded'), 'false', 'a second press closes it');

	await page.getByText('Open Dialog').click();
	assert.equal(await focused(page), 'dialog-close', "a sheet, whose popup carries data-side, is still a dialog: it focuses its first tabbable element");
	assert.deepEqual(await pageState(page), { hidden: 'true', gutter: 'stable', overflow: 'hidden' });
	await page.close();
});

const drawer = (modal: boolean) => `<main style="height:3000px"><button type="button" data-slot="drawer-trigger" data-base-ui-click-trigger aria-haspopup="dialog" aria-expanded="false" id="dr">Open Drawer</button><button type="button">After</button></main>
	<div data-base-ui-portal hidden data-mm-layer="dr">${modal ? `${INTERNAL_BACKDROP}<div role="presentation" data-slot="drawer-overlay" aria-hidden="true" data-base-ui-inert data-closed></div>` : ''}<div role="presentation" data-slot="drawer-viewport" data-closed><div role="dialog" tabindex="-1" data-base-ui-focusable data-slot="drawer-popup" data-swipe-direction="right" data-closed><button type="button">First</button><button data-slot="drawer-close" type="button">Close</button></div></div></div>`;

test('Base UI Drawer: the popup itself takes focus; a modal one hides and locks the page and keeps Tab inside', async () => {
	const page = await open(drawer(true), ['base-ui/dialog']);
	await page.getByText('Open Drawer').click();
	assert.equal(await focused(page), 'drawer-popup');
	assert.deepEqual(await pageState(page), { hidden: 'true', gutter: 'stable', overflow: 'hidden' });
	await page.getByText('Close').focus();
	await press(page, 'Tab');
	assert.equal(await page.evaluate(() => document.activeElement?.textContent), 'First', 'Tab wraps inside');
	await page.close();
});

test('Base UI Drawer with modal={false}: no internal backdrop, so the page stays live and scrolls, Tab leaves the popup through its portal\'s focus guards, its trigger toggles it', async () => {
	const page = await open(drawer(false), ['base-ui/dialog']);
	await page.getByText('Open Drawer').click();
	assert.equal(await focused(page), 'drawer-popup');
	assert.deepEqual(await pageState(page), { hidden: null, gutter: '', overflow: '' });
	await page.getByText('Close').focus();
	await press(page, 'Tab');
	assert.equal(await page.evaluate(() => document.activeElement?.textContent), 'After', 'Tab past the last element goes to what follows the trigger');
	await page.getByText('First').focus();
	await page.keyboard.press('Shift+Tab');
	assert.equal(await page.evaluate(() => document.activeElement?.textContent), 'Open Drawer', 'Shift+Tab past the first goes back to the trigger');
	await page.getByText('Open Drawer').click();
	assert.equal(await page.getByText('Open Drawer').getAttribute('aria-expanded'), 'false', 'a press on its trigger closes it');
	await page.close();
});

