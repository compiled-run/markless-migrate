import assert from 'node:assert/strict';
import { test } from 'node:test';
import { overBudget, type Measure } from '../scripts/check-budget.ts';

const ROUTE = '/docs/components/combobox';
const run = (checker: string, totalS: number, routeS: number, rssMb: number): Measure => ({ checker, totalMs: totalS * 1000, peakRssMb: rssMb, peakHeapMb: 0, routes: { [ROUTE]: routeS * 1000 }, steps: {} });

// What scripts/check-budget.ts measure gave, run after run on one machine: before #501, #501 itself, and its fix (#572).
const before = [run('0cfe3028', 264, 214, 642), run('0cfe3028', 304, 247, 553)];
const inThread = [run('ab668bac', 470, 226, 666), run('ab668bac', 458, 215, 663)];
const inWorker = [run('84a1e27d', 368, 235, 857), run('84a1e27d', 341, 212, 816)];

test('one checker against itself is within budget, either way round', () => {
	for (const pair of [before, inThread, inWorker]) {
		assert.deepEqual(overBudget(pair[0]!, pair[1]!), []);
		assert.deepEqual(overBudget(pair[1]!, pair[0]!), []);
	}
});

test("#501's real Lighthouse throttling in the check's thread is over budget against the checker before it, whichever runs are paired", () => {
	for (const base of before) for (const head of inThread) assert.match(overBudget(base, head).join('\n'), /^whole run: /m);
});

test('running each Lighthouse run in a worker is within budget against the checker it fixes', () => {
	for (const base of inThread) for (const head of inWorker) assert.deepEqual(overBudget(base, head), []);
});

test('a route with no check time on one side is over budget, never passed', () => {
	assert.match(overBudget(before[0]!, { ...before[0]!, routes: {} }).join('\n'), /no check time on head/);
});
