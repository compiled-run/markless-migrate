// Base UI's transition status around the dialog port, on markup as convert renders it, in a real browser.
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

// DialogPortal's InternalBackdrop, rendered only for a modal dialog or drawer.
const INTERNAL_BACKDROP = '<div role="presentation" data-base-ui-inert aria-hidden="true" style="position:fixed;inset:0;user-select:none"></div>';

// shadcn's Sheet on Base UI Dialog: the popup slides and fades out on data-ending-style.
const sheet = `<style>[data-slot="sheet-content"]{transition:opacity 600ms}[data-slot="sheet-content"][data-ending-style],[data-slot="sheet-content"][data-starting-style]{opacity:0}</style>
	<main><button type="button" data-slot="sheet-trigger" data-base-ui-click-trigger aria-haspopup="dialog" aria-expanded="false" id="sh">Open</button></main>
	<div data-base-ui-portal hidden data-mm-layer="sh">${INTERNAL_BACKDROP}<div data-slot="sheet-overlay" data-closed></div><div role="dialog" tabindex="-1" data-slot="sheet-content" data-closed style="position:relative;z-index:1"><button data-slot="sheet-close" type="button">Close</button></div></div>`;
const sheetShown = (page: Page) => page.locator('[data-slot="sheet-content"]').evaluate(async (el) => {
	// data-starting-style comes off a frame after the open.
	await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
	await Promise.allSettled(el.getAnimations().map((a) => a.finished));
	await new Promise((done) => setTimeout(done, 50));
	return { visible: (el as HTMLElement).checkVisibility(), ending: el.hasAttribute('data-ending-style'), opacity: getComputedStyle(el).opacity };
});

test('Base UI Dialog (a sheet) opened again after it closed shows: the exit\'s data-ending-style goes as it opens', async () => {
	const page = await open(sheet, ['base-ui/dialog']);
	await page.getByText('Open').click();
	await press(page, 'Escape');
	await page.waitForFunction(() => document.querySelector<HTMLElement>('[data-mm-layer="sh"]')!.hidden);
	await page.getByText('Open').click();
	assert.deepEqual(await sheetShown(page), { visible: true, ending: false, opacity: '1' });
	await page.close();
});

test('Base UI Dialog opened again while its exit still runs stays open once that exit ends', async () => {
	const page = await open(sheet, ['base-ui/dialog']);
	await page.getByText('Open').click();
	await sheetShown(page);
	await press(page, 'Escape');
	assert.equal(await page.locator('[data-slot="sheet-content"]').evaluate((el) => el.getAnimations().length), 1, 'the exit is still running');
	await page.getByText('Open').dispatchEvent('click');
	await page.waitForTimeout(700);
	assert.deepEqual(await sheetShown(page), { visible: true, ending: false, opacity: '1' });
	await page.close();
});
