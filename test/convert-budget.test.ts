import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ANCHOR, BUDGET, judgePaired, overBudget } from '../scripts/convert-budget.ts';

const measure = (peakLiveMb: number, peakHeapMb: number, cpuSeconds = 90, matchMs = 20) => ({ routes: 60, seconds: 130, cpuSeconds, matchMs, peakLiveMb, peakHeapMb, peakRssMb: 600 });

test('the convert budget passes the fixed tree and fails both regressions it was measured against', () => {
	assert.deepEqual(overBudget(measure(144, 251)), []);
	assert.equal(overBudget(measure(208, 612)).length, 2, 'b46d038b: every class oracle at once, and every layer parsed at once');
	assert.deepEqual(overBudget(measure(144, 507)), [`peak heap used: 507 MB, over ${BUDGET.heapMb} MB`], '315d4e99: every layer parsed at once');
});

test('the convert budget fails a convert that looks for each React-state component by walking every page again', () => {
	assert.deepEqual(overBudget(measure(144, 251, 90, 20)), []);
	assert.deepEqual(overBudget(measure(144, 251, 90, 3830)), [`React-state matching: 3830 ms, over ${BUDGET.matchMs} ms`], '6ac0281a: every component walked every page and read each element\'s siblings again');
});

test('convert CPU time is not judged on its own: the same tree reads 79 s on one runner and 125 s on another', () => {
	assert.deepEqual(overBudget(measure(144, 251, 158)), []);
});

test('head is judged at the bound\'s speed: its CPU time over main\'s on the same runner, times main\'s anchor', () => {
	const anchor = 100;
	const fast = judgePaired([60, 61], [66], anchor);
	assert.equal(fast.base, 60);
	assert.equal(fast.ratio, 1.1);
	assert.equal(fast.atBoundSpeed, 110);
	const slow = judgePaired([95, 96], [104.5], anchor);
	assert.equal(slow.atBoundSpeed, 110, 'a runner 1.6 times slower gives the same figure');
	assert.deepEqual([fast.over, slow.over], [undefined, undefined]);
	const heavy = judgePaired([60, 60], [75], anchor);
	assert.equal(heavy.atBoundSpeed, 125);
	assert.equal(heavy.over, `convert CPU time at the bound's speed: 125 s, over ${BUDGET.cpuSeconds} s`);
});

test('one bad main reading neither passes nor fails a change: the lower of the two is taken, which only makes head\'s figure larger', () => {
	assert.equal(judgePaired([60, 158], [66], 100).atBoundSpeed, 110, 'a slow main reading would have scaled head down to 42 s');
	assert.equal(judgePaired([158, 60], [66], 100).atBoundSpeed, 110);
});

test('one bad head reading does not fail a change: an over or off-anchor head is read again and the lower taken', () => {
	const first = judgePaired([60, 60], [99], 100);
	assert.equal(first.readHeadAgain, true);
	const again = judgePaired([60, 60], [99, 61], 100);
	assert.equal(again.readHeadAgain, false);
	assert.equal(again.atBoundSpeed, 102);
	assert.deepEqual([again.over, again.stale], [undefined, undefined]);
	assert.equal(judgePaired([60, 60], [99, 98], 100).over, `convert CPU time at the bound's speed: 163 s, over ${BUDGET.cpuSeconds} s`, 'a head that is heavy twice fails');
});

test('a change that moves the convert\'s cost past the anchor\'s margin moves the anchor with it, so main\'s anchor stays its cost', () => {
	const heavier = judgePaired([60, 60], [69, 69], 100);
	assert.equal(heavier.atBoundSpeed, 115);
	assert.equal(heavier.stale, 'stale anchor: this tree converts in 115 s at the bound\'s speed against an anchor of 100 s (margin 10%); set ANCHOR.cpuSeconds to 115 in this change');
	assert.equal(judgePaired([60, 60], [69, 69], 100, 115).stale, undefined, 'the change that sets it passes, scaled by main\'s own anchor');
	assert.match(judgePaired([60, 60], [48, 48], 100).stale ?? '', /set ANCHOR.cpuSeconds to 80/, 'a lighter convert re-anchors too');
	assert.equal(judgePaired([60, 60], [63, 63], 100).stale, undefined, 'within the margin');
	assert.equal(ANCHOR.margin, 0.1);
});
