// The bugs the owner found by hand in the ui.shadcn.com port, put back one at a time into a micro-site built like the
// original: check, as a site's run invokes it, must report each one, naming the control or what it shows.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import type { Failure, Report } from '../../src/check/types.ts';
import { CASES, ORIGINAL, type Case } from '../corpus/site.ts';
import { ROOT, sharded } from './harness.ts';

const servers: Server[] = [];
after(() => {
	for (const s of servers) {
		s.closeAllConnections();
		s.close();
	}
});

const FILLERS = Array.from({ length: 20 }, (_, i) => `/filler/${i}`);
const filler = (i: string) => `<!doctype html><html lang="en"><head><title>Filler ${i}</title></head><body><main><h1>Filler ${i}</h1><p>A page of the site that is not under test.</p></main></body></html>`;

/** A page of the bug's template that sorts before it: its group's representative, so the bug's own page is checked as most of a large site's pages are. */
export const twin = (route: string) => route.replace(/\/([^/]*)$/, '/0$1');

function serve(pages: Record<string, string>): Promise<string> {
	const server = createServer((req, res) => {
		const path = new URL(req.url ?? '/', 'http://x').pathname;
		const body = path === '/' ? ORIGINAL['/docs']! : path.startsWith('/filler/') ? filler(path.slice(8)) : (pages[path] ?? ORIGINAL[Object.keys(ORIGINAL).find((r) => twin(r) === path) ?? '']);
		if (body === undefined) return void res.writeHead(404, { 'content-type': 'text/html' }).end('<!doctype html><title>Not found</title><h1>Not found</h1>');
		res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }).end(body);
	});
	servers.push(server);
	return new Promise((done) => server.listen(0, '127.0.0.1', () => done(`http://127.0.0.1:${(server.address() as AddressInfo).port}`)));
}

/** The flags a site's check runs with on GitHub (check.yml), less page load, which a micro-site cannot speak for. */
export const CHECK_FLAGS = ['--control-webkit', '--no-load'] as const;

/** One case checked as a shard of a site of more than 20 pages (`--site-targets`), as a site's run on GitHub checks it, or `alone` as its only page. */
export async function checkCase(c: Case, { mutant = true, alone = false, routes = [c.route] }: { mutant?: boolean; alone?: boolean; routes?: readonly string[] } = {}): Promise<Report> {
	const [oldOrigin, newOrigin] = await Promise.all([serve(ORIGINAL), serve({ ...ORIGINAL, [c.route]: mutant ? c.mutant : c.old })]);
	const cwd = await mkdtemp(join(tmpdir(), 'corpus-'));
	const site = join(cwd, 'site-targets.json');
	await writeFile(site, JSON.stringify({ routes: [...Object.keys(ORIGINAL), ...Object.keys(ORIGINAL).map(twin), ...FILLERS] }));
	try {
		const out = await new Promise<string>((done, fail) => {
			const child = spawn(process.execPath, [join(ROOT, 'src/cli.ts'), 'check', '--old', oldOrigin, '--new', newOrigin, ...routes.flatMap((r) => ['--route', r]), ...(alone ? [] : ['--site-targets', site]), ...CHECK_FLAGS, '--json'], { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
			let stdout = '', stderr = '';
			child.stdout.on('data', (d: Buffer) => (stdout += d));
			child.stderr.on('data', (d: Buffer) => (stderr += d));
			child.on('close', (code) => (code === 0 || code === 1 || code === 4 ? done(stdout) : fail(new Error(`check exited ${code}:\n${stderr.slice(-2000)}`))));
		});
		return JSON.parse(out) as Report;
	} finally {
		await rm(cwd, { recursive: true, force: true });
	}
}

export const text = (f: Failure) => `${f.dimension}: ${f.check} | ${f.expected} | ${f.actual}`;
export const open = (r: Report) => r.routes.flatMap((x) => x.failures).filter((f) => !f.accepted);
// A control the run never used is a gap in coverage, not a report of what it does.
const names = (c: Case, f: Failure) => !f.check.startsWith('not exercised') && c.caught.test(text(f));

/** Motion every page of a large site gets (not only its template's representative) is not compared yet; the structured state probe takes these. */
const PENDING = new Set(['three-dots-motion', 'combobox-close-motion']);

const suite = sharded();
suite.test('the original against itself: no page of the micro-site is red', async () => {
	const report = await checkCase(CASES['create-get-started']!, { mutant: false, routes: Object.keys(ORIGINAL) });
	assert.deepEqual(open(report).map(text), []);
});
for (const [id, c] of Object.entries(CASES)) {
	if (PENDING.has(id)) {
		test.todo(`${id}: ${c.bug} (pending: motion compared on every page)`);
		continue;
	}
	suite.test(`${id}: ${c.bug}`, async () => {
		const report = await checkCase(c);
		const found = open(report).filter((f) => names(c, f));
		console.log(`CORPUS ${id}: ${found.length ? 'CAUGHT' : 'MISSED'} (${open(report).length} findings)\n${open(report).map((f) => `  ${names(c, f) ? '*' : ' '} ${text(f).slice(0, 300)}`).join('\n')}`);
		assert.ok(found.length, `check did not report "${c.bug}" on ${c.route}; it reported:\n${open(report).map(text).join('\n') || '(nothing)'}`);
	});
}
