import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { chromium, type Browser } from 'playwright';
import { applyAccepted, type Accept } from '../src/check/accepted.ts';
import { runCheck } from '../src/check/run.ts';
import { embedCandidate, embedImageCandidate, frameworkMarkup, frameworkRuntime, markupCandidate, runtimeCandidate, thirdPartyEmbeds } from '../src/check/automatic.ts';
import { migrationSection, renderHtml } from '../src/check/html.ts';
import { summarize } from '../src/check/summary.ts';
import { DIMENSIONS, VIEWPORTS, type AssetRecord, type Failure, type PageCapture, type Report, type RouteResult } from '../src/check/types.ts';
import { readOverrides, rulesOff } from '../src/overrides.ts';

let browser: Browser;
let thirdParty: Server;
let thirdPartyOrigin = '';
before(async () => {
	browser = await chromium.launch();
	thirdParty = createServer((_, res) => res.writeHead(200, { 'content-type': 'text/html' }).end('<p>1,234 stars</p>'));
	await new Promise<void>((resolve) => thirdParty.listen(0, '127.0.0.1', resolve));
	thirdPartyOrigin = `http://localhost:${(thirdParty.address() as { port: number }).port}`;
});
after(async () => {
	await browser?.close();
	thirdParty?.close();
});

const failure = (over: Partial<Failure>): Failure => ({ route: '/', dimension: 'rendered', check: 'accessibility tree', expected: 'x', actual: 'y', hint: 'h', ...over });
const route = (failures: Failure[]): RouteResult => ({
	route: failures[0]?.route ?? '/',
	ok: failures.length === 0,
	dimensions: Object.fromEntries(DIMENSIONS.map((d) => [d, failures.some((f) => f.dimension === d) ? 'fail' : 'pass'])) as RouteResult['dimensions'],
	failures,
	weight: { old: { downloaded: 0, source: 0, executed: 0 }, new: { downloaded: 0, source: 0, executed: 0 } },
	visualDiffs: [],
	shots: [],
});
const report = (routes: RouteResult[]): Report => ({ version: 1, old: 'http://127.0.0.1:3000', new: 'http://127.0.0.1:4000', startedAt: '2026-10-18T10:00:00Z', ok: routes.every((r) => r.ok), routes });
const page = (over: Partial<PageCapture>): PageCapture => over as PageCapture;
const script = (over: Partial<AssetRecord>): AssetRecord => ({ url: '/react.js', type: 'script', status: 200, contentType: 'text/javascript', bytes: 1, fingerprinted: false, ...over });

test("a script carrying a UI framework's runtime is recognised; app code is not", () => {
	assert.equal(frameworkRuntime('var a=Symbol.for("react.transitional.element");function x(){}'), 'React');
	assert.equal(frameworkRuntime('self.__next_f=self.__next_f||[];Symbol.for("react.element")'), 'Next.js');
	assert.equal(frameworkRuntime('const app=createApp();window.__VUE_PROD_DEVTOOLS__=false'), 'Vue');
	assert.equal(frameworkRuntime('document.addEventListener("htmx:configRequest",a);on("htmx:afterSwap",b)'), 'htmx');
	assert.equal(frameworkRuntime('(globalThis.rspackChunkwebsite||=[]).push([[98889],{42192(o){}}]);'), 'webpack');
	assert.equal(frameworkRuntime('(self.webpackChunkapp=self.webpackChunkapp||[]).push([[1],{}]);'), 'webpack');
	assert.equal(frameworkRuntime('document.querySelector("#menu").addEventListener("click", open)'), undefined);
	assert.equal(frameworkRuntime('// mentions htmx:configRequest only'), undefined, 'htmx needs both of its events');
});

test('old-framework-runtime: only a framework script the new page does not request is a candidate', () => {
	assert.equal(runtimeCandidate(script({ runtime: 'React' }), false)?.rule, 'old-framework-runtime');
	assert.match(runtimeCandidate(script({ runtime: 'React' }), false)!.reason, /\/react\.js carries React's runtime and the new page does not request it/);
	assert.equal(runtimeCandidate(script({ runtime: 'React' }), true), undefined, 'a script the new page asks for and does not get is broken, not retired');
	assert.equal(runtimeCandidate(script({}), false), undefined, 'a script with no framework runtime may be an embed others load');
	assert.equal(runtimeCandidate(script({ type: 'image', runtime: 'React' }), false), undefined);
});

test("framework-markup: a missing accessibility tree line the old framework's own markup explains is a candidate", () => {
	const announcer = { framework: 'Next.js', what: 'route announcer', selector: 'next-route-announcer', roles: ['alert'], text: '' };
	const old = page({ internals: [announcer] });
	assert.equal(markupCandidate('  - alert', '(absent)', old, page({}))?.rule, 'framework-markup');
	assert.match(markupCandidate('- alert', '(absent)', old, page({}))!.reason, /Next\.js's route announcer \(next-route-announcer\)/);
	assert.equal(markupCandidate('- alert "Saved"', '(absent)', old, page({})), undefined, 'a named alert is the page talking, not the announcer');
	assert.equal(markupCandidate('- alert', '- status', old, page({})), undefined, 'only a line that is gone');
	assert.equal(markupCandidate('- alert', '(absent)', old, page({ internals: [announcer] })), undefined, 'the new page has the same markup');
	assert.equal(markupCandidate('- alert', '(absent)', page({}), page({})), undefined);
});

test('live-embed: pixels that differ only inside a third-party embed both pages load from the same address', () => {
	const embed = { tag: 'iframe' as const, src: 'https://ghbtns.com/github-btn.html?user=bigskysoftware&repo=htmx&type=star&count=true', box: { x: 100, y: 200, width: 150, height: 20 } };
	const old = page({ embeds: [embed] });
	const same = page({ embeds: [{ ...embed, box: { ...embed.box, x: 102 } }] });
	const inside = [{ x: 210, y: 202, width: 30, height: 14 }];
	assert.equal(embedCandidate(inside, old, same)?.rule, 'live-embed');
	assert.match(embedCandidate(inside, old, same)!.reason, /inside an embed from ghbtns\.com that both pages load from the same address/);
	assert.equal(embedCandidate([...inside, { x: 0, y: 0, width: 50, height: 50 }], old, same), undefined, 'a difference outside the embed is the page');
	assert.equal(embedCandidate(inside, old, page({})), undefined, 'the embed must be on the new page too');
	assert.equal(embedCandidate(inside, old, page({ embeds: [{ ...embed, src: 'https://ghbtns.com/github-btn.html?repo=other' }] })), undefined, 'another embed is another thing');
	assert.equal(embedCandidate(inside, old, page({ embeds: [{ ...embed, box: { ...embed.box, y: 400 } }] })), undefined, 'a moved embed is a layout difference');
	const badge = page({ embeds: [{ tag: 'img', src: 'https://img.shields.io/github/stars/x', box: { x: 0, y: 0, width: 80, height: 20 } }] });
	assert.equal(embedImageCandidate('https://img.shields.io/github/stars/x', badge, badge)?.rule, 'live-embed');
	assert.equal(embedImageCandidate('https://img.shields.io/github/stars/x', badge, page({})), undefined);
});

test('applyAccepted grants candidates as "accepted automatically", keeps person-accepted ones apart, and honours rules turned off', () => {
	const runtime = failure({ dimension: 'assets', check: 'script /react.js', expected: '200 application/javascript', actual: '404 text/plain', automatic: { rule: 'old-framework-runtime', reason: '/react.js carries React' } });
	const title = failure({ dimension: 'seo', check: 'title', expected: 'A', actual: 'B' });
	const person: Accept = { route: '/', dimension: 'seo', check: 'title', reason: 'renamed', by: 'Jo', date: '2026-10-16' };
	const applied = applyAccepted(report([route([runtime, title])]), [person]);
	assert.equal(applied.routes[0]!.ok, true);
	assert.deepEqual(applied.routes[0]!.failures.map((f) => [f.check, f.accepted?.by, f.accepted?.automatic]), [['script /react.js', 'markless-migrate', 'old-framework-runtime'], ['title', 'Jo', undefined]]);
	assert.equal(applied.acceptedCount, 2);
	assert.equal(applied.automaticCount, 1);
	const text = summarize(applied);
	assert.match(text, /accepted automatically: the old framework's own code, which the new page no longer loads: assets: script \/react\.js {2}\[[0-9a-f]{10}\]\n +evidence: \/react\.js carries React/);
	assert.match(text, /accepted seo: title/);
	assert.match(text, /2 accepted differences \(1 automatically\)\./);
	const html = renderHtml(applied);
	assert.match(html, /<span class="badge accepted">accepted automatically<\/span>/);
	assert.match(html, /accepted automatically: the old framework&#39;s own code|accepted automatically: the old framework's own code/);

	const off = applyAccepted(report([route([runtime])]), [], ['old-framework-runtime']);
	assert.equal(off.routes[0]!.ok, false);
	assert.equal(off.routes[0]!.failures[0]!.accepted, undefined);
});

test('framework markup is accepted only when the accessibility tree and the announcements otherwise match', () => {
	const announcer = failure({ expected: '- alert', actual: '(absent)', automatic: { rule: 'framework-markup', reason: "Next.js's route announcer" } });
	const both = [announcer, { ...announcer, viewport: 'mobile' }];
	assert.equal(applyAccepted(report([route(both)]), []).routes[0]!.ok, true, 'the announcer on both viewports, nothing else');
	const heading = failure({ expected: '- heading "About"', actual: '(absent)' });
	assert.equal(applyAccepted(report([route([announcer, heading])]), []).routes[0]!.failures[0]!.accepted, undefined, 'another tree difference keeps it open');
	const spoken = failure({ dimension: 'behaviour', check: 'click button "Save"', expected: 'announced: Saved', actual: 'announced: (nothing)' });
	assert.equal(applyAccepted(report([route([announcer, spoken])]), []).routes[0]!.failures[0]!.accepted, undefined, 'a different announcement keeps it open');
	const other = failure({ dimension: 'css', check: 'color' });
	const withCss = applyAccepted(report([route([announcer, other])]), []).routes[0]!;
	assert.equal(withCss.failures[0]!.accepted?.automatic, 'framework-markup', 'differences elsewhere do not hold it back');
	assert.equal(withCss.ok, false);
});

test('in a real page: the route announcer in a shadow root and cross-origin embeds are found, with page coordinates', async () => {
	const p = await browser.newPage();
	await p.route('http://app.test/', (r) => r.fulfill({ contentType: 'text/html', body: `<body style="margin:0"><div style="height:300px"></div><iframe src="${thirdPartyOrigin}/btn" style="width:150px;height:20px;border:0"></iframe><img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" width="5" height="5"><script>const a = document.createElement('next-route-announcer'); const r = a.attachShadow({ mode: 'open' }); r.innerHTML = '<p aria-live="assertive" role="alert"></p>'; document.body.append(a);</script></body>` }));
	await p.goto('http://app.test/');
	assert.deepEqual(await p.evaluate(frameworkMarkup), [{ framework: 'Next.js', what: 'route announcer', selector: 'next-route-announcer', roles: ['alert'], text: '' }]);
	const embeds = await p.evaluate(thirdPartyEmbeds);
	assert.deepEqual(embeds.map((e) => [e.tag, e.src, e.box.y, e.box.width]), [['iframe', `${thirdPartyOrigin}/btn`, 300, 150]], 'a same-page data: image is no embed');
	await p.close();
});

test('.migrate/overrides.json is optional, and what it says is validated', async () => {
	const dir = await mkdtemp(join(tmpdir(), 'mm-overrides-'));
	assert.deepEqual(await readOverrides(dir), {});
	await writeFile(join(dir, 'overrides.json'), JSON.stringify({ libraries: { 'chart.js': 'port' }, automatic: { 'live-embed': false } }));
	const o = await readOverrides(dir);
	assert.deepEqual(o.libraries, { 'chart.js': 'port' });
	assert.deepEqual(rulesOff(o), ['live-embed']);
	await writeFile(join(dir, 'overrides.json'), JSON.stringify({ libraries: { 'chart.js': 'island' } }));
	await assert.rejects(readOverrides(dir), /libraries\["chart\.js"\] must be "port" or "direct"/);
	await writeFile(join(dir, 'overrides.json'), JSON.stringify({ automatic: { everything: true } }));
	await assert.rejects(readOverrides(dir), /automatic\["everything"\] is not a rule/);
});

function app(html: string, files: Record<string, string> = {}): Promise<Server> {
	const server = createServer((req, res) => {
		if (req.url === '/') return res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(html);
		const body = files[req.url ?? ''];
		if (body !== undefined) return res.writeHead(200, { 'content-type': 'text/javascript' }).end(body);
		res.writeHead(404, { 'content-type': 'text/plain' }).end('not found');
	});
	return new Promise((done) => server.listen(0, '127.0.0.1', () => done(server)));
}

test('check: the old React bundle and Next route announcer the Markless page no longer has are accepted automatically and the route is green', async () => {
	const page = (extra: string) => `<!doctype html><html lang="en"><head><title>Home</title></head><body><main><h1>Home</h1><p>Welcome.</p></main>${extra}</body></html>`;
	const reactBundle = "var e=Symbol.for('react.transitional.element');var a=document.createElement('next-route-announcer');var r=a.attachShadow({mode:'open'});r.innerHTML='<p aria-live=\"assertive\" role=\"alert\" style=\"position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)\"></p>';document.body.append(a);";
	const [old, next] = await Promise.all([app(page('<script src="/react.js"></script>'), { '/react.js': reactBundle }), app(page(''))]);
	const at = (s: Server) => `http://127.0.0.1:${(s.address() as { port: number }).port}`;
	try {
		const result = await runCheck({ oldOrigin: at(old), newOrigin: at(next), routes: ['/'], viewports: [VIEWPORTS[0]!], browser });
		const r = result.routes[0]!;
		assert.deepEqual(new Set(r.failures.map((f) => `${f.dimension} ${f.check} ${f.accepted?.automatic}`)), new Set(['rendered accessibility tree framework-markup', 'assets script /react.js old-framework-runtime']));
		assert.equal(r.ok, true);
		assert.equal(result.automaticCount, 2);
		const off = await runCheck({ oldOrigin: at(old), newOrigin: at(next), routes: ['/'], viewports: [VIEWPORTS[0]!], browser, automaticOff: ['old-framework-runtime', 'framework-markup'] });
		assert.equal(off.routes[0]!.ok, false, 'with both rules off the same differences stay red');
	} finally {
		old.close();
		next.close();
	}
});

test('the status page (the front door index) tells automatic acceptances apart from a person\'s', () => {
	const html = migrationSection({ planned: true, done: false, routes: [{ route: '/', state: 'green', red: [], accepted: ["accepted automatically: the old framework's own code, which the new page no longer loads: assets: script /react.js: evidence", 'seo: title: renamed'] }] } as never);
	assert.match(html, /<small>1 accepted by a person, 1 accepted automatically \(the old framework&#39;s own code, which the new page no longer loads\)<\/small>|<small>1 accepted by a person, 1 accepted automatically \(the old framework's own code, which the new page no longer loads\)<\/small>/);
});
