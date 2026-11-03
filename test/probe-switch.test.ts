// The switch probe on shadcn's Base UI menubar, driven by the menu part itself. Candidate 9's port had a layer for
// File only: hovering Edit from File's open menu closed everything, where the original opens Edit.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { chromium, type Browser } from 'playwright';
import ts from 'typescript';
import { defaultEnv } from '../src/check/browser.ts';
import { checkProbes } from '../src/check/probes.ts';
import { VIEWPORTS } from '../src/check/types.ts';
import { registryModule } from '../src/convert/parts.ts';

const PARTS = join(import.meta.dirname, '..', 'parts');
const FLOATING = `export const computePosition = async () => ({ x: 0, y: 0, placement: 'bottom', middlewareData: {} });
export const autoUpdate = () => () => {};
export const arrow = () => ({}), flip = () => ({}), hide = () => ({}), limitShift = () => ({}), offset = () => ({}), shift = () => ({}), size = () => ({});`;
const GUARD = 'style="clip-path:inset(50%);overflow:hidden;width:1px;height:1px;margin:-1px;position:fixed;top:0;left:0"';
const MENUS = [
	['m1', 'File', ['New Tab', 'Print']],
	['m2', 'Edit', ['Undo', 'Redo']],
	['m3', 'View', ['Zoom In', 'Zoom Out']],
] as const;
const trigger = (id: string, text: string, i: number) => `<button type="button" aria-disabled="false" tabindex="${i ? -1 : 0}" aria-haspopup="menu" id="${id}" role="menuitem" data-slot="menubar-trigger" aria-expanded="false" style="padding:4px 8px">${text}</button><span data-type="outside" aria-hidden="true" tabindex="0" data-base-ui-focus-guard="" ${GUARD} hidden data-mm-shown-with="${id}"></span>`;
const layer = (id: string, items: readonly string[]) => `<div data-base-ui-portal hidden data-mm-layer="${id}"><div role="presentation" style="position:absolute;left:100px;top:300px" data-closed><div tabindex="-1" role="menu" aria-labelledby="${id}" data-slot="menubar-content" data-closed>${items.map((t) => `<div role="menuitem" tabindex="-1" data-slot="menubar-item">${t}</div>`).join('')}</div></div></div>`;
const page = (layered: readonly string[]) =>
	`<!doctype html><html lang="en"><head><title>Menubar</title><script type="importmap">{"imports":{"@floating-ui/dom":"/floating.js"}}</script><style>[hidden]{display:none!important}</style></head><body><main><h1>Menubar</h1><div role="menubar" data-slot="menubar" style="display:flex;gap:4px">${MENUS.map(([id, text], i) => trigger(id, text, i)).join('')}</div></main>${MENUS.filter(([id]) => layered.includes(id))
		.map(([id, , items]) => layer(id, items))
		.join('')}<script type="module">import { behave, listen } from '/parts/registry.ts'; listen(); for (const type of ['click', 'keydown', 'pointerover', 'pointerout', 'pointerdown', 'focusin', 'focusout']) document.body.addEventListener(type, behave, true);</script></body></html>`;

function serve(html: string): Promise<{ server: Server; origin: string }> {
	const registry = registryModule(['base-ui/menu'], '.');
	const server = createServer(async (req, res) => {
		const path = new URL(req.url ?? '/', 'http://x').pathname;
		const js = (body: string) => res.writeHead(200, { 'content-type': 'text/javascript' }).end(body);
		if (path === '/menubar') return void res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(html);
		if (path === '/floating.js') return js(FLOATING);
		if (path === '/parts/choices.ts') return js('export const CHOICES = {};');
		if (!path.startsWith('/parts/')) return void res.writeHead(404).end();
		const source = path === '/parts/registry.ts' ? registry : await readFile(join(PARTS, path.slice('/parts/'.length)), 'utf8').catch(() => undefined);
		if (source === undefined) return void res.writeHead(404).end();
		js(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText);
	});
	return new Promise((done) => server.listen(0, '127.0.0.1', () => done({ server, origin: `http://127.0.0.1:${(server.address() as AddressInfo).port}` })));
}

let browser: Browser;
let original: string;
let candidate9: string;
let noView: string;
const servers: Server[] = [];
before(async () => {
	browser = await chromium.launch();
	const a = await serve(page(['m1', 'm2', 'm3']));
	const b = await serve(page(['m1']));
	const c = await serve(page(['m1', 'm2']));
	servers.push(a.server, b.server, c.server);
	noView = c.origin;
	original = a.origin;
	candidate9 = b.origin;
});
after(async () => {
	await browser?.close();
	for (const s of servers) s.close();
});

test('the switch probe is red where the pointer on the next menubar trigger opens nothing, and green on the same page', async () => {
	const [result, same] = await Promise.all([checkProbes(browser, { old: defaultEnv(original), new: defaultEnv(candidate9) }, '/menubar', VIEWPORTS[0]!), checkProbes(browser, { old: defaultEnv(original), new: defaultEnv(original) }, '/menubar', VIEWPORTS[0]!)]);
	const mine = result.failures.filter((f) => f.check.startsWith('switch probe'));
	assert.ok(mine.some((f) => /^switch probe of menuitem "File": open it, point at the next trigger.* \(step 2 of 5: point at the next trigger\)$/.test(f.check)), JSON.stringify(result.failures, null, 1));
	const f = mine.find((x) => /step 2 of 5/.test(x.check))!;
	assert.match(f.expected, /menu \(2 items/);
	assert.notEqual(f.expected.replace(/^old, after [^:]*: /, ''), f.actual.replace(/^new: /, ''));
	assert.deepEqual(same.failures.filter((x) => x.check.startsWith('switch probe')), []);
	assert.ok(same.controls.some((c) => c.cls === 'switch' && c.state === 'probed'), JSON.stringify(same.controls));
});

test('the switch probe is red where ArrowRight from an open menubar menu reaches a trigger that opens nothing', async () => {
	const result = await checkProbes(browser, { old: defaultEnv(original), new: defaultEnv(noView) }, '/menubar', VIEWPORTS[0]!);
	const f = result.failures.find((x) => x.check.startsWith('switch probe'));
	assert.match(f?.check ?? JSON.stringify(result.failures), /^switch probe of menuitem "File": .* \(step 3 of 5: press ArrowRight\)$/);
});
