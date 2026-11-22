import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { appStateVersion, oldSideVersion, toolchain, keepChecked, readClosures, readReusable, referencedFiles, selectReusable, shipKey, writeReusable } from '../src/check/ship-key.ts';
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

const result = (extra: Partial<RouteResult> = {}): RouteResult => ({ route: '/a', ok: true, dimensions: {} as RouteResult['dimensions'], failures: [], weight: { old: {} as never, new: {} as never }, visualDiffs: [], shots: [], checkedAs: 'as', ...extra });

test('a kept result is read back marked reused, with the key and when it was checked', async () => {
	const dir = await mkdtemp(join(tmpdir(), 'ship-'));
	await writeReusable(dir, 'k1', result(), '2026-10-28T00:00:00.000Z');
	const back = await readReusable(dir, 'k1');
	assert.equal(back?.route, '/a');
	assert.deepEqual(back?.reused, { key: 'k1', checkedAt: '2026-10-28T00:00:00.000Z' });
	assert.equal(await readReusable(dir, 'k2'), undefined);
});

test('a result that compared nothing or part of the route (unreachable, a bot wall, one dimension only, stopped at its timeout) is never kept', async () => {
	const dir = await mkdtemp(join(tmpdir(), 'ship-'));
	await writeReusable(dir, 'k1', result({ ok: false, infrastructure: { message: 'timeout' } as never }), 'now');
	await writeReusable(dir, 'k2', result({ ok: false, blocked: { message: 'wall' } as never }), 'now');
	await writeReusable(dir, 'k3', result({ only: 'load' }), 'now');
	await writeReusable(dir, 'k4', result({ ok: false, failures: [{ route: '/a', dimension: 'http', check: 'the check of this route', expected: 'the check runs to the end', actual: 'incomplete: timed out after 3600 s', hint: '' }] }), 'now');
	assert.deepEqual(await readdir(dir), [], 'a route stopped at --timeout part way compared only part of itself');
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
		const first = await selectReusable({ routes: ['/a', '/b', '/missing'], newOrigin, oldOrigin, closures: closures(base), versions, dir, checkedAs: () => 'as' });
		assert.deepEqual(first.check, ['/a', '/b', '/missing']);
		assert.match(first.unkeyed.get('/missing') ?? '', /404/);
		await keepChecked(dir, [result({ route: '/a', files: [] }), result({ route: '/b', ok: false, files: [] })], first, '2026-10-28T00:00:00.000Z', { newOrigin });
		// A new build: every pack renamed, and one module only /b runs changed.
		chunk = 'CCCCCCCC';
		const second = await selectReusable({ routes: ['/a', '/b', '/missing'], newOrigin, oldOrigin, closures: closures({ ...base, 'symbol:b:0': 'b9' }), versions, dir, checkedAs: () => 'as' });
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
		const select = () => selectReusable({ routes: ['/a'], newOrigin, oldOrigin, closures: closures(base), versions, dir, checkedAs: () => 'as' });
		const keep = async (network: string[]) => keepChecked(dir, [result({ files: [], network: { old: [], new: network, server: { old: false, new: false } } })], await select(), '2026-10-28T00:00:00.000Z', { newOrigin });
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

test("a file only the hosting platform serves (Vercel's /_vercel/insights) is not a file the route ships, so it never leaves the route without a key", () => {
	const html = '<html><head><link rel="stylesheet" href="/app.css"><script defer src="/_vercel/insights/script.js"></script><script defer src="/_vercel/speed-insights/script.js"></script><script src="https://cdn.example/x.js"></script></head></html>';
	assert.deepEqual(referencedFiles(html, 'http://127.0.0.1:3000'), ['http://127.0.0.1:3000/app.css']);
});

test("the app's state a check reads (accepted differences, overrides, switched routes, the inventory) is part of the key", async () => {
	const app = await mkdtemp(join(tmpdir(), 'ship-app-'));
	try {
		await mkdir(join(app, '.migrate'));
		const before = await appStateVersion(app);
		assert.equal(await appStateVersion(app), before);
		for (const file of ['accepted.json', 'overrides.json', 'switched.json', 'inventory.json']) {
			await writeFile(join(app, '.migrate', file), '{"x":1}');
			const written = await appStateVersion(app);
			assert.notEqual(written, before, file);
			await writeFile(join(app, '.migrate', file), '{"x":2}');
			assert.notEqual(await appStateVersion(app), written, `${file} edited`);
			await rm(join(app, '.migrate', file));
		}
		assert.equal(await appStateVersion(app), before);
	} finally {
		await rm(app, { recursive: true, force: true });
	}
});

test("the Markless packages and the build toolchain the port names are in the key; a port naming no Markless package has none", () => {
	const pkg = { dependencies: { '@markless/core': 'file:./.markless-local/markless-core-0.9.0.tgz', react: '19.0.0' }, devDependencies: { 'vite-plus': '1.3.0' }, pnpm: { overrides: { vite: 'npm:@voidzero-dev/vite-plus-core@1.3.0' } } };
	assert.equal(toolchain(pkg), '@markless/core@file:./.markless-local/markless-core-0.9.0.tgz vite@npm:@voidzero-dev/vite-plus-core@1.3.0 vite-plus@1.3.0');
	assert.notEqual(toolchain({ ...pkg, devDependencies: { 'vite-plus': '1.4.0' } }), toolchain(pkg), 'another Vite+ builds other bytes');
	assert.equal(toolchain({ devDependencies: { 'vite-plus': '1.3.0' } }), '');
});

test("an image, a font through the stylesheet, a pack or a later fetch the route's check loaded changing bytes means checking again, though the HTML names none of them", async () => {
	const files: Record<string, string> = { '/site.css': '@font-face{src:url(/inter.woff2)}', '/inter.woff2': 'font1', '/hero.png': 'png1', '/build/chunk-AAAAAAAA.js': 'pack1', '/search.json': '[1]' };
	const html = page('pages/a.tsrx', 'AAAAAAAA').replace('</head>', '<link rel="stylesheet" href="/site.css"></head>');
	const server = createServer((req, res) => {
		if (req.url === '/a') return void res.writeHead(200, { 'content-type': 'text/html' }).end(html);
		const body = files[req.url ?? ''];
		if (body === undefined) return void res.writeHead(404).end();
		res.writeHead(200, { 'content-type': 'application/octet-stream' }).end(body);
	});
	const oldServer = createServer((_, res) => void res.writeHead(200, { 'content-type': 'text/html' }).end('<!doctype html><p>old</p>'));
	await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
	await new Promise<void>((done) => oldServer.listen(0, '127.0.0.1', done));
	try {
		const newOrigin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
		const oldOrigin = `http://127.0.0.1:${(oldServer.address() as AddressInfo).port}`;
		const dir = await mkdtemp(join(tmpdir(), 'ship-'));
		const select = () => selectReusable({ routes: ['/a'], newOrigin, oldOrigin, closures: closures(base), versions, dir, checkedAs: () => 'as' });
		const keep = async () => keepChecked(dir, [result({ files: ['/a', '/build/chunk-AAAAAAAA.js', '/hero.png', '/inter.woff2', '/search.json', '/site.css'] })], await select(), '2026-11-21T00:00:00.000Z', { newOrigin });
		await keep();
		assert.equal((await select()).reused.length, 1);
		for (const [file, bytes] of [['/hero.png', 'png2'], ['/inter.woff2', 'font2'], ['/build/chunk-AAAAAAAA.js', 'pack2'], ['/search.json', '[2]']] as const) {
			await keep();
			files[file] = bytes;
			assert.equal((await select()).reused.length, 0, `${file} changed`);
		}
		await keep();
		delete files['/hero.png'];
		assert.equal((await select()).reused.length, 0, 'a file the route loaded is gone');
		await keepChecked(dir, [result()], await select(), '2026-11-21T00:00:00.000Z', { newOrigin });
		assert.equal((await select()).reused.length, 0, 'a result that does not say which files its check loaded is never reused');
	} finally {
		server.close();
		oldServer.close();
	}
});

test("a route kept as one its template's representative stood for is checked again once it is the representative, and when the shared layout controls it exercises change", async () => {
	const { routeRoles } = await import('../src/check/checked-as.ts');
	const { defaultEnv } = await import('../src/check/browser.ts');
	const doc = '<!doctype html><html><body><main><h1>Doc</h1><button aria-expanded="false">Menu</button></main></body></html>';
	const site = Array.from({ length: 22 }, (_, i) => `/docs/page-${String(i).padStart(2, '0')}`);
	const server = createServer((req, res) => {
		if (site.includes(req.url ?? '')) return void res.writeHead(200, { 'content-type': 'text/html' }).end(page('pages/a.tsrx', 'AAAAAAAA'));
		res.writeHead(404).end();
	});
	const oldServer = createServer((_, res) => void res.writeHead(200, { 'content-type': 'text/html' }).end(doc));
	await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
	await new Promise<void>((done) => oldServer.listen(0, '127.0.0.1', done));
	try {
		const newOrigin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
		const oldOrigin = `http://127.0.0.1:${(oldServer.address() as AddressInfo).port}`;
		const dir = await mkdtemp(join(tmpdir(), 'ship-'));
		const route = '/docs/page-01';
		const survey = (owner: string) => ({ version: 1 as const, roles: [{ role: null, routes: site.map((r) => ({ route: r, layout: r === owner ? ['nav button "Menu"'] : [], own: 0 })) }] });
		const roles = (pages: readonly string[], owner: string) => routeRoles({ old: defaultEnv(oldOrigin), site: pages, templates: {}, survey: survey(owner) });
		const select = async (pages: readonly string[], owner: string) => selectReusable({ routes: [route], newOrigin, oldOrigin, closures: closures(base), versions, dir, checkedAs: await roles(pages, owner) });
		const keep = async (pages: readonly string[], owner: string) => {
			const checkedAs = (await roles(pages, owner))(route);
			await keepChecked(dir, [result({ route, files: [], checkedAs })], await select(pages, owner), '2026-11-21T00:00:00.000Z', { newOrigin });
		};
		await keep(site, site[0]!);
		assert.equal((await select(site, site[0]!)).reused.length, 1, 'kept while page-00 is the representative and the owner');
		assert.equal((await select(site.slice(1), site[0]!)).reused.length, 0, 'page-00 left the site: page-01 is the representative now');
		assert.equal((await select(site, route)).reused.length, 0, 'page-01 exercises the shared menu now');
		await keepChecked(dir, [result({ route, files: [], checkedAs: 'something else' })], await select(site, site[0]!), '2026-11-21T00:00:00.000Z', { newOrigin });
		assert.equal((await select(site, site[0]!)).reused.length, 1, 'a result checked in another role than its key says is not kept over the right one');
	} finally {
		server.close();
		oldServer.close();
	}
});

test('a reused result reports in-place navigation into it as not checked: what it found there depends on the entry pages, which may have changed', async () => {
	const server = createServer((req, res) => {
		if (req.url === '/a') return void res.writeHead(200, { 'content-type': 'text/html' }).end(page('pages/a.tsrx', 'AAAAAAAA'));
		res.writeHead(404).end();
	});
	const oldServer = createServer((_, res) => void res.writeHead(200, { 'content-type': 'text/html' }).end('<!doctype html><p>old</p>'));
	await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
	await new Promise<void>((done) => oldServer.listen(0, '127.0.0.1', done));
	try {
		const newOrigin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
		const oldOrigin = `http://127.0.0.1:${(oldServer.address() as AddressInfo).port}`;
		const dir = await mkdtemp(join(tmpdir(), 'ship-'));
		const select = () => selectReusable({ routes: ['/a'], newOrigin, oldOrigin, closures: closures(base), versions, dir, checkedAs: () => 'as' });
		const dimensions = { ...({} as RouteResult['dimensions']), rendered: 'pass' as const, navigation: 'pass' as const };
		const shot = { label: 'navigation: in place from /', viewport: 'desktop', old: {} as never, new: {} as never, regions: [], ok: false };
		await keepChecked(dir, [result({ files: [], dimensions, navigation: { from: ['/'] }, shots: [shot] })], await select(), '2026-11-22T00:00:00.000Z', { newOrigin });
		const green = (await select()).reused[0];
		assert.equal(green?.dimensions.navigation, 'skipped', 'kept green after navigation from / passed');
		assert.equal(green?.navigation, undefined);
		assert.deepEqual(green?.shots, []);
		const failure = { route: '/a', dimension: 'navigation' as const, check: 'in place from /', expected: 'x', actual: 'y', hint: '' };
		await keepChecked(dir, [result({ ok: false, files: [], dimensions: { ...dimensions, navigation: 'fail' }, failures: [failure], navigation: { from: ['/'] } })], await select(), '2026-11-22T00:00:00.000Z', { newOrigin });
		const red = (await select()).reused[0];
		assert.equal(red?.dimensions.navigation, 'skipped');
		assert.deepEqual(red?.failures, []);
		assert.equal(red?.dimensions.rendered, 'pass', 'every other dimension as it was checked');
	} finally {
		server.close();
		oldServer.close();
	}
});

test("the old site is keyed by the id of the build served and of the dataset read, not by its HTML alone: its images or data can change under the same HTML", async () => {
	const app = await mkdtemp(join(tmpdir(), 'ship-app-'));
	try {
		const one = await oldSideVersion(app, [], 'a'.repeat(64));
		assert.ok(one.version);
		assert.notEqual((await oldSideVersion(app, [], 'b'.repeat(64))).version, one.version, 'another published original');
		const none = await oldSideVersion(app, [], undefined);
		assert.equal(none.version, undefined, 'an old site no id names is never taken as unchanged');
		assert.match(none.why ?? '', /MIGRATE_ORIGINAL_ID/);
		await mkdir(join(app, 'dataset'));
		await writeFile(join(app, 'dataset', 'manifest.json'), '{"originalId":"a","producedAt":"1"}');
		const read = await oldSideVersion(app, ['--original', 'dataset'], 'a'.repeat(64));
		assert.ok(read.version);
		assert.notEqual(read.version, one.version, 'the dataset read in place of observing the old side');
		await writeFile(join(app, 'dataset', 'manifest.json'), '{"originalId":"a","producedAt":"2"}');
		assert.notEqual((await oldSideVersion(app, ['--original', 'dataset'], 'a'.repeat(64))).version, read.version, 'the dataset produced again');
		assert.match((await oldSideVersion(app, ['--original', 'missing'], 'a'.repeat(64))).why ?? '', /manifest/);
	} finally {
		await rm(app, { recursive: true, force: true });
	}
});

test("under --data replay the recordings served to the old side are part of the key; under record they are what the check writes, and are not", async () => {
	const app = await mkdtemp(join(tmpdir(), 'ship-app-'));
	try {
		await mkdir(join(app, '.migrate', 'data'), { recursive: true });
		await writeFile(join(app, '.migrate', 'data', 'index.json'), '{"responses":[1]}');
		const replay = await appStateVersion(app, ['--data', 'replay']);
		const record = await appStateVersion(app, ['--data', 'record']);
		await writeFile(join(app, '.migrate', 'data', 'index.json'), '{"responses":[2]}');
		assert.notEqual(await appStateVersion(app, ['--data', 'replay']), replay, 'a recording replayed changed');
		assert.equal(await appStateVersion(app, ['--data', 'record']), record);
		await writeFile(join(app, '.migrate', 'data', 'docs.json'), '{}');
		assert.notEqual(await appStateVersion(app, ['--data', 'replay']), replay, 'a recording added');
	} finally {
		await rm(app, { recursive: true, force: true });
	}
});

test("a route kept while it left a shared layout control to the route owning it is checked again once the survey no longer places that control on it, as its check then exercises it", async () => {
	const { routeRoles } = await import('../src/check/checked-as.ts');
	const { defaultEnv } = await import('../src/check/browser.ts');
	const server = createServer((req, res) => {
		if (req.url === '/b') return void res.writeHead(200, { 'content-type': 'text/html' }).end(page('pages/b.tsrx', 'AAAAAAAA'));
		res.writeHead(404).end();
	});
	const oldServer = createServer((_, res) => void res.writeHead(200, { 'content-type': 'text/html' }).end('<!doctype html><p>old</p>'));
	await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
	await new Promise<void>((done) => oldServer.listen(0, '127.0.0.1', done));
	try {
		const newOrigin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
		const oldOrigin = `http://127.0.0.1:${(oldServer.address() as AddressInfo).port}`;
		const dir = await mkdtemp(join(tmpdir(), 'ship-'));
		const menu = 'nav button "Menu"';
		const survey = (onB: boolean) => ({ version: 1 as const, roles: [{ role: null, routes: [{ route: '/a', layout: [menu], own: 0 }, { route: '/b', layout: onB ? [menu] : [], own: 0 }] }] });
		const roles = (onB: boolean) => routeRoles({ old: defaultEnv(oldOrigin), site: ['/a', '/b'], templates: false, survey: survey(onB) });
		const select = async (onB: boolean) => selectReusable({ routes: ['/b'], newOrigin, oldOrigin, closures: closures(base), versions, dir, checkedAs: await roles(onB) });
		await keepChecked(dir, [result({ route: '/b', files: [], checkedAs: (await roles(true))('/b') })], await select(true), '2026-11-22T00:00:00.000Z', { newOrigin });
		assert.equal((await select(true)).reused.length, 1, 'kept while /a owns the menu and /b leaves it');
		assert.equal((await select(false)).reused.length, 0, "the menu is not on /b's survey row: /b's check uses it itself");
	} finally {
		server.close();
		oldServer.close();
	}
});

test("a run with no layout survey given names a route that left a shared control to another of its routes so, and keeps it under no unsurveyed key: checked alone it would use that control", async () => {
	const { checkedAs, checkedAsRun } = await import('../src/check/checked-as.ts');
	const unsurveyed = checkedAs(false, undefined);
	assert.equal(checkedAsRun(false, { owned: ['nav button "Menu"'], left: [] }, false), unsurveyed, 'it used every control on its pages, as alone');
	assert.notEqual(checkedAsRun(false, { owned: [], left: ['nav button "Menu"'] }, false), unsurveyed);
	assert.notEqual(checkedAsRun(false, { owned: [], left: [] }, true), checkedAsRun(false, { owned: [], left: ['nav button "Menu"'] }, true), 'with a survey, what it leaves to others is in the line');
});
