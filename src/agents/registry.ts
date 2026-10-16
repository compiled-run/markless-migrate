import { access, constants } from 'node:fs/promises';
import { delimiter, join } from 'node:path';

export interface HostEnv {
	readonly home: string;
	readonly env: Readonly<Record<string, string | undefined>>;
	readonly platform?: NodeJS.Platform;
}

export interface ServerCommand {
	readonly command: string;
	readonly args: readonly string[];
}

export type ConfigFormat = 'json' | 'codex-toml';

export interface AgentDefinition {
	readonly id: string;
	readonly label: string;
	readonly binaries: readonly string[];
	homeDir(host: HostEnv): string;
	configPath(host: HostEnv): string;
	readonly format: ConfigFormat;
	/** Where the server entry lives inside the JSON config. */
	readonly jsonPath?: readonly string[];
	serverEntry?(server: ServerCommand): unknown;
	skillPath(host: HostEnv): string;
}

const nonEmpty = (value: string | undefined) => (value && value.trim() ? value : undefined);
const claudeDir = (h: HostEnv) => nonEmpty(h.env.CLAUDE_CONFIG_DIR) ?? join(h.home, '.claude');
const codexDir = (h: HostEnv) => nonEmpty(h.env.CODEX_HOME) ?? join(h.home, '.codex');
const geminiDir = (h: HostEnv) => join(nonEmpty(h.env.GEMINI_CLI_HOME) ?? h.home, '.gemini');
const copilotDir = (h: HostEnv) => nonEmpty(h.env.COPILOT_HOME) ?? join(h.home, '.copilot');
const opencodeDir = (h: HostEnv) => nonEmpty(h.env.OPENCODE_CONFIG_DIR) ?? join(nonEmpty(h.env.XDG_CONFIG_HOME) ?? join(h.home, '.config'), 'opencode');
const vscodeUserDir = (h: HostEnv) => {
	const platform = h.platform ?? process.platform;
	if (platform === 'darwin') return join(h.home, 'Library', 'Application Support', 'Code', 'User');
	if (platform === 'win32') return join(nonEmpty(h.env.APPDATA) ?? join(h.home, 'AppData', 'Roaming'), 'Code', 'User');
	return join(nonEmpty(h.env.XDG_CONFIG_HOME) ?? join(h.home, '.config'), 'Code', 'User');
};
const skill = (dir: string) => join(dir, 'skills', 'markless-migrate', 'SKILL.md');

export const SERVER_NAME = 'markless-migrate';

export const AGENTS: readonly AgentDefinition[] = [
	{
		id: 'claude-code',
		label: 'Claude Code',
		binaries: ['claude'],
		homeDir: claudeDir,
		configPath: (h) => (nonEmpty(h.env.CLAUDE_CONFIG_DIR) ? join(h.env.CLAUDE_CONFIG_DIR!, '.claude.json') : join(h.home, '.claude.json')),
		format: 'json',
		jsonPath: ['mcpServers', SERVER_NAME],
		serverEntry: (s) => ({ type: 'stdio', command: s.command, args: s.args, env: {} }),
		skillPath: (h) => skill(claudeDir(h)),
	},
	{
		id: 'codex',
		label: 'Codex',
		binaries: ['codex'],
		homeDir: codexDir,
		configPath: (h) => join(codexDir(h), 'config.toml'),
		format: 'codex-toml',
		skillPath: (h) => skill(codexDir(h)),
	},
	{
		id: 'cursor',
		label: 'Cursor',
		binaries: ['cursor-agent', 'cursor'],
		homeDir: (h) => join(h.home, '.cursor'),
		configPath: (h) => join(h.home, '.cursor', 'mcp.json'),
		format: 'json',
		jsonPath: ['mcpServers', SERVER_NAME],
		serverEntry: (s) => ({ command: s.command, args: s.args }),
		skillPath: (h) => skill(join(h.home, '.cursor')),
	},
	{
		id: 'gemini-cli',
		label: 'Gemini CLI',
		binaries: ['gemini'],
		homeDir: geminiDir,
		configPath: (h) => join(geminiDir(h), 'settings.json'),
		format: 'json',
		jsonPath: ['mcpServers', SERVER_NAME],
		serverEntry: (s) => ({ command: s.command, args: s.args }),
		skillPath: (h) => skill(geminiDir(h)),
	},
	{
		id: 'github-copilot',
		label: 'GitHub Copilot CLI',
		binaries: ['copilot'],
		homeDir: copilotDir,
		configPath: (h) => join(copilotDir(h), 'mcp-config.json'),
		format: 'json',
		jsonPath: ['mcpServers', SERVER_NAME],
		serverEntry: (s) => ({ type: 'local', command: s.command, args: s.args, tools: ['*'] }),
		skillPath: (h) => skill(copilotDir(h)),
	},
	{
		id: 'vscode',
		label: 'VS Code (Copilot agent mode)',
		binaries: ['code'],
		homeDir: vscodeUserDir,
		configPath: (h) => join(vscodeUserDir(h), 'mcp.json'),
		format: 'json',
		jsonPath: ['servers', SERVER_NAME],
		serverEntry: (s) => ({ type: 'stdio', command: s.command, args: s.args }),
		skillPath: (h) => skill(join(h.home, '.copilot')),
	},
	{
		id: 'opencode',
		label: 'opencode',
		binaries: ['opencode'],
		homeDir: opencodeDir,
		configPath: (h) => join(opencodeDir(h), 'opencode.json'),
		format: 'json',
		jsonPath: ['mcp', SERVER_NAME],
		serverEntry: (s) => ({ type: 'local', command: [s.command, ...s.args], enabled: true }),
		skillPath: (h) => skill(opencodeDir(h)),
	},
];

async function exists(path: string, mode = constants.F_OK): Promise<boolean> {
	return access(path, mode).then(
		() => true,
		() => false,
	);
}

export async function findBinary(name: string, host: HostEnv): Promise<string | undefined> {
	for (const dir of (host.env.PATH ?? '').split(delimiter).filter(Boolean)) {
		const path = join(dir, name);
		if (await exists(path, constants.X_OK)) return path;
	}
	return undefined;
}

export interface Detection {
	readonly agent: AgentDefinition;
	readonly evidence: readonly string[];
}

export async function detectAgents(host: HostEnv): Promise<Detection[]> {
	const out: Detection[] = [];
	for (const agent of AGENTS) {
		const evidence: string[] = [];
		if (await exists(agent.homeDir(host))) evidence.push(agent.homeDir(host));
		for (const binary of agent.binaries) {
			const path = await findBinary(binary, host);
			if (path) evidence.push(path);
		}
		if (evidence.length) out.push({ agent, evidence });
	}
	return out;
}
