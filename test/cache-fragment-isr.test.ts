import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { applyCaching } from '../src/cache/apply.ts';
import { classify } from '../src/cache/classify.ts';
import type { RouteEvidence } from '../src/cache/evidence.ts';
import { missingIsrFunctions } from '../src/cache/output.ts';
import type { CachingPlan } from '../src/cache/plan.ts';

const evidence = (route: string): RouteEvidence => {
	const facts = { status: 200, contentType: 'text/html', vary: [], setCookies: [], bodyHash: 'a', ttfbMs: 10 };
	return { route, first: facts, second: facts };
};

async function app(installed: boolean): Promise<{ dir: string; plan: CachingPlan }> {
	const dir = await mkdtemp(join(tmpdir(), 'mm-fragment-isr-'));
	await mkdir(join(dir, 'pages/docs'), { recursive: true });
	await writeFile(join(dir, 'pages/docs/index.tsrx'), 'export default function Page() { return <p>docs</p>; }\n');
	await writeFile(join(dir, 'vite.config.ts'), "export default { plugins: [] };\n");
	await writeFile(join(dir, 'package.json'), JSON.stringify({ dependencies: { '@markless/router': '0.9.0', nitro: '3.0.260903-beta' } }));
	if (installed) {
		await mkdir(join(dir, 'node_modules/@markless/router/dist'), { recursive: true });
		await writeFile(join(dir, 'node_modules/@markless/router/package.json'), '{"version":"0.9.0"}');
		await writeFile(join(dir, 'node_modules/@markless/router/dist/vite.js'), 'const FRAGMENT_PATH_PREFIX = "/_markless/fragment";\n');
		await mkdir(join(dir, 'node_modules/nitro'), { recursive: true });
		await writeFile(join(dir, 'node_modules/nitro/package.json'), '{"version":"3.0.260903-beta"}');
	}
	const e = evidence('/docs');
	return { dir, plan: { version: 1, origin: 'http://old', generatedAt: '', routes: [classify({ evidence: e })], hashedAssets: [], evidence: [e] } };
}

test('cache apply refuses an app whose router is not installed, since without it no page\'s fragment URL is cached and every navigation runs a function', async () => {
	const { dir, plan } = await app(false);
	await assert.rejects(applyCaching(plan, dir, { '/docs': 'pages/docs/index.tsrx' }), /@markless\/router, nitro .*not installed.*install the app's dependencies/);
});

test('cache apply with the router installed caches each page\'s fragment URL as the page is', async () => {
	const { dir, plan } = await app(true);
	const result = await applyCaching(plan, dir, { '/docs': 'pages/docs/index.tsrx' });
	assert.equal(result.fragmentPath, '/_markless/fragment');
	assert.match(await readFile(result.module, 'utf8'), /"\/_markless\/fragment\/docs": \{/);
});

test('a Vercel build is red when a cached page or its fragment URL has no ISR function or static file', async () => {
	const out = await mkdtemp(join(tmpdir(), 'mm-vercel-output-'));
	await mkdir(join(out, 'functions/docs'), { recursive: true });
	await mkdir(join(out, 'functions/docs-isr.func'), { recursive: true });
	await mkdir(join(out, 'functions/docs/components-isr.func'), { recursive: true });
	await mkdir(join(out, 'static/about'), { recursive: true });
	await writeFile(join(out, 'static/about/index.html'), '<p>about</p>');
	await mkdir(join(out, 'functions/_markless/fragment/docs/components-isr.func'), { recursive: true });
	const rules = {
		'/docs': { isr: { expiration: 60 } },
		'/_markless/fragment/docs': { isr: { expiration: 60 } },
		'/docs/components': { isr: { expiration: 60 } },
		'/_markless/fragment/docs/components': { isr: { expiration: 60 } },
		'/about': { prerender: true },
		'/account': { isr: false, headers: { 'cache-control': 'private, no-store' } },
		'/build/**': { headers: { 'cache-control': 'public, max-age=31536000, immutable' } },
	};
	assert.deepEqual(await missingIsrFunctions(out, rules), ['/_markless/fragment/docs']);
});
