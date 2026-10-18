import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { chromium, type Browser } from 'playwright';
import { runCheck } from '../src/check/run.ts';
import { VIEWPORTS } from '../src/check/types.ts';

const HOME = '<!doctype html><html lang="en"><title>Home</title><main><h1>Home</h1><a href="/showcase">Showcase</a></main>';
const SHOWCASE = '<!doctype html><html lang="en"><title>Showcase</title><main><h1>Showcase</h1><ul id="sites"></ul></main><script src="/showcase.js"></script>';
const SCRIPT = 'fetch("/api/sites").then((r) => r.json()).then((sites) => { for (const s of sites) document.getElementById("sites").append(Object.assign(document.createElement("li"), { textContent: s })); });';

// The old app has a showcase page that fetches its sites; the new app has ported only the home page.
function app(ported: boolean): Promise<Server> {
	const server = createServer((req, res) => {
		const path = new URL(req.url ?? '/', 'http://x').pathname;
		if (path === '/') return void res.writeHead(200, { 'content-type': 'text/html' }).end(HOME);
		if (!ported && path === '/showcase') return void res.writeHead(200, { 'content-type': 'text/html' }).end(SHOWCASE);
		if (!ported && path === '/showcase.js') return void res.writeHead(200, { 'content-type': 'text/javascript' }).end(SCRIPT);
		if (!ported && path === '/api/sites') return void res.writeHead(200, { 'content-type': 'application/json' }).end('["a.example","b.example"]');
		res.writeHead(404, { 'content-type': 'text/html' }).end('<!doctype html><title>Not found</title><h1>Page not found</h1><script>console.error("no route for " + location.pathname)</script>');
	});
	return new Promise((done) => server.listen(0, '127.0.0.1', () => done(server)));
}

let browser: Browser;
let old: Server;
let next: Server;
const origin = (s: Server) => `http://127.0.0.1:${(s.address() as AddressInfo).port}`;
before(async () => {
	browser = await chromium.launch();
	[old, next] = await Promise.all([app(false), app(true)]);
});
after(async () => {
	await browser?.close();
	old?.close();
	next?.close();
});

const check = (switched: string[]) => runCheck({ oldOrigin: origin(old), newOrigin: origin(next), routes: ['/'], viewports: [VIEWPORTS[0]!], browser, switched });
const linkFailures = (r: Awaited<ReturnType<typeof check>>) => r.routes[0]!.failures.filter((f) => /link "Showcase"/.test(f.check)).map((f) => `${f.check}: ${f.actual}`);

test('a link into a route the new app has not taken over lands where the front door would send it: the old app', async () => {
	assert.deepEqual(linkFailures(await check([])), []);
});

test('once that route is switched, the same link is compared against the new app', async () => {
	assert.ok(linkFailures(await check(['/showcase'])).length > 0);
});

// An unported docs page as Docusaurus-like apps build it: it moves the URL client-side, then loads a chunk by a path
// relative to where it is, and its analytics shim complains naming its host. The old server sets its session cookie
// on every page; the port sets none.
const DOCS = '<!doctype html><html lang="en"><title>Docs</title><main><h1>Docs</h1><ul id="out"></ul></main><script>history.replaceState({}, "", "/docs/intro"); import("./chunk.js");</script>';
const CHUNK = 'console.error("gtag missing on " + location.host); fetch("/api/pages").then((r) => r.json()).then((pages) => { for (const p of pages) document.getElementById("out").append(Object.assign(document.createElement("li"), { textContent: p })); });';

function docsApp(ported: boolean): Promise<Server> {
	const server = createServer((req, res) => {
		const path = new URL(req.url ?? '/', 'http://x').pathname;
		const session = ported ? {} : { 'set-cookie': 'app_session=s3cr3t; Path=/; HttpOnly' };
		if (path === '/') return void res.writeHead(200, { 'content-type': 'text/html', ...session }).end('<!doctype html><html lang="en"><title>Home</title><main><h1>Home</h1><a href="/docs">Docs</a></main>');
		if (!ported && path === '/docs') return void res.writeHead(200, { 'content-type': 'text/html', ...session }).end(DOCS);
		if (!ported && path === '/chunk.js') return void res.writeHead(200, { 'content-type': 'text/javascript' }).end(CHUNK);
		if (!ported && path === '/api/pages') return void res.writeHead(200, { 'content-type': 'application/json' }).end('["intro","install"]');
		res.writeHead(404, { 'content-type': 'text/html' }).end('<!doctype html><title>Not found</title><h1>Page not found</h1>');
	});
	return new Promise((done) => server.listen(0, '127.0.0.1', () => done(server)));
}

test('an unswitched page runs on the old origin exactly as on its own host: same requests, same errors, and its session cookie is not counted against the port', async () => {
	const [a, b] = await Promise.all([docsApp(false), docsApp(true)]);
	try {
		const report = await runCheck({ oldOrigin: origin(a), newOrigin: origin(b), routes: ['/'], viewports: [VIEWPORTS[0]!], browser, switched: [] });
		const journey = report.routes[0]!.journeys!.find((j) => j.name === 'click link "Docs"')!;
		assert.ok(journey.expected[0]!.errors.some((e) => /^gtag missing on 127\.0\.0\.1:\d+$/.test(e)), 'the old page logs what it logs on its own host');
		assert.deepEqual(journey.expected[0]!.requests, ['GET /api/pages']);
		assert.deepEqual(report.routes[0]!.failures.filter((f) => /link "Docs"/.test(f.check)).map((f) => `${f.check}: ${f.actual}`), []);
	} finally {
		a.close();
		b.close();
	}
});
