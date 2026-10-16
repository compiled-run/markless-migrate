import assert from 'node:assert/strict';
import { test } from 'node:test';
import { diffFields, diffLines, fieldTemplates, lineTemplates, template } from '../src/check/noise.ts';

test('a line that never changed between OLD loads must match exactly', () => {
	const m = template('Home', 'Home');
	assert.equal(m.noisy, false);
	assert.ok(m.test('Home'));
	assert.ok(!m.test('Home page'));
});

test('a noisy line keeps its stable words and lets every number vary', () => {
	const m = template('Page rendered at 2026-10-16T05:47:57.922Z', 'Page rendered at 2026-10-16T05:47:58.101Z');
	assert.ok(m.test('Page rendered at 2026-10-16T05:48:00.384Z'), 'digits that were equal in both OLD loads may still move');
	assert.ok(!m.test('Page built at 2026-10-16T05:48:00.384Z'), 'a stable word changed');
	assert.ok(!m.test('Page rendered at soon'));
});

test('lines that only one OLD load had are optional, everything else is required', () => {
	const templates = lineTemplates(['a', 'ad slot', 'b'], ['a', 'b']);
	assert.deepEqual(diffLines(templates, ['a', 'b']), { missing: [], unexpected: [], changed: [] });
	assert.deepEqual(diffLines(templates, ['a']), { missing: ['b'], unexpected: [], changed: [] });
});

test('line diffs name missing, unexpected and changed lines', () => {
	const templates = lineTemplates(['title', 'one', 'two'], ['title', 'one', 'two']);
	const diff = diffLines(templates, ['title', 'uno', 'two', 'three']);
	assert.deepEqual(diff.changed, [{ expected: 'one', actual: 'uno' }]);
	assert.deepEqual(diff.unexpected, ['three']);
	assert.deepEqual(diff.missing, []);
});

test('field diffs report changed, missing and added keys, but not keys only one OLD load had', () => {
	const expected = fieldTemplates({ title: 'A', canonical: '/a', 'jsonld[0].dateModified': '2026-10-16' }, { title: 'A', canonical: '/a', 'meta:ad': 'x', 'jsonld[0].dateModified': '2026-10-17' });
	assert.deepEqual(diffFields(expected, { title: 'A', canonical: '/a', 'jsonld[0].dateModified': '2026-10-18' }), []);
	assert.deepEqual(diffFields(expected, { title: 'B', 'meta:robots': 'noindex', 'jsonld[0].dateModified': '2026-10-18' }), [
		{ key: 'title', expected: 'A', actual: 'B' },
		{ key: 'canonical', expected: '/a', actual: undefined },
		{ key: 'meta:robots', expected: undefined, actual: 'noindex' },
	]);
});
