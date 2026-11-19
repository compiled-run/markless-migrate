import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_CELLS, DEFAULT_NAV_RUNS, MAX_NAV_RUNS, type NavCell, type NavClick, type NavRun, type NavStep, type RouteNavTiming } from '../src/check/nav-timing.ts';
import { bandOf, byteRows, navRows, navTally, navTimingFailures, navTimingUnmeasured } from '../src/check/nav-timing-verdicts.ts';

const STEPS: readonly NavStep[] = [
	{ target: '/a', region: 'aside', kind: 'first' },
	{ target: '/b', region: 'aside', kind: 'first' },
	{ target: '/a', region: 'aside', kind: 'revisit' },
	{ target: '/c', region: 'nav', kind: 'first' },
	{ target: '/d', region: 'nav', kind: 'first' },
	{ target: '/c', region: 'nav', kind: 'revisit' },
];
const click = (step: NavStep, ms: number | undefined, more: Partial<NavClick> = {}): NavClick => ({ target: step.target, kind: step.kind, ...(ms !== undefined ? { ms } : {}), ahead: 'none', fetched: true, served: false, bytesBefore: 0, bytesAfter: 20_000, dataAfter: 20_000, fullLoad: false, ...more });
const cell = (old: NavRun[], next: NavRun[], more: Partial<NavCell> = {}): NavCell => ({ browser: 'chromium', profile: 'fast', mode: 'dwell-250', steps: STEPS, old, new: next, ...more });
const timing = (cells: NavCell[], layouts = 4): RouteNavTiming => ({ route: '/docs', cells, ms: 0, layouts });

function seeded(seed: number): () => number {
	let s = seed >>> 0;
	return () => ((s = (Math.imul(s ^ (s >>> 15), 2246822507) + 0x9e3779b9) >>> 0) / 2 ** 32);
}
const gauss = (r: () => number) => Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(2 * Math.PI * r());
/** Runs whose presses share the run's moment on the machine (12%), each press 15% of its own, half of them waiting on data the other half had (the original's two clusters), and one in twenty stalled. */
function runs(r: () => number, base: number, n = DEFAULT_NAV_RUNS, shift = 0, more: (s: NavStep) => Partial<NavClick> = () => ({})): NavRun[] {
	return Array.from({ length: n }, () => {
		const moment = 1 + 0.12 * gauss(r);
		return { clicks: STEPS.map((s) => click(s, Math.max(1, Math.round((base + (r() < 0.5 ? 0 : 0.6 * base)) * moment * (1 + 0.15 * gauss(r)) + (r() < 0.05 ? 300 * r() : 0) + shift)), more(s))) };
	});
}
const baseOf = (profile: string) => (profile === 'slow-4g' ? 600 : profile === 'cpu-4x' ? 250 : 120);
const route = (r: () => number, shiftCell = -1, shift = 0) => timing(DEFAULT_CELLS.map((c, i) => cell(runs(r, baseOf(c.profile)), runs(r, baseOf(c.profile), DEFAULT_NAV_RUNS, i === shiftCell ? shift : 0), { ...c })));

test('identical sides: a route of every default cell goes red rarely, a check of 4 routes at most about 5% of the time', () => {
	let red = 0;
	const ROUTES = 240;
	for (const seed of [1, 2, 3]) {
		const r = seeded(seed);
		for (let i = 0; i < ROUTES / 3; i++) if (navTimingFailures('/r', route(r)).length) red++;
	}
	// Holm at 5% / 4 per route bounds a route at 1.25%; the simulation gives 0.4 to 1%, a check of 4 routes 1.6 to 3.9%.
	assert.ok(red / ROUTES <= 0.025, `${red} of ${ROUTES} identical routes red`);
});

test('100 ms added to one cell is caught on most routes, and named', () => {
	const r = seeded(42);
	let caught = 0;
	for (let i = 0; i < 40; i++) if (navRows(route(r, 0, 100)).some((x) => x.verdict === 'slower' && x.mode === DEFAULT_CELLS[0]!.mode && x.profile === DEFAULT_CELLS[0]!.profile && x.browser === 'chromium')) caught++;
	assert.ok(caught >= 28, `caught on ${caught} of 40 routes`);
});

test('a port press that never arrives is red, did not arrive, whatever the other presses did', () => {
	const r = seeded(3);
	const next = runs(r, 120);
	next[2] = { clicks: STEPS.map((s, i) => click(s, i === 1 ? undefined : 100, i === 1 ? { error: 'the address changed to /b but the page\'s content did not, in 20 s' } : {})) };
	const rows = navRows(timing([cell(runs(r, 120), next)]));
	const first = rows.find((x) => x.kind === 'first')!;
	assert.equal(first.verdict, 'slower');
	assert.equal(first.cause, 'did not arrive');
	assert.match(navTimingFailures('/docs', timing([cell(runs(r, 120), next)]))[0]!.actual, /content did not/);
	const failedRuns = Array.from({ length: 2 }, () => ({ clicks: [], error: 'page.goto: Timeout 120000ms exceeded' }));
	assert.equal(navRows(timing([cell(runs(r, 120, 2), failedRuns)]))[0]!.cause, 'did not arrive', 'a cell that stopped after two port runs with nothing shown is red');
});

test('a press the original never answers leaves the row not checked, and the route never green', () => {
	const r = seeded(4);
	const old = runs(r, 120);
	old[0] = { clicks: STEPS.map((s, i) => click(s, i === 0 ? undefined : 100, i === 0 ? { error: 'the address stayed /docs for 20 s' } : {})) };
	const t = timing([cell(old, runs(r, 120))]);
	assert.equal(navRows(t).find((x) => x.kind === 'first')!.verdict, 'not checked');
	assert.deepEqual(navTimingFailures('/docs', t), []);
	assert.match(navTimingUnmeasured(t)!, /not checked in chromium.*the original: \/a: the address stayed/);
	assert.match(navTimingUnmeasured(timing([cell([], [], { unavailable: 'ran out of time', notChecked: 'passed its 180 min deadline' })]))!, /deadline/);
	assert.equal(navTimingUnmeasured(timing([cell([], [], { unavailable: 'webkit is not installed' })])), undefined);
});

test('a bimodal original cannot hide a slowdown: its spread counts as noise up to a quarter of its median', () => {
	const two = (v: number) => Array.from({ length: DEFAULT_NAV_RUNS }, (_, i) => ({ clicks: STEPS.map((s) => click(s, v + (i % 2 ? 180 : 0))) }));
	assert.equal(bandOf([200, 380, 200, 380, 200, 380, 200, 380]), 72.5, 'the half-split spread is 180 ms; the cap is a quarter of the 290 ms median');
	const rows = navRows(timing([cell(two(200), Array.from({ length: DEFAULT_NAV_RUNS }, () => ({ clicks: STEPS.map((s) => click(s, 450)) })))]));
	assert.equal(rows[0]!.verdict, 'slower', JSON.stringify(rows[0]));
});

test('causes: not prefetched, too late, cancelled, refetched on revisit, payload, main thread', () => {
	const r = seeded(11);
	const served = (s: NavStep) => ({ ahead: 'arrived' as const, served: true, fetched: false, dataAfter: 0, ...(s.kind === 'revisit' ? {} : {}) });
	const cause = (oldMore: (s: NavStep) => Partial<NavClick>, newMore: (s: NavStep) => Partial<NavClick>, kind: 'first' | 'revisit' = 'first') =>
		navRows(timing([cell(runs(r, 120, DEFAULT_NAV_RUNS, 0, oldMore), runs(r, 120, DEFAULT_NAV_RUNS, 250, newMore))], 1)).find((x) => x.kind === kind)!.cause;
	assert.equal(cause(served, () => ({})), 'not prefetched');
	assert.equal(cause(served, () => ({ ahead: 'arriving', served: true, fetched: false })), 'prefetched too late');
	assert.equal(cause(served, () => ({ ahead: 'cancelled' })), 'prefetch cancelled');
	assert.equal(cause(served, () => ({}), 'revisit'), 'refetched on revisit');
	assert.equal(cause(() => ({}), () => ({ dataAfter: 60_000 })), 'larger payload');
	assert.equal(cause(() => ({ mainThreadMs: 10 }), () => ({ mainThreadMs: 400 })), 'main thread');
});

test('faster rows pass the same correction, and the tally counts each verdict per network', () => {
	const r = seeded(5);
	const rows = navRows(timing([cell(runs(r, 400), runs(r, 120)), cell(runs(r, 600), runs(r, 600), { profile: 'slow-4g' })], 1));
	assert.equal(rows.find((x) => x.profile === 'fast' && x.kind === 'first')!.verdict, 'faster');
	const fast = navTally(rows).find((t) => t.profile === 'fast')!;
	assert.equal(fast.faster, 2);
	assert.ok(fast.medianGap! < 0);
	const noisy = navRows(timing([cell(runs(r, 120), runs(r, 115))], 1));
	assert.ok(noisy.every((x) => x.verdict === 'same'), 'a few ms either way is level, not a win');
});

test('page data ahead of the presses is reported, never red', () => {
	const r = seeded(9);
	const t = timing([cell(runs(r, 120, DEFAULT_NAV_RUNS, 0, () => ({ bytesBefore: 10_000 })), runs(r, 120, DEFAULT_NAV_RUNS, 0, () => ({ bytesBefore: 30_000 })))]);
	assert.deepEqual(byteRows(t).map((b) => b.over), [true]);
	assert.ok(!navTimingFailures('/docs', t).some((f) => /bytes|data ahead/.test(f.check)));
});

test('data from another host is named, not matched', () => {
	const r = seeded(10);
	const t = timing([cell(runs(r, 120), runs(r, 120, DEFAULT_NAV_RUNS, 0, () => ({ otherHosts: ['api.example'] })))]);
	assert.deepEqual(navRows(t)[0]!.otherHosts, ['api.example']);
});

test('the noise band over the most runs the flag allows takes well under a second a row', () => {
	const values = Array.from({ length: MAX_NAV_RUNS }, (_, i) => 100 + ((i * 37) % 23));
	const started = performance.now();
	bandOf(values);
	assert.ok(performance.now() - started < 1000);
});
