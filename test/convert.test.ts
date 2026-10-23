import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cleanDocument, frameworkBuilds, lateHead } from '../src/convert/clean.ts';
import { body, find, attr, head, outer, parseDocument } from '../src/convert/dom.ts';
import { nextPattern } from '../src/convert/endpoints.ts';
import { factor } from '../src/convert/factor.ts';
import { bindParts, useResolver } from '../src/convert/parts.ts';
import { emitElement } from '../src/convert/tsrx.ts';

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
	const settled = parseDocument(`<!DOCTYPE html><html><head><link rel="preload" href="/a.woff2" as="font"><link rel="stylesheet" href="/a.css"><link rel="preload" as="image" imagesrcset="/hero.png 1x"><link rel="stylesheet" href="/streamed.css"><link rel="preload" href="/b.woff2" as="font"><link rel="preload" href="/route.css" as="style"><style>[data-toaster]{position:fixed}</style><meta name="theme-color" content="#000"></head><body></body></html>`);
	const dropped = new Map<string, number>();
	const late = lateHead(settled, parseDocument(served), dropped);
	const kept = outer(head(settled));
	assert.match(kept, /a\.woff2/);
	assert.match(kept, /hero\.png/);
	assert.match(kept, /streamed\.css/, 'a stylesheet the server streamed in the body was sent, so it stays');
	assert.match(kept, /theme-color/);
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
