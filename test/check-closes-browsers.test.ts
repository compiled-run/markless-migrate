// A check stopped partway, by SIGINT, SIGTERM or an uncaught error, leaves no browser or child process of its own running:
// every process under the check when it was stopped is gone soon after it exits.
import assert from 'node:assert/strict';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { setTimeout as sleep } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';

const RUN = pathToFileURL(new URL('../src/check/run.ts', import.meta.url).pathname).href;
const TYPES = pathToFileURL(new URL('../src/check/types.ts', import.meta.url).pathname).href;
const page = (title: string) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${title}</title></head><body><main><h1>${title}</h1><p>A small page.</p></main></body></html>`;

type Stage = 'load' | 'network' | 'route';
type Stop = 'SIGINT' | 'SIGTERM' | 'crash';

/** A page server that answers at once, except the first page request of `stage`'s browser, which it holds and reports. */
function serve(stage: Stage, reached: () => void): Promise<Server> {
	let seen = false;
	const server = createServer((req, res) => {
		const agent = req.headers['user-agent'] ?? '';
		// Lighthouse loads the page as its emulated phone; Playwright's Chromium, in the slow-network or per-route stage, says it is headless.
		const ours = stage === 'load' ? /Android/.test(agent) : /HeadlessChrome/.test(agent);
		if (ours) {
			if (!seen) reached();
			seen = true;
			return;
		}
		res.writeHead(200, { 'content-type': 'text/html' }).end(page(req.url ?? '/'));
	});
	return new Promise((done) => server.listen(0, '127.0.0.1', () => done(server)));
}

interface Proc {
	readonly pid: number;
	readonly started: string;
}

function table(): { pid: number; ppid: number; started: string }[] {
	return execFileSync('ps', ['-A', '-o', 'pid=,ppid=,lstart='], { encoding: 'utf8' })
		.trim()
		.split('\n')
		.map((row) => {
			const [pid, ppid, ...started] = row.trim().split(/\s+/);
			return { pid: Number(pid), ppid: Number(ppid), started: started.join(' ') };
		});
}

/** Every process under `root`, each with its start time so a reused pid is not mistaken for it. */
function descendants(root: number): Proc[] {
	const rows = table();
	const found: Proc[] = [];
	const walk = (pid: number) => {
		for (const row of rows) if (row.ppid === pid) found.push({ pid: row.pid, started: row.started }), walk(row.pid);
	};
	walk(root);
	return found;
}

function living(procs: readonly Proc[]): Proc[] {
	const now = new Map(table().map((r) => [r.pid, r.started]));
	return procs.filter((p) => now.get(p.pid) === p.started);
}

const servers: Server[] = [];
const children: ChildProcess[] = [];
const seenProcs: Proc[] = [];
after(() => {
	for (const s of servers) s.closeAllConnections(), s.close();
	for (const c of children) if (c.exitCode === null && c.signalCode === null) c.kill('SIGKILL');
	for (const p of living(seenProcs)) {
		try {
			process.kill(p.pid, 'SIGKILL');
		} catch {}
	}
});

async function stopMidway(stage: Stage, stop: Stop): Promise<void> {
	let reached!: () => void;
	const atStage = new Promise<void>((done) => (reached = done));
	const server = await serve(stage, () => reached());
	servers.push(server);
	const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
	const options = { oldOrigin: origin, newOrigin: origin, routes: ['/a'], concurrency: 1, journeys: { maxJourneys: 1 }, ...(stage === 'route' ? {} : { only: 'load', load: { runs: 1, ...(stage === 'network' ? { network: { profiles: ['regular-3g'], browsers: ['chromium'], runs: 1 } } : {}) } }) };
	const script = `
		import { runCheck } from ${JSON.stringify(RUN)};
		import { VIEWPORTS } from ${JSON.stringify(TYPES)};
		process.on('message', () => setImmediate(() => { throw new Error('the check crashed partway'); }));
		await runCheck({ ...${JSON.stringify(options)}, viewports: [VIEWPORTS[0]] });
		process.disconnect();
	`;
	// A file, not --eval: the check's worker threads inherit the process's flags, and --input-type refuses a worker's file.
	const file = join(await mkdtemp(join(tmpdir(), 'check-closes-browsers-')), 'check.mjs');
	await writeFile(file, script);
	const child = spawn(process.execPath, [file], { stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
	children.push(child);
	let stderr = '';
	child.stderr!.on('data', (chunk: Buffer) => void (stderr += chunk));
	const exited = new Promise<void>((done) => child.once('exit', () => done()));
	const early = exited.then(() => {
		throw new Error(`the check ended before it reached the ${stage} stage: ${stderr.slice(-800)}`);
	});
	await Promise.race([atStage, early]);
	// The stage's browser has asked for the page and is waiting on it: what runs under the check now is what it started.
	await sleep(500);
	const under = descendants(child.pid!);
	seenProcs.push(...under);
	assert.ok(under.length > 1, `a browser runs under the check in the ${stage} stage: ${JSON.stringify(under)}`);
	if (stop === 'crash') child.send('crash');
	else child.kill(stop);
	const stopped = await Promise.race([exited.then(() => true), sleep(30_000).then(() => false)]);
	assert.ok(stopped, `the check exits within 30 s of ${stop} in the ${stage} stage`);
	let left = living(under);
	for (let waited = 0; left.length && waited < 10_000; waited += 250) {
		await sleep(250);
		left = living(under);
	}
	assert.deepEqual(left, [], `processes the check started outlive it after ${stop} in the ${stage} stage`);
}

const STAGES: Readonly<Record<Stage, string>> = { load: 'mid page load (Lighthouse)', network: 'mid page load (slow network)', route: 'mid per-route stage' };
for (const stage of ['load', 'network', 'route'] as const) {
	// Slow-network browsers are Playwright's, which it closes itself on SIGINT and exit; SIGTERM it closes without ending the check.
	for (const stop of stage === 'network' ? (['SIGTERM'] as const) : (['SIGINT', 'SIGTERM', 'crash'] as const)) {
		test(`a check stopped by ${stop === 'crash' ? 'an uncaught error' : stop} ${STAGES[stage]} leaves no process of its own running`, { timeout: 120_000 }, () => stopMidway(stage, stop));
	}
}
