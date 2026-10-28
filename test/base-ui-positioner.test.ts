// parts/base-ui/positioner.ts against @base-ui/react 1.6's useAnchorPositioning: the placement it asks floating-ui for.
import assert from 'node:assert/strict';
import { readFile, realpath } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
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

// floating-ui itself, each package resolved from the one that imports it.
async function floatingFiles(): Promise<Record<string, string>> {
	const dom = await realpath(createRequire(import.meta.url).resolve('@floating-ui/dom'));
	const fromDom = createRequire(dom);
	const core = await realpath(fromDom.resolve('@floating-ui/core'));
	const utils = createRequire(core);
	return {
		'/fd.js': join(dirname(dom), 'floating-ui.dom.browser.mjs'),
		'/fc.js': join(dirname(core), 'floating-ui.core.browser.mjs'),
		'/fu.js': join(dirname(await realpath(utils.resolve('@floating-ui/utils'))), 'floating-ui.utils.mjs'),
		'/fud.js': join(dirname(await realpath(utils.resolve('@floating-ui/utils/dom'))), 'floating-ui.utils.dom.mjs'),
	};
}

test('a context menu at the pointer opens where Base UI puts it: its align offset below the pointer, no arrow padding or shift limit pulling it up to the 0x0 point', async () => {
	const files = await floatingFiles();
	const page = await browser.newPage({ viewport: { width: 1300, height: 900 } });
	await page.route('http://parts.test/**', async (route) => {
		const path = new URL(route.request().url()).pathname;
		if (path === '/') return route.fulfill({ contentType: 'text/html', body: '<!doctype html><script type="importmap">{"imports":{"@floating-ui/dom":"/fd.js","@floating-ui/core":"/fc.js","@floating-ui/utils":"/fu.js","@floating-ui/utils/dom":"/fud.js"}}</script><body style="margin:0"></body>' });
		if (files[path]) return route.fulfill({ contentType: 'text/javascript', body: await readFile(files[path]!, 'utf8') });
		const text = await readFile(join(PARTS, path.replace(/^\/parts\//, '')), 'utf8');
		return route.fulfill({ contentType: 'text/javascript', body: ts.transpileModule(text, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText });
	});
	await page.goto('http://parts.test/');
	// shadcn's ContextMenuContent: side right, align start, alignOffset 4, sideOffset 0.
	const at = await page.evaluate(async () => {
		const { place } = (await import(String('/parts/base-ui/positioner.ts'))) as typeof import('../parts/base-ui/positioner.ts');
		const positioner = document.body.appendChild(document.createElement('div'));
		const popup = positioner.appendChild(document.createElement('div'));
		popup.style.cssText = 'width:192px;height:218px';
		const point = { getBoundingClientRect: () => DOMRect.fromRect({ x: 520, y: 351, width: 0, height: 0 }) };
		place(point, positioner, popup, { side: 'right', align: 'start', sideOffset: 0, alignOffset: 4, positionMethod: 'fixed' });
		await new Promise((done) => setTimeout(done, 100));
		const r = popup.getBoundingClientRect();
		return [r.left, r.top];
	});
	assert.deepEqual(at, [520, 355]);
	await page.close();
});
