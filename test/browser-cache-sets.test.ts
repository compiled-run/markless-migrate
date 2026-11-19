import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { keys, relation, setOf, supersets, WARMED } from '../scripts/browser-cache-sets.ts';

test('a browser set falls back only to warmed sets holding every one of its browsers, fewest extra first', () => {
	assert.deepEqual(supersets('chromium'), ['chromium webkit', 'chromium firefox webkit']);
	assert.deepEqual(supersets('webkit'), ['chromium webkit', 'chromium firefox webkit']);
	assert.deepEqual(supersets('chromium webkit'), ['chromium firefox webkit']);
	assert.deepEqual(supersets('webkit  chromium'), ['chromium firefox webkit']);
	assert.deepEqual(supersets('firefox'), ['chromium firefox webkit']);
	assert.deepEqual(supersets('chromium firefox webkit'), []);
	assert.deepEqual(supersets('chromium msedge'), []);
	for (const set of WARMED) {
		for (const superset of supersets(set)) {
			for (const browser of set.split(' ')) assert.ok(superset.split(' ').includes(browser), `${superset} lacks ${browser} of ${set}`);
		}
	}
});

test('the sets offered as fallbacks are the ones the browser-cache workflow keeps warm on main', () => {
	const line = readFileSync(new URL('../.github/workflows/browser-cache.yml', import.meta.url), 'utf8')
		.split('\n')
		.find((l) => l.trim().startsWith('browsers: ['));
	assert.ok(line, 'browser-cache.yml has a browsers matrix');
	assert.deepEqual(JSON.parse(line.slice(line.indexOf('[')).replaceAll("'", '"')), [...WARMED]);
});

test('the keys are the ones main has saved since #262, so no cache is orphaned', () => {
	assert.deepEqual(keys('Linux', '1.64.1', 'chromium webkit', '44486395909-1'), {
		browsers: 'playwright-Linux-1.64.1-chromium webkit',
		browsersRestore: ['playwright-Linux-1.64.1-chromium firefox webkit'],
		apt: 'playwright-apt-Linux-1.64.1-chromium webkit-44486395909-1',
		aptRestore: ['playwright-apt-Linux-1.64.1-chromium webkit-', 'playwright-apt-Linux-1.64.1-chromium firefox webkit-'],
	});
	assert.equal(setOf('Linux', '1.64.1', 'playwright-apt-Linux-1.64.1-chromium firefox webkit-44442816065-1'), 'chromium firefox webkit');
	assert.equal(setOf('Linux', '1.64.1', 'playwright-Linux-1.64.1-chromium'), 'chromium');
	assert.equal(setOf('Linux', '1.64.1', 'node-cache-Linux-x64-pnpm-7e91'), undefined);
});

test('the restored set is named by comparing sets, not by whether the key is this set\'s', () => {
	assert.equal(relation('chromium webkit', 'webkit chromium'), 'own');
	assert.equal(relation('chromium webkit', 'chromium firefox webkit'), 'superset');
	assert.equal(relation('chromium webkit', 'chromium'), 'subset');
	assert.equal(relation('chromium webkit', 'firefox'), 'other');
	assert.equal(relation('chromium webkit', undefined), 'none');
});

// actions/cache matches each of key and restore-keys exactly first, then as a prefix of a saved key. "chromium" is a prefix of
// "chromium webkit" and "chromium firefox webkit", so the primary key is matched as a prefix too here, the stricter reading.
test('no set can match a cache saved for a set missing one of its browsers, even by prefix', () => {
	const saved = WARMED.flatMap((set) => {
		const k = keys('Linux', '1.64.1', set, '44442816065-1');
		return [k.browsers, k.apt];
	});
	for (const set of WARMED) {
		const k = keys('Linux', '1.64.1', set, '44486395909-1');
		for (const [wanted, candidates] of [[k.browsers, k.browsersRestore], [k.apt, k.aptRestore]] as const) {
			for (const probe of [wanted, ...candidates]) {
				for (const hit of saved.filter((key) => key.startsWith(probe))) {
					const r = relation(set, setOf('Linux', '1.64.1', hit));
					assert.ok(r === 'own' || r === 'superset', `${set}: ${probe} matches ${hit}, a ${r}`);
				}
			}
		}
	}
});
