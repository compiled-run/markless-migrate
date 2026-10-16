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

test('check --all with a route nothing gives a sample is not "all green": it counts the route unchecked and exits 1 unless --allow-unchecked', async () => {
	const { createServer } = await import('node:http');
	const { mkdtemp, mkdir, writeFile } = await import('node:fs/promises');
	const { tmpdir } = await import('node:os');
	const { join } = await import('node:path');
	const { spawn } = await import('node:child_process');
	const servers = await Promise.all([0, 1].map(() => new Promise<import('node:http').Server>((done) => {
		const server = createServer((req, res) => (req.url === '/robots.txt' ? res.writeHead(200, { 'content-type': 'text/plain' }).end('User-agent: *\nAllow: /\n') : res.writeHead(404, { 'content-type': 'text/plain' }).end('no')));
		server.listen(0, '127.0.0.1', () => done(server));
	})));
	const [old, next] = servers.map((s) => `http://127.0.0.1:${(s.address() as { port: number }).port}`);
	const cwd = await mkdtemp(join(tmpdir(), 'mm-unchecked-'));
	await mkdir(join(cwd, '.migrate'));
	await writeFile(join(cwd, '.migrate', 'inventory.json'), JSON.stringify({ routes: [], routeUnion: [{ route: '/news/:slug', knownBy: ['source'], crawled: [], dynamic: true, kind: 'page', file: 'app/news/[slug]/page.tsx', line: 4 }] }));
	const check = (...extra: string[]) => new Promise<{ status: number; stdout: string; stderr: string }>((done) => {
		const child = spawn(process.execPath, [CLI, 'check', '--old', old!, '--new', next!, '--all', ...extra], { cwd });
		const r = { stdout: '', stderr: '' };
		child.stdout.on('data', (c) => (r.stdout += c));
		child.stderr.on('data', (c) => (r.stderr += c));
		child.on('exit', (code) => done({ status: code ?? -1, ...r }));
	});
	try {
		const strict = await check();
		assert.equal(strict.status, 1, strict.stdout + strict.stderr);
		assert.match(strict.stdout, /1 of 1 routes green; 1 route not checked \(needs a sample\)\./);
		assert.match(strict.stdout, /\/news\/:slug +no value for :slug +app\/news\/\[slug\]\/page\.tsx:4/);
		assert.match(strict.stderr, /1 route not checked for want of a sample value/);
		assert.equal((await check('--allow-unchecked')).status, 0);
	} finally {
		for (const s of servers) s.close();
	}
});
