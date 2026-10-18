import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmod, mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { detectAgents } from '../src/agents/registry.ts';
import { planSetup } from '../src/agents/setup.ts';
import { isManagedSkill } from '../src/agents/skill.ts';

const CLI = new URL('../src/cli.ts', import.meta.url).pathname;

async function sandbox() {
	const home = await mkdtemp(join(tmpdir(), 'mm-home-'));
	const bin = join(home, 'bin');
	await mkdir(bin);
	const env = { HOME: home, PATH: bin, XDG_CONFIG_HOME: '', CLAUDE_CONFIG_DIR: '', CODEX_HOME: '', GEMINI_CLI_HOME: '', COPILOT_HOME: '', OPENCODE_CONFIG_DIR: '' };
	const run = (...args: string[]) => spawnSync(process.execPath, [CLI, 'setup', ...args], { encoding: 'utf8', env, input: '' });
	const fakeBinary = async (name: string) => {
		await writeFile(join(bin, name), '#!/bin/sh\n');
		await chmod(join(bin, name), 0o755);
	};
	return { home, bin, env, run, fakeBinary };
}

const json = async (path: string) => JSON.parse(await readFile(path, 'utf8'));

test('detects agents by config directory or by binary on PATH', async () => {
	const { home, env, fakeBinary } = await sandbox();
	await mkdir(join(home, '.claude'));
	await mkdir(join(home, '.gemini'));
	await fakeBinary('codex');
	await fakeBinary('opencode');
	const found = await detectAgents({ home, env });
	assert.deepEqual(found.map((d) => d.agent.id), ['claude-code', 'codex', 'gemini-cli', 'opencode']);
	assert.equal(found.find((d) => d.agent.id === 'codex')!.evidence[0], join(home, 'bin', 'codex'));
});

test('with no agent found, setup says so and writes nothing', async () => {
	const { home, run } = await sandbox();
	const result = run('--yes');
	assert.equal(result.status, 1);
	assert.match(result.stdout, /No supported agent found/);
	assert.deepEqual((await readdir(home)).sort(), ['bin']);
});

test('setup applies without asking, says exactly what changed and how to undo it; --dry-run writes nothing', async () => {
	const { home, run } = await sandbox();
	await mkdir(join(home, '.claude'));
	const preview = run('--dry-run');
	assert.equal(preview.status, 0);
	assert.match(preview.stdout, /Would change \(nothing written\):/);
	assert.match(preview.stdout, /create +~\/\.claude\.json +\(mcp server: add mcpServers\.markless-migrate\)/);
	assert.deepEqual(await readdir(join(home, '.claude')), []);
	const result = run();
	assert.equal(result.status, 0, result.stdout + result.stderr);
	assert.match(result.stdout, /Changed:\n/);
	assert.match(result.stdout, /wrote ~\/\.claude\.json \(new file\)/);
	assert.match(result.stdout, /wrote ~\/\.claude\/skills\/markless-migrate\/SKILL\.md \(new file\)/);
	assert.match(result.stdout, /To undo it: markless-migrate setup --undo\n$/);
	assert.doesNotMatch(result.stdout, /\[y\/N\]|re-run with/);
	assert.ok((await json(join(home, '.claude.json'))).mcpServers['markless-migrate']);
});

test('setup --undo puts every file back as it was before setup first changed it, and leaves a file edited since alone', async () => {
	const { home, run } = await sandbox();
	await mkdir(join(home, '.gemini'));
	await mkdir(join(home, '.claude'));
	const settings = join(home, '.gemini', 'settings.json');
	await writeFile(settings, '{"a":1}');
	assert.equal(run('--agent', 'gemini-cli').status, 0);
	assert.equal(run('--agent', 'gemini-cli', '--agent', 'claude-code').status, 0, 'a second setup adds files to the same undo');
	await writeFile(join(home, '.claude.json'), '{"mine":true}');
	const undo = run('--undo');
	assert.equal(undo.status, 1, 'one file was kept, which undo reports');
	assert.match(undo.stdout, /restored +~\/\.gemini\/settings\.json/);
	assert.match(undo.stdout, /removed +~\/\.gemini\/skills\/markless-migrate\/SKILL\.md/);
	assert.match(undo.stdout, /kept: edited since setup ~\/\.claude\.json/);
	assert.equal(await readFile(settings, 'utf8'), '{"a":1}');
	assert.equal(await readFile(join(home, '.claude.json'), 'utf8'), '{"mine":true}');
	await assert.rejects(readFile(join(home, '.claude', 'skills', 'markless-migrate', 'SKILL.md')));
	assert.match(run('--undo').stdout, /Nothing to undo/);
});

test('setup registers the MCP server and installs the skill for all six agents, keeping existing settings', async () => {
	const { home, run, fakeBinary } = await sandbox();
	for (const dir of ['.claude', '.codex', '.cursor', '.gemini', '.copilot', '.config/opencode']) await mkdir(join(home, dir), { recursive: true });
	await fakeBinary('copilot');
	await writeFile(join(home, '.claude.json'), JSON.stringify({ theme: 'dark', mcpServers: { other: { command: 'x' } } }));
	await writeFile(join(home, '.codex', 'config.toml'), 'model = "gpt-5"\n\n[mcp_servers.other]\ncommand = "x"\n');
	const result = run('--yes');
	assert.equal(result.status, 0, result.stdout + result.stderr);

	const claude = await json(join(home, '.claude.json'));
	assert.equal(claude.theme, 'dark');
	assert.deepEqual(claude.mcpServers.other, { command: 'x' });
	assert.equal(claude.mcpServers['markless-migrate'].type, 'stdio');
	assert.deepEqual(claude.mcpServers['markless-migrate'].args.slice(-1), ['mcp']);
	assert.equal(await readFile(join(home, '.claude.json.markless-migrate.bak'), 'utf8'), JSON.stringify({ theme: 'dark', mcpServers: { other: { command: 'x' } } }));

	const codex = await readFile(join(home, '.codex', 'config.toml'), 'utf8');
	assert.match(codex, /^model = "gpt-5"\n\n\[mcp_servers\.other\]\ncommand = "x"\n/);
	assert.match(codex, /\[mcp_servers\.markless-migrate\]\ncommand = ".+"\nargs = \[".+", "mcp"\]/);

	assert.ok((await json(join(home, '.cursor', 'mcp.json'))).mcpServers['markless-migrate'].command);
	assert.ok((await json(join(home, '.gemini', 'settings.json'))).mcpServers['markless-migrate'].command);
	assert.deepEqual((await json(join(home, '.copilot', 'mcp-config.json'))).mcpServers['markless-migrate'].tools, ['*']);
	const opencode = (await json(join(home, '.config', 'opencode', 'opencode.json'))).mcp['markless-migrate'];
	assert.equal(opencode.type, 'local');
	assert.equal(opencode.command.at(-1), 'mcp');

	for (const dir of ['.claude', '.codex', '.cursor', '.gemini', '.copilot', '.config/opencode']) {
		const skill = await readFile(join(home, dir, 'skills', 'markless-migrate', 'SKILL.md'), 'utf8');
		assert.ok(isManagedSkill(skill), dir);
		assert.match(skill, /^---\nname: markless-migrate\n/);
	}

	const again = run('--yes');
	assert.equal(again.status, 0);
	assert.match(again.stdout, /Everything is already set up/);
	assert.doesNotMatch(again.stdout, /create|update /);
});

test('a second setup after the user edits a config keeps the first backup and saves the new state separately', async () => {
	const { home, run } = await sandbox();
	await mkdir(join(home, '.gemini'));
	await writeFile(join(home, '.gemini', 'settings.json'), '{"a":1}');
	assert.equal(run('--yes').status, 0);
	const settings = join(home, '.gemini', 'settings.json');
	await writeFile(settings, JSON.stringify({ a: 2 }));
	assert.equal(run('--yes').status, 0);
	assert.equal(await readFile(`${settings}.markless-migrate.bak`, 'utf8'), '{"a":1}');
	const extra = (await readdir(join(home, '.gemini'))).filter((f) => /settings\.json\.markless-migrate\.bak\.[a-f0-9]{12}$/.test(f));
	assert.equal(extra.length, 1);
	assert.equal((await json(settings)).a, 2);
});

test('malformed config, a hand-written server entry or a foreign SKILL.md block setup before anything is written', async () => {
	const { home, run } = await sandbox();
	await mkdir(join(home, '.cursor'));
	await writeFile(join(home, '.cursor', 'mcp.json'), '{ // comment\n "mcpServers": {} }');
	await mkdir(join(home, '.codex'));
	await writeFile(join(home, '.codex', 'config.toml'), '[mcp_servers.markless-migrate]\ncommand = "mine"\n');
	await mkdir(join(home, '.claude', 'skills', 'markless-migrate'), { recursive: true });
	await writeFile(join(home, '.claude', 'skills', 'markless-migrate', 'SKILL.md'), 'my own notes\n');
	const result = run('--yes');
	assert.equal(result.status, 1);
	assert.match(result.stdout, /blocked +~\/\.cursor\/mcp\.json .*not plain JSON/);
	assert.match(result.stdout, /blocked +~\/\.codex\/config\.toml .*not written by this tool/);
	assert.match(result.stdout, /blocked +~\/\.claude\/skills\/markless-migrate\/SKILL\.md/);
	assert.match(result.stdout, /Nothing was written/);
	await assert.rejects(readFile(join(home, '.claude.json')));
	assert.equal(await readFile(join(home, '.claude', 'skills', 'markless-migrate', 'SKILL.md'), 'utf8'), 'my own notes\n');
});

test('--agent selects agents explicitly, even ones not detected, and rejects unknown ids', async () => {
	const { home, run } = await sandbox();
	assert.equal(run('--agent', 'codex', '--yes').status, 0);
	assert.match(await readFile(join(home, '.codex', 'config.toml'), 'utf8'), /mcp_servers\.markless-migrate/);
	const bad = run('--agent', 'notepad', '--yes');
	assert.equal(bad.status, 1);
	assert.match(bad.stderr, /unknown agent "notepad"/);
});

test('VS Code agent mode gets a "servers" entry in the user profile mcp.json for each platform and shares the Copilot skill folder', async () => {
	const home = '/h';
	const server = { command: 'node', args: ['cli.ts', 'mcp'] };
	const path = async (platform: NodeJS.Platform, env: Record<string, string> = {}) => (await planSetup({ home, env, platform }, ['vscode'], server))[0]!.path;
	assert.equal(await path('darwin'), '/h/Library/Application Support/Code/User/mcp.json');
	assert.equal(await path('linux'), '/h/.config/Code/User/mcp.json');
	assert.equal(await path('linux', { XDG_CONFIG_HOME: '/x' }), '/x/Code/User/mcp.json');
	assert.equal(await path('win32', { APPDATA: '/a' }), '/a/Code/User/mcp.json');

	const both = await planSetup({ home, env: {}, platform: 'linux' }, ['github-copilot', 'vscode'], server);
	assert.deepEqual(both.map((c) => `${c.agent} ${c.what} ${c.path}`), [
		'github-copilot mcp server /h/.copilot/mcp-config.json',
		'github-copilot skill /h/.copilot/skills/markless-migrate/SKILL.md',
		'vscode mcp server /h/.config/Code/User/mcp.json',
	]);
});

test('setup --agent vscode writes the VS Code mcp.json with a stdio server under "servers"', { skip: process.platform !== 'darwin' && process.platform !== 'linux' }, async () => {
	const { home, run } = await sandbox();
	const dir = process.platform === 'darwin' ? join(home, 'Library', 'Application Support', 'Code', 'User') : join(home, '.config', 'Code', 'User');
	await mkdir(dir, { recursive: true });
	await writeFile(join(dir, 'mcp.json'), JSON.stringify({ servers: { other: { command: 'x' } }, inputs: [] }));
	assert.equal(run('--agent', 'vscode', '--yes').status, 0);
	const config = await json(join(dir, 'mcp.json'));
	assert.deepEqual(config.servers.other, { command: 'x' });
	assert.deepEqual(config.inputs, []);
	assert.equal(config.servers['markless-migrate'].type, 'stdio');
	assert.equal(config.servers['markless-migrate'].args.at(-1), 'mcp');
	assert.equal(config.mcpServers, undefined);
	assert.ok(isManagedSkill(await readFile(join(home, '.copilot', 'skills', 'markless-migrate', 'SKILL.md'), 'utf8')));
});
