import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import { plan } from '../src/plan/inventory.ts';

const listen = (server: Server) => new Promise<string>((done) => server.listen(0, '127.0.0.1', () => done(`http://127.0.0.1:${(server.address() as AddressInfo).port}`)));

// A site whose pages answer in a different order from the one they are found in, with links drawn by script, a redirect
// on the site, one to another site, and pages found only through others.
function site(away: string): Server {
	const delay = (path: string) => [...path].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 97, 7) * 3;
	const page = (path: string) => {
		const n = Number(/\d+/.exec(path)?.[0] ?? 0);
		const links = [`/p${(n * 3 + 1) % 23}`, `/p${(n * 7 + 2) % 23}`, n % 5 === 0 ? '/moved' : '', n % 6 === 0 ? '/away' : ''].filter(Boolean);
		const late = `/late${n % 4}`;
		return `<html lang="en"><head><title>${path}</title><link rel="stylesheet" href="/s.css"><meta name="description" content="${path}"></head><body>${links.map((l) => `<a href="${l}">${l}</a>`).join('')}<script>setTimeout(() => { const a = document.createElement('a'); a.href = '${late}'; document.body.append(a); }, 50)</script></body></html>`;
	};
	return createServer((req, res) => {
		const path = req.url ?? '/';
		setTimeout(() => {
			if (path === '/s.css') res.writeHead(200, { 'content-type': 'text/css' }).end('body{}');
			else if (path === '/moved') res.writeHead(301, { location: '/p4' }).end();
			else if (path === '/away') res.writeHead(302, { location: `${away}/x` }).end();
			else if (path === '/sitemap.xml') res.writeHead(200, { 'content-type': 'application/xml' }).end(`<urlset><url><loc>http://${req.headers.host}/p9</loc></url><url><loc>http://${req.headers.host}/p17</loc></url></urlset>`);
			else if (path === '/robots.txt') res.writeHead(404).end();
			else res.writeHead(200, { 'content-type': 'text/html' }).end(page(path));
		}, delay(path));
	});
}

test('the browser inventory loaded several pages at once is the inventory one page at a time takes', async () => {
	const elsewhere = createServer((_req, res) => res.writeHead(200, { 'content-type': 'text/html' }).end('<title>elsewhere</title>'));
	const away = await listen(elsewhere);
	const server = site(away);
	const origin = await listen(server);
	try {
		const strip = (i: Awaited<ReturnType<typeof plan>>) => JSON.parse(JSON.stringify(i, (k, v) => (/^(generatedAt|plannedAt|at)$/.test(k) ? undefined : v)));
		const one = strip(await plan({ origin, limit: 40 }));
		const four = strip(await plan({ origin, limit: 40, concurrency: 4 }));
		assert.ok(one.routes.length > 20, `the site has ${one.routes.length} routes`);
		assert.deepEqual(four, one);
		const capped = strip(await plan({ origin, limit: 7, concurrency: 4 }));
		assert.deepEqual(capped, strip(await plan({ origin, limit: 7 })), 'a page read ahead past the limit is not listed');
	} finally {
		for (const s of [server, elsewhere]) {
			s.closeAllConnections();
			s.close();
		}
	}
});
