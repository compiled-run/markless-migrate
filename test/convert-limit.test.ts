// The slots convert's captures share: never more tasks at once than the limit, the waiting ones started in the order given.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { eachLimited, limiter } from '../src/convert/limit.ts';

test('a limit runs at most its size of tasks at once and starts the waiting ones in the order they came', async () => {
	const limit = limiter(3);
	let running = 0;
	let peak = 0;
	const started: number[] = [];
	const results = await eachLimited(limit, Array.from({ length: 12 }, (_, i) => i), async (i) => {
		started.push(i);
		running++;
		peak = Math.max(peak, running);
		await new Promise((done) => setTimeout(done, 5 + ((i * 7) % 11)));
		running--;
		return i * 2;
	});
	assert.equal(peak, 3);
	assert.deepEqual(started, Array.from({ length: 12 }, (_, i) => i));
	assert.deepEqual(results, Array.from({ length: 12 }, (_, i) => i * 2));
});

test('a slot a task frees goes to the next waiting task, not to one that arrives meanwhile', async () => {
	const limit = limiter(1);
	const order: string[] = [];
	let release!: () => void;
	const first = limit(() => new Promise<void>((done) => (release = () => (order.push('first'), done()))));
	const second = limit(async () => void order.push('second'));
	await Promise.resolve();
	release();
	const third = limit(async () => void order.push('third'));
	await Promise.all([first, second, third]);
	assert.deepEqual(order, ['first', 'second', 'third']);
});

test('a task that throws frees its slot', async () => {
	const limit = limiter(1);
	await assert.rejects(limit(async () => { throw new Error('no'); }), /no/);
	assert.equal(await limit(async () => 1), 1);
});
