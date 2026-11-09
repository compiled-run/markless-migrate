// A step becomes a retime candidate because its first new run answered later than every old run. Those first runs only
// pick the candidate: the significance test reads the fresh rounds timed one side at a time, never the runs it was chosen by.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { timedOnly } from '../src/check/journeys-compare.ts';
import type { Journey, StepResult } from '../src/check/journeys.ts';
import { retime, type Observe, type RetimeRound } from '../src/check/route-judge.ts';
import { judgeTiming } from '../src/check/timing-verdicts.ts';
import type { Failure } from '../src/check/types.ts';

const step = (answeredMs: number) => ({ requests: [], reaction: { answeredMs } }) as unknown as StepResult;
const journey: Journey = { name: 'click Save', steps: [{ action: 'click', target: { role: 'button', name: 'Save' } }] } as unknown as Journey;

/** One timed-only failure: old runs answered at `olds`, the new run at `mine`; the retime rounds answer at `rounds`. */
async function judged(olds: readonly number[], mine: number, rounds: { readonly old: readonly number[]; readonly next: readonly number[] }) {
	const failure: Failure = { route: '/', dimension: 'behaviour', check: 'click Save: answer time', expected: '', actual: `answered after ${mine} ms`, hint: '' };
	timedOnly.set(failure, { journey: 0, step: 0 });
	const asked: string[] = [];
	const o = (async (stage: string) => {
		asked.push(stage);
		if (stage !== 'retime') throw new Error(`unexpected ${stage}`);
		return rounds.old.map((ms, k): RetimeRound => ({ old: [step(ms)], next: [step(rounds.next[k]!)] }));
	}) as Observe;
	const out = await retime(o, 'main', [journey], [failure], olds.map((ms) => [[step(ms)]]), [[step(mine)]]);
	return { asked, stands: out.length === 1, actual: out[0]?.actual ?? '' };
}

test('a chance difference the first runs alone made is not significant once only the fresh rounds count', async () => {
	// The machine was busy for the new side's first run; the fresh rounds overlap, a busy round now on one side, now the other.
	const rounds = { old: [250, 600, 260, 640, 280], next: [620, 270, 650, 300, 660] };
	assert.equal(judgeTiming([{ kind: 'answer', old: [200, 210, ...rounds.old], next: [900, ...rounds.next] }], 100)[0]!.stands, true, 'counting the runs that picked it, chance reads as a slowdown');
	const { asked, stands } = await judged([200, 210], 900, rounds);
	assert.deepEqual(asked, ['retime'], 'the step was a candidate and timed again');
	assert.equal(stands, false);
});

test('a real slowdown still stands on the fresh rounds alone, which the verdict lists', async () => {
	const { stands, actual } = await judged([100, 105], 600, { old: [100, 110, 95, 105, 102], next: [590, 610, 605, 600, 620] });
	assert.equal(stands, true);
	assert.ok(actual.includes('old 100, 110, 95, 105, 102 ms, new 590, 610, 605, 600, 620 ms'), actual);
});
