import assert from 'node:assert/strict';
import { test } from 'node:test';
import { samePath } from '../src/check/svg-path.ts';

test('a straight edge drawn as a cubic with its control points anywhere on the line is the same path (Mermaid shapes through rough.js)', () => {
	const old = 'path("M -84.1641 -24 C -29.6744 -24 24.8152 -24 84.1641 -24 C 84.7791 -23.9803 85.3941 -23.9606 85.7017 -23.9507")';
	const next = 'path("M -84.1641 -24 C -28.0306 -24 28.1029 -24 84.1641 -24 C 84.6885 -23.9832 85.2129 -23.9664 85.7017 -23.9507")';
	assert.ok(samePath(old, next));
});

test('a cubic that bows off its chord, a moved end point, or another command list is a different path', () => {
	assert.ok(!samePath('path("M 0 0 C 10 20 30 20 40 0")', 'path("M 0 0 C 10 0 30 0 40 0")'), 'a curve is not the line between its ends');
	assert.ok(!samePath('path("M 0 0 C 10 0 30 0 40 0")', 'path("M 0 0 C 10 0 30 0 42 0")'));
	assert.ok(!samePath('path("M 0 0 L 40 0")', 'path("M 0 0 L 40 0 Z")'));
	assert.ok(!samePath('path("M 0 0 C 50 0 60 0 40 0")', 'path("M 0 0 L 40 0")'), 'control points past the end overshoot it');
	assert.ok(!samePath('path("m 0 0 l 40 0")', 'path("m 0 0 l 41 0")'), 'relative commands compare as written');
});
