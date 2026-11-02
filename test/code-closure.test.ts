// A key over a module graph changes when any module in it does, and only then: the recorder's kinds and the checker are keyed this way.
import assert from 'node:assert/strict';
import { appendFile, cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { closureOf, codeKey, keyOf, ROOT, usedBy } from '../src/code-closure.ts';
import type { N } from '../src/source/js.ts';

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

test("one branch of a module is keyed by its text, the declarations it reaches and the modules they import, not by the module's other branches", async () => {
	const cli = [
		"import { one } from './one.ts';",
		"import { two } from './two.ts';",
		'const helper = () => one();',
		'const unused = () => two();',
		'async function main(command: string) {',
		'\tconst start = Date.now();',
		'\tswitch (command) {',
		"\t\tcase 'one':",
		'\t\t\treturn helper() + start;',
		"\t\tcase 'two':",
		'\t\t\treturn two();',
		'\t}',
		'}',
		'await main(process.argv[2]!);',
	].join('\n');
	const root = await tree({ 'cli.ts': cli, 'one.ts': 'export const one = () => 1;', 'two.ts': 'export const two = () => 2;' });
	const file = join(root, 'cli.ts');
	const key = async () => {
		const used = await usedBy(file, (program) => {
			const main = program.body.find((s: N) => s.type === 'FunctionDeclaration') as N;
			return { within: main, nodes: main.body.body.flatMap((s: N) => (s.type === 'SwitchStatement' ? [s.discriminant, ...s.cases.filter((c: N) => c.test?.value === 'one')] : [s])) };
		});
		return { files: (await closureOf([], { edges: used.edges })).files.map((f) => relative(root, f)), key: await keyOf(await closureOf([], { edges: used.edges }), { text: used.text }) };
	};
	try {
		const base = await key();
		assert.deepEqual(base.files, ['one.ts']);
		const edit = async (from: string, to: string) => {
			await writeFile(file, cli.replace(from, to));
			const after = (await key()).key;
			await writeFile(file, cli);
			return after;
		};
		assert.equal(await edit('return two();', 'return two() + 1;'), base.key, 'another branch');
		assert.equal(await edit('const unused = () => two();', 'const unused = () => two() + 1;'), base.key, 'a declaration the branch never reaches');
		assert.notEqual(await edit('return helper() + start;', 'return helper() + start + 1;'), base.key, 'the branch itself');
		assert.notEqual(await edit('const helper = () => one();', 'const helper = () => one() + 1;'), base.key, 'a declaration it reaches');
		assert.notEqual(await edit('const start = Date.now();', 'const start = 0;'), base.key, 'what runs before the switch');
		assert.notEqual(await edit('await main(process.argv[2]!);', 'await main(process.argv[3]!);'), base.key, 'top-level effects');
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

// The repository's own code, copied, so each of its files can be edited in turn without touching the checkout.
async function copyRepo(): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), 'code-closure-repo-'));
	for (const path of ['src', 'parts', 'package.json']) await cp(join(ROOT, path), join(root, path), { recursive: true });
	await symlink(join(ROOT, 'node_modules'), join(root, 'node_modules'));
	return root;
}

test("editing any module of a recording kind's graph records that kind again, and the orchestration and other kinds' modules leave it", async () => {
	const root = await copyRepo();
	try {
		const recording = (await import(pathToFileURL(join(root, 'src/convert/record-key.ts')).href)) as typeof import('../src/convert/record-key.ts');
		const copy = (await import(pathToFileURL(join(root, 'src/code-closure.ts')).href)) as typeof import('../src/code-closure.ts');
		const base = await recording.recorderVersions();
		for (const kind of Object.keys(recording.RECORDING_KINDS) as (keyof typeof recording.RECORDING_KINDS)[]) {
			const closure = await copy.closureOf(recording.recorderEntries(kind));
			if (kind === 'rac-calendars') {
				assert.ok(closure.unresolved.length, 'rac-calendar.ts loads the old app\'s calendar messages by a computed path');
				continue;
			}
			assert.deepEqual(closure.unresolved, []);
			const key = await copy.keyOf(closure);
			for (const file of closure.files) {
				const before = await readFile(file);
				await appendFile(file, '\n');
				assert.notEqual(await copy.keyOf(closure), key, `${kind}: ${relative(root, file)} is keyed`);
				await writeFile(file, before);
			}
		}
		const after = async (file: string) => {
			const before = await readFile(join(root, file));
			await appendFile(join(root, file), '\n');
			const v = await recording.recorderVersions();
			await writeFile(join(root, file), before);
			return Object.keys(v).filter((k) => v[k as keyof typeof v] !== base[k as keyof typeof base] && k !== 'rac-calendars').sort();
		};
		assert.deepEqual(await after('src/convert/tanstack-table.ts'), ['tables']);
		assert.deepEqual(await after('src/convert/reveal.ts'), ['choices', 'day-pickers', 'reveals', 'toggles']);
		assert.deepEqual(await after('src/convert/index.ts'), []);
		assert.ok((await after('src/convert/dom.ts')).includes('captures'));
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});
