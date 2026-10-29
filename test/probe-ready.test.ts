import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { test } from 'node:test';
import { setTimeout as sleep } from 'node:timers/promises';
import { trackRequests } from '../scripts/probe/ready.ts';

test('the network is at rest once no request has been in flight for the window', async () => {
	const page = new EventEmitter();
	const net = trackRequests(page);
	const t0 = Date.now();
	assert.equal(await net.quiet(60, 2000), true);
	const took = Date.now() - t0;
	assert.ok(took >= 55 && took < 400, `took ${took} ms`);
});

test('a request in flight holds the window open until it finishes, and one started inside the window starts it again', async () => {
	const page = new EventEmitter();
	const net = trackRequests(page);
	const a = {}, b = {};
	page.emit('request', a);
	const t0 = Date.now();
	const done = net.quiet(80, 3000);
	await sleep(150);
	page.emit('requestfinished', a);
	await sleep(40);
	page.emit('request', b);
	await sleep(100);
	page.emit('requestfailed', b);
	assert.equal(await done, true);
	const took = Date.now() - t0;
	assert.ok(took >= 150 + 40 + 100 + 75, `took ${took} ms`);
	assert.equal(net.inflight(), 0);
});

test('a request that never finishes leaves the wait at its cap, as networkidle did', async () => {
	const page = new EventEmitter();
	const net = trackRequests(page);
	page.emit('request', {});
	const t0 = Date.now();
	assert.equal(await net.quiet(50, 200), false);
	assert.ok(Date.now() - t0 < 600);
	net.dispose();
	assert.equal(page.listenerCount('request'), 0);
});
