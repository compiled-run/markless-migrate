import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { chromium, type Browser } from 'playwright';
import { runCheck, type CheckOptions } from '../src/check/run.ts';
import { VIEWPORTS, type Failure } from '../src/check/types.ts';

let browser: Browser;
const servers: Server[] = [];
before(async () => {
	browser = await chromium.launch();
});
after(async () => {
	await browser?.close();
	for (const s of servers) s.close();
});

interface Site {
	readonly origin: string;
	readonly hits: Map<string, number>;
}

// Like a Next.js page: each render carries a fresh id in its HTML, and the button fetches its data from the app (an RSC payload).
async function site(): Promise<Site> {
	const hits = new Map<string, number>();
	let renders = 0;
	const server = createServer((req, res) => {
		const path = new URL(req.url ?? '/', 'http://x').pathname;
		hits.set(path, (hits.get(path) ?? 0) + 1);
		if (path === '/data') return void res.writeHead(200, { 'content-type': 'text/x-component', 'cache-control': 'no-store' }).end(`0:"Loaded" render ${++renders}`);
		if (path !== '/') return void res.writeHead(404).end('not found');
		const page = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Page</title></head><body><!-- render ${++renders} --><main><h1>Page</h1><button id="b">Load</button><p id="out"></p></main><script>document.getElementById('b').onclick = () => fetch('/data').then((r) => r.text()).then(() => { document.getElementById('out').textContent = 'Loaded'; });</script></body></html>`;
		res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }).end(page);
	});
	servers.push(server);
	const origin = await new Promise<string>((done) => server.listen(0, '127.0.0.1', () => done(`http://127.0.0.1:${(server.address() as AddressInfo).port}`)));
	return { origin, hits };
}

const desktop = [VIEWPORTS[0]!];
const check = (oldOrigin: string, newOrigin: string, more: Partial<CheckOptions> = {}) => runCheck({ oldOrigin, newOrigin, routes: ['/'], viewports: desktop, browser, journeys: { budgetMs: 20_000 }, ...more });
const verdicts = (failures: readonly Failure[]) => failures.filter((f) => !f.accepted).map((f) => `${f.dimension}: ${f.check}: ${f.actual}`).sort();

test('a frozen original is recorded once per build and replayed: no later run loads, explores or asks it for data, and the verdicts are the same', async () => {
	const old = await site();
	const next = await site();
	const cacheDir = await mkdtemp(join(tmpdir(), 'mm-reference-'));
	const first = await check(old.origin, next.origin, { cacheDir, oldBuild: 'build-1' });
	assert.equal(first.cache?.miss, 2, JSON.stringify(first.cache));
	assert.ok(old.hits.get('/data'), 'the old page was explored and its button fetched its data');
	old.hits.clear();
	const second = await check(old.origin, next.origin, { cacheDir, oldBuild: 'build-1' });
	assert.equal(second.cache?.hit, 2, `captures and journeys from the recording, though each render differs and the journeys fetch from the app: ${JSON.stringify(second.cache)}`);
	assert.equal(old.hits.get('/data') ?? 0, 0, 'no journey ran on the old page');
	assert.deepEqual(verdicts(second.routes[0]!.failures), verdicts(first.routes[0]!.failures));
	assert.ok(next.hits.get('/data'), 'the port is still driven live');
	old.hits.clear();
	const rebuilt = await check(old.origin, next.origin, { cacheDir, oldBuild: 'build-2' });
	assert.equal(rebuilt.cache?.hit, 0, `another build of the original is recorded afresh: ${JSON.stringify(rebuilt.cache)}`);
	assert.ok(old.hits.get('/data'), 'and explored again');
});

test('without a build identity the original is still checked live while a response it loaded differs', async () => {
	const old = await site();
	const next = await site();
	const cacheDir = await mkdtemp(join(tmpdir(), 'mm-reference-'));
	await check(old.origin, next.origin, { cacheDir });
	const again = await check(old.origin, next.origin, { cacheDir });
	assert.equal(again.cache?.hit, 0, JSON.stringify(again.cache));
});

test('the joined old-side cache keeps only the recordings of the old builds and checker this run used', async () => {
	const { OldCache } = await import('../src/check/cache.ts');
	const { pruneOld } = await import('../scripts/check-shards.ts');
	const { readdir } = await import('node:fs/promises');
	const root = await mkdtemp(join(tmpdir(), 'mm-prune-'));
	const env = { origin: 'http://127.0.0.1:1' } as never;
	const write = (dir: string, build: string) => new OldCache(join(root, dir), null, { build }).write('captures', env, { route: '/' }, [], { at: build });
	await write('joined/cache/old', 'build-1');
	await write('joined/cache/old', 'build-2');
	await write('shards/check-1/app/.migrate/cache/old', 'build-2');
	await write('shards/check-1/app/.migrate/cache/old', 'build-3');
	const before = await readdir(join(root, 'joined/cache/old'));
	assert.equal(before.filter((f) => f.endsWith('.bin')).length, 2);
	assert.equal(await pruneOld(join(root, 'shards'), join(root, 'joined')), 1, 'build-1 is gone');
	const kept = await readdir(join(root, 'joined/cache/old'));
	assert.equal(kept.filter((f) => f.endsWith('.bin')).length, 1);
	assert.equal(await pruneOld(join(root, 'nothing'), join(root, 'joined')), 0, 'a run whose shards used no recording prunes nothing');
});
