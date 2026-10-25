import { lstat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { SERVER_NAME, type ServerCommand } from '../agents/registry.ts';

export interface Driver {
	readonly id: string;
	/** The name `setup` gives the same agent, when it differs (`claude-code` for `claude`). */
	readonly setupId?: string;
	readonly binary: string;
	/** With `server`, the markless-migrate MCP server is passed on the command line, so the agent's own config is never edited or copied. */
	args(prompt: string, model?: string, server?: ServerCommand): string[];
}

const model = (flag: string, value?: string) => (value ? [flag, value] : []);

export const DRIVERS: readonly Driver[] = [
	{
		id: 'codex',
		binary: 'codex',
		args: (prompt, m, server) => [
			'exec',
			'--skip-git-repo-check',
			'--sandbox',
			'workspace-write',
			...(server ? ['-c', `mcp_servers.${SERVER_NAME}.command=${JSON.stringify(server.command)}`, '-c', `mcp_servers.${SERVER_NAME}.args=${JSON.stringify(server.args)}`] : []),
			'-c',
			`mcp_servers.${SERVER_NAME}.default_tools_approval_mode="approve"`,
			...model('--model', m),
			prompt,
		],
	},
	{
		id: 'claude',
		setupId: 'claude-code',
		binary: 'claude',
		args: (prompt, m, server) => [
			'-p',
			prompt,
			...model('--model', m),
			...(server ? ['--mcp-config', JSON.stringify({ mcpServers: { [SERVER_NAME]: { type: 'stdio', command: server.command, args: server.args, env: {} } } })] : []),
			'--permission-mode',
			'acceptEdits',
			'--allowedTools',
			`mcp__${SERVER_NAME},Bash,Read,Edit,Write,Glob,Grep`,
		],
	},
	{
		id: 'gemini',
		setupId: 'gemini-cli',
		binary: 'gemini',
		args: (prompt, m) => ['--approval-mode', 'yolo', ...model('--model', m), '-p', prompt],
	},
	{
		id: 'cursor',
		binary: 'cursor-agent',
		args: (prompt, m) => ['-p', '--force', '--approve-mcps', '--output-format', 'text', ...model('--model', m), prompt],
	},
	{
		id: 'copilot',
		setupId: 'github-copilot',
		binary: 'copilot',
		args: (prompt, m) => ['-p', prompt, '--allow-all-tools', ...model('--model', m)],
	},
	{
		id: 'opencode',
		binary: 'opencode',
		args: (prompt, m) => ['run', ...model('--model', m), prompt],
	},
];

export function driver(id: string): Driver {
	const found = DRIVERS.find((d) => d.id === id || d.setupId === id);
	if (!found) throw new Error(`unknown agent "${id}"; run supports: ${DRIVERS.map((d) => (d.setupId ? `${d.id} (${d.setupId})` : d.id)).join(', ')}`);
	return found;
}

/**
 * A CODEX_HOME other than ~/.codex that holds its own copy of auth.json: ChatGPT refresh tokens are single-use, so when that
 * copy refreshes, the user's real login in ~/.codex is spent and the new tokens die with the copy.
 */
export async function copiedLogin(id: string, env: NodeJS.ProcessEnv, home: string): Promise<string | undefined> {
	if (id !== 'codex' || !env.CODEX_HOME) return undefined;
	const real = join(home, '.codex');
	const other = resolve(env.CODEX_HOME);
	if (other === real) return undefined;
	const copy = await lstat(join(other, 'auth.json')).catch(() => undefined);
	const original = await lstat(join(real, 'auth.json')).catch(() => undefined);
	if (!copy?.isFile() || !original) return undefined;
	return `CODEX_HOME=${other} holds a copy of ${join(real, 'auth.json')}. Codex refresh tokens work once: when the copy refreshes, your real login is spent. Unset CODEX_HOME (run passes the markless-migrate server to codex on the command line, so ~/.codex is not changed), or sign in inside that home with \`codex login\` instead of copying the file.`;
}
