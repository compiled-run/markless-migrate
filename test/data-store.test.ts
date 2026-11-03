// A run's observations written to a folder read back as they were made: header, events in order, each route's rows and blobs.
import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import type { RunEvent, RunHeader } from '../src/check/report-judge.ts';
import { GuardedObservations, routeKey } from '../src/data/observations.ts';
import type { Row } from '../src/data/rows.ts';
import { DirObservations, readObservations } from '../src/data/store.ts';

const header = { old: 'http://old', new: 'http://new', startedAt: '2026-11-02T00:00:00.000Z', routes: ['/a', '/b'], endpoints: [], redirects: [], viewports: [], locales: [], freeze: false, sendWrites: false, roles: [undefined], accepted: [], automaticOff: [], stages: { probes: true, busyCpu: false, responsiveness: false, embeds: false, load: false, navigation: false }, coverage: false, cache: false, auth: false } as unknown as RunHeader;

test('the header, the events in order, each route\'s rows and its blobs come back from the folder as they were written', async () => {
	const dir = await mkdtemp(join(tmpdir(), 'observations-'));
	try {
		await writeFile(join(dir, 'stale'), 'from an earlier run');
		const out = new DirObservations(dir);
		const shot = Buffer.from('a screenshot');
		const element = { id: 1, tag: 'button' };
		const rows: Row[] = [
			{ stage: 'load', req: 'r1', value: { shot, elements: [element], first: element } },
			{ stage: 'probes', req: 'r2', error: { name: 'TimeoutError', message: 'Timeout 3000ms exceeded' } },
		];
		await out.header(header);
		await Promise.all([out.route({ route: '/b', kind: 'page' }, rows.map((r) => out.row(r))), out.event({ kind: 'plan', endpoints: [], redirects: [], groups: [] } as RunEvent), out.route({ route: '/a', role: 'admin', kind: 'page' }, [out.row({ stage: 'load', req: 'r3', value: { shot } })])]);
		await out.event({ kind: 'footer', pinned: ['clock'], wasteReferences: [] } as RunEvent);
		assert.deepEqual((await readdir(dir)).sort(), ['blobs', 'routes.ndjson', 'run.ndjson']);
		assert.equal((await readdir(join(dir, 'blobs'))).length, 1, 'the same bytes are kept once');
		const back = await readObservations(dir);
		assert.deepStrictEqual(back.header, header);
		assert.deepEqual(back.events.map((e) => e.kind), ['plan', 'footer']);
		const b = back.routes.get(routeKey({ route: '/b', kind: 'page' }))!;
		assert.deepStrictEqual(b, rows);
		const value = b[0]!.value as { elements: object[]; first: object };
		assert.equal(value.first, value.elements[0], 'an object a row holds twice is one object again');
		assert.ok(back.routes.has(routeKey({ route: '/a', role: 'admin', kind: 'page' })));
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});

test('observations of another version are refused, not misread', async () => {
	const dir = await mkdtemp(join(tmpdir(), 'observations-'));
	try {
		const out = new DirObservations(dir);
		await out.header(header);
		const run = join(dir, 'run.ndjson');
		await writeFile(run, (await readFile(run, 'utf8')).replace('"v":1', '"v":99'));
		await assert.rejects(readObservations(dir), /version 99; this checker reads version 1/);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});

test('a route whose rows outgrow one string is written in parts and read back whole', async () => {
	const dir = await mkdtemp(join(tmpdir(), 'observations-'));
	try {
		const out = new DirObservations(dir);
		await out.header(header);
		// Three replays of a page that swaps most of itself at every step: about 12 MB of lines in one row.
		const runs = Array.from({ length: 3 }, (_, r) => Array.from({ length: 400 }, (_, j) => [{ added: Array.from({ length: 100 }, (_, k) => `- text "${r}.${j}.${k} ${'w'.repeat(80)}"`) }]));
		const rows: Row[] = [{ stage: 'journeys', req: 'r', value: { runs } }];
		await out.route({ route: '/big', kind: 'page' }, rows.map((r) => out.row(r)));
		const line = (await readFile(join(dir, 'routes.ndjson'), 'utf8')).trim();
		assert.ok(line.length < 70_000, `the route's line is ${line.length} characters`);
		const back = await readObservations(dir);
		assert.deepStrictEqual(back.routes.get(routeKey({ route: '/big', kind: 'page' })), rows);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});

test('observations that fail to write never stop the check: the first failure is reported once and a judge refuses them', async () => {
	const dir = await mkdtemp(join(tmpdir(), 'observations-'));
	try {
		const out = new DirObservations(dir);
		const warnings: string[] = [];
		const guarded = new GuardedObservations({ header: (h) => out.header(h), event: (e) => out.event(e), row: () => { throw new RangeError('Invalid string length'); }, route: (k, r) => out.route(k, r), failed: (why) => out.failed(why) }, (line) => warnings.push(line));
		await guarded.header(header);
		assert.equal(guarded.row({ stage: 'journeys', req: 'r', value: {} }), null);
		await guarded.route({ route: '/a', kind: 'page' }, []);
		assert.equal(guarded.row({ stage: 'load', req: 'r', value: {} }), null);
		assert.equal(warnings.length, 1);
		assert.match(warnings[0]!, /observations not written \(Invalid string length\)/);
		await guarded.event({ kind: 'footer', pinned: [], wasteReferences: [] } as RunEvent);
		await assert.rejects(readObservations(dir), /incomplete: writing it failed \(Invalid string length\)/);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});
