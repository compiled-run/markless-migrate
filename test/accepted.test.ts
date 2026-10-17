import assert from 'node:assert/strict';
import { test } from 'node:test';
import { acceptFailure, applyAccepted, failureId, matches, type Accept } from '../src/check/accepted.ts';
import { summarize } from '../src/check/summary.ts';
import { DIMENSIONS, type Failure, type Report, type RouteResult } from '../src/check/types.ts';

const failure = (over: Partial<Failure> = {}): Failure => ({ route: '/blog/a', dimension: 'rendered', check: 'visible text', expected: 'Hello', actual: 'Hi', hint: 'h', ...over });
const route = (failures: Failure[], over: Partial<RouteResult> = {}): RouteResult => ({
	route: failures[0]?.route ?? '/',
	ok: failures.length === 0,
	dimensions: Object.fromEntries(DIMENSIONS.map((d) => [d, failures.some((f) => f.dimension === d) ? 'fail' : 'pass'])) as RouteResult['dimensions'],
	failures,
	weight: { old: { downloaded: 0, source: 0, executed: 0 }, new: { downloaded: 0, source: 0, executed: 0 } },
	visualDiffs: [],
	shots: [],
	...over,
});
const report = (routes: RouteResult[], old = 'http://127.0.0.1:3000', next = 'http://127.0.0.1:4000'): Report => ({ version: 1, old, new: next, startedAt: 'x', ok: routes.every((r) => r.ok), routes });
const accept = (over: Partial<Accept>): Accept => ({ route: '/blog/*', dimension: 'rendered', check: 'visible text', reason: 'copy edit', by: 'Jo', date: '2026-10-16', ...over });

test('a failure keeps its id across runs on other ports, and changes when what differs changes', () => {
	const a = failureId(failure({ expected: 'http://127.0.0.1:3000/x' }), { old: 'http://127.0.0.1:3000', new: 'http://127.0.0.1:4000' });
	const b = failureId(failure({ expected: 'http://127.0.0.1:3100/x' }), { old: 'http://127.0.0.1:3100', new: 'http://127.0.0.1:4100' });
	assert.equal(a, b);
	assert.notEqual(a, failureId(failure({ actual: 'Hey' }), { old: 'o', new: 'n' }));
	assert.match(a, /^[0-9a-f]{10}$/);
});

test('route globs, check globs, regex and element matches', () => {
	assert.ok(matches(accept({}), failure()));
	assert.ok(!matches(accept({}), failure({ route: '/blog/a/b' })), '* stays in one segment');
	assert.ok(matches(accept({ route: '/blog/**' }), failure({ route: '/blog/a/b' })));
	assert.ok(matches(accept({ route: '/blog/a/' }), failure()), 'trailing slash ignored');
	assert.ok(matches(accept({ dimension: '*', check: 'visible *' }), failure()));
	assert.ok(!matches(accept({ role: 'admin' }), failure()));
	assert.ok(matches(accept({ match: { actual: '/^H/' } }), failure()));
	assert.ok(!matches(accept({ match: { actual: 'Hello' } }), failure()));
	assert.ok(matches(accept({ dimension: 'rendered', check: 'accessibility tree', match: { element: { role: 'heading', name: 'Our story' } } }), failure({ check: 'accessibility tree', expected: '- heading "Our story" [level=1]', actual: '- heading "About" [level=1]' })));
});

test('a route whose failures are all accepted is green; the others stay red; an accept that matched nothing on a checked route is stale', () => {
	const applied = applyAccepted(report([route([failure()]), route([failure({ route: '/blog/b' }), failure({ route: '/blog/b', dimension: 'seo', check: 'title' })]), route([], { route: '/about' })]), [accept({}), accept({ route: '/about', check: 'title', dimension: 'seo' }), accept({ route: '/never-checked' })]);
	assert.deepEqual(applied.routes.map((r) => r.ok), [true, false, true]);
	assert.equal(applied.routes[0]!.dimensions.rendered, 'pass');
	assert.equal(applied.routes[1]!.dimensions.rendered, 'pass');
	assert.equal(applied.routes[1]!.dimensions.seo, 'fail');
	assert.equal(applied.ok, false);
	assert.equal(applied.acceptedCount, 2);
	assert.deepEqual(applied.staleAccepts?.map((a) => a.route), ['/about']);
	assert.ok(applied.routes.every((r) => r.failures.every((f) => f.id)));
	const text = summarize(applied);
	assert.match(text, /pass +\/blog\/a +\(1 accepted\)/);
	assert.match(text, /accepted rendered: visible text  \[[0-9a-f]{10}\]\n +reason: +copy edit \(Jo, 2026-10-16\)/);
	assert.match(text, /Accepted differences that no longer match anything[^\n]*\n +\/about seo: title/);
	assert.match(text, /2 of 3 routes green, 1 red, 2 accepted differences\./);
});

test('a blocked or partly compared route does not turn green by accepting its failures', () => {
	const gated = route([failure({ dimension: 'auth', check: 'access as member' })], { dimensions: { ...route([]).dimensions, rendered: 'skipped', auth: 'fail' } });
	assert.equal(applyAccepted(report([gated]), [accept({ dimension: 'auth', check: 'access *' })]).routes[0]!.ok, false);
});

test('acceptFailure writes the failure as seen, with origins replaced so the next run on other ports still matches', () => {
	const f = failure({ id: 'abc', role: 'member', viewport: 'mobile', actual: 'redirect to http://127.0.0.1:4000/login' });
	const entry = acceptFailure(f, { old: 'http://127.0.0.1:3000', new: 'http://127.0.0.1:4000' }, 'new login flow', 'Jo', '2026-10-16');
	assert.deepEqual(entry, { route: '/blog/a', role: 'member', dimension: 'rendered', check: 'visible text', viewport: 'mobile', match: { expected: 'Hello', actual: 'redirect to NEW/login' }, reason: 'new login flow', by: 'Jo', date: '2026-10-16', id: 'abc' });
	assert.ok(matches(entry, { ...f, actual: 'redirect to http://127.0.0.1:4100/login' }, { old: 'http://127.0.0.1:3100', new: 'http://127.0.0.1:4100' }));
});

test('a hand-written accept without date or by is read, applied and shown; one without what it matches is refused with where', async () => {
	const { mkdtemp, writeFile } = await import('node:fs/promises');
	const { tmpdir } = await import('node:os');
	const { join } = await import('node:path');
	const { readAccepted } = await import('../src/check/accepted.ts');
	const { renderHtml } = await import('../src/check/html.ts');
	const dir = await mkdtemp(join(tmpdir(), 'mm-accept-'));
	const path = join(dir, 'accepted.json');
	await writeFile(path, JSON.stringify({ accepted: [{ route: '/blog/*', dimension: 'rendered', check: 'visible text', reason: 'copy edit' }] }));
	const accepted = await readAccepted(path);
	assert.deepEqual(accepted.map((a) => [a.by, a.date]), [['(not named)', '(no date)']]);
	const applied = applyAccepted(report([route([failure()])]), accepted);
	assert.equal(applied.ok, true);
	assert.match(summarize(applied), /copy edit \(\(not named\), \(no date\)\)/);
	assert.match(renderHtml(applied), /Accepted by \(not named\) on \(no date\): copy edit/);
	await writeFile(path, JSON.stringify([{ route: '/a', dimension: 'rendered', reason: 'x' }]));
	await assert.rejects(readAccepted(path), /accepted\.json entry 1: "check" must be a non-empty string/);
	await writeFile(path, JSON.stringify([{ route: '/a', dimension: 'colour', check: 'x', reason: 'x' }]));
	await assert.rejects(readAccepted(path), /"dimension" must be one of http/);
});
