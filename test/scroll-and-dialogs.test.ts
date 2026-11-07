import assert from 'node:assert/strict';
import { test } from 'node:test';
import { judgeDialogs, moving, type DialogRun } from '../src/check/dialogs-compare.ts';
import { judgeScroll } from '../src/check/scroll-motion-compare.ts';

test('judges: a dialog alike on both sides is not red; one whose second old run varies its motion is not held to the first', () => {
	const run = (enter: number[], exit: number[], box = '400,280,480,240'): DialogRun => ({ enter: [{ t: 0 }, ...enter.map((t) => ({ t, box, opacity: 1 }))], exit: [...exit.map((t) => ({ t, box, opacity: 0.5 })), { t: (exit.at(-1) ?? 0) + 16 }] });
	assert.equal(moving(run([16, 50, 100, 200], []).enter, false), 184);
	assert.equal(moving(run([16], []).enter, false), 0);
	const row = (olds: DialogRun[], next: DialogRun) => ({ viewports: [{ viewport: 'desktop', width: 1280, height: 800, dialogs: [{ journey: 'click button "Open"', olds, next }] }] });
	assert.deepEqual(judgeDialogs('/', row([run([16, 50, 100, 200], [0, 30, 60, 150])], run([16, 60, 110, 210], [0, 40, 70, 160]))), []);
	assert.deepEqual(judgeDialogs('/', row([run([16, 50, 100, 200], [0, 30, 60, 150]), run([16], [0, 30, 60, 150])], run([16], [0, 40, 70, 160]))), []);
	assert.equal(judgeDialogs('/', row([run([16, 50, 100, 200], [0, 30, 60, 150])], run([16, 50, 100, 200], [0, 30, 60, 150], '0,280,1280,240'))).length, 1);
	assert.deepEqual(judgeScroll('/', { viewports: [{ viewport: 'desktop', olds: [{ positions: ['down 0%'], tracks: [] }] }] }), []);
});
