import assert from 'node:assert/strict';
import { test } from 'node:test';
import { choppier, lostTweens, type StepResult } from '../src/check/journeys.ts';

const step = (reaction: StepResult['reaction']): StepResult => ({ url: '/', added: [], removed: [], requests: [], errors: [], announcements: [], focus: 'body', navigated: false, ...(reaction ? { reaction } : {}) });
const views = (swaps: number, spanMs: number, longestGapMs: number) => step({ regions: [], changes: [], views: { swaps, interimMs: spanMs, interim: [], spanMs, longestGapMs } });
const tweens = (...lines: string[]) => step({ regions: [], changes: [], tweened: lines });

test('a reply the original streams in many small changes and the port in a few bursts, or all at once, is choppier', () => {
	const old = [views(38, 1520, 50), views(36, 1500, 60)];
	assert.match(choppier(old, views(5, 1300, 330)) ?? '', /old: in 38 changes over 1520 ms, at most 50 ms apart; new: in 5 changes over 1300 ms, at most 330 ms apart/);
	assert.match(choppier(old, views(1, 0, 0)) ?? '', /new: all at once/);
});

test('the same stream a few frames short, a step the original answers at once, and one without views are not choppier', () => {
	const old = [views(38, 1520, 50), views(36, 1500, 60)];
	assert.equal(choppier(old, views(30, 1480, 70)), undefined);
	assert.equal(choppier([views(2, 40, 0)], views(1, 0, 0)), undefined);
	assert.equal(choppier(old, step(undefined)), undefined);
});

test('a shape every old run tweens over frames that the port jumps to, or never moves, is lost; one tweened on both sides is not', () => {
	const old = [tweens('path in main d|24|400'), tweens('path in main d|26|410')];
	assert.deepEqual(lostTweens(old, tweens('path in main d|1|0')), ['path in main d over 24 frames (400 ms)']);
	assert.deepEqual(lostTweens(old, tweens()), ['path in main d over 24 frames (400 ms)']);
	assert.deepEqual(lostTweens(old, tweens('path in main d|20|380')), []);
	// Moved in one old run only: noise, not the original's motion.
	assert.deepEqual(lostTweens([tweens('path in main d|24|400'), tweens('path in main d|1|0')], tweens()), []);
});
