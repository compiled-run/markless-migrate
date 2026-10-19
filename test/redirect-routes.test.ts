import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { chromium, type Browser } from 'playwright';
import { runCheck } from '../src/check/run.ts';

const page = (title: string) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${title}</title></head><body><main><h1>${title}</h1></main></body></html>`;

// alpinejs.dev answers every unknown path with a redirect to its installation page.
function app(): Promise<Server> {
	const server = createServer((req, res) => {
		const path = new URL(req.url ?? '/', 'http://x').pathname;
		if (path === '/install') res.writeHead(200, { 'content-type': 'text/html' }).end(page('Install'));
		else res.writeHead(302, { location: '/install' }).end();
	});
	return new Promise((done) => server.listen(0, '127.0.0.1', () => done(server)));
}

let browser: Browser;
let old: Server;
let next: Server;
before(async () => {
	browser = await chromium.launch();
	[old, next] = await Promise.all([app(), app()]);
});
after(async () => {
	await browser?.close();
	old?.close();
	next?.close();
});

test('a route the old app redirects is checked by its status and redirect chain, not as a page of its own', async () => {
	const origin = (s: Server) => `http://127.0.0.1:${(s.address() as AddressInfo).port}`;
	const report = await runCheck({ oldOrigin: origin(old), newOrigin: origin(next), routes: ['/old-docs'], browser });
	const route = report.routes.find((r) => r.route === '/old-docs')!;
	assert.equal(route.ok, true);
	assert.equal((route as unknown as { endpoint?: string }).endpoint, 'redirect');
	assert.deepEqual(route.shots, []);
});
