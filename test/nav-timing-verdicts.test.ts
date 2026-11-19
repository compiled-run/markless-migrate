import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { NavCell, NavClick, NavRun, RouteNavTiming } from '../src/check/nav-timing.ts';
import { byteRows, navRows, navTally, navTimingFailures } from '../src/check/nav-timing-verdicts.ts';

const click = (ms: number, more: Partial<NavClick> = {}): NavClick => ({ target: '/a', kind: 'first', ms, ahead: 'none', fetched: true, served: false, bytesBefore: 0, bytesAfter: 20_000, dataAfter: 20_000, fullLoad: false, ...more });
const run = (clicks: NavClick[]): NavRun => ({ clicks });
const cell = (old: NavRun[], next: NavRun[], more: Partial<NavCell> = {}): NavCell => ({ browser: 'chromium', profile: 'fast', mode: 'dwell-250', steps: [], old, new: next, ...more });
const timing = (...cells: NavCell[]): RouteNavTiming => ({ route: '/docs', cells, ms: 0 });

// A seeded stream, so the simulation is the same on every run.
function seeded(seed: number): () => number {
	let s = seed >>> 0;
	return () => ((s = (Math.imul(s ^ (s >>> 15), 2246822507) + 0x9e3779b9) >>> 0) / 2 ** 32);
}
const noisy = (rand: () => number, base: number) => Math.round(base * (0.85 + 0.3 * rand()) + (rand() < 0.1 ? 120 * rand() : 0));
const runs = (rand: () => number, base: number, n = 4, clicks = 4, more: (i: number) => Partial<NavClick> = () => ({})) => Array.from({ length: n }, () => run(Array.from({ length: clicks }, (_, i) => click(noisy(rand, base), more(i)))));

test('identical sides go red on few routes: Holm over the route\'s rows keeps the false alarms near the significance level', () => {
	const rand = seeded(7);
	let red = 0;
	const ROUTES = 200;
	for (let i = 0; i < ROUTES; i++) {
		const cells = (['fast', 'cpu-4x', 'slow-4g'] as const).flatMap((profile) => (['instant', 'dwell-250', 'touch'] as const).map((mode) => cell(runs(rand, profile === 'slow-4g' ? 600 : 150), runs(rand, profile === 'slow-4g' ? 600 : 150), { profile, mode })));
		if (navTimingFailures('/r', timing(...cells)).length) red++;
	}
	assert.ok(red / ROUTES <= 0.06, `${red} of ${ROUTES} identical routes red`);
});

test('a port 100 ms later on one row is red there, with its cause', () => {
	const rand = seeded(11);
	const old = runs(rand, 150, 4, 4, () => ({ ahead: 'arrived', served: true, fetched: false, dataAfter: 0 }));
	const next = runs(rand, 250);
	const rows = navRows(timing(cell(old, next)));
	const first = rows.find((r) => r.kind === 'first')!;
	assert.equal(first.verdict, 'slower');
	assert.equal(first.cause, 'not prefetched');
	const failures = navTimingFailures('/docs', timing(cell(old, next)));
	assert.equal(failures.length, 1);
	assert.match(failures[0]!.check, /navigation timing: chromium, a fast line, link pressed 250 ms after the pointer arrives, first visit/);
	assert.match(failures[0]!.actual, /not prefetched$/);
});

test('causes: a revisit fetched again, a prefetch cancelled, a larger payload, a busy main thread', () => {
	const rand = seeded(3);
	const revisit = (ms: number, served: boolean) => click(ms, { kind: 'revisit', served, fetched: !served });
	const rv = navRows(timing(cell(Array.from({ length: 4 }, () => run([1, 2, 3, 4].map(() => revisit(noisy(rand, 80), true)))), Array.from({ length: 4 }, () => run([1, 2, 3, 4].map(() => revisit(noisy(rand, 400), false)))))));
	assert.equal(rv.find((r) => r.kind === 'revisit')!.cause, 'refetched on revisit');
	const cancelled = navRows(timing(cell(runs(rand, 150, 4, 4, () => ({ ahead: 'arrived', served: true, fetched: false })), runs(rand, 300, 4, 4, () => ({ ahead: 'cancelled' })))));
	assert.equal(cancelled[0]!.cause, 'prefetch cancelled');
	const late = navRows(timing(cell(runs(rand, 150, 4, 4, () => ({ ahead: 'arrived', served: true, fetched: false })), runs(rand, 300, 4, 4, () => ({ ahead: 'arriving', served: true, fetched: false })))));
	assert.equal(late[0]!.cause, 'prefetched too late');
	const payload = navRows(timing(cell(runs(rand, 150), runs(rand, 300, 4, 4, () => ({ dataAfter: 60_000 })))));
	assert.equal(payload[0]!.cause, 'larger payload');
	const busy = navRows(timing(cell(runs(rand, 150, 4, 4, () => ({ mainThreadMs: 10 })), runs(rand, 300, 4, 4, () => ({ mainThreadMs: 150 })))));
	assert.equal(busy[0]!.cause, 'main thread');
});

test('a port faster beyond noise is counted as faster, and the tally gives each profile its counts and median gap', () => {
	const rand = seeded(5);
	const rows = navRows(timing(cell(runs(rand, 300), runs(rand, 150)), cell(runs(rand, 600), runs(rand, 600), { profile: 'slow-4g' })));
	assert.equal(rows[0]!.verdict, 'faster');
	const tally = navTally(rows);
	assert.equal(tally.find((t) => t.profile === 'fast')!.faster, 1);
	assert.ok(tally.find((t) => t.profile === 'fast')!.medianGap! < 0);
});

test('bytes before the presses over 1.5 times the original\'s are red; where the original fetched nothing ahead they are not judged', () => {
	const rand = seeded(9);
	const over = timing(cell(runs(rand, 150, 4, 4, () => ({ bytesBefore: 10_000 })), runs(rand, 150, 4, 4, () => ({ bytesBefore: 30_000 }))));
	assert.deepEqual(byteRows(over).map((b) => b.ok), [false]);
	assert.ok(navTimingFailures('/docs', over).some((f) => /bytes before the presses/.test(f.check)));
	const none = timing(cell(runs(rand, 150), runs(rand, 150, 4, 4, () => ({ bytesBefore: 30_000 }))));
	assert.deepEqual(byteRows(none).map((b) => b.ok), [true]);
});

test('a port press that never shows the next page is red, not left out', () => {
	const rand = seeded(13);
	const never = Array.from({ length: 4 }, () => run([click(0, { ms: undefined, error: 'no new content within 20 s' })]));
	const rows = navRows(timing(cell(runs(rand, 150), never)));
	assert.equal(rows[0]!.verdict, 'slower');
	assert.equal(navTimingFailures('/docs', timing(cell(runs(rand, 150), never))).length, 1);
});
