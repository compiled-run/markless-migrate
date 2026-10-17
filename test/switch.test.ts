import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { convertRewrites } from '@vercel/routing-utils';
import { assetPaths, assetSources, moduleImports, nitroPattern, nitroRouteRules, notServedBy, vercelConfig, vercelPattern } from '../src/switch/deploy.ts';
import { rewriteLocation, rewriteSetCookie, route } from '../src/switch/proxy.ts';
import { status, summarizeStatus } from '../src/status.ts';
import { isSwitched, readSwitched, switchRoute, unswitchRoute } from '../src/switch/state.ts';

async function project(results: Record<string, { route: string; ok: boolean; red?: string[]; blocked?: string }>): Promise<string> {
	const cwd = await mkdtemp(join(tmpdir(), 'mm-switch-'));
	await mkdir(join(cwd, '.migrate'));
	const full = Object.fromEntries(Object.entries(results).map(([k, r]) => [k, { checkedAt: '2026-10-16T00:00:00Z', old: 'o', new: 'n', failures: [], red: [], ...r }]));
	await writeFile(join(cwd, '.migrate', 'results.json'), JSON.stringify(full));
	return cwd;
}

test('switch needs every role of the route green; --force records the reason and the checks it overrode', async () => {
	const cwd = await project({ '/about/': { route: '/about/', ok: true }, '/members/': { route: '/members/', ok: true }, '/members/ as admin': { route: '/members/', ok: false, red: ['auth'] }, '/x': { route: '/x', ok: false, blocked: 'wall' } });
	assert.equal((await switchRoute(cwd, '/about')).ok, true, 'trailing slash ignored');
	const red = await switchRoute(cwd, '/members/');
	assert.equal(red.ok, false);
	assert.match(!red.ok ? red.reason : '', /\/members\/ as admin: red \[auth\]/);
	assert.equal((await switchRoute(cwd, '/x')).ok, false, 'a blocked route is not green');
	const forced = await switchRoute(cwd, '/members/', { force: { reason: 'admin page ships separately', by: 'Jo' } });
	assert.ok(forced.ok);
	assert.deepEqual(forced.ok && forced.entry.forced, { reason: 'admin page ships separately', by: 'Jo' });
	assert.deepEqual(forced.ok && forced.entry.checks, ['/members/: green', '/members/ as admin: red [auth]']);
	assert.deepEqual((await readSwitched(cwd)).routes.map((r) => r.route), ['/about', '/members/']);
	const listed = summarizeStatus(await status(cwd));
	assert.match(listed, /3 switched to Markless, 2 FORCED \(not proven\)/);
	assert.match(listed, /\/members\/  \(FORCED, not proven: admin page ships separately, by Jo\)/);
	assert.match(listed, /green +\/about\/  \(switched\)/);
	assert.equal((await unswitchRoute(cwd, '/about')).removed, true);
	assert.equal((await unswitchRoute(cwd, '/about')).removed, false);
	assert.match(await readFile(join(cwd, '.migrate', 'switched.json'), 'utf8'), /"forced"/);
});

test('a pattern switches only when every checked path it covers is green', async () => {
	const cwd = await project({ '/blog/a': { route: '/blog/a', ok: true }, '/blog/b': { route: '/blog/b', ok: true } });
	assert.equal((await switchRoute(cwd, '/blog/:slug')).ok, true);
	assert.ok(isSwitched(['/blog/:slug'], '/blog/c?x=1'));
	assert.ok(!isSwitched(['/blog/:slug'], '/blog'));
	assert.ok(isSwitched(['/about/'], '/about'));
});

test('page loads go by the switch list; assets, fetches and posts go to the page they came from first, then the other app', () => {
	const doc = { 'sec-fetch-dest': 'document', host: 'p:1' };
	assert.deepEqual(route('GET', '/about/', doc, ['/about/']), ['new']);
	assert.deepEqual(route('GET', '/', doc, ['/about/']), ['old']);
	assert.deepEqual(route('GET', '/logo.png', { 'sec-fetch-dest': 'image', host: 'p:1', referer: 'http://p:1/about/' }, ['/about/']), ['new', 'old']);
	assert.deepEqual(route('GET', '/logo.png', { 'sec-fetch-dest': 'image', host: 'p:1', referer: 'http://p:1/' }, ['/about/']), ['old', 'new']);
	assert.deepEqual(route('POST', '/api/subscribe', { ...doc, referer: 'http://p:1/about/' }, ['/about/']), ['new', 'old']);
	assert.deepEqual(route('GET', '/app.js', { host: 'p:1' }, []), ['old', 'new'], 'no referer: the path decides, then the other app');
});

test('cookies keep a Domain that covers the proxy host and drop one that does not; redirects to either app come back to the proxy', () => {
	assert.equal(rewriteSetCookie('consent=1; Domain=127.0.0.1; Path=/', 'localhost'), 'consent=1; Path=/');
	assert.equal(rewriteSetCookie('a=1; Domain=.shop.example; Path=/', 'www.shop.example'), 'a=1; Domain=.shop.example; Path=/');
	assert.equal(rewriteLocation('http://127.0.0.1:3000/about/?x=1#y', ['http://127.0.0.1:3000', 'http://127.0.0.1:4000'], 'http://localhost:9'), 'http://localhost:9/about/?x=1#y');
	assert.equal(rewriteLocation('//127.0.0.1:4000/a', ['http://127.0.0.1:3000', 'http://127.0.0.1:4000'], 'http://localhost:9'), 'http://localhost:9/a');
	assert.equal(rewriteLocation('/login/', ['http://127.0.0.1:3000'], 'http://localhost:9'), '/login/');
	assert.equal(rewriteLocation('https://accounts.example/sso', ['http://127.0.0.1:3000'], 'http://localhost:9'), 'https://accounts.example/sso');
});

/** Where Vercel sends a path: the first rewrite whose compiled route matches, as @vercel/routing-utils compiles it. */
function vercelSends(rewrites: { source: string; destination: string }[], path: string): string | undefined {
	for (const route of convertRewrites(rewrites)) {
		const match = new RegExp(route.src!).exec(path);
		if (match) return route.dest!.replace(/\$(\d+)/g, (_, n: string) => match[Number(n)] ?? '');
	}
	return undefined;
}

test('vercel.json, compiled the way Vercel compiles it, sends switched routes to NEW and every other path, / and trailing slashes included, to OLD', () => {
	const vercel = vercelConfig({ old: 'https://old.example/', new: 'https://new.example', switched: ['/about/', '/blog/:slug'], newAssets: ['/_markless/a.js'] });
	const sends = (path: string) => vercelSends(vercel.rewrites, path);
	assert.equal(sends('/'), 'https://old.example/');
	assert.equal(sends('/contact/'), 'https://old.example/contact/');
	assert.equal(sends('/a/b/'), 'https://old.example/a/b/');
	assert.equal(sends('/robots.txt'), 'https://old.example/robots.txt');
	assert.equal(sends('/about/'), 'https://new.example/about/');
	assert.equal(sends('/about'), 'https://new.example/about');
	assert.equal(sends('/blog/hello'), 'https://new.example/blog/hello');
	assert.equal(sends('/blog/hello/'), 'https://new.example/blog/hello/');
	assert.equal(sends('/_markless/chunks/x.js'), 'https://new.example/_markless/chunks/x.js');
});

test('vercel.json keeps a directory per file when the old app loads anything from it, even a file both apps serve', () => {
	const vercel = vercelConfig({ old: 'https://old.example', new: 'https://new.example', switched: ['/'], newAssets: ['/css/port-home.css'], oldPaths: ['/css/site.css'], oldAssets: [] });
	const sends = (path: string) => vercelSends(vercel.rewrites, path);
	assert.equal(sends('/css/port-home.css'), 'https://new.example/css/port-home.css');
	assert.equal(sends('/css/other.css'), 'https://old.example/css/other.css');
});

test('deploy config: patterns in each router syntax, asset directories only when the other app has none there', () => {
	assert.equal(vercelPattern('/docs/*rest'), '/docs/:rest+');
	assert.equal(vercelPattern('/docs/*rest?'), '/docs/:rest*');
	assert.equal(nitroPattern('/docs/*rest'), '/docs/**');
	assert.equal(nitroPattern('/blog/:slug'), '/blog/:slug');
	assert.deepEqual(assetSources(['/_markless/a.js', '/assets/x.js', '/icon.svg'], ['/assets/y.js']), ['/_markless/**', '/assets/x.js', '/icon.svg']);
	assert.deepEqual(nitroRouteRules({ old: 'https://old.example', new: 'https://new.example', switched: ['/about/'], oldRoutes: ['/', '/about/', '/blog/:slug'], oldAssets: ['/assets/i.js'] }), {
		'/': { proxy: 'https://old.example/' },
		'/blog/:slug': { proxy: 'https://old.example/blog/:slug' },
		'/blog/:slug/': { proxy: 'https://old.example/blog/:slug/' },
		'/assets/i.js': { proxy: 'https://old.example/assets/i.js' },
	});
	assert.deepEqual(assetPaths('<link rel="canonical" href="/x/"><link rel="stylesheet" href="/a.css"><img srcset="/i-1.png 1x, /i-2.png 2x"><script src="https://cdn.example/x.js"></script><a href="/page/">p</a>', 'http://h'), ['/a.css', '/i-1.png', '/i-2.png']);
});

test('an asset the old app answers only by redirecting (a soft 404) is not served there', async () => {
	const server = createServer((request, response) => {
		if (request.url === '/app.css') response.writeHead(200, { 'content-type': 'text/css' }).end('a{}');
		else response.writeHead(302, { location: '/' }).end();
	});
	await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
	const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
	try {
		assert.deepEqual(await notServedBy(origin, ['/app.css', '/build/chunk-a.js']), ['/build/chunk-a.js']);
	} finally {
		server.close();
	}
});

test('an SPA old app answering every path with its index.html does not keep the new build\'s files: they go to the new deployment', async () => {
	const { buildAssets } = await import('../src/switch/deploy.ts');
	const dir = await mkdtemp(join(tmpdir(), 'mm-build-'));
	for (const file of ['build/chunk-DPNrrZYU.js', 'parity/recharts.js', 'assets/index-DNwRI-6w.css', '.vite/markless-router-client-manifest.json', 'images/logo.png', '404.html']) {
		await mkdir(join(dir, file, '..'), { recursive: true });
		await writeFile(join(dir, file), 'x');
	}
	assert.deepEqual(await buildAssets(dir), ['/.vite/markless-router-client-manifest.json', '/assets/index-DNwRI-6w.css', '/build/chunk-DPNrrZYU.js', '/images/logo.png', '/parity/recharts.js']);
	const spa = createServer((request, response) => {
		if (request.url === '/images/logo.png') response.writeHead(200, { 'content-type': 'image/png' }).end('png');
		else response.writeHead(200, { 'content-type': 'text/html' }).end('<!doctype html><div id=root></div>');
	});
	await new Promise<void>((done) => spa.listen(0, '127.0.0.1', done));
	const old = `http://127.0.0.1:${(spa.address() as AddressInfo).port}`;
	try {
		const newAssets = await notServedBy(old, await buildAssets(dir));
		assert.deepEqual(newAssets, ['/.vite/markless-router-client-manifest.json', '/assets/index-DNwRI-6w.css', '/build/chunk-DPNrrZYU.js', '/parity/recharts.js']);
		assert.deepEqual(await notServedBy(old, ['/about', '/docs/index.html']), [], 'a page path answered with HTML is served');
		const config = vercelConfig({ old, new: 'https://new.example', switched: ['/users'], newAssets, oldPaths: ['/images/logo.png'] });
		const toNew = config.rewrites.filter((r) => r.destination.startsWith('https://new.example')).map((r) => r.source);
		assert.ok(['/build/:path*', '/parity/:path*', '/assets/:path*'].every((p) => toNew.includes(p)), toNew.join(' '));
	} finally {
		spa.close();
	}
});

test('the Nitro snippet puts routeRules under the top-level nitro key that router() reads', async () => {
	const { nitroSnippet } = await import('../src/switch/deploy.ts');
	const text = nitroSnippet({ old: 'https://old.example', new: 'https://new.example', switched: [], oldRoutes: ['/a'] });
	assert.match(text, /plugins: \[markless\(\), router\(\)\],\n\tnitro: \{\n\t\trouteRules: \{\n\t\t\t"\/a": \{ proxy: "https:\/\/old.example\/a" \}/);
	assert.doesNotMatch(text, /markless\(\{/);
});

test('config follows the modules the pages\' scripts import, so chunks loaded on interaction reach the new app too', () => {
	const code = 'import{t as e}from"./chunk-A.js";const l=()=>import("./chunk-B.js");import "/build/chunk-C.js";o=[1,["./chunk-D.js"]];j="[\\"/build/chunk-E.js\\"]";fetch("/api/x.js?");import("https://cdn.example/x.js")';
	assert.deepEqual(moduleImports(code, 'https://new.example/build/entry.js', 'https://new.example').sort(), ['/build/chunk-A.js', '/build/chunk-B.js', '/build/chunk-C.js', '/build/chunk-D.js', '/build/chunk-E.js']);
});

test('a route in Vercel or path-to-regexp syntax is refused with the pattern to write instead', async () => {
	const { routeProblem } = await import('../src/switch/state.ts');
	assert.match(routeProblem('/docs/:path*')!, /Vercel or path-to-regexp syntax \(:path\*\).*\/docs\/\*rest/);
	assert.match(routeProblem('/admin(.*)')!, /path-to-regexp/);
	assert.match(routeProblem('/docs/a*')!, /fills a whole segment/);
	assert.match(routeProblem('/blog/post-:id')!, /fills a whole segment/);
	for (const ok of ['/', '/about/', '/blog/:slug', '/blog/:slug?', '/docs/*rest', '/docs/*rest?', '/docs/*']) assert.equal(routeProblem(ok), undefined, ok);
	const cwd = await project({ '/docs/a': { route: '/docs/a', ok: true } });
	const outcome = await switchRoute(cwd, '/docs/:path*');
	assert.equal(outcome.ok, false);
	assert.deepEqual((await readSwitched(cwd)).routes, []);
});

test('only a person forces a switch: never without a name and a reason off a terminal, never from an agent run drives, and not by MCP', async () => {
	const { spawnSync } = await import('node:child_process');
	const cli = new URL('../src/cli.ts', import.meta.url).pathname;
	const cwd = await project({ '/x': { route: '/x', ok: false, red: ['behaviour'] } });
	const run = (args: string[], env: NodeJS.ProcessEnv = {}) => spawnSync(process.execPath, [cli, ...args], { cwd, encoding: 'utf8', input: '', env: { ...process.env, MARKLESS_MIGRATE_AGENT: '', ...env } });
	assert.equal(run(['switch', '/x']).status, 1);
	const bare = run(['switch', '/x', '--force']);
	assert.equal(bare.status, 2);
	assert.match(bare.stderr, /needs --by <name> and --reason <why>/);
	const agent = run(['switch', '/x', '--force', '--by', 'bot', '--reason', 'r'], { MARKLESS_MIGRATE_AGENT: '1' });
	assert.equal(agent.status, 2);
	assert.match(agent.stderr, /is for a person/);
	assert.match(run(['accept', 'abc', '--reason', 'r'], { MARKLESS_MIGRATE_AGENT: '1' }).stderr, /accept is for a person/);
	assert.deepEqual((await readSwitched(cwd)).routes, []);
	const person = run(['switch', '/x', '--force', '--by', 'Jo', '--reason', 'ships behind a flag']);
	assert.equal(person.status, 0, person.stderr);
	assert.match(person.stdout, /forced by Jo, not proven: ships behind a flag/);
	assert.deepEqual((await readSwitched(cwd)).routes[0]!.forced, { reason: 'ships behind a flag', by: 'Jo' });
	const { createServer: mcpServer } = await import('../src/mcp/server.ts');
	const tools = (mcpServer(cwd) as unknown as { _registeredTools: Record<string, { inputSchema?: { shape?: Record<string, unknown> } }> })._registeredTools;
	assert.deepEqual(Object.keys(tools.switch_route!.inputSchema?.shape ?? {}), ['route']);
});

test('an agent that run drives cannot force a switch through the CLI', async () => {
	const { chmod } = await import('node:fs/promises');
	const { driver } = await import('../src/run/drivers.ts');
	const { runRoutes } = await import('../src/run/loop.ts');
	const cli = new URL('../src/cli.ts', import.meta.url).pathname;
	const cwd = await project({ '/about/': { route: '/about/', ok: false, red: ['behaviour'] } });
	const bin = join(cwd, 'bin');
	await mkdir(bin);
	await writeFile(join(bin, 'codex'), `#!/bin/sh\n"${process.execPath}" "${cli}" switch /about/ --force --by agent --reason "looks fine" 2> forced.err\necho $? > forced.code\n`);
	await chmod(join(bin, 'codex'), 0o755);
	await runRoutes({ cwd, driver: driver('codex'), old: 'http://old.test', new: 'http://new.test', routes: ['/about/'], attempts: 1, cli: 'markless-migrate', env: { ...process.env, PATH: `${bin}:${process.env.PATH}` }, check: async () => ({ ok: false, summary: 'FAIL /about/\n' }) });
	assert.equal((await readFile(join(cwd, 'forced.code'), 'utf8')).trim(), '2');
	assert.match(await readFile(join(cwd, 'forced.err'), 'utf8'), /is for a person/);
	assert.deepEqual((await readSwitched(cwd)).routes, []);
});
