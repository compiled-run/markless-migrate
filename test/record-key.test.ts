// Each kind of a route's recordings is kept under a key of its old page and of that kind's recorder: an unchanged page
// reads them back, a changed page or a changed recorder of that kind records again, and a cache from before keys is read as the current pages'.
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { test } from 'node:test';
import { closureOf, moduleEdges, ROOT } from '../src/code-closure.ts';
import { walk, type N } from '../src/source/js.ts';
import { kindKey, kindsRead, pageKey, RECORDING_KINDS, recorderEntries, recorderVersions, RecordDirs, type RecordingKind } from '../src/convert/record-key.ts';

const VERSIONS = { captures: 'c', reveals: 'r', toggles: 't' };

test("a route's page key ignores the order its old page's head tags were streamed in, and nothing else", () => {
	const page = (head: string, body = '<p>x</p>') => `<!doctype html><html><head>${head}</head><body>${body}</body></html>`;
	assert.equal(pageKey('/', 200, page('<meta name="a"/><meta name="b"/><title>T</title>')), pageKey('/', 200, page('<title>T</title><meta name="b"/><meta name="a"/>')));
	assert.notEqual(pageKey('/', 200, page('<meta name="a"/>')), pageKey('/', 200, page('<meta name="c"/>')));
	assert.notEqual(pageKey('/', 200, page('')), pageKey('/', 200, page('', '<p>y</p>')));
	assert.notEqual(pageKey('/', 200, page('')), pageKey('/', 404, page('')));
	assert.notEqual(pageKey('/', 200, page('')), pageKey('/b', 200, page('')));
});

test("each kind's key is its page's and its own recorder's: another recorder of one kind leaves the others' keys", () => {
	const page = pageKey('/', 200, '<p>x</p>');
	assert.notEqual(kindKey(VERSIONS, 'captures', page), kindKey(VERSIONS, 'reveals', page));
	assert.notEqual(kindKey(VERSIONS, 'reveals', page), kindKey({ ...VERSIONS, reveals: 'r2' }, 'reveals', page));
	assert.equal(kindKey(VERSIONS, 'captures', page), kindKey({ ...VERSIONS, reveals: 'r2' }, 'captures', page));
	assert.match(kindKey(VERSIONS, 'captures', page), /^[\w-]{43}$/);
	assert.match(kindKey(VERSIONS, 'captures', 'unreachable-00ff00ff'), /^unreachable-[0-9a-f]{8}$/);
	assert.throws(() => kindKey(VERSIONS, 'tables', page), /RECORDING_KINDS/);
});

test("a kind's recorder is its own modules' graph and that of the kinds it is handed, never the orchestration's", async () => {
	const files = async (kind: RecordingKind) => (await closureOf(recorderEntries(kind))).files.map((f) => relative(ROOT, f));
	const captures = await files('captures');
	assert.ok(captures.includes('src/convert/capture.ts') && captures.includes('src/convert/dom.ts'));
	assert.ok(!captures.includes('src/convert/reveal.ts') && !captures.includes('src/convert/tanstack-table.ts'), 'a reveals or tables change leaves the captures');
	const toggles = await files('toggles');
	assert.ok(toggles.includes('src/convert/reveal.ts') && toggles.includes('src/convert/scenes.ts'), 'toggles are handed the reveals the scenes do not play');
	for (const kind of Object.keys(RECORDING_KINDS) as RecordingKind[]) {
		const list = await files(kind);
		assert.ok(!list.includes('src/convert/index.ts') && !list.includes('src/convert/record-key.ts'), `${kind}: the orchestration and the keying are not the recorder`);
	}
	assert.deepEqual(kindsRead('choices'), ['captures', 'choices', 'reveals', 'scenes', 'toggles']);
	const v = await recorderVersions();
	assert.deepEqual(Object.keys(v).sort(), Object.keys(RECORDING_KINDS).sort());
	const again = await recorderVersions();
	for (const kind of Object.keys(RECORDING_KINDS) as RecordingKind[]) {
		assert.match(v[kind], /^[\w-]{22}$/);
		const { unresolved } = await closureOf(recorderEntries(kind));
		if (unresolved.length) assert.notEqual(again[kind], v[kind], `${kind} loads what its graph cannot name, so it records every time`);
		else assert.equal(again[kind], v[kind], `${kind}'s version is the same from one call to the next`);
	}
	assert.ok(!(await closureOf(recorderEntries('captures'))).unresolved.length && !(await closureOf(recorderEntries('reveals'))).unresolved.length, 'the captures and reveals are keyed by their graph alone');
});

test('every directory index.ts hands a capture function is a recording kind, recorded by the module the function comes from', async () => {
	const file = join(ROOT, 'src/convert/index.ts');
	const { program } = await moduleEdges(file);
	const imports = new Map<string, string>();
	for (const s of program!.body as N[]) if (s.type === 'ImportDeclaration') for (const spec of s.specifiers) imports.set(spec.local.name, relative(join(ROOT, 'src/convert'), join(dirname(file), s.source.value)));
	const kindOf = (n: N): string | undefined => (n.type === 'CallExpression' && n.callee.type === 'Identifier' && n.callee.name === 'atFor' ? n.arguments[1]?.value : undefined);
	let calls = 0;
	let handed = 0;
	walk(program!, (n) => {
		if (kindOf(n)) handed++;
		if (n.type !== 'CallExpression' || n.callee.type !== 'Identifier' || !/^capture[A-Z]/.test(n.callee.name)) return;
		const kinds = new Set<string>();
		for (const arg of n.arguments) walk(arg, (a) => void (kindOf(a) && kinds.add(kindOf(a)!)));
		for (const kind of kinds) {
			calls++;
			assert.ok(kind in RECORDING_KINDS, `${kind} is not a recording kind`);
			assert.ok((RECORDING_KINDS[kind as RecordingKind] as readonly string[]).includes(imports.get(n.callee.name)!), `${n.callee.name} (${imports.get(n.callee.name)}) records ${kind}, so its module is that kind's`);
		}
	});
	assert.ok(calls >= 25, `found ${calls}`);
	assert.equal(handed, calls + 1, 'every directory handed out but the choices one goes straight to a capture function');
});

test('a cache from before keys is read where it is for the pages as they are now; once saved, a changed page gets a directory of its own', async () => {
	const root = await mkdtemp(join(tmpdir(), 'record-dirs-'));
	const at = (base: string, kind: string, page: string) => join(base, kind, kindKey(VERSIONS, kind, page));
	try {
		await mkdir(join(root, 'reveals'), { recursive: true });
		await writeFile(join(root, 'reveals', 'old.json'), '{}');
		const first = await RecordDirs.open(root, VERSIONS);
		assert.equal(await first.dir('/a', 'k1', 'reveals'), join(root, 'reveals'), 'the legacy files are read where they are');
		assert.deepEqual(await readdir(await first.dir('/a', 'k1', 'toggles')), [], 'a kind with no legacy files gets a keyed directory');
		await first.save();
		const second = await RecordDirs.open(root, VERSIONS);
		assert.equal(await second.dir('/a', 'k1', 'reveals'), join(root, 'reveals'), 'an unchanged page reads back what it recorded');
		assert.equal(await second.dir('/a', 'k1', 'toggles'), at(root, 'toggles', 'k1'));
		assert.equal(await second.dir('/a', 'k2', 'reveals'), at(root, 'reveals', 'k2'), 'a changed page is recorded again');
		assert.equal(await second.dir('/b', 'k3', 'reveals'), at(root, 'reveals', 'k3'), 'a route the old cache never had starts keyed');
		await second.save();
		assert.deepEqual(JSON.parse(await readFile(join(root, 'sources.json'), 'utf8')), { flat: { '/a': 'k1' } });
		const visits = await Promise.all((await readdir(join(root, 'visits'))).map(async (f) => JSON.parse(await readFile(join(root, 'visits', f), 'utf8'))));
		assert.deepEqual(visits.sort((a, b) => (a.route < b.route ? -1 : 1)), [
			{ route: '/a', page: 'k2', kinds: { reveals: kindKey(VERSIONS, 'reveals', 'k2') } },
			{ route: '/b', page: 'k3', kinds: { reveals: kindKey(VERSIONS, 'reveals', 'k3') } },
		]);
		const third = await RecordDirs.open(root, { ...VERSIONS, toggles: 't2' });
		assert.equal(await third.dir('/b', 'k3', 'reveals'), at(root, 'reveals', 'k3'), 'another toggles recorder reads back the reveals');
		assert.notEqual(await third.dir('/b', 'k3', 'toggles'), at(root, 'toggles', 'k3'), 'and records the toggles again');
		const fresh = await mkdtemp(join(tmpdir(), 'record-dirs-'));
		const none = await RecordDirs.open(fresh, VERSIONS);
		assert.equal(await none.dir('/a', 'k1', 'reveals'), at(fresh, 'reveals', 'k1'));
		await none.save();
		assert.deepEqual(JSON.parse(await readFile(join(fresh, 'sources.json'), 'utf8')), { flat: {} }, 'a cache made with keys names no route as flat');
		await rm(fresh, { recursive: true, force: true });
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});
