import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import { plan } from '../src/plan/inventory.ts';
import { routeTargets } from '../src/plan/routes.ts';
import type { Inventory } from '../src/plan/inventory.ts';

const listen = (server: Server) => new Promise<string>((done) => server.listen(0, '127.0.0.1', () => done(`http://127.0.0.1:${(server.address() as AddressInfo).port}`)));
const page = (title: string, body = '') => `<!doctype html><html lang="en"><head><title>${title}</title></head><body><main><h1>${title}</h1>${body}</main></body></html>`;
// The designer draws its preview frame on the client, as /create does: the server HTML has no iframe.
const DESIGNER = page('Designer', `<script>
	const frame = document.createElement('iframe'); frame.src = '/preview/base/one?preset=b0&item=one'; document.querySelector('main').append(frame);
	const object = document.createElement('object'); object.data = '/embedded'; document.querySelector('main').append(object);
	const away = document.createElement('iframe'); away.src = 'http://elsewhere.invalid/frame'; document.querySelector('main').append(away);
</script>`);

function serve(): Promise<{ server: Server; origin: string }> {
	const server = createServer((req, res) => {
		const path = new URL(req.url ?? '/', 'http://x').pathname;
		if (path === '/') return void res.writeHead(200, { 'content-type': 'text/html' }).end(DESIGNER);
		if (['/preview/base/one', '/preview/base/two', '/embedded'].includes(path)) return void res.writeHead(200, { 'content-type': 'text/html' }).end(page(path));
		res.writeHead(404, { 'content-type': 'text/html' }).end(page('Not found'));
	});
	return listen(server).then((origin) => ({ server, origin }));
}

test('plan lists the same-origin pages a page draws in an iframe or object on the client, and the pages a samples list names for a source pattern', { timeout: 120_000 }, async () => {
	const { server, origin } = await serve();
	try {
		const inventory = await plan({ origin, limit: 10, samples: { '/preview/:base/:name': ['/preview/base/two'] } });
		const routes = new Map(inventory.routes.map((r) => [r.route, r]));
		assert.equal(routes.get('/preview/base/one')?.status, 200, 'the frame the page draws is a page to port');
		assert.deepEqual(routes.get('/preview/base/one')?.foundIn, ['crawl']);
		assert.equal(routes.get('/embedded')?.status, 200, 'an object of the same origin too');
		assert.equal(routes.get('/preview/base/two')?.status, 200, 'a page the samples list names is loaded like a crawled one, so it is converted');
		assert.deepEqual(routes.get('/preview/base/two')?.foundIn, ['sample']);
		assert.ok(![...routes.keys()].some((r) => r.includes('elsewhere')));
	} finally {
		server.close();
	}
});

test('routeTargets: a source pattern a samples list names gives every path of the list', () => {
	const inventory = { routes: [], routeUnion: [{ route: '/preview/:base/:name', knownBy: ['source'], crawled: [], dynamic: true, kind: 'page' }] } as unknown as Inventory;
	const targets = routeTargets(inventory, { '/preview/:base/:name': ['/preview/base/preview', '/preview/radix/preview-02'] });
	assert.deepEqual(targets.pages, ['/preview/base/preview', '/preview/radix/preview-02']);
	assert.deepEqual(targets.needsSample, []);
});
