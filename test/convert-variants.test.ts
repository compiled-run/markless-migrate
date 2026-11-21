// A page whose icons a query value changes in place: captured under each value, checked to keep one structure, and the
// written page marked so the icons swap by position.
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { chromium, type Browser } from 'playwright';
import { body, parseDocument, walk } from '../src/convert/dom.ts';
import { captureVariants, markVariants, VariantPlan, type VariantSpec } from '../src/convert/variants.ts';

const ICONS: Record<string, string> = { a: '<path d="M1 1h2"/>', b: '<circle r="2"/>' };
const page = (lib: string, extra: boolean) => `<!doctype html><html><body><main><div data-slot="card"><svg class="icon ${lib}" viewBox="0 0 4 4">${ICONS[lib]}</svg><span>Save</span></div><div data-slot="chart"><svg class="chart"><rect width="4" height="4"/></svg></div>${extra ? '<p><svg class="icon"></svg></p>' : ''}</main></body></html>`;

let browser: Browser;
let server: Server;
let origin: string;
let dir: string;
before(async () => {
	browser = await chromium.launch();
	dir = await mkdtemp(join(tmpdir(), 'mm-variants-'));
	server = createServer((req, res) => {
		const url = new URL(req.url ?? '/', 'http://x');
		const lib = url.searchParams.get('lib') === 'B' ? 'b' : 'a';
		res.writeHead(200, { 'content-type': 'text/html' }).end(page(lib, url.pathname === '/odd' && lib === 'b'));
	});
	await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
	origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(async () => {
	await browser?.close();
	await new Promise((done) => server?.close(done));
	await rm(dir, { recursive: true, force: true });
});

const spec: VariantSpec = { routes: '^/', name: 'library', query: 'lib', values: { a: '', b: 'B' }, elements: 'svg', source: 'a test' };

test('each value is captured and only the elements that differ are recorded, by position', async () => {
	const capture = await captureVariants(browser, origin, '/', dir, spec);
	assert.equal(capture.failed, undefined);
	assert.equal(capture.initial, 'a');
	assert.equal(capture.count, 2);
	assert.deepEqual(capture.frames, ['div.card<main', 'div.chart<main']);
	assert.deepEqual(capture.swaps.map((s) => s.index), [0], 'the chart is the same under both values');
	assert.match(capture.swaps[0]!.markup.b!, /<circle r="2">/);
	const marked = markVariants(page('a', false), capture, 'svg');
	assert.equal(marked.failed, undefined);
	const doc = parseDocument(marked.html!);
	const svgs = [...walk(body(doc))].filter((el) => el.tagName === 'svg');
	assert.deepEqual(svgs.map((el) => el.attrs.find((a) => a.name === 'data-mm-variant')?.value), ['0', undefined]);
	// What convert inserts afterwards (a revealed panel's icon) is not matched, only counted.
	const root = [...walk(body(doc))].find((el) => el.tagName === 'main')!;
	root.childNodes.push(...(parseDocument('<svg class="later"></svg>').childNodes[0] as never as { childNodes: never[] }).childNodes);
	const plan = new VariantPlan();
	const placed = plan.add(body(doc), capture, 'svg', (html) => `{${JSON.stringify(html)}}`);
	assert.deepEqual(placed, { bound: 1, unswapped: 1 });
	const card = [...walk(body(doc))].find((el) => el.attrs.some((a) => a.name === 'data-slot' && a.value === 'card'))!;
	assert.deepEqual(plan.bind(card), { declare: ['let iv0 = state("a");'], extra: ['data-mm-variant-holder="library"', 'onMmvariant={(event) => (iv0 = (event as CustomEvent<string>).detail)}'] });
	const arms = plan.bind(svgs[0]!)!.replace!;
	assert.match(arms, /^@switch \(iv0\) \{\n@case "b": \{\n\{"<svg class=\\"icon b\\" viewBox=\\"0 0 4 4\\"><circle r=\\"2\\"><\/circle><\/svg>"\}\n\}\n@default: \{/);
	assert.equal(plan.bind(svgs[1]!), undefined, 'the chart is the same under every value');
});

test('a value that changes the structure around the elements fails, and so does a written page that holds other elements', async () => {
	const odd = await captureVariants(browser, origin, '/odd', dir, spec);
	assert.match(odd.failed ?? '', /library b shows 3 svg where a shows 2/);
	const capture = await captureVariants(browser, origin, '/', dir, spec);
	assert.match(markVariants(page('a', true), capture, 'svg').failed ?? '', /holds 3 svg where each value's held 2/);
});


test("the marked elements written on their values' state compile with Markless", async () => {
	const { compileTsrxModule, collectTsrxModuleDiagnostics } = await import('@markless/compiler');
	const { emitChildren } = await import('../src/convert/tsrx.ts');
	const { parseFragment } = await import('parse5');
	const capture = await captureVariants(browser, origin, '/', dir, spec);
	const doc = parseDocument(markVariants(page('a', false), capture, 'svg').html!);
	const plan = new VariantPlan();
	const emit = (html: string) => emitChildren(parseFragment(html) as never);
	plan.add(body(doc), capture, 'svg', emit);
	const declarations: string[] = [];
	const markup = emitChildren(body(doc), { bind: (el) => plan.bind(el), declarations });
	const source = `import { state } from '@markless/core';\nexport default function Page() @{\n\t${declarations.join('\n\t')}\n\t<>${markup}</>\n}\n`;
	const result = await compileTsrxModule({ filename: 'pages/t.tsrx', source, symbols: [] });
	assert.deepEqual(collectTsrxModuleDiagnostics(result).filter((d) => d.severity === 'error').map((d) => `${d.code}: ${d.message}`), [], source);
	assert.ok(source.includes('@switch (iv0)'));
});

test('the frame sends its icon library to the holders only when it differs from what they show, so nothing runs until the library changes', async () => {
	const holders = [new EventTarget(), new EventTarget()];
	const got: string[] = [];
	for (const h of holders) h.addEventListener('mmvariant', (event) => got.push(event instanceof CustomEvent ? String(event.detail) : ''));
	Reflect.set(globalThis, 'document', { querySelectorAll: () => holders });
	Reflect.set(globalThis, 'CSS', { escape: (s: string) => s });
	try {
		const { showVariant } = await import('../parts/variants.ts');
		showVariant('iconLibrary', 'lucide', 'lucide');
		assert.deepEqual(got, [], 'the library the page loaded with is not sent');
		showVariant('iconLibrary', 'tabler', 'lucide');
		assert.deepEqual(got, ['tabler', 'tabler']);
		showVariant('iconLibrary', 'tabler', 'lucide');
		assert.equal(got.length, 2, 'nor the one already shown');
		showVariant('iconLibrary', 'lucide', 'lucide');
		assert.deepEqual(got.slice(2), ['lucide', 'lucide'], 'going back is sent');
	} finally {
		Reflect.deleteProperty(globalThis, 'document');
		Reflect.deleteProperty(globalThis, 'CSS');
	}
});
