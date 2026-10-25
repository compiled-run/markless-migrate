import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pageRoutes, split } from '../scripts/convert-shards.ts';

test('the shards hold the routes convert writes pages for: HTML answered 200, each once', () => {
	const routes = pageRoutes({
		routes: [{ route: '/', status: 200 }, { route: '/gone', status: 404 }, { route: '/feed', status: 200 }],
		allRoutes: [{ route: '/feed', status: 200, contentType: 'application/rss+xml' }, { route: '/docs', status: 200, contentType: 'text/html; charset=utf-8' }, { route: '/later' }],
	});
	assert.deepEqual(routes, ['/', '/docs']);
});

test('routes are dealt across shards in turn, with nothing lost or repeated, and no empty shard', () => {
	const routes = Array.from({ length: 10 }, (_, i) => `/r${i}`);
	const shards = split(routes, 3);
	assert.deepEqual(shards.map((s) => s.length), [4, 3, 3]);
	assert.deepEqual(shards.flat().sort(), [...routes].sort());
	assert.deepEqual(shards[1], ['/r1', '/r4', '/r7']);
	assert.equal(split(['/a', '/b'], 5).length, 2);
});
