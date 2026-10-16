import { spawn } from 'node:child_process';
import { appendFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { skillBody } from '../agents/skill.ts';
import { STATE_DIR } from '../status.ts';
import type { Driver } from './drivers.ts';
import type { AppServer } from './server.ts';
import type { ServerCommand } from '../agents/registry.ts';

export interface RouteCheck {
	readonly ok: boolean;
	readonly summary: string;
}

export interface RunOptions {
	readonly cwd: string;
	readonly driver: Driver;
	readonly old: string;
	readonly new: string;
	readonly routes: readonly string[];
	readonly attempts: number;
	readonly model?: string;
	readonly timeoutMs?: number;
	readonly env?: NodeJS.ProcessEnv;
	readonly cli: string;
	/** The markless-migrate MCP server, passed to agents that take one on the command line. */
	readonly mcp?: ServerCommand;
	/** What the check of each route is run with, so the prompt can say where things are and how to check the same way. */
	readonly context?: RunContext;
	/** The new app's server, owned by run: rebuilt and restarted after every attempt. */
	readonly server?: AppServer;
	/** How the agent gets the new app served: build command and the file that triggers a restart. */
	readonly serving?: { readonly build?: string; readonly restartOn?: string };
	check(route: string): Promise<RouteCheck>;
	progress?(line: string): void;
}

export interface RunContext {
	readonly source?: string;
	readonly newSource?: string;
	readonly auth?: string;
	/** Extra `check` flags, as typed, so the agent's own check matches run's. */
	readonly flags?: readonly string[];
}

export type Outcome = 'green' | 'already green' | 'needs a human';

export interface RouteOutcome {
	readonly route: string;
	readonly outcome: Outcome;
	readonly attempts: number;
	readonly summary: string;
}

const quote = (arg: string) => (/^[\w@%+=:,./-]+$/.test(arg) ? arg : `'${arg.replaceAll("'", "'\\''")}'`);

function serveLine(o: Pick<RunOptions, 'new' | 'server' | 'serving'>): string {
	if (!o.server) return `- When you change the new app, rebuild or restart whatever serves it so ${o.new} shows your change.`;
	const build = o.serving?.build ? `\`${o.serving.build}\`` : 'its build';
	const restart = o.serving?.restartOn ? ` As soon as ${o.serving.restartOn} changes (${build} writes it), the server restarts on its own within a second, so you can check your change.` : '';
	return `- markless-migrate runs the new app's server at ${o.new}: do not start, stop or restart a server yourself. After you finish it runs ${build}, restarts the server and checks again.${restart}`;
}

export function buildPrompt(o: Pick<RunOptions, 'old' | 'new' | 'cli' | 'context' | 'server' | 'serving'>, route: string, summary: string, attempt: number): string {
	const c = o.context ?? {};
	const toolArgs = [`old: ${o.old}`, `new: ${o.new}`, `route: ${route}`, ...(c.source ? [`source: ${c.source}`] : []), ...(c.newSource ? [`new_source: ${c.newSource}`] : []), ...(c.auth ? [`auth: ${c.auth}`] : [])];
	const command = [o.cli, 'check', '--old', o.old, '--new', o.new, '--route', route, ...(c.source ? ['--source', c.source] : []), ...(c.newSource ? ['--new-source', c.newSource] : []), ...(c.auth ? ['--auth', c.auth] : []), ...(c.flags ?? [])].map(quote).join(' ');
	return `${skillBody()}
## Your task now

Make route ${route} of the new app match the old app. Work in the current directory, which holds the new app.

- Old app (reference, never edit it): ${o.old}${c.source ? `\n- Old app's source, to read (never edit it): ${c.source}` : ''}
- New app: ${o.new}${c.newSource ? ` (source: ${c.newSource})` : ''}${c.auth ? `\n- Roles: ${c.auth}; the route is checked anonymous and as each role, and every one must be green.` : ''}
${serveLine(o)}
- Check with the markless-migrate \`check_route\` tool (${toolArgs.join(', ')}),
  or run \`${command}\`.
- Stop when the check is green, or when you cannot make progress; say what blocks you.

This is attempt ${attempt}. The latest check of ${route} says:

${summary}`;
}

interface AgentRun {
	readonly code: number | null;
	readonly signal: string | null;
	readonly output: string;
	readonly ms: number;
	readonly error?: string;
}

function invoke(o: RunOptions, prompt: string): Promise<AgentRun> {
	const started = Date.now();
	return new Promise((resolve) => {
		const child = spawn(o.driver.binary, o.driver.args(prompt, o.model, o.mcp), { cwd: o.cwd, env: o.env ?? process.env, stdio: ['ignore', 'pipe', 'pipe'] });
		let output = '';
		child.stdout.on('data', (chunk) => (output += chunk));
		child.stderr.on('data', (chunk) => (output += chunk));
		const timer = setTimeout(() => child.kill('SIGTERM'), o.timeoutMs ?? 30 * 60_000);
		child.on('error', (error) => {
			clearTimeout(timer);
			resolve({ code: null, signal: null, output, ms: Date.now() - started, error: error.message });
		});
		child.on('close', (code, signal) => {
			clearTimeout(timer);
			resolve({ code, signal, output, ms: Date.now() - started });
		});
	});
}

export async function runRoutes(o: RunOptions): Promise<RouteOutcome[]> {
	const log = join(o.cwd, STATE_DIR, 'run.log');
	await mkdir(join(o.cwd, STATE_DIR), { recursive: true });
	const write = (text: string) => appendFile(log, text);
	const say = (line: string) => o.progress?.(`${line}\n`);
	await write(`\n== ${new Date().toISOString()} run --agent ${o.driver.id}${o.model ? ` --model ${o.model}` : ''}, ${o.routes.length} route(s), up to ${o.attempts} attempt(s) each\n`);

	const outcomes: RouteOutcome[] = [];
	for (const route of o.routes) {
		let check = await o.check(route);
		await write(`-- ${route}: initial check ${check.ok ? 'green' : 'red'}\n`);
		if (check.ok) {
			say(`green          ${route} (already)`);
			outcomes.push({ route, outcome: 'already green', attempts: 0, summary: check.summary });
			continue;
		}
		let attempt = 0;
		while (!check.ok && attempt < o.attempts) {
			attempt++;
			say(`attempt ${attempt}/${o.attempts}  ${route}: running ${o.driver.binary}`);
			const run = await invoke(o, buildPrompt(o, route, check.summary, attempt));
			const exit = run.error ? `failed to start: ${run.error}` : run.signal ? `killed by ${run.signal}` : `exit ${run.code}`;
			await write(`-- ${route} attempt ${attempt}: ${o.driver.binary} ${exit} after ${(run.ms / 1000).toFixed(1)}s\n${run.output.replace(/^/gm, '   | ')}\n`);
			if (run.error) throw new Error(`could not start ${o.driver.binary}: ${run.error}`);
			const served = o.server ? await o.server.refresh() : { ok: true, output: '' };
			if (!served.ok) {
				await write(`-- ${route} attempt ${attempt}: ${served.output.replace(/\n/g, '\n   ! ')}\n`);
				check = { ok: false, summary: `The new app could not be served after your changes, so nothing was checked.\n${served.output}` };
				continue;
			}
			check = await o.check(route);
			await write(`-- ${route} attempt ${attempt}: check ${check.ok ? 'green' : 'red'}\n${check.ok ? '' : check.summary.replace(/^/gm, '   > ')}`);
		}
		const outcome: Outcome = check.ok ? 'green' : 'needs a human';
		say(`${outcome.padEnd(14)} ${route} after ${attempt} attempt(s)`);
		outcomes.push({ route, outcome, attempts: attempt, summary: check.summary });
	}
	await write(`== done: ${outcomes.map((r) => `${r.route} ${r.outcome}`).join(', ')}\n`);
	return outcomes;
}
