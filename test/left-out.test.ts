import assert from 'node:assert/strict';
import { test } from 'node:test';
import { leftOut } from '../src/check/run.ts';

test('keyboard journeys and repeated-use sequences the budget left out turn the route red, saying how many', () => {
	assert.deepEqual(leftOut('/', { skipped: 0 }), []);
	const [keys, cycles] = leftOut('/', { skipped: 3, sequencesSkipped: 1 });
	assert.equal(keys!.check, 'not exercised: 3 keyboard journeys');
	assert.equal(cycles!.check, 'not exercised: 1 repeated-use or closing sequence');
	assert.equal(keys!.dimension, 'behaviour');
	assert.match(keys!.actual, /raise --max-journeys/);
});
