import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { chromium } from 'playwright';
import ts from 'typescript';
import { atRest } from '../src/convert/at-rest.ts';
import { body, find, outer, parseDocument, walk } from '../src/convert/dom.ts';
import { extrasModule, LAYER_FILL, layerTable, pagesWiring, SERVED_LAYER_BYTES } from '../src/convert/document.ts';
import { componentImport, componentName, inPageComponent, pageComponentOf, readSiteComponents, siteComponentOf, siteImportedParts, withSiteImports } from '../src/convert/site-components.ts';
import { APP_URL_TOKEN, emitElement, emitHtml, useOrigin } from '../src/convert/tsrx.ts';

const ROOT = join(import.meta.dirname, '..');

test('a layer as HTML is the markup its tsrx renders: collapsed text, the old origin as the token, no style', () => {
	useOrigin('https://old.example');
	const doc = parseDocument(`<body><div role="dialog" hidden data-mm-layer="k" class="a  b"><style>.x{}</style><p>Open   in
	v0 <a href="https://v0.dev/open?url=https://old.example/r/x.json">here</a> &amp; &lt;now&gt;</p><img src="/a.png" alt=""><input value="a&quot;b"></div></body>`);
	const el = find(body(doc), (e) => e.tagName === 'div')!;
	assert.equal(
		emitHtml(el, { extra: ['data-mm-side-offset="4"'] }),
		`<div role="dialog" hidden data-mm-layer="k" class="a  b" data-mm-side-offset="4"><p>Open in v0 <a href="https://v0.dev/open?url=${APP_URL_TOKEN}/r/x.json">here</a> &amp; &lt;now&gt;</p><img src="/a.png" alt=""><input value="a&quot;b"></div>`,
	);
	assert.match(emitElement(el), /APP_URL/);
	useOrigin(undefined);
});

test('a layer from SERVED_LAYER_BYTES up is its shell in the page and its content in a file fetched as the page loads; a small one stays inline', () => {
	const big = `<div data-mm-layer="search" hidden><input /><div data-mm-layer-fill="${LAYER_FILL}"></div></div>`.padEnd(SERVED_LAYER_BYTES + 10, ' ');
	const shell = `<div data-mm-layer="search" hidden><input /><div data-mm-layer-fill="${LAYER_FILL}"></div></div>`;
	const fill = `<p>${'x'.repeat(SERVED_LAYER_BYTES)}</p>`;
	const small = '<div data-mm-layer="tip" hidden>tip</div>';
	const table = layerTable(
		new Map([
			['/', [{ key: 'search', markup: big, shell, fill }, { key: 'tip', markup: small, shell: small, fill: '' }]],
			['/b', [{ key: 'search', markup: big, shell, fill }]],
		]),
	);
	assert.deepEqual(table.served.map((s) => s.html), [fill]);
	const path = table.served[0]!.path;
	assert.match(path, /^\/_converted\/layers\/[0-9a-f]{16}\/$/);
	const sources = table.files.map((f) => f.source);
	assert.ok(sources.some((s) => s.includes(`<link rel="preload" href="${path}" as="fetch" crossorigin="anonymous" fetchpriority="low" /><template data-mm-layer-src="${path}" data-mm-layer-keys="search"><div data-mm-layer="search" hidden><input /><div data-mm-layer-fill="${path}"></div></div></template>`) && !s.includes('xxxx')));
	assert.ok(sources.some((s) => s.includes(small)));
});

test('a layer a site component stands in for is served whatever its size: the page renders its shell with the component, the file holds the rest', () => {
	const shell = `<div data-mm-layer="search" hidden data-mm-served="${LAYER_FILL}"><CommandMenu fill="${LAYER_FILL}" /></div>`;
	const fill = '<div cmdk-group="">Pages</div>';
	const table = layerTable(new Map([['/', [{ key: 'search', markup: '<div data-mm-layer="search" hidden>small</div>', shell, fill, imports: ["import CommandMenu from '../../../lib/site/command-menu.tsrx';"] }]]]));
	assert.deepEqual(table.served.map((s) => s.html), [fill]);
	const path = table.served[0]!.path;
	const source = table.files[0]!.source;
	assert.match(source, /^\/\/ Generated[^\n]*\nimport CommandMenu from '\.\.\/\.\.\/\.\.\/lib\/site\/command-menu\.tsrx';\n/);
	assert.ok(source.includes(`<template data-mm-layer-src="${path}" data-mm-layer-keys="search"></template><div data-mm-layer="search" hidden data-mm-served="${path}"><CommandMenu fill="${path}" /></div>`), source);
});

test('a site component stands in for the element its selector picks, inside a tag and attribute compound with :has()', () => {
	const doc = parseDocument('<body><div cmdk-root=""><input cmdk-input="" placeholder="Search documentation..."></div><div cmdk-root=""><input cmdk-input="" placeholder="Type a command"></div></body>');
	const site = [{ selector: 'div[cmdk-root]:has([cmdk-input][placeholder="Search documentation..."])', component: 'command-menu.tsrx' }];
	const roots = [...walk(body(doc))].filter((el) => el.attrs.some((a) => a.name === 'cmdk-root'));
	assert.deepEqual(roots.map((el) => siteComponentOf(el, site)?.component), ['command-menu.tsrx', undefined]);
	assert.equal(componentName(site[0]!), 'CommandMenu');
	assert.equal(componentImport(site[0]!, '../../..'), "import CommandMenu from '../../../lib/site/command-menu.tsrx';");
});

test('a used layer shows its shell at once and its content when the file lands, once, after the page, with the new origin', async () => {
	const source = (file: string) => readFile(join(ROOT, 'parts', file), 'utf8').then((text) => ts.transpileModule(text, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText);
	const reveal = await source('reveal.ts');
	const browser = await chromium.launch();
	try {
		const page = await browser.newPage();
		let fetches = 0;
		let release: () => void = () => {};
		const held = new Promise<void>((resolve) => (release = resolve));
		await page.route('http://app.test/**', async (route) => {
			const path = new URL(route.request().url()).pathname;
			if (path === '/layer.html') {
				fetches++;
				await held;
				return route.fulfill({ contentType: 'text/html', body: `<a href="${APP_URL_TOKEN}/docs">Docs</a>` });
			}
			if (path === '/reveal.js') return route.fulfill({ contentType: 'text/javascript', body: reveal });
			return route.fulfill({ contentType: 'text/html', body: '<!doctype html><body><main>page</main><!--markless:page-end--><template data-mm-layer-src="/layer.html" data-mm-layer-keys="search" data-mm-app-url="https://new.example"><div role="dialog" hidden data-mm-layer="search"><a data-shell href="@@MM_APP_URL@@/home">Home</a><input value=""><div data-mm-layer-fill="/layer.html"></div></div></template></body>' });
		});
		await page.goto('http://app.test/');
		await page.evaluate(async () => {
			const parts = (await import('/reveal.js' as string)) as typeof import('../parts/reveal.ts');
			(globalThis as { parts?: unknown }).parts = parts;
		});
		const shell = await page.evaluate(() => {
			const parts = (globalThis as { parts?: typeof import('../parts/reveal.ts') }).parts!;
			const nodes = parts.layersFor('search');
			return { nodes: nodes.length, links: nodes[0]?.querySelectorAll('[data-mm-layer-fill] a').length, home: nodes[0]?.querySelector('[data-shell]')?.getAttribute('href'), afterPage: document.body.lastElementChild === nodes[0], pending: parts.layersPending() };
		});
		assert.deepEqual(shell, { nodes: 1, links: 0, home: 'https://new.example/home', afterPage: true, pending: true });
		release();
		await page.waitForFunction(() => document.querySelector('[data-mm-layer="search"] a:not([data-shell])'));
		const filled = await page.evaluate(async () => {
			const parts = (globalThis as { parts?: typeof import('../parts/reveal.ts') }).parts!;
			await parts.loadLayers();
			parts.layersFor('search');
			const nodes = document.querySelectorAll('[data-mm-layer="search"]');
			return { nodes: nodes.length, href: nodes[0]?.querySelector('a:not([data-shell])')?.getAttribute('href'), links: nodes[0]?.querySelectorAll('a:not([data-shell])').length, pending: parts.layersPending() };
		});
		assert.deepEqual(filled, { nodes: 1, href: 'https://new.example/docs', links: 1, pending: false });
		assert.equal(fetches, 1);
	} finally {
		await browser.close();
	}
});

test('a layer the page renders itself is filled from its file when it opens, not when the file lands as the page loads', async () => {
	const reveal = await readFile(join(ROOT, 'parts', 'reveal.ts'), 'utf8').then((text) => ts.transpileModule(text, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText);
	const browser = await chromium.launch();
	try {
		const page = await browser.newPage();
		await page.route('http://app.test/**', async (route) => {
			const path = new URL(route.request().url()).pathname;
			if (path === '/layer.html') return route.fulfill({ contentType: 'text/html', body: '<a href="/docs">Docs</a>' });
			if (path === '/reveal.js') return route.fulfill({ contentType: 'text/javascript', body: reveal });
			return route.fulfill({ contentType: 'text/html', body: '<!doctype html><body><main>page</main><template data-mm-layer-src="/layer.html" data-mm-layer-keys="search"></template><div role="dialog" hidden data-mm-layer="search" data-mm-served="/layer.html"><input><div data-mm-layer-fill="/layer.html"></div><p>rendered</p></div></body>' });
		});
		await page.goto('http://app.test/');
		const loaded = await page.evaluate(async () => {
			const parts = (await import('/reveal.js' as string)) as typeof import('../parts/reveal.ts');
			(globalThis as { parts?: unknown }).parts = parts;
			await parts.loadLayers();
			return { links: document.querySelectorAll('[data-mm-layer="search"] a').length, pending: parts.layersPending() };
		});
		assert.deepEqual(loaded, { links: 0, pending: false });
		const opened = await page.evaluate(() => {
			const nodes = (globalThis as { parts?: typeof import('../parts/reveal.ts') }).parts!.layersFor('search');
			return { nodes: nodes.length, all: document.querySelectorAll('[data-mm-layer="search"]').length, links: nodes[0]?.querySelectorAll('a').length, order: [...(nodes[0]?.children ?? [])].map((c) => c.tagName).join(',') };
		});
		assert.deepEqual(opened, { nodes: 1, all: 1, links: 1, order: 'INPUT,DIV,P' });
	} finally {
		await browser.close();
	}
});

test('a layer captured open loses the interaction state the server never renders, and keeps the state it does', () => {
	const doc = parseDocument(`<body><div role="dialog" data-state="open" data-mm-layer="k">
	<div role="option" data-state="checked" aria-selected="true" data-highlighted="">Apple</div><div role="menuitem" data-highlighted="" data-disabled="">Cut</div>
	<button data-slot="tooltip-trigger" data-state="instant-open" aria-describedby="tip">Copy</button><button data-state="delayed-open" aria-describedby="tip2">Paste</button><button aria-describedby="hint">Plain</button>
	<pre><span data-highlighted-line="">x</span><mark data-highlighted-chars="">y</mark></pre><div data-selected="" aria-selected="true" cmdk-item="">First</div></div></body>`);
	for (const el of walk(body(doc))) atRest(el);
	assert.equal(
		outer(find(body(doc), (e) => e.tagName === 'div')!),
		`<div role="dialog" data-state="closed" data-mm-layer="k">
	<div role="option" data-state="checked" aria-selected="false">Apple</div><div role="menuitem" data-disabled="">Cut</div>
	<button data-slot="tooltip-trigger" data-state="closed">Copy</button><button data-state="closed">Paste</button><button aria-describedby="hint">Plain</button>
	<pre><span data-highlighted-line="">x</span><mark data-highlighted-chars="">y</mark></pre><div data-selected="" aria-selected="true" cmdk-item="">First</div></div>`,
	);
});

test('a site component listed "in": "page" stands in for a page element; a module that renders it imports it', () => {
	const doc = parseDocument('<body><dialog id="s-root"><div data-combobox-root=""><input data-id="search"></div></dialog><div data-combobox-root=""><input data-id="other"></div></body>');
	const site = [
		{ selector: 'div[data-combobox-root]:has(input[data-id="search"])', component: 'search-box.tsrx', in: 'page' as const },
		{ selector: 'div[cmdk-root]', component: 'command-menu.tsrx' },
	];
	const roots = [...walk(body(doc))].filter((el) => el.attrs.some((a) => a.name === 'data-combobox-root'));
	assert.deepEqual(roots.map((el) => pageComponentOf(el, site)?.component), ['search-box.tsrx', undefined]);
	assert.equal(pageComponentOf(parseDocument('<div cmdk-root=""></div>').childNodes[0] as never, site), undefined, 'a layer component is not a page one');
	const source = "// Generated\nexport default function Header() @{\n\t<header><SearchBox /></header>\n}\n";
	assert.equal(withSiteImports(source, site, '../..'), "// Generated\nimport SearchBox from '../../lib/site/search-box.tsrx';\nexport default function Header() @{\n\t<header><SearchBox /></header>\n}\n");
	assert.equal(withSiteImports(source.replace('<SearchBox />', ''), site, '../..'), source.replace('<SearchBox />', ''));
});

test("a page's extras outside its root are bound as its root is: a site component stands in, the parts are recorded", () => {
	const doc = parseDocument('<body><div id="bar"><div data-combobox-root=""><input data-id="search"></div><div data-qui-tabs-root=""></div></div></body>');
	const bar = [...walk(body(doc))].find((el) => el.attrs.some((a) => a.name === 'id' && a.value === 'bar'))!;
	const site = [{ selector: 'div[data-combobox-root]:has(input[data-id="search"])', component: 'search-box.tsrx', in: 'page' as const }];
	const seen: string[] = [];
	const source = extrasModule({ pages: [], before: [], after: [], extras: new Map([['/a/', [bar]]]) }, () => {}, { files: [], served: [], everywhere: [] } as never, (el) => {
		const own = pageComponentOf(el, site);
		if (own) return { replace: `<${componentName(own)} />` };
		if (el.attrs.some((a) => a.name === 'data-qui-tabs-root')) seen.push('tabs');
		return undefined;
	});
	assert.match(source, /<SearchBox \/>/);
	assert.doesNotMatch(source, /data-combobox-root/);
	assert.deepEqual(seen, ['tabs']);
});

test("a page renders its own body children outside its root when they hold something to wire (a site component, a handler); the Document renders the rest", () => {
	const doc = parseDocument('<body><header id="a"><div data-combobox-root=""><input data-id="search"></div></header><header id="b"><a href="/">Home</a></header></body>');
	const [a, b] = [...walk(body(doc))].filter((el) => el.tagName === 'header');
	const site = [{ selector: 'div[data-combobox-root]:has(input[data-id="search"])', component: 'search-box.tsrx', in: 'page' as const }];
	const owned = pagesWiring(new Map([['/one/', [a!]], ['/two/', [b!]]]), (el) => pageComponentOf(el, site) !== undefined);
	assert.deepEqual([...owned.keys()], ['/one/']);
});

test('what a control inside a page site component opens is that component\'s; one with "layers" renders it through its Layers export', () => {
	const doc = parseDocument('<body><main><div data-slot="designer"><iframe title="typeset preview"></iframe><button id="t" aria-haspopup="menu"><span>Body</span></button></div><button id="u" aria-haspopup="menu">Theme</button></main></body>');
	const site = [{ selector: 'div[data-slot="designer"]:has(iframe[title="typeset preview"])', component: 'typeset.tsrx', in: 'page' as const, layers: true }];
	const byId = (id: string) => [...walk(body(doc))].find((el) => el.attrs.some((a) => a.name === 'id' && a.value === id))!;
	assert.equal(inPageComponent(byId('t'), site)?.component, 'typeset.tsrx');
	assert.equal(inPageComponent(byId('t').childNodes[0] as never, site)?.component, 'typeset.tsrx');
	assert.equal(inPageComponent(byId('u'), site), undefined);
	assert.equal(componentImport(site[0]!, '..'), "import Typeset, { Layers as TypesetLayers } from '../lib/site/typeset.tsrx';");
	const tail = "// Generated\nexport default function Page() @{\n\t<><div><Typeset /></div><TypesetLayers /></>\n}\n";
	assert.equal(withSiteImports(tail, site, '..').split('\n')[1], "import Typeset, { Layers as TypesetLayers } from '../lib/site/typeset.tsrx';");
	assert.equal(withSiteImports(tail, site, '..').split('\n').filter((l) => l.startsWith('import')).length, 1);
});

test('the shadcn registry directory\'s Add dialog renders at the end of the body through its Layers export, as Base UI portals it, so its modal hides main', async () => {
	const site = await readSiteComponents(join(import.meta.dirname, '..', 'examples', 'shadcn-ui-markless'));
	const directory = site.find((c) => c.component === 'directory-list.tsrx')!;
	assert.equal(directory.layers, true);
	assert.equal(componentImport(directory, '..'), "import DirectoryList, { Layers as DirectoryListLayers } from '../lib/site/directory-list.tsrx';");
});

test("the parts the site's own code imports are found, so the app gets their files", async () => {
	const app = await mkdtemp(join(tmpdir(), 'site-parts-'));
	try {
		await mkdir(join(app, 'lib', 'site'), { recursive: true });
		await writeFile(join(app, 'lib', 'site', 'a.tsrx'), "import { roving } from '../parts/radix/roving.ts';\nimport { show } from '../parts/base-ui/dialog.ts';\n");
		await writeFile(join(app, 'lib', 'site', 'b.ts'), "import { configure } from '../parts/cmdk.ts';\nimport { x } from './a.tsrx';\n");
		assert.deepEqual(await siteImportedParts(app), ['base-ui/dialog', 'cmdk', 'radix/roving']);
	} finally {
		await rm(app, { recursive: true, force: true });
	}
});

test('a page site component names the library ports its own markup uses; a name that is no port is refused', async () => {
	const app = await mkdtemp(join(tmpdir(), 'site-ports-'));
	try {
		await mkdir(join(app, 'lib', 'site'), { recursive: true });
		const listed = (ports: string[]) => writeFile(join(app, 'lib', 'site', 'components.json'), JSON.stringify([{ selector: 'div[data-slot="designer"]', component: 'create.tsrx', in: 'page', layers: true, ports }]));
		await listed(['cmdk']);
		assert.deepEqual((await readSiteComponents(app))[0]?.ports, ['cmdk']);
		await listed(['cmdkk']);
		await assert.rejects(readSiteComponents(app), /create\.tsrx names "cmdkk", which is not a library port/);
	} finally {
		await rm(app, { recursive: true, force: true });
	}
});

test('a layer every page portals goes in the Document only when it is plain markup: one with a site component or state stays in each page', () => {
	const plain = '<div data-mm-layer="tip" hidden>tip</div>';
	const shell = `<div data-mm-layer="search" hidden data-mm-served="${LAYER_FILL}"><CommandMenu fill="${LAYER_FILL}" /></div>`;
	const search = { key: 'search', markup: '<div data-mm-layer="search" hidden>palette</div>', shell, fill: '<div cmdk-group="">Pages</div>', imports: ["import CommandMenu from '../../../lib/site/command-menu.tsrx';"] };
	const calendar = { key: 'cal', markup: '<div data-mm-layer="cal" hidden>{String(month)}</div>', shell: '', fill: '', declare: ['let month = state(0);'] };
	const tip = { key: 'tip', markup: plain, shell: plain, fill: '' };
	const table = layerTable(new Map([['/a', [search, calendar, tip]], ['/b', [search, calendar, tip]]]));
	const name = (markup: string) => table.files.find((f) => f.source.includes(markup))!.file.replace(/^layers\/layer-(\d+)\.tsrx$/, 'Layer$1');
	assert.deepEqual(table.everywhere, [name(plain)]);
	for (const route of ['/a', '/b']) assert.deepEqual([...table.own(route)].sort(), [name('CommandMenu'), name('String(month)')].sort());
});

test("a Base UI combobox list captured with nothing selected gets the indicator another list on the page showed, hidden on every item", async () => {
	const { comboboxIndicators, comboboxIndicatorIn } = await import('../src/convert/index.ts');
	const { parseFragment } = await import('parse5');
	const { attr: attrOf, walk: walkOf } = await import('../src/convert/dom.ts');
	const list = (selected: boolean) => parseFragment(`<div data-slot="combobox-list"><div role="option" aria-selected="false">Next.js</div><div role="option" aria-selected="${selected}">SvelteKit${selected ? '<span data-selected="" aria-hidden="true" class="check"><svg></svg></span>' : ''}</div></div>`).childNodes[0] as unknown as import('../src/convert/dom.ts').Element;
	const plain = list(false);
	const chosen = list(true);
	comboboxIndicators(plain, comboboxIndicatorIn([plain, chosen]));
	const marks = [...walkOf(plain)].filter((el) => attrOf(el, 'data-mm-indicator') !== undefined);
	assert.equal(marks.length, 2, 'every item has one');
	assert.ok(marks.every((el) => attrOf(el, 'hidden') === '' && attrOf(el, 'data-selected') === undefined && attrOf(el, 'class') === 'check'));
});
