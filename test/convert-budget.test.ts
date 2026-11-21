import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { BUDGET, overBudget, REFERENCE } from '../scripts/convert-budget.ts';

const measure = (peakLiveMb: number, peakHeapMb: number, cpuSeconds = 90, matchMs = 20) => ({ routes: 60, seconds: 130, cpuSeconds, matchMs, peakLiveMb, peakHeapMb, peakRssMb: 600 });

test('the convert budget passes the fixed tree and fails both regressions it was measured against', () => {
	assert.deepEqual(overBudget(measure(144, 251)), []);
	assert.equal(overBudget(measure(208, 612)).length, 2, 'b46d038b: every class oracle at once, and every layer parsed at once');
	assert.deepEqual(overBudget(measure(144, 507)), [`peak heap used: 507 MB, over ${BUDGET.heapMb} MB`], '315d4e99: every layer parsed at once');
});

test('the convert budget fails a convert that looks for each React-state component by walking every page again', () => {
	assert.deepEqual(overBudget(measure(144, 251, 90, 20)), []);
	assert.deepEqual(overBudget(measure(144, 251, 90, 3830)), [`React-state matching: 3830 ms, over ${BUDGET.matchMs} ms`], '6ac0281a: every component walked every page and read each element\'s siblings again');
});

test('convert CPU time is not judged on one reading: the same tree reads 79 s on one runner and 125 s on another', () => {
	assert.deepEqual(overBudget(measure(144, 251, 158)), []);
});

// A tree whose measure gives the next of `readings` each time it is run (null: the measure fails).
async function tree(root: string, name: string, readings: readonly (number | null)[]): Promise<string> {
	const dir = join(root, name);
	await mkdir(join(dir, 'scripts'), { recursive: true });
	await writeFile(join(dir, 'readings.json'), JSON.stringify(readings));
	await writeFile(
		join(dir, 'scripts', 'convert-budget.ts'),
		`import { existsSync, readFileSync, writeFileSync } from 'node:fs';
const at = (f) => new URL('../' + f, import.meta.url);
const n = existsSync(at('n')) ? Number(readFileSync(at('n'), 'utf8')) : 0;
writeFileSync(at('n'), String(n + 1));
const cpu = JSON.parse(readFileSync(at('readings.json'), 'utf8'))[n];
if (process.argv[2] !== 'measure' || cpu === null || cpu === undefined) process.exit(1);
writeFileSync(process.argv[3], JSON.stringify({ routes: 60, seconds: 150, cpuSeconds: cpu, matchMs: 20, peakLiveMb: 144, peakHeapMb: 251, peakRssMb: 600 }));
`,
	);
	return dir;
}
const reads = async (dir: string) => Number(await readFile(join(dir, 'n'), 'utf8'));

async function judged(refs: readonly (number | null)[], heads: readonly (number | null)[]) {
	const root = await mkdtemp(join(tmpdir(), 'convert-budget-judge-test-'));
	try {
		const ref = await tree(root, 'reference', refs);
		const head = await tree(root, 'head', heads);
		const run = spawnSync(process.execPath, [join(import.meta.dirname, '../scripts/convert-budget.ts'), 'judge', ref, head], { encoding: 'utf8', env: { ...process.env, GITHUB_STEP_SUMMARY: '' } });
		return { code: run.status, out: run.stdout, refReads: await reads(ref), headReads: await reads(head).catch(() => 0) };
	} finally {
		await rm(root, { recursive: true, force: true });
	}
}

test('the job judges a change at the reference\'s speed: its CPU time over the reference\'s on the same runner, times the reference\'s 92 s', async () => {
	assert.equal(REFERENCE.cpuSeconds, 92);
	const fast = await judged([60, 61], [66]);
	assert.equal(fast.code, 0);
	assert.match(fast.out, /\| this tree over the reference \| 1\.1 \|/);
	assert.match(fast.out, /\| convert CPU time at the reference's speed \| 101 s \| 120 s \|/);
	assert.deepEqual([fast.refReads, fast.headReads], [2, 1], 'the reference twice around the change');
	const slow = await judged([95, 96], [104.5]);
	assert.match(slow.out, /at the reference's speed \| 101 s/, 'a runner 1.6 times slower gives the same figure');
	const heavy = await judged([60, 60], [80, 80]);
	assert.equal(heavy.code, 1);
	assert.match(heavy.out, /convert CPU time at the reference's speed: 123 s, over 120 s/);
});

test('one slow reading neither passes nor fails a change: the lower reference is taken, and an over change is read again', async () => {
	assert.match((await judged([60, 158], [66])).out, /at the reference's speed \| 101 s/, 'a slow reference would have scaled the change down to 38 s');
	const again = await judged([60, 60], [99, 61]);
	assert.equal(again.code, 0);
	assert.equal(again.headReads, 2);
	assert.match(again.out, /at the reference's speed \| 94 s/);
	assert.equal((await judged([60, 60], [99, 98])).code, 1, 'a change that is heavy twice fails');
});

test('a reference that does not measure says so and does not fail the change; a change that does not measure fails', async () => {
	const broken = await judged([null], [66]);
	assert.equal(broken.code, 0);
	assert.match(broken.out, /The reference tree \(ea953ec7\) did not measure: its measure exited 1\. This change's convert CPU time is not judged/);
	assert.notEqual((await judged([60, 60], [null])).code, 0);
});

test('the job judges by the limits file it is given, which CI takes from main, and says when the change sets its own', async () => {
	const root = await mkdtemp(join(tmpdir(), 'convert-budget-limits-test-'));
	try {
		const ref = await tree(root, 'reference', [60, 60]);
		const head = await tree(root, 'head', [70]);
		const mains = join(root, 'main.json');
		await writeFile(mains, JSON.stringify({ reference: REFERENCE, budget: { ...BUDGET, cpuSeconds: 100 } }));
		const run = spawnSync(process.execPath, [join(import.meta.dirname, '../scripts/convert-budget.ts'), 'judge', ref, head, mains], { encoding: 'utf8', env: { ...process.env, GITHUB_STEP_SUMMARY: '' } });
		assert.equal(run.status, 1, '70 / 60 x 92 is 107 s, over main\'s 100 s');
		assert.match(run.stdout, /\| convert CPU time at the reference's speed \| 107 s \| 100 s \|/);
		assert.match(run.stdout, /This change sets its own budget cpuSeconds in convert-budget\.json; it is judged by main's\./);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});
