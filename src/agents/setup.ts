import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { AGENTS, SERVER_NAME, type AgentDefinition, type HostEnv, type ServerCommand } from './registry.ts';
import { isManagedSkill, managedSkill } from './skill.ts';

export type Action = 'create' | 'update' | 'unchanged' | 'blocked';

export interface Change {
	readonly agent: string;
	readonly path: string;
	readonly what: 'mcp server' | 'skill';
	readonly action: Action;
	readonly detail: string;
	readonly before?: string;
	readonly after?: string;
}

const BEGIN = `# BEGIN ${SERVER_NAME} (managed by markless-migrate setup)`;
const END = `# END ${SERVER_NAME}`;

async function readIfExists(path: string): Promise<string | undefined> {
	return readFile(path, 'utf8').catch((error: NodeJS.ErrnoException) => {
		if (error.code === 'ENOENT') return undefined;
		throw error;
	});
}

function tomlString(value: string): string {
	return JSON.stringify(value);
}

export function codexBlock(server: ServerCommand): string {
	return `${BEGIN}\n[mcp_servers.${SERVER_NAME}]\ncommand = ${tomlString(server.command)}\nargs = [${server.args.map(tomlString).join(', ')}]\nstartup_timeout_sec = 30\n${END}\n`;
}

function planCodex(before: string | undefined, server: ServerCommand): Pick<Change, 'action' | 'detail' | 'after'> {
	const block = codexBlock(server);
	const current = before ?? '';
	const start = current.indexOf(BEGIN);
	const end = current.indexOf(END);
	if (start === -1) {
		if (new RegExp(`^\\s*\\[mcp_servers\\.("?)${SERVER_NAME}\\1\\]`, 'm').test(current)) {
			return { action: 'blocked', detail: `[mcp_servers.${SERVER_NAME}] already exists and was not written by this tool; remove it or edit it by hand` };
		}
		const after = current ? `${current.replace(/\n*$/, '\n')}\n${block}` : block;
		return { action: before === undefined ? 'create' : 'update', detail: `add [mcp_servers.${SERVER_NAME}]`, after };
	}
	if (end === -1 || end < start) return { action: 'blocked', detail: `the ${SERVER_NAME} block markers are damaged; fix the file by hand` };
	const after = current.slice(0, start) + block + current.slice(end + END.length + 1);
	return after === current ? { action: 'unchanged', detail: 'server already registered' } : { action: 'update', detail: `update [mcp_servers.${SERVER_NAME}]`, after };
}

function planJson(agent: AgentDefinition, before: string | undefined, server: ServerCommand): Pick<Change, 'action' | 'detail' | 'after'> {
	let config: Record<string, unknown>;
	try {
		config = before === undefined || !before.trim() ? {} : JSON.parse(before);
	} catch {
		return { action: 'blocked', detail: 'the file is not plain JSON (comments or a syntax error); add the entry by hand or fix the file' };
	}
	if (!config || typeof config !== 'object' || Array.isArray(config)) return { action: 'blocked', detail: 'the file does not hold a JSON object' };
	const [table, key] = agent.jsonPath!;
	const parent = (config[table!] ?? {}) as Record<string, unknown>;
	if (typeof parent !== 'object' || Array.isArray(parent)) return { action: 'blocked', detail: `"${table}" is not an object` };
	const entry = agent.serverEntry!(server);
	if (JSON.stringify(parent[key!]) === JSON.stringify(entry)) return { action: 'unchanged', detail: 'server already registered' };
	const next = { ...config, [table!]: { ...parent, [key!]: entry } };
	return {
		action: before === undefined ? 'create' : 'update',
		detail: `${parent[key!] ? 'update' : 'add'} ${table}.${key}`,
		after: `${JSON.stringify(next, null, 2)}\n`,
	};
}

export async function planSetup(host: HostEnv, agentIds: readonly string[], server: ServerCommand): Promise<Change[]> {
	const changes: Change[] = [];
	for (const id of agentIds) {
		const agent = AGENTS.find((a) => a.id === id);
		if (!agent) throw new Error(`unknown agent "${id}"; known: ${AGENTS.map((a) => a.id).join(', ')}`);
		const configPath = agent.configPath(host);
		const before = await readIfExists(configPath);
		const mcp = agent.format === 'codex-toml' ? planCodex(before, server) : planJson(agent, before, server);
		changes.push({ agent: agent.id, path: configPath, what: 'mcp server', before, ...mcp });

		const skillPath = agent.skillPath(host);
		const existing = await readIfExists(skillPath);
		const skill = managedSkill();
		if (existing === skill) changes.push({ agent: agent.id, path: skillPath, what: 'skill', action: 'unchanged', detail: 'skill is current' });
		else if (existing !== undefined && !isManagedSkill(existing)) changes.push({ agent: agent.id, path: skillPath, what: 'skill', action: 'blocked', detail: 'a SKILL.md not written by this tool is already there', before: existing });
		else changes.push({ agent: agent.id, path: skillPath, what: 'skill', action: existing ? 'update' : 'create', detail: existing ? 'update the migration skill' : 'install the migration skill', before: existing, after: skill });
	}
	return changes;
}

function shortHash(text: string): string {
	return createHash('sha256').update(text).digest('hex').slice(0, 12);
}

// The first backup is the pre-install snapshot and is never overwritten; later differing states get their own copy.
async function backup(path: string, contents: string): Promise<string> {
	const first = `${path}.markless-migrate.bak`;
	const existing = await readIfExists(first);
	if (existing === undefined) {
		await writeFile(first, contents, { flag: 'wx' });
		return first;
	}
	if (existing === contents) return first;
	const extra = `${first}.${shortHash(contents)}`;
	await writeFile(extra, contents);
	return extra;
}

export interface Applied {
	readonly change: Change;
	readonly backup?: string;
}

export async function applySetup(changes: readonly Change[]): Promise<Applied[]> {
	const blocked = changes.filter((c) => c.action === 'blocked');
	if (blocked.length) throw new Error(`setup is blocked, nothing was written:\n${blocked.map((c) => `  ${c.path}: ${c.detail}`).join('\n')}`);
	const applied: Applied[] = [];
	for (const change of changes) {
		if (change.action === 'unchanged' || change.after === undefined) {
			applied.push({ change });
			continue;
		}
		const current = await readIfExists(change.path);
		if (current !== change.before) throw new Error(`${change.path} changed while setup was running; run setup again`);
		await mkdir(dirname(change.path), { recursive: true });
		const saved = current === undefined ? undefined : await backup(change.path, current);
		const temp = `${change.path}.${process.pid}.tmp`;
		await writeFile(temp, change.after);
		await rename(temp, change.path);
		if ((await readFile(change.path, 'utf8')) !== change.after) throw new Error(`${change.path} did not read back as written`);
		applied.push({ change, ...(saved ? { backup: saved } : {}) });
	}
	return applied;
}

export function describeChanges(changes: readonly Change[], home: string): string {
	const tilde = (path: string) => (path.startsWith(home) ? `~${path.slice(home.length)}` : path);
	const lines: string[] = [];
	for (const agent of new Set(changes.map((c) => c.agent))) {
		lines.push(AGENTS.find((a) => a.id === agent)!.label);
		for (const c of changes.filter((x) => x.agent === agent)) lines.push(`  ${c.action.padEnd(9)} ${tilde(c.path)}  (${c.what}: ${c.detail})`);
	}
	return `${lines.join('\n')}\n`;
}
