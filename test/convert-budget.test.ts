import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BUDGET, overBudget } from '../scripts/convert-budget.ts';

const measure = (peakLiveMb: number, peakHeapMb: number) => ({ routes: 60, seconds: 130, peakLiveMb, peakHeapMb, peakRssMb: 600 });

test('the convert budget passes the fixed tree and fails both regressions it was measured against', () => {
	assert.deepEqual(overBudget(measure(144, 251)), []);
	assert.equal(overBudget(measure(208, 612)).length, 2, 'b46d038b: every class oracle at once, and every layer parsed at once');
	assert.deepEqual(overBudget(measure(144, 507)), [`peak heap used: 507 MB, over ${BUDGET.heapMb} MB`], '315d4e99: every layer parsed at once');
});
