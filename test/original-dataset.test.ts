import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { canary, differences, diffTable, families, same } from '../src/data/original/canary.ts';
import { bucketOf, conditionsId, keys, SAMPLES, type Conditions } from '../src/data/original/dataset.ts';
import { readLock } from '../src/data/original/lock.ts';
import { writeRoute, type RouteObservation } from '../src/data/original/produce.ts';
import { originalAnswers, originalJourneys, originalLoads, originalRoute } from '../src/data/original/read.ts';
import { commitDataset, Dataset, DatasetWriter, filesFor, MissingRow, type ProducerVersions } from '../src/data/original/store.ts';

const conditions: Conditions = {
	viewports: [
		{ name: 'desktop', width: 1280, height: 800, isMobile: false },
		{ name: 'mobile', width: 390, height: 844, isMobile: true },
	],
	freeze: false,
	block: { add: [], allow: [] },
	sendWrites: true,
	serverClock: false,
	journeys: { maxJourneys: 4 },
	switched: [],
	role: null,
};

const versions = async (): Promise<ProducerVersions> => (await readLock()).producers;
const ORIGINAL = 'a'.repeat(64);

const step = (line: string, ms: number) => ({ url: '/', added: [line], removed: [], requests: [], errors: [], announcements: [], focus: 'body', navigated: false, reaction: { answeredMs: ms, regions: [] } });

function observation(route: string): RouteObservation {
	const page = (n: number) => ({ aria: `tree ${route}`, text: [`text ${n % 2}`], screenshot: Buffer.from(`png ${route} ${n}`), elements: [], seo: {}, fonts: [], weight: { downloaded: 1, source: 1, executed: n } });
	const capture = (n: number) => ({ origin: 'http://old', http: { status: 200, chain: [{ url: route, status: 200 }] }, pages: { desktop: page(n), mobile: page(n + 10) } });
	const plain = [
		{ name: 'click A', steps: [{ action: 'click', target: { role: 'button', name: 'A' } }], expected: [step('a', 10)] },
		{ name: 'click Theme', steps: [{ action: 'click', target: { role: 'button', name: 'Theme' } }], cycle: [], expected: [step('theme', 12)] },
	];
	const run = (k: number) => plain.map((_, j) => [step(`r${k}j${j}`, 20 + k)]);
	return {
		route: { kind: 'page', status: 200, contentType: 'text/html', chain: [{ url: route, status: 200 }] },
		served: { http: { status: 200, chain: [{ url: route, status: 200 }] }, html: Buffer.from(`<html>${route}</html>`) },
		viewports: ['desktop', 'mobile'],
		loads: { samples: [capture(1), capture(2), capture(3)], loads: [`http://old${route}`], answers: [{ url: 'https://api.github.com/repos/x', status: 200, headers: { 'content-type': 'application/json' }, body: Buffer.from('{"stars":1}') }] },
		journeys: {
			explored: { journeys: plain, elements: [{ element: 'button "A"', signature: 'main|button|A|0', layout: false, by: 'click A' }], skipped: 0, deferred: [{ journey: { name: 'delete', steps: [] }, signature: 'main|button|Delete|0' }], arrival: { entry: '/docs', link: { role: 'link', name: route } } },
			replays: { plain: [plain.map((j) => j.expected), run(1), run(2)], risky: [[[step('gone', 5)]], [[step('gone', 6)]]], dark: [[[step('dark', 7)]], [[step('dark', 8)]]], arrival: [[[step('arrived', 9)]], [[step('arrived', 10)]]] },
			arrival: [{ name: 'click A, after arriving', steps: [], start: '/docs' }],
		},
	} as unknown as RouteObservation;
}

async function produced(routes: readonly string[]): Promise<string> {
	const dir = await mkdtemp(join(tmpdir(), 'mm-original-'));
	const v = await versions();
	const half = Math.ceil(routes.length / 2);
	for (const [shard, part] of [routes.slice(0, half), routes.slice(half)].entries()) {
		const writer = new DatasetWriter(dir, { site: 'test', originalId: ORIGINAL, conditions, versions: v, routes, runner: 'test', shard: String(shard) });
		for (const route of part) await writeRoute(writer, route, observation(route));
		await writer.close();
	}
	await commitDataset(dir);
	return dir;
}

test("a route's observations of the original read back as the old half a live check would have held", async () => {
	const routes = ['/', '/docs', '/docs/components/button', '/blocks'];
	const dir = await produced(routes);
	try {
		const dataset = await Dataset.open(dir, { originalId: ORIGINAL, conditions, versions: await versions(), tables: ['loads', 'journeys', 'replays'] });
		for (const route of routes) {
			const seen = observation(route);
			assert.equal(originalRoute(dataset, route).kind, 'page');
			const loads = originalLoads(dataset, route, conditions.viewports);
			assert.deepEqual(loads.olds, seen.loads.samples);
			assert.ok(Buffer.isBuffer(loads.olds[0]!.pages.desktop!.screenshot), 'a screenshot is bytes again');
			assert.deepEqual(loads.loads, seen.loads.loads);
			assert.deepEqual(loads.answers, seen.loads.answers);
			const light = originalLoads(dataset, route, conditions.viewports.slice(0, 1));
			assert.deepEqual(Object.keys(light.olds[0]!.pages), ['desktop'], 'a light page has its first viewport alone');
			const journeys = originalJourneys(dataset, route);
			assert.deepEqual(journeys.explored, seen.journeys.explored);
			assert.equal(journeys.explored.journeys[0]!.expected, journeys.runs[0]![0], "the recorded run is the exploration's own, as live");
			assert.deepEqual(journeys.runs, seen.journeys.replays.plain);
			assert.equal(journeys.runs.length, SAMPLES.plain);
			assert.deepEqual([journeys.oldRisky, journeys.oldRiskyAgain], seen.journeys.replays.risky);
			assert.deepEqual(journeys.dark, seen.journeys.replays.dark);
			assert.deepEqual(journeys.arrival, { journeys: seen.journeys.arrival, runs: seen.journeys.replays.arrival });
		}
		assert.equal(originalAnswers(dataset, routes).length, 1, 'one third-party answer, however many routes read it');
		assert.throws(() => dataset.row('loads', '/nowhere', keys.load('/nowhere', ['desktop', 'mobile'], 0)), MissingRow);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});

test('a dataset is read only by a check of the same original, conditions and producer versions, and only once committed', async () => {
	const dir = await produced(['/']);
	try {
		const v = await versions();
		await assert.rejects(Dataset.open(dir, { originalId: 'b'.repeat(64), conditions, versions: v, tables: ['loads'] }), /original aaaaaaaaaaaa, not bbbbbbbbbbbb/);
		await assert.rejects(Dataset.open(dir, { conditions: { ...conditions, sendWrites: false }, versions: v, tables: ['loads'] }), /other conditions .*sendWrites/);
		await assert.rejects(Dataset.open(dir, { conditions, versions: { ...v, loads: { ...v.loads, version: v.loads.version + 1 } }, tables: ['loads'] }), /producer version 1; this checker reads version 2/);
		await rm(join(dir, 'manifest.json'));
		await assert.rejects(Dataset.open(dir, { conditions, versions: v, tables: ['loads'] }), /no committed dataset/);
		const writer = new DatasetWriter(dir, { site: 'test', originalId: ORIGINAL, conditions, versions: v, routes: ['/', '/docs'], runner: 'test', shard: 'late' });
		await writer.close();
		await assert.rejects(commitDataset(dir), /shard late produced for another dataset/);
		const two = await mkdtemp(join(tmpdir(), 'mm-original-'));
		const partial = new DatasetWriter(two, { site: 'test', originalId: ORIGINAL, conditions, versions: v, routes: ['/', '/docs'], runner: 'test' });
		await writeRoute(partial, '/', observation('/'));
		await partial.close();
		await assert.rejects(commitDataset(two), /1 route\(s\) were not produced, for example \/docs/);
		await rm(two, { recursive: true, force: true });
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});

test("a shard downloads its routes' buckets and the site-wide tables, nothing else", async () => {
	const routes = ['/', '/docs', '/a', '/b', '/c', '/d'];
	const dir = await produced(routes);
	try {
		const dataset = await Dataset.open(dir, { conditions, versions: await versions(), tables: [] });
		const files = filesFor(dataset.manifest, ['/docs']);
		const bucket = String(bucketOf('/docs')).padStart(2, '0');
		assert.ok(files.includes(`loads-${bucket}.ndjson`) && files.includes(`blobs-${bucket}`) && files.includes('manifest.json'));
		assert.ok(files.filter((f) => /^loads-/.test(f)).every((f) => f === `loads-${bucket}.ndjson`));
		const written = await readdir(dir);
		for (const f of files) if (f !== 'blobs-site') assert.ok(written.includes(f), `${f} was written`);
		assert.equal(dataset.manifest.conditionsId, conditionsId(conditions));
		assert.equal(dataset.manifest.tables.loads.rows, routes.length * (SAMPLES.loads + 1));
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});

test('the canary diff leaves out real-clock fields and names the facts that differ', () => {
	const a = { added: ['x'], reaction: { answeredMs: 10, regions: [[0, 0, 1, 1]], changes: ['value'] }, screenshot: Buffer.from('one') };
	assert.deepEqual(differences(a, { ...a, reaction: { ...a.reaction, answeredMs: 99, regions: [] } }), []);
	assert.deepEqual(differences({ tweened: ['path in group "Series" d|24|400'] }, { tweened: ['path in group "Series" d|19|380'] }), [], "a tween's frame count and span are the clock's");
	assert.deepEqual(
		differences(a, { ...a, added: ['y'], screenshot: Buffer.from('two') }).map((d) => d.path),
		['.added[0]', '.screenshot'],
	);
	const t = diffTable(new Map<string, unknown>([['k', a], ['only-a', 1]]), new Map<string, unknown>([['k', { ...a, added: ['z'] }]]));
	assert.deepEqual([t.onlyA, t.onlyB, t.differing.map((d) => d.key)], [['only-a'], [], ['k']]);
	assert.ok(same(diffTable(new Map([['k', a]]), new Map([['k', a]]))));
});

test('the canary names a field family that differs between two runs of the same code, and counts only a change that sticks', () => {
	const row = (focus: string, added: string[], ms: number) => ({ focus, added, reaction: { answeredMs: ms, changes: ['value'] } });
	const runs = {
		base: [new Map([['k', row('button A', ['x'], 10)]]), new Map([['k', row('button A', ['y'], 30)]])],
		head: [new Map([['k', row('button B', ['z'], 12)]]), new Map([['k', row('button B', ['x'], 11)]])],
	};
	const result = canary(['replays'], (side, run) => runs[side][run]!);
	assert.deepEqual(result.nondeterministic.map((n) => `${n.side} ${n.family}`), ['base .added[]', 'head .added[]'], 'what varies between runs of one side is named, never masked');
	assert.equal(result.tables.replays!.same, false);
	assert.match(result.tables.replays!.summary, /k \.focus/, 'the focus changed alike in both head runs: a change that sticks');
	assert.doesNotMatch(result.tables.replays!.summary, /added/);
	const alike = canary(['replays'], (side, run) => runs.base[0]!);
	assert.deepEqual([alike.nondeterministic, alike.tables.replays!.same], [[], true]);
	assert.equal(families({ a: [1, 2] }).get('.a[]'), families({ a: [1, 2] }).get('.a[]'));
	assert.notEqual(families({ a: [1, 2] }).get('.a[]'), families({ a: [2, 1] }).get('.a[]'), 'order is a fact, not sorted away');
});
