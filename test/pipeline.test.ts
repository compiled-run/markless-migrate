import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdir, mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { codeClosure, copiedParts, deal, importsOf, partsKeys, pruneStore, recordHits, refreshParts, report } from '../scripts/pipeline.ts';

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

test('the report gives each stage its wall time from first start to last end, its runner time, its receipts, and the run end to end', () => {
	const job = (name: string, start: string, end: string, conclusion = 'success') => ({ name, conclusion, started_at: `2026-10-30T10:${start}Z`, completed_at: `2026-10-30T10:${end}Z` });
	const text = report(
		[
			{ stage: 'capture', hits: 1020, misses: 10 },
			{ stage: 'build', hit: 'no', seconds: 300 },
		],
		[job('prepare', '00:00', '04:00'), job('capture (1)', '04:10', '09:10'), job('capture (2)', '04:10', '07:10'), { name: 'emit', conclusion: 'skipped', started_at: null, completed_at: null }, job('build', '09:20', '19:20'), job('check / check (1)', '20:00', '30:00')],
		[['keys and plan', 'prepare'], ['capture', 'capture'], ['emit', 'emit'], ['build', 'build'], ['check', 'check /'], ['deploy', 'deploy']],
	);
	assert.match(text, /^End to end: 30:00 /);
	assert.match(text, /\| capture \| 5:00 \| 2 jobs, 8:00 \| success \| hits 1020, misses 10 \|/);
	assert.match(text, /\| emit \| – \| – \| skipped \|/);
	assert.match(text, /\| build \| 10:00 \| 10:00 \| success \| hit no, seconds 300 \|/);
	assert.match(text, /\| check \| 10:00 \|/);
	assert.match(text, /\| deploy \| – \| – \| not in this run \|/);
});

test('stages that share a job are timed by their own receipts, one that wrote none is skipped, and the last stage end closes the run', () => {
	const job = (name: string, start: string, end: string | null) => ({ name, conclusion: end ? 'success' : null, started_at: `2026-10-30T10:${start}Z`, completed_at: end && `2026-10-30T10:${end}Z` });
	const ended = (t: string) => Date.parse(`2026-10-30T10:${t}Z`) / 1000;
	const text = report(
		[
			{ stage: 'emit', converted: 'kept (run 7)' },
			{ stage: 'emit', 'stage-seconds': 120, ended: ended('11:20'), result: 'success' },
			{ stage: 'build', hit: 'no', seconds: 300 },
			{ stage: 'build', 'stage-seconds': 600, ended: ended('21:20'), result: 'failure' },
			{ stage: 'deploy', 'stage-seconds': 60, ended: ended('35:30'), result: 'success' },
		],
		[job('prepare', '00:00', '04:00'), job('capture (1)', '04:10', '09:10'), job('assemble', '09:20', '23:00'), job('check / check (1)', '24:00', '34:00'), job('finish', '34:10', null)],
	);
	assert.match(text, /^End to end: 35:30 /);
	assert.match(text, /\| emit \| 2:00 \| 2:00 \| success \| converted kept \(run 7\) \|/);
	assert.match(text, /\| build \| 10:00 \| 10:00 \| failure \| hit no, seconds 300 \|/);
	assert.match(text, /\| check select \| – \| – \| skipped \|  \|/);
	assert.match(text, /\| check \| 10:00 \| 10:00 \| success \|/);
	assert.match(text, /\| deploy \| 1:00 \| 1:00 \| success \|/);
});
