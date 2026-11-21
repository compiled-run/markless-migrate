import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { NavCell, NavRun, NavStep } from '../src/check/nav-timing.ts';
import { navTable, reportRows } from '../scripts/nav-table.ts';

const STEPS: readonly NavStep[] = [
	{ target: '/a', region: 'aside', kind: 'first' },
	{ target: '/b', region: 'aside', kind: 'first' },
	{ target: '/a', region: 'aside', kind: 'revisit' },
];
const runs = (ms: number, n = 8): NavRun[] => Array.from({ length: n }, (_, i) => ({ clicks: STEPS.map((s) => ({ target: s.target, kind: s.kind, ms: ms + (i % 3), ahead: 'none' as const, fetched: true, served: false, bytesBefore: 0, bytesAfter: 0, dataAfter: 0, fullLoad: false })) }));
const cell = (old: number, next: number): NavCell => ({ browser: 'chromium', profile: 'fast', mode: 'dwell-250', steps: STEPS, old: runs(old), new: runs(next) });
const report = (next: number) => ({ routes: [{ route: '/docs', load: { navTiming: { route: '/docs', cells: [cell(60, next)], ms: 0, layouts: 1 } } }, { route: '/other', load: { navTiming: { unavailable: 'not measured (--no-nav-timing)' } } }, { route: '/plain' }] });

test('the before/after table gives each timed row the original, the port before and after, and both verdicts', () => {
	const table = navTable(reportRows(report(160)), reportRows(report(55)));
	assert.match(table, /\| \/docs \| chromium fast dwell-250 first \| 61 ms \| 161 ms \| 56 ms \| slower \(unexplained\) \| (same|faster) \|/);
	assert.match(table, /\| \/docs \| chromium fast dwell-250 revisit \|/);
	assert.doesNotMatch(table, /\/other|\/plain/, 'routes not measured are left out');
});

test('a report that is not a check report gives no rows', () => {
	assert.equal(reportRows({}).size, 0);
	assert.equal(reportRows(null).size, 0);
});
