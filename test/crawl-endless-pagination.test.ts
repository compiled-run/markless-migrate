import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { enumerateRoutes } from '../src/plan/enumerate.ts';

const page = (title: string, body: string) => `<!doctype html><html><head><title>${title}</title><script>self.__data=[${Math.random()}]</script></head><body><main>${body}</main><p>Rendered at ${new Date().toISOString()} (${Math.floor(Math.random() * 1e6)})</p></body></html>`;

let server: Server;
let base = '';
before(async () => {
	server = createServer((req, res) => {
		const url = new URL(req.url ?? '/', 'http://x');
		const send = (body: string) => res.writeHead(200, { 'content-type': 'text/html' }).end(body);
		const news = /^\/news\/(\d+)$/.exec(url.pathname);
		if (url.pathname === '/') return send(page('Home', '<a href="/news/1">news</a> <a href="/archive?p=1">archive</a> <a href="/invoice/7">7</a> <a href="/invoice/8">8</a>'));
		if (news) {
			const n = Number(news[1]);
			const items = n <= 3 ? `<a href="/item/${n}0">Story ${'abc'[n - 1]}</a>` : '';
			return send(page('News', `${items}<a href="/news/${n + 1}">More</a>`));
		}
		if (url.pathname === '/archive') {
			const p = Number(url.searchParams.get('p'));
			return send(page('Archive', `${p <= 2 ? `<h2>${'xy'[p - 1]}</h2>` : '<p>Nothing older.</p>'}<a href="/archive?p=${p + 1}">Older</a>`));
		}
		const invoice = /^\/invoice\/(\d+)$/.exec(url.pathname);
		if (invoice) return send(page('Invoice', `Invoice ${invoice[1]}: $${invoice[1]}00 <a href="/invoice/${invoice[1]}/edit">edit</a>`));
		if (/^\/(item\/\d+|invoice\/\d+\/edit)$/.test(url.pathname)) return send(page('Leaf', 'leaf'));
		res.writeHead(404).end('no');
	});
	await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
	base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(() => server.close());

test('pagination that runs on past its last page: the crawl stops where a page repeats the one before it apart from its numbers', async () => {
	const planned = await enumerateRoutes(base, { bound: 200 });
	const routes = planned.routes.map((r) => r.route);
	assert.equal(planned.truncated, false, `the crawl ran to its bound: ${planned.fetched} pages`);
	for (const r of ['/news/1', '/news/2', '/news/3', '/news/4', '/news/5', '/item/10', '/item/20', '/item/30']) assert.ok(routes.includes(r), r);
	assert.ok(!routes.includes('/news/6'), 'links on a page that repeats the previous one are not followed');
	for (const r of ['/archive?p=3', '/archive?p=4']) assert.ok(routes.includes(r), r);
	assert.ok(!routes.includes('/archive?p=5'), 'a pagination query runs on the same way');
	assert.ok(routes.includes('/invoice/7/edit') && routes.includes('/invoice/8/edit'), 'pages alike apart from their numbers that do not page on are still followed');
	assert.deepEqual(planned.repeats, [
		{ route: '/archive?p=4', sameAs: '/archive?p=3', next: '/archive?p=5' },
		{ route: '/news/5', sameAs: '/news/4', next: '/news/6' },
	]);
});
