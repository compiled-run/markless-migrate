import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import { chromium } from 'playwright';
import { runCheck } from '../src/check/run.ts';
import { inventoryRoutes, unlistedFailures } from '../src/check/unlisted.ts';

const page = (title: string, body = '') => `<!doctype html><html lang="en"><head><title>${title}</title></head><body><main><h1>${title}</h1>${body}</main></body></html>`;
// The home page links to a listed page, a blog post a source pattern covers, a page the plan never found, a missing page, a file and a link that leaves the site.
const HOME = page('Home', '<a href="/pricing">Pricing</a> <a href="/blog/hello">Hello</a> <a href="/careers">Careers</a> <a href="/gone">Gone</a> <a href="/deck.pdf">Deck</a> <a href="/chat">Chat</a>');

function serve(): Promise<{ server: Server; origin: string }> {
	return new Promise((done) => {
		const server = createServer((req, res) => {
			const path = new URL(req.url ?? '/', 'http://x').pathname;
			if (path === '/') return void res.writeHead(200, { 'content-type': 'text/html' }).end(HOME);
			if (path === '/pricing' || path === '/blog/hello' || path === '/careers') return void res.writeHead(200, { 'content-type': 'text/html' }).end(page(path.slice(1)));
			if (path === '/chat') return void res.writeHead(302, { location: 'https://chat.example.invalid/invite' }).end();
			res.writeHead(404, { 'content-type': 'text/html' }).end(page('Not found'));
		});
		server.listen(0, '127.0.0.1', () => done({ server, origin: `http://127.0.0.1:${(server.address() as AddressInfo).port}` }));
	});
}

test('a page the original serves that the inventory does not list, linked from a checked page, is red; listed pages, pattern matches, missing pages, files and links that leave the site are not', { timeout: 300_000 }, async () => {
	const { server, origin } = await serve();
	const browser = await chromium.launch();
	try {
		const inventory = inventoryRoutes({ routes: [{ route: '/' }, { route: '/pricing' }], routeUnion: [{ route: '/blog/:slug' }] });
		const route = (await runCheck({ oldOrigin: origin, newOrigin: origin.replace('127.0.0.1', 'localhost'), routes: ['/'], viewports: [{ name: 'desktop', width: 1280, height: 800, isMobile: false }], browser, journeys: { maxJourneys: 0, budgetMs: 1 }, inventory })).routes[0]!;
		const unlisted = route.failures.filter((f) => f.dimension === 'coverage');
		assert.deepEqual(unlisted.map((f) => f.check), ['a page the inventory does not list: /careers']);
		assert.equal(route.ok, false);
		const without = (await runCheck({ oldOrigin: origin, newOrigin: origin.replace('127.0.0.1', 'localhost'), routes: ['/'], viewports: [{ name: 'desktop', width: 1280, height: 800, isMobile: false }], browser, journeys: { maxJourneys: 0, budgetMs: 1 } })).routes[0]!;
		assert.deepEqual(without.failures.filter((f) => f.dimension === 'coverage'), [], 'without a plan there is no inventory to hold it to');
	} finally {
		await browser.close();
		server.close();
	}
});

test('unlistedFailures: paths past the probe limit are reported as not asked, not passed', () => {
	const inventory = { routes: ['/'], patterns: [] };
	const candidates = Array.from({ length: 45 }, (_, i) => `/p${i}`);
	const served = candidates.slice(0, 40).map((path) => ({ path, status: 404, page: true, landed: path }));
	const failures = unlistedFailures('/', candidates, served, inventory);
	assert.deepEqual(failures.map((f) => f.check), ['pages the inventory does not list, past the probe limit']);
	assert.match(failures[0]!.actual, /^5 more linked paths/);
});
