import assert from 'node:assert/strict';
import { mkdtemp, readdir } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { chromium, type Browser } from 'playwright';
import { PROGRESS_DIR } from '../src/check/progress.ts';
import { runCheck } from '../src/check/run.ts';
import { VIEWPORTS } from '../src/check/types.ts';

let browser: Browser;
const servers: Server[] = [];
before(async () => {
	browser = await chromium.launch();
});
after(async () => {
	await browser?.close();
	for (const s of servers) s.close();
});

async function serve(): Promise<{ origin: string; hits: () => number }> {
	let hits = 0;
	const server = createServer((req, res) => {
		if (req.url === '/b') hits++;
		res.writeHead(200, { 'content-type': 'text/html' });
		res.end(`<!doctype html><html lang="en"><head><title>${req.url}</title></head><body><main><h1>${req.url}</h1></main></body></html>`);
	});
	servers.push(server);
	await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
	return { origin: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, hits: () => hits };
}

test('a check writes each route as it finishes, and --resume takes those results instead of checking the routes again', async () => {
	const dir = await mkdtemp(join(tmpdir(), 'mm-progress-'));
	const old = await serve();
	const next = await serve();
	const run = (resume: boolean) => runCheck({ oldOrigin: old.origin, newOrigin: next.origin, routes: ['/a', '/b'], viewports: [VIEWPORTS[0]!], browser, artifactsDir: dir, progress: { dir, resume } });
	const first = await run(false);
	const [written] = await readdir(join(dir, PROGRESS_DIR));
	assert.equal((await readdir(join(dir, PROGRESS_DIR, written!))).filter((f) => f.endsWith('.json')).length, 2, 'one file per route');
	const loads = next.hits();
	assert.ok(loads > 0);
	const resumed = await run(true);
	assert.equal(next.hits(), loads, 'no route was loaded again');
	assert.deepEqual(resumed.routes.map((r) => [r.route, r.ok]), first.routes.map((r) => [r.route, r.ok]));
	await run(false);
	assert.ok(next.hits() > loads, 'a run without --resume checks every route again');
});
