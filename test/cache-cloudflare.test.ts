import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { cacheModule } from '../src/cache/apply.ts';
import { classify } from '../src/cache/classify.ts';
import { checkCloudflareLive } from '../src/cache/cloudflare-live.ts';
import type { ResponseFacts, RouteEvidence } from '../src/cache/evidence.ts';
import { checkCloudflareOutput } from '../src/cache/output.ts';
import { cacheRules, cloudflareAssetFile, cloudflareRules } from '../src/cache/rules.ts';
import { fileSignals, NO_SIGNALS } from '../src/cache/signals.ts';

const facts = (over: Partial<ResponseFacts> = {}): ResponseFacts => ({ status: 200, contentType: 'text/html', vary: [], setCookies: [], bodyHash: 'a', ttfbMs: 10, ...over });
const evidence = (route: string, first: Partial<ResponseFacts> = {}, second: Partial<ResponseFacts> = first): RouteEvidence => ({ route, first: facts(first), second: facts(second) });

const docs = classify({ evidence: evidence('/docs/') });
const news = classify({ evidence: evidence('/news', { bodyHash: 'a' }, { bodyHash: 'b' }) });
const search = classify({ evidence: evidence('/search'), old: { ...NO_SIGNALS, ...fileSignals("searchParams.get('q')", 'app/search/page.tsx') } });
const account = classify({ evidence: evidence('/account', { setCookies: ['sid'] }) });

test('on Cloudflare every page Vercel would cache, revalidated or not, is a built file at its page and fragment URL; the rest render in the Worker', () => {
	assert.deepEqual([docs.class, news.class, search.class, account.class], ['prerender', 'isr', 'isr', 'no-cache']);
	const rules = cloudflareRules([docs, news, search, account], { fragmentPath: '/_markless/fragment', hashedAssets: ['/js/app.3f2a9c01.js'] }).routeRules;
	assert.deepEqual(rules['/docs/'], { prerender: true });
	assert.deepEqual(rules['/_markless/fragment/docs/'], { prerender: true });
	assert.deepEqual(rules['/news'], { prerender: true }, 'kept until the next deploy: Cloudflare has no ISR');
	assert.deepEqual(rules['/_markless/fragment/news'], { prerender: true });
	assert.equal(rules['/search'], undefined, 'a page that reads the query renders per request');
	assert.deepEqual(rules['/account'], { headers: { 'cache-control': 'private, no-store' } });
	assert.deepEqual(rules['/js/app.3f2a9c01.js'], { headers: { 'cache-control': 'public, max-age=31536000, immutable' } });
	assert.equal(Object.values(rules).some((rule) => 'isr' in rule), false);
});

test('a prerendered path is the file Cloudflare serves at that exact URL', () => {
	assert.equal(cloudflareAssetFile('/'), 'index.html');
	assert.equal(cloudflareAssetFile('/guide'), 'guide.html');
	assert.equal(cloudflareAssetFile('/guide/'), 'guide/index.html');
	assert.equal(cloudflareAssetFile('/_markless/fragment/'), '_markless/fragment/index.html');
	assert.equal(cloudflareAssetFile('/_markless/fragment/guide'), '_markless/fragment/guide.html');
});

test('the generated plugin applies the Cloudflare rules under a cloudflare preset and the Vercel rules otherwise', async () => {
	const routes = [docs, news];
	const dir = await mkdtemp(join(tmpdir(), 'mm-cache-cf-'));
	const file = join(dir, 'migrate-cache.ts');
	await writeFile(file, cacheModule(cacheRules(routes, { fragmentPath: '/_markless/fragment' }), routes, cloudflareRules(routes, { fragmentPath: '/_markless/fragment' })));
	const { applyRules } = (await import(file)) as { applyRules: (nitro: { options: Record<string, any> }) => void };
	const cloudflare: { options: Record<string, any> } = { options: { preset: 'cloudflare-module', routeRules: { '/news': { isr: 60, headers: { 'x-own': '1' } } } } };
	applyRules(cloudflare);
	assert.deepEqual(cloudflare.options.routeRules['/news'], { headers: { 'x-own': '1' }, prerender: true });
	assert.deepEqual(cloudflare.options.routeRules['/_markless/fragment/docs/'], { prerender: true });
	const vercel: { options: Record<string, any> } = { options: { preset: 'vercel', routeRules: {} } };
	applyRules(vercel);
	assert.deepEqual(vercel.options.routeRules['/news'], { isr: { expiration: 60, allowQuery: [] } });
});

test('the Cloudflare build check names each cached path that is not a file, and compressed copies Cloudflare never serves', async () => {
	const out = await mkdtemp(join(tmpdir(), 'mm-cf-output-'));
	const write = async (path: string, body = 'x') => {
		await mkdir(dirname(join(out, path)), { recursive: true });
		await writeFile(join(out, path), body);
	};
	await write('public/docs/index.html');
	await write('public/_markless/fragment/docs/index.html');
	await write('public/news/index.html');
	await write('public/build/app.js');
	await write('public/build/app.js.br');
	await write('public/docs/index.html.gz');
	await write('public/_headers');
	await write('server/index.mjs', 'export default {}');
	const rules = cloudflareRules([docs, news], { fragmentPath: '/_markless/fragment' }).routeRules;
	const report = await checkCloudflareOutput(out, rules);
	assert.deepEqual(report.missing.sort(), ['/_markless/fragment/news', '/news'], '/news is served from news.html; news/index.html is redirected to /news/');
	assert.deepEqual(report.compressedCopies, ['docs/index.html.gz']);
	assert.equal(report.files, 6);
	assert.equal(report.workerBytes, 'export default {}'.length);
});

test('the live check passes files served by Cloudflare and names a page the Worker rendered, a redirect and a chunk not sent as brotli', async () => {
	const end = '<!--markless:region-end-->';
	const page = '<!doctype html><script type="module" src="/build/app.js"></script>';
	const server = createServer((request, response) => {
		const url = request.url!;
		const asset = { 'content-type': 'text/html', 'cf-cache-status': 'HIT' };
		if (url === '/docs/') response.writeHead(200, asset).end(page);
		else if (url === '/_markless/fragment/docs/') response.writeHead(200, asset).end(`<main></main>${end}`);
		else if (url === '/news') response.writeHead(200, { 'content-type': 'text/html' }).end(page);
		else if (url === '/_markless/fragment/news') response.writeHead(307, { location: '/_markless/fragment/news/' }).end();
		else if (url === '/build/app.js') response.writeHead(200, { 'content-type': 'text/javascript', 'cache-control': 'public, max-age=31536000, immutable' }).end('x');
		else response.writeHead(404).end();
	});
	await new Promise<void>((listening) => server.listen(0, '127.0.0.1', listening));
	const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
	try {
		const options = { fragmentPath: '/_markless/fragment', fragmentMarkers: [end] };
		const findings = await checkCloudflareLive(origin, ['/docs/', '/news'], options);
		assert.deepEqual(
			findings.map((f) => `${f.url} ${f.problem.split(':')[0]}`),
			['/news ran the Worker', '/_markless/fragment/news answered 307 to /_markless/fragment/news/, not 200', '/build/app.js arrived as uncompressed, not its brotli copy'],
		);
	} finally {
		server.close();
	}
});
