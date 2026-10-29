import assert from 'node:assert/strict';
import { mkdtemp, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { keepChecked, readClosures, readReusable, selectReusable, shipKey, writeReusable } from '../src/check/ship-key.ts';
import type { RouteResult } from '../src/check/types.ts';

const page = (file: string, chunk: string, text = 'Hello') =>
	`<!doctype html><html><head><script type="importmap">{"imports":{"@markless/c/abc":"/build/chunk-${chunk}.js"}}</script><script type="@markless/core/route">{"file":"${file}","resume":["/build/chunk-${chunk}.js","$x"]}</script></head><body><p>${text}</p><script data-markless-resume-module="/build/chunk-${chunk}.js"></script></body></html>`;

// The build's interaction-closures asset: each module once, each closure once, routes naming closures by index.
const closures = (hashes: Record<string, string>, extra: Record<string, unknown> = {}) => {
	const modules = Object.keys(hashes).sort();
	const at = (ids: string[]) => ids.map((id) => modules.indexOf(id)).sort((a, b) => a - b);
	return readClosures(
		JSON.stringify({
			version: 2,
			modules,
			moduleHashes: modules.map((m) => hashes[m]),
			closures: [at(['pages/a.tsrx?markless-resume', 'symbol:a:0']), at(['pages/b.tsrx?markless-resume', 'symbol:b:0'])],
			routes: [
				{ route: 'pages/a.tsrx', consumers: [{ key: 'boot', kind: 'boot', closure: 0 }] },
				{ route: 'pages/b.tsrx', consumers: [{ key: 'boot', kind: 'boot', closure: 1 }] },
			],
			...extra,
		}),
	);
};
const base = { 'pages/a.tsrx?markless-resume': 'a1', 'symbol:a:0': 'a2', 'pages/b.tsrx?markless-resume': 'b1', 'symbol:b:0': 'b2' };
const versions = { migrate: 'tree1', markless: '0.9.0' };

test('a route keeps its key when only pack file names change: the code it can run is compared by module, not by pack', () => {
	const one = shipKey('/a', page('pages/a.tsrx', 'AAAAAAAA'), closures(base), versions);
	const two = shipKey('/a', page('pages/a.tsrx', 'BBBBBBBB'), closures(base), versions);
	assert.ok(one.key);
	assert.equal(two.key, one.key);
});

test('a change to a module the route can run gives it a new key; a change only another route runs does not', () => {
	const before = shipKey('/a', page('pages/a.tsrx', 'AAAAAAAA'), closures(base), versions).key;
	assert.notEqual(shipKey('/a', page('pages/a.tsrx', 'AAAAAAAA'), closures({ ...base, 'symbol:a:0': 'a3' }), versions).key, before);
	assert.equal(shipKey('/a', page('pages/a.tsrx', 'AAAAAAAA'), closures({ ...base, 'symbol:b:0': 'b3' }), versions).key, before);
});

test('served HTML, the checker and Markless are each part of the key', () => {
	const before = shipKey('/a', page('pages/a.tsrx', 'AAAAAAAA'), closures(base), versions).key;
	assert.notEqual(shipKey('/a', page('pages/a.tsrx', 'AAAAAAAA', 'Hello!'), closures(base), versions).key, before);
	assert.notEqual(shipKey('/a', page('pages/a.tsrx', 'AAAAAAAA'), closures(base), { ...versions, migrate: 'tree2' }).key, before);
	assert.notEqual(shipKey('/a', page('pages/a.tsrx', 'AAAAAAAA'), closures(base), { ...versions, markless: '0.9.1' }).key, before);
});

test('no key, so the route is checked, when what it can run is not known', () => {
	assert.match(shipKey('/a', '<!doctype html><p>no route script</p>', closures(base), versions).why ?? '', /names no Markless route/);
	assert.match(shipKey('/a', page('pages/c.tsrx', 'AAAAAAAA'), closures(base), versions).why ?? '', /not in the build's closures/);
	assert.match(shipKey('/a', page('pages/a.tsrx', 'AAAAAAAA'), closures({ ...base, 'symbol:a:0': '' }), versions).why ?? '', /no code hash/);
	assert.match(shipKey('/a', page('pages/a.tsrx', 'AAAAAAAA'), undefined, versions).why ?? '', /no closures/);
	const fallback = readClosures(JSON.stringify({ version: 2, modules: [], moduleHashes: [], closures: [], routes: [{ route: 'pages/a.tsrx', fallback: 'missing-demand-map:x', consumers: [] }] }));
	assert.match(shipKey('/a', page('pages/a.tsrx', 'AAAAAAAA'), fallback, versions).why ?? '', /fallback/);
	const unhashed = readClosures(JSON.stringify({ version: 2, modules: ['m'], closures: [[0]], routes: [{ route: 'pages/a.tsrx', consumers: [{ key: 'boot', kind: 'boot', closure: 0 }] }] }));
	assert.match(shipKey('/a', page('pages/a.tsrx', 'AAAAAAAA'), unhashed, versions).why ?? '', /no code hash/);
});

const result = (extra: Partial<RouteResult> = {}): RouteResult => ({ route: '/a', ok: true, dimensions: {} as RouteResult['dimensions'], failures: [], weight: { old: {} as never, new: {} as never }, visualDiffs: [], shots: [], ...extra });

test('a kept result is read back marked reused, with the key and when it was checked', async () => {
	const dir = await mkdtemp(join(tmpdir(), 'ship-'));
	await writeReusable(dir, 'k1', result(), '2026-10-28T00:00:00.000Z');
	const back = await readReusable(dir, 'k1');
	assert.equal(back?.route, '/a');
	assert.deepEqual(back?.reused, { key: 'k1', checkedAt: '2026-10-28T00:00:00.000Z' });
	assert.equal(await readReusable(dir, 'k2'), undefined);
});

test('a result that compared nothing (unreachable, a bot wall, one dimension only) is never kept', async () => {
	const dir = await mkdtemp(join(tmpdir(), 'ship-'));
	await writeReusable(dir, 'k1', result({ ok: false, infrastructure: { message: 'timeout' } as never }), 'now');
	await writeReusable(dir, 'k2', result({ ok: false, blocked: { message: 'wall' } as never }), 'now');
	await writeReusable(dir, 'k3', result({ only: 'load' }), 'now');
	assert.deepEqual(await readdir(dir), []);
});

test('a run reuses the routes whose served HTML and code are as they were, and checks the rest', async () => {
	let chunk = 'AAAAAAAA';
	const server = createServer((req, res) => {
		if (req.url === '/a') return void res.writeHead(200, { 'content-type': 'text/html' }).end(page('pages/a.tsrx', chunk));
		if (req.url === '/b') return void res.writeHead(200, { 'content-type': 'text/html' }).end(page('pages/b.tsrx', chunk));
		res.writeHead(404, { 'content-type': 'text/html' }).end('gone');
	});
	const oldServer = createServer((_, res) => void res.writeHead(200, { 'content-type': 'text/html' }).end('<!doctype html><p>old</p>'));
	await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
	await new Promise<void>((done) => oldServer.listen(0, '127.0.0.1', done));
	try {
		const newOrigin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
		const oldOrigin = `http://127.0.0.1:${(oldServer.address() as AddressInfo).port}`;
		const dir = await mkdtemp(join(tmpdir(), 'ship-'));
		const first = await selectReusable({ routes: ['/a', '/b', '/missing'], newOrigin, oldOrigin, closures: closures(base), versions, dir });
		assert.deepEqual(first.check, ['/a', '/b', '/missing']);
		assert.match(first.unkeyed.get('/missing') ?? '', /404/);
		await keepChecked(dir, [result({ route: '/a' }), result({ route: '/b', ok: false })], first.keys, '2026-10-28T00:00:00.000Z', { newOrigin });
		// A new build: every pack renamed, and one module only /b runs changed.
		chunk = 'CCCCCCCC';
		const second = await selectReusable({ routes: ['/a', '/b', '/missing'], newOrigin, oldOrigin, closures: closures({ ...base, 'symbol:b:0': 'b9' }), versions, dir });
		assert.deepEqual(second.check, ['/b', '/missing']);
		assert.deepEqual(second.reused.map((r) => [r.route, r.reused.checkedAt]), [['/a', '2026-10-28T00:00:00.000Z']]);
	} finally {
		server.close();
		oldServer.close();
	}
});

test('a stylesheet, a script outside the packs, the old page or a response the page loaded changing means checking again', async () => {
	const files: Record<string, string> = { '/site.css': 'p{color:red}', '/vendor.js': 'v1', '/api/data': '{"n":1}', '/api/item/12345': '{}' };
	let old = '<!doctype html><p>old</p>';
	const html = page('pages/a.tsrx', 'AAAAAAAA').replace('</head>', '<link rel="stylesheet" href="/site.css"><script src="/vendor.js"></script></head>');
	const serve = (port: number) => createServer((req, res) => {
		if (port === 0 && req.url === '/a') return void res.writeHead(200, { 'content-type': 'text/html' }).end(html);
		if (port === 1 && req.url === '/a') return void res.writeHead(200, { 'content-type': 'text/html' }).end(old);
		const body = files[req.url ?? ''];
		if (body === undefined) return void res.writeHead(404).end();
		res.writeHead(200, { 'content-type': 'text/plain' }).end(body);
	});
	const servers = [serve(0), serve(1)];
	for (const s of servers) await new Promise<void>((done) => s.listen(0, '127.0.0.1', done));
	try {
		const [newOrigin, oldOrigin] = servers.map((s) => `http://127.0.0.1:${(s.address() as AddressInfo).port}`) as [string, string];
		const dir = await mkdtemp(join(tmpdir(), 'ship-'));
		const select = () => selectReusable({ routes: ['/a'], newOrigin, oldOrigin, closures: closures(base), versions, dir });
		const keep = async (network: string[]) => keepChecked(dir, [result({ network: { old: [], new: network, server: { old: false, new: false } } })], (await select()).keys, '2026-10-28T00:00:00.000Z', { newOrigin });
		await keep(['browser GET {self}/api/data']);
		assert.equal((await select()).reused.length, 1);
		files['/site.css'] = 'p{color:blue}';
		assert.equal((await select()).reused.length, 0, 'a stylesheet changed');
		await keep(['browser GET {self}/api/data']);
		files['/vendor.js'] = 'v2';
		assert.equal((await select()).reused.length, 0, 'a script outside the packs changed');
		await keep(['browser GET {self}/api/data']);
		old = '<!doctype html><p>old, rebuilt</p>';
		assert.equal((await select()).reused.length, 0, 'the old page changed');
		await keep(['browser GET {self}/api/data']);
		files['/api/data'] = '{"n":2}';
		assert.equal((await select()).reused.length, 0, 'a response the page loaded changed');
		await keep(['2x browser GET {self}/api/item/{id}']);
		assert.equal((await select()).reused.length, 0, 'a request that cannot be fetched again as it was is never taken as unchanged');
	} finally {
		for (const s of servers) s.close();
	}
});
