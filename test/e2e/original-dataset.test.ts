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
import { observeOriginal, writeObserved } from '../../src/data/original/produce.ts';
import { openOriginal } from '../../src/data/original/read.ts';
import { commitDataset, DatasetWriter } from '../../src/data/original/store.ts';
import { isSwitched } from '../../src/switch/state.ts';
import { CASES, ORIGINAL, page } from '../corpus/site.ts';

const servers: Server[] = [];
after(() => {
	for (const s of servers) {
		s.closeAllConnections();
		s.close();
	}
});

/** Pages a browser opened on each server, by path. */
const opened = new Map<string, string[]>();

function serve(pages: Record<string, string>): Promise<string> {
	const seen: string[] = [];
	const server = createServer((req, res) => {
		const path = new URL(req.url ?? '/', 'http://x').pathname;
		if (/Chrome/.test(req.headers['user-agent'] ?? '') && req.headers['sec-fetch-dest'] === 'document') seen.push(path);
		const body = path === '/' ? pages['/docs'] : pages[path];
		if (body === undefined) return void res.writeHead(404, { 'content-type': 'text/html' }).end('<!doctype html><title>Not found</title><h1>Not found</h1>');
		res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }).end(body);
	});
	servers.push(server);
	return new Promise((done) =>
		server.listen(0, '127.0.0.1', () => {
			const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
			opened.set(origin, seen);
			done(origin);
		}),
	);
}

// A page whose stylesheet styles a hover, a checked box, a container and two viewport widths: every kind of forced state.
const STATES_STYLE = (hover: string, narrow: string) => `.save:hover { background: ${hover} } input:checked + label { font-weight: 700 } .card { container-type: inline-size } @container (min-width: 400px) { .card p { columns: 2 } } @media (max-width: 700px) { .side { display: ${narrow} } } @media (min-width: 1400px) { main { max-width: 1200px } }`;
const statesPage = (hover: string, narrow: string) => page('States', `<button class="save">Save</button><input type="checkbox" id="c"><label for="c">Remember me</label><div class="card"><p>One column or two, by the card's width.</p></div><aside class="side">Side notes</aside>`, '', STATES_STYLE(hover, narrow));
const STATES = { '/docs/states': statesPage('#cde', 'none'), '/docs/states-bug': statesPage('#cde', 'none') };
const STATES_BUG = { '/docs/states-bug': statesPage('#fdc', 'block') };

const MUTATED = ['combobox-clear', 'code-tabs'];
const SAME = ['context-submenu'];
const normalized = (failures: readonly Failure[]) => failures.filter((f) => !f.accepted).map((f) => `${f.route} | ${f.check} | ${f.expected} | ${f.actual.replace(/\d+(\.\d+)? ?(ms|s)\b/g, '#')}`).sort();

test("a check reading the original's dataset finds what a check observing the original live finds", async () => {
	const mutated = Object.fromEntries(MUTATED.map((id) => [CASES[id]!.route, CASES[id]!.mutant]));
	const [oldOrigin, newOrigin] = await Promise.all([serve({ ...ORIGINAL, ...STATES }), serve({ ...ORIGINAL, ...STATES, ...mutated, ...STATES_BUG })]);
	const routes = [...[...MUTATED, ...SAME].map((id) => CASES[id]!.route), ...Object.keys(STATES)];
	const dir = await mkdtemp(join(tmpdir(), 'original-dataset-'));
	const browser = await chromium.launch({ ...LAUNCH, ignoreDefaultArgs: [...LAUNCH.ignoreDefaultArgs] });
	try {
		const options = { oldOrigin, newOrigin };
		const conditions = originalConditions(options);
		const versions = (await readLock()).producers;
		const env = defaultEnv(oldOrigin, { sendWrites: writesAllowed(options) });
		const writer = new DatasetWriter(dir, { site: 'corpus', originalId: '0'.repeat(64), conditions, versions, routes, runner: 'test' });
		for (const route of routes) await writeObserved(writer, route, await observeOriginal(browser, env, route, { viewports: VIEWPORTS, explore: { serves: (path) => isSwitched([route], path) } }));
		await writer.close();
		await commitDataset(dir);
		const original = await openOriginal(dir);
		for (const route of routes) {
			// One route a run: a run of several deals their shared layout controls out among them, which the dataset's producer did not.
			const live = await runCheck({ ...options, routes: [route], browser });
			const before = opened.get(oldOrigin)!.length;
			const stored = await runCheck({ ...options, routes: [route], browser, original });
			const oldPages = opened.get(oldOrigin)!.slice(before);
			assert.deepEqual(normalized(stored.routes.flatMap((r) => r.failures)), normalized(live.routes.flatMap((r) => r.failures)), route);
			assert.equal(stored.routes[0]!.journeys?.length, live.routes[0]!.journeys?.length, `${route}: as many journeys`);
			assert.deepEqual(stored.routes[0]!.states, live.routes[0]!.states, `${route}: the same states checked and skipped`);
			// A default-state style failure is traced to its old rule on an old page of its own: the hint, never the verdict.
			const traced = live.routes[0]!.failures.some((f) => f.dimension === 'css' && f.check.startsWith('computed style of'));
			// The pages new journeys went on to are opened on the old side for their errors (doorPageErrors), not the route's.
			if (!traced) assert.deepEqual(oldPages.filter((path) => path === route), [], `${route}: the route's old page is not opened for its forced states`);
		}
		const bug = (await runCheck({ ...options, routes: ['/docs/states-bug'], browser, original })).routes[0]!;
		assert.ok(bug.states?.checked.includes(':hover on .save (desktop)') && bug.states.checked.includes('viewport width 700px (desktop)'), bug.states?.checked.join(', '));
		const found = normalized(bug.failures);
		assert.ok(found.some((f) => f.includes('computed style in :hover on .save') && f.includes('background-color')), found.join('\n'));
		assert.ok(found.some((f) => f.includes('in viewport width 700px')), found.join('\n'));
		const missing = await runCheck({ ...options, routes: ['/nowhere-in-the-dataset'], browser, original });
		assert.equal(missing.routes[0]!.infrastructure?.cause, 'not in the original dataset', 'a route the dataset lacks is not checked, never observed live instead');
	} finally {
		await browser.close();
		await rm(dir, { recursive: true, force: true });
	}
});
