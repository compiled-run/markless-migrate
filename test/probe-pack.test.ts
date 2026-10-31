import assert from 'node:assert/strict';
import { test } from 'node:test';
import { costsFrom, packByCost } from '../scripts/probe/pack.ts';

test('routes are packed longest first by their last cost, so the slowest bin is near the even share', () => {
	const costs = new Map([['/a', 900], ['/b', 100], ['/c', 400], ['/d', 400], ['/e', 300], ['/f', 100]]);
	const bins = packByCost(['/a', '/b', '/c', '/d', '/e', '/f'], costs, 2);
	assert.deepEqual(bins.flat().sort(), ['/a', '/b', '/c', '/d', '/e', '/f']);
	const load = bins.map((b) => b.reduce((s, r) => s + costs.get(r)!, 0));
	assert.deepEqual(load.sort((x, y) => x - y), [1100, 1100]);
	// Dealt in turn, the same routes leave one bin at 1600 and the other at 600.
	assert.deepEqual(packByCost(['/a', '/b', '/c', '/d', '/e', '/f'], costs, 2), bins);
});

test('a route with no cost yet counts as the median of those measured, and with none measured routes are dealt evenly', () => {
	const bins = packByCost(['/new', '/a', '/b', '/c'], new Map([['/a', 100], ['/b', 300], ['/c', 1000]]), 2);
	assert.deepEqual(bins.map((b) => [...b].sort()), [['/c'], ['/a', '/b', '/new']]);
	assert.deepEqual(packByCost(['/a', '/b', '/c', '/d'], new Map(), 2).map((b) => b.length), [2, 2]);
	assert.deepEqual(packByCost(['/a'], new Map(), 3), [['/a'], [], []]);
});

test('the costs are the per-route times a probe run wrote, the longest when a route was probed twice', () => {
	const lines = ['{"route":"/a","engine":"chromium","ms":500}', '', '{"route":"/a","engine":"chromium","ms":700}', '{"route":"/b","engine":"webkit","ms":40}', 'not json'];
	assert.deepEqual([...costsFrom(lines, 'chromium')], [['/a', 700]]);
	assert.deepEqual([...costsFrom(lines, 'webkit')], [['/b', 40]]);
});
