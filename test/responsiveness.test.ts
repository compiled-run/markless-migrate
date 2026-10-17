import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { applyAccepted, failureId } from '../src/check/accepted.ts';
import { withFailures } from '../src/check/compare.ts';
import type { RecordedJourney, StepResult } from '../src/check/journeys.ts';
import { controlsToMeasure, fetchKind, headlines, judge, likelyCause, summarizeResponsiveness, worstLine, worstOf, type ControlTiming, type Responsiveness, type Sample } from '../src/check/responsiveness.ts';
import { DIMENSIONS, type Failure, type RouteResult } from '../src/check/types.ts';
import { recordResults, status, summarizeStatus } from '../src/status.ts';

const zero = { downloaded: 0, source: 0, executed: 0 };
const route = (over: Partial<RouteResult> = {}): RouteResult => ({ route: '/', ok: true, dimensions: Object.fromEntries(DIMENSIONS.map((d) => [d, 'pass'])) as RouteResult['dimensions'], failures: [], weight: { old: zero, new: zero }, visualDiffs: [], shots: [], ...over });
const step = (over: Partial<StepResult> = {}): StepResult => ({ url: '/', added: [], removed: [], requests: [], errors: [], announcements: [], focus: 'body', navigated: false, ...over });
const sample = (over: Partial<Sample> = {}): Sample => ({ result: 'changed', fetches: [], longTasks: [], evaluated: [], ...over });

test('NEW fails only when every run exceeds the slower OLD run by max(16 ms, 10%) or the budget; one run over asks for a second', () => {
	assert.deepEqual(judge([40], [50]), { ok: true, rerun: false, newMs: 50, slower: false, overBudget: false, oldMs: 40, allowedMs: 56 });
	assert.equal(judge([300], [329]).ok, true, '10% of 300 ms is more than 16 ms');
	assert.equal(judge([300], [331], undefined).rerun, true);
	assert.deepEqual(judge([40], [90]), { ok: false, rerun: true, newMs: 90, slower: true, overBudget: false, oldMs: 40, allowedMs: 56 });
	assert.deepEqual(judge([40, 44], [90, 120]), { ok: false, rerun: false, newMs: 120, slower: true, overBudget: false, oldMs: 44, allowedMs: 60 }, 'both runs over: the slower is kept');
	assert.deepEqual(judge([73, 120], [128, 159]), { ok: true, rerun: false, newMs: 128, slower: false, overBudget: false, oldMs: 120, allowedMs: 167 }, 'the old runs varied by 47 ms, so that is the noise floor');
	assert.deepEqual(judge([40, 44], [90, 50]), { ok: true, rerun: false, newMs: 50, slower: false, overBudget: false, oldMs: 44, allowedMs: 60 }, 'one run over: noise, the run within is kept');
	assert.deepEqual(judge([250, 260], [262, 270], 200), { ok: false, rerun: false, newMs: 270, slower: false, overBudget: true, oldMs: 260, allowedMs: 286 }, 'the budget holds even when the old app was as slow');
	assert.equal(judge([30], [undefined]).ok, true, 'no visible result is not a time');
});

const journey = (name: string, steps: RecordedJourney['steps'], expected: StepResult[] = [step()]): RecordedJourney => ({ name, steps, expected });
const click = (role: string, name: string, nth = 0) => ({ action: 'click' as const, target: { role, name, nth } });

test('the controls timed are the first steps of the journeys, by pointer or typing, in-page controls before links, within the limits', () => {
	const journeys = [
		journey('click link "Docs"', [click('link', 'Docs')], [step({ navigated: true })]),
		journey('click button "Add"', [click('button', 'Add')]),
		journey('press Enter on button "Add"', [{ action: 'press', key: 'Enter', target: { role: 'button', name: 'Add', nth: 0 } }]),
		journey('click button "Menu", then click menuitem "Edit"', [click('button', 'Menu'), click('menuitem', 'Edit')]),
		journey('click button "Menu"', [click('button', 'Menu')]),
		journey('type into textbox "Search"', [{ action: 'fill', target: { role: 'textbox', name: 'Search', nth: 0 }, value: 'coffee' }]),
		journey('choose "b" in combobox "Sort"', [{ action: 'select', target: { role: 'combobox', name: 'Sort', nth: 0 }, value: 'b' }]),
		journey('press Space on checkbox "Dark"', [{ action: 'press', key: 'Space', target: { role: 'checkbox', name: 'Dark', nth: 0 } }]),
		journey('click button "Broken"', [click('button', 'Broken')], [step({ failed: 'missing' })]),
		journey('click link "Blog"', [click('link', 'Blog')], [step({ navigated: true })]),
	];
	const picked = controlsToMeasure(journeys);
	assert.deepEqual(picked.steps.map((s) => `${s.step.target.role} ${s.step.target.name} ${s.navigates ? 'link' : 'in-page'}`), ['button Add in-page', 'button Menu in-page', 'textbox Search in-page', 'link Docs link', 'link Blog link']);
	assert.deepEqual(picked.notMeasured.map((n) => n.control).sort(), ['button "Broken"', 'checkbox "Dark"', 'combobox "Sort"']);
	assert.match(picked.notMeasured.find((n) => n.control === 'checkbox "Dark"')!.reason, /only by keyboard/);
	const capped = controlsToMeasure(journeys, { maxControls: 3, maxLinks: 1 });
	assert.deepEqual(capped.steps.map((s) => s.step.target.name), ['Add', 'Menu', 'Docs']);
	assert.match(capped.notMeasured.find((n) => n.control === 'link "Blog"')!.reason, /over the 3-control limit/);
});

test('a fetch is code when it is a script or JavaScript or WebAssembly by type or name', () => {
	assert.equal(fetchKind('script', 'https://a.test/x', ''), 'code');
	assert.equal(fetchKind('other', 'https://a.test/chunk.mjs?v=1', ''), 'code');
	assert.equal(fetchKind('fetch', 'https://a.test/q', 'text/javascript; charset=utf-8'), 'code');
	assert.equal(fetchKind('fetch', 'https://a.test/api', 'application/json'), 'data');
	assert.equal(fetchKind('image', 'https://a.test/a.png', 'image/png'), 'asset');
});

test('the likely cause names code fetched, a runtime starting, the longest task and its script, data waited on, and cold against warm', () => {
	const slow = sample({ ms: 400, warmMs: 30, fetches: [{ url: '/c.js', kind: 'code', bytes: 512_000 }, { url: '/api/items', kind: 'data', bytes: 10 }], evaluated: ['/runtime.js'], longTasks: [{ ms: 90, script: '/a.js onClick (BUTTON.onclick)' }, { ms: 180, script: '/runtime.js (module-script)' }] });
	assert.equal(likelyCause([sample({ ms: 50 }), slow], 'in-page'), 'code fetch: /c.js (500.0 kB); runtime start: /runtime.js evaluated on the interaction; long task 180 ms, top script /runtime.js (module-script); waits on 1 data fetch: /api/items; first-interaction cost: 400 ms cold, 30 ms the second time');
	assert.equal(likelyCause([sample({ ms: 60, warmMs: 55 })], 'in-page'), 'no single cause seen: the handler itself is slower');
	const old = sample({ ms: 200, result: 'navigated', prefetch: 3 });
	const next = sample({ ms: 660, result: 'reloaded', server: { ttfb: 610, warmTtfb: 80, htmlBytes: 40_960, served: 'x-vercel-cache: MISS' } });
	assert.equal(likelyCause([next], 'navigation', [old]), 'a full page load where the old app navigates in the page (client-side), with a blank page between; server time 610 ms to first byte, 80 ms when fetched again straight after (a cold server function) (x-vercel-cache: MISS); 40.0 kB of HTML; the old page had 3 prefetch hints when the pointer went down, the new one none');
});

test('a slow control keeps its failure id from run to run although its timings differ', () => {
	const f = (ms: number): Failure => ({ route: '/', dimension: 'responsiveness', check: 'first interaction with button "Add" (4x CPU, mobile)', viewport: 'mobile', expected: `old ${ms - 100} ms (runs ${ms - 100} ms)`, actual: `new ${ms} ms (runs ${ms} ms, ${ms + 3} ms); likely cause: code fetch: /big.js (559.4 kB)`, hint: 'h' });
	const origins = { old: 'o', new: 'n' };
	assert.equal(failureId(f(300), origins), failureId(f(320), origins));
	assert.notEqual(failureId(f(300), origins), failureId({ ...f(300), actual: 'new 300 ms; likely cause: long task 90 ms' }, origins));
});

test('responsiveness is skipped when not measured, and that does not stop a route whose other failures are accepted from going green', () => {
	const failure: Failure = { route: '/', dimension: 'rendered', check: 'visible text', expected: 'a', actual: 'b', hint: 'h' };
	const checked = withFailures(route(), [failure]);
	assert.equal(checked.dimensions.responsiveness, 'skipped');
	assert.equal(withFailures(route(), [], { responsiveness: { budgetMs: 200, cpu: 4, controls: [], notMeasured: [], worst: {} } }).dimensions.responsiveness, 'pass');
	const accepted = applyAccepted({ version: 1, old: 'o', new: 'n', startedAt: 'x', ok: false, routes: [checked] }, [{ route: '/', dimension: 'rendered', check: 'visible text', reason: 'copy', by: 'Jo', date: 'd' }]);
	assert.equal(accepted.routes[0]!.ok, true);
});

const timing = (control: string, kind: ControlTiming['kind'], old: number, next: number, ok = true): ControlTiming => ({
	control,
	step: `click ${control}`,
	kind,
	speeds: [
		{ speed: 'desktop', old: [], new: [], oldMs: Math.round(old / 3), newMs: Math.round(next / 3), ok: true, problems: [] },
		{ speed: 'throttled', old: [], new: [], oldMs: old, newMs: next, ok, problems: [] },
	],
});

test('the headline is the slowest first interaction and navigation on each side at 4x CPU, with each route its slowest control', () => {
	const timings = (controls: ControlTiming[]): Responsiveness => ({ budgetMs: 200, cpu: 4, controls, notMeasured: [{ control: 'combobox "Sort"', reason: 'keyboard' }], worst: worstOf(controls) });
	const home = route({ responsiveness: timings([timing('button "Add"', 'in-page', 40, 230, false), timing('button "Menu"', 'in-page', 90, 100), timing('link "Docs"', 'navigation', 213, 660, false)]) });
	const about = route({ route: '/about', responsiveness: timings([timing('button "Close"', 'in-page', 120, 60)]) });
	const summary = summarizeResponsiveness([withFailures(home, [{ route: '/', dimension: 'responsiveness', check: 'x', expected: '', actual: '', hint: '' }]), about]);
	assert.deepEqual(headlines(summary), ['First interaction: old 120 ms → new 230 ms (4x CPU); desktop old 40 ms → new 77 ms', 'Navigation: old 213 ms → new 660 ms (4x CPU); desktop old 71 ms → new 220 ms']);
	assert.equal(summary.interaction?.throttled?.newAt, '/ button "Add"');
	assert.equal(summary.interaction?.throttled?.oldAt, '/about button "Close"');
	assert.deepEqual(summary.routes.map((r) => [r.route, r.ok, r.interaction?.throttled?.control, r.navigation?.throttled?.new]), [['/', false, 'button "Add"', 660], ['/about', true, 'button "Close"', undefined]]);
	assert.equal(worstLine(home.responsiveness!), 'slowest first interaction button "Add": old 40 ms → new 230 ms; slowest navigation link "Docs": old 213 ms → new 660 ms (4x CPU); 1 not timed');
});

test('status keeps each route\'s slowest timings from its last check and shows the same headline', async () => {
	const cwd = await mkdtemp(join(tmpdir(), 'mm-timing-'));
	await mkdir(join(cwd, '.migrate'));
	await writeFile(join(cwd, '.migrate', 'inventory.json'), JSON.stringify({ routes: [{ route: '/' }] }));
	const worst = { interaction: { throttled: { control: 'button "Add"', old: 40, new: 230, slowestOld: 90 } }, navigation: { throttled: { control: 'link "Docs"', old: 213, new: 660 } } };
	await recordResults(cwd, { version: 1, old: 'o', new: 'n', startedAt: 'x', ok: true, routes: [route({ responsiveness: { budgetMs: 200, cpu: 4, controls: [], notMeasured: [], worst } })] });
	const text = summarizeStatus(await status(cwd));
	assert.match(text, /\nFirst interaction: old 90 ms → new 230 ms \(4x CPU\)\nNavigation: old 213 ms → new 660 ms \(4x CPU\)\n/);
});
