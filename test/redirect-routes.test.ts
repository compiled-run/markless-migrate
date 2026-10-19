import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { chromium, type Browser } from 'playwright';
import { runCheck } from '../src/check/run.ts';

const page = (title: string) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${title}</title></head><body><main><h1>${title}</h1></main></body></html>`;

// alpinejs.dev answers every unknown path with a redirect to its installation page on its production host, which a check
// through a mirror or staging copy sees as another origin.
function app(production?: () => string): Promise<Server> {
	const server = createServer((req, res) => {
		const path = new URL(req.url ?? '/', 'http://x').pathname;
		if (path === '/install') res.writeHead(200, { 'content-type': 'text/html' }).end(page('Install'));
		else res.writeHead(302, { location: `${production?.() ?? ''}/install` }).end();
	});
	return new Promise((done) => server.listen(0, '127.0.0.1', () => done(server)));
}

let browser: Browser;
let site: Server;
let old: Server;
let next: Server;
const origin = (s: Server) => `http://127.0.0.1:${(s.address() as AddressInfo).port}`;
before(async () => {
	browser = await chromium.launch();
	site = await app();
	[old, next] = await Promise.all([app(() => origin(site)), app(() => origin(site))]);
});
after(async () => {
	await browser?.close();
	for (const s of [site, old, next]) s?.close();
});

test('a route the old app redirects off its origin is checked by its status and redirect chain, not as a page of its own', async () => {
	const report = await runCheck({ oldOrigin: origin(old), newOrigin: origin(next), routes: ['/old-docs'], browser });
	const route = report.routes.find((r) => r.route === '/old-docs')!;
	assert.equal(route.ok, true);
	assert.equal((route as unknown as { endpoint?: string }).endpoint, 'redirect');
	assert.deepEqual(route.shots, []);
});
