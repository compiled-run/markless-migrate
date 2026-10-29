import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { agreed, oldKey, readOld, writeOld } from '../scripts/probe/reuse.ts';
import { reuseKey, shipKey } from '../src/check/ship-key.ts';

const versions = { probe: 'tree1', old: 'build1' };

test('an old-side key changes with the probe, the old build, the engine, the route, the width and the use, and with nothing else', () => {
	const base = { engine: 'chromium', route: '/a', width: 1280, item: 'click button "Go"' };
	const key = oldKey(versions, base);
	assert.equal(oldKey({ old: 'build1', probe: 'tree1' }, { ...base }), key);
	for (const changed of [oldKey({ ...versions, probe: 'tree2' }, base), oldKey({ ...versions, old: 'build2' }, base), oldKey(versions, { ...base, engine: 'webkit' }), oldKey(versions, { ...base, route: '/b' }), oldKey(versions, { ...base, width: 390 }), oldKey(versions, { ...base, item: 'click button "Stop"' })]) assert.notEqual(changed, key);
});

test('check\'s reuse key and the probe\'s are one scheme: the same versions and lines give the same key', () => {
	const closures = { routes: new Map([['app/a.tsrx', { modules: new Map([['m1', 'h1']]) }]]) };
	const html = '<script type="@markless/core/route">{"file":"app/a.tsrx"}</script><p>x</p>';
	assert.equal(shipKey('/a', html, closures, versions).key, reuseKey(versions, ['route /a\n', 'module m1 h1\n', html]));
});

test('an entry keeps every recording of the old side, with when it was made, in the directory check keeps its reuse entries in', async () => {
	const dir = await mkdtemp(join(tmpdir(), 'probe-reuse-'));
	try {
		assert.equal(await readOld(dir, 'k1'), undefined);
		await writeOld(dir, 'k1', { route: '/a', item: 'x', runs: [{ affected: ['main'] }, { affected: ['main', 'dialog'] }] }, '2026-10-29T00:00:00.000Z');
		const entry = await readOld(dir, 'k1');
		assert.deepEqual(entry?.runs, [{ affected: ['main'] }, { affected: ['main', 'dialog'] }]);
		assert.equal(entry?.checkedAt, '2026-10-29T00:00:00.000Z');
		assert.deepEqual(await readdir(dir), ['k1.json']);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});

test('a finding stands only when the port differs from every recording of the old side', () => {
	const a = [{ kind: 'dead', control: 'button "Go"' }, { kind: 'region', control: 'tab "One"' }];
	const b = [{ kind: 'dead', control: 'button "Go"', expected: 'other words' }];
	assert.deepEqual(agreed([a, b]), [a[0]]);
	assert.deepEqual(agreed([a]), a);
	assert.deepEqual(agreed([a, []]), []);
	assert.deepEqual(agreed([]), []);
});
