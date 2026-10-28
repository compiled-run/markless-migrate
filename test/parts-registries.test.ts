// Pages load registries of their own ports; the parts runtime runs every part the loaded registries listed, the site's
// first and then the ports in module order, so a page reached later adds its ports without reordering the others.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { chromium, type Browser } from 'playwright';
import ts from 'typescript';
import { registryModule } from '../src/convert/parts.ts';

const PARTS = join(import.meta.dirname, '..', 'parts');
const port = (name: string) => `export function click() { window.log.push(${JSON.stringify(name)}); return false; }\nexport function idle() { window.log.push(${JSON.stringify(`idle ${name}`)}); }\n`;
const MODULES: Readonly<Record<string, string>> = {
	'/parts/first.ts': registryModule(['menu', 'tabs'], '.', './site.ts'),
	'/parts/second.ts': registryModule(['tabs', 'dialog'], '.', './site.ts'),
	'/parts/site.ts': `export const SITE_PARTS = [{ click() { window.log.push('site'); return false; } }];\n`,
	'/parts/menu.ts': port('menu'),
	'/parts/tabs.ts': port('tabs'),
	'/parts/dialog.ts': port('dialog'),
};

let browser: Browser;
before(async () => {
	browser = await chromium.launch();
});
after(() => browser.close());

test('a second registry adds its ports in module order after the site parts, runs only their idle, and shares the runtime', async () => {
	const page = await browser.newPage();
	await page.route('http://parts.test/**', async (route) => {
		const path = new URL(route.request().url()).pathname;
		if (path === '/') return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html><body><button>go</button><script>window.log = [];</script><script type="module">import { listen } from '/parts/first.ts'; listen(); window.ready = true;</script></body></html>` });
		const text = MODULES[path] ?? (await readFile(join(PARTS, path.replace(/^\/parts\//, '')), 'utf8'));
		return route.fulfill({ contentType: 'text/javascript', body: ts.transpileModule(text, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText });
	});
	await page.goto('http://parts.test/');
	await page.waitForFunction(() => (window as unknown as { ready?: boolean }).ready);
	const log = () => page.evaluate(() => (window as unknown as { log: string[] }).log.splice(0));
	assert.deepEqual(await log(), ['idle menu', 'idle tabs']);
	await page.click('button');
	assert.deepEqual(await log(), ['site', 'menu', 'tabs']);
	const same = await page.evaluate(async () => {
		const [first, second] = await Promise.all([import('/parts/first.ts' as string), import('/parts/second.ts' as string)]);
		second.listen();
		return first.behave === second.behave && first.mount === second.mount;
	});
	assert.ok(same, 'every registry binds the same runtime');
	assert.deepEqual(await log(), ['idle dialog'], 'only the newly added port runs its idle');
	await page.click('button');
	assert.deepEqual(await log(), ['site', 'dialog', 'menu', 'tabs']);
	await page.close();
});

test('a page whose layer a React Aria PreviewTrigger opens runs the tooltip port, though no element of its own names it', async () => {
	const { triggerPorts } = await import('../src/convert/parts.ts');
	const { body, parseDocument, walk } = await import('../src/convert/dom.ts');
	const layer = (html: string) => [...walk(body(parseDocument(`<body>${html}</body>`)))].filter((e) => e.tagName === 'div').slice(0, 1);
	assert.deepEqual(triggerPorts(layer('<div><div data-slot="hover-card-content" data-rac="" role="dialog" data-trigger="PreviewTrigger"></div></div>')), ['react-aria/tooltip']);
	assert.deepEqual(triggerPorts(layer('<div><div data-slot="popover-content" data-rac="" role="dialog" data-trigger="DialogTrigger"></div></div>')), []);
});
