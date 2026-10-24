import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { classifyScript } from '../src/client/classify.ts';
import { Behaviours, pageBehaviours } from '../src/usage/behaviours.ts';
import { parseClassTools, parseHtmxSwap, parseHtmxTarget, parseHtmxTrigger, parseHyperscript, parseAlpineAttribute } from '../src/usage/grammar.ts';
import { describe as name, parseHtml } from '../src/usage/html.ts';
import { implementations } from '../src/usage/implement.ts';
import { obligationsFor } from '../src/usage/obligations.ts';
import { scanUsage } from '../src/usage/scan.ts';
import { analyseScript } from '../src/usage/script.ts';
import { coverage, routeBrief, summarizeUsage } from '../src/usage/summary.ts';

const HTMX_PAGE = `<!doctype html><html><head><script src="/js/htmx.js"></script><script src="/js/_hyperscript.js"></script></head>
<body hx-ext="class-tools, preload">
<header><svg class="hamburger" _="on click toggle .show on #nav"></svg><div id="nav" hx-boost="true"><a href="/docs/">docs</a></div>
<div id="github-stars"><a class="github-button" href="https://github.com/bigskysoftware/htmx" data-show-count="true" aria-label="Star bigskysoftware/htmx on GitHub">star</a></div></header>
<main><div class="dark-hero" classes="add appear:100ms"></div>
<input name="q" hx-post="/search" hx-trigger="keyup changed delay:500ms, search" hx-target="#search-results" hx-swap="outerHTML swap:1s">
<p>Example: <code>&lt;button hx-get="/not-a-use"&gt;</code></p></main>
<script async defer src="https://buttons.github.io/buttons.js"></script></body></html>`;

const DOCUSAURUS_THEME_INIT = `!function(){var t=function(){try{return new URLSearchParams(window.location.search).get("docusaurus-theme")}catch(t){}}()||function(){try{return window.localStorage.getItem("theme-189")}catch(t){}}();document.documentElement.setAttribute("data-theme",t||(window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light")),document.documentElement.setAttribute("data-theme-choice",t||"system")}();`;
const DOCUSAURUS_PAGE = `<!doctype html><html><head><meta name="generator" content="Docusaurus v3.9.2"><script>${DOCUSAURUS_THEME_INIT}</script></head><body><div id="__docusaurus">
<nav class="navbar navbarHideable_uAgx"><button class="navbar__toggle clean-btn" aria-label="Toggle navigation bar"></button>
<div class="toggle_bT41 colorModeToggle_UolE"><button class="clean-btn toggleButton_x9TT" title="system mode"></button></div>
<button class="DocSearch DocSearch-Button" aria-label="Search (Command+K)"><span>Search</span></button></nav>
<details class="details_lb9f alert"><summary>More</summary></details></div></body></html>`;

test('the HTML tokenizer reads attributes, raw text and parents, and names elements by id, class and text', () => {
	const els = parseHtml(`<div id=a class="x y"><p>one<p>two</div><script>if (a < b) {}</script><img src=x.png>`);
	assert.deepEqual(els.map((e) => e.tag), ['div', 'p', 'p', 'script', 'img']);
	assert.equal(els[2]!.parent?.tag, 'div', 'a <p> closes the open <p>');
	assert.equal(els[3]!.text, 'if (a < b) {}');
	assert.equal(name(els[1]!), 'p in div#a.x.y "one"');
});

test('htmx, class-tools, _hyperscript and Alpine attributes are read by their own grammars', () => {
	assert.deepEqual(parseHtmxTrigger('keyup changed delay:500ms, search'), [{ event: 'keyup', modifiers: { changed: true, delay: '500ms' } }, { event: 'search', modifiers: {} }]);
	assert.deepEqual(parseHtmxTrigger('every 2s [ready()]'), [{ event: 'every', every: '2s', filter: 'ready()', modifiers: {} }]);
	assert.deepEqual(parseHtmxSwap('outerHTML swap:1s settle:2s'), { style: 'outerHTML', modifiers: { swap: '1s', settle: '2s' } });
	assert.deepEqual(parseHtmxTarget('closest tr'), { relation: 'closest', selector: 'tr' });
	assert.deepEqual(parseClassTools('add foo:1s, remove foo:2s & toggle bar'), [{ run: 0, op: 'add', className: 'foo', delay: '1s' }, { run: 0, op: 'remove', className: 'foo', delay: '2s' }, { run: 1, op: 'toggle', className: 'bar', delay: '100ms' }]);
	const [feature] = parseHyperscript('on click toggle .show on #nav');
	assert.deepEqual([feature!.events, feature!.commands.map((c) => c.name), feature!.classes, feature!.targets], [['click'], ['toggle'], ['show'], ['#nav']]);
	assert.deepEqual(parseAlpineAttribute('@click.outside'), { directive: 'x-on', value: 'click', modifiers: ['outside'] });
	assert.deepEqual(parseAlpineAttribute(':class'), { directive: 'x-bind', value: 'class', modifiers: [] });
});

test('a page is read for every behaviour its markup uses, and a code sample in its text is not a use', () => {
	const into = new Behaviours();
	const scripts = pageBehaviours(parseHtml(HTMX_PAGE), '/', into);
	const list = into.list();
	const features = list.map((b) => `${b.library} ${b.feature}`).sort();
	assert.deepEqual(features, ['class-tools classes', 'embed GitHub button', 'htmx extension class-tools', 'htmx extension preload', 'htmx hx-boost', 'htmx hx-post', 'hyperscript on click']);
	const post = list.find((b) => b.feature === 'hx-post')!;
	assert.deepEqual(post.details.target, { relation: 'selector', selector: '#search-results' });
	assert.equal((post.details.swap as { style: string }).style, 'outerHTML');
	assert.match(post.summary, /^keyup or search on input: POST \/search, swap outerHTML into selector #search-results$/);
	assert.ok(list.every((b) => b.sites.every((s) => 'line' in s && typeof s.line === 'number')), 'every site has a line in the served page');
	assert.deepEqual(scripts.map((s) => s.src), ['/js/htmx.js', '/js/_hyperscript.js', 'https://buttons.github.io/buttons.js']);
	const star = list.find((b) => b.kind === 'embed-frame')!;
	assert.equal(star.details.embed, 'github-button-bigskysoftware-htmx-star');
	const obligations = obligationsFor(star);
	assert.deepEqual(obligations.map((o) => o.mechanism), ['embed', 'embed', 'embed']);
	assert.match(obligations[0]!.text, /\[data-markless-embed="github-button-bigskysoftware-htmx-star"\] shows the same pixels as the settled old embed, at desktop and mobile, in light and dark/);
	assert.match(obligations[2]!.text, /activated by click and by keyboard/);
});

test('a plain script is read from its syntax tree: a theme-init script is one behaviour, and a listener carries what its handler does', () => {
	const theme = analyseScript(DOCUSAURUS_THEME_INIT);
	assert.deepEqual(theme.effects.map((e) => e.kind).sort(), ['dom-write', 'dom-write', 'media-query', 'storage']);
	const click = analyseScript(`document.querySelector('.menu').addEventListener('click', function () { document.body.classList.toggle('open'); localStorage.setItem('menu', '1'); });`);
	const listener = click.effects.findIndex((e) => e.kind === 'listener');
	assert.deepEqual(click.effects.filter((e) => e.in === listener).map((e) => e.kind), ['dom-write', 'storage']);
	const lib = analyseScript(`var server = sinon.fakeServer.create(); server.respondWith('GET', '/x', 'ok'); onGet('/contact/1', function () {});`, 1, new Map([['onGet', '/js/demo.js']]));
	assert.deepEqual(lib.effects.filter((e) => e.kind === 'library-call').map((e) => (e.kind === 'library-call' ? `${e.library} ${e.call}` : '')), ['sinon sinon.fakeServer.create', 'sinon sinon:server.respondWith', '/js/demo.js onGet']);
});

test('another framework is recognised by what its code defines, never by a page that talks about it', () => {
	assert.deepEqual(classifyScript(`var htmx = { onLoad: null, process: null, on: null, off: null, trigger: null, ajax: null, find: null, findAll: null, closest: null, values: null, remove: null, defineExtension: null };`).runtimes, ['htmx']);
	assert.deepEqual(classifyScript(`htmx.defineExtension('class-tools', { onEvent: function () {} });`).runtimes, ['htmx']);
	assert.deepEqual(classifyScript(`var a = Symbol.for("react.transitional.element");`).runtimes, ['react']);
	assert.deepEqual(classifyScript(`if (r.__v_isRef) return r.value;`).runtimes, ['vue']);
	assert.deepEqual(classifyScript(`export default ["htmx:configRequest fires before a request", "React's Symbol.for('react.element')", "_hyperscript"];`).runtimes, [], 'docs text about htmx and React is not their runtime');
});

test('theme features are recognised only on a page that theme drew, and the config sets the colour-mode cycle', async () => {
	const dir = await mkdtemp(join(tmpdir(), 'mm-usage-'));
	await mkdir(join(dir, 'built', 'docs'), { recursive: true });
	await writeFile(join(dir, 'built', 'docs', 'index.html'), DOCUSAURUS_PAGE);
	await writeFile(join(dir, 'built', 'other.html'), DOCUSAURUS_PAGE.replace('Docusaurus v3.9.2', 'Hugo').replace('__docusaurus', 'main'));
	await mkdir(join(dir, 'src'));
	await writeFile(join(dir, 'src', 'docusaurus.config.ts'), `export default { themeConfig: { colorMode: { defaultMode: 'light', respectPrefersColorScheme: true }, docs: { sidebar: { hideable: true } } } };`);
	const usage = await scanUsage({ built: join(dir, 'built'), routes: ['/docs/', '/other', '/missing'], source: join(dir, 'src') });
	assert.equal(usage.pages, 2);
	const toggle = usage.behaviours.find((b) => b.kind === 'color-mode')!;
	assert.deepEqual(toggle.routes, ['/docs/'], 'the Hugo page is not read as a Docusaurus page');
	assert.deepEqual(toggle.details.settings, { defaultMode: 'light', respectPrefersColorScheme: true });
	assert.ok(toggle.sites.some((s) => 'file' in s && s.file === 'docusaurus.config.ts' && s.line === 1));
	const cycle = usage.obligations.filter((o) => o.behaviour === toggle.id && o.mechanism === 'scheme-sequence');
	assert.equal(cycle.length, 2);
	assert.match(cycle[0]!.text, /3 times \(one full cycle: system → light → dark → system\) with the OS in light mode/);
	assert.match(cycle[1]!.text, /with the OS in dark mode/);
	const search = usage.behaviours.find((b) => b.kind === 'search')!;
	assert.ok(usage.obligations.some((o) => o.behaviour === search.id && /close by Escape, by clicking the backdrop and by its close button/.test(o.text)));
	assert.ok(usage.behaviours.some((b) => b.kind === 'theme-init' && /data-theme/.test(b.summary)), 'the inline theme-init script is read');
	const platforms = usage.obligations.filter((o) => o.behaviour === search.id && o.mechanism === 'load-state').map((o) => o.steps[0]);
	assert.deepEqual(platforms.map((s) => (s?.do === 'load' ? s.emulate?.platform : undefined)), ['MacIntel', 'Win32', 'Linux x86_64'], 'the search shortcut keys are checked per platform');
	assert.ok(usage.obligations.some((o) => o.behaviour === toggle.id && /in the click's own frame/.test(o.text)), 'the first toggle click must not wait for the site code');
	const hideable = usage.behaviours.find((b) => b.feature === 'hideable navbar')!;
	assert.ok(usage.obligations.some((o) => o.behaviour === hideable.id && o.mechanism === 'navigation-equivalence' && /go Back/.test(o.text)));
	const drawer = usage.behaviours.find((b) => b.feature === 'mobile navbar sidebar')!;
	assert.ok(usage.obligations.some((o) => o.behaviour === drawer.id && /each dropdown inside it/.test(o.text)));
});

test('implemented means declared in usage-map.json and found in the new app; checked means every obligation is one this checker performs', async () => {
	const app = await mkdtemp(join(tmpdir(), 'mm-new-'));
	await mkdir(join(app, 'components'));
	await writeFile(join(app, 'components', 'nav.tsrx'), `import { modal } from '@markless/ui';\nexport default function Nav() @{ <nav /> }\n`);
	const into = new Behaviours();
	pageBehaviours(parseHtml(HTMX_PAGE), '/', into);
	const behaviours = into.list();
	const toggle = behaviours.find((b) => b.library === 'hyperscript')!;
	const star = behaviours.find((b) => b.kind === 'embed-frame')!;
	const boost = behaviours.find((b) => b.kind === 'boost')!;
	const map = { [toggle.id]: { by: 'components/nav.tsrx' }, [star.id]: { by: 'components/missing.tsrx' }, 'htmx:extension*': { by: '@markless/ui modal' }, [boost.id]: { by: '@markless/ui tabs' } };
	const impl = await implementations(behaviours, map, app);
	const status = (id: string) => impl.find((i) => i.behaviour === id)!;
	assert.equal(status(toggle.id).status, 'implemented');
	assert.equal(status(star.id).status, 'unimplemented');
	assert.match(status(star.id).suggestion!, /no such file/);
	assert.equal(behaviours.filter((b) => b.feature.startsWith('extension')).every((b) => status(b.id).status === 'implemented'), true, 'a pattern names many behaviours; the part is imported');
	assert.match(status(boost.id).suggestion!, /does not import it/);
	const obligations = behaviours.flatMap(obligationsFor);
	const c = coverage({ behaviours, obligations }, impl);
	assert.equal(c.used, 7);
	assert.equal(c.implemented, 3);
	assert.ok(c.checked < c.used, 'a toggle needs sequences and pinned frames, which this checker does not perform yet');
	assert.ok(c.obligations.checkable < c.obligations.total);
	const text = summarizeUsage({ version: 1, generatedAt: '', pages: 1, behaviours, obligations, scripts: [{ script: '/js/htmx.js', routes: ['/'], bytes: 1, runtime: 'htmx', effects: 0, parsed: true }], limits: [] }, impl);
	assert.match(text, /used 7 \/ implemented in Markless 3 \(43%\) \/ checked \d+/);
	assert.match(text, /Runtimes the old pages load, none of which the port may ship .*: htmx/);
	const brief = routeBrief({ version: 1, generatedAt: '', pages: 1, behaviours, obligations, scripts: [], limits: [] }, impl, '/')!;
	assert.match(brief, /\[implemented by components\/nav\.tsrx\] hyperscript:on click:/);
	assert.match(brief, /check: .*use it twice and three times/);
	assert.match(brief, /record where in \.migrate\/usage-map\.json/);
});

test('a JavaScript-only library is a kept library with its own checks, never a foreign runtime; a framework stays forbidden', async () => {
	const dir = await mkdtemp(join(tmpdir(), 'mm-kept-'));
	await mkdir(join(dir, 'js'), { recursive: true });
	await writeFile(join(dir, 'js', 'chart.umd.js'), '/*! Chart.js v4.4.1 | MIT */ !function(t,e){t.Chart=e()}(this,function(){return {}});');
	await writeFile(join(dir, 'index.html'), '<!doctype html><html><body><canvas id="c"></canvas><script src="/js/chart.umd.js"></script><script>new Chart(document.getElementById("c"), { type: "bar" });</script></body></html>');
	assert.deepEqual(classifyScript('/*! Chart.js v4.4.1 | MIT */ !function(t,e){t.Chart=e()}(this,function(){return {}});'), { runtimes: [], libraries: ['chart.js'], parsed: true });
	const usage = await scanUsage({ built: dir, routes: ['/'] });
	assert.deepEqual(usage.scripts.find((s) => s.script === '/js/chart.umd.js')?.runtime, 'kept library chart.js');
	const kept = usage.behaviours.find((b) => b.kind === 'library')!;
	assert.equal(kept.library, 'chart.js');
	assert.deepEqual(usage.obligations.filter((o) => o.behaviour === kept.id).map((o) => o.mechanism), ['client-guard', 'journey']);
	assert.ok(usage.behaviours.some((b) => b.library === 'chart.js' && b.feature === 'new Chart'), 'the page\'s own call into it is listed');
	assert.match(summarizeUsage(usage, []), /Kept libraries \(JavaScript only, kept as they are; .*\): chart\.js/);
});

test("a minified chunk binding $ is not jQuery, and a page framework's own build chunks are its code, not plain scripts", async () => {
	assert.deepEqual(analyseScript('function f($){ return $("x") }').effects, [], 'a parameter named $ is the script\'s own');
	assert.equal(analyseScript('jQuery(".a").hide()').effects[0]?.kind, 'library-call', 'the jQuery global is still a use');
	const dir = await mkdtemp(join(tmpdir(), 'mm-usage-'));
	await mkdir(join(dir, 'built', '_next', 'static'), { recursive: true });
	await writeFile(join(dir, 'built', '_next', 'static', 'chunk.js'), 'document.addEventListener("keydown", () => {})');
	await writeFile(join(dir, 'built', 'own.js'), 'document.addEventListener("keydown", () => {})');
	await writeFile(join(dir, 'built', 'index.html'), '<html><body><script src="/_next/static/chunk.js"></script><script src="/own.js"></script><script>(self.__next_f=self.__next_f||[]).push([0])</script></body></html>');
	const usage = await scanUsage({ built: join(dir, 'built'), routes: ['/'] });
	assert.equal(usage.scripts.find((s) => s.script.endsWith('/_next/static/chunk.js'))?.runtime, 'Next.js build');
	assert.equal(usage.scripts.find((s) => s.script.endsWith('/own.js'))?.effects, 1, 'a script outside the build is still read');
});
