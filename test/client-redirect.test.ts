import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { chromium, type Browser } from 'playwright';
import { LAUNCH } from '../src/check/browser.ts';
import { runCheck } from '../src/check/run.ts';
import { VIEWPORTS } from '../src/check/types.ts';

const page = (script = '') => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Users</title></head><body><main><h1>Users</h1><p>Ada, Grace</p></main>${script}</body></html>`;

// The old single-page app writes its default view into the address as soon as it starts, as a router's mount effect does.
const spa = (): Promise<Server> =>
	serve((path) => (path === '/users' || path === '/users/' ? { status: 200, body: page(`<script>if (!location.search) history.replaceState(null, '', '/users?view=%7B%7D');</script>`) } : undefined));
// The server-rendered port answers the bare address with a redirect to the same place, or (`elsewhere`) to another page.
const ssr = (elsewhere = false): Promise<Server> =>
	serve((path, search) => (path === '/users' || path === '/users/' ? (search && path === '/users' ? { status: 200, body: page() } : { status: 307, location: elsewhere ? '/people?view=%7B%7D' : '/users?view=%7B%7D' }) : path === '/people' ? { status: 200, body: page() } : undefined));

const servers: Server[] = [];
function serve(answer: (path: string, search: string) => { status: number; body?: string; location?: string } | undefined): Promise<Server> {
	const server = createServer((req, res) => {
		const url = new URL(req.url ?? '/', 'http://x');
		const found = answer(url.pathname, url.search);
		if (!found) return void res.writeHead(404, { 'content-type': 'text/html' }).end('<!doctype html><title>Not found</title>');
		res.writeHead(found.status, { 'content-type': 'text/html', ...(found.location ? { location: found.location } : {}) }).end(found.body ?? '');
	});
	servers.push(server);
	return new Promise((done) => server.listen(0, '127.0.0.1', () => done(server)));
}
const origin = (s: Server) => `http://127.0.0.1:${(s.address() as AddressInfo).port}`;

let browser: Browser;
before(async () => {
	browser = await chromium.launch({ ...LAUNCH, ignoreDefaultArgs: [...LAUNCH.ignoreDefaultArgs] });
});
after(async () => {
	await browser?.close();
	for (const s of servers) s.close();
});

const http = async (next: Server) => {
	const report = await runCheck({ oldOrigin: origin(await spa()), newOrigin: origin(next), routes: ['/users'], viewports: [VIEWPORTS[0]!], browser, concurrency: 1, journeys: { maxJourneys: 20 } });
	return report.routes[0]!.failures.filter((f) => f.dimension === 'http').map((f) => [f.check, f.expected, f.actual]);
};

test('an address the old app moves to in the browser as it loads, which the new server redirects to, is the same answer', async () => {
	assert.deepEqual(await http(await ssr()), []);
});

test('a server redirect somewhere other than where the old app moved to in the browser is still red', async () => {
	const red = await http(await ssr(true));
	assert.ok(red.some(([check, , actual]) => /redirect chain|status/.test(check!) && /people/.test(actual!)), JSON.stringify(red));
});

const slashed = async (next: Server) => {
	const report = await runCheck({ oldOrigin: origin(await spa()), newOrigin: origin(next), routes: ['/users', '/users/'], redirects: ['/users/'], coverage: ['/users'], viewports: [VIEWPORTS[0]!], browser, concurrency: 1, journeys: { maxJourneys: 20 } });
	const red = report.routes.find((r) => r.route === '/users/')!.failures.filter((f) => f.dimension === 'http').map((f) => [f.check, f.expected, f.actual]);
	return { red, missing: report.coverage?.missing ?? [] };
};

test('the other trailing-slash form of such a route, and the route list, read that redirect as the same answer too', async () => {
	assert.deepEqual(await slashed(await ssr()), { red: [], missing: [] });
});

test('a trailing-slash form or a route the new server sends somewhere else is still red and still missing', async () => {
	const { red, missing } = await slashed(await ssr(true));
	assert.ok(red.some(([, , actual]) => /people/.test(actual!)), JSON.stringify(red));
	assert.deepEqual(missing, ['/users']);
});
