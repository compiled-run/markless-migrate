import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { normaliser, runCliCheck, type CliConfig } from '../src/check/cli/conform.ts';

const fixtures = join(import.meta.dirname, 'cli-fixtures');
const CLI = new URL('../src/cli.ts', import.meta.url).pathname;

function config(registry: string, broken = false): CliConfig {
	return {
		old: { command: ['node', './greet-old.mjs'] },
		new: { command: ['node', './greet-new.mjs'], ...(broken ? { env: { GREET_BROKEN: '1' } } : {}) },
		cases: [
			{ name: 'version', args: ['--version'] },
			{ name: 'init asks for a name and a language', args: ['init'], env: { GREET_REGISTRY: registry }, stdin: [{ expect: 'Project name\\?', send: 'shop\n' }, { expect: 'TypeScript\\?', send: 'y\n' }] },
			{ name: 'init refuses an existing project', args: ['init', '--yes'], files: { 'greet.json': '{}\n' } },
			{ name: 'unknown command', args: ['deploy'] },
		],
	};
}

test('output is compared without the run\'s directories, colours, durations, versions and timestamps', () => {
	const n = normaliser({ cwd: '/tmp/mm-cli-1/work', home: '/tmp/mm-cli-1/home', tmp: '/tmp/mm-cli-1' }, [{ pattern: 'id-[a-f0-9]+', with: 'id-<hex>' }]);
	assert.equal(n.text('\u001b[32mCreated /tmp/mm-cli-1/work/a.json in 12ms\u001b[0m\r\n'), 'Created <cwd>/a.json in <duration>\n');
	assert.equal(n.request('GET http://127.0.0.1:8080/pkg/1.2.3 at 2026-10-17T09:00:00Z from /tmp/mm-cli-1/work'), 'GET http://127.0.0.1:8080/pkg/1.2.3 at <time> from <cwd>');
	assert.equal(n.text('greet v2.0.0-beta.1 at 2026-10-17T09:00:00.123Z, cache /tmp/mm-cli-1/home/.greet, temp /tmp/mm-cli-1/x, id-9f3a'), 'greet <version> at <time>, cache <home>/.greet, temp <tmp>/x, id-<hex>');
});

test('a faithful port of a CLI is the same in exit codes, output, prompts, files written and requests made, with the registry replayed from a recording', async () => {
	const server = createServer((req, res) => res.writeHead(req.url === '/templates/shop.json' ? 200 : 404, { 'content-type': 'application/json' }).end(req.url === '/templates/shop.json' ? '{"template":"shop","files":2}' : '{}'));
	await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
	const registry = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
	const fixturesDir = await mkdtemp(join(tmpdir(), 'mm-cli-fixtures-'));
	const recorded = await runCliCheck({ config: config(registry), base: fixtures, fixturesDir, record: true });
	server.close();
	assert.equal(recorded.ok, true, JSON.stringify(recorded.cases.flatMap((c) => c.failures), null, 1));
	assert.deepEqual(JSON.parse(await readFile(join(fixturesDir, 'init-asks-for-a-name-and-a-language.json'), 'utf8'))[`GET ${registry}/templates/shop.json`].body, '{"template":"shop","files":2}');

	const replayed = await runCliCheck({ config: config(registry), base: fixtures, fixturesDir });
	assert.equal(replayed.ok, true, JSON.stringify(replayed.cases.flatMap((c) => c.failures), null, 1));
	const init = replayed.cases.find((c) => c.name.startsWith('init asks'))!;
	assert.deepEqual(init.new.stdout, ['Project name? shop', 'Use TypeScript? (y/n) y', 'Created greet.json in <duration>', 'Wrote <cwd>/src/index.ts']);
	assert.deepEqual(Object.keys(init.new.files).sort(), ['greet.json', 'src/index.ts', 'template.json', '~/.greet/recent']);
	assert.equal(init.new.files['template.json'], '{"template":"shop","files":2}', 'the registry answered from the recording, with the server gone');
	assert.match(init.new.files['greet.json']!, /"createdAt": "<time>"/);
	assert.deepEqual(init.new.network, [`GET ${registry}/templates/shop.json`]);
	assert.deepEqual(replayed.cases.map((c) => [c.name, c.new.exit]), [['version', 0], ['init asks for a name and a language', 0], ['init refuses an existing project', 1], ['unknown command', 2]]);
});

test('a port that drops a request, a file field and an exit code is red on each, with what the old tool did', async () => {
	const fixturesDir = await mkdtemp(join(tmpdir(), 'mm-cli-fixtures-'));
	const report = await runCliCheck({ config: config('http://127.0.0.1:9', true), base: fixtures, fixturesDir });
	assert.equal(report.ok, false);
	const failures = Object.fromEntries(report.cases.map((c) => [c.name, c.failures.map((f) => `${f.check}: ${f.expected} => ${f.actual}`)]));
	assert.deepEqual(failures.version, []);
	assert.deepEqual(failures['unknown command'], ['exit code: 2 => 1']);
	assert.deepEqual(failures['init refuses an existing project'], []);
	const init = failures['init asks for a name and a language']!;
	assert.ok(init.some((f) => /^files: greet\.json: {3}"typescript": true,/.test(f)), init.join('\n'));
	assert.ok(init.some((f) => /^files: template\.json: \{"offline":true\} => template\.json: \{\}/.test(f)), init.join('\n'));
	assert.ok(init.some((f) => /^network: GET http:\/\/127\.0\.0\.1:9\/templates\/shop\.json => \(nothing\)/.test(f)), init.join('\n'));
});

test('markless-migrate cli runs .migrate/cli.json, writes the report and exits 1 when a case differs', async () => {
	const dir = await mkdtemp(join(tmpdir(), 'mm-cli-cmd-'));
	await mkdir(join(dir, '.migrate'), { recursive: true });
	const c = config('http://127.0.0.1:9', true);
	await writeFile(join(dir, '.migrate/cli.json'), JSON.stringify({ ...c, old: { command: ['node', join(fixtures, 'greet-old.mjs')] }, new: { ...c.new, command: ['node', join(fixtures, 'greet-new.mjs')] } }));
	const red = spawnSync(process.execPath, [CLI, 'cli', '--case', 'unknown command'], { cwd: dir, encoding: 'utf8' });
	assert.equal(red.status, 1, red.stderr);
	assert.match(red.stdout, /CLI conformance: 0 of 1 cases the same\n {2}DIFFERS {2}unknown command/);
	assert.match(red.stdout, /exit code: expected 2\n {6}actual 1/);
	const report = JSON.parse(await readFile(join(dir, '.migrate/cli-report.json'), 'utf8'));
	assert.equal(report.cases[0].failures[0].check, 'exit code');
	const green = spawnSync(process.execPath, [CLI, 'cli', '--case', 'version'], { cwd: dir, encoding: 'utf8' });
	assert.equal(green.status, 0, green.stdout + green.stderr);
});
