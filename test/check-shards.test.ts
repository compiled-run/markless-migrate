import assert from 'node:assert/strict';
import { test } from 'node:test';
import { split, summary, unreported } from '../scripts/check-shards.ts';

test('targets are dealt across shards in turn, with nothing lost or repeated', () => {
	const routes = Array.from({ length: 10 }, (_, i) => `/r${i}`);
	const shards = split({ routes, endpoints: ['/robots.txt'], redirects: ['/a/', '/b/'] }, 3);
	assert.deepEqual(shards.map((s) => s.routes.length), [4, 3, 3]);
	assert.deepEqual(shards.flatMap((s) => s.routes).sort(), [...routes].sort());
	assert.deepEqual(shards.flatMap((s) => s.redirects), ['/a/', '/b/']);
	assert.deepEqual(shards.flatMap((s) => s.endpoints), ['/robots.txt']);
});

test('the merged summary counts each state and lists the leading causes of the red routes', () => {
	const text = summary([
		{ route: '/b', ok: false, failures: [{ dimension: 'css', check: 'computed style of link "Home"' }, { dimension: 'css', check: 'computed style of link "Docs"' }] },
		{ route: '/a', ok: true, failures: [] },
		{ route: '/c', ok: false, infrastructure: { message: 'timeout' } },
		{ route: '/d', ok: false, failures: [{ dimension: 'visual', check: 'screenshot', accepted: { reason: 'x' } }] },
	]);
	assert.match(text, /^1 green, 2 red, 1 not checked, of 4/);
	assert.match(text, /\| 1 \| css: computed style of link "…" \|/);
	assert.match(text, /\| `\/a` \| green \|/);
	assert.ok(text.indexOf('`/a`') < text.indexOf('`/b`'));
});

test('a shard that wrote no report has each of its targets listed as not checked, so the merge never counts it green or drops it', () => {
	const shards = new Map(split({ routes: ['/a', '/b', '/c'], endpoints: ['/robots.txt'], redirects: ['/a/'] }, 2).map((s, i) => [i + 1, s] as const));
	const missing = unreported(shards, new Set([2]));
	assert.deepEqual(missing.map((r) => r.route), ['/a', '/c', '/robots.txt', '/a/']);
	assert.ok(missing.every((r) => !r.ok && /^shard 1 wrote no report/.test(r.infrastructure?.message ?? '')));
	assert.match(summary(missing), /^4 not checked, of 4/);
	assert.deepEqual(unreported(shards, new Set([1, 2])), []);
});
