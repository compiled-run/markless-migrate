import { execFileSync } from 'node:child_process';
import { test } from 'node:test';
import assert from 'node:assert/strict';

test('prints usage with no command', () => {
	const out = execFileSync(process.execPath, [new URL('../src/cli.ts', import.meta.url).pathname], { encoding: 'utf8' });
	assert.match(out, /markless-migrate <plan\|check\|switch>/);
});
