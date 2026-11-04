// A route checked in slices: the slices' replays joined by journey index are the rows an unsliced check records, so the
// judge gives the same report from them; and a check run in its three parts gives the report `check judge` gives back.
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { MemoryObservations, routeKey, type Observed } from '../../src/data/observations.ts';
import type { Row } from '../../src/data/rows.ts';
import { joinRounds, sliceRounds } from '../../src/check/journey-slices.ts';
import { judgeObserved } from '../../src/check/judge.ts';
import { jsonReport } from '../../src/check/report-judge.ts';
import type { JourneysRow } from '../../src/check/route-judge.ts';
import { runCheck, type CheckOptions } from '../../src/check/run.ts';
import { CASES, ORIGINAL } from '../corpus/site.ts';

const servers: Server[] = [];
after(() => {
	for (const s of servers) {
		s.closeAllConnections();
		s.close();
	}
});

function serve(pages: Record<string, string>): Promise<string> {
	const server = createServer((req, res) => {
		const path = new URL(req.url ?? '/', 'http://x').pathname;
		const body = path === '/' ? pages['/docs'] : pages[path];
		if (body === undefined) return void res.writeHead(404, { 'content-type': 'text/html' }).end('<!doctype html><title>Not found</title><h1>Not found</h1>');
		res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }).end(body);
	});
	servers.push(server);
	return new Promise((done) => server.listen(0, '127.0.0.1', () => done(`http://127.0.0.1:${(server.address() as AddressInfo).port}`)));
}

const c = CASES['combobox-clear']!;
const origins = Promise.all([serve(ORIGINAL), serve({ ...ORIGINAL, [c.route]: c.mutant })]);
const report = async (observed: Observed) => JSON.stringify(jsonReport(await judgeObserved(observed)), null, '\t');

test('the slices of a route\'s journeys, joined by journey index, judge to the report of the unsliced rows', async () => {
	const [oldOrigin, newOrigin] = await origins;
	const observations = new MemoryObservations();
	await runCheck({ oldOrigin, newOrigin, routes: [c.route], probes: {}, motion: {}, responsiveness: {}, observations });
	const observed = observations.read();
	const key = routeKey({ route: c.route, kind: 'page' });
	const rows = observed.routes.get(key)!;
	const at = rows.findIndex((r) => r.stage === 'journeys');
	const row = rows[at]!.value as JourneysRow;
	assert.ok(row.explored.journeys.length >= 3, `the route has journeys to slice (${row.explored.journeys.length})`);
	const [, again, third] = row.runs;
	for (const count of [1, 2, 3, row.explored.journeys.length]) {
		const parts = sliceRounds(c.route, { again: again!, next: row.next, ...(third ? { third } : {}) }, count, (j) => third![j] !== again![j]);
		const joined = joinRounds(row.explored.journeys.length, [...parts].reverse());
		const sliced: JourneysRow = { ...row, runs: [row.runs[0]!, joined.again, ...(joined.third ? [joined.third] : [])], next: joined.next };
		const slicedRows: Row[] = rows.map((r, i) => (i === at ? { ...r, value: sliced } : r));
		assert.equal(await report({ ...observed, routes: new Map([...observed.routes, [key, slicedRows]]) }), await report(observed), `${count} slices`);
	}
});

test('a route checked as an exploring part, two replaying parts and a joining part gives the report check judge gives back', async () => {
	const [oldOrigin, newOrigin] = await origins;
	const dir = await mkdtemp(join(tmpdir(), 'journey-slices-'));
	try {
		const base: CheckOptions = { oldOrigin, newOrigin, routes: [c.route], probes: {}, motion: {}, responsiveness: {} };
		await runCheck({ ...base, slicing: { mode: 'explore', dir } });
		await Promise.all([1, 2].map((at) => runCheck({ ...base, slicing: { mode: 'replay', dir, slice: { at, of: 2 } } })));
		const observations = new MemoryObservations();
		const live = await runCheck({ ...base, slicing: { mode: 'finish', dir }, observations });
		assert.ok(!live.routes[0]!.infrastructure, JSON.stringify(live.routes[0]!.infrastructure));
		assert.ok(live.routes[0]!.journeys?.length, 'the joined route has its journeys');
		assert.ok(live.routes[0]!.failures.some((f) => f.dimension === 'behaviour'), 'the bug put back is found from the joined replays');
		assert.equal(await report(observations.read()), JSON.stringify(jsonReport(live), null, '\t'));
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});

test('a joined route refuses slices that leave a journey out or replay one twice', () => {
	const run = (n: number) => [[{ n }]] as unknown as never;
	const part = (at: number, of: number, journeys: number[]) => ({ route: '/', at, of, journeys, again: journeys.map(run), next: journeys.map(run), third: [] });
	assert.throws(() => joinRounds(4, [part(1, 2, [0, 2])]), /do not fit together/);
	assert.throws(() => joinRounds(4, [part(1, 2, [0, 2]), part(1, 2, [0, 2])]), /do not fit together/);
	assert.throws(() => joinRounds(4, [part(1, 2, [0, 2]), part(2, 2, [1])]), /replayed journeys 1, not 1, 3/);
	assert.throws(() => joinRounds(4, []), /no slices/);
});
