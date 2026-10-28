// parts/base-ui/positioner.ts against @base-ui/react 1.6's useAnchorPositioning: the placement it asks floating-ui for.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { chromium, type Browser } from 'playwright';
import ts from 'typescript';

const PARTS = join(import.meta.dirname, '..', 'parts');
const FLOATING_STUB = `export const computePosition = async (anchor, floating, o) => { window.asked = o.placement; return { x: 0, y: 0, placement: o.placement, middlewareData: {} }; };
export const autoUpdate = () => () => {};
export const arrow = () => ({}), flip = () => ({}), hide = () => ({}), limitShift = () => ({}), offset = () => ({}), shift = () => ({}), size = () => ({});`;

let browser: Browser;
before(async () => {
	browser = await chromium.launch();
});
after(() => browser.close());

test('a popup placed at the pointer (a context menu) on side inline-end goes left in a right-to-left popup, as Base UI reads its direction', async () => {
	const page = await browser.newPage();
	await page.route('http://parts.test/**', async (route) => {
		const path = new URL(route.request().url()).pathname;
		if (path === '/') return route.fulfill({ contentType: 'text/html', body: '<!doctype html><script type="importmap">{"imports":{"@floating-ui/dom":"/floating.js"}}</script><body></body>' });
		if (path === '/floating.js') return route.fulfill({ contentType: 'text/javascript', body: FLOATING_STUB });
		const text = await readFile(join(PARTS, path.replace(/^\/parts\//, '')), 'utf8');
		return route.fulfill({ contentType: 'text/javascript', body: ts.transpileModule(text, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText });
	});
	await page.goto('http://parts.test/');
	const asked = (dir: string) =>
		page.evaluate(async (dir) => {
			const { place } = (await import(String('/parts/base-ui/positioner.ts'))) as typeof import('../parts/base-ui/positioner.ts');
			const positioner = document.body.appendChild(document.createElement('div'));
			const popup = positioner.appendChild(document.createElement('div'));
			popup.setAttribute('dir', dir);
			const point = { getBoundingClientRect: () => new DOMRect(300, 200, 0, 0) };
			place(point, positioner, popup, { side: 'inline-end', align: 'start', sideOffset: 0, alignOffset: 0, positionMethod: 'fixed' });
			await new Promise((done) => setTimeout(done, 50));
			positioner.remove();
			return (window as unknown as { asked: string }).asked;
		}, dir);
	assert.equal(await asked('rtl'), 'left-start');
	assert.equal(await asked('ltr'), 'right-start');
	await page.close();
});
