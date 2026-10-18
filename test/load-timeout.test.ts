import assert from 'node:assert/strict';
import { test } from 'node:test';
import { errors } from 'playwright';
import { loadTimeout } from '../src/check/run.ts';

test('a page load that times out is an infrastructure failure of its route, not a red app failure; other errors are not swallowed', () => {
	const error = new errors.TimeoutError('page.goto: Timeout 30000ms exceeded.\nCall log: navigating to "http://127.0.0.1:2/tag/web"');
	const result = loadTimeout('/tag/web', error, ['http://127.0.0.1:1', 'http://127.0.0.1:2']);
	assert.equal(result?.ok, false);
	assert.deepEqual(result?.failures, []);
	assert.equal(result?.dimensions.http, 'skipped');
	assert.deepEqual(result?.infrastructure, { cause: 'timeout', message: 'page.goto: Timeout 30000ms exceeded.' });
	assert.equal(loadTimeout('/tag/web', new Error('boom'), ['a', 'b']), undefined);
});
