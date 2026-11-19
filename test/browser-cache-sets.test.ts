import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { supersets, WARMED } from '../scripts/browser-cache-sets.ts';

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
