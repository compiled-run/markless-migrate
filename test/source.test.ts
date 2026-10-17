import assert from 'node:assert/strict';
import { join } from 'node:path';
import { test } from 'node:test';
import { parse } from 'graphql';
import { summarizeSource, unionRoutes, type SourceInventory } from '../src/plan/source.ts';
import { fieldsRead, graphqlFields, groqFields } from '../src/source/clients.ts';
import { fileComponentName, planOrder } from '../src/source/components.ts';
import { parseModule, urlText, type N } from '../src/source/js.ts';
import { templateScript } from '../src/source/nondeterminism.ts';
import { covers, fromMatcher, joinPath, matchRoute, specificity } from '../src/source/pattern.ts';
import { colonPath } from '../src/source/routes/config.ts';
import { djangoPath, djangoRegex } from '../src/source/routes/django.ts';
import { laravelPath, middlewareRole } from '../src/source/routes/laravel.ts';
import { railsPath, roleFromCallback } from '../src/source/routes/rails.ts';
import { templatePath } from '../src/source/routes/wordpress.ts';
import { scanSource, type Component } from '../src/source/index.ts';
import { markupForms } from '../src/source/writes.ts';

const fixtures = join(import.meta.dirname, '..', 'fixtures');

test('route patterns join, match concrete paths and rank by specificity', () => {
	assert.equal(joinPath('/blog/', '', ':slug'), '/blog/:slug');
	assert.equal(joinPath('/blog/', '/'), '/blog/');
	assert.equal(joinPath(), '/');
	assert.ok(matchRoute('/:lang/about', '/fr/about'));
	assert.ok(matchRoute('/about/', '/about'));
	assert.ok(matchRoute('/docs/*path?', '/docs'));
	assert.ok(matchRoute('/docs/*path', '/docs/a/b'));
	assert.ok(!matchRoute('/docs/*path', '/docs'));
	assert.ok(matchRoute('/:lang?/pricing', '/pricing'));
	assert.ok(!matchRoute('/:lang/about', '/fr/contact'));
	assert.ok(specificity('/en/about') > specificity('/:lang/about'));
	assert.equal(fromMatcher('/dashboard/:path*'), '/dashboard/*path?');
	assert.equal(fromMatcher('/admin(.*)'), '/admin/*rest?');
	assert.ok(covers('/dashboard/*path?', '/dashboard'));
	assert.ok(covers('/admin', '/admin/users/:id', true));
	assert.ok(!covers('/admin', '/admin/users/:id'));
});

test('each stack spells dynamic segments its own way and all of them become one pattern syntax', () => {
	assert.equal(colonPath('/user/:id(\\d+)'), '/user/:id');
	assert.equal(colonPath('/:pathMatch(.*)*'), '/*pathMatch?');
	assert.equal(colonPath('/files/:rest+'), '/files/*rest');
	assert.equal(colonPath('**'), '/*splat?');
	assert.equal(railsPath('(:locale)/pricing(.:format)'), '/:locale?/pricing');
	assert.equal(laravelPath('/profile/{id?}/posts/{post}'), '/profile/:id?/posts/:post');
	assert.equal(djangoPath('posts/<int:pk>/<path:rest>'), '/posts/:pk/*rest');
	assert.equal(djangoRegex('^archive/(?P<year>[0-9]{4})/$'), '/archive/:year/');
	assert.equal(djangoRegex('^tag/([a-z]+)/?$'), '/tag/:param/');
});

test('WordPress templates map to the URLs they usually serve, front page first', () => {
	const has = (t: string) => ['front-page', 'home'].includes(t);
	assert.equal(templatePath('front-page', has), '/');
	assert.equal(templatePath('home', has), undefined);
	assert.equal(templatePath('single-event', has), '/event/:slug/');
	assert.equal(templatePath('page-about', has), '/about/');
	assert.equal(templatePath('taxonomy-genre', has), '/genre/:term/');
	assert.equal(templatePath('404', has), undefined);
});

test('roles come from middleware names and before_action callbacks; plain sign-in has no role', () => {
	assert.equal(middlewareRole('auth'), null);
	assert.equal(middlewareRole('auth:sanctum'), null);
	assert.equal(middlewareRole('auth:admin'), 'admin');
	assert.equal(middlewareRole('role:editor|admin'), 'editor');
	assert.equal(middlewareRole('throttle:60,1'), undefined);
	assert.equal(roleFromCallback('authenticate_user!'), null);
	assert.equal(roleFromCallback('authenticate_admin!'), 'admin');
	assert.equal(roleFromCallback('require_login'), null);
	assert.equal(roleFromCallback('admin_only'), 'admin');
});

test('GraphQL fields are response paths, fragments expanded; GROQ fields come from the first projection', () => {
	const doc = parse('query { shop { name } products(first: 2) { edges { node { id ...Card t: title } } } } fragment Card on Product { handle }');
	assert.deepEqual(graphqlFields(doc), ['shop.name', 'products.edges.node.id', 'products.edges.node.handle', 'products.edges.node.t']);
	assert.deepEqual(groqFields('*[_type == "post" && slug.current == $slug][0]{ title, "slug": slug.current, author->{ name, "avatar": image.asset->url }, ...seo }'), ['title', 'slug', 'author.name', 'author.avatar']);
	assert.deepEqual(groqFields('count(*[_type == "post"])'), []);
});

test('fields read off a result follow destructuring, optional chains and array callbacks', () => {
	const mod = parseModule('a.ts', 'async function f() { const { items, total } = await get(); const first = items?.[0]; (items ?? []).map((item) => item.title.rendered); return [first.slug, total]; }');
	const fn = (mod.program.body as N[])[0]!;
	assert.deepEqual(fieldsRead(fn, new Map([['items', 'items'], ['total', 'total']])), ['items.slug', 'items.title.rendered', 'total']);
});

test('URLs keep what is static, name environment variables and turn other values into params', () => {
	const mod = parseModule('a.ts', 'const BASE = process.env.API_URL; function f(id, base) { const local = import.meta.env.CMS; return [`${BASE}/posts/${id}`, `${base}/x`, new URL(`/p/${post.slug}`, local)]; }');
	const fn = (mod.program.body as N[])[1]!;
	const [a, b, c] = (fn.body.body[1].argument.elements as N[]);
	assert.equal(urlText(a, mod, fn), '${API_URL}/posts/:id');
	assert.equal(urlText(b, mod, fn), '${base}/x');
	assert.equal(urlText(c, mod, fn), '${CMS}/p/:slug');
});

test('markup forms keep their method override and resolve server-side URL helpers', () => {
	const writes = markupForms('t.php', '<form method="post" action="<?php echo admin_url(\'admin-post.php\'); ?>">\n</form>\n<form method="POST" action="/x">@method(\'DELETE\')</form>\n<form action="/search"></form>');
	assert.deepEqual(writes.map((w) => `${w.method} ${w.path} ${w.handler.line}`), ['POST /wp-admin/admin-post.php 1', 'DELETE /x 3']);
	assert.deepEqual(markupForms('a.html.erb', '<%= form_with url: "/posts", method: :patch do %>').map((w) => `${w.method} ${w.path}`), ['PATCH /posts']);
});

test('template expressions are scanned in place, with lines kept', () => {
	const script = templateScript('a.svelte', '<p>\n{Math.random()}</p>{#each xs as x}{x}{/each}');
	assert.match(script.split('\n')[1]!, /^;Math\.random\(\); +;x; +$/);
	assert.equal(script.length, '<p>\n{Math.random()}</p>{#each xs as x}{x}{/each}'.length);
	assert.match(templateScript('a.vue', '<p :title="Date.now()">{{ n }}</p>'), /;Date\.now\(\);.*; n ;/);
});

test('component names come from the file, with the folder for convention files', () => {
	assert.equal(fileComponentName('src/routes/blog/[slug]/+page.svelte'), 'SlugPage');
	assert.equal(fileComponentName('src/routes/+layout.svelte'), 'RootLayout');
	assert.equal(fileComponentName('pages/index.vue'), 'Root');
	assert.equal(fileComponentName('components/site-header.vue'), 'SiteHeader');
});

test('plan order puts leaves first, layouts ahead of other ready components, and breaks cycles only when nothing is ready', () => {
	const c = (id: string, kind: Component['kind'], uses: string[], usedBy: string[]): Component => ({ id, name: id, file: `${id}.tsx`, line: 1, kind, uses, usedBy });
	const order = planOrder({
		components: [
			c('Page', 'route', ['Card', 'Button'], []),
			c('Layout', 'layout', ['Button'], []),
			c('Card', 'component', ['Button'], ['Page']),
			c('Button', 'component', [], ['Page', 'Layout', 'Card']),
			c('A', 'component', ['B'], ['B']),
			c('B', 'component', ['A'], ['A']),
		],
	});
	assert.deepEqual(order.map((s) => s.name), ['Button', 'Layout', 'Card', 'Page', 'A', 'B']);
	assert.equal(order[0]!.unlocks, 3);
});

test('the route union files each crawled path under the most specific source route and flags one-sided routes', () => {
	const route = (path: string, extra: object = {}) => ({ path, file: 'f', line: 1, dynamic: path.includes(':'), kind: 'page' as const, ...extra });
	const union = unionRoutes(['/en', '/en/about', '/fr/about', '/en/pricing', '/'], [route('/:lang'), route('/:lang/about'), route('/en/pricing'), route('/admin', { auth: ['admin'] }), route('/api/hook', { kind: 'endpoint', methods: ['POST'] })]);
	assert.deepEqual(
		union.map((u) => `${u.route} ${u.knownBy.join('+')} ${u.crawled.join(',')}`),
		['/ crawl /', '/:lang crawl+source /en', '/:lang/about crawl+source /en/about,/fr/about', '/admin source ', '/en/pricing crawl+source /en/pricing'],
	);
});

test('the plan summary lists each kind of fact and flags routes only one side knows', () => {
	const source: SourceInventory = {
		path: '/app',
		fileRoutes: [],
		framework: 'next',
		routes: [{ path: '/:lang', file: 'app/[lang]/page.tsx', line: 3, dynamic: true, kind: 'page' }],
		nondeterminism: [{ file: 'a.tsx', line: 2, kind: 'time', what: 'Date.now()', side: 'server' }],
		writes: [{ method: 'POST', path: null, handler: { file: 'b.ts', line: 4 }, via: 'server-action', touches: ['prisma'] }],
		clients: [{ kind: 'rest', file: 'c.ts', line: 5, queries: ['/news'], fields: ['items.title'], base: '${CMS_URL}' }],
		authGuards: [{ role: null, file: 'm.ts', line: 1, routes: ['/:lang'], how: 'auth()', redirectTo: '/login' }],
		components: [],
		order: [],
		limits: ['x: parsed with errors'],
	};
	const text = summarizeSource(source, unionRoutes(['/en', '/'], source.routes));
	assert.match(text, /Routes: 1 in source; 0 only in source, 1 only in the crawl/);
	assert.match(text, /\/:lang {2}crawled \/en {2}app\/\[lang\]\/page\.tsx:3/);
	assert.match(text, /\/ {2}\(only in the crawl: no source route serves it\)/);
	assert.match(text, /time Date\.now\(\) \(server\) {2}a\.tsx:2/);
	assert.match(text, /POST \(same page\) {2}server-action touching prisma {2}b\.ts:4/);
	assert.match(text, /rest \$\{CMS_URL\}\/news {2}fields items\.title {2}c\.ts:5/);
	assert.match(text, /signed-in via auth\(\) on \/:lang, login at \/login {2}m\.ts:1/);
	assert.match(text, /Limit: x: parsed with errors/);
});

test('the Next.js app fixture: routes, the form that posts to its route handler, and its CMS and client-side noise', async () => {
	const facts = await scanSource(join(fixtures, 'next-app'));
	assert.equal(facts.framework, 'next');
	assert.deepEqual(
		facts.routes.map((r) => `${r.kind} ${r.path}`),
		['page /:lang', 'page /:lang/about', 'page /:lang/admin', 'page /:lang/contact', 'page /:lang/login', 'page /:lang/members', 'page /:lang/news/:slug', 'endpoint /api/contact', 'endpoint /api/login', 'endpoint /api/news', 'endpoint /feed.xml'],
	);
	assert.ok(facts.writes.some((w) => w.method === 'POST' && w.path === '/api/contact' && w.via === 'route-handler' && w.handler.file === 'app/api/contact/route.ts'));
	assert.ok(!facts.writes.some((w) => w.via === 'form' && w.path === '/api/contact'), 'the form is answered by the route handler, so it is not listed twice');
	assert.ok(facts.nondeterminism.some((n) => n.kind === 'personalisation' && n.file === 'proxy.ts'));
	assert.deepEqual(
		facts.authGuards.map((g) => `${g.role ?? 'signed-in'} ${g.routes.join(',')} ${g.file}`),
		['admin /:lang/admin app/[lang]/admin/page.tsx', 'signed-in /:lang/members app/[lang]/members/page.tsx'],
		'the pages guard by sign-in and role; the proxy redirects by language and walls bots, which is not sign-in',
	);
	assert.ok(facts.components.some((c) => c.kind === 'layout' && c.uses.some((u) => u.endsWith('#Menu'))));
});

test('the Vite multi-page fixture: one route per HTML page, its form and its clock', async () => {
	const facts = await scanSource(join(fixtures, 'vite-site'));
	assert.equal(facts.framework, 'vite');
	assert.deepEqual(facts.routes.map((r) => r.path), ['/', '/about/', '/admin/', '/ar/', '/fr/', '/login/', '/members/']);
	assert.deepEqual(facts.authGuards.map((g) => [g.file, g.role, g.redirectTo, g.routes]), [['middleware.ts', null, '/login/', ['/members/']], ['middleware.ts', 'admin', '/login/', ['/admin/']]], 'the admin check runs only under /admin/, so /members/ needs only a session');
	assert.ok(facts.writes.some((w) => w.method === 'POST' && w.path === '/api/subscribe' && w.via === 'form' && w.handler.file === 'about/index.html'));
	assert.ok(facts.nondeterminism.some((n) => n.kind === 'time' && n.file === 'src/main.ts' && n.what === 'new Date()'));
});

test('plan --source keeps the file routes older readers expect and adds the scan, its order and a source section', async () => {
	const { readSource, summarizeInventory } = await import('../src/plan/inventory.ts');
	const source = await readSource(join(fixtures, 'next-app'));
	assert.equal(source.framework, 'next');
	assert.deepEqual(source.fileRoutes, ['/[lang]', '/[lang]/about', '/[lang]/admin', '/[lang]/contact', '/[lang]/login', '/[lang]/members', '/[lang]/news/[slug]', '/api/contact', '/api/login', '/api/news', '/feed.xml']);
	assert.ok(source.order.some((s) => s.kind === 'layout'));
	const text = summarizeInventory({ version: 1, origin: 'http://old', generatedAt: '', limit: 1, truncated: false, routes: [], locales: [], localeRouting: { prefixes: [], negotiation: {} }, source, routeUnion: unionRoutes(['/en', '/'], source.routes) });
	assert.match(text, /Source: next at /);
	assert.match(text, /\/:lang {2}crawled \/en/);
	assert.match(text, /\/:lang\/about {2}\(only in source: not reached by the crawl\)/);
});

test('the source scan leaves out git submodules: a .gitmodules path or a directory with its own .git', async () => {
	const { mkdtemp, mkdir, writeFile } = await import('node:fs/promises');
	const { tmpdir } = await import('node:os');
	const { scanSource } = await import('../src/source/index.ts');
	const root = await mkdtemp(join(tmpdir(), 'mm-submodule-'));
	const files: Record<string, string> = {
		'package.json': '{"dependencies":{"express":"4"}}',
		'.gitmodules': '[submodule "specs"]\n\tpath = specs\n\turl = https://example.com/specs.git\n',
		'server.js': 'const app = require("express")(); app.get("/", (q, r) => r.send(String(Date.now())));',
		'specs/api/hurl-to-bruno.js': 'console.log(Date.now(), Math.random());',
		'vendor-lib/.git': 'gitdir: ../.git/modules/vendor-lib',
		'vendor-lib/index.js': 'export const t = Date.now();',
	};
	for (const [file, text] of Object.entries(files)) {
		await mkdir(join(root, file, '..'), { recursive: true });
		await writeFile(join(root, file), text);
	}
	const facts = await scanSource(root);
	const scanned = [...new Set(facts.nondeterminism.map((n) => n.file))];
	assert.deepEqual(scanned, ['server.js']);
});

test('plan recognises Docusaurus and VitePress and maps every page to its Markdown file, so failures name the old line', async () => {
	const { scanSource } = await import('../src/source/index.ts');
	const { indexMarkup, findText } = await import('../src/check/markup.ts');
	const fixture = (name: string) => new URL(`./source-fixtures/${name}`, import.meta.url).pathname;
	const docusaurus = await scanSource(fixture('docusaurus'));
	assert.equal(docusaurus.framework, 'docusaurus');
	assert.deepEqual(docusaurus.routes.map((r) => `${r.path} ${r.file}:${r.line}`), [
		'/ src/pages/index.tsx:1',
		'/blog/2026/01/02/hello blog/2026-01-02-hello.md:4',
		'/docs/api docs/api/index.md:1',
		'/docs/installation docs/01-guides/02-installation.md:4',
		'/docs/intro docs/intro.md:4',
		'/showcase src/pages/showcase.md:1',
	]);
	const vitepress = await scanSource(fixture('vitepress'));
	assert.equal(vitepress.framework, 'vitepress');
	assert.deepEqual(vitepress.routes.map((r) => `${r.path} ${r.file}`), ['/ docs/index.md', '/guide/ docs/guide/index.md', '/guide/getting-started docs/guide/getting-started.md']);
	const index = await indexMarkup(fixture('docusaurus'));
	assert.deepEqual(findText(index, 'Let us discover Docusaurus in less than 5 minutes.'), { file: 'docs/intro.md', line: 7 });
	assert.deepEqual(findText(index, 'Run npm init docusaurus.'), { file: 'docs/01-guides/02-installation.md', line: 7 });
});
