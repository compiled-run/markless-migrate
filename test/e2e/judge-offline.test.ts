// A check judged again from the observations it recorded gives the same report, byte for byte: the judge reads its rows
// alone, so a judge change can be scored on a run's rows with no browser. Pages of the bug corpus's micro-site, with some
// bugs put back and some not, exercise every stage: loads, forced states, journeys, probes, control parity, motion and timings.
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { digest } from '../../src/data/codec.ts';
import { MemoryObservations } from '../../src/data/observations.ts';
import { judgeObserved } from '../../src/check/judge.ts';
import { jsonReport, runCheck } from '../../src/check/run.ts';
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

/** Bugs put back on the port, and pages left as the original has them. */
const MUTATED = ['currency-select', 'avatar-motion', 'combobox-clear', 'code-tabs', 'tooltip-anchor', 'markdown-replay'];
const SAME = ['create-get-started', 'context-submenu'];

test('every route of a check, judged again from its recorded rows, gives the report the live check wrote', async () => {
	const mutated = Object.fromEntries(MUTATED.map((id) => [CASES[id]!.route, CASES[id]!.mutant]));
	const [oldOrigin, newOrigin] = await Promise.all([serve(ORIGINAL), serve({ ...ORIGINAL, ...mutated })]);
	const dir = await mkdtemp(join(tmpdir(), 'judge-offline-'));
	try {
		const observations = new MemoryObservations();
		const routes = [...MUTATED, ...SAME].map((id) => CASES[id]!.route);
		// As a site's check runs it on GitHub (check.yml, corpus.yml): every dimension, WebKit's pop-up places, no page load.
		// With no artifacts folder the live report keeps every screenshot, diff and frame, so the whole of it can be compared.
		const live = await runCheck({ oldOrigin, newOrigin, routes, controls: { webkit: true }, probes: {}, motion: {}, responsiveness: {}, embeds: { dir: join(dir, 'embeds') }, navigation: {}, observations });
		const observed = observations.read();
		const stages = new Set([...observed.routes.values()].flatMap((rows) => rows.map((r) => r.stage)));
		// Retime rows come only where a step answers more slowly on the port, which the gate's real builds have.
		for (const stage of ['wall', 'load', 'assets', 'negotiate', 'selfUrls', 'states', 'journeys', 'clock', 'probes', 'parity', 'motion', 'responsiveness', 'locate', 'walls', 'timing']) assert.ok(stages.has(stage), `the check recorded ${stage} rows (it recorded ${[...stages].join(', ')})`);
		const offline = await judgeObserved(observed);
		const red = live.routes.flatMap((r) => r.failures).filter((f) => !f.accepted);
		assert.ok(red.length >= MUTATED.length, `the live check found the bugs put back (${red.length} findings)`);
		assert.equal(JSON.stringify(jsonReport(offline), null, '\t'), JSON.stringify(jsonReport(live), null, '\t'));
		assert.equal(digest(offline), digest(live), 'every screenshot, diff, frame and journey of the report is the same too');
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});
