// A closing disclosure panel reads its styles once Markless has committed the click's state: a read inside the handler,
// after the panel's own write, restyles the whole document once more (shadcn's :has() rules), before the commit's own restyle.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { chromium, type Browser, type Page } from 'playwright';
import ts from 'typescript';

const PARTS = join(import.meta.dirname, '..', 'parts');
let browser: Browser;
before(async () => {
	browser = await chromium.launch();
});
after(() => browser.close());

const STYLE = `<style>@keyframes up{from{height:40px}to{height:0}} [data-state="closed"].anim, [data-closed].anim{animation:up 120ms linear} .panel{overflow:hidden;transition:none}</style>`;

async function open(body: string): Promise<Page> {
	const page = await browser.newPage();
	await page.route('http://parts.test/**', async (route) => {
		const path = new URL(route.request().url()).pathname;
		if (path === '/') return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html><head>${STYLE}</head><body>${body}</body></html>` });
		const text = await readFile(join(PARTS, path.replace(/^\/parts\//, '')), 'utf8');
		return route.fulfill({ contentType: 'text/javascript', body: ts.transpileModule(text, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText });
	});
	await page.goto('http://parts.test/');
	return page;
}

// Calls panelExit the way a converted handler does and logs, in order, each attribute write and each computed-style read it makes before returning.
const exitReads = (page: Page) =>
	page.evaluate(async () => {
		const { panelExit } = (await import(String('/parts/panel-motion.ts'))) as typeof import('../parts/panel-motion.ts');
		const log: string[] = [];
		const read = window.getComputedStyle;
		const write = Element.prototype.setAttribute;
		const toggle = Element.prototype.toggleAttribute;
		window.getComputedStyle = function (this: Window, ...a: Parameters<typeof read>) {
			log.push('read');
			return read.apply(this, a);
		};
		Element.prototype.setAttribute = function (this: Element, name: string, value: string) {
			log.push(`write ${name}`);
			return write.call(this, name, value);
		};
		Element.prototype.toggleAttribute = function (this: Element, name: string, force?: boolean) {
			log.push(`write ${name}`);
			return toggle.call(this, name, force);
		};
		let done = false;
		panelExit('c1', () => (done = true));
		const inHandler = [...log];
		window.getComputedStyle = read;
		Element.prototype.setAttribute = write;
		Element.prototype.toggleAttribute = toggle;
		const until = performance.now() + 2000;
		while (!done && performance.now() < until) await new Promise((r) => setTimeout(r, 10));
		return { inHandler, done };
	});

const readAfterWrite = (log: readonly string[]) => {
	const first = log.findIndex((x) => x.startsWith('write'));
	return first >= 0 && log.slice(first).includes('read');
};

test('a closing Radix content reads its exit animation after the handler, not between its own write and the commit, and still ends with it', async () => {
	const page = await open(`<div id="c1" class="panel anim" data-state="open" role="region">Shipping in 2 days</div>`);
	const { inHandler, done } = await exitReads(page);
	assert.ok(inHandler.includes('write data-state'), inHandler.join(', '));
	assert.equal(readAfterWrite(inHandler), false, `no style read after the write inside the handler: ${inHandler.join(', ')}`);
	assert.equal(done, true, 'done once the exit animation ends');
	await page.close();
});

test('a closing Base UI panel checks its motion after the handler too, and ends at once when it has none', async () => {
	const page = await open(`<div id="c1" class="panel" data-open role="region" style="--accordion-panel-height:auto">Shipping in 2 days</div>`);
	const { inHandler, done } = await exitReads(page);
	assert.ok(inHandler.includes('write data-closed'), inHandler.join(', '));
	assert.equal(readAfterWrite(inHandler), false, `no style read after the write inside the handler: ${inHandler.join(', ')}`);
	assert.equal(done, true);
	await page.close();
});
