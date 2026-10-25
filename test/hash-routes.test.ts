import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { chromium, type Browser } from 'playwright';
import { runCheck } from '../src/check/run.ts';
import { hashRouted } from '../src/source/routes/config.ts';
import { routeLinks, routePath } from '../src/check/hash-routes.ts';
import { storageOwner } from '../src/check/automatic.ts';
import type { PageCapture } from '../src/check/types.ts';

const PAGES: Record<string, string> = { '/': 'Front page', '/about': 'About us', '/item/7': 'Item seven' };

// A static host with a hash router, as react-hn on GitHub Pages: every route is `/#/<path>`, any other path is a 404.
const OLD_SHELL = `<!doctype html><html><head><meta charset="utf-8"><title>Shop</title><link rel="stylesheet" href="app.3f9a1c2b.css"></head><body><div id="app"></div><script src="app.3f9a1c2b.js"></script></body></html>`;
const CSS = 'h1 { color: rgb(20, 90, 50); }';
const OLD_APP = `
const pages = ${JSON.stringify(PAGES)};
function draw() {
	const path = location.hash.replace(/^#/, '').replace(/[?&]_k=[a-z0-9]+$/, '') || '/';
	if (!/_k=/.test(location.hash)) { history.replaceState(null, '', '#' + path + '?_k=' + Math.random().toString(36).slice(2, 8)); }
	document.getElementById('app').innerHTML = '<nav><a href="#/">Home</a> <a href="#/about">About</a> <a href="#/item/7">Seven</a></nav><main><h1>' + (pages[path] || 'Not found') + '</h1></main>';
}
addEventListener('hashchange', draw);
draw();`;

function oldApp(): Promise<Server> {
	const server = createServer((req, res) => {
		const path = new URL(req.url ?? '/', 'http://x').pathname;
		if (path === '/') res.writeHead(200, { 'content-type': 'text/html' }).end(OLD_SHELL);
		else if (path === '/app.3f9a1c2b.js') res.writeHead(200, { 'content-type': 'text/javascript' }).end(OLD_APP);
		else if (path === '/app.3f9a1c2b.css') res.writeHead(200, { 'content-type': 'text/css' }).end(CSS);
		else res.writeHead(404, { 'content-type': 'text/plain' }).end('not found');
	});
	return new Promise((done) => server.listen(0, '127.0.0.1', () => done(server)));
}

// Its port at real paths, which sends an old `/#/<path>` link to `/<path>`; `legacy: false` leaves old links on the front page.
function newApp(options: { heading?: (path: string) => string; legacy?: boolean } = {}): Promise<Server> {
	const server = createServer((req, res) => {
		const path = new URL(req.url ?? '/', 'http://x').pathname;
		if (path === '/app.css') return void res.writeHead(200, { 'content-type': 'text/css' }).end(CSS);
		const title = PAGES[path];
		if (!title) return void res.writeHead(404, { 'content-type': 'text/html' }).end('<!doctype html><title>Shop</title><h1>Not found</h1>');
		const redirect = options.legacy === false ? '' : `<script>if(location.hash.indexOf('#/')===0)location.replace(location.hash.slice(1))</script>`;
		res.writeHead(200, { 'content-type': 'text/html' }).end(`<!doctype html><html><head><meta charset="utf-8">${redirect}<title>Shop</title><link rel="stylesheet" href="/app.css"></head><body><div id="app"><nav><a href="/">Home</a> <a href="/about">About</a> <a href="/item/7">Seven</a></nav><main><h1>${options.heading?.(path) ?? title}</h1></main></div></body></html>`);
	});
	return new Promise((done) => server.listen(0, '127.0.0.1', () => done(server)));
}

const origin = (s: Server) => `http://127.0.0.1:${(s.address() as AddressInfo).port}`;
let browser: Browser;
const servers: Server[] = [];
before(async () => {
	browser = await chromium.launch();
});
after(async () => {
	await browser?.close();
	for (const s of servers) s.close();
});

const quick = { responsiveness: undefined, motion: undefined, load: undefined, viewports: [{ name: 'desktop', width: 1280, height: 800, isMobile: false }] } as const;

async function check(next: Server, routes: string[]) {
	const old = await oldApp();
	servers.push(old, next);
	return runCheck({ ...quick, oldOrigin: origin(old), newOrigin: origin(next), routes, browser, oldRouting: 'hash' });
}

test('a hash-routed old app is loaded at /#<route> and compared with the port at the real path', async () => {
	const report = await check(await newApp(), ['/about', '/item/7']);
	for (const route of report.routes) assert.equal(route.ok, true, `${route.route}: ${route.failures.map((f) => `${f.dimension} ${f.check}: ${f.expected} -> ${f.actual}`).join('; ')}`);
});

test("the widget probes read a hash-routed old page's address as its route", async () => {
	const old = await oldApp();
	const next = await newApp();
	servers.push(old, next);
	const report = await runCheck({ ...quick, oldOrigin: origin(old), newOrigin: origin(next), routes: ['/about'], browser, oldRouting: 'hash', only: 'probes', probes: {} });
	const route = report.routes[0]!;
	assert.equal(route.ok, true, route.failures.map((f) => `${f.check}: ${f.expected} -> ${f.actual}`).join('; '));
});

test('a hash-routed old app still shows a port that renders another page as red', async () => {
	const report = await check(await newApp({ heading: (path) => (path === '/about' ? 'About them' : PAGES[path]!) }), ['/about']);
	const route = report.routes[0]!;
	assert.equal(route.ok, false);
	assert.ok(route.failures.some((f) => f.dimension === 'rendered' && /About them/.test(f.actual)), route.failures.map((f) => f.check).join('; '));
});

test("a port that leaves the old app's /#/ links on its front page is red in http", async () => {
	const report = await check(await newApp({ legacy: false }), ['/about']);
	const failure = report.routes[0]!.failures.find((f) => f.dimension === 'http' && f.check === 'old hash link');
	assert.ok(failure, report.routes[0]!.failures.map((f) => `${f.dimension} ${f.check}`).join('; '));
	assert.equal(failure.expected, '/#/about lands on /about');
});

test("a hash-routed page's link addresses are read as routes, quoted only where YAML needs it", () => {
	assert.equal(routeLinks('- link "About":\n  - /url: "#/about"', 'hash'), '- link "About":\n  - /url: /about');
	assert.equal(routeLinks('  - /url: "#/item/7?page=2"', 'hash'), '  - /url: /item/7?page=2');
	assert.equal(routeLinks('  - /url: "#/a: b"', 'hash'), '  - /url: "/a: b"');
	assert.equal(routeLinks('  - /url: "#section"', 'hash'), '  - /url: "#section"');
	assert.equal(routeLinks('  - /url: "#/about"', undefined), '  - /url: "#/about"');
});

test('the address a hash-routed page shows is read as its route', () => {
	assert.equal(routePath('http://old.test/#/item/7?page=2', 'hash'), 'http://old.test/item/7?page=2');
	assert.equal(routePath('http://old.test/#/', 'hash'), 'http://old.test/');
	assert.equal(routePath('http://old.test/', 'hash'), 'http://old.test/');
	assert.equal(routePath('http://old.test/#section', 'hash'), 'http://old.test/#section');
	assert.equal(routePath('http://old.test/#/item/7', undefined), 'http://old.test/#/item/7');
	assert.equal(routePath('http://old.test/#/jobs?_k=uvja5u', 'hash'), 'http://old.test/jobs');
	assert.equal(routePath('http://old.test/#/news?page=2&_k=k3w9qz', 'hash'), 'http://old.test/news?page=2');
});

test('the source names the hash routers of React Router, Vue Router and Angular', () => {
	assert.equal(hashRouted(`import {hashHistory} from 'react-router'\nrender(<Router history={hashHistory} routes={routes}/>, el)`), true);
	assert.equal(hashRouted(`const router = createHashRouter([{ path: '/', element: <Home /> }])`), true);
	assert.equal(hashRouted(`root.render(<HashRouter><App /></HashRouter>)`), true);
	assert.equal(hashRouted(`createRouter({ history: createWebHashHistory(), routes })`), true);
	assert.equal(hashRouted(`new VueRouter({ mode: 'hash', routes })`), true);
	assert.equal(hashRouted(`RouterModule.forRoot(routes, { useHash: true })`), true);
	assert.equal(hashRouted(`createRouter({ history: createWebHistory(), routes })`), false);
	assert.equal(hashRouted(`const id = location.hash.slice(1)`), false);
});

test("history's own entry state (React Router 2 and 3) in sessionStorage is the old framework's", () => {
	const page = (runtime?: string) => ({ assets: runtime ? [{ url: '/vendor.js', type: 'script', status: 200, contentType: 'text/javascript', runtime }] : [] }) as unknown as PageCapture;
	assert.equal(storageOwner([page('React')], [page()])('+ sessionStorage @@History/s/uvja5u'), 'React');
	assert.equal(storageOwner([page('React')], [page('React')])('+ sessionStorage @@History/s/uvja5u'), undefined);
	assert.equal(storageOwner([page('React')], [page()])('+ sessionStorage itemCache'), undefined);
});
