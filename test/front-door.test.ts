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
