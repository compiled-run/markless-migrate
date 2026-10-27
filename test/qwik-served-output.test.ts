import assert from 'node:assert/strict';
import { test } from 'node:test';
import { frameworkRuntime } from '../src/check/automatic.ts';
import { runtimeMarkers } from '../src/check/residue.ts';
import { classifyScript } from '../src/client/classify.ts';
import { cleanDocument, frameworkBuilds } from '../src/convert/clean.ts';
import { body, find, head, outer, parseDocument, walk } from '../src/convert/dom.ts';
import { emitElement } from '../src/convert/tsrx.ts';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scanUsage } from '../src/usage/scan.ts';

// A Qwik City page as its static adapter serves it, cut down from qwikui.com (Qwik 1.17): the container attributes on
// <html>, handlers as QRL attributes, the loader, the paused state and its functions, the preloader, Qwik Insights'
// symbol listener, an event-holder script, and the app's own theme and search scripts.
const QWIK_PAGE = `<!DOCTYPE html><html lang="en-us" q:render="static-ssr" q:route="docs/tabs/" q:container="paused" q:version="1.17.0" q:base="/build/" q:locale="" q:manifest-hash="fi0dii" q:instance="rp8er8qds8g"><head q:head>
<meta charset="utf-8" q:head><link rel="canonical" href="https://example.test/docs/tabs/" q:id="3" q:head>
<script q:head>(function jo(){window.symbols=[],document.addEventListener("qsymbol",r=>window.symbols.push(r.detail.symbol))})()</script>
<link rel="modulepreload" href="/build/q-BKZ00VYc.js"><link rel="preload" href="/assets/Cbo83sO5-bundle-graph.json" as="fetch" crossorigin="anonymous">
<link rel="stylesheet" href="/assets/app-D1.css">
<script id="qwikloader" type="module" async="true">const t=document,e=window;if(!("__q_context__"in t)){t.__q_context__=0;const r=e.qwikevents;e.qwikevents={events:new Set,roots:new Set,push:()=>{}}}</script>
<script type="module" async="true">let b=fetch("/assets/Cbo83sO5-bundle-graph.json");import("/build/q-BKZ00VYc.js").then(({l})=>l("/build/",b));</script>
</head><body lang="en"><!--qv q:id=0 q:key=p3c5:nM_0--><script on-document:qidle="q-BC6Kx2C9.js#_hW[0]" on-window:storage="q-CIMZ6e89.js#s_yd[1 2 3]" q:key="bW_0" q:id="6">!function(){var c=document.documentElement.classList;c.add(localStorage.getItem('theme')||'dark')}()</script>
<div q:key="fL_1"><button type="button" class="tab" role="tab" aria-selected="true" on:click="q-axITfEPt.js#s_x[0 1]" on:keydown="q-axITfEPt.js#s_y[0]" q:id="1y">Preview</button><!--/qv--></div>
<q:template q:slot="hidden" hidden aria-hidden="true"><p>unprojected</p></q:template>
<script hidden q:id="2z" on-window:scroll="q-DYTO1lTf.js#s_4D[0 1]"></script>
<script on-document:qcinit="q-B_TVhkQy.js#s_jk" on-document:qinit="#0" q:key="li_1"></script>
<script>window.addEventListener('initPagefind', async () => { window.pagefind = await import("/pagefind/pagefind.js"); });</script>
<script type="module" q:type="preload" async>window.addEventListener('load',f=>{f=_=>import("/build/q-BKZ00VYc.js").then(({p})=>p(["q-CIMZ6e89.js"],-10));f()})</script>
<script type="qwik/json">{"refs":{"6":"nc 9h"},"ctx":{},"objs":[]}</script>
<script q:func="qwik/json">document["qFuncs_rp8er8qds8g"]=[()=>{document.dispatchEvent(new Event("qcinit"))}]</script>
<script>(window.qwikevents||(window.qwikevents=[])).push("qidle","storage","click","keydown")</script>
</body></html>`;

const clean = () => {
	const doc = parseDocument(QWIK_PAGE);
	const dropped = new Map<string, number>();
	cleanDocument(doc, { builds: frameworkBuilds(QWIK_PAGE).map((b) => b.path), frameworkScripts: new Set(), origin: 'http://old' }, dropped);
	return { doc, dropped };
};

test('a Qwik page is recognised by its container, and its build is where q:base says', () => {
	const builds = frameworkBuilds(QWIK_PAGE);
	assert.deepEqual(builds.map((b) => b.framework), ['Qwik']);
	assert.ok(builds[0]!.path.test('/build/q-BKZ00VYc.js'));
	assert.ok(builds[0]!.path.test('/assets/Cbo83sO5-bundle-graph.json'), "the preloader's bundle graph is Qwik's own build output");
	assert.ok(!builds[0]!.path.test('/assets/app-D1.css'));
	const elsewhere = frameworkBuilds(QWIK_PAGE.replace('q:base="/build/"', 'q:base="/static/qwik/"'));
	assert.ok(elsewhere[0]!.path.test('/static/qwik/q-BKZ00VYc.js'));
	assert.ok(!elsewhere[0]!.path.test('/build/q-BKZ00VYc.js'));
	assert.deepEqual(frameworkBuilds('<html><body><p>q:container is an attribute Qwik writes</p></body></html>'), []);
});

test("Qwik's runtime leaves the page: loader, state, preloader, event holders, unprojected slots, QRL handlers and container attributes", () => {
	const { doc, dropped } = clean();
	const html = outer(find(doc, (el) => el.tagName === 'html')!);
	assert.doesNotMatch(html, /qwikevents|qwik\/json|qFuncs_|__q_context__|bundle-graph|\/build\/q-|qsymbol|q:template|unprojected/);
	assert.doesNotMatch(html, /\sq:[\w-]+=|\son(?:-window|-document)?:[\w-]+=/, 'no q:* attribute and no QRL handler attribute is left');
	for (const el of walk(doc)) for (const a of el.attrs) assert.doesNotMatch(a.name, /^q:|^on(?:-window|-document)?:/, `<${el.tagName} ${a.name}>`);
	assert.ok([...dropped.keys()].some((k) => /Qwik/.test(k)), [...dropped.keys()].join('; '));
});

test("the app's own scripts, stylesheets and markup stay as the Qwik page had them", () => {
	const { doc } = clean();
	const page = emitElement(body(doc));
	assert.match(page, /localStorage\.getItem\('theme'\)/, "the theme script is the app's, though Qwik hung handlers on its element");
	assert.match(page, /initPagefind/);
	assert.match(page, /role="tab"/);
	assert.match(page, /aria-selected="true"/);
	assert.match(outer(head(doc)), /app-D1\.css/);
	assert.match(outer(head(doc)), /rel="canonical"/);
	const scripts = [...walk(doc)].filter((el) => el.tagName === 'script');
	assert.equal(scripts.length, 2, 'the theme and search scripts, nothing else');
});

test("a port carrying Qwik's container or state is red in http; a page that only shows them in a code sample is not", () => {
	const markers = runtimeMarkers(QWIK_PAGE, 'served').map((m) => [m.marker, m.framework]);
	assert.ok(markers.some(([m, f]) => m === 'q:container' && f === 'Qwik'), JSON.stringify(markers));
	assert.ok(markers.some(([m]) => m === '<script type="qwik/json">'), JSON.stringify(markers));
	assert.ok(markers.some(([m]) => m === 'window.qwikevents'), JSON.stringify(markers));
	assert.deepEqual(runtimeMarkers('<pre><code>&lt;html q:container="paused"&gt;</code></pre><script>const s = "<script type=\\"qwik/json\\">";</script>', 'served'), []);
});

test("Qwik's loader and core are recognised as Qwik's runtime by what their code does", () => {
	const loader = /<script id="qwikloader"[^>]*>([\s\S]*?)<\/script>/.exec(QWIK_PAGE)![1]!;
	assert.deepEqual(classifyScript(loader).runtimes, ['qwik']);
	const core = `const QContainerAttr="q:container";function getContainer(e){return e.closest("[q\\\\:container]")}const s=document.querySelector('script[type="qwik/json"]');`;
	assert.deepEqual(classifyScript(core).runtimes, ['qwik']);
	assert.equal(frameworkRuntime(core), 'Qwik');
	assert.deepEqual(classifyScript('document.body.dataset.note = "Qwik resumes where the server stopped";').runtimes, []);
});

test("usage counts the app's own inline scripts as behaviours to port, and none of Qwik's", async () => {
	const built = await mkdtemp(join(tmpdir(), 'qwik-usage-'));
	await writeFile(join(built, 'index.html'), QWIK_PAGE);
	const usage = await scanUsage({ built, routes: ['/'] });
	const summaries = usage.behaviours.map((b) => b.summary).join('\n');
	assert.doesNotMatch(summaries, /bundle-graph|qsymbol|qwikevents/, summaries);
	assert.match(summaries, /theme/, "the theme script's storage read is the app's");
	assert.match(summaries, /initPagefind/);
	// The loader, the qwikevents push, the two preloaders, Qwik Insights' listener and the serialised functions.
	const qwik = usage.scripts.filter((s) => /Qwik/.test(s.runtime ?? ''));
	assert.equal(qwik.length, 6, JSON.stringify(usage.scripts.map((s) => [s.script.slice(0, 40), s.runtime])));
});
