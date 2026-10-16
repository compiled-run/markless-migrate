import { SERVER_NAME } from '../agents/registry.ts';

export interface Driver {
	readonly id: string;
	readonly binary: string;
	args(prompt: string, model?: string): string[];
}

const model = (flag: string, value?: string) => (value ? [flag, value] : []);

export const DRIVERS: readonly Driver[] = [
	{
		id: 'codex',
		binary: 'codex',
		args: (prompt, m) => ['exec', '--skip-git-repo-check', '--sandbox', 'workspace-write', '-c', `mcp_servers.${SERVER_NAME}.default_tools_approval_mode="approve"`, ...model('--model', m), prompt],
	},
	{
		id: 'claude',
		binary: 'claude',
		args: (prompt, m) => ['-p', prompt, ...model('--model', m), '--permission-mode', 'acceptEdits', '--allowedTools', `mcp__${SERVER_NAME},Bash,Read,Edit,Write,Glob,Grep`],
	},
	{
		id: 'gemini',
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
	const found = DRIVERS.find((d) => d.id === id);
	if (!found) throw new Error(`unknown agent "${id}"; run supports: ${DRIVERS.map((d) => d.id).join(', ')}`);
	return found;
}
