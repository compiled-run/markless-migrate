import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Fetch, Responsiveness, Sample, SpeedTiming } from '../src/check/responsiveness.ts';
import { failuresOf, judgeResponsiveness, speeds, speedTiming, worstOf } from '../src/check/responsiveness-compare.ts';

const [desktop, throttled] = speeds(4);
const sample = (ms: number, fetches: readonly Fetch[] = []): Sample => ({ ms, result: 'changed', fetches, longTasks: [], evaluated: [] });
const tab = (timing: SpeedTiming) => {
	const controls = [{ control: 'tab "npm"', step: 'click tab "npm"', kind: 'in-page' as const, speeds: [speedTiming(desktop!, 'in-page', [sample(40)], [sample(40)], 200), timing] }];
	const responsiveness: Responsiveness = { budgetMs: 200, cpu: 4, controls, notMeasured: [], worst: worstOf(controls) };
	return judgeResponsiveness('/cli', { responsiveness, failures: failuresOf('/cli', controls, speeds(4)) });
};
const judged = (olds: readonly Sample[], news: readonly Sample[]) => {
	const out = tab(speedTiming(throttled!, 'in-page', olds, news, 200));
	return { timing: out.responsiveness.controls[0]!.speeds[1]!, failures: out.failures };
};

test('an original over the budget holds the port to the original: not slower than it passes, and both times are still shown', () => {
	const { timing, failures } = judged([sample(1253), sample(1240)], [sample(1248), sample(1250)]);
	assert.deepEqual([timing.ok, timing.problems, failures], [true, [], []]);
	assert.equal(timing.note, 'the old app is over the 200 ms budget too, so the new one is held to the old: old 1253 ms, new 1248 ms');
});

test('an original over the budget holds the port to the original: slower than it is red', () => {
	const { timing, failures } = judged([sample(1253), sample(1240)], [sample(1500), sample(1520)]);
	assert.equal(timing.ok, false);
	assert.deepEqual(timing.problems, ['slower than the old 1253 ms by more than max(16 ms, 10%, the old runs\' spread)']);
	assert.equal(failures.length, 1);
	assert.match(failures[0]!.expected, /^old 1253 ms \(runs 1253 ms, 1240 ms\); new within max\(16 ms, 10%\) of it \(the old app is over the 200 ms budget too\), fetching no code$/);
});

test('an original within the budget holds the port to the budget: over it is red even when not slower than the original', () => {
	const { timing, failures } = judged([sample(190), sample(195)], [sample(205), sample(210)]);
	assert.deepEqual([timing.ok, timing.problems, timing.note], [false, ['over the 200 ms budget'], undefined]);
	assert.match(failures[0]!.expected, /and under the budget, fetching no code$/);
});

test('an original that meets the budget in one of its runs holds the port to the budget', () => {
	const { timing } = judged([sample(190), sample(260)], [sample(262), sample(270)]);
	assert.deepEqual([timing.ok, timing.problems], [false, ['over the 200 ms budget']]);
});

test('code a link hint already in the document at the input is not code the interaction fetched; an import the handler made is', () => {
	const prefetched: Fetch = { url: '/build/chunk-idle.js', kind: 'code', bytes: 400_000, startMs: -30, hint: true };
	const imported: Fetch = { url: '/build/chunk-tab.js', kind: 'code', bytes: 2048, startMs: 4 };
	const hinted: Fetch = { url: '/build/chunk-dep.js', kind: 'code', bytes: 1024, startMs: 3 };
	const idle = judged([sample(30)], [sample(40, [prefetched])]).timing;
	assert.deepEqual([idle.ok, idle.problems, idle.cause], [true, [], undefined]);
	const both = judged([sample(30)], [sample(40, [prefetched, imported, hinted])]).timing;
	assert.deepEqual(both.problems, ['fetched code on the first interaction: /build/chunk-tab.js (2.0 kB), /build/chunk-dep.js (1.0 kB)']);
	assert.equal(both.cause, 'code fetch: /build/chunk-tab.js (2.0 kB), /build/chunk-dep.js (1.0 kB)');
	const unknown = judged([sample(30)], [sample(40, [{ url: '/c.js', kind: 'code', bytes: 2048 }])]).timing;
	assert.deepEqual(unknown.problems, ['fetched code on the first interaction: /c.js (2.0 kB)'], 'a fetch recorded without its start or initiator counts, as before');
});
