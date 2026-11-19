// Each kind of a route's recordings is kept under a key of its old page, the code that records that kind (read from the
// module graph), and the data its recorder is handed: an edit records again exactly the kinds whose code it is in.
import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { test } from 'node:test';
import { analyze } from 'yuku/analyzer';
import { ROOT } from '../src/code-closure.ts';
import { INDEX, recordingFacts, STORE } from '../src/convert/record-facts.ts';
import { FORMAT, givenDigest, OPTIONS_READ, pageKey, readVisits, RECORDING_VERSION, recordDirKey, RecordDirs, recordingVersions, UNKEYED_INPUTS, VISITS, type KindVersion } from '../src/convert/record-key.ts';

test("a page's key ignores the order its head tags were streamed in, and nothing else of the page, its route or origin", () => {
	const page = (head: string, body = '<p>x</p>') => `<!doctype html><html><head>${head}</head><body>${body}</body></html>`;
	const o = 'http://localhost:4000';
	assert.equal(pageKey(o, '/', 200, page('<meta name="a"/><meta name="b"/><title>T</title>')), pageKey(o, '/', 200, page('<title>T</title><meta name="b"/><meta name="a"/>')));
	assert.notEqual(pageKey(o, '/', 200, page('<meta name="a"/>')), pageKey(o, '/', 200, page('<meta name="c"/>')));
	assert.notEqual(pageKey(o, '/', 200, page('')), pageKey(o, '/', 200, page('', '<p>y</p>')));
	assert.notEqual(pageKey(o, '/', 200, page('')), pageKey(o, '/', 404, page('')));
	assert.notEqual(pageKey(o, '/', 200, page('')), pageKey(o, '/b', 200, page('')));
	assert.notEqual(pageKey(o, '/', 200, page('')), pageKey('http://localhost:4001', '/', 200, page('')));
});

test('what a recorder is handed is keyed by its data, in any key order; a handle at the top counts by place, and a function or class inside is refused', () => {
	assert.equal(givenDigest([{ a: 1, b: ['x', { c: true }] }]), givenDigest([{ b: ['x', { c: true }], a: 1 }]));
	assert.notEqual(givenDigest([{ a: 1 }]), givenDigest([{ a: 2 }]));
	assert.notEqual(givenDigest(['ab', 'c']), givenDigest(['a', 'bc']));
	assert.notEqual(givenDigest([1]), givenDigest(['1']));
	assert.notEqual(givenDigest([undefined]), givenDigest([]));
	assert.notEqual(givenDigest([{ a: undefined }]), givenDigest([{}]));
	assert.equal(givenDigest([() => 1, 'x']), givenDigest([() => 2, 'x']), 'a log or a limit handed at the top is no data');
	assert.notEqual(givenDigest([() => 1, 'x']), givenDigest(['x']));
	assert.equal(givenDigest([new Map([['b', 1], ['a', 2]])]), givenDigest([new Map([['a', 2], ['b', 1]])]));
	assert.throws(() => givenDigest([{ pick: () => true }]), /function inside argument 1\.pick/);
	assert.throws(() => givenDigest([new Date(0)]), /Date instance/);
	const cycle: Record<string, unknown> = {};
	cycle.self = cycle;
	assert.throws(() => givenDigest([cycle]), /cycle/);
});

test('a directory is keyed by its kind, that kind\'s version, the page and what the recorder is handed; a kind with no version is refused', () => {
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
		const dir = await dirs.dir('/a', 'page', 'captures', []);
		await writeFile(join(dir, 'x.json'), '{}');
		await dirs.save();
		await RecordDirs.open(root, { captures: 'v' });
		assert.deepEqual(await readdir(dir), ['x.json'], 'a store of this format is read as it is');
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("a route's visit names the directories each kind used; a kind not recorded this run is kept from the last visit only at the same page and version", async () => {
	const root = await mkdtemp(join(tmpdir(), 'record-dirs-'));
	try {
		const first = await RecordDirs.open(root, { captures: 'c1', otps: 'o1', toggles: 't1' });
		const c = await first.dir('/a', 'page', 'captures', []);
		const o = await first.dir('/a', 'page', 'otps', []);
		const t1 = await first.dir('/a', 'page', 'toggles', ['desktop']);
		const t2 = await first.dir('/a', 'page', 'toggles', [['sel']]);
		assert.notEqual(t1, t2, 'two recorders of a kind handed different data write apart');
		await first.save();
		const [visit] = await readVisits(root);
		assert.deepEqual(visit, { route: '/a', page: 'page', kinds: { captures: { version: 'c1', dirs: [relative(join(root, 'captures'), c)] }, otps: { version: 'o1', dirs: [relative(join(root, 'otps'), o)] }, toggles: { version: 't1', dirs: [relative(join(root, 'toggles'), t1), relative(join(root, 'toggles'), t2)].sort() } } });
		const second = await RecordDirs.open(root, { captures: 'c1', otps: 'o2', toggles: 't1' });
		await second.dir('/a', 'page', 'captures', []);
		await second.save();
		assert.deepEqual(Object.keys((await readVisits(root))[0]!.kinds), ['captures', 'toggles'], 'otps at an old version and captures recorded again; toggles kept from the same page');
		const third = await RecordDirs.open(root, { captures: 'c1', otps: 'o2', toggles: 't1' });
		await third.dir('/a', 'page2', 'captures', []);
		await third.save();
		assert.deepEqual(Object.keys((await readVisits(root))[0]!.kinds), ['captures'], 'a changed page keeps nothing of its last visit');
		assert.deepEqual(await readdir(join(root, VISITS)), [(await readdir(join(root, VISITS)))[0]]);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test('every recording convert makes goes through record, each recorder attributed to its kind, and the module graph names every input', async () => {
	const facts = recordingFacts();
	assert.deepEqual(facts.problems, []);
	const kinds = Object.fromEntries([...facts.kinds].map(([k, v]) => [k, v.entries.map((e) => `${relative(ROOT, e.file)} ${e.name}`)]));
	assert.deepEqual(Object.keys(kinds).sort(), ['captures', 'choices', 'clock', 'day-pickers', 'form-libraries', 'otps', 'rac-calendars', 'reveals', 'scenes', 'tables', 'toggles']);
	assert.ok(kinds.toggles!.includes('src/convert/toggles.ts captureToggles') && kinds.toggles!.includes('src/convert/charts.ts captureCharts'));
	assert.deepEqual(kinds.choices, ['src/convert/choices.ts captureChoices'], 'the adapter that reorders its arguments leads to the recorder it calls');
	for (const o of facts.options) assert.ok(o in OPTIONS_READ, `options.${o} is read by the recording and no key holds it`);
	for (const p of facts.inputs) assert.ok(p === STORE || p.startsWith(`${STORE}/`) || p in UNKEYED_INPUTS || !p.includes('*'), p);
	assert.ok(facts.inputs.includes('lib/site/instance-props.json') && facts.inputs.includes('lib/site/controls.json'), 'what the recorders are set up from is an input');

	// Each function of src/convert a recording browser is handed: one index.ts imports is a recorder of a kind.
	const recorders = new Set(Object.values(kinds).flat());
	const index = analyze(await readFile(INDEX, 'utf8'), { path: INDEX } as Parameters<typeof analyze>[1]);
	const imported = new Set(index.imports.filter((i) => !i.typeOnly && i.name).map((i) => `src/convert/${i.specifier.replace(/^\.\//, '')} ${i.name}`));
	for (const name of (await readdir(join(ROOT, 'src/convert'))).filter((f) => f.endsWith('.ts'))) {
		const file = join(ROOT, 'src/convert', name);
		const mod = analyze(await readFile(file, 'utf8'), { path: file } as Parameters<typeof analyze>[1]);
		const browser = mod.imports.find((i) => i.specifier === 'playwright' && i.name === 'Browser')?.local;
		if (!browser) continue;
		for (const e of mod.exports) {
			const decl = e.local?.declarations[0];
			const fn = decl && mod.parentOf(decl);
			const first = (fn as { params?: { typeAnnotation?: { typeAnnotation?: { typeName?: unknown } } }[] } | null)?.params?.[0]?.typeAnnotation?.typeAnnotation?.typeName;
			if (!first || mod.bindingOf(first as never)?.id !== browser.id) continue;
			const id = `src/convert/${name} ${e.name}`;
			if (imported.has(id)) assert.ok(recorders.has(id), `${id} takes a browser and index.ts imports it, but records through no kind`);
		}
	}
});

test('a recording made around record, a recorder used outside it, or a computed kind is never attributed', async () => {
	const dir = await mkdtemp(join(tmpdir(), 'record-facts-'));
	try {
		await writeFile(join(dir, 'rec.ts'), `import type { Browser } from 'playwright';\nexport async function captureX(browser: Browser, origin: string, route: string, dir: string) { return dir; }\n`);
		const index = (body: string) => `import { readFile } from 'node:fs/promises';\nimport { join } from 'node:path';\nimport { RecordDirs } from '${join(ROOT, 'src/convert/record-key.ts')}';\nimport { captureX } from './rec.ts';\nexport async function convert(options: { app: string; old: string }) {\n\tconst app = options.app;\n\tconst state = join(app, '.migrate');\n\tconst dirs = await RecordDirs.open(join(state, 'convert'), {});\n\tconst atFor = async (route: string, kind: string, given: readonly unknown[]) => dirs.dir(route, 'p', kind, given);\n\tconst record = async (kind: string, recorder: Function, browser: unknown, route: string, ...given: unknown[]) => recorder(browser, options.old, route, await atFor(route, kind, given), ...given);\n${body}\n}\n`;
		const facts = async (body: string) => {
			await writeFile(join(dir, 'index.ts'), index(body));
			return recordingFacts(join(dir, 'index.ts'));
		};
		assert.deepEqual((await facts(`\tawait record('x', captureX, null, '/');`)).problems, []);
		assert.match((await facts(`\tawait record('x', captureX, null, '/');\n\tawait captureX(null as never, options.old, '/', join(state, 'convert', 'x'));`)).problems.join('\n'), /the recorder captureX is used outside record[\s\S]*a folder of the store is handed to a function/);
		assert.match((await facts(`\tconst kind = 'x';\n\tawait record(kind, captureX, null, '/');`)).problems.join('\n'), /whose kind is not a literal/);
		assert.match((await facts(`\tawait record('x', captureX, null, '/');\n\tawait atFor('/', 'y', []);`)).problems.join('\n'), /atFor is called from 2 functions/);
		assert.deepEqual((await facts(`\tawait readFile(join(app, 'lib', 'x.json'));\n\tawait record('x', captureX, null, '/');`)).inputs, ['.migrate/convert', 'lib/x.json']);
		const computed = await facts(`\tawait readFile(join(app, 'lib', String(Date.now())));\n\tawait record('x', captureX, null, '/');`);
		assert.deepEqual(computed.inputs, ['.migrate/convert', 'lib/*']);
		assert.match((await recordingVersions(undefined, computed)).x!.problems.join('\n'), /reads lib\/\*, files under a computed path/);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});

// The repository copied, so its files can be edited one at a time and each kind's version read again.
async function copyRepo(): Promise<string> {
	const dir = await mkdtemp(join(tmpdir(), 'record-graph-'));
	for (const name of ['src', 'parts', 'package.json']) await cp(join(ROOT, name), join(dir, name), { recursive: true });
	await symlink(join(ROOT, 'node_modules'), join(dir, 'node_modules'));
	return dir;
}

test('editing one declaration changes the version of exactly the kinds whose code holds it; an input or variable read changes the kinds that read it', { timeout: 600_000 }, async () => {
	const repo = await copyRepo();
	try {
		const app = await tree({ 'lib/site/controls.json': '[]', 'lib/site/instance-props.json': '[]', '.migrate/usage.json': '{}' });
		const keyModule = (await import(join(repo, 'src/convert/record-key.ts'))) as { recordingVersions: (app?: string) => Promise<Record<string, KindVersion>> };
		const read = () => keyModule.recordingVersions(app);
		const base = await read();
		for (const [kind, v] of Object.entries(base)) assert.deepEqual(v.problems, [], `${kind}: ${v.problems.join('; ')}`);
		const changed = (after: Record<string, KindVersion>) => Object.keys(base).filter((k) => base[k]!.version !== after[k]!.version).sort();
		const holding = (unit: string) => Object.keys(base).filter((k) => base[k]!.units.includes(unit)).sort();
		const edit = async (unit: string) => {
			const [, path, offset] = /^(.*):(\d+) /.exec(unit)!;
			const file = join(repo, path!);
			const text = await readFile(file, 'utf8');
			const at = Number(offset);
			const space = text.slice(at).search(/\s/) + at;
			await writeFile(file, `${text.slice(0, space)}/*edit*/${text.slice(space)}`);
			try {
				assert.deepEqual(changed(await read()), holding(unit), `an edit to ${unit}`);
			} finally {
				await writeFile(file, text);
			}
		};
		// One declaration of each kind's own recorder, one every recorder shares, and the orchestration around them.
		const units = new Set<string>();
		for (const [kind, v] of Object.entries(base)) {
			const own = v.units.find((u) => holding(u).length === 1 && holding(u)[0] === kind && !u.includes('(orchestration)'));
			assert.ok(own, `${kind} has code no other kind runs`);
			units.add(own);
		}
		const everywhere = base.captures!.units.filter((u) => holding(u).length === Object.keys(base).length);
		units.add(everywhere.find((u) => u.startsWith('src/check/browser.ts'))!);
		units.add(everywhere.find((u) => u.includes('(orchestration)'))!);
		const someNotAll = base.reveals!.units.find((u) => holding(u).length > 1 && holding(u).length < Object.keys(base).length);
		if (someNotAll) units.add(someNotAll);
		for (const unit of units) await edit(unit);

		// Code no kind runs: an emit-only declaration of index.ts, and a whole module the recorders never load.
		const indexText = await readFile(join(repo, 'src/convert/index.ts'), 'utf8');
		const emitOnly = indexText.indexOf('export function bodyChildren');
		assert.ok(emitOnly > 0);
		await writeFile(join(repo, 'src/convert/index.ts'), `${indexText.slice(0, emitOnly)}export/*edit*/${indexText.slice(emitOnly + 'export'.length)}`);
		assert.deepEqual(changed(await read()), [], 'an emit-only declaration of index.ts');
		await writeFile(join(repo, 'src/convert/index.ts'), indexText);

		// The app's inputs and the environment the code reads.
		await writeFile(join(app, 'lib/site/controls.json'), '[{"selector":"button","action":"toggle"}]');
		assert.deepEqual(changed(await read()), Object.keys(base).sort(), 'the site controls every recording is set up from');
		await writeFile(join(app, 'lib/site/controls.json'), '[]');
		await writeFile(join(app, '.migrate/inventory.json'), '{"routes":[]}');
		assert.deepEqual(changed(await read()), [], 'the inventory chooses routes, not what a route records');
		await writeFile(join(app, '.migrate/usage.json'), '{"generatedAt":"another time"}');
		assert.deepEqual(changed(await read()), [], 'the usage inventory only decides whether the table and form recorders run, and a re-plan writes it with a new time');
		const variable = base.captures!.env[0]!;
		process.env[variable] = '12345';
		try {
			assert.deepEqual(changed(await read()), Object.keys(base).filter((k) => base[k]!.env.includes(variable)).sort());
		} finally {
			delete process.env[variable];
		}
		process.env.MIGRATE_ORIGINAL_ID = 'another-original';
		try {
			assert.deepEqual(changed(await read()), Object.keys(base).sort(), 'another old site records everything again');
		} finally {
			delete process.env.MIGRATE_ORIGINAL_ID;
		}
		await rm(app, { recursive: true, force: true });
	} finally {
		await rm(repo, { recursive: true, force: true });
	}
});
