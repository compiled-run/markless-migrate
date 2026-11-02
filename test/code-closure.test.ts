// A key over a module graph changes when any module in it does, and only then: the recorder's kinds and the checker are keyed this way.
import assert from 'node:assert/strict';
import { appendFile, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { test } from 'node:test';
import { closureOf, codeKey, keyOf, moduleEdges, ROOT } from '../src/code-closure.ts';

async function tree(files: Record<string, string>): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), 'code-closure-'));
	for (const [path, text] of Object.entries(files)) {
		await mkdir(dirname(join(root, path)), { recursive: true });
		await writeFile(join(root, path), text);
	}
	await symlink(join(ROOT, 'node_modules'), join(root, 'node_modules'));
	return root;
}

const FIXTURE = {
	'a.ts': ["import type { T } from './t.ts';", "import { b } from './b.ts';", "import { join } from 'node:path';", "import { parse } from 'yuku';", "export * from './c.ts';", "export type { U } from './u.ts';", "export const d = () => import('./d.ts');", "export const f = new URL('./f.json', import.meta.url);", "export const g = join(import.meta.dirname, 'g', 'h.txt');", 'export const all = [b, parse] as unknown as T;'].join('\n'),
	'b.ts': "export { e } from './e.mjs';\nexport const b = 1;",
	'c.ts': 'export const c = 2;',
	'd.ts': "const r = require('./r.cjs');\nexport default r;",
	'e.mjs': 'export const e = 3;',
	'r.cjs': 'module.exports = 4;',
	'f.json': '{}',
	'g/h.txt': 'data',
	't.ts': 'export type T = string;',
	'u.ts': 'export type U = number;',
	'other.ts': 'export const other = 5;',
};

test('the graph follows imports, re-exports, dynamic imports, requires and the files a module opens beside itself, and leaves out type-only imports', async () => {
	const root = await tree(FIXTURE);
	try {
		const closure = await closureOf([join(root, 'a.ts')]);
		assert.deepEqual(closure.files.map((f) => relative(root, f)), ['a.ts', 'b.ts', 'c.ts', 'd.ts', 'e.mjs', 'f.json', 'g/h.txt', 'r.cjs']);
		assert.deepEqual(Object.keys(closure.packages), ['yuku']);
		assert.deepEqual(closure.unresolved, []);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test('changing any file of the graph changes its key; changing a type-only import or a file outside it does not', async () => {
	const root = await tree(FIXTURE);
	try {
		const entry = [join(root, 'a.ts')];
		const base = await codeKey(entry);
		assert.equal(await codeKey(entry), base, 'the same code, the same key');
		for (const file of (await closureOf(entry)).files) {
			const before = await readFile(file);
			await appendFile(file, '\n');
			assert.notEqual(await codeKey(entry), base, `${relative(root, file)} is keyed`);
			await writeFile(file, before);
		}
		for (const file of ['t.ts', 'u.ts', 'other.ts']) {
			await appendFile(join(root, file), '\n// edited');
			assert.equal(await codeKey(entry), base, `${file} is not in the graph`);
		}
		assert.notEqual(await codeKey(entry, { version: '2' }), base, 'an extra part is keyed');
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test('a load the graph cannot name makes a key that never matches; a computed bare specifier stands for every package the repository depends on', async () => {
	const root = await tree({ 'a.ts': 'export const load = (name: string) => import(name);', 'b.ts': 'export const load = (name: string) => import(`${name}/package.json`);', 'c.ts': "export const load = (name: string) => import(`./plugins/${name}.ts`);", 'plugins/x.ts': 'export const x = 1;' });
	try {
		const a = await closureOf([join(root, 'a.ts')]);
		assert.match(a.unresolved[0]!, /computed specifier/);
		assert.notEqual(await keyOf(a), await keyOf(a));
		const b = await closureOf([join(root, 'b.ts')]);
		assert.deepEqual(b.unresolved, []);
		assert.ok('yuku' in b.packages && 'playwright' in b.packages);
		assert.deepEqual((await closureOf([join(root, 'c.ts')])).files.map((f) => relative(root, f)), ['c.ts', 'plugins/x.ts'], 'a computed relative specifier stands for its folder');
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("a folder a module reads as data is keyed by what it reads of it, and only for that module", async () => {
	const root = await tree({ 'a.ts': "export const dir = new URL('./data/', import.meta.url);", 'b.ts': "export const dir = new URL('./data/', import.meta.url);", 'data/x.txt': 'x' });
	try {
		const digest = { dir: join(root, 'data'), by: relative(ROOT, join(root, 'a.ts')), read: async () => 'what a reads' };
		const a = await closureOf([join(root, 'a.ts')], { dirs: [digest] });
		assert.deepEqual(a.files.map((f) => relative(root, f)), ['a.ts']);
		assert.deepEqual(Object.values(a.dirs), ['what a reads']);
		const b = await closureOf([join(root, 'b.ts')], { dirs: [digest] });
		assert.deepEqual(b.files.map((f) => relative(root, f)), ['b.ts', 'data/x.txt'], 'another module reading the folder reads it whole');
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test('a file a module opens beside itself is marked as read, not loaded', async () => {
	const root = await tree(FIXTURE);
	try {
		const { edges } = await moduleEdges(join(root, 'a.ts'));
		assert.deepEqual(edges.filter((e) => e.read).map((e) => e.spec), ['./f.json', './g/h.txt']);
		assert.ok(edges.filter((e) => !e.read).some((e) => e.spec === './b.ts'));
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});
