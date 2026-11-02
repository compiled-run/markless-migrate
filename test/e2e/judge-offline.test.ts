// A check judged again from the observations it recorded gives the same report, byte for byte: the judge reads its rows
// alone, so a judge change can be scored on a run's rows with no browser. Pages of the bug corpus's micro-site, with some
// bugs put back and some not, exercise every stage: loads, forced states, journeys, probes, control parity, motion and timings.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { digest } from '../../src/data/codec.ts';
import { MemoryObservations } from '../../src/data/observations.ts';
import { judgeObserved } from '../../src/check/judge.ts';
import { runCheck } from '../../src/check/run.ts';
import { jsonReport } from '../../src/check/report-judge.ts';
import { CASES, ORIGINAL } from '../corpus/site.ts';
import { ROOT } from './harness.ts';

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

function cli(cwd: string, args: readonly string[]): Promise<{ code: number | null; stdout: string; stderr: string }> {
	return new Promise((done) => {
		const child = spawn(process.execPath, [join(ROOT, 'src/cli.ts'), ...args], { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
		let stdout = '', stderr = '';
		child.stdout.on('data', (d: Buffer) => (stdout += d));
		child.stderr.on('data', (d: Buffer) => (stderr += d));
		child.on('close', (code) => done({ code, stdout, stderr }));
	});
}

test('check writes its observations to .migrate/observations, check judge gives back the report it wrote, and names a route whose report differs', async () => {
	const c = CASES['combobox-clear']!;
	const [oldOrigin, newOrigin] = await Promise.all([serve(ORIGINAL), serve({ ...ORIGINAL, [c.route]: c.mutant })]);
	const cwd = await mkdtemp(join(tmpdir(), 'judge-cli-'));
	try {
		const checked = await cli(cwd, ['check', '--old', oldOrigin, '--new', newOrigin, '--route', c.route, '--control-webkit', '--no-load']);
		assert.ok(checked.code === 1 || checked.code === 4, `check found the bug (exit ${checked.code}):\n${checked.stderr.slice(-2000)}`);
		assert.deepEqual((await readdir(join(cwd, '.migrate/observations'))).sort(), ['blobs', 'routes.ndjson', 'run.ndjson']);
		const same = await cli(cwd, ['check', 'judge', '--report', '.migrate/report.json']);
		assert.equal(same.code, 0, same.stderr);
		assert.match(same.stdout, /matches \.migrate\/report\.json/);
		const path = join(cwd, '.migrate/report.json');
		const written = JSON.parse(await readFile(path, 'utf8')) as { routes: { failures: { actual: string }[] }[] };
		written.routes[0]!.failures[0]!.actual += ' (edited)';
		await writeFile(path, JSON.stringify(written));
		const differs = await cli(cwd, ['check', 'judge', '--report', '.migrate/report.json']);
		assert.equal(differs.code, 6, differs.stdout);
		assert.match(differs.stderr, new RegExp(`${c.route.replace(/\//g, '\\/')}: [^\\n]*failures`));
	} finally {
		await rm(cwd, { recursive: true, force: true });
	}
});

