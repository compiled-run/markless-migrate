// Opening a popup writes its open state, then places and stacks it: a style read between those writes restyles the whole
// page once more (shadcn's :has() rules), so the reads wait until the opener has written everything.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { chromium, type Browser, type Page } from 'playwright';
import ts from 'typescript';

const PARTS = join(import.meta.dirname, '..', 'parts');
const FLOATING_STUB = `export const computePosition = async (reference) => ((globalThis.placedAgainst ??= []).push(reference?.id ?? ''), { x: 0, y: 0, placement: 'bottom', middlewareData: {} });
export const autoUpdate = () => () => {};
export const arrow = () => ({}), flip = () => ({}), hide = () => ({}), limitShift = () => ({}), offset = () => ({}), shift = () => ({}), size = () => ({});`;

let browser: Browser;
before(async () => {
	browser = await chromium.launch();
});
after(() => browser.close());

async function open(body: string): Promise<Page> {
	const page = await browser.newPage();
	await page.route('http://parts.test/**', async (route) => {
		const path = new URL(route.request().url()).pathname;
		if (path === '/') return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html><head><script type="importmap">{"imports":{"@floating-ui/dom":"/floating.js"}}</script></head><body>${body}</body></html>` });
		if (path === '/floating.js') return route.fulfill({ contentType: 'text/javascript', body: FLOATING_STUB });
		const text = await readFile(join(PARTS, path.replace(/^\/parts\//, '')), 'utf8');
		return route.fulfill({ contentType: 'text/javascript', body: ts.transpileModule(text, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText });
	});
	await page.goto('http://parts.test/');
	return page;
}

// Logs, in order, each attribute or style write and each computed-style or layout read `run` makes before it returns.
const logged = `(run) => {
	const log = [];
	const restore = [];
	const wrap = (owner, name, kind) => { const was = owner[name]; restore.push(() => (owner[name] = was)); owner[name] = function (...a) { log.push(kind + ' ' + name); return was.apply(this, a); }; };
	wrap(window, 'getComputedStyle', 'read');
	wrap(Element.prototype, 'getBoundingClientRect', 'read');
	wrap(Element.prototype, 'setAttribute', 'write');
	wrap(Element.prototype, 'toggleAttribute', 'write');
	const hidden = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'hidden');
	Object.defineProperty(HTMLElement.prototype, 'hidden', { ...hidden, set(v) { log.push('write hidden'); hidden.set.call(this, v); } });
	restore.push(() => Object.defineProperty(HTMLElement.prototype, 'hidden', hidden));
	try { run(); } finally { for (const r of restore) r(); }
	return log;
}`;
const readAfterWrite = (log: readonly string[]) => {
	const first = log.findIndex((x) => x.startsWith('write'));
	return first >= 0 && log.slice(first).some((x) => x.startsWith('read'));
};
const portal = (key: string, slot: string) => `<div data-base-ui-portal hidden data-mm-layer="${key}"><div role="presentation" data-side="bottom" data-align="start" style="position:absolute;z-index:50" data-closed><div role="menu" data-slot="${slot}" data-closed>Item</div></div></div>`;

test('a Base UI popup opening over another reads no style until it has written its open state, then is placed and raised', async () => {
	const page = await open(`<button id="a">One</button><button id="b">Two</button>${portal('a', 'dropdown-menu-content')}${portal('b', 'dropdown-menu-content')}`);
	const result = await page.evaluate(async (logged) => {
		const { openPopup } = (await import(String('/parts/base-ui/popup.ts'))) as typeof import('../parts/base-ui/popup.ts');
		const options = { popupSelector: '[data-slot="dropdown-menu-content"]', onDismiss: () => {} };
		openPopup(document.getElementById('a')!, options);
		await new Promise((r) => setTimeout(r, 20));
		const log = (0, eval)(logged)(() => openPopup(document.getElementById('b')!, options)) as string[];
		await new Promise((r) => setTimeout(r, 20));
		return { log, placed: (globalThis as unknown as { placedAgainst?: string[] }).placedAgainst ?? [] };
	}, logged);
	assert.ok(result.log.includes('write hidden'), result.log.join(', '));
	assert.equal(readAfterWrite(result.log), false, `no style read between the open state's writes: ${result.log.join(', ')}`);
	assert.deepEqual(result.placed, ['a', 'b'], 'each popup is still placed against its trigger');
	await page.close();
});

test('a Radix layer opening over another reads no style until it has written its open state, then is placed', async () => {
	const layer = (key: string) => `<div data-mm-layer="${key}" hidden data-radix-popper-content-wrapper style="position:fixed;z-index:50"><div id="${key}-content" data-slot="dropdown-menu-content" role="menu" data-state="closed">Item</div></div>`;
	const page = await open(`<button id="a" aria-controls="a-content">One</button><button id="b" aria-controls="b-content">Two</button>${layer('a')}${layer('b')}`);
	const result = await page.evaluate(async (logged) => {
		const { openLayer } = (await import(String('/parts/layer.ts'))) as typeof import('../parts/layer.ts');
		openLayer(document.getElementById('a')!, 'a', { onDismiss: () => {} });
		await new Promise((r) => setTimeout(r, 20));
		const log = (0, eval)(logged)(() => openLayer(document.getElementById('b')!, 'b', { onDismiss: () => {} })) as string[];
		await new Promise((r) => setTimeout(r, 20));
		return { log, placed: (globalThis as unknown as { placedAgainst?: string[] }).placedAgainst ?? [] };
	}, logged);
	assert.ok(result.log.includes('write hidden'), result.log.join(', '));
	assert.equal(readAfterWrite(result.log), false, `no style read between the open state's writes: ${result.log.join(', ')}`);
	assert.deepEqual(result.placed, ['a', 'b']);
	await page.close();
});
