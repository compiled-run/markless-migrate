import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { cacheModule, nitroPassesQuery, refineWithNewSource, wireViteConfig } from '../src/cache/apply.ts';
import { classify } from '../src/cache/classify.ts';
import type { ResponseFacts, RouteEvidence } from '../src/cache/evidence.ts';
import { cdnFacts, isContentHashed, parseCacheControl } from '../src/cache/headers.ts';
import { filePattern } from '../src/cache/pages.ts';
import { cachingRegressions, formatRegression } from '../src/cache/regressions.ts';
import { planCaching, type CachingPlan } from '../src/cache/plan.ts';
import { cacheRules } from '../src/cache/rules.ts';
import { fileSignals, NO_SIGNALS } from '../src/cache/signals.ts';
import { invoked, judgeRoute, verifyCaching, type RouteObservation } from '../src/cache/verify.ts';
import type { Inventory } from '../src/plan/inventory.ts';

const facts = (over: Partial<ResponseFacts> = {}): ResponseFacts => ({ status: 200, contentType: 'text/html', vary: [], setCookies: [], bodyHash: 'a', ttfbMs: 10, ...over });
const evidence = (first: Partial<ResponseFacts> = {}, second: Partial<ResponseFacts> = first, route = '/docs/'): RouteEvidence => ({ route, first: facts(first), second: facts(second) });

test('Cache-Control, CDN status headers and content-hashed names are read as the hosts write them', () => {
	assert.deepEqual(parseCacheControl('public, max-age=0, s-maxage=600, stale-while-revalidate=30'), { public: true, maxAge: 0, sMaxAge: 600, staleWhileRevalidate: 30 });
	assert.equal(cdnFacts(new Headers({ 'x-vercel-cache': 'HIT' }))?.status, 'hit');
	assert.equal(cdnFacts(new Headers({ 'cf-cache-status': 'DYNAMIC' }))?.status, 'dynamic');
	assert.deepEqual(cdnFacts(new Headers({ 'cache-status': '"Netlify Edge"; hit' })), { vendor: 'netlify', status: 'hit', raw: '"Netlify Edge"; hit' });
	assert.equal(cdnFacts(new Headers({ 'cache-status': '"Netlify Edge"; fwd=miss' }))?.status, 'miss');
	for (const hashed of ['/assets/app.CdD1aHkZ.js', '/build/chunk-L4A9asp4.js', '/static/main.3f2a9c01.css', '/assets/style.BxYzAbCd.css']) assert.equal(isContentHashed(hashed), true, hashed);
	for (const plain of ['/logo-without-border.svg', '/og-image.jpg', '/js/carousel.js', '/img/Carousel-Frames.png', '/build/bundle-graph.json']) assert.equal(isContentHashed(plain), false, plain);
});

test('a page the same on every request, with no source reading the request, is prerendered, and the reason says so', () => {
	const r = classify({ evidence: evidence({ etag: '"x"', cdn: { vendor: 'netlify', status: 'hit', raw: '"Netlify Edge"; hit' }, age: 500 }) });
	assert.equal(r.class, 'prerender');
	assert.deepEqual(r.allowQuery, []);
	assert.equal(r.old.shared, true);
	assert.match(r.reasons.join('\n'), /same body on both requests and the same ETag "x"/);
});

test('a cookie, an auth guard, a request read or private Cache-Control on the old side makes a page never cached, with the evidence', () => {
	assert.equal(classify({ evidence: evidence({ setCookies: ['session'] }) }).class, 'no-cache');
	assert.equal(classify({ evidence: evidence({ cacheControl: 'private, max-age=0' }) }).class, 'no-cache');
	assert.equal(classify({ evidence: evidence({ vary: ['cookie'] }) }).class, 'no-cache');
	const guarded = classify({ evidence: evidence(), old: { ...NO_SIGNALS, guard: { what: 'auth guard: middleware', file: 'middleware.ts', line: 3 } } });
	assert.equal(guarded.class, 'no-cache');
	assert.match(guarded.reasons[0]!, /middleware\.ts:3/);
	const reads = classify({ evidence: evidence(), old: { ...NO_SIGNALS, ...fileSignals("import { cookies } from 'next/headers';\nconst theme = cookies().get('theme');", 'app/page.tsx') } });
	assert.equal(reads.class, 'no-cache');
	assert.match(reads.reasons[0]!, /cookies\(\) \(app\/page\.tsx:2\)/);
	const withCookie: RouteEvidence = { ...evidence(), withCookie: facts({ bodyHash: 'b' }) };
	assert.match(classify({ evidence: withCookie }).reasons.join(), /changes when a cookie is sent/);
	assert.equal(classify({ evidence: evidence(), signedInOnly: true }).class, 'no-cache');
});

test('a client component reading cookies runs in the browser and leaves the page cacheable', () => {
	const s = fileSignals("'use client';\nconst x = document.cookie; cookies();", 'app/widget.tsx');
	assert.deepEqual(s.requestReads, []);
});

test('getCookie and setCookie helpers over document.cookie are browser code; the same names beside a server cookie API are not', () => {
	const helper = fileSignals('function setCookie(n, v) { document.cookie = `${n}=${v}`; }\nfunction getCookie(n) { return document.cookie.split(n)[1]; }\nsetCookie("theme", "dark"); getCookie("theme");', 'components/layout/shell-behaviour.ts');
	assert.deepEqual([...helper.requestReads, ...helper.setsCookies], []);
	const server = fileSignals('const t = getCookie(event, "theme"); setCookie(event, "seen", "1"); res.cookie("a", "b"); parseCookies(event); const c = document.cookie;', 'server/routes/page.ts');
	assert.deepEqual(server.requestReads.map((r) => r.what), ['reads a request cookie or header']);
	assert.deepEqual(server.setsCookies.map((r) => r.what), ['sets a cookie']);
});

test('a page whose data changes is served by the CDN and revalidated, copying the old TTL when the old headers give one', () => {
	const changing = classify({ evidence: evidence({ bodyHash: 'a' }, { bodyHash: 'b' }) });
	assert.equal(changing.class, 'isr');
	assert.equal(changing.revalidate, 60);
	const swr = classify({ evidence: evidence({ cacheControl: 'public, s-maxage=300, stale-while-revalidate=60' }) });
	assert.equal(swr.class, 'isr');
	assert.equal(swr.revalidate, 300);
	assert.match(swr.reasons.join('\n'), /as the old headers did/);
	const data = classify({ evidence: evidence(), old: { ...NO_SIGNALS, changing: [{ what: 'fetches data (fetch)', file: 'app/page.tsx', line: 4 }] }, serverRendered: true });
	assert.equal(data.class, 'isr');
	assert.equal(classify({ evidence: evidence(), old: { ...NO_SIGNALS, changing: [{ what: 'fetches data (fetch)', file: 'src/routes/a.tsx', line: 4 }] }, serverRendered: false }).class, 'prerender', 'an SPA fetches in the browser');
	const query = classify({ evidence: evidence(), old: { ...NO_SIGNALS, ...fileSignals("const page = searchParams.get('page');", 'app/page.tsx') } });
	assert.equal(query.class, 'isr');
	assert.deepEqual(query.allowQuery, ['page']);
});

test('a router that marks fragments only by a header gets its pages kept by the CDN by Cache-Control, which honours Vary, since Vercel\'s ISR keeps one entry per URL', () => {
	const routes = [classify({ evidence: evidence({}, {}, '/') }), classify({ evidence: evidence({ bodyHash: 'a' }, { bodyHash: 'b' }, '/news/') }), classify({ evidence: evidence({ setCookies: ['sid'] }, {}, '/account') }), classify({ evidence: evidence({ contentType: 'application/json' }, {}, '/api/feed') })];
	const rules = cacheRules(routes, { fragmentHeader: 'x-markless-fragment', hashedAssets: ['/js/app.3f2a9c01.js'] });
	assert.deepEqual(rules.routeRules['/'], { isr: false, headers: { 'cache-control': 'public, max-age=0, s-maxage=31536000' } }, 'kept until the next deploy');
	assert.deepEqual(rules.routeRules['/news/'], { isr: false, headers: { 'cache-control': 'public, max-age=0, s-maxage=60, stale-while-revalidate=600' } });
	assert.deepEqual(rules.routeRules['/account'], { isr: false, headers: { 'cache-control': 'private, no-store' } }, 'it sets a cookie: stored nowhere');
	assert.deepEqual(rules.routeRules['/api/feed'], { isr: { expiration: false, allowQuery: [] } }, 'an endpoint has no fragments: ISR');
	assert.deepEqual(rules.routeRules['/js/app.3f2a9c01.js'], { headers: { 'cache-control': 'public, max-age=31536000, immutable' } });
	assert.deepEqual(Object.keys(rules), ['routeRules'], 'no Vercel routes: nothing is split by the header');
	assert.deepEqual(cacheRules(routes).routeRules['/'], { isr: { expiration: false, allowQuery: [] } }, 'no fragment navigation: ISR');
	const prefs = classify({ evidence: evidence({}, {}, '/dash'), new: { ...NO_SIGNALS, ...fileSignals("const prefs = read(http.request.headers.get('cookie'));", 'pages/dash.tsrx') } });
	assert.deepEqual(cacheRules([prefs]).routeRules['/dash'], { isr: false, headers: { 'cache-control': 'private, no-cache' } }, 'a preference cookie keeps it out of shared caches only');
});

test('a page that reads only known query keys stays on ISR with allowQuery and passQuery when the app\'s Nitro passes the query, and falls back to the CDN when it does not', () => {
	const query = classify({ evidence: evidence({}, {}, '/search'), old: { ...NO_SIGNALS, ...fileSignals("searchParams.get('q'); searchParams.get('page')", 'app/search/page.tsx') } });
	assert.equal(query.class, 'isr');
	assert.deepEqual(query.allowQuery, ['page', 'q']);
	const isr = cacheRules([query], { fragmentPath: '/_markless/fragment', passQuery: true }).routeRules;
	assert.deepEqual(isr['/search'], { isr: { expiration: 60, allowQuery: ['page', 'q'], passQuery: true } });
	assert.deepEqual(isr['/_markless/fragment/search'], { isr: { expiration: 60, allowQuery: ['page', 'q'], passQuery: true } }, 'its fragment URL is keyed and handed the query the same way');
	assert.deepEqual(cacheRules([query], { fragmentPath: '/_markless/fragment' }).routeRules['/search'], { isr: false, headers: { 'cache-control': 'public, max-age=0, s-maxage=60, stale-while-revalidate=600' } }, 'an older Nitro hands an ISR page no query: the CDN does');
	assert.deepEqual(cacheRules([query], { fragmentHeader: 'x-markless-fragment', passQuery: true }).routeRules['/search'], { isr: false, headers: { 'cache-control': 'public, max-age=0, s-maxage=60, stale-while-revalidate=600' } }, 'header-marked fragments: the CDN, whatever Nitro does');
	assert.equal(nitroPassesQuery('3.0.260903-beta'), true);
	assert.equal(nitroPassesQuery('3.0.261101-beta'), true);
	assert.equal(nitroPassesQuery('3.1.0'), true);
	assert.equal(nitroPassesQuery('3.0.260429-beta'), false, 'measured: drops the query');
	assert.equal(nitroPassesQuery(undefined), false);
});

test('the generated plugin replaces the caching an app set for a path, keeps its other keys, leaves proxied paths alone, and is the same applied twice', async () => {
	const routes = [classify({ evidence: evidence({}, {}, '/') }), classify({ evidence: evidence({}, {}, '/old/') })];
	const dir = await mkdtemp(join(tmpdir(), 'mm-cache-'));
	const file = join(dir, 'migrate-cache.ts');
	await writeFile(file, cacheModule(cacheRules(routes, { fragmentPath: '/_markless/fragment' }), routes));
	const { applyRules } = (await import(file)) as { applyRules: (nitro: { options: Record<string, any> }) => void };
	const nitro: { options: Record<string, any> } = { options: { routeRules: { '/': { isr: true, headers: { 'x-own': '1' } }, '/old/': { proxy: { to: 'https://old.example/old/' } } }, vercel: { config: { routes: [{ src: '/x', dest: '/y' }] } } } };
	applyRules(nitro);
	applyRules(nitro);
	const config = { nitro: nitro.options };
	assert.deepEqual(config.nitro.routeRules['/'], { headers: { 'x-own': '1' }, isr: { expiration: false, allowQuery: [] } });
	assert.deepEqual(config.nitro.routeRules['/_markless/fragment/'], { isr: { expiration: false, allowQuery: [] } });
	assert.deepEqual(config.nitro.routeRules['/old/'], { proxy: { to: 'https://old.example/old/' } });
	assert.deepEqual(config.nitro.vercel.config.routes, [{ src: '/x', dest: '/y' }], 'the app\'s own Vercel routes are left as they are');
});

test('the generated plugin lists each server asset once for Nitro\'s prerenderer, which copies the app\'s config with them twice', async () => {
	const routes = [classify({ evidence: evidence({}, {}, '/') })];
	const dir = await mkdtemp(join(tmpdir(), 'mm-cache-'));
	const file = join(dir, 'migrate-cache.ts');
	await writeFile(file, cacheModule(cacheRules(routes, { prerender: true }), routes));
	const { applyRules } = (await import(file)) as { applyRules: (nitro: Record<string, any>) => void };
	const hooks: Record<string, (renderer: { options: { serverAssets: { baseName: string }[] } }) => void> = {};
	applyRules({ options: { routeRules: {} }, hooks: { hook: (name: string, run: (renderer: { options: { serverAssets: { baseName: string }[] } }) => void) => (hooks[name] = run) } });
	const renderer = { options: { serverAssets: [{ baseName: 'built' }, { baseName: 'built' }, { baseName: 'server' }] } };
	hooks['prerender:init']!(renderer);
	assert.deepEqual(renderer.options.serverAssets, [{ baseName: 'built' }, { baseName: 'server' }]);
});

test('vite.config.ts gets migrateCache() in its plugins, once', () => {
	const source = "import { markless } from '@markless/core/vite';\nimport { router } from '@markless/router/vite';\n\nexport default { plugins: [markless(), router()] };\n";
	const wired = wireViteConfig(source) as string;
	assert.match(wired, /import \{ router \} from '@markless\/router\/vite';\nimport \{ migrateCache \} from '\.\/migrate-cache\.ts';/);
	assert.match(wired, /plugins: \[migrateCache\(\), markless\(\), router\(\)\]/);
	assert.equal(wireViteConfig(wired), wired);
	assert.equal(wireViteConfig('export default {};'), false);
});

test('Markless page files map to the routes the router serves them at', () => {
	assert.equal(filePattern('pages/index.tsrx'), '/');
	assert.equal(filePattern('pages/docs/index.tsrx'), '/docs');
	assert.equal(filePattern('pages/blog/[slug].tsrx'), '/blog/:slug');
	assert.equal(filePattern('pages/[...path].tsrx'), '/*path');
});

test('a port that renders storage() or reads the request is never cached, whatever the old page was', async () => {
	const dir = await mkdtemp(join(tmpdir(), 'mm-cache-app-'));
	await mkdir(join(dir, 'pages'), { recursive: true });
	await writeFile(join(dir, 'pages/index.tsrx'), "import { theme } from './theme.ts';\nexport default function Page() { return <p>{theme()}</p>; }\n");
	await writeFile(join(dir, 'pages/theme.ts'), "import { storage } from '@markless/core';\nexport const theme = storage('theme', 'light');\n");
	const e = evidence({}, {}, '/');
	const plan: CachingPlan = { version: 1, origin: 'http://old', generatedAt: '', routes: [classify({ evidence: e })], hashedAssets: [], evidence: [e] };
	const [r] = await refineWithNewSource(plan, dir, { '/': 'pages/index.tsrx' });
	assert.equal(r!.class, 'no-cache');
	assert.match(r!.reasons[0]!, /new source reads the request: storage\(\): a cookie-backed value \(pages\/theme\.ts:2\)/);
});

test('a route the old app let a CDN keep is a regression when only the port reads the request on the server, and stops being one once the read moves to the browser', async () => {
	const dir = await mkdtemp(join(tmpdir(), 'mm-cache-regress-'));
	await mkdir(join(dir, 'pages/settings'), { recursive: true });
	await writeFile(join(dir, 'pages/index.tsrx'), "export default function Page({ http }) { const theme = http.request.headers.get('cookie'); return <p>{theme}</p>; }\n");
	await writeFile(join(dir, 'pages/settings/index.tsrx'), 'export default function Page() { return <p>settings</p>; }\n');
	const routes = ['/', '/settings'].map((route) => evidence({}, {}, route));
	const plan: CachingPlan = { version: 1, origin: 'http://old', generatedAt: '', routes: routes.map((e) => classify({ evidence: e })), hashedAssets: [], evidence: routes };
	const found = await cachingRegressions(plan, dir, ['/', '/settings']);
	assert.deepEqual(found.map((r) => [r.route, r.old, r.new]), [['/', 'prerender', 'no-cache']]);
	assert.match(found[0]!.actual, /^never cached: the port's server code reads the request: .*http\.request headers \(pages\/index\.tsrx:1\)$/);
	assert.match(formatRegression(found[0]!, ['/users']), /^FAIL  \/  \[caching\][^]*fix: +The old app reads nothing from the request on the server\. Read these values in the browser[^]*1 more route \(\/users\): one shared change covers them all\. The route stays red until it is fixed\.\n$/);
	await writeFile(join(dir, 'pages/index.tsrx'), "export default function Page() { return <p>{document.cookie}</p>; }\n");
	assert.deepEqual(await cachingRegressions(plan, dir, ['/']), []);
});

const observation = (passes: Partial<ResponseFacts>[], extra: Partial<RouteObservation> = {}): RouteObservation => ({ route: '/docs/', class: 'prerender', passes: passes.map(facts), ...extra });
const vercel = (status: string) => ({ cdn: { vendor: 'vercel' as const, status: status.toLowerCase() as 'hit', raw: status } });

test('check: a cached personal page, a shared fragment entry, stale-forever HTML and an uncached static page are each red', () => {
	const personal = classify({ evidence: evidence({ setCookies: ['sid'] }) });
	assert.deepEqual(judgeRoute(personal, observation([vercel('MISS'), vercel('HIT')])).map((f) => f.problem), ['cached-personal']);
	const regressed = classify({ evidence: evidence({ cdn: { vendor: 'vercel', status: 'hit', raw: 'HIT' } }), new: { ...NO_SIGNALS, ...fileSignals("layoutPrefs(http.request.headers.get('cookie'))", 'pages/index.tsrx') } });
	assert.deepEqual(judgeRoute(regressed, observation([vercel('MISS'), vercel('MISS')])).map((f) => f.problem), ['worse-than-old'], 'a port that reads cookies loses the CDN the old page had');
	const page = classify({ evidence: evidence({ cdn: { vendor: 'netlify', status: 'hit', raw: 'hit' } }) });
	assert.deepEqual(judgeRoute(page, observation([vercel('MISS'), vercel('HIT')])), []);
	assert.deepEqual(judgeRoute(page, observation([vercel('MISS'), vercel('MISS')])).map((f) => f.problem), ['worse-than-old']);
	const plain = classify({ evidence: evidence() });
	assert.deepEqual(judgeRoute(plain, observation([vercel('MISS'), vercel('MISS')])).map((f) => f.problem), ['uncached-static']);
	assert.deepEqual(judgeRoute(plain, observation([{ ...vercel('MISS'), cacheControl: 'public, max-age=31536000, immutable' }, { ...vercel('HIT'), cacheControl: 'public, max-age=31536000, immutable' }])).map((f) => f.problem), ['stale-forever']);
	const doc = { fragmentBody: false, vary: ['x-markless-fragment'] };
	const poisoned = observation([{ ...vercel('MISS'), ...doc }, { ...vercel('HIT'), ...doc }], { fragment: { response: facts({ ...vercel('HIT'), ...doc }), documentAfter: facts({ ...vercel('HIT'), ...doc }) } });
	assert.deepEqual(judgeRoute(plain, poisoned, 'x-markless-fragment').map((f) => f.problem), ['wrong-body']);
	const split = observation([vercel('MISS'), { ...vercel('HIT'), ...doc }], { fragment: { response: facts({ ...vercel('HIT'), bodyHash: 'f', fragmentBody: true }), documentAfter: facts({ ...vercel('HIT'), ...doc }) } });
	assert.deepEqual(judgeRoute(plain, split, 'x-markless-fragment'), []);
	const noVary = observation([vercel('MISS'), vercel('HIT')], { fragment: { response: facts({ ...vercel('MISS'), bodyHash: 'f' }), documentAfter: facts(vercel('HIT')) } });
	assert.deepEqual(judgeRoute(plain, noVary, 'x-markless-fragment').map((f) => f.problem), ['missing-vary']);
	const isr = classify({ evidence: evidence({ bodyHash: 'a' }, { bodyHash: 'b' }) });
	assert.deepEqual(judgeRoute(isr, observation([{ ...vercel('MISS'), cacheControl: 'public, s-maxage=31536000' }, { ...vercel('HIT'), cacheControl: 'public, s-maxage=31536000' }])).map((f) => f.problem), ['stale-forever']);
	assert.deepEqual(judgeRoute(plain, observation([{ ...vercel('MISS'), setCookies: ['sid'], cacheControl: 'public, s-maxage=60' }, vercel('HIT')])).map((f) => f.problem), ['cached-set-cookie']);
});

test('a function ran when Vercel missed or bypassed its cache and the request id names a function region', () => {
	assert.equal(invoked(facts({ ...vercel('MISS'), vercelId: 'cle1::iad1::abc' })), true);
	assert.equal(invoked(facts({ ...vercel('HIT'), vercelId: 'cle1::iad1::abc' })), false, 'an ISR entry kept in the function region');
	assert.equal(invoked(facts({ ...vercel('MISS'), vercelId: 'cle1::abc' })), false, 'a static file the edge fetched once');
	assert.equal(invoked(facts({ vercelId: 'cle1::iad1::abc' })), false);
});

// An old app and a CDN in front of the new one, on this machine: the old answers as a static host, the new as Vercel does.
let server: Server;
let origin: string;
const seen = new Map<string, number>();
const sharedEntries = new Map<string, string>();
before(async () => {
	server = createServer((req, res) => {
		const url = new URL(req.url!, 'http://x');
		const n = (seen.get(url.pathname) ?? 0) + 1;
		seen.set(url.pathname, n);
		const page = (body: string, headers: Record<string, string>) => {
			res.writeHead(200, { 'content-type': 'text/html', ...headers });
			res.end(body);
		};
		if (url.pathname === '/static/') return page('<!doctype html><p>static', { 'cache-control': 'public, max-age=0, must-revalidate', etag: '"s"', age: '40' });
		if (url.pathname === '/account') return page(`<!doctype html><p>hi ${n}`, { 'cache-control': 'private, no-store', 'set-cookie': 'sid=1; HttpOnly' });
		if (url.pathname === '/news/') return page(`<!doctype html><p>news ${n}`, { 'cache-control': 'public, s-maxage=120, stale-while-revalidate=60' });
		if (url.pathname === '/new/static/') return page('<!doctype html><p>static', { 'x-vercel-cache': n === 1 ? 'MISS' : 'HIT', 'x-vercel-id': 'cle1::iad1::abc', 'cache-control': 'public, max-age=0, must-revalidate' });
		if (url.pathname === '/new/account') return page('<!doctype html><p>hi', { 'x-vercel-cache': n === 1 ? 'MISS' : 'HIT', 'x-vercel-id': 'cle1::iad1::abc' });
		const fragment = req.headers['x-markless-fragment'] === '1' || url.pathname.startsWith('/_markless/fragment/');
		const body = (text: string) => (fragment ? `<!doctype html><p>${text}<!--markless:region-end-->` : `<!doctype html><p>${text}</html>`);
		const cdn = { 'cache-control': 'public, max-age=0, s-maxage=60', vary: 'x-markless-fragment' };
		if (url.pathname === '/new/shared/') {
			// One entry per URL whatever the header, as Vercel's ISR keeps it: the first request decides the body.
			const key = url.pathname + url.search;
			const kept = sharedEntries.get(key);
			if (!kept) sharedEntries.set(key, body('shared'));
			return page(kept ?? body('shared'), { ...cdn, 'x-vercel-cache': kept ? 'HIT' : 'MISS' });
		}
		if (url.pathname === '/new/apart/' || url.pathname === '/_markless/fragment/new/apart/') {
			const key = `${fragment}${url.pathname}${url.search}`;
			const kept = sharedEntries.has(key);
			sharedEntries.set(key, '');
			return page(body('apart'), { ...cdn, 'x-vercel-cache': kept ? 'HIT' : 'MISS' });
		}
		if (url.pathname === '/new/search' || url.pathname === '/_markless/fragment/new/search') return page(body(`results for ${url.searchParams.get('q')}`), { 'cache-control': 'public, max-age=0, must-revalidate', 'x-vercel-cache': 'HIT' });
		res.writeHead(404).end();
	});
	await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
	origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(() => server?.close());

test('plan reads each route from the old server and classifies it; check reads the new deployment pass by pass', async () => {
	const inventory = { version: 1, origin, generatedAt: '', limit: 0, truncated: false, routes: [], locales: [], localeRouting: { prefixes: [], negotiation: {} } } as unknown as Inventory;
	const plan = await planCaching(inventory, { routes: ['/static/', '/account', '/news/'], gapMs: 10 });
	assert.deepEqual(
		plan.routes.map((r) => [r.route, r.class, r.revalidate]),
		[
			['/static/', 'prerender', undefined],
			['/account', 'no-cache', undefined],
			['/news/', 'isr', 120],
		],
	);
	const moved = plan.routes.filter((r) => r.route !== '/news/').map((r) => ({ ...r, route: `/new${r.route}` }));
	const report = await verifyCaching(origin, moved, { gapMs: 5, assets: false, pageViews: false });
	assert.deepEqual(report.findings.map((f) => [f.route, f.problem]), [['/new/account', 'cached-personal']]);
	assert.equal(report.numbers.secondPassHitRate, 1);
	assert.equal(report.numbers.invocationsPerView, 0);
});

test('a URLSearchParams write (searchParams.set, .delete, .append) is no query key, so a page that only rewrites its own URL is still built ahead', () => {
	const s = fileSignals("const url = new URL(location.href);\nurl.searchParams.set(key, value);\nurl.searchParams.delete('q');\nurl.searchParams.append('a', 'b');", 'lib/site.ts');
	assert.deepEqual(s.queryKeys, []);
	assert.deepEqual(fileSignals("const page = url.searchParams.page;", 'pages/x.ts').queryKeys, ['page']);
});

test('a router that fetches fragments by path (Markless 0.7: /_markless/fragment/<page>) gets each page\'s fragment URL cached as the page is, and check is red when the CDN does not keep it', () => {
	const routes = [classify({ evidence: evidence({}, {}, '/') }), classify({ evidence: evidence({ bodyHash: 'a' }, { bodyHash: 'b' }, '/news/') }), classify({ evidence: evidence({ setCookies: ['sid'] }, {}, '/account') })];
	const rules = cacheRules(routes, { fragmentPath: '/_markless/fragment', fragmentHeader: 'x-markless-fragment' });
	assert.deepEqual(rules.routeRules['/'], { isr: { expiration: false, allowQuery: [] } }, 'a router that fetches by path is on ISR even if it still names a header');
	assert.deepEqual(rules.routeRules['/_markless/fragment/'], { isr: { expiration: false, allowQuery: [] } });
	assert.deepEqual(rules.routeRules['/_markless/fragment/news/'], { isr: { expiration: 60, allowQuery: [] } });
	assert.deepEqual(rules.routeRules['/_markless/fragment/account'], { isr: false, headers: { 'cache-control': 'private, no-store' } }, 'a personal page\'s fragment is never shared either');
	const plain = classify({ evidence: evidence() });
	assert.deepEqual(judgeRoute(plain, observation([vercel('MISS'), vercel('HIT')], { fragmentPasses: [vercel('MISS'), vercel('MISS'), vercel('MISS')].map(facts) })).map((f) => f.problem), ['uncached-fragment']);
	assert.deepEqual(judgeRoute(plain, observation([vercel('MISS'), vercel('HIT')], { fragmentPasses: [vercel('MISS'), vercel('HIT'), vercel('HIT')].map(facts) })), []);
});

test('check: a document request answered with a fragment, or a fragment request with a document, in either order after expiry, is red once per kind', () => {
	const plain = classify({ evidence: evidence() });
	const doc = (status: string) => ({ ...vercel(status), fragmentBody: false });
	const frag = (status: string) => ({ ...vercel(status), fragmentBody: true });
	const probe = (asked: 'fragment' | 'document', f: Partial<ResponseFacts>) => ({ asked, response: facts(f) });
	const apart = { fragmentFirst: [probe('fragment', frag('STALE')), probe('document', doc('STALE')), probe('document', doc('HIT'))], documentFirst: [probe('document', doc('STALE')), probe('fragment', frag('STALE')), probe('fragment', frag('HIT'))] };
	assert.deepEqual(judgeRoute(plain, observation([doc('MISS'), doc('HIT')], { fragmentPasses: [frag('MISS'), frag('HIT')].map(facts), orders: apart })), []);
	const shared = { fragmentFirst: [probe('fragment', frag('STALE')), probe('document', frag('HIT')), probe('document', frag('HIT'))], documentFirst: [probe('document', doc('STALE')), probe('fragment', doc('HIT')), probe('fragment', doc('HIT'))] };
	const found = judgeRoute(plain, observation([doc('MISS'), doc('HIT')], { orders: shared }));
	assert.deepEqual(found.map((f) => f.problem), ['wrong-body', 'wrong-body']);
	assert.match(found[0]!.detail, /fragment first on a fresh or expired entry, request 2: a document request got a fragment \(HIT\), and 1 more/);
	assert.match(found[1]!.detail, /document first on a fresh or expired entry, request 2: a fragment request got the document/);
	assert.deepEqual(judgeRoute(plain, observation([vercel('MISS'), vercel('HIT')], { orders: shared })).length, 2, 'probes are judged by their own bodies');
	assert.deepEqual(judgeRoute(plain, observation([{ ...vercel('MISS') }, vercel('HIT')])), [], 'without the router\'s markers no body is told apart');
});

test('check: a page that reads the query is red when it does not show a value the old site\'s page shows, or shows another value\'s page', () => {
	const query = classify({ evidence: evidence({}, {}, '/search'), old: { ...NO_SIGNALS, ...fileSignals("searchParams.get('q')", 'app/search/page.tsx') } });
	const r = (rendered: boolean, status = 'HIT') => ({ url: '/search?q=v', facts: facts(vercel(status)), rendered });
	assert.deepEqual(judgeRoute(query, observation([vercel('MISS'), vercel('HIT')], { query: [{ key: 'q', value: 'v1', responses: [r(true, 'MISS'), r(true)], oldRendered: true }] })), []);
	const dropped = judgeRoute(query, observation([vercel('MISS'), vercel('HIT')], { query: [{ key: 'q', value: 'v1', responses: [r(false, 'MISS'), r(false)], oldRendered: true }] }));
	assert.deepEqual(dropped.map((f) => f.problem), ['query-not-rendered']);
	assert.match(dropped[0]!.detail, /did not get its query/);
	assert.deepEqual(judgeRoute(query, observation([vercel('MISS'), vercel('HIT')], { query: [{ key: 'q', value: 'v2', responses: [r(false), r(false)], oldRendered: true, otherValue: 'v1' }] })).map((f) => f.problem), ['query-not-rendered']);
	assert.deepEqual(judgeRoute(query, observation([vercel('MISS'), vercel('HIT')], { query: [{ key: 'q', value: 'v1', responses: [r(false), r(false)], oldRendered: false }] })), [], 'the old page does not show it either: not told');
});

test('check asks for fragment and document in both orders on fresh entries and reads a query page\'s query, against a local CDN', async () => {
	const page = (route: string, over: Partial<ReturnType<typeof classify>> = {}) => ({ ...classify({ evidence: evidence({}, {}, route) }), ...over });
	const markers = ['<!--markless:region-end-->'];
	const header = await verifyCaching(origin, [page('/new/shared/'), page('/new/apart/')], { fragmentHeader: 'x-markless-fragment', fragmentMarkers: markers, gapMs: 5, assets: false, pageViews: false });
	assert.deepEqual(header.findings.map((f) => [f.route, f.problem]), [['/new/shared/', 'wrong-body'], ['/new/shared/', 'wrong-body']], 'one URL for both kinds is red in both orders');
	assert.ok(header.routes.every((r) => r.orders), 'a page the CDN keys on its whole URL gets fresh entries for the orders');
	const path = await verifyCaching(origin, [page('/new/apart/'), page('/new/search', { class: 'isr', revalidate: 60, allowQuery: ['q'] })], { fragmentPath: '/_markless/fragment', fragmentMarkers: markers, oldOrigin: origin, gapMs: 5, assets: false, pageViews: false, expiryWaitS: 0 });
	assert.deepEqual(path.findings, []);
	const search = path.routes.find((r) => r.route === '/new/search')!;
	assert.deepEqual(search.query?.map((q) => [q.key, q.responses.map((r) => r.rendered), q.oldRendered]), [['q', [true, true, true, true], true], ['q', [true, true, true, true], true]], 'document and fragment URL each show the value asked for');
	assert.equal(search.orders, undefined, 'a made-up value the cache ignores is no fresh entry');
	assert.match(path.notes.join('\n'), /1 page on ISR with revalidation not asked for in both orders after expiry \(the wait is off\)/);
});

test('a converted page that switches on its query string keeps each value apart in the cache', async () => {
	const dir = await mkdtemp(join(tmpdir(), 'mm-cache-query-'));
	await mkdir(join(dir, 'pages'), { recursive: true });
	await writeFile(join(dir, 'pages/directory.tsrx'), 'export default function Page({ url }) @{\n\tconst search = url.search;\n\t<>@switch (search) {\n\t\t@case "?page=2": { <p>2</p> }\n\t\t@case "?page=3&sort=new": { <p>3</p> }\n\t\t@default: { <p>1</p> }\n\t}</>\n}\n');
	const e = evidence({}, {}, '/directory');
	const plan: CachingPlan = { version: 1, origin: 'http://old', generatedAt: '', routes: [classify({ evidence: e })], hashedAssets: [], evidence: [e] };
	const [r] = await refineWithNewSource(plan, dir, { '/directory': 'pages/directory.tsrx' });
	assert.deepEqual(r!.allowQuery, ['page', 'sort']);
});
