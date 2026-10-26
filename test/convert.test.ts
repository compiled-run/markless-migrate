import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cleanDocument, frameworkBuilds, lateHead } from '../src/convert/clean.ts';
import { body, find, attr, head, outer, parseDocument } from '../src/convert/dom.ts';
import { nextPattern } from '../src/convert/endpoints.ts';
import { factor } from '../src/convert/factor.ts';
import { bindParts, useResolver } from '../src/convert/parts.ts';
import { emitElement, emitHtml } from '../src/convert/tsrx.ts';

const NEXT_PAGE = `<!DOCTYPE html><html><head><link rel="stylesheet" href="/_next/static/a.css" data-precedence="next"><script src="/_next/static/chunks/main.js" async></script></head>
<body><div id="app"><p>Hi</p><script>console.log("plain")</script></div><script>(self.__next_f=self.__next_f||[]).push([0])</script><script>$RC("B:0","S:0")</script><template id="B:0"></template><next-route-announcer></next-route-announcer></body></html>`;

test('the old framework\'s runtime leaves the page, and its plain scripts and stylesheets stay', () => {
	const doc = parseDocument(NEXT_PAGE);
	const dropped = new Map<string, number>();
	cleanDocument(doc, { builds: frameworkBuilds(NEXT_PAGE).map((b) => b.path), frameworkScripts: new Set(), origin: 'http://old' }, dropped);
	const html = emitElement(body(doc));
	assert.doesNotMatch(html, /__next_f|\$RC|next-route-announcer|template|main\.js/);
	assert.match(html, /console\.log/);
	const link = find(doc, (el) => el.tagName === 'link')!;
	assert.equal(attr(link, 'href'), '/_next/static/a.css', 'the stylesheet is the old build\'s CSS, kept');
	assert.equal(attr(link, 'data-precedence'), undefined);
	assert.ok([...dropped.keys()].some((k) => /server state or streaming runtime/.test(k)));
});

test('what the old page\'s scripts added to the head after load neither preloads nor blocks the first paint', () => {
	const served = `<!DOCTYPE html><html><head><link rel="preload" href="/a.woff2" as="font"><link rel="stylesheet" href="/a.css"><link rel="preload" as="image" imagesrcset="/hero.png 1x"></head><body><link rel="stylesheet" href="/streamed.css"></body></html>`;
	const settled = parseDocument(`<!DOCTYPE html><html><head><link rel="preload" href="/a.woff2" as="font"><link rel="stylesheet" href="/a.css"><link rel="preload" as="image" imagesrcset="/hero.png 1x"><link rel="stylesheet" href="/streamed.css"><link rel="preload" href="/b.woff2" as="font"><link rel="preload" href="/route.css" as="style"><link rel="stylesheet" href="/client.css"><style>[data-toaster]{position:fixed}</style><meta name="theme-color" content="#000"></head><body></body></html>`);
	const dropped = new Map<string, number>();
	const late = lateHead(settled, parseDocument(served), dropped);
	const kept = outer(head(settled));
	assert.match(kept, /a\.woff2/);
	assert.match(kept, /hero\.png/);
	assert.match(kept, /streamed\.css/, 'a stylesheet the server streamed in the body was sent, so it stays');
	assert.match(kept, /theme-color/);
	assert.match(kept, /client\.css/, 'a stylesheet the old client linked may style what the port renders, so it stays');
	assert.doesNotMatch(kept, /b\.woff2|route\.css|data-toaster/);
	assert.deepEqual(late.map((el) => el.tagName), ['style']);
	assert.equal([...dropped.values()].reduce((a, b) => a + b, 0), 2);
});

test('tsrx output escapes braces and at-signs in text and keeps significant whitespace', () => {
	const doc = parseDocument('<body><p>a {b} @c</p><pre>  x\n  y</pre></body>');
	const out = emitElement(body(doc));
	assert.match(out, /a &#123;b&#125; &#64;c/);
	assert.match(out, /\{"  x\\n  y"\}/);
});

test('text in an element styled to keep its newlines keeps them, in tsrx and in a layer\'s HTML; elsewhere it collapses', () => {
	const doc = parseDocument('<body><div class="whitespace-pre-line"><div>1. a\n2. b</div></div><p class="text-sm sm:whitespace-pre-wrap">x\ny</p><p style="white-space: pre-wrap">s\nt</p><p class="whitespace-nowrap">c\nd</p></body>');
	const out = emitElement(body(doc));
	assert.match(out, /\{"1\. a\\n2\. b"\}/);
	assert.match(out, /\{"x\\ny"\}/);
	assert.match(out, /\{"s\\nt"\}/);
	assert.match(out, />c d</);
	assert.match(emitHtml(body(doc)), /1\. a\n2\. b/);
});

test('a region several pages render alike becomes one component; the current link is an expression of the path', () => {
	const nav = (current: string) => `<nav aria-label="Main">${['/a', '/b'].map((h) => `<a href="${h}" data-active="${h === current}">${h}${'x'.repeat(1200)}</a>`).join('')}</nav>`;
	const roots = new Map(['/a', '/b'].map((route) => [route, body(parseDocument(`<body><div>${nav(route)}<main>${route}</main></div></body>`)).childNodes[0] as never]));
	const f = factor(roots);
	assert.equal(f.components.length, 1);
	assert.match(f.components[0]!.source, /data-active=\{path === "\/a" \? "true" : "false"\}/);
	assert.equal(f.used('/a')[0]!.name, f.used('/b')[0]!.name);
});

test('next.js route handler paths become path-to-regexp patterns', () => {
	assert.equal(nextPattern('app/(app)/llm/[[...slug]]/route.ts'), '/llm/:slug*');
	assert.equal(nextPattern('app/r/registries.json/route.ts'), '/r/registries.json');
	assert.equal(nextPattern('app/blog/[id]/route.ts'), '/blog/:id');
});

test('a port is bound where the source renders its export with that data-slot, and only to that library\'s markup', () => {
	useResolver({ name: 'test', candidates: (slot) => (slot === 'tabs-trigger' ? [{ library: 'radix-ui', export: 'Tabs.Trigger', file: 'tabs.tsx', line: 1 }, { library: '@base-ui/react', export: 'Tabs.Tab', file: 'b.tsx', line: 1 }] : []), libraries: () => new Map(), prop: () => undefined });
	const el = (attrs: string) => find(parseDocument(`<body><button ${attrs}>x</button></body>`), (e) => e.tagName === 'button')!;
	const used = new Set<string>();
	bindParts(el('data-slot="tabs-trigger" role="tab" data-radix-collection-item=""'), used);
	assert.deepEqual([...used], ['radix/roving']);
	const none = new Set<string>();
	bindParts(el('data-slot="tabs-trigger" role="tab" id="base-ui-1" data-base-ui-x=""'), none);
	assert.deepEqual([...none], [], 'a Base UI tab is not given the Radix port');
	const plain = new Set<string>();
	bindParts(el('data-slot="tabs-trigger" role="tab"'), plain);
	assert.deepEqual([...plain], [], 'markup alone never picks a port: without the library\'s signature no Radix candidate stands');
});

test('the step snapshot hides every framework announcer frameworkMarkup() knows', async () => {
	const { FRAMEWORK_MARKUP_SELECTOR, frameworkMarkup } = await import('../src/check/automatic.ts');
	const known = [...frameworkMarkup.toString().matchAll(/selector: '([^']+)'/g)].map((m) => m[1]!);
	assert.ok(known.length >= 4);
	for (const selector of known) assert.ok(FRAMEWORK_MARKUP_SELECTOR.split(', ').includes(selector), selector);
});

test('a region alike on two pages but showing different content on use (View Code) is not shared', () => {
	const block = `<div data-slot="code"><pre>import { Select } from "@/components/ui/select"${'x'.repeat(2400)}</pre><button>View Code</button></div>`;
	const roots = new Map(['/a', '/b'].map((route) => [route, body(parseDocument(`<body><div>${block}<main>${route}</main></div></body>`)).childNodes[0] as never]));
	const code = new Map([...roots].map(([route, root]) => [(root as { childNodes: unknown[] }).childNodes[0], `<pre>full source of ${route}</pre>`]));
	assert.ok(factor(roots).components.some((c) => c.source.includes('View Code')), 'alike markup alone is shared');
	assert.ok(!factor(roots, { extra: (el) => code.get(el) }).components.some((c) => c.source.includes('View Code')), 'the block, whose View Code shows each page its own source, is each page\'s');
});

// Two routes rendering one tabs block (ui.shadcn.com's /blocks and /blocks/dashboard), whose tab state the parts declare.
function sharedTabs() {
	const block = (route: string) =>
		`<div id="dashboard-01"><div role="tablist"><button role="tab" id="${route === '/blocks' ? 'radix-_R_1_' : 'radix-_R_2_'}" aria-selected="true">Preview</button><button role="tab" aria-selected="false">Code</button></div><div role="tabpanel">${'x'.repeat(2400)}</div></div>`;
	const roots = new Map(['/blocks', '/blocks/dashboard'].map((route) => [route, body(parseDocument(`<body><div>${block(route)}<main>${route}</main></div></body>`)).childNodes[0] as never]));
	return factor(roots, {
		bind: (el) => {
			if (attr(el, 'role') === 'tablist') return { declare: ['let tab0 = state("Preview");'] };
			if (attr(el, 'role') !== 'tab') return undefined;
			const name = el.childNodes.map((n) => (n as { value?: string }).value ?? '').join('');
			return { expressions: { 'aria-selected': `tab0 === ${JSON.stringify(name)} ? "true" : "false"` }, extra: [`onClick={() => (tab0 = ${JSON.stringify(name)})}`] };
		},
	});
}

test('a shared region keeps the state its parts declare, beside the values that differ by page', () => {
	const f = sharedTabs();
	assert.equal(f.components.length, 1);
	const source = f.components[0]!.source;
	assert.match(source, /onClick=\{\(\) => \(tab0 = "Preview"\)\}/);
	assert.match(source, /^\tlet tab0 = state\("Preview"\);$/m, 'the declaration the handlers write is in the component body');
	assert.match(source, /^const VALUES: .* = \{"\/blocks":\{"v0":"radix-_R_1_"\},"\/blocks\/dashboard":\{"v0":"radix-_R_2_"\}\};$/m, 'the id each page rendered is in the per-page table');
	assert.match(source, /id=\{values\["v0"\]\}/);
});

test('a shared region with state compiles with Markless, with no error diagnostics', async () => {
	const { compileTsrxModule, collectTsrxModuleDiagnostics } = await import('@markless/compiler');
	const component = sharedTabs().components[0]!;
	const result = await compileTsrxModule({ filename: component.file, source: component.source, symbols: [] });
	const errors = collectTsrxModuleDiagnostics(result).filter((d) => d.severity === 'error');
	assert.deepEqual(errors.map((d) => `${d.code}: ${d.message}`), []);
});

test('a value that differs by page inside an @if arm of a shared region compiles with Markless', async () => {
	const { compileTsrxModule, collectTsrxModuleDiagnostics } = await import('@markless/compiler');
	const item = (route: string, href: string) => `<li><a href="${href}" class="${route === '/demo' ? 'item hidden-when-icon' : 'item'}">${href}${'x'.repeat(900)}</a></li>`;
	const block = (route: string) => `<div data-slot="collapsible-content"><ul>${item(route, '/a')}${item(route, '/b')}${item(route, '/c')}</ul></div>`;
	const roots = new Map(['/demo', '/one', '/two'].map((route) => [route, body(parseDocument(`<body><div>${block(route)}<main>${route}</main></div></body>`)).childNodes[0] as never]));
	const f = factor(roots, {
		bind: (el) => (attr(el, 'data-slot') === 'collapsible-content' ? { declare: ['let open0 = state(0);'], expressions: { hidden: '!(open0 === 0)' }, wrap: (children) => `@if (open0 === 0) { <>${children}</> }` } : undefined),
	});
	assert.equal(f.components.length, 1);
	const component = f.components[0]!;
	const result = await compileTsrxModule({ filename: component.file, source: component.source, symbols: [] });
	assert.deepEqual(collectTsrxModuleDiagnostics(result).filter((d) => d.severity === 'error').map((d) => `${d.code}: ${d.message}`), []);
});
