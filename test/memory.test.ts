import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { promisify } from 'node:util';

const run = promisify(execFile);
const HERE = new URL('.', import.meta.url).pathname;
// A finished route keeps its verdict and summaries; one route's screenshots alone weigh about 4.5 MB here, its old captures far more.
const PER_ROUTE_BYTES = 1024 * 1024;

// CI's runner took 275 s of 300 here on main (2026-10-22), sharing its shard with other browser tests; the routes run one at a time.
test('a check holds the same memory however many routes it has done: screenshots go to disk as each route finishes, captures are let go', { timeout: 600_000 }, async () => {
	const dir = await mkdtemp(join(tmpdir(), 'mm-memory-'));
	try {
		const { stdout } = await run(process.execPath, ['--expose-gc', join(HERE, 'memory-run.ts'), '12', dir], { maxBuffer: 1 << 20 });
		const r = JSON.parse(stdout.trim().split('\n').at(-1)!) as { routes: number; checked: number; shots: number; buffers: number; between: number; early: number; late: number };
		assert.equal(r.checked, r.routes, 'every route was compared');
		assert.ok(r.shots >= r.routes * 2, 'each route has a screenshot per viewport');
		assert.equal(r.buffers, 0, 'the report holds no image in memory');
		assert.ok((await readdir(join(dir, 'shots'))).length > 0, 'the screenshots were written under shots/');
		const perRoute = (r.late - r.early) / r.between;
		assert.ok(perRoute < PER_ROUTE_BYTES, `each finished route kept ${Math.round(perRoute / 1024)} kB in memory, at most ${PER_ROUTE_BYTES / 1024} kB`);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});

test("writing a large run's report holds about one route at a time, not the whole report as text", async () => {
	const dir = await mkdtemp(join(tmpdir(), 'mm-report-memory-'));
	try {
		const { stdout } = await run(process.execPath, ['--expose-gc', join(HERE, 'report-memory-run.ts'), '100', dir], { maxBuffer: 1 << 20 });
		const r = JSON.parse(stdout.trim().split('\n').at(-1)!) as { json: number; html: number; report: number; extra: number };
		assert.ok(r.json > 30_000_000 && r.html > 30_000_000, `a large report: ${r.json} B of JSON, ${r.html} B of HTML`);
		// Before the reports were streamed, writing this one held 96 MB more (its JSON as one string, then its HTML).
		assert.ok(r.extra < r.json / 10, `writing the report held ${Math.round(r.extra / 1e6)} MB more, at most a tenth of its ${Math.round(r.json / 1e6)} MB of JSON`);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});
