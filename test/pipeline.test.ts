import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { captureCosts, capturedKeys, codeClosure, originalScripts, scriptSources, copiedParts, deal, importsOf, partsKeys, PLAN_ENTRIES, pruneStore, recordHits, refreshParts, report } from '../scripts/pipeline.ts';

async function tree(files: Record<string, string>): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), 'pipeline-'));
	for (const [path, text] of Object.entries(files)) {
		await mkdir(dirname(join(root, path)), { recursive: true });
		await writeFile(join(root, path), text);
	}
	return root;
}

test('a module loads what it imports, re-exports, imports dynamically or opens through import.meta.url, and nothing a string merely mentions', () => {
	const source = [
		`import { a } from './a.ts';`,
		`import type { B } from "../b.ts";`,
		`export * from './c.ts';`,
		`import './side.ts';`,
		`const d = await import('./d.ts');`,
		`const data = new URL('./data.json', import.meta.url);`,
		`import { x } from 'node:fs';`,
		`const generated = "import * as port0 from '\${from}/radix.ts'";`,
	].join('\n');
	assert.deepEqual(importsOf(source), ['./a.ts', '../b.ts', './c.ts', './side.ts', './d.ts', './data.json']);
});

test('a code closure follows relative imports through every file, once, and skips a directory URL and a missing file', async () => {
	const root = await tree({
		'src/entry.ts': `import './one.ts';\nconst parts = new URL('../parts/', import.meta.url);\nimport './gone.ts';`,
		'src/one.ts': `export * from './two.ts';\nimport '../parts/used.ts';`,
		'src/two.ts': `import './one.ts';`,
		'parts/used.ts': '',
		'parts/copied.ts': '',
	});
	const files = (await codeClosure([join(root, 'src/entry.ts')])).map((f) => f.slice(root.length + 1));
	assert.deepEqual(files, ['parts/used.ts', 'src/entry.ts', 'src/one.ts', 'src/two.ts']);
});

test('the base parts key ignores the bytes of a copied part but not whether it mounts, nor the bytes of a part the converter imports', async () => {
	const root = await tree({ 'parts/menu.ts': 'export function mount() { return 1; }\n', 'parts/clock.ts': 'export const A = 1;\n' });
	const converter = new Set([join(root, 'parts/clock.ts')]);
	const before = await partsKeys(join(root, 'parts'), converter);
	await writeFile(join(root, 'parts/menu.ts'), 'export function mount() { return 2; }\n');
	const edited = await partsKeys(join(root, 'parts'), converter);
	assert.equal(edited.base, before.base);
	assert.notEqual(edited.full, before.full);
	await writeFile(join(root, 'parts/menu.ts'), 'export const mount = () => 2;\n');
	assert.notEqual((await partsKeys(join(root, 'parts'), converter)).base, before.base, 'a port that stops mounting leaves the registries');
	await writeFile(join(root, 'parts/menu.ts'), 'export function mount() { return 1; }\n');
	await writeFile(join(root, 'parts/clock.ts'), 'export const A = 2;\n');
	assert.notEqual((await partsKeys(join(root, 'parts'), converter)).base, before.base, 'emit runs this part');
	await writeFile(join(root, 'parts/new.ts'), '');
	assert.notEqual((await partsKeys(join(root, 'parts'), converter)).full, before.full);
});

test('refreshing the copied parts makes the app hold what a new emit would copy, and leaves generated files alone', async () => {
	const root = await tree({
		'parts/radix/dialog.ts': 'old dialog',
		'parts/index.ts': 'index',
		'parts/choices.ts': 'the source choices',
		'app/lib/parts/radix/dialog.ts': 'old dialog',
		'app/lib/parts/index.ts': 'index',
		'app/lib/parts/choices.ts': 'export const CHOICES = {}',
		'app/lib/parts/registries/abc.ts': 'registry',
	});
	const list = await copiedParts(join(root, 'app'), join(root, 'parts'));
	assert.deepEqual(list, ['index.ts', 'radix/dialog.ts']);
	await writeFile(join(root, 'parts/radix/dialog.ts'), 'fixed dialog');
	await writeFile(join(root, 'parts/choices.ts'), 'changed source choices');
	assert.equal(await refreshParts(join(root, 'app'), join(root, 'parts'), list), 1);
	assert.equal(await readFile(join(root, 'app/lib/parts/radix/dialog.ts'), 'utf8'), 'fixed dialog');
	assert.equal(await readFile(join(root, 'app/lib/parts/choices.ts'), 'utf8'), 'export const CHOICES = {}');
	await assert.rejects(refreshParts(join(root, 'app'), join(root, 'parts'), ['gone.ts']), /needs a full emit/);
});

const KEY_A = 'A'.repeat(43);
const KEY_B = 'B'.repeat(43);
const KEY_C = 'C'.repeat(43);

test('a page is recorded already when its capture is held under its current key, or in flat files made from that key', async () => {
	const store = await tree({ [`captures/${KEY_A}/page.json`]: '{}', [`reveals/${KEY_B}/x.json`]: '{}', 'sources.json': JSON.stringify({ flat: { '/flat': KEY_C, '/moved': KEY_A } }) });
	const keys = new Map([
		['/a', KEY_A],
		['/b', KEY_B],
		['/flat', KEY_C],
		['/moved', KEY_B],
		['/down', 'unreachable-1234abcd'],
	]);
	assert.deepEqual(await recordHits(keys, store), { hits: ['/a', '/flat'], misses: ['/b', '/moved', '/down'] });
	assert.deepEqual(await recordHits(keys, join(store, 'none')), { hits: [], misses: ['/a', '/b', '/flat', '/moved', '/down'] });
});

test('pruning keeps the recordings of current keys and flat files, and drops every other keyed directory', async () => {
	const store = await tree({ [`captures/${KEY_A}/p.json`]: '', [`captures/${KEY_B}/p.json`]: '', [`reveals/${KEY_B}/p.json`]: '', 'captures/flat.json': '', 'captures/unreachable-00ff/p.json': '', 'sources.json': '{}' });
	assert.deepEqual(await pruneStore(store, new Set([KEY_A])), { kept: 1, dropped: 3 });
	assert.deepEqual((await readdir(join(store, 'captures'))).sort(), [KEY_A, 'flat.json']);
	assert.deepEqual(await readdir(join(store, 'reveals')), []);
});

test('pages are dealt into at most n shards, none empty, and none at all when every page is held', () => {
	assert.deepEqual(deal(['a', 'b', 'c'], 2), [['a', 'c'], ['b']]);
	assert.deepEqual(deal(['a'], 24), [['a']]);
	assert.deepEqual(deal([], 24), []);
});

test("pages are packed longest first by their last capture's cost, so no shard is left with every slow page", async () => {
	const costs = new Map([['/docs/a', 900], ['/docs/b', 100], ['/docs/c', 400], ['/docs/d', 400], ['/docs/e', 300]]);
	const shards = deal(['/docs/a', '/docs/b', '/docs/c', '/docs/d', '/docs/e', '/new'], 2, costs);
	assert.deepEqual(shards.map((s) => s.reduce((sum, r) => sum + (costs.get(r) ?? 400), 0)).sort(), [1200, 1300]);
	const store = await mkdtemp(join(tmpdir(), 'pipeline-costs-'));
	try {
		await mkdir(join(store, 'costs'));
		await writeFile(join(store, 'costs', 'a.json'), JSON.stringify({ route: '/docs/a', seconds: 900 }));
		await writeFile(join(store, 'costs', 'broken.json'), '{');
		assert.deepEqual([...(await captureCosts(store))], [['/docs/a', 900]]);
		assert.deepEqual([...(await captureCosts(join(store, 'none')))], []);
	} finally {
		await rm(store, { recursive: true, force: true });
	}
});

test('the report gives each stage its wall time from first start to last end, its runner time, its receipts, and the run end to end', () => {
	const job = (name: string, start: string, end: string, conclusion = 'success') => ({ name, conclusion, started_at: `2026-10-30T10:${start}Z`, completed_at: `2026-10-30T10:${end}Z` });
	const text = report(
		[
			{ stage: 'capture', hits: 1020, misses: 10 },
			{ stage: 'build', hit: 'no', seconds: 300 },
		],
		[job('prepare', '00:00', '04:00'), job('capture (1)', '04:10', '09:10'), job('capture (2)', '04:10', '07:10'), { name: 'emit', conclusion: 'skipped', started_at: null, completed_at: null }, job('build', '09:20', '19:20'), job('check / check (1)', '20:00', '30:00')],
	);
	assert.match(text, /^End to end: 30:00 /);
	assert.match(text, /\| capture \| 5:00 \| 2 jobs, 8:00 \| success \| hits 1020, misses 10 \|/);
	assert.match(text, /\| emit \| – \| – \| skipped \|/);
	assert.match(text, /\| build \| 10:00 \| 10:00 \| success \| hit no, seconds 300 \|/);
	assert.match(text, /\| check \| 10:00 \|/);
	assert.match(text, /\| deploy \| – \| – \| not in this run \|/);
});

test("the plan's key reads the planner's code, not the CLI that hands it its arguments", async () => {
	const root = join(import.meta.dirname, '..');
	const files = (await codeClosure(PLAN_ENTRIES.map((f) => join(root, f)))).map((f) => f.slice(root.length + 1));
	assert.ok(files.includes('src/plan/inventory.ts') && files.includes('src/cache/cli.ts') && files.includes('src/usage/index.ts'));
	assert.ok(!files.includes('src/cli.ts'));
	assert.ok(!files.includes('src/convert/index.ts') && !files.includes('src/convert/reveal.ts'), 'a change to the emit or the recorder keeps the plan');
});

test("a run's own captures give each route the key it was recorded under, read from the capture itself", async () => {
	const store = await tree({ [`captures/${KEY_A}/x.json`]: JSON.stringify({ route: '/a', status: 200 }), [`captures/${KEY_B}/y.json`]: JSON.stringify({ route: '/b' }), [`reveals/${KEY_C}/z.json`]: JSON.stringify({ route: '/c' }), 'captures/flat.json': JSON.stringify({ route: '/flat' }) });
	assert.deepEqual([...(await capturedKeys(store))], [['/a', KEY_A], ['/b', KEY_B]]);
	assert.deepEqual([...(await capturedKeys(join(store, 'none')))], []);
});

test("no port page, static or an ISR fallback, loads a script the original's pages loaded", async () => {
	const out = await tree({
		'.vercel/output/static/docs/index.html': '<head><script type="module" src="/build/chunk-A.js"></script></head>',
		'.vercel/output/static/_markless/fragment/charts/line/index.html': '<script src="/_next/static/chunks/abc.js" async=""></script>',
		'.vercel/output/functions/charts/line-isr.prerender-fallback.html': "<script async src='/_next/static/chunks/def.js?v=1'></script>",
		'.vercel/output/static/_next/static/chunks/abc.js': 'copied, never named by a page',
		'.output/public/charts/bar.html': '<link rel="stylesheet" href="/_next/static/chunks/x.used-1.css">',
	});
	const found = await originalScripts(out, new Set(['/_next/static/chunks/abc.js', '/_next/static/chunks/def.js']));
	assert.deepEqual(found, [
		{ page: '.vercel/output/functions/charts/line-isr.prerender-fallback.html', script: '/_next/static/chunks/def.js' },
		{ page: '.vercel/output/static/_markless/fragment/charts/line/index.html', script: '/_next/static/chunks/abc.js' },
	]);
});

test("a page's scripts include those an iframe's srcdoc loads and the original's scripts it preloads, and not its stylesheets", () => {
	const html = `<head><link rel="modulepreload" href="/_next/a.js"><link rel="preload" as="script" href="/_next/b.js?x"><link rel="stylesheet" href="/_next/c.css"><link rel="preload" as="font" href="/_next/f.woff2"></head><body><script type="module" src="/build/chunk-A.js"></script><iframe srcdoc="&lt;script src=&quot;/_next/d.js&quot;&gt;&lt;/script&gt;"></iframe><template><script src="/_next/e.js"></script></template></body>`;
	assert.deepEqual(scriptSources(html).sort(), ['/_next/a.js', '/_next/b.js', '/_next/d.js', '/_next/e.js', '/build/chunk-A.js']);
});
