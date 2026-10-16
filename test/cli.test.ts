import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

const CLI = new URL('../src/cli.ts', import.meta.url).pathname;
const run = (...args: string[]) => spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8' });

test('prints usage with every command, marking switch as not yet', () => {
	const result = run();
	assert.equal(result.status, 0);
	for (const command of ['plan', 'check', 'status', 'setup', 'mcp', 'run']) assert.match(result.stdout, new RegExp(`^  ${command} `, 'm'));
	assert.match(result.stdout, /switch +Not yet/);
	assert.match(result.stdout, /run +--agent <id>/);
});

test('switch exits 1 and says it is not built yet', () => {
	const result = run('switch');
	assert.equal(result.status, 1);
	assert.match(result.stderr, /not yet/);
});

test('check without origins is a usage error', () => {
	const result = run('check');
	assert.equal(result.status, 2);
	assert.match(result.stderr, /--old <origin> and --new <origin>/);
});

test('an unknown command is a usage error', () => {
	assert.equal(run('frobnicate').status, 2);
});
