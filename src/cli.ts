#!/usr/bin/env node
import { createInterface } from 'node:readline/promises';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { AGENTS, detectAgents, type HostEnv, type ServerCommand } from './agents/registry.ts';
import { applySetup, describeChanges, planSetup } from './agents/setup.ts';
import { runCheck, writeReport } from './check/run.ts';
import { summarize } from './check/summary.ts';
import { plan, summarizeInventory, writeInventory } from './plan/inventory.ts';
import { readInventory, recordResults, STATE_DIR, status, summarizeStatus } from './status.ts';
import { VERSION } from './version.ts';

const USAGE = `markless-migrate ${VERSION}

  plan    --old <origin> [--source <path>] [--limit <n>]
          Inventory the old app's routes, SEO, assets and locales into .migrate/inventory.json.
  check   --old <origin> --new <origin> [--route <path>]... [--json]
          Compare routes old vs new (default: every route in the inventory). Exits 1 when any is red.
  status  Show which routes are green, red or not checked yet.
  setup   [--agent <id>]... [--yes] [--dry-run]
          Register the MCP server and install the migration skill for your coding agents.
          Agents: ${AGENTS.map((a) => a.id).join(', ')}.
  mcp     Run the MCP server on stdio (started by your agent).
  switch  Not yet: move a green route from the pass-through to Markless.
  run     Not yet: drive your agent's own CLI route by route until every route is green.
`;

const out = (text: string) => process.stdout.write(text);
const err = (text: string) => process.stderr.write(text);

function fail(message: string): never {
	err(`markless-migrate: ${message}\n`);
	process.exit(2);
}

function serverCommand(): ServerCommand {
	const cli = fileURLToPath(import.meta.url);
	if (cli.includes('/_npx/')) return { command: 'npx', args: ['-y', `@markless/migrate@${VERSION}`, 'mcp'] };
	return { command: process.execPath, args: [cli, 'mcp'] };
}

async function confirm(question: string): Promise<boolean> {
	const rl = createInterface({ input: process.stdin, output: process.stderr });
	try {
		return /^y(es)?$/i.test((await rl.question(question)).trim());
	} finally {
		rl.close();
	}
}

async function setup(args: string[]): Promise<number> {
	const { values } = parseArgs({ args, options: { agent: { type: 'string', multiple: true }, yes: { type: 'boolean' }, 'dry-run': { type: 'boolean' } } });
	const host: HostEnv = { home: process.env.HOME || homedir(), env: process.env };
	const detected = await detectAgents(host);
	let ids = values.agent ?? [];
	if (!ids.length) {
		if (!detected.length) {
			out(`No supported agent found. Name one with --agent <id> (${AGENTS.map((a) => a.id).join(', ')}).\n`);
			return 1;
		}
		ids = detected.map((d) => d.agent.id);
		out(`Found: ${detected.map((d) => `${d.agent.label} (${d.evidence[0]})`).join(', ')}\n\n`);
	}
	const changes = await planSetup(host, ids, serverCommand());
	out(`Planned changes:\n${describeChanges(changes, host.home)}\n`);
	if (changes.some((c) => c.action === 'blocked')) {
		out('Setup is blocked by the files marked "blocked" above. Nothing was written.\n');
		return 1;
	}
	if (changes.every((c) => c.action === 'unchanged')) {
		out('Everything is already set up.\n');
		return 0;
	}
	if (values['dry-run']) return 0;
	if (!values.yes) {
		if (!process.stdin.isTTY || !process.stderr.isTTY) {
			out('Not applied: re-run with --yes to apply these changes.\n');
			return 1;
		}
		if (!(await confirm('Apply these changes? Existing files are backed up first. [y/N] '))) {
			out('Cancelled. Nothing was written.\n');
			return 0;
		}
	}
	for (const { change, backup } of await applySetup(changes)) {
		if (change.action !== 'unchanged') out(`  wrote ${change.path}${backup ? ` (backup: ${backup})` : ''}\n`);
	}
	out('\nDone. Restart your agents so they load the markless-migrate server and skill.\n');
	return 0;
}

async function main(argv: string[]): Promise<number> {
	const [command, ...rest] = argv;
	const cwd = process.cwd();
	switch (command) {
		case undefined:
		case 'help':
		case '--help':
		case '-h':
			out(USAGE);
			return 0;
		case 'plan': {
			const { values } = parseArgs({ args: rest, options: { old: { type: 'string' }, source: { type: 'string' }, limit: { type: 'string' } } });
			if (!values.old) fail('plan needs --old <origin>');
			const inventory = await plan({ origin: values.old, source: values.source ? resolve(values.source) : undefined, limit: values.limit ? Number(values.limit) : undefined });
			const path = await writeInventory(inventory, join(cwd, STATE_DIR));
			out(`${summarizeInventory(inventory)}Wrote ${path}\n`);
			return 0;
		}
		case 'check': {
			const { values } = parseArgs({ args: rest, options: { old: { type: 'string' }, new: { type: 'string' }, route: { type: 'string', multiple: true }, json: { type: 'boolean' } } });
			if (!values.old || !values.new) fail('check needs --old <origin> and --new <origin>');
			const routes = values.route?.length ? values.route : (await readInventory(cwd))?.routes.map((r) => r.route);
			if (!routes?.length) fail('no routes: pass --route <path> or run plan first');
			const report = await runCheck({ oldOrigin: values.old, newOrigin: values.new, routes });
			const path = await writeReport(report, join(cwd, STATE_DIR));
			await recordResults(cwd, report);
			out(values.json ? `${JSON.stringify({ ...report, routes: report.routes.map(({ visualDiffs: _, ...r }) => r) }, null, 2)}\n` : `${summarize(report)}Report: ${path}\n`);
			return report.ok ? 0 : 1;
		}
		case 'status':
			out(summarizeStatus(await status(cwd)));
			return 0;
		case 'setup':
			return setup(rest);
		case 'mcp': {
			const { serveStdio } = await import('./mcp/server.ts');
			await serveStdio(cwd);
			return -1;
		}
		case 'switch':
		case 'run':
			err(`markless-migrate ${command}: not yet. See docs/plan.md for the build order.\n`);
			return 1;
		default:
			err(`Unknown command "${command}".\n\n${USAGE}`);
			return 2;
	}
}

const code = await main(process.argv.slice(2)).catch((error: unknown) => {
	err(`markless-migrate: ${error instanceof Error ? error.message : String(error)}\n`);
	return 1;
});
if (code >= 0) process.exitCode = code;
