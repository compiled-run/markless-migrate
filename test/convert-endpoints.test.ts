import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { createServer, type AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { codeOnly, fileSignals } from '../src/cache/signals.ts';
import { closureOf, jsxObject, publicEnvExpression, readsNoRequest, robotsTxt, serverSource, sitemapXml, trailingPolicy, trailingRoutes } from '../src/convert/endpoints.ts';
import { parseModule, walk, type N } from '../src/source/js.ts';
import { emitElement } from '../src/convert/tsrx.ts';
import { body, parseDocument } from '../src/convert/dom.ts';

test('a request read named inside a string or a comment is not one; a template literal\'s expression is code', () => {
	assert.deepEqual(fileSignals('export const COPY = {"a": "call headers() here"}; // cookies()', 'clipboard.ts').requestReads, []);
	assert.equal(fileSignals('const h = headers();', 'page.ts').requestReads[0]?.what, 'headers()');
	assert.match(codeOnly('const u = `id ${req.headers.get("x")}`;'), /req\.headers\.get/);
	assert.equal(codeOnly('/* headers()\n */ x').split('\n').length, 2, 'lines are kept');
});

test('a dynamic import is in a handler\'s closure only where the handler\'s code reaches it', async () => {
	const root = await mkdtemp(join(tmpdir(), 'mm-closure-'));
	await mkdir(join(root, 'app', 'x'), { recursive: true });
	await mkdir(join(root, 'lib'), { recursive: true });
	await writeFile(join(root, 'app', 'x', 'route.ts'), "import { items } from '@/lib/api';\nexport async function GET() { return Response.json(await items()); }\n");
	await writeFile(join(root, 'lib', 'api.ts'), "export async function items() { const { Index } = await import('./index'); return Index; }\nexport async function component() { const { C } = await import('./components'); return C; }\n");
	await writeFile(join(root, 'lib', 'index.ts'), 'export const Index = [1];\n');
	await writeFile(join(root, 'lib', 'components.tsx'), "import * as React from 'react';\nexport const C = () => <div />;\n");
	const closure = await closureOf(root, 'app/x/route.ts');
	assert.deepEqual([...closure.files].map((f) => f.slice(root.length + 1)).sort(), ['app/x/route.ts', 'lib/api.ts', 'lib/index.ts']);
	assert.ok(!closure.packages.has('react'));
	assert.equal(closure.dead.get(join(root, 'lib', 'api.ts'))?.size, 1, 'the unreached import() is stubbed in the ported file');
});

test('a GET that takes no request or ignores the one it gets is static', () => {
	assert.equal(readsNoRequest('a.ts', 'export async function GET() { return new Response("x"); }'), true);
	assert.equal(readsNoRequest('a.ts', 'export async function GET(_req, { params }) { return new Response((await params).slug); }'), true);
	assert.equal(readsNoRequest('a.ts', 'export async function GET(request) { return new Response(new URL(request.url).search); }'), false);
});

test('JSX handed to ImageResponse becomes satori\'s element objects, with React\'s text whitespace rules', () => {
	const text = 'const el = (\n  <div tw="flex" style={{ a: 1 }}>\n    Hello\n    world\n    <svg width={48}><line x1="2" /></svg>\n    {title}\n  </div>\n);';
	const mod = parseModule('og.tsx', text);
	let jsx: N | undefined;
	walk(mod.program, (n: N) => {
		if (!jsx && n.type === 'JSXElement') jsx = n;
	});
	const title = 'T';
	const value = new Function('title', `return ${jsxObject(jsx!, text)};`)(title);
	assert.deepEqual(value, { type: 'div', key: null, props: { tw: 'flex', style: { a: 1 }, children: ['Hello world', { type: 'svg', key: null, props: { width: 48, children: { type: 'line', key: null, props: { x1: '2' } } } }, 'T'] } });
});

test('JSX text is the text React renders: an HTML entity in it is decoded', () => {
	const text = 'const el = <p>We&apos;ve added &quot;dark&quot; mode &amp; more</p>;';
	let jsx: N | undefined;
	walk(parseModule('og.tsx', text).program, (n: N) => {
		if (!jsx && n.type === 'JSXElement') jsx = n;
	});
	assert.deepEqual(new Function(`return ${jsxObject(jsx!, text)};`)(), { type: 'p', key: null, props: { children: 'We\'ve added "dark" mode & more' } });
});

test('a sitemap and robots.txt are written as Next.js writes them', () => {
	assert.equal(sitemapXml([{ url: 'https://x.dev/' }, { url: 'https://x.dev/a', lastModified: '2026-01-01T00:00:00.000Z' }]), '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n<url>\n<loc>https://x.dev/</loc>\n</url>\n<url>\n<loc>https://x.dev/a</loc>\n<lastmod>2026-01-01T00:00:00.000Z</lastmod>\n</url>\n</urlset>\n');
	assert.equal(robotsTxt({ rules: { userAgent: '*', allow: '/' }, sitemap: 'https://x.dev/sitemap.xml' }), 'User-Agent: *\nAllow: /\n\nSitemap: https://x.dev/sitemap.xml\n');
});

test('text with quotes stays markup; a comment opener in text is a string expression', () => {
	const out = emitElement(body(parseDocument('<body><p>it\'s "x"</p><p>a // b</p></body>')));
	assert.match(out, /<p>it's "x"<\/p>/);
	assert.match(out, /\{"a \/\/ b"\}/);
});

test("a ported handler gets the old build's NEXT_PUBLIC_ values inlined, its own origin as the new app's", () => {
	const text = 'export const url = `${process.env.NEXT_PUBLIC_APP_URL}/r/x.json`;\nexport const v0 = process.env.NEXT_PUBLIC_V0_URL;\nexport const none = process.env.NEXT_PUBLIC_UNSET;\nexport const secret = process.env.SECRET;\n';
	const out = serverSource('/old', '/old/lib/utils.ts', '/new/handlers', text, new Set(), { values: { NEXT_PUBLIC_APP_URL: 'http://localhost:4000', NEXT_PUBLIC_V0_URL: 'https://v0.dev' }, origin: 'http://localhost:4000' });
	assert.match(out, /\$\{\(\(import\.meta\.env\.VITE_APP_URL \?\? ''\) \+ ""\)\}\/r\/x\.json/);
	assert.match(out, /v0 = "https:\/\/v0\.dev"/);
	assert.match(out, /none = undefined/);
	assert.match(out, /secret = process\.env\.SECRET/);
	assert.equal(publicEnvExpression('http://localhost:4000/docs', 'http://localhost:4000/'), "((import.meta.env.VITE_APP_URL ?? '') + \"/docs\")");
	assert.equal(serverSource('/old', '/old/lib/utils.ts', '/new/handlers', text), text);
});

test('TypeScript under ts-morph is copied whole and not parsed by the server tracer', async () => {
	const { viteConfig } = await import('../src/convert/index.ts');
	const config = viteConfig(['dedent', 'ts-morph']);
	assert.match(config, /traceDeps: \["dedent","ts-morph","@ts-morph\/common\*"\]/);
	assert.match(config, /ignore: \(path: string\) => \["@ts-morph\/common\/dist\/typescript\.js"\]/);
	assert.doesNotMatch(viteConfig(['dedent']), /traceOpts/);
});

test("the old site's trailing-slash answer is kept: from next.config, else from the redirects plan saw its host answer", () => {
	assert.deepEqual(trailingPolicy('module.exports = { trailingSlash: true }', []), { mode: 'add', status: 308, pagesOnly: false });
	assert.deepEqual(trailingPolicy('module.exports = {}', []), { mode: 'strip', status: 308, pagesOnly: false });
	const seen = [
		{ route: '/docs/intro', status: 307, redirectsTo: '/docs/intro/' },
		{ route: '/docs/tabs', status: 307, redirectsTo: '/docs/tabs/' },
		{ route: '/old', status: 301, redirectsTo: '/new' },
	];
	assert.deepEqual(trailingPolicy(undefined, seen), { mode: 'add', status: 307, pagesOnly: true }, "a static host's own answer: only where a page with the slash exists");
	assert.deepEqual(trailingPolicy(undefined, [{ route: '/docs/', status: 308, redirectsTo: '/docs' }]), { mode: 'strip', status: 308, pagesOnly: true });
	assert.equal(trailingPolicy(undefined, [{ route: '/old', status: 301, redirectsTo: '/new' }]), undefined);
});

test("a prerendered page's file does not answer the other trailing-slash form: Vercel's routes redirect it first, as the old site did", async () => {
	const { viteConfig } = await import('../src/convert/index.ts');
	const dir = await mkdtemp(join(tmpdir(), 'mm-trailing-'));
	await mkdir(join(dir, 'static', 'view', 'chart'), { recursive: true });
	await writeFile(join(dir, 'static', 'view', 'chart', 'index.html'), '<p>chart</p>');
	await mkdir(join(dir, 'static', 'docs', 'intro'), { recursive: true });
	await writeFile(join(dir, 'static', 'docs', 'intro', 'index.html'), '<p>intro</p>');
	await mkdir(join(dir, 'functions', '__server.func'), { recursive: true });
	await writeFile(join(dir, 'functions', '__server.func', 'index.mjs'), "export default { fetch: () => new Response('function') };");
	const serve = async (routes: readonly object[], run: (get: (path: string) => Promise<[number, string | null]>) => Promise<void>) => {
		await writeFile(join(dir, 'config.json'), JSON.stringify({ version: 3, routes: [...routes, { handle: 'filesystem' }] }));
		const port = await new Promise<number>((done) => {
			const probe = createServer().listen(0, '127.0.0.1', () => {
				const { port } = probe.address() as AddressInfo;
				probe.close(() => done(port));
			});
		});
		const server = spawn(process.execPath, [fileURLToPath(new URL('../deploy/shadcn-ui/serve-vercel-output.mjs', import.meta.url)), dir, String(port)], { stdio: ['ignore', 'pipe', 'inherit'] });
		try {
			await once(server.stdout!, 'data');
			await run(async (path) => {
				const r = await fetch(`http://127.0.0.1:${port}${path}`, { redirect: 'manual' });
				await r.arrayBuffer();
				return [r.status, r.headers.get('location')];
			});
		} finally {
			server.kill();
		}
	};
	const next = trailingRoutes({ mode: 'strip', status: 308, pagesOnly: false }, ['/view/chart']);
	assert.match(viteConfig([], next), new RegExp(`vercel: \\{ config: \\{ routes: ${JSON.stringify(next).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\} \\}`));
	await serve(next, async (get) => {
		assert.deepEqual(await get('/view/chart/'), [308, '/view/chart'], 'Next.js answers the slash form of every path with a 308 to the bare one');
		assert.deepEqual(await get('/view/chart'), [200, null]);
		assert.deepEqual(await get('/build/chunk/'), [200, null], "the app's own files are not redirected");
	});
	await serve(trailingRoutes({ mode: 'add', status: 307, pagesOnly: true }, ['/docs/intro/']), async (get) => {
		assert.deepEqual(await get('/docs/intro'), [307, '/docs/intro/'], "a static host's redirect to a page's folder form");
		assert.deepEqual(await get('/docs/intro/'), [200, null]);
		assert.deepEqual(await get('/docs/other'), [200, null], 'only where a page with the slash exists');
	});
	assert.deepEqual(trailingRoutes(undefined, ['/a']), []);
	assert.doesNotMatch(viteConfig([], []), /vercel:/);
});

test("the generated config keeps one of each Nitro handler and server asset directory, though the router hands Vite the app's nitro config again", async () => {
	const { viteConfig } = await import('../src/convert/index.ts');
	const config = viteConfig([]);
	const source = /const nitroOnce: \(options: Record<string, unknown>\) => void = ([\s\S]+?);\n\nexport default/.exec(config)?.[1];
	assert.ok(source, config);
	assert.match(config, /modules: \[\{ name: 'markless-migrate:once', setup: \(nitro: \{ options: Record<string, unknown> \}\) => nitroOnce\(nitro\.options\) \}\]/);
	const once = new Function(`return ${source}`)() as (options: Record<string, unknown>) => void;
	const handler = { middleware: true, handler: '/app/server/routing.ts' };
	const assets = { baseName: 'built', dir: '/app/server/built' };
	const route = { src: '^(/a)/+$', status: 308, headers: { Location: '$1' } };
	const options: Record<string, unknown> = { handlers: [handler, { ...handler }, { route: '/api', handler: '/app/api.ts' }], serverAssets: [assets, { ...assets }, { baseName: 'server', dir: '/app/assets' }], traceDeps: ['a', 'a', 'b'], vercel: { config: { routes: [route, structuredClone(route)] } } };
	once(options);
	assert.deepEqual(options, { handlers: [handler, { route: '/api', handler: '/app/api.ts' }], serverAssets: [assets, { baseName: 'server', dir: '/app/assets' }], traceDeps: ['a', 'b'], vercel: { config: { routes: [route] } } });
	const bare: Record<string, unknown> = { handlers: [] };
	once(bare);
	assert.deepEqual(bare, { handlers: [] });
});
