// Each kind of a route's recordings is kept under a key of its old page, the code that records that kind (read from the
// module graph), and the data its recorder is handed: an edit records again exactly the kinds whose code it is in.
import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { test } from 'node:test';
import { analyze } from 'yuku/analyzer';
import { expectedStatus, unexpectedStatus } from '../src/check/expected-status.ts';
import { ROOT } from '../src/code-closure.ts';
import { HANDLES, INDEX, recordingFacts, STORE } from '../src/convert/record-facts.ts';
import { FORMAT, givenDigest, oldPageSource, OPTIONS_READ, pageKey, pageStatus, readVisits, RECORDING_VERSION, recordDirKey, RecordDirs, recordingVersions, UNKEYED_INPUTS, VISITS, type KindVersion } from '../src/convert/record-key.ts';

// Every version below is read for one old site; without one, nothing is ever read back (its own test).
process.env.MIGRATE_ORIGINAL_ID = 'test-original';

test("a page's key carries its status and ignores the order of its head's meta and title tags, and nothing else", () => {
	const page = (head: string, body = '<p>x</p>') => `<!doctype html><html><head>${head}</head><body>${body}</body></html>`;
	const o = 'http://localhost:4000';
	assert.equal(pageKey(o, '/', 200, page('<meta name="a"/><meta name="b"/><title>T</title>')), pageKey(o, '/', 200, page('<title>T</title><meta name="b"/><meta name="a"/>')));
	assert.notEqual(pageKey(o, '/', 200, page('<link rel="stylesheet" href="a.css"><link rel="stylesheet" href="b.css">')), pageKey(o, '/', 200, page('<link rel="stylesheet" href="b.css"><link rel="stylesheet" href="a.css">')), "stylesheets' order is the cascade's");
	assert.notEqual(pageKey(o, '/', 200, page('<meta name="a"/>')), pageKey(o, '/', 200, page('<meta name="c"/>')));
	assert.notEqual(pageKey(o, '/', 200, page('')), pageKey(o, '/', 200, page('', '<p>y</p>')));
	assert.notEqual(pageKey(o, '/', 200, page('')), pageKey(o, '/b', 200, page('')));
	assert.notEqual(pageKey(o, '/', 200, page('')), pageKey('http://localhost:4001', '/', 200, page('')));
	assert.equal(pageStatus(pageKey(o, '/', 404, page(''))), 404);
	assert.equal(pageStatus('unreachable-1234abcd'), undefined);
	assert.equal(oldPageSource(200, '<p>no head</p>'), '200\n<p>no head</p>');
});

test('what a recorder is handed is keyed by its data, in any key order; a handle at the top counts by place, and a function or class inside is refused', () => {
	assert.equal(givenDigest([{ a: 1, b: ['x', { c: true }] }]), givenDigest([{ b: ['x', { c: true }], a: 1 }]));
	assert.notEqual(givenDigest([{ a: 1 }]), givenDigest([{ a: 2 }]));
	assert.notEqual(givenDigest(['ab', 'c']), givenDigest(['a', 'bc']));
	assert.notEqual(givenDigest([1]), givenDigest(['1']));
	assert.notEqual(givenDigest([undefined]), givenDigest([]));
	assert.notEqual(givenDigest([{ a: undefined }]), givenDigest([{}]));
	// eslint-disable-next-line no-sparse-arrays
	assert.notEqual(givenDigest([[, 1]]), givenDigest([[1, ,]]), 'a hole counts by its place');
	assert.equal(givenDigest([() => 1, 'x']), givenDigest([() => 2, 'x']), 'a log or a limit handed at the top is no data');
	assert.notEqual(givenDigest([() => 1, 'x']), givenDigest(['x']));
	assert.equal(givenDigest([new Map([['b', 1], ['a', 2]])]), givenDigest([new Map([['a', 2], ['b', 1]])]));
	assert.throws(() => givenDigest([{ pick: () => true }]), /function inside argument 1\.pick/);
	assert.throws(() => givenDigest([new Date(0)]), /Date instance/);
	const cycle: Record<string, unknown> = {};
	cycle.self = cycle;
	assert.throws(() => givenDigest([cycle]), /cycle/);
});

test("a directory is keyed by its kind, that kind's version, the page and what the recorder is handed; a kind with no version is refused", () => {
	const v = { toggles: 'v1', reveals: 'v1' };
	const key = recordDirKey(v, 'toggles', 'page', ['<html>']);
	assert.match(key, /^[\w-]{43}$/);
	assert.equal(recordDirKey(v, 'toggles', 'page', ['<html>']), key);
	assert.notEqual(recordDirKey(v, 'reveals', 'page', ['<html>']), key);
	assert.notEqual(recordDirKey({ ...v, toggles: 'v2' }, 'toggles', 'page', ['<html>']), key);
	assert.notEqual(recordDirKey(v, 'toggles', 'page2', ['<html>']), key);
	assert.notEqual(recordDirKey(v, 'toggles', 'page', ['<html >']), key, 'the settled page a toggle is handed is part of its key');
	assert.throws(() => recordDirKey(v, 'clock', 'page', []), /no recorder version for the recording kind clock/);
});

async function tree(files: Record<string, string>): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), 'record-dirs-'));
	for (const [path, text] of Object.entries(files)) {
		await mkdir(join(root, path, '..'), { recursive: true });
		await writeFile(join(root, path), text);
	}
	return root;
}

test('a store of another format is emptied of every recording once, never half read; what is not a recording stays', async () => {
	const root = await tree({ 'reveals/flat.json': '{}', [`captures/${'A'.repeat(43)}/x.json`]: '{}', 'sources.json': '{"flat":{"/a":"k"}}', 'costs/c.json': '{}', 'shared-css.json': '{}', 'visits/v.json': '{}' });
	try {
		const dirs = await RecordDirs.open(root, { captures: 'v' });
		assert.deepEqual((await readdir(root)).sort(), ['costs', FORMAT, 'shared-css.json'].sort());
		assert.deepEqual(JSON.parse(await readFile(join(root, FORMAT), 'utf8')), { version: RECORDING_VERSION });
		const staged = await dirs.stage('/a', 'page', 'captures', []);
		await writeFile(join(staged.dir, 'x.json'), '{}');
		await staged.commit();
		await dirs.save();
		await RecordDirs.open(root, { captures: 'v' });
		const kept = await dirs.stage('/a', 'page', 'captures', []);
		assert.deepEqual(await readdir(kept.dir), ['x.json'], 'a store of this format is read as it is');
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test('a recording is kept only once its recorder succeeds: a failed one leaves no directory and no visit', async () => {
	const root = await mkdtemp(join(tmpdir(), 'record-dirs-'));
	try {
		const dirs = await RecordDirs.open(root, { captures: 'c1' });
		const failed = await dirs.stage('/a', 'page', 'captures', []);
		await writeFile(join(failed.dir, 'half.json'), '{');
		await failed.abandon();
		await dirs.save();
		assert.deepEqual(await readdir(join(root, 'captures')), [], 'nothing of the failed recording is in the store');
		assert.deepEqual(await readVisits(root), [], 'no visit names it, so the page is recorded again');
		const one = await dirs.stage('/a', 'page', 'captures', ['x']);
		const two = await dirs.stage('/a', 'page', 'captures', ['x']);
		await writeFile(join(one.dir, 'one.json'), '{}');
		await writeFile(join(two.dir, 'two.json'), '{}');
		await one.commit();
		await two.commit();
		assert.deepEqual((await readdir(join(root, 'captures'))).length, 1);
		assert.deepEqual((await readdir(join(root, 'captures', recordDirKey({ captures: 'c1' }, 'captures', 'page', ['x'])))).sort(), ['one.json', 'two.json'], 'two recorders of one key keep both files');
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("a route's visit names the directories each kind used; a kind not recorded this run is kept from the last visit only at the same page and version", async () => {
	const root = await mkdtemp(join(tmpdir(), 'record-dirs-'));
	const kept = async (dirs: RecordDirs, route: string, page: string, kind: string, given: readonly unknown[]) => {
		const staged = await dirs.stage(route, page, kind, given);
		await staged.commit();
		return join(root, kind, recordDirKey(currentVersions, kind, page, given));
	};
	let currentVersions: Record<string, string> = { captures: 'c1', otps: 'o1', toggles: 't1' };
	try {
		const first = await RecordDirs.open(root, currentVersions);
		const c = await kept(first, '/a', 'page', 'captures', []);
		const o = await kept(first, '/a', 'page', 'otps', []);
		const t1 = await kept(first, '/a', 'page', 'toggles', ['desktop']);
		const t2 = await kept(first, '/a', 'page', 'toggles', [['sel']]);
		assert.notEqual(t1, t2, 'two recorders of a kind handed different data write apart');
		await first.save();
		const [visit] = await readVisits(root);
		assert.deepEqual(visit, { route: '/a', page: 'page', kinds: { captures: { version: 'c1', dirs: [relative(join(root, 'captures'), c)] }, otps: { version: 'o1', dirs: [relative(join(root, 'otps'), o)] }, toggles: { version: 't1', dirs: [relative(join(root, 'toggles'), t1), relative(join(root, 'toggles'), t2)].sort() } } });
		currentVersions = { captures: 'c1', otps: 'o2', toggles: 't1' };
		const second = await RecordDirs.open(root, currentVersions);
		await kept(second, '/a', 'page', 'captures', []);
		await second.save();
		assert.deepEqual(Object.keys((await readVisits(root))[0]?.kinds ?? {}), ['captures', 'toggles'], 'otps at an old version and captures recorded again; toggles kept from the same page');
		const third = await RecordDirs.open(root, currentVersions);
		await kept(third, '/a', 'page2', 'captures', []);
		await third.save();
		assert.deepEqual(Object.keys((await readVisits(root))[0]?.kinds ?? {}), ['captures'], 'a changed page keeps nothing of its last visit');
		assert.equal((await readdir(join(root, VISITS))).length, 1);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test('every recording convert makes goes through record, each recorder attributed to its kind, and the module graph names every input', async () => {
	const facts = recordingFacts();
	assert.deepEqual(facts.problems, []);
	const kinds = Object.fromEntries([...facts.kinds].map(([k, v]) => [k, v.entries.map((e) => `${relative(ROOT, e.file)} ${e.name}`)]));
	assert.deepEqual(Object.keys(kinds).sort(), ['captures', 'choices', 'clock', 'day-pickers', 'form-libraries', 'otps', 'prefetch', 'rac-calendars', 'reveals', 'scenes', 'tables', 'toggles']);
	assert.ok(kinds.toggles?.includes('src/convert/toggles.ts captureToggles') && kinds.toggles.includes('src/convert/charts.ts captureCharts'));
	assert.deepEqual(kinds.choices, ['src/convert/choices.ts captureChoices'], 'the adapter that reorders its arguments leads to the recorder it calls');
	for (const o of facts.options) assert.ok(o in OPTIONS_READ, `options.${o} is read by the recording and no key holds it`);
	for (const p of facts.inputs) assert.ok(p === STORE || p.startsWith(`${STORE}/`) || p in UNKEYED_INPUTS || !p.includes('*'), p);
	assert.ok(facts.inputs.includes('lib/site/instance-props.json') && facts.inputs.includes('lib/site/controls.json'), 'what the recorders are set up from is an input');
	for (const [kind, v] of Object.entries(await recordingVersions())) assert.deepEqual(v.problems, [], kind);

	// Each function of src/convert a recording browser is handed: one index.ts imports is a recorder of a kind.
	const recorders = new Set(Object.values(kinds).flat());
	const index = analyze(await readFile(INDEX, 'utf8'), { path: INDEX });
	const imported = new Set(index.imports.filter((i) => !i.typeOnly && i.name).map((i) => `src/convert/${i.specifier.replace(/^\.\//, '')} ${i.name}`));
	for (const name of (await readdir(join(ROOT, 'src/convert'))).filter((f) => f.endsWith('.ts'))) {
		const file = join(ROOT, 'src/convert', name);
		const mod = analyze(await readFile(file, 'utf8'), { path: file });
		const browser = mod.imports.find((i) => i.specifier === 'playwright' && i.name === 'Browser')?.local;
		if (!browser) continue;
		for (const e of mod.exports) {
			const decl = e.local?.declarations[0];
			const fn = decl ? mod.parentOf(decl) : null;
			const first = fn?.type === 'FunctionDeclaration' ? fn.params[0] : undefined;
			const typeName = first?.type === 'Identifier' && first.typeAnnotation?.typeAnnotation.type === 'TSTypeReference' ? first.typeAnnotation.typeAnnotation.typeName : undefined;
			if (typeName?.type !== 'Identifier' || mod.referenceOf(typeName)?.binding?.id !== browser.id) continue;
			const id = `src/convert/${name} ${e.name}`;
			if (imported.has(id)) assert.ok(recorders.has(id), `${id} takes a browser and index.ts imports it, but records through no kind`);
		}
	}
});

test('without an old site id, no recording is read back', async () => {
	delete process.env.MIGRATE_ORIGINAL_ID;
	try {
		for (const v of Object.values(await recordingVersions())) assert.match(v.problems.join('\n'), /MIGRATE_ORIGINAL_ID names no old site/);
	} finally {
		process.env.MIGRATE_ORIGINAL_ID = 'test-original';
	}
});

// A convert of two kinds, a and b, over a small module graph: one file per sort of edge the key must follow.
const RECORD_DIRS = join(ROOT, 'src/convert/record-key.ts');
const host = (body: string, extra = '') => `import { join } from 'node:path';
import { RecordDirs } from '${RECORD_DIRS}';
import { recordA } from './rec-a.ts';
import { recordB } from './rec-b.ts';
${extra}
export async function convert(options: { app: string; old: string }) {
	const app = options.app;
	const log = (line: string) => void line;
	const dirs = await RecordDirs.open(join(app, '.migrate', 'convert'), {});
	const atFor = async (route: string, kind: string, given: readonly unknown[]) => dirs.stage(route, 'p', kind, given);
	const record = async (kind: string, recorder: Function, browser: unknown, route: string, ...given: unknown[]) => recorder(browser, options.old, route, (await atFor(route, kind, given)).dir, ...given);
${body}
}
`;
const graph: Record<string, string> = {
	'index.ts': host(`\tawait record('a', recordA, null, '/');\n\tawait record('b', recordB, null, '/');`),
	'rec-a.ts': `import { readFileSync } from 'node:fs';
import { reexported } from './barrel.ts';
import { starred } from './star-barrel.ts';
import * as ns from './ns.ts';
import { table } from './table.ts';
import { fromEnv } from './env-helper.ts';
import { both } from './shared.ts';
export async function recordA(page: { evaluate: (fn: () => unknown) => unknown }, origin: string, route: string, dir: string) {
	reexported();
	starred();
	ns.nsFn();
	table.go();
	fromEnv();
	both();
	page.evaluate(inPage);
	return [dir, readFileSync(new URL('./data.txt', import.meta.url), 'utf8')];
}
function inPage() {
	return document.title;
}
`,
	'rec-b.ts': `import { only } from './only-b.ts';
import { both } from './shared.ts';
export async function recordB(browser: unknown, origin: string, route: string, dir: string) {
	only();
	both();
	return [dir, import.meta.resolve('./inject.js')];
}
`,
	'barrel.ts': `export { reexported } from './impl.ts';\n`,
	'impl.ts': `export function reexported() {\n\treturn 1;\n}\n`,
	'star-barrel.ts': `export * from './starred.ts';\n`,
	'starred.ts': `export function starred() {\n\treturn 2;\n}\n`,
	'ns.ts': `export function nsFn() {\n\treturn 3;\n}\nexport function nsOther() {\n\treturn 4;\n}\n`,
	'table.ts': `function inner() {\n\treturn 5;\n}\nexport const table = { go: inner };\n`,
	'env-helper.ts': `import { env } from 'node:process';\nexport function fromEnv() {\n\treturn [process.env.FIXTURE_ONE, env.FIXTURE_TWO];\n}\n`,
	'shared.ts': `export function both() {\n\treturn 6;\n}\n`,
	'only-b.ts': `export function only() {\n\treturn 7;\n}\n`,
	'data.txt': 'data\n',
	'inject.js': 'window.injected = true;\n',
};

async function fixture(files: Record<string, string>): Promise<{ readonly dir: string; readonly versions: () => Promise<Record<string, KindVersion>> }> {
	const dir = await tree(files);
	return { dir, versions: () => recordingVersions(undefined, recordingFacts(join(dir, 'index.ts'))) };
}

test('an edit to code reached through each sort of edge changes exactly the kinds that run it (answers written by hand)', async () => {
	const { dir, versions } = await fixture(graph);
	try {
		const base = await versions();
		assert.deepEqual(Object.keys(base).sort(), ['a', 'b']);
		for (const [kind, v] of Object.entries(base)) assert.deepEqual(v.problems, [], kind);
		assert.deepEqual(base.a?.env, ['FIXTURE_ONE', 'FIXTURE_TWO'], 'process.env and node:process env, read in a helper');
		const changed = async (file: string, edit: (text: string) => string) => {
			const text = await readFile(join(dir, file), 'utf8');
			await writeFile(join(dir, file), edit(text));
			try {
				const after = await versions();
				return Object.keys(base).filter((k) => base[k]?.version !== after[k]?.version).sort();
			} finally {
				await writeFile(join(dir, file), text);
			}
		};
		const inside = (anchor: string) => (text: string) => text.replace(anchor, `${anchor} /* edit */`);
		const expected: [string, (t: string) => string, string[], string][] = [
			['impl.ts', inside('return 1;'), ['a'], 'a re-export'],
			['starred.ts', inside('return 2;'), ['a'], 'export *'],
			['ns.ts', inside('return 4;'), ['a'], 'a namespace import takes the whole module'],
			['table.ts', inside('return 5;'), ['a'], 'a function stored in an object and called through it'],
			['rec-a.ts', inside('return document.title;'), ['a'], 'a function the page evaluates'],
			['data.txt', (t) => `${t}more\n`, ['a'], 'a file read beside the module'],
			['env-helper.ts', inside('return [process.env.FIXTURE_ONE'), ['a'], 'a helper reading the environment'],
			['inject.js', (t) => `${t}// edit\n`, ['b'], 'a script named through import.meta.resolve'],
			['only-b.ts', inside('return 7;'), ['b'], "code only b's recorder runs"],
			['shared.ts', inside('return 6;'), ['a', 'b'], 'code both recorders run'],
			['index.ts', inside("await record('b', recordB, null, '/'"), ['b'], "b's own orchestration statement"],
			['index.ts', inside('const log = (line: string) => void line'), ['a', 'b'], 'the orchestration every recording runs under'],
		];
		for (const [file, edit, kinds, why] of expected) assert.deepEqual(await changed(file, edit), kinds, why);
		for (const [name, kinds] of [['FIXTURE_ONE', ['a']], ['FIXTURE_TWO', ['a']], ['FIXTURE_UNREAD', []]] as const) {
			process.env[name] = 'set';
			try {
				const after = await versions();
				assert.deepEqual(Object.keys(base).filter((k) => base[k]?.version !== after[k]?.version), kinds, name);
			} finally {
				delete process.env[name];
			}
		}
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});

test('what the key cannot place makes the kind that holds it record every time: computed environment reads, process handed whole, an unknown import.meta field, and state another kind changes', async () => {
	const problems = async (files: Record<string, string>) => {
		const { dir, versions } = await fixture({ ...graph, ...files });
		try {
			const v = await versions();
			return { a: v.a?.problems.join('\n') ?? '', b: v.b?.problems.join('\n') ?? '' };
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	};
	assert.match((await problems({ 'env-helper.ts': `export function fromEnv() {\n\treturn process['env'].FIXTURE_ONE;\n}\n` })).a, /uses process other than by one of its fields/);
	assert.match((await problems({ 'env-helper.ts': `export function fromEnv() {\n\tconst name = 'X';\n\treturn process.env[name];\n}\n` })).a, /reads the environment other than by a variable's name/);
	assert.match((await problems({ 'env-helper.ts': `import { env } from 'node:process';\nexport function fromEnv() {\n\treturn { ...env };\n}\n` })).a, /reads the environment other than by a variable's name/);
	assert.match((await problems({ 'env-helper.ts': `export function fromEnv() {\n\tconst { env } = process;\n\treturn env.X;\n}\n` })).a, /uses process other than by one of its fields/);
	assert.match((await problems({ 'only-b.ts': `export function only() {\n\treturn import.meta.glob;\n}\n` })).b, /import\.meta\.glob, which names no file/);
	assert.match((await problems({ 'only-b.ts': `export function only(name: string) {\n\treturn import.meta.resolve(name);\n}\n` })).b, /import\.meta\.resolve of a computed specifier/);
	const shared = await problems({
		'shared.ts': `export const cache = new Map<string, number>();\nexport function both() {\n\treturn 6;\n}\n`,
		'rec-a.ts': graph['rec-a.ts']?.replace("import { both } from './shared.ts';", "import { both, cache } from './shared.ts';").replace('\tboth();\n', "\tboth();\n\tcache.set('k', 1);\n") ?? '',
		'rec-b.ts': graph['rec-b.ts']?.replace("import { both } from './shared.ts';", "import { both, cache } from './shared.ts';").replace('\tboth();\n', "\tboth();\n\tcache.get('k');\n") ?? '',
	});
	assert.match(shared.b, /shared\.ts cache, which another kind's recording changes/, "b reads what a's recorder sets");
	assert.doesNotMatch(shared.a, /cache/, 'a sets it in its own code');
});

test("a function handed to a recorder must be one of convert's handles, never one written in place or another binding", async () => {
	const withHandle = (call: string) => ({
		'index.ts': host(`\t${call}`, "import { recordH } from './rec-h.ts';"),
		'rec-h.ts': `import type { Limit } from './limit-type.ts';\nexport async function recordH(browser: unknown, origin: string, route: string, dir: string, log: (line: string) => void, size: number, limit?: Limit) {\n\treturn [dir, log, size, limit];\n}\n`,
		'limit-type.ts': `export type Limit = <T>(task: () => Promise<T>) => Promise<T>;\n`,
	});
	const problems = async (call: string) => {
		const dir = await tree({ ...graph, ...withHandle(call) });
		try {
			return recordingFacts(join(dir, 'index.ts')).problems.join('\n');
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	};
	assert.ok('log' in HANDLES);
	assert.equal(await problems("await record('h', recordH, null, '/', log, 1);"), '');
	assert.match(await problems("await record('h', recordH, null, '/', (line: string) => void line, 1);"), /a function written in place is handed to a recorder/);
	assert.match(await problems("const other = (line: string) => void line;\n\tawait record('h', recordH, null, '/', other, 1);"), /a function handed to recordH: only log and limit \(HANDLES\) may be/);
	assert.match(await problems("const other = <T>(task: () => Promise<T>) => task();\n\tawait record('h', recordH, null, '/', log, 1, other);"), /a function handed to recordH/, 'a parameter typed by an imported function alias');
});

test('a recording made around record, a recorder used outside it, or a computed kind is never attributed', async () => {
	const problems = async (body: string, extra = '') => {
		const dir = await tree({ ...graph, 'index.ts': host(body, extra) });
		try {
			return recordingFacts(join(dir, 'index.ts'));
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	};
	assert.deepEqual((await problems(`\tawait record('a', recordA, null, '/');`)).problems, []);
	assert.match((await problems(`\tawait record('a', recordA, null, '/');\n\tawait recordB(null, options.old, '/', join(app, '.migrate', 'convert', 'x'));`)).problems.join('\n'), /the recorder recordB is used outside record|a folder of the store is handed to a function/);
	assert.match((await problems(`\tconst kind = 'a';\n\tawait record(kind, recordA, null, '/');`)).problems.join('\n'), /whose kind is not a literal/);
	assert.match((await problems(`\tawait record('a', recordA, null, '/');\n\tawait atFor('/', 'y', []);`)).problems.join('\n'), /atFor is called from 2 functions/);
	assert.deepEqual((await problems(`\tawait readFile(join(app, 'lib', 'x.json'));\n\tawait record('a', recordA, null, '/');`, "import { readFile } from 'node:fs/promises';")).inputs, ['.migrate/convert', 'lib/x.json']);
	assert.deepEqual((await problems(`\tawait writeFile(join(app, '.migrate', 'made.json'), '');\n\tawait record('a', recordA, null, '/');`, "import { writeFile } from 'node:fs/promises';")).inputs, ['.migrate/convert'], 'a file the orchestration writes is not one of its inputs');
	const computed = await problems(`\tawait readFile(join(app, 'lib', String(Date.now())));\n\tawait record('a', recordA, null, '/');`, "import { readFile } from 'node:fs/promises';");
	assert.deepEqual(computed.inputs, ['.migrate/convert', 'lib/*']);
});

// The repository copied, so its files can be edited one at a time and each kind's version read again.
async function copyRepo(): Promise<string> {
	const dir = await mkdtemp(join(tmpdir(), 'record-graph-'));
	for (const name of ['src', 'parts', 'package.json']) await cp(join(ROOT, name), join(dir, name), { recursive: true });
	await symlink(join(ROOT, 'node_modules'), join(dir, 'node_modules'));
	return dir;
}

test("on the repository itself: an input or a variable read changes the kinds that read it, an emit-only declaration none", { timeout: 600_000 }, async () => {
	const repo = await copyRepo();
	const app = await tree({ 'lib/site/controls.json': '[]', 'lib/site/instance-props.json': '[]', '.migrate/usage.json': '{}' });
	try {
		const keyModule = (await import(join(repo, 'src/convert/record-key.ts'))) as { recordingVersions: (app?: string) => Promise<Record<string, KindVersion>> };
		const read = () => keyModule.recordingVersions(app);
		const base = await read();
		for (const [kind, v] of Object.entries(base)) assert.deepEqual(v.problems, [], `${kind}: ${v.problems.join('; ')}`);
		const changed = (after: Record<string, KindVersion>) => Object.keys(base).filter((k) => base[k]?.version !== after[k]?.version).sort();
		const all = Object.keys(base).sort();

		const indexText = await readFile(join(repo, 'src/convert/index.ts'), 'utf8');
		const emitOnly = indexText.indexOf('export function bodyChildren');
		assert.ok(emitOnly > 0);
		await writeFile(join(repo, 'src/convert/index.ts'), `${indexText.slice(0, emitOnly)}export/*edit*/${indexText.slice(emitOnly + 'export'.length)}`);
		assert.deepEqual(changed(await read()), [], 'an emit-only declaration of index.ts');
		await writeFile(join(repo, 'src/convert/index.ts'), indexText);
		const tables = await readFile(join(repo, 'src/convert/tanstack-table.ts'), 'utf8');
		await writeFile(join(repo, 'src/convert/tanstack-table.ts'), tables.replace('export async function captureTables', 'export/*edit*/ async function captureTables'));
		assert.deepEqual(changed(await read()), ['tables'], "the tables recorder's own code");
		await writeFile(join(repo, 'src/convert/tanstack-table.ts'), tables);
		const browser = await readFile(join(repo, 'src/check/browser.ts'), 'utf8');
		await writeFile(join(repo, 'src/check/browser.ts'), browser.replace('export async function openPage', 'export/*edit*/ async function openPage'));
		assert.deepEqual(changed(await read()), all.filter((k) => k !== 'prefetch'), 'the page every recorder opens, but the prefetch recorder, which opens its own contexts');
		await writeFile(join(repo, 'src/check/browser.ts'), browser);

		await writeFile(join(app, 'lib/site/controls.json'), '[{"selector":"button","action":"toggle"}]');
		assert.deepEqual(changed(await read()), all, 'the site controls every recording is set up from');
		await writeFile(join(app, 'lib/site/controls.json'), '[]');
		await writeFile(join(app, '.migrate/inventory.json'), '{"routes":[]}');
		assert.deepEqual(changed(await read()), [], 'the inventory chooses routes, not what a route records');
		await writeFile(join(app, '.migrate/usage.json'), '{"generatedAt":"another time"}');
		assert.deepEqual(changed(await read()), [], 'the usage inventory only decides whether the table and form recorders run, and a re-plan writes it with a new time');
		const variable = base.captures?.env[0] ?? '';
		assert.ok(variable);
		process.env[variable] = '12345';
		try {
			assert.deepEqual(changed(await read()), Object.keys(base).filter((k) => base[k]?.env.includes(variable)).sort());
		} finally {
			delete process.env[variable];
		}
		process.env.MIGRATE_ORIGINAL_ID = 'another-original';
		try {
			assert.deepEqual(changed(await read()), all, 'another old site records everything again');
		} finally {
			process.env.MIGRATE_ORIGINAL_ID = 'test-original';
		}
	} finally {
		await rm(app, { recursive: true, force: true });
		await rm(repo, { recursive: true, force: true });
	}
});

test("a recording refuses a load of its page that answers another status than the request its key was made from", () => {
	const url = 'http://localhost:4000/docs';
	assert.equal(unexpectedStatus(url, 500), undefined, 'outside a recording nothing is compared');
	expectedStatus.run({ url, status: 200 }, () => {
		assert.match(unexpectedStatus(url, 500) ?? '', /answered 500 to the browser and 200 to the request its recordings are keyed by/);
		assert.equal(unexpectedStatus(url, 200), undefined);
		assert.equal(unexpectedStatus('http://localhost:4000/other', 500), undefined, 'a page the recorder goes on to is its own');
	});
});
