import assert from 'node:assert/strict';
import { spawnNode } from './spawn-node.ts';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { chromium, type Browser } from 'playwright';
import { acceptFailure } from '../src/check/accepted.ts';
import { runCheck } from '../src/check/run.ts';
import { summarize } from '../src/check/summary.ts';
import { domSignature, urlPattern, widgetSignature } from '../src/check/templates.ts';
import { enumerateRoutes } from '../src/plan/enumerate.ts';
import { plan } from '../src/plan/inventory.ts';
import { recordResults, status } from '../src/status.ts';
import { switchRoute } from '../src/switch/state.ts';

const CLI = join(import.meta.dirname, '../src/cli.ts');
const SITEMAP_ROUTES = ['/', '/about', '/docs/intro', '/docs/install', '/docs/config', '/docs/api', '/blog', '/blog/one', '/blog/two', '/contact'];

const page = (title: string, links: readonly string[] = []) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${title}</title></head><body><main><h1>${title}</h1>${links.map((l) => `<a href="${l}">${l}</a>`).join(' ')}</main></body></html>`;
// What Markless's router writes into every page it renders: the page file that rendered it.
const ported = (title: string, file: string) => page(title).replace('</body>', `<script type="@markless/core/route">{"file":"${file}"}</script></body>`);

type Handler = (path: string, search: string) => { status: number; type?: string; body?: string; location?: string } | undefined;

function serve(handler: Handler): Promise<Server> {
	const server = createServer((req, res) => {
		const url = new URL(req.url ?? '/', 'http://x');
		const out = handler(url.pathname, url.search) ?? { status: 404, body: page('Not found') };
		res.writeHead(out.status, { 'content-type': out.type ?? 'text/html; charset=utf-8', ...(out.location ? { location: out.location } : {}) }).end(out.body ?? '');
	});
	return new Promise((done) => server.listen(0, '127.0.0.1', () => done(server)));
}

const origin = (s: Server) => `http://127.0.0.1:${(s.address() as AddressInfo).port}`;
const sitemap = (base: string, routes: readonly string[]) => `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${routes.map((r) => `<url><loc>${base}${r}</loc></url>`).join('')}</urlset>`;

let browser: Browser;
let old: Server;
let next: Server;
let crawly: Server;
before(async () => {
	browser = await chromium.launch();
	old = await serve((path) => {
		if (path === '/sitemap.xml') return { status: 200, type: 'application/xml', body: sitemap('https://www.example.com', SITEMAP_ROUTES) };
		return SITEMAP_ROUTES.includes(path) ? { status: 200, body: page(`Old ${path}`) } : undefined;
	});
	next = await serve((path) => (['/', '/about', '/blog'].includes(path) ? { status: 200, body: ported(`Old ${path}`, `pages${path === '/' ? '/index' : path}.tsrx`) } : undefined));
	crawly = await serve((path, search) => {
		const base = origin(crawly);
		if (path === '/robots.txt') return { status: 200, type: 'text/plain', body: `User-agent: *\nAllow: /private/\nDisallow: /api/\nSitemap: ${base}/maps/index.xml\n` };
		if (path === '/maps/index.xml') return { status: 200, type: 'application/xml', body: `<?xml version="1.0"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><sitemap><loc>${base}/maps/pages.xml</loc></sitemap></sitemapindex>` };
		if (path === '/maps/pages.xml') return { status: 200, type: 'application/xml', body: sitemap(base, ['/', '/docs']) };
		if (path === '/') return { status: 200, body: page('Home', ['/docs', '/blog', 'mailto:hi@example.com', 'https://elsewhere.example/x']) };
		if (path === '/docs') return { status: 200, body: page('Docs', ['/docs/hidden', '/docs/hidden#part', '/old-docs']) };
		if (path === '/docs/hidden') return { status: 200, body: `${page('Hidden')}<iframe src="/view/chart-area" loading="lazy"></iframe><iframe src="https://elsewhere.example/embed"></iframe>` };
		if (path === '/view/chart-area') return { status: 200, body: page('Chart') };
		if (path === '/old-docs') return { status: 301, location: '/docs/moved' };
		if (path === '/docs/moved') return { status: 200, body: page('Moved') };
		if (path === '/blog' && search === '?page=2') return { status: 200, body: page('Blog 2', ['/blog/post-9']) };
		if (path === '/blog') return { status: 200, body: `${page('Blog', ['/blog?page=2', '/blog?utm_source=x'])}<link rel="alternate" type="application/rss+xml" href="/rss.xml">` };
		if (path === '/blog/post-9') return { status: 200, body: page('Post 9') };
		if (path === '/rss.xml') return { status: 200, type: 'application/rss+xml', body: `<?xml version="1.0"?><rss version="2.0"><channel><title>Blog</title><link>${base}/blog</link><item><title>From the feed</title><link>${base}/posts/from-feed</link></item></channel></rss>` };
		if (path === '/posts/from-feed') return { status: 200, body: page('From the feed') };
		if (path === '/private/') return { status: 200, body: page('Private') };
		return undefined;
	});
});
after(async () => {
	await browser?.close();
	for (const s of [old, next, crawly]) s?.close();
});

test('an old site with 10 sitemap routes against a new app with 3: coverage is red and lists the 7 missing', async () => {
	const planned = await enumerateRoutes(origin(old));
	assert.deepEqual(planned.routes.map((r) => r.route).sort(), [...SITEMAP_ROUTES, '/sitemap.xml'].sort());
	const pages = planned.routes.filter((r) => r.route !== '/sitemap.xml').map((r) => r.route);
	const report = await runCheck({ oldOrigin: origin(old), newOrigin: origin(next), routes: [], coverage: pages, browser });
	assert.equal(report.ok, false);
	assert.equal(report.coverage!.total, 10);
	assert.equal(report.coverage!.present, 3);
	assert.deepEqual(report.coverage!.missing, ['/blog/one', '/blog/two', '/contact', '/docs/api', '/docs/config', '/docs/install', '/docs/intro']);
	const text = summarize(report);
	assert.match(text, /Routes on the new app: 3 of 10 routes of the old site present, 7 missing\./);
	assert.match(text, /Missing on the new app \(7\):\n {2}\/blog\/one {2}old 200, new 404 {2}\[[0-9a-f]{10}\]/);
	for (const route of report.coverage!.missing) assert.match(text, new RegExp(`^  ${route.replace(/\//g, '\\/')}  old 200, new 404`, 'm'));
});

test('a route left out on purpose, by an accepted difference, no longer counts as missing', async () => {
	const pages = SITEMAP_ROUTES;
	const first = await runCheck({ oldOrigin: origin(old), newOrigin: origin(next), routes: [], coverage: pages, browser });
	const contact = first.coverage!.failures.find((f) => f.route === '/contact')!;
	const accepted = [acceptFailure(contact, { old: first.old, new: first.new }, 'The contact form moved to the help centre', 'Jack')];
	const second = await runCheck({ oldOrigin: origin(old), newOrigin: origin(next), routes: [], coverage: pages, browser, accepted });
	assert.equal(second.coverage!.missing.length, 6);
	assert.deepEqual(second.coverage!.accepted, ['/contact']);
	assert.match(summarize(second), /3 of 10 routes of the old site present, 6 missing, 1 left out on purpose \(accepted\)/);
});

test('the link crawl finds routes the sitemap does not list: linked and embedded pages, pagination, redirect targets and feed items, and nothing off-site', async () => {
	const planned = await enumerateRoutes(origin(crawly));
	const by = Object.fromEntries(planned.routes.map((r) => [r.route, r.sources]));
	assert.deepEqual(by['/docs'], ['crawl', 'sitemap']);
	assert.deepEqual(by['/docs/hidden'], ['crawl'], 'linked from /docs only');
	assert.deepEqual(by['/view/chart-area'], ['crawl'], 'a page an iframe embeds is a route');
	assert.deepEqual(by['/blog?page=2'], ['crawl'], 'a pagination query is kept');
	assert.deepEqual(by['/blog/post-9'], ['crawl'], 'found by following pagination');
	assert.deepEqual(by['/docs/moved'], ['redirect']);
	assert.deepEqual(by['/posts/from-feed'], ['feed']);
	assert.deepEqual(by['/private/'], ['robots']);
	assert.ok(by['/rss.xml']!.includes('feed'));
	assert.equal(planned.routes.find((r) => r.route === '/old-docs')?.status, 301);
	assert.ok(!planned.routes.some((r) => r.route.startsWith('/api') || r.route.includes('utm_source') || r.route.includes('#') || r.route.startsWith('mailto')), planned.routes.map((r) => r.route).join(', '));
	assert.deepEqual(planned.sitemaps, ['/maps/index.xml', '/maps/pages.xml']);
	assert.equal(planned.truncated, false);
	const bounded = await enumerateRoutes(origin(crawly), { bound: 2 });
	assert.equal(bounded.truncated, true, 'a crawl stopped at its bound says so');
});

// The slowest of these checks takes about a minute on CI.
const cli = (args: readonly string[], cwd: string) => spawnNode([CLI, ...args], { cwd, timeoutMs: 300_000 });

async function planned(): Promise<string> {
	const cwd = await mkdtemp(join(tmpdir(), 'mm-coverage-'));
	await mkdir(join(cwd, '.migrate'));
	const allRoutes = SITEMAP_ROUTES.map((route) => ({ route, sources: ['sitemap'], status: 200, contentType: 'text/html' }));
	await writeFile(join(cwd, '.migrate', 'inventory.json'), JSON.stringify({ version: 1, origin: origin(old), routes: [], locales: [], localeRouting: { prefixes: [], negotiation: {} }, allRoutes }));
	return cwd;
}

test('a --route run is a partial run: green for the route it checked, never overall green, and status is not done', async () => {
	const cwd = await planned();
	const run = await cli(['check', '--old', origin(old), '--new', origin(old), '--route', '/about', '--no-responsiveness', '--no-load', '--journey-budget', '5'], cwd);
	assert.equal(run.status, 4, run.stdout + run.stderr);
	assert.match(run.stdout, /pass +\/about/);
	assert.match(run.stdout, /Partial run: 1 of 10 routes checked\. A run limited by --route or --changed is never overall green/);
	assert.match(run.stderr, /partial run \(1 of 10 routes\): not an overall green/);
	const report = JSON.parse(await readFile(join(cwd, '.migrate', 'report.json'), 'utf8'));
	assert.equal(report.ok, false);
	assert.equal(report.checkedOk, true);
	assert.deepEqual(report.partial, { checked: 1, total: 10 });
	assert.equal((await status(cwd)).done, false);
});

test('check --only coverage measures every planned route, status says routes ported N of M, and switch refuses a front door while routes are missing', async () => {
	const cwd = await planned();
	const run = await cli(['check', '--old', origin(old), '--new', origin(next), '--only', 'coverage'], cwd);
	assert.equal(run.status, 1, run.stdout + run.stderr);
	assert.match(run.stdout, /Routes on the new app: 3 of 10 routes of the old site present, 7 missing\./);
	const report = JSON.parse(await readFile(join(cwd, '.migrate', 'report.json'), 'utf8'));
	assert.equal(report.coverage.missing.length, 7);
	const s = await status(cwd);
	assert.deepEqual([s.coverage?.ported, s.coverage?.total], [3, 10]);
	assert.equal(s.routes.find((r) => r.route === '/contact')?.state, 'not ported');
	assert.match((await cli(['status'], cwd)).stdout, /Routes ported: 3 of 10 routes of the old site; 7 missing on the new app/);
	const front = await switchRoute(cwd, '/*rest');
	assert.equal(front.ok, false);
	assert.match(!front.ok ? front.reason : '', /the new app lacks 7 routes of the old site it would send there/);
	const docs = await switchRoute(cwd, '/docs/*rest', { force: { reason: 'try it', by: 'Jack' } });
	assert.match(!docs.ok ? docs.reason : '', /lacks 4 routes .*--force does not override this/);
	const configured = await cli(['config', '--old', origin(old), '--new', origin(next)], cwd);
	assert.equal(configured.status, 0, 'no switched route, so no front door covers a missing route');
});

test('a shard of the site groups templates over every page of the site, so a page whose representative another shard checks skips visual, responsiveness, motion and page load', async () => {
	const docs = Array.from({ length: 22 }, (_, i) => `/docs/p${String(i + 1).padStart(2, '0')}`);
	const site = await serve((path) => (docs.includes(path) ? { status: 200, body: page(`Doc ${path}`) } : undefined));
	try {
		const shard = ['/docs/p02', '/docs/p03'];
		const report = await runCheck({ oldOrigin: origin(site), newOrigin: origin(site), routes: shard, browser, journeys: { budgetMs: 5_000 }, templates: { site: docs } });
		assert.deepEqual(report.templates?.groups.map((g) => [g.pattern, g.representative, g.members.length]), [['/docs/:page', '/docs/p01', 22]]);
		assert.deepEqual(report.routes.map((r) => [r.route, r.dimensions.visual, r.template?.representative, r.ok]), [['/docs/p02', 'skipped', '/docs/p01', true], ['/docs/p03', 'skipped', '/docs/p01', true]]);
		const alone = await runCheck({ oldOrigin: origin(site), newOrigin: origin(site), routes: shard, browser, journeys: { budgetMs: 5_000 } });
		assert.equal(alone.templates, undefined, 'two pages alone are under the threshold: each is its own representative');
	} finally {
		site.close();
	}
});

test('a catch-all front door is refused before coverage was ever measured', async () => {
	const cwd = await planned();
	const refused = await switchRoute(cwd, '/*rest');
	assert.match(!refused.ok ? refused.reason : '', /nothing has measured yet whether every route of the old site exists there/);
	await recordResults(cwd, { version: 1, old: origin(old), new: origin(old), startedAt: new Date().toISOString(), ok: true, routes: [], coverage: { total: 10, present: 10, missing: [], accepted: [], failures: [], notOnOld: [], unreachable: [] } });
	const allowed = await switchRoute(cwd, '/*rest');
	assert.match(allowed.ok ? '' : allowed.reason, /it has not been checked yet/, 'past coverage, the usual green-check rule applies');
});

test('template groups: URL pattern by source pattern or parent path, and the page layout', () => {
	assert.equal(urlPattern('/docs/intro'), '/docs/:page');
	assert.equal(urlPattern('/docs/intro/'), '/docs/:page/');
	assert.equal(urlPattern('/blog/2024/hello', ['/blog/:year/:slug']), '/blog/:year/:slug');
	assert.equal(urlPattern('/orders/1234/items'), '/orders/:id/:page');
	assert.equal(urlPattern('/'), '/');
	assert.equal(domSignature('<header></header><nav></nav><nav></nav><main><table></table></main><script>"<form>"</script><footer>'), 'header>nav>main>table>footer');
	// One docs pattern serves an accordion's page and a tooltip's: what one's controls animate says nothing about the other's.
	const accordion = widgetSignature('<main><div data-slot="accordion"><h3><button aria-expanded="false" data-slot="accordion-trigger">A</button></h3></div><p>text</p></main>');
	const tooltip = widgetSignature('<main><button data-slot="tooltip-trigger" aria-describedby="t">B</button><p>text</p></main>');
	assert.equal(accordion, 'button#accordion-trigger');
	assert.equal(tooltip, 'button#tooltip-trigger');
	assert.equal(widgetSignature('<main><button aria-expanded="true" data-slot="accordion-trigger">C</button><p>other text</p><script>"<div role=dialog>"</script></main>'), accordion, 'pages with the same kinds of control, whatever their text, stay one template');
});

test('above the threshold, every page gets http, rendered, seo and behaviour, and visual and responsiveness run on the template representative, said in the report', async () => {
	const docs = Array.from({ length: 22 }, (_, i) => `/docs/p${String(i + 1).padStart(2, '0')}`);
	const site = await serve((path) => (docs.includes(path) ? { status: 200, body: page(`Doc ${path}`) } : undefined));
	const changed = await serve((path) => (docs.includes(path) ? { status: 200, body: page(path === '/docs/p07' ? 'Renamed' : `Doc ${path}`) } : undefined));
	try {
		const report = await runCheck({ oldOrigin: origin(site), newOrigin: origin(changed), routes: docs, browser, journeys: { budgetMs: 5_000 } });
		assert.deepEqual(report.templates?.groups.map((g) => [g.pattern, g.representative, g.members.length]), [['/docs/:page', '/docs/p01', 22]]);
		const rep = report.routes.find((r) => r.route === '/docs/p01')!;
		const member = report.routes.find((r) => r.route === '/docs/p02')!;
		assert.equal(rep.dimensions.visual, 'pass');
		assert.deepEqual([member.dimensions.http, member.dimensions.rendered, member.dimensions.seo, member.dimensions.visual, member.dimensions.behaviour], ['pass', 'pass', 'pass', 'skipped', 'pass']);
		assert.equal(member.ok, true, 'a dimension its representative carries does not count as not compared');
		const renamed = report.routes.find((r) => r.route === '/docs/p07')!;
		assert.deepEqual(renamed.failures.map((f) => f.dimension).filter((d, i, all) => all.indexOf(d) === i).sort(), ['rendered', 'seo']);
		const text = summarize(report);
		assert.match(text, /weight and behaviour checks \(every control of every page is used\)\. Visual, responsiveness and motion ran on one representative per template group \(grouped by URL pattern, page layout and the kinds of control each page renders\): 1 group covering 22 pages\./);
		assert.match(text, /pass +\/docs\/p02 .*\n {6}visual, responsiveness and motion: checked on \/docs\/p01, the representative of its template group \(\/docs\/:page, 22 pages\)/);
		const every = await runCheck({ oldOrigin: origin(site), newOrigin: origin(site), routes: docs.slice(0, 1), browser, templates: false });
		assert.equal(every.templates, undefined);
	} finally {
		site.close();
		changed.close();
	}
});

test('an app that answers every path with its HTML shell lists no robots.txt or sitemap as routes of its own', async () => {
	const shell = await serve(() => ({ status: 200, body: page('App', ['/tasks']) }));
	try {
		const planned = await enumerateRoutes(origin(shell));
		assert.deepEqual(planned.routes.map((r) => r.route), ['/', '/tasks']);
		assert.deepEqual(planned.sitemaps, []);
	} finally {
		shell.close();
	}
});

test('coverage per role: a signed-in route the new app lacks is missing for that role, and an old rule sending unknown paths to the dashboard is no catch-all', async () => {
	const signedIn = (cookie: string | undefined) => /session=yes/.test(cookie ?? '');
	const app = (pages: readonly string[], markless = false) => {
		const mark = (html: string, path: string) => (markless ? html.replace('</body>', `<script type="@markless/core/route">{"file":"pages${path}.tsrx"}</script></body>`) : html);
		const server = createServer((req, res) => {
			const url = new URL(req.url ?? '/', 'http://x');
			const known = ['/', '/login', ...pages];
			if (!signedIn(req.headers.cookie)) {
				if (url.pathname.startsWith('/dashboard')) return res.writeHead(307, { location: '/login' }).end();
				return known.includes(url.pathname) ? res.writeHead(200, { 'content-type': 'text/html' }).end(mark(page(url.pathname), url.pathname)) : res.writeHead(404).end(page('Not found'));
			}
			if (!url.pathname.startsWith('/dashboard')) return res.writeHead(302, { location: '/dashboard' }).end();
			return known.includes(url.pathname) ? res.writeHead(200, { 'content-type': 'text/html' }).end(mark(page(url.pathname, ['/dashboard/invoices']), url.pathname)) : res.writeHead(404).end(page('Not found'));
		});
		return new Promise<Server>((done) => server.listen(0, '127.0.0.1', () => done(server)));
	};
	const a = await app(['/dashboard', '/dashboard/invoices']);
	const b = await app(['/dashboard'], true);
	const dir = await mkdtemp(join(tmpdir(), 'mm-roles-'));
	const state = (o: string) => ({ cookies: [{ name: 'session', value: 'yes', domain: new URL(o).hostname, path: '/', expires: -1, httpOnly: false, secure: false, sameSite: 'Lax' as const }], origins: [] });
	await writeFile(join(dir, 'old.json'), JSON.stringify(state(origin(a))));
	await writeFile(join(dir, 'new.json'), JSON.stringify(state(origin(b))));
	const auth = { dir, loginRoute: '/login', roles: { 'signed-in': { storageState: { old: 'old.json', new: 'new.json' } } } };
	try {
		const inventory = await plan({ origin: origin(a), browser, auth, samples: {} });
		const invoices = inventory.allRoutes!.find((r) => r.route === '/dashboard/invoices');
		assert.deepEqual(invoices?.roles, ['signed-in'], 'plan --auth lists a route only a signed-in visitor is linked to');
		const report = await runCheck({ oldOrigin: origin(a), newOrigin: origin(b), routes: [], coverage: ['/', '/login', '/dashboard', '/dashboard/invoices'], browser, auth });
		assert.deepEqual(report.coverage!.missing, ['/dashboard/invoices']);
		assert.deepEqual(report.coverage!.failures.map((f) => f.role), ['signed-in']);
		assert.deepEqual(report.coverage!.roles, [{ role: 'anonymous', total: 4, present: 4, missing: 0 }, { role: 'signed-in', total: 4, present: 3, missing: 1 }]);
		assert.match(summarize(report), /by role: anonymous 4 of 4, signed-in 3 of 4\n[\s\S]*\/dashboard\/invoices \(signed-in\) {2}old 200, new 404/);
	} finally {
		a.close();
		b.close();
	}
});

test('check --all checks every planned route, not only the ones the browser inventory and the source scan list', async () => {
	const cwd = await planned();
	const run = await cli(['check', '--all', '--old', origin(old), '--new', origin(old), '--no-responsiveness', '--no-load', '--journey-budget', '3'], cwd);
	for (const route of SITEMAP_ROUTES) assert.match(run.stdout, new RegExp(`pass +${route.replace(/\//g, '\\/')} `), run.stdout + run.stderr);
});

test('a page the new app passes through from the old app, without Markless rendering it, is served by the old app: not ported, not done, and not switchable', async () => {
	const routes = ['/', '/guide', '/feed.xml', '/gone', '/chat'];
	const elsewhere = await serve(() => ({ status: 200, body: page('Chat invite') }));
	const chat = { status: 302, location: `${origin(elsewhere)}/invite` };
	const oldSite = await serve((path) => (path === '/chat' ? chat : path === '/feed.xml' ? { status: 200, type: 'application/rss+xml', body: '<rss version="2.0"></rss>' } : routes.includes(path) ? { status: 200, body: page(`Old ${path}`) } : undefined));
	// `/` is ported; `/guide` is the old page byte for byte (a copied static file); the feed is a copied file, which is not a page; `/gone` is missing; `/chat` sends the visitor to another site, as both apps do.
	const passing = await serve((path) => (path === '/chat' ? chat : path === '/' ? { status: 200, body: ported('Old /', 'pages/index.tsrx') } : path === '/guide' ? { status: 200, body: page('Old /guide') } : path === '/feed.xml' ? { status: 200, type: 'application/rss+xml', body: '<rss version="2.0"></rss>' } : undefined));
	try {
		const report = await runCheck({ oldOrigin: origin(oldSite), newOrigin: origin(passing), routes: [], coverage: routes, browser });
		assert.equal(report.ok, false);
		assert.deepEqual([report.coverage!.total, report.coverage!.present], [5, 3], 'the redirect to another site is present: the page it lands on is that site\'s');
		assert.deepEqual(report.coverage!.missing, ['/gone']);
		assert.deepEqual(report.coverage!.servedByOld, ['/guide']);
		const text = summarize(report);
		assert.match(text, /Routes on the new app: 3 of 5 routes of the old site present, 1 missing, 1 served by the old app\./);
		assert.match(text, /Served by the old app, not rendered by the new app's Markless code \(1\):\n {2}\/guide {2}\[[0-9a-f]{10}\]/);
		const cwd = await mkdtemp(join(tmpdir(), 'mm-passthrough-'));
		await mkdir(join(cwd, '.migrate'));
		await writeFile(join(cwd, '.migrate', 'inventory.json'), JSON.stringify({ version: 1, origin: origin(oldSite), routes: [], locales: [], localeRouting: { prefixes: [], negotiation: {} }, allRoutes: routes.map((route) => ({ route, sources: ['sitemap'], status: 200, contentType: 'text/html' })) }));
		await recordResults(cwd, report);
		const s = await status(cwd);
		assert.equal(s.done, false);
		assert.deepEqual(s.coverage?.servedByOld, ['/guide']);
		assert.equal(s.routes.find((r) => r.route === '/guide')?.state, 'not ported');
		for (const route of ['/guide', '/gone', '/*rest']) {
			const refused = await switchRoute(cwd, route, { force: { reason: 'try it', by: 'Jack' } });
			assert.match(!refused.ok ? refused.reason : '', /not ported.*--force does not override this/, route);
		}
		assert.match((await switchRoute(cwd, '/guide')).ok ? '' : 'refused', /refused/);
	} finally {
		oldSite.close();
		passing.close();
		elsewhere.close();
	}
});
