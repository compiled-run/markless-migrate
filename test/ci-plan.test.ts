import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { E2E, EVERY_PULL_REQUEST, plan } from '../scripts/ci-plan.ts';

const ROOT = join(import.meta.dirname, '..');
const suites = (changed: string[]) => [...new Set(plan(ROOT, changed).e2e.map((job) => job.suite))];

test('every e2e suite file has a CI job, so a new suite cannot go unrun', () => {
	const files = readdirSync(join(ROOT, 'test/e2e')).filter((name) => name.endsWith('.test.ts')).map((name) => name.replace('.test.ts', ''));
	assert.deepEqual([...new Set(E2E.map((job) => job.suite))].sort(), files.sort());
});

test('the merge queue, main and a dispatch run every test, and so does a change to dependencies or CI', () => {
	const all = plan(ROOT, undefined);
	assert.equal(all.e2e.length, E2E.length);
	assert.equal(all.unitFiles.length, readdirSync(join(ROOT, 'test')).filter((name) => name.endsWith('.test.ts')).length);
	for (const path of ['pnpm-lock.yaml', 'package.json', '.github/workflows/ci.yml', '.github/actions/setup/action.yml', 'scripts/ci-plan.ts']) assert.deepEqual(plan(ROOT, [path]), { ...all, reason: 'the change reaches every test' }, path);
});

test('a change no test reads runs only the Firefox sample, which every pull request runs', () => {
	const result = plan(ROOT, ['LICENSE']);
	assert.deepEqual(result.unitFiles, []);
	assert.deepEqual(result.e2e.map((job) => job.suite), ['slow-network', 'late-fonts']);
	assert.ok(result.e2e.every((job) => EVERY_PULL_REQUEST.has(job.suite) && job.browsers?.split(' ').includes('firefox')));
});

test("a suite's own fixture runs that suite, and the checker's source runs every suite that imports it", () => {
	const waste = suites(['fixtures/waste/server.ts']);
	assert.ok(waste.includes('waste') && !waste.includes('motion') && !waste.includes('radix-dialog-port'), waste.join(' '));
	assert.ok(waste.includes('slow-network') && waste.includes('late-fonts'));
	const radix = suites(['fixtures/radix-dialog-react/src/App.tsx']);
	assert.ok(radix.includes('radix-dialog-port') && !radix.includes('motion'), radix.join(' '));
	const checker = suites(['src/check/run.ts']);
	assert.ok(checker.includes('next-app') && checker.includes('vite-site') && !checker.includes('radix-dialog-port'), checker.join(' '));
});

test('paths a test builds from string segments are inputs too', () => {
	assert.ok(plan(ROOT, ['examples/shadcn-ui-markless/lib/site/parts.ts']).unitFiles.includes('test/parts-browser.test.ts'));
	assert.ok(plan(ROOT, ['parts/sonner.ts']).unitFiles.includes('test/parts-registries.test.ts'));
});
