import assert from 'node:assert/strict';
import test from 'node:test';
import { ahead, routeCount, share, SHARE, SLOTS, SUBSET } from '../scripts/full-site-gate.ts';

test('a run is full-site at 50 routes or more, or with no route list at all', () => {
	const files: Record<string, string> = { 'all.json': JSON.stringify({ routes: Array(534).fill('/'), endpoints: [] }), 'few.json': JSON.stringify({ routes: Array(25).fill('/') }), 'few.txt': '/a\n\n# note\n/b\n' };
	const read = (p: string) => files[p]!;
	assert.equal(SUBSET, 50);
	assert.equal(routeCount('', read), Infinity);
	assert.equal(routeCount('all.json', read), 534);
	assert.equal(routeCount('few.json', read), 25);
	assert.equal(routeCount('few.txt', read), 2);
	assert.equal(routeCount('count:0', read), 0);
	assert.equal(routeCount('words: /a /b  /c ', read), 3);
});

test('admitted runs and older waiting runs are ahead; a newer waiting run and a run without the gate are not', () => {
	const me = { id: 5, created: '2026-10-31T05:00:00Z', step: 'waiting' as const };
	const runs = [
		me,
		{ id: 9, created: '2026-10-31T06:00:00Z', step: 'admitted' as const },
		{ id: 3, created: '2026-10-31T04:00:00Z', step: 'waiting' as const },
		{ id: 7, created: '2026-10-31T05:30:00Z', step: 'waiting' as const },
		{ id: 2, created: '2026-10-31T03:00:00Z', step: 'none' as const },
	];
	assert.equal(SLOTS, 2);
	assert.equal(ahead(me, runs), 2);
	assert.equal(ahead({ id: 3, created: '2026-10-31T04:00:00Z', step: 'waiting' }, runs), 1);
	assert.equal(ahead(me, runs.filter((r) => r.id !== 9)), 1);
});

test('a full-site run takes what is left of the 40-runner share, up to what it wants, and waits below min(want, 4)', () => {
	assert.equal(SHARE, 40);
	assert.equal(share(24, 10, []), 24);
	assert.equal(share(24, 10, [{ reserved: 10, running: 3 }]), 20);
	assert.equal(share(10, 20, [{ reserved: 4, running: 12 }]), 8);
	assert.equal(share(24, 37, []), 0);
	assert.equal(share(2, 38, []), 2);
	assert.equal(share(10, 41, []), 0);
});
