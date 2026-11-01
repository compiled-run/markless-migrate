import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { StepResult } from '../src/check/journeys.ts';
import { answerFloor, fisherGreater, judgeInTurn, judgeTiming, type Samples } from '../src/check/timing-verdicts.ts';

const step = (answeredMs: number, requests: string[] = []) => ({ requests, reaction: { answeredMs } }) as unknown as StepResult;

test("the route's noise floor is how far apart its old runs answer the same step, steps that ask a server left out", () => {
	const a = [[step(100), step(200)], [step(50), step(400, ['GET /x'])]];
	const b = [[step(140), step(210)], [step(300), step(90, ['GET /x'])]];
	// Gaps 40, 10 and 250 ms: the 95th percentile is the largest of three.
	assert.equal(answerFloor([a, b]), 250);
	assert.equal(answerFloor([]), 0);
});

test('Fisher exact: a view the new page shows every time and the old never does is beyond chance only with enough runs', () => {
	assert.ok(Math.abs(fisherGreater(0, 5, 4, 4) - 1 / 126) < 1e-9);
	assert.equal(fisherGreater(0, 2, 1, 1), 1 / 3);
	assert.equal(fisherGreater(2, 5, 2, 4) > 0.3, true);
});

// The corpus A/A run (identical pages, a busy runner): a step's first answers 527 ms on old and 843 ms on new once, then the
// samples overlap. A real slowdown (a chart switch at 450 ms against 1 ms) holds in every sample.
const noise: Samples = { kind: 'answer', old: [527, 498, 812, 560, 905], next: [843, 610, 530, 880] };
const slow: Samples = { kind: 'answer', old: [1, 2, 1, 3, 1], next: [450, 462, 448, 470] };
const flicker: Samples = { kind: 'shown', old: [false, false, true, false, false], next: [true, false, true, false] };
const placeholder: Samples = { kind: 'shown', old: [false, false, false, false, false], next: [true, true, true, true] };

test("a timing difference stands only when every sample says so, the route's candidates sharing one significance", () => {
	const [n, s, f, p] = judgeTiming([noise, slow, flicker, placeholder], 100);
	assert.equal(n!.stands, false);
	assert.equal(s!.stands, true, JSON.stringify(s));
	assert.equal(f!.stands, false);
	assert.equal(p!.stands, true, JSON.stringify(p));
	// Five candidates: the smallest p must be under 0.01, which 5 old against 4 new samples apart reach (0.008).
	const five = judgeTiming([slow, noise, noise, noise, noise], 100);
	assert.equal(five[0]!.stands, true);
	assert.equal(five[0]!.alpha, 0.01);
});

test('a later answer the samples tell apart is still not red when it is within the noise floor or under 1.5 times the old', () => {
	const consistent: Samples = { kind: 'answer', old: [300, 310, 305, 302, 308], next: [520, 525, 518, 530] };
	assert.equal(judgeTiming([consistent], 100)[0]!.stands, true);
	assert.equal(judgeTiming([consistent], 250)[0]!.stands, false, 'a route whose old runs differ by 250 ms tells no 215 ms from the machine');
	const small: Samples = { kind: 'answer', old: [1000, 1001, 1002, 1003, 1004], next: [1200, 1201, 1202, 1203] };
	assert.equal(judgeTiming([small], 100)[0]!.stands, false);
});

test('a route with more real slowdowns than one batch reports every one; a batch where one does not stand ends the judging', async () => {
	const judge = (batch: readonly Samples[]) => judgeTiming(batch, 100);
	const seven = await judgeInTurn(7, 5, async () => slow, judge);
	assert.deepEqual(seven.map((v) => [v.judged.stands, v.among]), [...Array(5).fill([true, 5]), ...Array(2).fill([true, 2])]);
	const sampled: number[] = [];
	const mixed = await judgeInTurn(7, 5, async (i) => (sampled.push(i), i === 4 ? noise : slow), judge);
	assert.deepEqual(sampled, [0, 1, 2, 3, 4], 'the second batch is not timed again');
	assert.deepEqual(mixed.map((v) => v.judged.stands), [true, true, true, true, false]);
});
