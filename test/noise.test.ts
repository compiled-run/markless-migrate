import assert from 'node:assert/strict';
import { test } from 'node:test';
import { diffFields, diffLines, diffLines as diffAt, fieldTemplates, lineTemplates, template } from '../src/check/noise.ts';

test('a line that never changed between OLD loads must match exactly', () => {
	const m = template('Home', 'Home');
	assert.equal(m.noisy, false);
	assert.ok(m.test('Home'));
	assert.ok(!m.test('Home page'));
});

test('a noisy line may vary only where the OLD loads differed, and digits stay digits', () => {
	const m = template('Page rendered at 2026-10-16T05:47:57.922Z', 'Page rendered at 2026-10-16T05:47:58.101Z');
	assert.ok(m.test('Page rendered at 2026-10-16T05:47:59.384Z'));
	assert.ok(!m.test('Page rendered at 2026-10-16T05:48:00.384Z'), 'the minute was stable in both OLD loads');
	assert.ok(!m.test('Page built at 2026-10-16T05:47:59.384Z'), 'a stable word changed');
	assert.ok(!m.test('Page rendered at 2026-10-16T05:47:ab.384Z'), 'digits became letters');
});

test('a third OLD load widens the varying positions it confirms', () => {
	const m = template('Page rendered at 05:47:57', 'Page rendered at 05:47:58', 'Page rendered at 05:48:01');
	assert.ok(m.test('Page rendered at 05:48:00'));
	assert.ok(!m.test('Page rendered at 06:48:00'), 'the hour never varied');
});

test('a noisy line whose token count changed still pins its stable words', () => {
	const m = template('Updated 5 seconds ago by Ana', 'Updated 1 minute ago by Ana');
	assert.ok(m.test('Updated 3 hours ago by Ana'));
	assert.ok(!m.test('Updated 3 hours ago by Bob'));
	assert.ok(!m.test('Edited 3 hours ago by Ana'));
});

test('a hyphen, caret or bracket seen in a varying stretch stays a literal inside the character class', () => {
	const m = template('Ad: x-ray specs, now', 'Ad: carbon-free hosting, -20%');
	assert.ok(m.test('Ad: carbon-free hosting, -20%'));
	assert.ok(m.test('Ad: x-ray specs, now'));
	const caret = template('Score a^b', 'Score [c]');
	assert.ok(caret.test('Score [c]'));
});

test('lines that only some OLD loads had are optional, everything else is required', () => {
	const diffLines = (...args: Parameters<typeof diffAt>) => {
		const { at: _, ...rest } = diffAt(...args);
		return rest;
	};
	const three = lineTemplates(['a', 'b', 'c'], ['a', 'b', 'c'], ['a', 'c']);
	assert.deepEqual(diffLines(three, ['a', 'c']), { missing: [], unexpected: [], changed: [] });
	assert.deepEqual(diffLines(three, ['a', 'b']), { missing: ['c'], unexpected: [], changed: [] });
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
	assert.deepEqual(diff.at, { missing: [], unexpected: [3], changed: [{ expected: 1, actual: 1 }] }, 'where each line sits, to tell identical lines apart');
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
