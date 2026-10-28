// Radix Collapsible and Accordion content open on load, measured as Radix's layout effect measures it on mount.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { chromium, type Browser } from 'playwright';
import ts from 'typescript';
import { registryModule } from '../src/convert/parts.ts';

const PARTS = join(import.meta.dirname, '..', 'parts');
let browser: Browser;
before(async () => {
	browser = await chromium.launch();
});
after(() => browser.close());

// shadcn's AccordionContent: the inner div takes its height from the variable Radix measures into the content.
const accordion = (width: number) => `<div style="width:${width}px" data-slot="accordion"><div data-slot="accordion-item" data-state="open"><h3><button data-radix-collection-item aria-expanded="true" aria-controls="c1" data-state="open">Shipping</button></h3>
<div id="c1" role="region" data-state="open" data-slot="accordion-content" style="overflow:hidden;--radix-accordion-content-height: var(--radix-collapsible-content-height); transition-duration: 0s; animation-name: none; --radix-collapsible-content-height: 50px; --radix-collapsible-content-width: 384px;"><div style="height:var(--radix-accordion-content-height)">${'We offer standard, express and overnight shipping. '.repeat(4)}</div></div></div></div>`;

test('an open Radix content keeps no size measured at another width: it is measured again once the page is idle', async () => {
	const page = await browser.newPage({ viewport: { width: 400, height: 800 } });
	const registry = registryModule(['radix/disclosure-motion'], '.');
	await page.route('http://parts.test/**', async (route) => {
		const path = new URL(route.request().url()).pathname;
		if (path === '/') return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html><head><style>body{margin:0;font:16px/20px sans-serif}</style></head><body>${accordion(260)}<script type="module">import { listen } from '/parts/registry.ts'; listen(); window.ready = true;</script></body></html>` });
		const text = path === '/parts/registry.ts' ? registry : await readFile(join(PARTS, path.replace(/^\/parts\//, '')), 'utf8');
		return route.fulfill({ contentType: 'text/javascript', body: ts.transpileModule(text, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText });
	});
	await page.goto('http://parts.test/');
	await page.waitForFunction(() => (window as unknown as { ready?: boolean }).ready);
	const got = await page.evaluate(() => {
		const c = document.getElementById('c1')!;
		return { height: c.getBoundingClientRect().height, text: (c.firstElementChild as HTMLElement).scrollHeight, variable: c.style.getPropertyValue('--radix-collapsible-content-height'), width: c.style.getPropertyValue('--radix-collapsible-content-width'), animation: c.style.animationName };
	});
	assert.ok(got.text > 50, `the text wraps taller than the captured 50px at 260px wide (${got.text})`);
	assert.equal(got.variable, `${got.height}px`);
	assert.equal(got.height, got.text);
	assert.equal(got.width, '260px');
	assert.equal(got.animation, 'none', 'the mount suppression stays until the first close');
	await page.close();
});
