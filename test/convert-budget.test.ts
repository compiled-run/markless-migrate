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

// A tree whose convert gives the next of `readings` (CPU s, or null: the convert fails), and notes the fixture it was given.
async function tree(root: string, name: string, readings: readonly (number | null)[], liveMb = 144): Promise<string> {
	const dir = join(root, name);
	await mkdir(join(dir, 'scripts'), { recursive: true });
	await writeFile(join(dir, 'readings.json'), JSON.stringify(readings));
	await writeFile(
		join(dir, 'scripts', 'convert-budget.ts'),
		`import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
const at = (f) => new URL('../' + f, import.meta.url);
const n = existsSync(at('n')) ? Number(readFileSync(at('n'), 'utf8')) : 0;
writeFileSync(at('n'), String(n + 1));
const cpu = JSON.parse(readFileSync(at('readings.json'), 'utf8'))[n];
const [what, app, origin] = process.argv.slice(2);
if (what !== 'convert' || cpu === null || cpu === undefined) process.exit(1);
const sheet = await (await fetch(origin + '/site.css')).text();
appendFileSync(at('seen'), JSON.stringify([sheet, readFileSync(app + '/.migrate/inventory.json', 'utf8')]) + '\\n');
process.on('exit', () => writeFileSync(process.env.BUDGET_PEAK_FILE, JSON.stringify({ live: ${liveMb} * 2 ** 20, heap: 251 * 2 ** 20, rss: 600 * 2 ** 20, cpu })));
`,
	);
	return dir;
}
const reads = async (dir: string) => Number(await readFile(join(dir, 'n'), 'utf8').catch(() => '0'));
const seen = async (dir: string) => (await readFile(join(dir, 'seen'), 'utf8').catch(() => '')).split('\n').filter(Boolean);

// A small fixture module standing in for main's.
async function fixtureModule(root: string): Promise<string> {
	const file = join(root, 'fixture.ts');
	await writeFile(
		file,
		`import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
export async function writeFixture(dir) {
	await mkdir(join(dir, 'site'), { recursive: true });
	await mkdir(join(dir, 'app', '.migrate'), { recursive: true });
	await writeFile(join(dir, 'site', 'site.css'), '.main-fixture{}');
	await writeFile(join(dir, 'site', 'routes.json'), JSON.stringify({ '/site.css': 'site.css' }));
	await writeFile(join(dir, 'app', '.migrate', 'inventory.json'), JSON.stringify({ routes: [{ route: '/', status: 200 }] }));
	await writeFile(join(dir, 'app', '.migrate', 'libraries.json'), JSON.stringify({ libraries: [], stateComponents: [] }));
	await writeFile(join(dir, 'match.json'), '[]');
}
`,
	);
	return file;
}

async function judged(refs: readonly (number | null)[], heads: readonly (number | null)[], options: { headLiveMb?: number; limits?: object } = {}) {
	const root = await mkdtemp(join(tmpdir(), 'convert-budget-judge-test-'));
	try {
		const ref = await tree(root, 'reference', refs);
		const head = await tree(root, 'head', heads, options.headLiveMb);
		const limits = join(root, 'limits.json');
		await writeFile(limits, JSON.stringify(options.limits ?? { reference: REFERENCE, budget: BUDGET }));
		const run = spawnSync(process.execPath, [join(import.meta.dirname, '../scripts/convert-budget.ts'), 'judge', ref, head, limits, await fixtureModule(root)], { encoding: 'utf8', env: { ...process.env, GITHUB_STEP_SUMMARY: '' } });
		return { code: run.status, out: run.stdout, refReads: await reads(ref), headReads: await reads(head), refSaw: await seen(ref), headSaw: await seen(head) };
	} finally {
		await rm(root, { recursive: true, force: true });
	}
}

test('the job judges a change at the reference\'s speed: its CPU time over the reference\'s on the same runner, times the reference\'s 92 s', async () => {
	assert.equal(REFERENCE.cpuSeconds, 92);
	const fast = await judged([60, 61], [66]);
	assert.equal(fast.code, 0, fast.out);
	assert.match(fast.out, /\| this tree over the reference \| 1\.1 \|/);
	assert.match(fast.out, /\| convert CPU time at the reference's speed \| 101 s \| 120 s \|/);
	assert.deepEqual([fast.refReads, fast.headReads], [2, 1], 'the reference twice around the change');
	const slow = await judged([95, 96], [104]);
	assert.match(slow.out, /at the reference's speed \| 101 s/, 'a runner 1.6 times slower gives the same figure');
	const heavy = await judged([60, 60], [80, 80]);
	assert.equal(heavy.code, 1);
	assert.match(heavy.out, /convert CPU time at the reference's speed: 123 s, over 120 s/);
});

test('both trees convert the same fixture, main\'s, and a change whose own fixture differs is told so', async () => {
	const run = await judged([60, 60], [66]);
	assert.equal(run.refSaw.length, 2);
	assert.deepEqual(new Set([...run.refSaw, ...run.headSaw]).size, 1, 'every convert was served the same files');
	assert.match(run.refSaw[0] ?? '', /main-fixture/);
	assert.match(run.out, /This change's fixture \(scripts\/convert-budget-fixture\.ts\) differs from main's; both trees convert main's\./);
});

test('one slow reading neither passes nor fails a change: the lower reference is taken, and an over change is read again', async () => {
	assert.match((await judged([60, 158], [66])).out, /at the reference's speed \| 101 s/, 'a slow reference would have scaled the change down to 38 s');
	const again = await judged([60, 60], [99, 61]);
	assert.equal(again.code, 0);
	assert.equal(again.headReads, 2);
	assert.match(again.out, /at the reference's speed \| 94 s/);
	assert.equal((await judged([60, 60], [99, 98])).code, 1, 'a change that is heavy twice fails');
});

test('a reference that does not convert fails the job, names itself as the cause and what to do, and memory is still judged', async () => {
	const broken = await judged([null], [66], { headLiveMb: 300 });
	assert.equal(broken.code, 1);
	assert.match(broken.out, /the reference tree \(ea953ec7\) did not convert the fixture: its convert exited 1\. The change is not the cause: pin a reference that converts on today's toolchain in scripts\/convert-budget\.json, in a pull request of its own/);
	assert.match(broken.out, /peak live heap: 300 MB, over 190 MB/);
	assert.equal(broken.headReads, 1);
	assert.notEqual((await judged([60, 60], [null])).code, 0, 'a change that does not convert fails');
});

test('the job judges by the limits file it is given, which CI takes from main, and says when the change sets its own', async () => {
	const run = await judged([60, 60], [70], { limits: { reference: REFERENCE, budget: { ...BUDGET, cpuSeconds: 100 } } });
	assert.equal(run.code, 1, '70 / 60 x 92 is 107 s, over main\'s 100 s');
	assert.match(run.out, /\| convert CPU time at the reference's speed \| 107 s \| 100 s \|/);
	assert.match(run.out, /This change sets its own budget cpuSeconds in convert-budget\.json; it is judged by main's\./);
});
