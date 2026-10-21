import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmod, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { copiedLogin, DRIVERS, driver } from '../src/run/drivers.ts';
import { buildPrompt, runRoutes, summarizeRun, type RunOptions } from '../src/run/loop.ts';
import { startAppServer } from '../src/run/server.ts';
import { symlink } from 'node:fs/promises';
import { createServer } from 'node:net';

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
	assert.match(prompt, /Never ask a question or wait for an\n  answer: nobody is there to reply/);
	assert.match(prompt, /Never ask them anything and never wait for an answer or an approval during the migration/);

	const log = await readFile(join(cwd, '.migrate', 'run.log'), 'utf8');
	assert.match(log, /run --agent codex, 1 route\(s\), up to 3 attempt\(s\) each/);
	assert.match(log, /-- \/about\/ attempt 1: codex exit 0 after [\d.]+s\n {3}\| fake agent call 1/);
	assert.match(log, /-- \/about\/ attempt 1: check red\n {3}> FAIL/);
	assert.match(log, /-- \/about\/ attempt 2: check green/);
	assert.match(log, /== done: \/about\/ green\n$/);
	assert.ok(lines.some((l) => /^green +\/about\/ after 2 attempt/.test(l)));
});

test('a route still red after the last attempt is left red and the run goes on with the next route; a failing agent exit still counts as an attempt', async () => {
	const { cwd, options, calls, checks } = await sandbox(99, { FAKE_EXIT: '1' });
	const outcomes = await runRoutes({ ...options, routes: ['/about/', '/next/'], attempts: 2 });
	assert.deepEqual(outcomes.map((o) => [o.route, o.outcome, o.attempts]), [['/about/', 'left red', 2], ['/next/', 'left red', 2]]);
	assert.deepEqual(checks, ['/about/', '/about/', '/about/', '/next/', '/next/', '/next/']);
	assert.equal(await calls(), 4);
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
	assert.equal(outcomes[0]!.outcome, 'left red');
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

test('the prompt names the old source, the new source and the roles, and the check command carries the same flags as run', () => {
	const prompt = buildPrompt({ old: 'http://old.test', new: 'http://new.test', cli: 'markless-migrate', context: { source: '/src/old app', newSource: '/src/new', auth: '/x/auth.json', flags: ['--header', 'x-pass: 1'] } }, '/members/', 'FAIL', 1);
	assert.match(prompt, /Old app's source, to read \(never edit it\): \/src\/old app/);
	assert.match(prompt, /New app: http:\/\/new\.test \(source: \/src\/new\)/);
	assert.match(prompt, /Roles: \/x\/auth\.json; the route is checked anonymous and as each role/);
	assert.ok(prompt.includes("markless-migrate check --old http://old.test --new http://new.test --route /members/ --source '/src/old app' --new-source /src/new --auth /x/auth.json --header 'x-pass: 1'"), prompt);
	assert.match(prompt, /check_route` tool \(old: http:\/\/old\.test, new: http:\/\/new\.test, route: \/members\/, source: \/src\/old app, new_source: \/src\/new, auth: \/x\/auth\.json\)/);
});

function port(): Promise<number> {
	return new Promise((done) => {
		const s = createServer();
		s.listen(0, '127.0.0.1', () => {
			const p = (s.address() as { port: number }).port;
			s.close(() => done(p));
		});
	});
}

const SERVE = `import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
const build = readFileSync('build.txt', 'utf8');
createServer((req, res) => res.end(build + ' pid ' + process.pid)).listen(Number(process.env.APP_PORT), '127.0.0.1');
`;
const BUILD = `node -e "const fs = require('fs'); const n = Number(fs.existsSync('build.txt') ? fs.readFileSync('build.txt', 'utf8').split(' ')[1] : 0) + 1; if (fs.existsSync('broken')) process.exit(3); fs.writeFileSync('build.txt', 'build ' + n)"`;

test('run owns the new app server: it builds and restarts it after each attempt, so the check sees the agent\'s change, and a failed build is the next prompt', async () => {
	const { cwd, options } = await sandbox(99);
	const appPort = await port();
	const origin = `http://127.0.0.1:${appPort}`;
	await writeFile(join(cwd, 'serve.mjs'), SERVE);
	const served: string[] = [];
	const server = await startAppServer({ cwd, serve: 'node serve.mjs', build: BUILD, origin, env: { ...process.env, APP_PORT: String(appPort) } });
	try {
		await writeFile(join(cwd, 'bin', 'codex'), `#!/bin/sh\nn=$(cat calls 2>/dev/null || echo 0); n=$((n + 1)); echo $n > calls\nfor last; do :; done\nprintf '%s' "$last" > prompt.$n\nif [ "$n" = 1 ]; then touch broken; else rm -f broken; fi\n`);
		const outcomes = await runRoutes({
			...options,
			new: origin,
			attempts: 2,
			server,
			serving: { build: 'npm run build' },
			check: async () => {
				const body = await (await fetch(origin)).text();
				served.push(body.split(' pid ')[0]!);
				return { ok: body.startsWith('build 2'), summary: `served ${body}` };
			},
		});
		assert.deepEqual(outcomes.map((o) => [o.outcome, o.attempts]), [['green', 2]]);
		assert.deepEqual(served, ['build 1', 'build 2'], 'the first attempt broke the build, so it was not checked; the second built and restarted');
		const first = await readFile(join(cwd, 'prompt.1'), 'utf8');
		assert.match(first, /markless-migrate runs the new app's server at http:\/\/127\.0\.0\.1:\d+: do not start, stop or restart a server yourself\. After you finish it runs `npm run build`/);
		assert.match(await readFile(join(cwd, 'prompt.2'), 'utf8'), /could not be served after your changes[\s\S]*failed \(exit 3\)/);
	} finally {
		await server.stop();
	}
	await assert.rejects(fetch(origin), 'the server is stopped with run');
});

test('an app that does not build when run starts is the first prompt, not a stop: the agent gets the build error and run serves its fix', async () => {
	const { cwd, options } = await sandbox(99);
	const appPort = await port();
	const origin = `http://127.0.0.1:${appPort}`;
	await writeFile(join(cwd, 'serve.mjs'), SERVE);
	await writeFile(join(cwd, 'broken'), '');
	const server = await startAppServer({ cwd, serve: 'node serve.mjs', build: BUILD, origin, env: { ...process.env, APP_PORT: String(appPort) } });
	try {
		assert.equal(server.first.ok, false);
		await writeFile(join(cwd, 'bin', 'codex'), `#!/bin/sh\nn=$(cat calls 2>/dev/null || echo 0); n=$((n + 1)); echo $n > calls\nfor last; do :; done\nprintf '%s' "$last" > prompt.$n\nrm -f broken\n`);
		const checked: string[] = [];
		const outcomes = await runRoutes({
			...options,
			new: origin,
			server,
			serving: { build: 'npm run build' },
			check: async (route) => {
				checked.push(route);
				const body = await (await fetch(origin)).text();
				return { ok: body.startsWith('build 1'), summary: `served ${body}` };
			},
		});
		assert.deepEqual(outcomes.map((o) => [o.outcome, o.attempts]), [['green', 1]]);
		assert.deepEqual(checked, ['/about/'], 'nothing is checked before the app builds');
		assert.match(await readFile(join(cwd, 'prompt.1'), 'utf8'), /The new app does not build, so nothing was checked\.\nbuild `[^`]+` failed \(exit 3\)/);
	} finally {
		await server.stop();
	}
});

test('with --restart-on the server restarts when the agent\'s own build touches that file', async () => {
	const cwd = await mkdtemp(join(tmpdir(), 'mm-serve-'));
	const appPort = await port();
	const origin = `http://127.0.0.1:${appPort}`;
	await writeFile(join(cwd, 'serve.mjs'), SERVE);
	await writeFile(join(cwd, 'build.txt'), 'build 1');
	const server = await startAppServer({ cwd, serve: 'node serve.mjs', origin, restartOn: 'build.txt', env: { ...process.env, APP_PORT: String(appPort) } });
	try {
		const before = await (await fetch(origin)).text();
		await new Promise((r) => setTimeout(r, 50));
		await writeFile(join(cwd, 'build.txt'), 'build 2');
		let after = before;
		for (let i = 0; i < 40 && !after.startsWith('build 2'); i++) {
			await new Promise((r) => setTimeout(r, 100));
			after = await fetch(origin).then((r) => r.text(), () => after);
		}
		assert.match(after, /^build 2 pid \d+$/);
		assert.notEqual(after.split(' pid ')[1], before.split(' pid ')[1], 'a new server process');
	} finally {
		await server.stop();
	}
});

test('codex and claude get the MCP server on the command line, so their own config is never copied or edited', () => {
	const server = { command: '/bin/node', args: ['/x/cli.ts', 'mcp'] };
	const codex = driver('codex').args('P', undefined, server);
	assert.deepEqual(codex.slice(4, 8), ['-c', 'mcp_servers.markless-migrate.command="/bin/node"', '-c', 'mcp_servers.markless-migrate.args=["/x/cli.ts","mcp"]']);
	const claude = driver('claude').args('P', undefined, server);
	assert.deepEqual(JSON.parse(claude[claude.indexOf('--mcp-config') + 1]!), { mcpServers: { 'markless-migrate': { type: 'stdio', command: '/bin/node', args: ['/x/cli.ts', 'mcp'], env: {} } } });
});

test('a CODEX_HOME holding a copy of the real auth.json is refused; the real home, a symlink, or a home signed in on its own is not', async () => {
	const home = await mkdtemp(join(tmpdir(), 'mm-home-'));
	await mkdir(join(home, '.codex'));
	await writeFile(join(home, '.codex', 'auth.json'), '{}');
	const other = join(home, 'tmp-codex');
	await mkdir(other);
	assert.equal(await copiedLogin('codex', { CODEX_HOME: other }, home), undefined, 'no auth.json there: it signs in on its own');
	await writeFile(join(other, 'auth.json'), '{}');
	assert.match((await copiedLogin('codex', { CODEX_HOME: other }, home))!, /refresh tokens work once/);
	assert.equal(await copiedLogin('claude', { CODEX_HOME: other }, home), undefined);
	assert.equal(await copiedLogin('codex', { CODEX_HOME: join(home, '.codex') }, home), undefined);
	const linked = join(home, 'linked');
	await mkdir(linked);
	await symlink(join(home, '.codex', 'auth.json'), join(linked, 'auth.json'));
	assert.equal(await copiedLogin('codex', { CODEX_HOME: linked }, home), undefined);
});

test('the run ends with one report: green routes, library decisions, automatic acceptances, and what to look at, with no question in it', () => {
	const text = summarizeRun(
		[
			{ route: '/', outcome: 'green', attempts: 1, summary: '' },
			{ route: '/settings', outcome: 'left red', attempts: 3, summary: '', open: ['visual: screenshot (desktop) [abc1234567]', 'css: color of button "Save" [def1234567]'] },
		],
		{ libraries: ['chart.js: uses chart.js directly, loaded only when its element is needed, because it draws into a canvas'], automatic: ['/ assets: script /react.js, accepted automatically: x (y)'], needsSample: ['/blog/:slug'], log: '/tmp/run.log' },
	);
	assert.match(text, /^1 of 2 routes green\./);
	assert.match(text, /Libraries, decided by plan:\n  chart\.js: uses chart\.js directly/);
	assert.match(text, /nothing needs changing/);
	assert.match(text, /Accepted automatically, with the evidence:\n  \/ assets: script \/react\.js/);
	assert.match(text, /What to look at if you care \(nothing here stops the migration\):\n  \/settings is still red after 3 attempt\(s\) and stays on the old app: visual: screenshot \(desktop\) \[abc1234567\]; css: color/);
	assert.match(text, /\/blog\/:slug/);
	assert.doesNotMatch(text, /\?|needs a human|ask/i);
	assert.doesNotMatch(summarizeRun([{ route: '/', outcome: 'green', attempts: 0, summary: '' }], { log: 'l' }), /What to look at/);
});

test('the prompt carries what the route uses in the browser and forbids another framework\'s runtime; the report carries the usage coverage', () => {
	const prompt = buildPrompt({ old: 'http://old.test', new: 'http://new.test', cli: 'markless-migrate' }, '/', 'FAIL', 1, 'What route / uses in the browser (from .migrate/usage.json).\n- [not implemented] hyperscript:on click:312b1413: click on svg.hamburger: toggle .show on #nav');
	assert.match(prompt, /Never load or copy another framework's runtime \(React, Vue, htmx, Alpine, _hyperscript, jQuery\.\.\.\) into the\n {2}new app/);
	assert.match(prompt, /Keep JavaScript-only libraries \(Chart\.js, Leaflet,\n {2}Monaco\.\.\.\) as they are/);
	assert.match(prompt, /guard page --old http:\/\/old\.test --new http:\/\/new\.test --route \/` and\n {2}`markless-migrate guard build`/);
	assert.match(prompt, /- \[not implemented\] hyperscript:on click:312b1413/);
	assert.match(prompt, /## Implement what the old site uses, in Markless/);
	const report = summarizeRun([{ route: '/', outcome: 'green', attempts: 1, summary: '' }], { log: 'run.log', usage: 'Browser behaviour the old site uses: 2 behaviours on 1 pages.\n  used 2 / implemented in Markless 1 (50%) / checked 1 (50%)\n', guards: ['Build guard: 3 script and HTML files in .output, none carries another framework\'s or library\'s runtime.'] });
	assert.match(report, /used 2 \/ implemented in Markless 1 \(50%\) \/ checked 1 \(50%\)/);
	assert.match(report, /Build guard: 3 script and HTML files/);
});
