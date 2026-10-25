import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnNode } from './spawn-node.ts';

const CLI = new URL('../src/cli.ts', import.meta.url).pathname;
const run = (...args: string[]) => spawnNode([CLI, ...args], { timeoutMs: 60_000 });

test('prints usage with every command', async () => {
	const result = await run();
	assert.equal(result.status, 0);
	for (const command of ['plan', 'check', 'status', 'setup', 'mcp', 'run', 'switch', 'unswitch', 'proxy', 'config']) assert.match(result.stdout, new RegExp(`^  ${command} `, 'm'));
	assert.match(result.stdout, /run +--agent <id>/);
});

test('switch without a route is a usage error', async () => {
	assert.equal((await run('switch')).status, 2);
});

test('check without origins is a usage error', async () => {
	const result = await run('check');
	assert.equal(result.status, 2);
	assert.match(result.stderr, /--old <origin> and --new <origin>/);
});

test('network needs page URLs, a known profile and browser, and one --control for all pages or one each', async () => {
	assert.match((await run('network')).stderr, /network needs the URLs of the pages to load/);
	const profile = await run('network', 'https://a.example/', '--profile', 'edge');
	assert.equal(profile.status, 2);
	assert.match(profile.stderr, /unknown --profile edge: one of regular-2g, regular-3g, slow-4g/);
	assert.match((await run('network', 'https://a.example/', '--browser', 'opera')).stderr, /unknown --browser opera: one of chromium, firefox, webkit/);
	assert.match((await run('network', 'https://a.example/', 'https://b.example/', 'https://c.example/', '--control', 'x', '--control', 'y')).stderr, /one selector for all pages, or one per page/);
	assert.match((await run()).stdout, /^  network <url>\.\.\. /m);
});

test('an unknown command is a usage error', async () => {
	assert.equal((await run('frobnicate')).status, 2);
});

test('recorder prints the NODE_OPTIONS that loads the request recorder', async () => {
	const result = await run('recorder');
	assert.equal(result.status, 0);
	const line = /export NODE_OPTIONS=(.*)/.exec(result.stdout)![1]!;
	assert.match(line, /^'--require=".*\/src\/check\/record-server\.cjs"'$/, 'single-quoted, so the quoted path inside stays one shell word');
});

test('check rejects an unknown --data mode and a bad --time', async () => {
	assert.match((await run('check', '--old', 'http://127.0.0.1:1', '--new', 'http://127.0.0.1:2', '--data', 'mirror')).stderr, /--data must be record or replay/);
	assert.match((await run('check', '--old', 'http://127.0.0.1:1', '--new', 'http://127.0.0.1:2', '--time', 'soon')).stderr, /--time must be a date/);
});

test('check rejects a bad interaction budget, CPU slowdown or control limit', async () => {
	const check = (...args: string[]) => run('check', '--old', 'http://127.0.0.1:1', '--new', 'http://127.0.0.1:2', ...args);
	assert.match((await check('--interaction-budget', '0')).stderr, /--interaction-budget must be a number of milliseconds above 0/);
	assert.match((await check('--cpu-throttle', '0.5')).stderr, /--cpu-throttle must be a slowdown rate of at least 1/);
	assert.match((await check('--interaction-controls', '2.5')).stderr, /--interaction-controls must be a whole number of at least 1/);
});

test('check --all with a route nothing gives a sample is not "all green": it counts the route unchecked and exits 1 unless --allow-unchecked', async () => {
	const { createServer } = await import('node:http');
	const { mkdtemp, mkdir, writeFile } = await import('node:fs/promises');
	const { tmpdir } = await import('node:os');
	const { join } = await import('node:path');
	const servers = await Promise.all([0, 1].map(() => new Promise<import('node:http').Server>((done) => {
		const server = createServer((req, res) => (req.url === '/robots.txt' ? res.writeHead(200, { 'content-type': 'text/plain' }).end('User-agent: *\nAllow: /\n') : res.writeHead(404, { 'content-type': 'text/plain' }).end('no')));
		server.listen(0, '127.0.0.1', () => done(server));
	})));
	const [old, next] = servers.map((s) => `http://127.0.0.1:${(s.address() as { port: number }).port}`);
	const cwd = await mkdtemp(join(tmpdir(), 'mm-unchecked-'));
	await mkdir(join(cwd, '.migrate'));
	await writeFile(join(cwd, '.migrate', 'inventory.json'), JSON.stringify({ routes: [], routeUnion: [{ route: '/news/:slug', knownBy: ['source'], crawled: [], dynamic: true, kind: 'page', file: 'app/news/[slug]/page.tsx', line: 4 }] }));
	// On CI each run takes at most 4 s; a route stalled past 60 s ends the check with what it waited on, and the process is killed at 120 s.
	const check = (...extra: string[]) => spawnNode([CLI, 'check', '--old', old!, '--new', next!, '--all', '--no-load', '--timeout', '60', ...extra], { cwd, timeoutMs: 120_000 });
	try {
		const strict = await check();
		assert.equal(strict.status, 1, strict.stdout + strict.stderr);
		assert.match(strict.stdout, /2 of 2 routes green; 1 route not checked \(needs a sample\)\./);
		assert.match(strict.stdout, /\/news\/:slug +no value for :slug +app\/news\/\[slug\]\/page\.tsx:4/);
		assert.match(strict.stderr, /1 route not checked for want of a sample value/);
		assert.equal((await check('--allow-unchecked')).status, 0);
	} finally {
		for (const s of servers) s.close();
	}
});

test("a package manager the tool starts is not watched: its registry traffic is not the tool's", async () => {
	const { mkdtemp, mkdir, writeFile, readFile } = await import('node:fs/promises');
	const { execFileSync } = await import('node:child_process');
	const { tmpdir } = await import('node:os');
	const { join } = await import('node:path');
	const dir = await mkdtemp(join(tmpdir(), 'mm-cli-pm-'));
	await mkdir(join(dir, 'node_modules', 'npm', 'bin'), { recursive: true });
	const script = 'try { await fetch("http://127.0.0.1:9/x") } catch {}';
	await writeFile(join(dir, 'node_modules', 'npm', 'bin', 'npm-cli.mjs'), script);
	await writeFile(join(dir, 'tool.mjs'), script);
	const log = join(dir, 'log.jsonl');
	const shim = new URL('../src/check/cli/network.mjs', import.meta.url).pathname;
	for (const file of ['node_modules/npm/bin/npm-cli.mjs', 'tool.mjs']) execFileSync(process.execPath, ['--import', shim, join(dir, file)], { env: { ...process.env, MARKLESS_MIGRATE_CLI_LOG: log, MARKLESS_MIGRATE_CLI_NETWORK: 'live' }, timeout: 60_000, killSignal: 'SIGKILL' });
	const lines = (await readFile(log, 'utf8')).trim().split('\n');
	assert.equal(lines.length, 1, 'only the tool itself is logged');
});

test('a command a test starts that does not exit in time is killed, and the test fails naming it, what kept it running and its last output', async () => {
	await assert.rejects(spawnNode(['-e', 'console.log("waiting on the server"); setInterval(() => {}, 1000)'], { timeoutMs: 1_000 }), /^Error: node -e .* did not exit within 1 s and was killed; JavaScript at: .*; what keeps it running: [^;]*timer[^;]*; its last output:\nwaiting on the server$/);
});
