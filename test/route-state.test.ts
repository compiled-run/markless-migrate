import assert from 'node:assert/strict';
import { test } from 'node:test';
import { routeState } from '../src/check/route-state.ts';

test('a route differs on any open difference, is incomplete when it was not verified to the end, and passes only when all of it was compared and matched', () => {
	assert.equal(routeState({ ok: true, failures: [] }), 'pass');
	assert.equal(routeState({ ok: false, failures: [{ check: 'not exercised: button "Deploy Now"' }] }), 'incomplete');
	assert.equal(routeState({ ok: false, failures: [{ check: 'the check of this route' }] }), 'incomplete');
	assert.equal(routeState({ ok: false, infrastructure: { cause: 'incomplete' }, failures: [] }), 'incomplete');
	assert.equal(routeState({ ok: false, blocked: {}, failures: [] }), 'incomplete');
	assert.equal(routeState({ ok: false, failures: [{ check: 'not exercised: x' }, { check: 'click button "Open"' }] }), 'differs');
	assert.equal(routeState({ ok: true, failures: [{ check: 'click button "Open"', accepted: { reason: 'known' } }] }), 'pass');
});
