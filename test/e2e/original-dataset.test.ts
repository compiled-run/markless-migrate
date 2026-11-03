// A check that reads the old side from the original's dataset finds what a check observing it live finds: the stored rows
// are the old half a live check holds. Pages of the bug corpus's micro-site, some with their bug put back on the port.
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { chromium } from 'playwright';
import { defaultEnv, LAUNCH } from '../../src/check/browser.ts';
import { originalConditions, runCheck, writesAllowed } from '../../src/check/run.ts';
import type { Failure } from '../../src/check/types.ts';
import { VIEWPORTS } from '../../src/check/types.ts';
import { readLock } from '../../src/data/original/lock.ts';
import { observeOriginal, writeRoute } from '../../src/data/original/produce.ts';
import { openOriginal } from '../../src/data/original/read.ts';
import { commitDataset, DatasetWriter } from '../../src/data/original/store.ts';
import { isSwitched } from '../../src/switch/state.ts';
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

const MUTATED = ['combobox-clear', 'code-tabs'];
const SAME = ['context-submenu'];
const normalized = (failures: readonly Failure[]) => failures.filter((f) => !f.accepted).map((f) => `${f.route} | ${f.check} | ${f.expected} | ${f.actual.replace(/\d+(\.\d+)? ?(ms|s)\b/g, '#')}`).sort();

test("a check reading the original's dataset finds what a check observing the original live finds", async () => {
	const mutated = Object.fromEntries(MUTATED.map((id) => [CASES[id]!.route, CASES[id]!.mutant]));
	const [oldOrigin, newOrigin] = await Promise.all([serve(ORIGINAL), serve({ ...ORIGINAL, ...mutated })]);
	const routes = [...MUTATED, ...SAME].map((id) => CASES[id]!.route);
	const dir = await mkdtemp(join(tmpdir(), 'original-dataset-'));
	const browser = await chromium.launch({ ...LAUNCH, ignoreDefaultArgs: [...LAUNCH.ignoreDefaultArgs] });
	try {
		const options = { oldOrigin, newOrigin };
		const conditions = originalConditions(options);
		const versions = (await readLock()).producers;
		const env = defaultEnv(oldOrigin, { sendWrites: writesAllowed(options) });
		const writer = new DatasetWriter(dir, { originalId: '0'.repeat(64), conditions, versions, runner: 'test' });
		for (const route of routes) await writeRoute(writer, route, await observeOriginal(browser, env, route, { viewports: VIEWPORTS, explore: { serves: (path) => isSwitched([route], path) } }));
		await writer.close();
		await commitDataset(dir, { site: 'corpus', originalId: '0'.repeat(64), conditions, versions, routes });
		const original = await openOriginal(dir);
		for (const route of routes) {
			// One route a run: a run of several deals their shared layout controls out among them, which the dataset's producer did not.
			const live = await runCheck({ ...options, routes: [route], browser });
			const stored = await runCheck({ ...options, routes: [route], browser, original });
			assert.deepEqual(normalized(stored.routes.flatMap((r) => r.failures)), normalized(live.routes.flatMap((r) => r.failures)), route);
			assert.equal(stored.routes[0]!.journeys?.length, live.routes[0]!.journeys?.length, `${route}: as many journeys`);
		}
		const missing = await runCheck({ ...options, routes: ['/nowhere-in-the-dataset'], browser, original });
		assert.equal(missing.routes[0]!.infrastructure?.cause, 'not in the original dataset', 'a route the dataset lacks is not checked, never observed live instead');
	} finally {
		await browser.close();
		await rm(dir, { recursive: true, force: true });
	}
});
