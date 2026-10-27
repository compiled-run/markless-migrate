import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { chromium, type Browser } from 'playwright';
import { runCheck } from '../src/check/run.ts';
import { VIEWPORTS } from '../src/check/types.ts';

// One of a Qwik build's many chunks: the code of a component's handlers, with no marker of Qwik's runtime in it.
const CHUNK = 'export const s_abc = (e) => { e.target.dataset.n = String(Number(e.target.dataset.n ?? 0) + 1); };';
const PAGE = (qwik: boolean) => `<!doctype html><html lang="en"${qwik ? ' q:container="paused" q:version="1.17.0" q:base="/build/"' : ''}><head><title>Docs</title>${qwik ? '<link rel="modulepreload" href="/build/q-Abc123.js">' : ''}</head><body><main><h1>Docs</h1><p>Read the guide.</p></main>${qwik ? '<script type="module">import("/build/q-Abc123.js");</script>' : ''}</body></html>`;

function site(qwik: boolean): Promise<Server> {
	const server = createServer((req, res) => {
		const path = new URL(req.url ?? '/', 'http://x').pathname;
		if (path === '/') return void res.writeHead(200, { 'content-type': 'text/html' }).end(PAGE(qwik));
		if (qwik && path === '/build/q-Abc123.js') return void res.writeHead(200, { 'content-type': 'application/javascript' }).end(CHUNK);
		res.writeHead(404, { 'content-type': 'text/plain' }).end('not found');
	});
	return new Promise((done) => server.listen(0, '127.0.0.1', () => done(server)));
}

let browser: Browser;
const servers: Server[] = [];
before(async () => {
	browser = await chromium.launch();
});
after(async () => {
	await browser?.close();
	for (const s of servers) s.close();
});
const at = (s: Server) => `http://127.0.0.1:${(s.address() as AddressInfo).port}`;

test("a chunk served from a Qwik page's build path is the old framework's code, though the chunk alone names no runtime", async () => {
	const old = await site(true);
	const next = await site(false);
	servers.push(old, next);
	const route = (await runCheck({ oldOrigin: at(old), newOrigin: at(next), routes: ['/'], viewports: [VIEWPORTS[0]!], browser })).routes[0]!;
	const chunk = route.failures.filter((f) => f.dimension === 'assets' && f.check.includes('/build/q-Abc123.js'));
	assert.ok(chunk.length > 0, 'the chunk is still listed');
	for (const f of chunk) assert.equal(f.automatic?.rule ?? f.accepted?.automatic, 'old-framework-runtime', JSON.stringify(f));
});
