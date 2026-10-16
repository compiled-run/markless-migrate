import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

const CLI = new URL('../src/cli.ts', import.meta.url).pathname;
const run = (...args: string[]) => spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8' });

test('prints usage with every command', () => {
	const result = run();
	assert.equal(result.status, 0);
	for (const command of ['plan', 'check', 'status', 'setup', 'mcp', 'run', 'switch', 'unswitch', 'proxy', 'config']) assert.match(result.stdout, new RegExp(`^  ${command} `, 'm'));
	assert.match(result.stdout, /run +--agent <id>/);
});

test('switch without a route is a usage error', () => {
	assert.equal(run('switch').status, 2);
});

test('check without origins is a usage error', () => {
	const result = run('check');
	assert.equal(result.status, 2);
	assert.match(result.stderr, /--old <origin> and --new <origin>/);
});

test('an unknown command is a usage error', () => {
	assert.equal(run('frobnicate').status, 2);
});

test('recorder prints the NODE_OPTIONS that loads the request recorder', () => {
	const result = run('recorder');
	assert.equal(result.status, 0);
	assert.match(result.stdout, /NODE_OPTIONS=".*--import=file:\/\/.*\/src\/check\/record-server\.mjs"/);
});

test('check rejects an unknown --data mode and a bad --time', () => {
	assert.match(run('check', '--old', 'http://127.0.0.1:1', '--new', 'http://127.0.0.1:2', '--data', 'mirror').stderr, /--data must be record or replay/);
	assert.match(run('check', '--old', 'http://127.0.0.1:1', '--new', 'http://127.0.0.1:2', '--time', 'soon').stderr, /--time must be a date/);
});
