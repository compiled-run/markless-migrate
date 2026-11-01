// Parts that load on use (an app's loadOnUse): nothing of theirs runs at load, and the window events the old page's
// listeners heard (the first scroll, a shortcut pressed outside the root) wake them, each heard once.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { chromium, type Browser } from 'playwright';
import ts from 'typescript';
import { bodyHandlers } from '../src/convert/parts.ts';
import { WAKE_SCRIPT } from '../parts/wake.ts';

const PARTS = join(import.meta.dirname, '..', 'parts');
const REGISTRY = `import { use } from './index.ts';
const w = window as unknown as Record<string, number>;
w.loaded = 1;
const SITE = [{ idle() { addEventListener('scroll', () => (w.scrolls = (w.scrolls ?? 0) + 1)); }, shortcut(_t: Element, e: KeyboardEvent) { if (e.key === 'k' && e.metaKey) w.ks = (w.ks ?? 0) + 1; } }];
export const { behave, listen } = use(SITE, {});`;
// The root's onMmwake as Markless runs it: the parts load when the event first arrives.
const PAGE = `<!doctype html><html><head><script>${WAKE_SCRIPT}</script></head><body><div data-mm-wake=""><button>In the root</button></div><div style="height:4000px"></div><script>document.querySelector('[data-mm-wake]').addEventListener('mmwake', (e) => import('/parts/registry.ts').then((m) => m.behave(e)))</script></body></html>`;

let browser: Browser;
before(async () => (browser = await chromium.launch()));
after(() => browser.close());

test("a page whose ports need nothing at load wakes its parts on use instead of at idle; one with an autoplay keeps listen() at idle", () => {
	assert.deepEqual(bodyHandlers(new Set(['qwik-ui/modal']), true, true).filter((h) => !h.startsWith('onClick') && !/^on(KeyDown|Pointer|Focus|ContextMenu|Input)/.test(h)), ['onMmwake={(event) => behave(event)}', 'data-mm-wake=""']);
	assert.ok(bodyHandlers(new Set(['carousel']), true, true).includes('onIdle={() => listen()}'), 'an autoplay timer starts at load');
	assert.ok(bodyHandlers(new Set(['qwik-ui/modal']), true).includes('onIdle={() => listen()}'), 'off unless the app opts in');
});

test('the first scroll and a shortcut pressed outside the root load the parts, and each is heard once', async () => {
	const p = await browser.newPage();
	await p.route('http://wake.test/**', async (route) => {
		const path = new URL(route.request().url()).pathname;
		if (path === '/') return route.fulfill({ contentType: 'text/html', body: PAGE });
		const text = path === '/parts/registry.ts' ? REGISTRY : await readFile(join(PARTS, path.replace(/^\/parts\//, '')), 'utf8');
		return route.fulfill({ contentType: 'text/javascript', body: ts.transpileModule(text, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText });
	});
	await p.goto('http://wake.test/');
	await p.waitForTimeout(300);
	const seen = () => p.evaluate(() => { const w = window as unknown as Record<string, number | undefined>; return { loaded: w.loaded ?? 0, scrolls: w.scrolls ?? 0, ks: w.ks ?? 0 }; });
	assert.deepEqual(await seen(), { loaded: 0, scrolls: 0, ks: 0 }, 'nothing loaded at load');
	await p.mouse.wheel(0, 400);
	await p.waitForFunction(() => (window as unknown as { scrolls?: number }).scrolls);
	assert.equal((await seen()).loaded, 1);
	await p.keyboard.press('Meta+k');
	await p.waitForTimeout(200);
	assert.equal((await seen()).ks, 1, 'the document listener hears it, and the wake script no longer forwards it');
	await p.close();
});

test('a shortcut pressed before any part is loaded wakes them and is heard once', async () => {
	const p = await browser.newPage();
	await p.route('http://wake.test/**', async (route) => {
		const path = new URL(route.request().url()).pathname;
		if (path === '/') return route.fulfill({ contentType: 'text/html', body: PAGE });
		const text = path === '/parts/registry.ts' ? REGISTRY : await readFile(join(PARTS, path.replace(/^\/parts\//, '')), 'utf8');
		return route.fulfill({ contentType: 'text/javascript', body: ts.transpileModule(text, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText });
	});
	await p.goto('http://wake.test/');
	await p.keyboard.press('Meta+k');
	await p.waitForFunction(() => (window as unknown as { ks?: number }).ks);
	await p.waitForTimeout(200);
	assert.equal(await p.evaluate(() => (window as unknown as { ks?: number }).ks), 1);
	await p.close();
});
