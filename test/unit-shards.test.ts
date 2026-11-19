import assert from 'node:assert/strict';
import { test } from 'node:test';
import { modelled, pack, readList, shards, unitTestFiles, type ShardList } from '../scripts/unit-shards.ts';

const list = readList();
const files = unitTestFiles();
const total = Math.max(...Object.values(list.files).map((e) => e.shard));
const shardOf = (dealt: string[][]) => new Map(dealt.flatMap((s, i) => s.map((f) => [f, i + 1] as const)));

test('every unit test file has an entry in scripts/unit-shards.json, and every entry is a file', () => {
	const dealt = shards(list, files, total);
	const lightest = dealt.findIndex((s) => s.some((f) => !list.files[f])) + 1;
	assert.deepEqual(files.filter((f) => !list.files[f]).map((f) => `${f}: add "${f}": {"shard":${lightest},"seconds":<its slowest time on CI>}`), []);
	assert.deepEqual(Object.keys(list.files).filter((f) => !files.includes(f)), []);
});

test(`every shard runs files, and none is modelled past ${list.budgetSeconds} s from its files' slowest measured times`, () => {
	const dealt = shards(list, files, total);
	assert.equal(dealt.flat().length, files.length);
	assert.ok(dealt.every((s) => s.length > 0));
	const over = dealt.map((s, i) => [i + 1, Math.round(modelled(s.map((f) => list.files[f]?.seconds ?? 0)))] as const).filter(([, s]) => s > list.budgetSeconds);
	assert.deepEqual(over, [], 'rebalance with `node scripts/unit-shards.ts pack <n>`');
});

test('adding, renaming or removing a test file moves no other file to another shard', () => {
	const before = shardOf(shards(list, files, total));
	const changes: (readonly string[])[] = [
		[...files, 'test/aaa-first.test.ts'],
		[...files, 'test/zzz-last.test.ts'],
		[...files, 'test/m-middle.test.ts', 'test/b-another.test.ts'],
		[...files.slice(1), 'test/renamed.test.ts'],
		files.filter((_, i) => i % 7 !== 3),
	];
	for (const changed of changes) {
		const after = shardOf(shards(list, changed, total));
		assert.deepEqual(files.filter((f) => after.has(f) && after.get(f) !== before.get(f)), []);
	}
});

test('a file the list lacks runs in the shard with the least modelled time, and a shard runs its longest files first', () => {
	const small: ShardList = { budgetSeconds: 100, files: { 'test/a.test.ts': { shard: 1, seconds: 50 }, 'test/b.test.ts': { shard: 2, seconds: 5 }, 'test/c.test.ts': { shard: 2, seconds: 20 } } };
	assert.deepEqual(shards(small, ['test/a.test.ts', 'test/b.test.ts', 'test/c.test.ts', 'test/new.test.ts'], 2), [['test/a.test.ts'], ['test/c.test.ts', 'test/b.test.ts', 'test/new.test.ts']]);
});

test('a shard is modelled as its files run longest first, each starting when one of three lanes frees', () => {
	assert.equal(modelled([1, 2, 2, 3]), 3);
	assert.equal(modelled([10, 1, 1, 1, 1, 1, 1]), 10);
	assert.equal(modelled([4, 4, 4, 4]), 8);
});

test('a fresh deal spreads the work: no shard carries more than the mean plus the longest file', () => {
	const seconds = Object.fromEntries(Object.entries(list.files).map(([f, e]) => [f, e.seconds]));
	const loads = new Array<number>(total).fill(0);
	for (const e of Object.values(pack(seconds, total))) loads[e.shard - 1]! += e.seconds;
	const mean = loads.reduce((a, b) => a + b, 0) / total;
	assert.ok(Math.max(...loads) <= mean + Math.max(...Object.values(seconds)), String(loads));
});
