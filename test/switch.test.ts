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
	const forced = await switchRoute(cwd, '/members/', { force: 'admin page ships separately' });
	assert.ok(forced.ok);
	assert.deepEqual(forced.ok && forced.entry.forced, { reason: 'admin page ships separately' });
	assert.deepEqual(forced.ok && forced.entry.checks, ['/members/: green', '/members/ as admin: red [auth]']);
	assert.deepEqual((await readSwitched(cwd)).routes.map((r) => r.route), ['/about', '/members/']);
	const listed = summarizeStatus(await status(cwd));
	assert.match(listed, /3 switched to Markless/);
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

test('config follows the modules the pages\' scripts import, so chunks loaded on interaction reach the new app too', () => {
	const code = 'import{t as e}from"./chunk-A.js";const l=()=>import("./chunk-B.js");import "/build/chunk-C.js";o=[1,["./chunk-D.js"]];j="[\\"/build/chunk-E.js\\"]";fetch("/api/x.js?");import("https://cdn.example/x.js")';
	assert.deepEqual(moduleImports(code, 'https://new.example/build/entry.js', 'https://new.example').sort(), ['/build/chunk-A.js', '/build/chunk-B.js', '/build/chunk-C.js', '/build/chunk-D.js', '/build/chunk-E.js']);
});
