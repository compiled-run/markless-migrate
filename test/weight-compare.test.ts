import assert from 'node:assert/strict';
import { test } from 'node:test';
import { weightAllowed, weightFailures } from '../src/check/compare.ts';
import type { RouteCapture, ScriptWeight } from '../src/check/types.ts';

const script = (url: string, content: string, executed: number, bytes = 40_000): ScriptWeight => ({ url, bytes, source: executed * 2, executed, content });
const capture = (scripts: ScriptWeight[]): RouteCapture => ({ pages: { desktop: { weight: { downloaded: scripts.reduce((n, s) => n + s.bytes, 0), source: 0, executed: scripts.reduce((n, s) => n + s.executed, 0), scripts } } } }) as unknown as RouteCapture;

// One build names its chunks a-1.js and b-1.js, a rebuild of the same source names them a-2.js and b-2.js.
const old = [capture([script('/a-1.js', 'react', 150_000), script('/b-1.js', 'page', 50_000)]), capture([script('/a-1.js', 'react', 150_000), script('/b-1.js', 'page', 50_000)])];

test('a rebuild that names its chunks differently runs the same bytes and is within the allowance', () => {
	assert.equal(weightAllowed(old, 'executed'), 200_000 + 4_000);
	assert.deepEqual(weightFailures('/', old, capture([script('/a-2.js', 'react', 150_000), script('/b-2.js', 'page', 50_000)])), []);
});

test('more code run from a chunk the old page also runs is named as that chunk running more, not as a new-only script', () => {
	const [f] = weightFailures('/', old, capture([script('/a-2.js', 'react', 155_000), script('/b-2.js', 'page', 50_000)]));
	assert.equal(f?.check, 'JavaScript run at load');
	assert.equal(f?.actual, '205000 bytes; ran more of: /a-2.js (+5000 B)');
});

test('a script only the new page runs is listed as new-only', () => {
	const f = weightFailures('/', old, capture([script('/a-2.js', 'react', 150_000), script('/b-2.js', 'page', 50_000), script('/c.js', 'extra', 9_000, 4_000)])).find((x) => x.check === 'JavaScript run at load');
	assert.equal(f?.actual, '209000 bytes; new-only scripts: /c.js (9000 B)');
});
