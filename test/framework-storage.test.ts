import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { chromium, type Browser } from 'playwright';
import { sealedBy, storageCandidate, storageOwner } from '../src/check/automatic.ts';
import { runCheck } from '../src/check/run.ts';
import { VIEWPORTS, type PageCapture } from '../src/check/types.ts';

const sealed = (v: string) => encodeURIComponent(Buffer.from(JSON.stringify({ iv: 'aXY=', value: v, mac: 'f00d', tag: '' })).toString('base64'));
// Enough of htmx for its runtime markers and its history cache: it notes the path on load and caches the page on a boosted click.
const HTMX = `/* htmx */ document.addEventListener('htmx:configRequest', () => {}); document.addEventListener('htmx:afterSwap', () => {});
sessionStorage.setItem('htmx-current-path-for-history', location.pathname);
document.addEventListener('click', (e) => { const a = e.target.closest('a[hx-boost]'); if (a) sessionStorage.setItem('htmx-history-cache', '[]'); });`;

// The old site is Laravel and htmx; the port has neither. `extra` puts a difference in the port's Wave button, `cart` an app key only the old page keeps.
function site(old: boolean, options: { wave?: string; cart?: boolean } = {}): Promise<Server> {
	const server = createServer((req, res) => {
		const path = new URL(req.url ?? '/', 'http://x').pathname;
		const cookies = old ? { 'set-cookie': [`XSRF-TOKEN=${sealed('x')}; Path=/`, `shop_session=${sealed('s')}; Path=/; HttpOnly`] } : {};
		if (old && path === '/htmx.js') return void res.writeHead(200, { 'content-type': 'text/javascript' }).end(HTMX);
		if (path !== '/' && path !== '/about') return void res.writeHead(404, { 'content-type': 'text/plain' }).end('not found');
		const body = path === '/about'
			? '<h1>About</h1>'
			: `<h1>Home</h1><a href="/about" ${old ? 'hx-boost="true"' : ''}>About</a><p id="n">0</p><button onclick="document.getElementById('n').textContent = '${old ? '1' : (options.wave ?? '1')}'">Wave</button>${options.cart && old ? '<script>localStorage.setItem("cart", "[]")</script>' : ''}`;
		res.writeHead(200, { 'content-type': 'text/html', ...cookies }).end(`<!doctype html><html lang="en"><title>Shop</title><main>${body}</main>${old ? '<script src="/htmx.js"></script>' : ''}`);
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
const check = async (options?: Parameters<typeof site>[1]) => {
	const [a, b] = await Promise.all([site(true, options), site(false, options)]);
	servers.push(a, b);
	return (await runCheck({ oldOrigin: at(a), newOrigin: at(b), routes: ['/'], viewports: [VIEWPORTS[0]!], browser, switched: ['/about'] })).routes[0]!;
};
const storage = (r: Awaited<ReturnType<typeof check>>) => r.failures.filter((f) => /storage|kept in the browser/.test(`${f.check} ${f.expected}`));

test("htmx's history keys and Laravel's sealed cookies, which only the old framework writes, are accepted automatically as framework internal", async () => {
	const route = await check();
	const found = storage(route);
	assert.ok(found.some((f) => f.check === 'browser storage after the page loads'), 'the load storage difference is there');
	assert.ok(found.some((f) => f.check === 'click link "About"'), 'the boosted click caches the page');
	for (const f of found) assert.equal(f.accepted?.automatic, 'framework-storage', `${f.check}: ${f.actual}`);
	assert.match(found.find((f) => f.check === 'browser storage after the page loads')!.accepted!.reason, /cookie XSRF-TOKEN \(Laravel\).*cookie shop_session \(Laravel\).*sessionStorage htmx-current-path-for-history \(htmx\)/);
	assert.ok(route.ok, route.failures.filter((f) => !f.accepted).map((f) => f.check).join('; '));
});

test('a journey difference on the route stays red beside them, and an app key among them keeps them red', async () => {
	const differs = await check({ wave: '2' });
	assert.ok(storage(differs).some((f) => f.check === 'browser storage after the page loads' && f.accepted?.automatic === 'framework-storage'), 'the framework\'s own keys are its internals whatever else differs');
	assert.ok(!differs.ok && differs.failures.some((f) => !f.accepted && f.dimension === 'behaviour'), 'the journey difference itself is still red');
	const cart = await check({ cart: true });
	const load = storage(cart).find((f) => f.check === 'browser storage after the page loads')!;
	assert.match(load.actual, /localStorage cart/);
	assert.equal(load.accepted, undefined);
});

test('ownership needs the evidence: the runtime on the old page and not the new one, or a sealed cookie the new page does not set', () => {
	const page = (over: Partial<PageCapture>) => ({ assets: [], ...over }) as unknown as PageCapture;
	const htmx = page({ assets: [{ url: '/htmx.js', type: 'script', status: 200, contentType: '', bytes: 1, fingerprinted: false, runtime: 'htmx' }] });
	assert.equal(storageOwner([htmx], [page({})])('+ sessionStorage htmx-history-cache'), 'htmx');
	assert.equal(storageOwner([page({})], [page({})])('sessionStorage htmx-history-cache'), undefined);
	assert.equal(storageOwner([htmx], [htmx])('sessionStorage htmx-history-cache'), undefined);
	assert.equal(storageOwner([page({ sealed: { app_session: 'Laravel' } })], [page({})])('cookie app_session HttpOnly SameSite=Lax session'), 'Laravel');
	assert.equal(storageOwner([page({ sealed: { app_session: 'Laravel' } })], [page({ sealed: { other: 'Laravel' } })])('cookie app_session HttpOnly'), undefined);
	assert.equal(sealedBy(sealed('v')), 'Laravel');
	assert.equal(sealedBy('plain'), undefined);
	assert.equal(storageCandidate(['cookie a'], ['cookie b'], () => 'Laravel'), undefined, 'a key only the new page keeps is never the old framework');
});
