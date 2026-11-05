import assert from 'node:assert/strict';
import { test } from 'node:test';
import { constants } from 'node:buffer';
import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { accounts, combine, profiled, costsOf, datasets, joinKept, joinOld, lostUploads, phases, readReport, reports, routeTimes, split, summary, unfinished, unreported, estimatesOf, MAX_SLICES, SLICED_SHARD, sliceLong, writeReport } from '../scripts/check-shards.ts';

test('targets are dealt across shards in turn, with nothing lost or repeated', () => {
	const routes = Array.from({ length: 10 }, (_, i) => `/r${i}`);
	const shards = split({ routes, endpoints: ['/robots.txt'], redirects: ['/a/', '/b/'] }, 3);
	assert.deepEqual(shards.map((s) => s.routes.length), [4, 3, 3]);
	assert.deepEqual(shards.flatMap((s) => s.routes).sort(), [...routes].sort());
	assert.deepEqual(shards.flatMap((s) => s.redirects), ['/a/', '/b/']);
	assert.deepEqual(shards.flatMap((s) => s.endpoints), ['/robots.txt']);
});

test('the merged summary counts each state and lists the leading causes of the red routes', () => {
	const text = summary([
		{ route: '/b', ok: false, failures: [{ dimension: 'css', check: 'computed style of link "Home"' }, { dimension: 'css', check: 'computed style of link "Docs"' }] },
		{ route: '/a', ok: true, failures: [] },
		{ route: '/c', ok: false, infrastructure: { message: 'timeout' } },
		{ route: '/d', ok: false, failures: [{ dimension: 'visual', check: 'screenshot', accepted: { reason: 'x' } }] },
	]);
	assert.match(text, /^1 green, 2 red, 1 not checked, of 4/);
	assert.match(text, /\| 1 \| css: computed style of link "…" \|/);
	assert.match(text, /\| `\/a` \| green \|/);
	assert.ok(text.indexOf('`/a`') < text.indexOf('`/b`'));
});

test('a shard that wrote no report has each of its targets listed as not checked, so the merge never counts it green or drops it', () => {
	const shards = new Map(split({ routes: ['/a', '/b', '/c'], endpoints: ['/robots.txt'], redirects: ['/a/'] }, 2).map((s, i) => [i + 1, s] as const));
	const missing = unreported(shards, new Map([[2, new Set(['/b'])]]));
	assert.deepEqual(missing.map((r) => r.route), ['/a', '/c', '/robots.txt', '/a/']);
	assert.ok(missing.every((r) => !r.ok && /^shard 1 wrote no report/.test(r.infrastructure?.message ?? '')));
	assert.match(summary(missing), /^4 not checked, of 4/);
	assert.deepEqual(unreported(shards, new Map([[1, new Set(['/a', '/c', '/robots.txt', '/a/'])], [2, new Set(['/b'])]])), []);
});

test('a route a shard\'s report leaves out is not checked, as when the shard wrote none', () => {
	const shards = new Map(split({ routes: ['/a', '/b'] }, 1).map((s, i) => [i + 1, s] as const));
	const missing = unreported(shards, new Map([[1, new Set(['/a'])]]));
	assert.deepEqual(missing.map((r) => [r.route, r.ok, /has no result/.test(r.infrastructure?.message ?? '')]), [['/b', false, true]]);
});

test('runs that each checked part of a route combine into one result: green only when every part is, and a route a part names but did not measure is not checked', () => {
	const routes = combine([
		{ name: 'routes', targets: { routes: ['/a', '/b', '/c'], redirects: ['/a/'] }, routes: [{ route: '/a', ok: true, failures: [] }, { route: '/b', ok: true, failures: [] }, { route: '/c', ok: false, failures: [{ dimension: 'css', check: 'x' }] }, { route: '/a/', ok: true }] },
		{ name: 'page load', targets: { routes: ['/a', '/b'] }, routes: [{ route: '/a', ok: false, failures: [{ dimension: 'load', check: 'First Contentful Paint' }] }] },
	]);
	const by = new Map(routes.map((r) => [r.route, r]));
	assert.equal(routes.length, 4);
	assert.deepEqual(by.get('/a')?.failures?.map((f) => f.dimension), ['load']);
	assert.equal(by.get('/a')?.ok, false);
	assert.equal(by.get('/b')?.ok, false);
	assert.match(by.get('/b')?.infrastructure?.message ?? '', /^page load has no result/);
	assert.equal(by.get('/a/')?.ok, true);
	assert.match(summary(routes), /^1 green, 2 red, 1 not checked, of 4/);
});

test('the merged summary says how many results were reused, and marks each reused route', () => {
	const text = summary([
		{ route: '/a', ok: true, failures: [], reused: { checkedAt: '2026-10-28T00:00:00.000Z' } },
		{ route: '/b', ok: true, failures: [] },
	]);
	assert.match(text, /^2 green, of 2; 1 reused, their HTML and code unchanged since their last check/);
	assert.match(text, /\| `\/a` \| green, reused from 2026-10-28 \|/);
	assert.match(text, /\| `\/b` \| green \|/);
});

test('the results the shards kept are joined into one folder, without those checked over 30 days ago', async () => {
	const from = await mkdtemp(join(tmpdir(), 'kept-'));
	for (const [shard, name, checkedAt] of [['check-1', 'a.json', '2026-10-27T00:00:00.000Z'], ['check-2', 'b.json', '2026-09-01T00:00:00.000Z'], ['check-2', 'c.json', '2026-10-28T00:00:00.000Z']]) {
		const dir = join(from, shard!, 'app', '.migrate', 'reuse');
		await mkdir(dir, { recursive: true });
		await writeFile(join(dir, name!), JSON.stringify({ checkedAt, result: {} }));
	}
	await writeFile(join(from, 'check-1', 'app', '.migrate', 'report.json'), '{}');
	const to = join(from, 'out');
	assert.equal(await joinKept(from, to, new Date('2026-10-29T00:00:00.000Z')), 2);
	assert.deepEqual((await readdir(to)).sort(), ['a.json', 'c.json']);
});

test('an entry two folders both keep is joined as the one recorded last, whichever folder is read first', async () => {
	const from = await mkdtemp(join(tmpdir(), 'kept-'));
	for (const [shard, checkedAt, value] of [['a', '2026-10-28T00:00:00.000Z', 'newer'], ['b', '2026-10-20T00:00:00.000Z', 'older'], ['c', '2026-10-21T00:00:00.000Z', 'middle']]) {
		const dir = join(from, shard!, '.migrate', 'reuse');
		await mkdir(dir, { recursive: true });
		await writeFile(join(dir, 'k.json'), JSON.stringify({ checkedAt, value }));
	}
	const to = join(from, 'out');
	assert.equal(await joinKept(from, to, new Date('2026-10-29T00:00:00.000Z')), 1);
	assert.equal(JSON.parse(await readFile(join(to, 'k.json'), 'utf8')).value, 'newer');
});

test('a route not checked, or stopped part way at --timeout, is counted at the top of the summary and makes the run red', () => {
	const routes = [
		{ route: '/a', ok: true },
		{ route: '/b', ok: false, failures: [{ dimension: 'http', check: 'the check of this route' }] },
		{ route: '/c', ok: false, infrastructure: { cause: 'check timeout', message: 'incomplete: timed out after 3600 s, steps done 3 of 6' } },
		{ route: '/d', ok: false, failures: [{ dimension: 'visual', check: 'screenshot' }] },
		{ route: '/e', ok: false, blocked: { status: 403 }, infrastructure: { cause: 'blocked' } },
	];
	assert.deepEqual(unfinished(routes).map((r) => r.route), ['/b', '/c']);
	assert.match(summary(routes), /\n\*\*2 of 5 routes were not checked to the end \(not checked, or incomplete at --timeout\), so this run is red\.\*\*/);
	assert.doesNotMatch(summary([{ route: '/a', ok: true }]), /not checked to the end/);
});

test("shards are packed longest first by each route's time in an earlier run, so no runner is left with the slow pages", () => {
	const targets = { routes: ['/a', '/b', '/c', '/d', '/e', '/f'], endpoints: [], redirects: [], unchecked: [] };
	const earlier = costsOf([
		{ route: '/a', ok: true, timing: { ms: 4_000_000 } },
		{ route: '/b', ok: true, timing: { ms: 3_800_000 } },
		{ route: '/c', ok: true, timing: { ms: 100_000 } },
		{ route: '/d', ok: true, timing: { ms: 120_000 } },
		{ route: '/e', ok: true },
	] as never);
	const shards = split(targets, 3, earlier);
	// /e and /f were not timed: each counts as the median time, 3,800 s.
	assert.deepEqual(shards.map((s) => s.routes), [['/a'], ['/b', '/f'], ['/e', '/d', '/c']]);
	// Dealt in turn, as before, the two slow pages would share a runner with others.
	assert.deepEqual(split(targets, 3).map((s) => s.routes), [['/a', '/d'], ['/b', '/e'], ['/c', '/f']]);
	assert.deepEqual(split(targets, 3, costsOf([{ route: '/a', ok: true, timing: { ms: 1 } }] as never)).map((s) => s.routes), [['/a', '/d'], ['/b', '/e'], ['/c', '/f']], 'times for under a quarter of the routes are not used');
});

test("a route's newest time in any earlier run packs the shards, and a route stopped at its deadline took at least the deadline", () => {
	const newest = [
		{ route: '/a', ok: true, timing: { ms: 10 } },
		{ route: '/b', ok: false, infrastructure: { cause: 'check timeout', message: 'incomplete: timed out after 1800 s, steps done 3 of 8: ...' } },
		{ route: '/c', ok: false, failures: [{ dimension: 'http', check: 'the check of this route', actual: 'incomplete: timed out after 900 s, steps done 9 of 10' }] },
		{ route: '/d', ok: false, infrastructure: { cause: 'shard not finished', message: 'shard 2 wrote no report' } },
	];
	const older = [
		{ route: '/a', ok: true, timing: { ms: 99 } },
		{ route: '/d', ok: true, timing: { ms: 7 } },
	];
	assert.deepEqual([...costsOf(newest as never, older as never)], [['/a', 10], ['/b', 1_800_000], ['/c', 900_000], ['/d', 7]]);
});

test("a shard's route times come from its progress files when it stopped before its report", async () => {
	const root = await mkdtemp(join(tmpdir(), 'times-'));
	const dir = join(root, '.migrate/check-progress/abc');
	await mkdir(dir, { recursive: true });
	await writeFile(join(dir, '1.json'), JSON.stringify({ route: '/a', result: { route: '/a', ok: true, failures: [], timing: { ms: 1234, steps: [{ name: 'explore', ms: 1000 }] } } }));
	await writeFile(join(dir, '2.json'), JSON.stringify({ route: '/b', result: { route: '/b', ok: false, failures: [], infrastructure: { cause: 'check timeout', message: 'incomplete: timed out after 60 s, steps done 2 of 6 (load both sides, forced states; running: journeys)' } } }));
	await writeFile(join(dir, '3.json'), JSON.stringify({ route: '/c', result: { route: '/c', ok: false, failures: [], infrastructure: { message: 'no answer' } } }));
	const times = await routeTimes(join(root, '.migrate'));
	assert.deepEqual(times.sort((x, y) => (x.route < y.route ? -1 : 1)), [{ route: '/a', timing: { ms: 1234 } }, { route: '/b', infrastructure: { cause: 'check timeout', message: 'incomplete: timed out after 60 s, steps done 2 of 6 (load both sides, forced states; running: journeys)' } }]);
	assert.deepEqual([...costsOf(times as never)], [['/a', 1234], ['/b', 60_000]]);
	assert.equal(estimatesOf(times as never).get('/b'), (60_000 * 6) / 2, 'how far the stopped route got stays with its time, so the next run scales it');
});

test('the merged summary tells the runner time of each part of the check, the original served and the old-side store counts', async () => {
	const routes = [
		{ route: '/a', ok: true, timing: { ms: 3_600_000, steps: [{ name: 'explore old', ms: 1_800_000 }, { name: 'motion', ms: 900_000 }] } },
		{ route: '/b', ok: true, timing: { ms: 3_600_000, steps: [{ name: 'explore old', ms: 1_800_000 }] } },
		{ route: '/c', ok: false, infrastructure: { cause: 'shard not finished' } },
	];
	const { phases: parts, routeMs, timed } = phases(routes as never);
	assert.deepEqual(parts, [{ name: 'explore old', ms: 3_600_000, routes: 2 }, { name: 'motion', ms: 900_000, routes: 1 }]);
	assert.equal(routeMs, 7_200_000);
	assert.equal(timed, 2);
	const root = await mkdtemp(join(tmpdir(), 'datasets-'));
	for (const [n, cache] of [[1, { hit: 1, miss: 3, changed: 0, 'stale-checker': 0 }], [2, { hit: 0, miss: 2, changed: 1, 'stale-checker': 1 }]] as const) {
		await mkdir(join(root, `check-${n}/app/.migrate`), { recursive: true });
		await writeFile(join(root, `check-${n}/app/.migrate/report.json`), JSON.stringify({ routes: [], cache }));
	}
	await mkdir(join(root, 'check-3/app/.migrate/check-progress/x'), { recursive: true });
	await mkdir(join(root, 'check-times-1'), { recursive: true });
	const data = await datasets(root, 'f'.repeat(64));
	assert.deepEqual(data, { original: 'f'.repeat(64), shards: { reported: 2, progressOnly: 1 }, store: { hit: 1, miss: 5, changed: 1, 'stale-checker': 1, shards: 2 } });
	const text = summary(routes as never, data);
	assert.match(text, /\| Original \(originalId\) \| `ffffffffffff` \|/);
	assert.match(text, /\| Old-side store entries reused \(hit\) \| 1 of 8, over 2 shards \|/);
	assert.match(text, /\| Routes timed \(finished, or stopped at their deadline\) \| 2 of 3 \|/);
	assert.match(text, /2\.0 runner-hours over 2 routes/);
	assert.match(text, /\| explore old \| 1\.0 \| 50% \| 2 \|/);
	assert.deepEqual(accounts([{ route: '/a', ok: true }] as never), [], 'nothing to tell without times or data');
});

test("a route stopped at its deadline still counts each part it finished, from its shard's profile lines, with counts left out of the part's name", async () => {
	const root = await mkdtemp(join(tmpdir(), 'profile-'));
	await mkdir(join(root, 'check-1/_temp'), { recursive: true });
	await writeFile(join(root, 'check-1/_temp/check.txt'), ['[profile] /a explore old: 1800.0 s', '[profile] /a replay 303 journeys old and new: 900.5 s', 'other output', '[profile] /b replay 12 journeys old and new: 99.5 s', ''].join('\n'));
	const profile = await profiled(root);
	const routes = [
		{ route: '/a', ok: false, infrastructure: { cause: 'check timeout', message: 'incomplete: timed out after 3600 s, steps done 2 of 3' } },
		{ route: '/b', ok: true, timing: { ms: 100_000, steps: [{ name: 'ignored when profiled', ms: 1 }] } },
	];
	const { phases: parts, routeMs, timed } = phases(routes as never, profile);
	assert.deepEqual(parts, [{ name: 'explore old', ms: 1_800_000, routes: 1 }, { name: 'replay N journeys old and new', ms: 1_000_000, routes: 2 }]);
	assert.equal(routeMs, 3_700_000);
	assert.equal(timed, 2);
});

test("every shard's old-side cache entries and the earlier joined ones become one cache", async () => {
	const root = await mkdtemp(join(tmpdir(), 'join-old-'));
	for (const [dir, name] of [['shards/check-1/app/.migrate/cache/old', 'capture-a.bin'], ['shards/check-2/app/.migrate/cache/old', 'capture-b.bin'], ['shards/check-2/app/.migrate/slow-network', 'n1.json'], ['earlier/old-joined/cache/old', 'capture-c.bin'], ['shards/check-1/app/.migrate/reuse', 'r.json']] as const) {
		await mkdir(join(root, dir), { recursive: true });
		await writeFile(join(root, dir, name), name);
	}
	assert.equal(await joinOld(join(root, 'earlier'), join(root, 'out')), 1);
	assert.equal(await joinOld(join(root, 'shards'), join(root, 'out')), 3);
	assert.deepEqual((await readdir(join(root, 'out/cache/old'))).sort(), ['capture-a.bin', 'capture-b.bin', 'capture-c.bin']);
	assert.deepEqual(await readdir(join(root, 'out/slow-network')), ['n1.json']);
});

test("a shard whose log says it kept results or recorded old pages, but whose artifact holds none, is named as an upload that lost them", async () => {
	const root = await mkdtemp(join(tmpdir(), 'uploaded-'));
	const shard = async (n: number, log: string, files: string[]) => {
		await mkdir(join(root, `check-${n}`, '_temp'), { recursive: true });
		await writeFile(join(root, `check-${n}`, '_temp', 'check.txt'), log);
		for (const f of files) {
			await mkdir(join(root, `check-${n}`, 'app', '.migrate', f), { recursive: true });
			await writeFile(join(root, `check-${n}`, 'app', '.migrate', f, 'entry.json'), '{}');
		}
	};
	await shard(1, '--reuse: kept 3 results for later runs.\nOld side from the cache (.migrate/cache): 0 reused because nothing the old page loads changed, 2 not cached yet.', ['reuse', 'cache/old']);
	await shard(2, '--reuse: kept 2 results for later runs.\nOld side from the cache (.migrate/cache): 0 reused because nothing the old page loads changed, 1 not cached yet.', []);
	await shard(3, '--reuse: kept 0 results for later runs.', []);
	assert.deepEqual(await lostUploads(root), ['check-2 kept 2 results for later runs, but its artifact has none', 'check-2 recorded 1 old pages not cached before, but its artifact has no old-side entries']);
});

test("a shard stopped before writing its report still gives each route it finished, from the results it wrote route by route", async () => {
	const root = await mkdtemp(join(tmpdir(), 'partial-'));
	const progress = join(root, 'check-3', 'app', '.migrate', 'check-progress', 'abc');
	await mkdir(progress, { recursive: true });
	await writeFile(join(progress, '1.json'), JSON.stringify({ route: '/a', result: { route: '/a', ok: true, failures: [] } }));
	await writeFile(join(progress, '2.json'), JSON.stringify({ route: '/b', result: { route: '/b', ok: false, failures: [{ dimension: 'css', check: 'x' }] } }));
	const done = join(root, 'check-4', 'app', '.migrate');
	await mkdir(join(done, 'check-progress', 'abc'), { recursive: true });
	await writeFile(join(done, 'report.json'), JSON.stringify({ routes: [{ route: '/c', ok: true, failures: [] }] }));
	await writeFile(join(done, 'check-progress', 'abc', '1.json'), JSON.stringify({ route: '/c', result: { route: '/c', ok: true, failures: [] } }));
	const got = (await reports(root)).flatMap((r) => r.routes.map((x) => `${/check-(\d+)/.exec(r.path)![1]} ${x.route}`)).sort();
	assert.deepEqual(got, ['3 /a', '3 /b', '4 /c'], 'a shard with a report is read from it alone');
});

test('a route whose only failures say what was not verified is incomplete, never red, and a route with one real difference is red', () => {
	const text = summary([
		{ route: '/calendar', ok: false, failures: [{ dimension: 'behaviour', check: 'not exercised: button "October 31"' }, { dimension: 'behaviour', check: 'not exercised: button "October 30"' }] },
		{ route: '/stopped', ok: false, failures: [{ dimension: 'http', check: 'the check of this route' }] },
		{ route: '/menu', ok: false, failures: [{ dimension: 'behaviour', check: 'not exercised: button "More"' }, { dimension: 'behaviour', check: 'click button "Open"' }] },
	]);
	assert.match(text, /^1 red, 2 incomplete, of 3/);
	assert.match(text, /\| `\/calendar` \| incomplete \|/);
	assert.match(text, /\| `\/menu` \| red \|/);
});

test('a route the earlier run says takes longer than its timeout, or that stopped at its deadline, is taken out of the shards and checked in slices, one per timeout of its estimate', () => {
	const earlier = [
		{ route: '/a', ok: true, timing: { ms: 600_000 } },
		{ route: '/b', ok: false, timing: { ms: 4_000_000 }, infrastructure: { cause: 'incomplete', message: 'exploring stopped at its time cap (3600 s) after 210 of its 450 journeys: the machine ran far slower' } },
		{ route: '/c', ok: false, infrastructure: { cause: 'check timeout', message: 'incomplete: timed out after 7200 s, steps done 3 of 9' } },
		{ route: '/d', ok: true, timing: { ms: 100_000_000 } },
	];
	const estimates = estimatesOf(earlier);
	assert.equal(Math.round(estimates.get('/b')!), Math.round((4_000_000 * 450) / 210));
	assert.equal(estimates.get('/c'), (7_200_000 * 9) / 3, 'stopped at its deadline after 3 of 9 steps: it takes about three deadlines');
	const { kept, sliced } = sliceLong({ routes: ['/a', '/b', '/c', '/d', '/e'], endpoints: ['/x'] }, estimates, 7_200_000);
	assert.deepEqual(kept.routes, ['/a', '/e']);
	const near = sliceLong({ routes: ['/near', '/far'] }, new Map([['/near', 7_005_000], ['/far', 5_000_000]]), 7_200_000);
	assert.deepEqual([near.kept.routes, near.sliced.map((r) => [r.route, r.slices])], [['/far'], [['/near', 2]]], 'a route that finished just under its timeout is sliced: on a slower runner it would stop');
	assert.deepEqual(kept.endpoints, ['/x']);
	assert.deepEqual(sliced, [{ shard: SLICED_SHARD + 1, route: '/b', slices: 2 }, { shard: SLICED_SHARD + 2, route: '/c', slices: 3 }, { shard: SLICED_SHARD + 3, route: '/d', slices: MAX_SLICES }]);
});

test('a written report reads back as it was, and a report.json written whole still reads', async () => {
	const dir = await mkdtemp(join(tmpdir(), 'report-'));
	const report = { routes: [{ route: '/a', ok: true, failures: [] }, { route: '/b', ok: false, failures: [{ dimension: 'css', check: 'line\nbreak ]' }] }], datasets: { original: 'x' }, phases: [{ name: 'explore', ms: 1 }] };
	await writeReport(join(dir, 'report.json'), report);
	assert.deepEqual(await readReport(join(dir, 'report.json')), report);
	await writeReport(join(dir, 'empty.json'), { routes: [] });
	assert.deepEqual(await readReport(join(dir, 'empty.json')), { routes: [] });
	await writeFile(join(dir, 'whole.json'), JSON.stringify(report, null, '\t'));
	assert.deepEqual(await readReport(join(dir, 'whole.json')), report);
	assert.deepEqual((await reports(dir)).find((r) => r.path.endsWith('report.json'))?.routes, report.routes);
	await rm(dir, { recursive: true });
});

test('a merged report larger than the longest string JavaScript can hold is written and read back', async () => {
	const dir = await mkdtemp(join(tmpdir(), 'report-'));
	const text = 'x'.repeat(2 ** 25);
	const n = Math.ceil(constants.MAX_STRING_LENGTH / text.length) + 1;
	const routes = Array.from({ length: n }, (_, i) => ({ route: `/r${i}`, ok: false, failures: [{ dimension: 'rendered', check: 'visible text', actual: text }] }));
	assert.throws(() => JSON.stringify({ routes }), RangeError);
	await writeReport(join(dir, 'report.json'), { routes });
	assert.ok((await stat(join(dir, 'report.json'))).size > constants.MAX_STRING_LENGTH);
	const back = await readReport(join(dir, 'report.json'));
	assert.deepEqual(back.routes?.map((r) => r.route), routes.map((r) => r.route));
	assert.equal((back.routes?.[n - 1]?.failures?.[0] as { actual?: string } | undefined)?.actual?.length, text.length);
	await rm(dir, { recursive: true });
});

test('a route\'s steps done count only its top-level stages, not the parts timed inside them, so a stopped route\'s estimate scales by what it had left', async () => {
	const { profiled, stepsDone } = await import('../src/check/run.ts');
	const route = `/steps-${Math.random()}`;
	await Promise.all([
		profiled(route, 'forced states', async () => {}),
		profiled(route, 'journeys', async () => {
			await profiled(route, 'explore old', async () => {});
			await profiled(route, 'retime main', async () => {});
		}),
	]);
	assert.match(stepsDone(route), /^steps done 2 of /);
});
