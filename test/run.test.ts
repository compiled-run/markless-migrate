import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmod, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { DRIVERS, driver } from '../src/run/drivers.ts';
import { runRoutes, type RunOptions } from '../src/run/loop.ts';

const CLI = new URL('../src/cli.ts', import.meta.url).pathname;

// The fake agent records each prompt and marks the route fixed once it has been called FIX_AFTER times.
const FAKE = `#!/bin/sh
n=$(cat calls 2>/dev/null || echo 0); n=$((n + 1)); echo $n > calls
for last; do :; done
printf '%s' "$last" > prompt.$n
echo "fake agent call $n"
if [ "$n" -ge "\${FIX_AFTER:-99}" ]; then touch fixed; fi
exit \${FAKE_EXIT:-0}
`;

async function sandbox(fixAfter: number, extraEnv: Record<string, string> = {}) {
	const cwd = await mkdtemp(join(tmpdir(), 'mm-run-'));
	const bin = join(cwd, 'bin');
	await mkdir(bin);
	await writeFile(join(bin, 'codex'), FAKE);
	await chmod(join(bin, 'codex'), 0o755);
	const checks: string[] = [];
	const options: RunOptions = {
		cwd,
		driver: driver('codex'),
		old: 'http://old.test',
		new: 'http://new.test',
		routes: ['/about/'],
		attempts: 3,
		cli: 'markless-migrate',
		env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, FIX_AFTER: String(fixAfter), ...extraEnv },
		check: async (route) => {
			checks.push(route);
			const fixed = await readFile(join(cwd, 'fixed')).then(() => true, () => false);
			return { ok: fixed, summary: fixed ? '1 of 1 routes green.\n' : `FAIL  ${route}  [rendered]\n  expected: About the guides\n  actual:   Meet the guides\n` };
		},
	};
	const calls = () => readFile(join(cwd, 'calls'), 'utf8').then((s) => Number(s.trim()), () => 0);
	return { cwd, options, checks, calls };
}

test('a route the agent fixes on its second attempt ends green after two agent runs and three checks', async () => {
	const { cwd, options, checks, calls } = await sandbox(2);
	const lines: string[] = [];
	const outcomes = await runRoutes({ ...options, progress: (l) => lines.push(l) });
	assert.deepEqual(outcomes.map((o) => [o.route, o.outcome, o.attempts]), [['/about/', 'green', 2]]);
	assert.equal(await calls(), 2);
	assert.equal(checks.length, 3);

	const prompt = await readFile(join(cwd, 'prompt.1'), 'utf8');
	assert.match(prompt, /^# Migrating an app to Markless/);
	assert.match(prompt, /Make route \/about\/ of the new app match the old app/);
	assert.match(prompt, /check_route` tool \(old: http:\/\/old\.test, new: http:\/\/new\.test, route: \/about\/\)/);
	assert.match(prompt, /actual: {3}Meet the guides/);
	assert.match(await readFile(join(cwd, 'prompt.2'), 'utf8'), /This is attempt 2\./);

	const log = await readFile(join(cwd, '.migrate', 'run.log'), 'utf8');
	assert.match(log, /run --agent codex, 1 route\(s\), up to 3 attempt\(s\) each/);
	assert.match(log, /-- \/about\/ attempt 1: codex exit 0 after [\d.]+s\n {3}\| fake agent call 1/);
	assert.match(log, /-- \/about\/ attempt 1: check red\n {3}> FAIL/);
	assert.match(log, /-- \/about\/ attempt 2: check green/);
	assert.match(log, /== done: \/about\/ green\n$/);
	assert.ok(lines.some((l) => /^green +\/about\/ after 2 attempt/.test(l)));
});

test('a route still red after the last attempt stops as "needs a human", and a failing agent exit still counts as an attempt', async () => {
	const { cwd, options, calls } = await sandbox(99, { FAKE_EXIT: '1' });
	const outcomes = await runRoutes({ ...options, attempts: 2 });
	assert.deepEqual(outcomes.map((o) => [o.outcome, o.attempts]), [['needs a human', 2]]);
	assert.equal(await calls(), 2);
	assert.match(await readFile(join(cwd, '.migrate', 'run.log'), 'utf8'), /attempt 2: codex exit 1/);
});

test('a route that is already green never starts the agent, and routes run one at a time in order', async () => {
	const { options, calls, checks } = await sandbox(1);
	const outcomes = await runRoutes({ ...options, routes: ['/a', '/b'] });
	assert.deepEqual(outcomes.map((o) => [o.route, o.outcome, o.attempts]), [['/a', 'green', 1], ['/b', 'already green', 0]]);
	assert.equal(await calls(), 1);
	assert.deepEqual(checks, ['/a', '/a', '/b']);
});

test('the log is appended to across runs', async () => {
	const { cwd, options } = await sandbox(1);
	await runRoutes(options);
	await runRoutes(options);
	const log = await readFile(join(cwd, '.migrate', 'run.log'), 'utf8');
	assert.equal(log.match(/^== .* run --agent codex/gm)?.length, 2);
});

test('an agent killed by the timeout counts as an attempt', async () => {
	const { cwd, options } = await sandbox(99);
	await writeFile(join(cwd, 'bin', 'codex'), '#!/bin/sh\nexec sleep 30\n');
	const outcomes = await runRoutes({ ...options, attempts: 1, timeoutMs: 200 });
	assert.equal(outcomes[0]!.outcome, 'needs a human');
	assert.match(await readFile(join(cwd, '.migrate', 'run.log'), 'utf8'), /codex killed by SIGTERM/);
});

test('each driver runs its CLI headless with tool approval for the markless-migrate server and passes --model through', () => {
	const args = Object.fromEntries(DRIVERS.map((d) => [d.id, [d.binary, ...d.args('PROMPT', 'M')]]));
	assert.deepEqual(args.codex, ['codex', 'exec', '--skip-git-repo-check', '--sandbox', 'workspace-write', '-c', 'mcp_servers.markless-migrate.default_tools_approval_mode="approve"', '--model', 'M', 'PROMPT']);
	assert.deepEqual(args.claude, ['claude', '-p', 'PROMPT', '--model', 'M', '--permission-mode', 'acceptEdits', '--allowedTools', 'mcp__markless-migrate,Bash,Read,Edit,Write,Glob,Grep']);
	assert.deepEqual(args.gemini, ['gemini', '--approval-mode', 'yolo', '--model', 'M', '-p', 'PROMPT']);
	assert.deepEqual(args.cursor!.slice(0, 2), ['cursor-agent', '-p']);
	assert.ok(args.cursor!.includes('--force') && args.cursor!.includes('--approve-mcps'));
	assert.deepEqual(args.copilot, ['copilot', '-p', 'PROMPT', '--allow-all-tools', '--model', 'M']);
	assert.deepEqual(args.opencode, ['opencode', 'run', '--model', 'M', 'PROMPT']);
	for (const d of DRIVERS) assert.equal(d.args('PROMPT').includes('--model'), false, d.id);
	assert.throws(() => driver('notepad'), /unknown agent "notepad"; run supports: codex, claude, gemini, cursor, copilot, opencode/);
});

test('run validates its arguments before starting anything', async () => {
	const cwd = await mkdtemp(join(tmpdir(), 'mm-run-cli-'));
	const cli = (...args: string[]) => spawnSync(process.execPath, [CLI, 'run', ...args], { encoding: 'utf8', cwd, env: { ...process.env, PATH: join(cwd, 'nothing') } });
	assert.match(cli().stderr, /run needs --agent <id>/);
	assert.match(cli('--agent', 'codex').stderr, /run needs --old <origin> and --new <origin>/);
	assert.match(cli('--agent', 'codex', '--old', 'http://a', '--new', 'http://b', '--attempts', '0').stderr, /--attempts must be/);
	assert.match(cli('--agent', 'notepad', '--old', 'http://a', '--new', 'http://b').stderr, /unknown agent "notepad"/);
	const missing = cli('--agent', 'codex', '--old', 'http://a', '--new', 'http://b', '--route', '/');
	assert.equal(missing.status, 2);
	assert.match(missing.stderr, /codex is not on PATH/);
});
