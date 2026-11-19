import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { chromium, type Browser } from 'playwright';
import { recordPrefetch } from '../src/prefetch/record.ts';

// Each site is a prefix with its own way of fetching pages ahead, written as plain scripts so no framework is named.
const ROUTER = `
const cache = new Map();
const data = (path) => cache.get(path) ?? (cache.set(path, fetch(path + '.data').then((r) => r.json())), cache.get(path));
window.__ahead = (a) => void data(new URL(a.href).pathname);
document.addEventListener('click', async (e) => {
	const a = e.target.closest('a[href]');
	if (!a || e.defaultPrevented) return;
	e.preventDefault();
	const page = await data(new URL(a.href).pathname);
	history.pushState(null, '', a.href);
	document.querySelector('h1').textContent = page.title;
});`;
const MODES: Record<string, string> = {
	hover: `${ROUTER} document.addEventListener('mouseover', (e) => { const a = e.target.closest('a[href]'); if (a) __ahead(a); });`,
	press: `${ROUTER} document.addEventListener('pointerdown', (e) => { const a = e.target.closest('a[href]'); if (a) __ahead(a); });`,
	viewport: `${ROUTER} const io = new IntersectionObserver((es) => es.forEach((x) => x.isIntersecting && __ahead(x.target))); document.querySelectorAll('a[href]').forEach((a) => io.observe(a));`,
	load: `${ROUTER} addEventListener('load', () => document.querySelectorAll('a[href]').forEach(__ahead));`,
	gated: `${ROUTER} const c = navigator.connection; if (c && c.effectiveType === '4g' && !c.saveData) { const io = new IntersectionObserver((es) => es.forEach((x) => x.isIntersecting && __ahead(x.target))); document.querySelectorAll('a[href]').forEach((a) => io.observe(a)); }`,
	none: '',
};

function page(mode: string, n: string): string {
	const links = Array.from({ length: 30 }, (_, i) => `<li style="height:60px"><a href="/${mode}/p${i}">Page ${i}</a></li>`).join('');
	return `<!doctype html><html><head><title>${n}</title></head><body><header><a href="/${mode}/p0">Home</a> <a href="/${mode}/p1">Docs</a></header><aside><ul>${links}</ul></aside><main><h1>${n}</h1></main><script>${MODES[mode]}</script></body></html>`;
}

let browser: Browser;
let server: Server;
let origin: string;
let dir: string;
before(async () => {
	browser = await chromium.launch();
	dir = await mkdtemp(join(tmpdir(), 'mm-prefetch-'));
	server = createServer((req, res) => {
		const url = new URL(req.url ?? '/', 'http://x');
		const [, mode = '', name = ''] = url.pathname.split('/');
		if (!(mode in MODES)) return void res.writeHead(404).end();
		if (name.endsWith('.data')) return void res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ title: name.slice(0, -5), pad: 'x'.repeat(2000) }));
		res.writeHead(200, { 'content-type': 'text/html' }).end(page(mode, name || 'start'));
	});
	await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
	origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(async () => {
	await browser.close();
	server.closeAllConnections();
	server.close();
	await rm(dir, { recursive: true, force: true });
});

test('a site that fetches a page when its link is hovered: hover fires, nothing at load or in view, the shape is learned and revisits are served from memory', async () => {
	const facts = await recordPrefetch(browser, origin, '/hover/p5', join(dir, 'hover'), { full: true, conditions: [] });
	assert.deepEqual(facts.shapes, ['{path}.data']);
	assert.equal(facts.triggers.load?.fired, 0);
	assert.equal(facts.triggers.viewport?.fired, 0);
	assert.ok(facts.triggers.hover && facts.triggers.hover.fired === facts.triggers.hover.tested && facts.triggers.hover.tested > 0, JSON.stringify(facts.triggers));
	assert.equal(facts.triggers.pointerdown, undefined, 'a press probe whose approach was already fetched by hover tells nothing');
	assert.equal(facts.fullLoads, false);
	assert.equal(facts.revisit?.refetched, false, JSON.stringify(facts.revisit));
	assert.equal(facts.prefetchedClick?.refetched, false, JSON.stringify(facts.prefetchedClick));
});

test('a site that fetches each link as it scrolls into view: viewport fires and the links on screen at load are fetched then', async () => {
	const facts = await recordPrefetch(browser, origin, '/viewport/p5', join(dir, 'viewport'), { full: true, conditions: [] });
	assert.ok(facts.triggers.viewport && facts.triggers.viewport.fired > 0, JSON.stringify(facts.triggers));
	assert.equal(facts.triggers.load?.fired, 0);
	assert.ok(facts.triggers.visible && facts.triggers.visible.fired > 0);
	assert.ok(facts.concurrency >= 2);
	assert.ok(facts.bytesBeforeClick > 0);
});

test('a site that fetches every link at load: load fires for links off screen too', async () => {
	const facts = await recordPrefetch(browser, origin, '/load/p5', join(dir, 'load'), { conditions: [] });
	assert.ok(facts.triggers.load && facts.triggers.load.fired === facts.triggers.load.tested, JSON.stringify(facts.triggers));
});

test('a site that fetches on a press: pointerdown fires where hover and focus do not', async () => {
	const facts = await recordPrefetch(browser, origin, '/press/p5', join(dir, 'press'), { full: true, conditions: [] });
	assert.equal(facts.triggers.hover?.fired, 0, JSON.stringify(facts.triggers));
	assert.equal(facts.triggers.focus?.fired, 0);
	assert.ok(facts.triggers.pointerdown && facts.triggers.pointerdown.fired > 0);
});

test('a site with plain links loads each page as a document and fetches nothing ahead', async () => {
	const facts = await recordPrefetch(browser, origin, '/none/p5', join(dir, 'none'), { full: true, conditions: [] });
	assert.equal(facts.fullLoads, true);
	for (const [trigger, e] of Object.entries(facts.triggers)) {
		assert.equal(e.fired, 0, trigger);
		assert.equal(e.bytes, 0, `${trigger}: the page's own document is not fetched ahead`);
	}
	assert.equal(facts.revisit?.refetched, true);
	assert.ok(facts.revisit!.afterMs < 8000, `the revisit waited on requests of an unloaded document: ${facts.revisit!.afterMs} ms`);
});

test('a site that prefetches only on a fast connection: the conditions say on which networks it still does', async () => {
	const facts = await recordPrefetch(browser, origin, '/gated/p5', join(dir, 'gated'), { full: true, conditions: ['no-info', '4g', '3g', 'save-data'] });
	assert.equal(facts.conditions?.['4g']?.viewport, true, JSON.stringify(facts.conditions));
	assert.equal(facts.conditions?.['3g']?.viewport, false);
	assert.equal(facts.conditions?.['save-data']?.viewport, false);
	assert.equal(facts.conditions?.['no-info']?.viewport, false);
});

test('a recording is read back from its directory instead of recorded again', async () => {
	const first = await recordPrefetch(browser, origin, '/load/p5', join(dir, 'load'), { conditions: [] });
	const started = Date.now();
	const again = await recordPrefetch(browser, origin, '/load/p5', join(dir, 'load'), { conditions: [] });
	assert.deepEqual(again, first);
	assert.ok(Date.now() - started < 200);
});
