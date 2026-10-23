import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { chromium, type Browser } from 'playwright';
import { foreignRuntimeGuard, scanBuild, summarizeBuild } from '../src/client/guard.ts';
import { applyAllowances, readAllowances } from '../src/client/allow.ts';
import { capturePage, comparePages, summarizePageFindings, type PageFinding } from '../src/client/page.ts';

const CSS = 'body { color: rgb(1, 2, 3); }';
// The old page's own script sizes the frame to its label, as GitHub's buttons.js does.
const OLD = `<!doctype html><html><head><link rel="stylesheet" href="/site.css"><style>.hero { margin: 0 }</style></head><body>
<span id="star"></span><div class="hero">hero</div>
<script>var f = document.createElement('iframe'); f.setAttribute('style', 'width: ' + (50 + 51) + 'px; height: 20px; border: none;'); document.getElementById('star').append(f);</script>
</body></html>`;
const HTMX = 'var htmx = { onLoad: null, process: null, on: null, off: null, trigger: null, ajax: null, find: null, findAll: null, closest: null, values: null, remove: null, defineExtension: null };';

let browser: Browser;
let server: Server;
let origin: string;
const pages: Record<string, string> = {};

before(async () => {
	browser = await chromium.launch();
	server = createServer((req, res) => {
		const url = new URL(req.url ?? '/', 'http://x');
		const [side, ...rest] = url.pathname.slice(1).split('/');
		const path = `/${rest.join('/')}`;
		if (path === '/site.css') return res.writeHead(200, { 'content-type': 'text/css' }).end(side === 'changed' ? `${CSS}\n` : CSS);
		if (path === '/htmx.js') return res.writeHead(200, { 'content-type': 'text/javascript' }).end(HTMX);
		res.writeHead(200, { 'content-type': 'text/html' }).end(pages[side!] ?? 'missing');
	});
	await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
	origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
	const rebase = (html: string, side: string) => html.replaceAll('href="/', `href="/${side}/`).replaceAll('src="/', `src="/${side}/`);
	pages.old = rebase(OLD, 'old');
	pages.same = rebase(OLD, 'same');
	// A hand port that retypes the frame at the width its author saw once, moves the <style> into a rewritten stylesheet and loads htmx.
	pages.port = rebase(OLD.replace("(50 + 51)", '51').replace('<style>.hero { margin: 0 }</style>', '').replace('</body>', '<script src="/htmx.js"></script></body>'), 'port');
	pages.changed = rebase(OLD, 'changed');
	// A port that keeps a closed dialog in the page, hidden, with the inline style the library gives it once mounted.
	pages.closed = rebase(OLD.replace('</body>', '<div hidden><div role="dialog" style="pointer-events: auto;"></div></div></body>'), 'closed');
	pages.shownDialog = rebase(OLD.replace('</body>', '<div><div role="dialog" style="pointer-events: auto;"></div></div></body>'), 'shownDialog');
});

after(async () => {
	await browser.close();
	server.close();
});

const capture = (side: string) => capturePage(browser, `${origin}/${side}/`, '', { settleMs: 100 }).then((c) => ({ ...c, route: '/', assets: new Map([...c.assets].map(([u, a]) => [u.replace(/^\/\w+\//, '/'), a])) }));

test('a port that keeps the old page byte for byte has no page-guard difference', async () => {
	const old = await capture('old');
	const { findings } = comparePages(old, await capture('old'), await capture('same'));
	assert.deepEqual(findings, []);
});

test('an inline style on a part the port keeps hidden is not compared; shown, it is', async () => {
	const old = await capture('old');
	const again = await capture('old');
	assert.deepEqual(comparePages(old, again, await capture('closed')).findings, []);
	assert.deepEqual(comparePages(old, again, await capture('shownDialog')).findings.map((f) => `${f.kind}: ${f.actual}`), ['inline style differs: style="pointer-events: auto;"']);
});

test('a frame retyped at another width, a dropped <style>, a changed stylesheet and a loaded htmx are each red', async () => {
	const old = await capture('old');
	const again = await capture('old');
	const port = comparePages(old, again, await capture('port')).findings;
	const kinds = port.map((f) => `${f.kind}: ${f.subject}`);
	assert.ok(kinds.includes('inline style differs: span#star iframe'), kinds.join('\n'));
	const size = port.find((f) => f.kind === 'size differs')!;
	assert.match(size.expected!, /^101x20 px/);
	assert.match(size.actual!, /^51x20 px/);
	assert.ok(kinds.includes('inline <style> changed: inline <style> #1'));
	assert.deepEqual(port.find((f) => f.kind === 'foreign runtime')?.actual, 'htmx');
	const changed = comparePages(old, again, await capture('changed')).findings;
	assert.deepEqual(changed.map((f) => `${f.kind}: ${f.subject}`), ['asset changed: stylesheet /site.css']);
});

test('what differs between two loads of the old page is that page\'s own variation, never the port\'s', async () => {
	const old = await capture('old');
	const wobble = { ...old, boxes: old.boxes.map((b) => ({ ...b, width: b.width + 30 })) };
	const port = await capture('port');
	const { findings, varied } = comparePages(old, wobble, port);
	assert.equal(findings.filter((f) => f.kind === 'size differs').length, 0);
	assert.ok(varied.some((v) => v.startsWith('box ')));
});

test('the build guard fails on a foreign runtime a page loads or runs, allows one nothing loads (a download), and lists kept libraries', async () => {
	const dir = await mkdtemp(join(tmpdir(), 'mm-build-'));
	for (const d of ['public/build', 'public/js', 'public/test', 'server/_ssr']) await mkdir(join(dir, d), { recursive: true });
	await writeFile(join(dir, 'public', 'build', 'page.js'), 'export const text = "htmx:configRequest and React\'s Symbol.for(\\"react.element\\")";');
	await writeFile(join(dir, 'public', 'build', 'chunk.js'), 'const el = Symbol.for("react.transitional.element");');
	await writeFile(join(dir, 'public', 'js', 'htmx.js'), HTMX);
	await writeFile(join(dir, 'public', 'js', 'download-only.js'), HTMX);
	await writeFile(join(dir, 'public', 'js', 'chart.umd.js'), '/*! Chart.js v4.4.1 */ !function(t,e){t.Chart=e()}(this,function(){return {}});');
	await writeFile(join(dir, 'public', 'test', 'suite.js'), HTMX);
	await writeFile(join(dir, 'public', 'test', 'index.html'), '<script src="suite.js"></script>');
	// The server renders the page heads; its static asset table lists every public file by path, as a key.
	await writeFile(join(dir, 'server', '_ssr', 'heads.mjs'), 'export const HEADS = { "/": { scripts: ["/js/htmx.js", "/js/chart.umd.js"] } }; export const ASSETS = { "/js/download-only.js": { path: "../public/js/download-only.js" } };');
	// A part that loads DocSearch on intent names its script; the server's copy of that code renders and loads nothing.
	await writeFile(join(dir, 'public', 'build', 'search.js'), 'const SCRIPT = "https://cdn.jsdelivr.net/npm/@docsearch/js@3"; const img = "https://example.com/logo.png";');
	await writeFile(join(dir, 'server', '_ssr', 'search.mjs'), 'const SCRIPT = "https://cdn.example.com/widget.js";');
	const scan = await scanBuild(dir);
	assert.deepEqual(scan.remote, [{ url: 'https://cdn.jsdelivr.net/npm/@docsearch/js@3', file: 'public/build/search.js', note: 'DocSearch 3 with its own UI runtime (Preact), loaded when a visitor first goes to search' }]);
	assert.match(summarizeBuild('out', scan), /Loaded from another origin when a page runs \(not in the build, listed\): https:\/\/cdn\.jsdelivr\.net\/npm\/@docsearch\/js@3 \(DocSearch 3 with its own UI runtime/);
	assert.deepEqual(scan.hits.map((h) => `${h.file} ${h.runtimes.join('+')} ${h.where}`).sort(), ['public/build/chunk.js React bundle', 'public/js/htmx.js htmx public file']);
	assert.deepEqual(scan.downloads.map((d) => `${d.file} ${d.loadedBy}`).sort(), ['public/js/download-only.js none', 'public/test/suite.js copied page']);
	assert.deepEqual(scan.libraries.map((l) => `${l.file} ${l.libraries.join('+')} ${l.loadedBy}`), ['public/js/chart.umd.js chart.js page']);
	const plugin = foreignRuntimeGuard();
	assert.throws(() => plugin.generateBundle.call({ error: (m: string) => { throw new Error(m); } }, {}, { 'a.js': { type: 'chunk', fileName: 'a.js', code: HTMX } }), /a\.js: htmx/);
	assert.doesNotThrow(() => plugin.generateBundle.call({ error: (m: string) => { throw new Error(m); } }, {}, { 'b.js': { type: 'chunk', fileName: 'b.js', code: 'export const x = "htmx";' } }));
});

test('an allowance with a stated reason lists an intended addition instead of failing it; a foreign runtime is never allowed', async () => {
	const dir = await mkdtemp(join(tmpdir(), 'mm-allow-'));
	await writeFile(join(dir, 'guard-allow.json'), JSON.stringify({ allow: [{ subject: 'div.port-attribution*', reason: 'licence badge for this demo copy' }, { subject: '*', kind: 'foreign runtime', reason: 'trying to allow htmx anyway' }] }));
	const allow = await readAllowances(dir);
	const findings: PageFinding[] = [
		{ route: '/', kind: 'inline style differs', subject: 'div.port-attribution', red: true },
		{ route: '/docs/', kind: 'inline style differs', subject: 'div.port-attribution a', red: true },
		{ route: '/', kind: 'inline style differs', subject: 'span#star >> iframe', red: true },
		{ route: '/', kind: 'foreign runtime', subject: '/js/htmx.js', red: true },
	];
	const applied = applyAllowances(findings, allow);
	assert.deepEqual(applied.map((f) => [f.subject, f.red, f.allowed ?? null]), [['div.port-attribution', false, 'licence badge for this demo copy'], ['div.port-attribution a', false, 'licence badge for this demo copy'], ['span#star >> iframe', true, null], ['/js/htmx.js', true, null]]);
	assert.match(summarizePageFindings(applied, []), /allowed {2}2 differences: licence badge for this demo copy/);
	await writeFile(join(dir, 'guard-allow.json'), JSON.stringify({ allow: [{ subject: 'div.port-attribution*', reason: '' }] }));
	await assert.rejects(readAllowances(dir), /needs "reason"/);
});

test('a frame\'s inline style carried by the Markless component that stands in for it is the same style in the same place', () => {
	const page = (styled: { key: string; style: string; embed?: boolean }[]) => ({ route: '/', assets: new Map(), styleBlocks: [], liveBlocks: [], styled, boxes: [], runtimes: [] });
	const style = 'border: 1px solid gray; border-radius: 12px; float: right;';
	const old = page([{ key: 'main.c.content iframe', style }]);
	assert.deepEqual(comparePages(old, old, page([{ key: 'span.ghs-host', style, embed: true }])).findings, []);
	assert.equal(comparePages(old, old, page([{ key: 'span.ghs-host', style }])).findings.length, 2, 'an element that is not marked as the component is another element');
});
