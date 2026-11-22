// A kept check result is keyed by the options it was checked with that change what is checked; check-select keys a
// shard's command line from the same flags, so both sides agree.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { shardCheckLine } from '../src/check/ci-settings.ts';
import { BY_PRESENCE, CHECK_OPTIONS, checkOptionsKey, NOT_CHECKED, SECRET_OPTIONS } from '../src/check/check-options.ts';

// check.yml's shard and pipeline.yml's check-select both take their options from ci-flags.ts shard (shardCheckLine).
const shard = (extra: readonly string[] = []) => ['--old', 'http://localhost:4000', '--new', 'http://127.0.0.1:3000', '--targets', '/tmp/a/shard-3.json', ...shardCheckLine('/w/deploy/t.json', '/tmp/a/survey/layout-survey.json', '', ''), '--reuse', '.migrate/reuse', '--closures', '/tmp/c.json', ...extra];
const select = (extra: readonly string[] = []) => [...shardCheckLine('/home/runner/w/deploy/t.json', '/tmp/r/survey/layout-survey.json'), ...extra];

test("a shard's command line and check-select's give one key: origins, targets, paths and reuse folders are no part of it", () => {
	assert.equal(checkOptionsKey(shard()), checkOptionsKey(select()));
	assert.equal(checkOptionsKey(shard(['--no-motion'])), checkOptionsKey(select(['--no-motion'])));
});

test('each option that changes what is checked moves the key: a phase left out, a timing, a budget, the timeout, a block list, the time', () => {
	const base = checkOptionsKey(select());
	for (const extra of [['--no-probes'], ['--no-behaviours'], ['--no-media'], ['--no-touch'], ['--no-embeds'], ['--no-nav-timing'], ['--journey-budget', '30'], ['--timeout', '7200'], ['--block', 'ads.example'], ['--allow', 'cdn.example'], ['--no-freeze'], ['--time', '2026-01-15T12:00:00Z'], ['--every-dimension']]) {
		assert.notEqual(checkOptionsKey(select(extra)), base, extra.join(' '));
	}
	assert.notEqual(checkOptionsKey(select().filter((a) => a !== '--site-targets' && a !== '/home/runner/w/deploy/t.json')), base, 'grouping over the whole site or not');
	assert.notEqual(checkOptionsKey(select(['--psi-key', 'one'])), checkOptionsKey(select(['--psi-key', 'two'])), 'a secret counts by its value');
	assert.ok(!checkOptionsKey(select(['--psi-key', 'secret'])).includes('secret'));
});

test("every option the key leaves out or takes by presence is one of check's, each with its reason", () => {
	for (const name of [...Object.keys(NOT_CHECKED), ...Object.keys(BY_PRESENCE), ...SECRET_OPTIONS]) assert.ok(name in CHECK_OPTIONS, name);
	assert.throws(() => checkOptionsKey(['--no-such-flag']), /Unknown option/);
});
