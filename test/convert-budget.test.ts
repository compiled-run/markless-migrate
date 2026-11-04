import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BUDGET, overBudget } from '../scripts/convert-budget.ts';

const measure = (peakLiveMb: number, peakHeapMb: number, cpuSeconds: number = BUDGET.cpuSeconds, matchMs = 20) => ({ routes: 60, seconds: 130, cpuSeconds, matchMs, peakLiveMb, peakHeapMb, peakRssMb: 600 });

test('the convert budget passes the fixed tree and fails both regressions it was measured against', () => {
	assert.deepEqual(overBudget(measure(144, 251)), []);
	assert.equal(overBudget(measure(208, 612)).length, 2, 'b46d038b: every class oracle at once, and every layer parsed at once');
	assert.deepEqual(overBudget(measure(144, 507)), [`peak heap used: 507 MB, over ${BUDGET.heapMb} MB`], '315d4e99: every layer parsed at once');
});

test('the convert budget fails a convert that looks for each React-state component by walking every page again', () => {
	assert.deepEqual(overBudget(measure(144, 251, BUDGET.cpuSeconds, 20)), []);
	assert.deepEqual(overBudget(measure(144, 251, BUDGET.cpuSeconds, 3830)), [`React-state matching: 3830 ms, over ${BUDGET.matchMs} ms`], '6ac0281a: every component walked every page and read each element\'s siblings again');
	assert.deepEqual(overBudget(measure(144, 251, BUDGET.cpuSeconds + 1)), [`convert CPU time: ${BUDGET.cpuSeconds + 1} s, over ${BUDGET.cpuSeconds} s`]);
});
