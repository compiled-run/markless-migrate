#!/usr/bin/env node
import { createInterface } from 'node:readline/promises';
import { dirname, join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { AGENTS, detectAgents, findBinary, type HostEnv, type ServerCommand } from './agents/registry.ts';
import { applySetup, describeChanges, planSetup } from './agents/setup.ts';
import { openFile } from './check/open.ts';
import { DATA_DIR } from './check/data.ts';
import { RECORDER, recorderEnv } from './check/recorder.ts';
import { jsonReport, runCheck, writeReport, type CheckOptions } from './check/run.ts';
import { loadSourceFacts } from './check/source-facts.ts';
import { summarize } from './check/summary.ts';
import { plan, summarizeInventory, writeInventory } from './plan/inventory.ts';
import { DRIVERS, driver } from './run/drivers.ts';
import { runRoutes } from './run/loop.ts';
import { readInventory, recordResults, STATE_DIR, status, summarizeStatus } from './status.ts';
import { VERSION } from './version.ts';

const USAGE = `markless-migrate ${VERSION}

  plan    --old <origin> [--source <path>] [--limit <n>]
          Inventory the old app's routes, SEO, assets and locales into .migrate/inventory.json.
  check   --old <origin> --new <origin> [--route <path>]... [--json] [--open]
          [--source <path>] [--data record|replay] [--staging] [--block <host>]... [--allow <host>]...
          [--no-freeze] [--time <iso>] [--seed <n>] [--timezone <tz>] [--locale <tag>]
          Compare routes old vs new (default: every route in the inventory). Exits 1 when any is red.
          Writes .migrate/report.json and .migrate/report.html; --open opens the HTML report.
          Pages load with a fixed clock, seeded randomness, a fixed timezone and locale, and trackers
          blocked. --source scans the old app's code for what varies and which handlers write.
          --data record saves what OLD fetched per route in .migrate/data/; --data replay serves it to
          both apps. Writes (form posts, non-GET requests) are sent only when both origins are on this
          machine or --staging; otherwise they are held back and compared unsent.
  recorder
          Print the NODE_OPTIONS that loads the request recorder into a Node server, so check compares
          what the server fetches while rendering and can replay recorded data to it.
  status  Show which routes are green, red or not checked yet.
  setup   [--agent <id>]... [--yes] [--dry-run]
          Register the MCP server and install the migration skill for your coding agents.
          Agents: ${AGENTS.map((a) => a.id).join(', ')}.
  mcp     Run the MCP server on stdio (started by your agent).
  switch  Not yet: move a green route from the pass-through to Markless.
  run     --agent <id> --old <origin> --new <origin> [--route <path>]... [--attempts <n>] [--model <name>]
          Drive your agent's own CLI headless, one route at a time, until each route is green or
          needs a human after n attempts (default 3). Logs to .migrate/run.log.
          Agents: ${DRIVERS.map((d) => d.id).join(', ')}.
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

async function run(args: string[], cwd: string): Promise<number> {
	const { values } = parseArgs({
		args,
		options: { agent: { type: 'string' }, old: { type: 'string' }, new: { type: 'string' }, route: { type: 'string', multiple: true }, routes: { type: 'string' }, attempts: { type: 'string' }, model: { type: 'string' } },
	});
	if (!values.agent) fail(`run needs --agent <id> (${DRIVERS.map((d) => d.id).join(', ')})`);
	if (!values.old || !values.new) fail('run needs --old <origin> and --new <origin>');
	const attempts = values.attempts ? Number(values.attempts) : 3;
	if (!Number.isInteger(attempts) || attempts < 1) fail('--attempts must be a whole number of at least 1');
	const agent = driver(values.agent);
	if (!(await findBinary(agent.binary, { home: process.env.HOME || homedir(), env: process.env }))) fail(`${agent.binary} is not on PATH; install it and sign in first`);
	const named = [...(values.route ?? []), ...(values.routes?.split(',').map((r) => r.trim()).filter(Boolean) ?? [])];
	const routes = named.length ? named : (await readInventory(cwd))?.routes.map((r) => r.route);
	if (!routes?.length) fail('no routes: pass --route <path> or run plan first');
	const { old, new: next } = values;
	const outcomes = await runRoutes({
		cwd,
		driver: agent,
		old,
		new: next,
		routes,
		attempts,
		model: values.model,
		cli: [serverCommand().command, ...serverCommand().args.slice(0, -1)].join(' '),
		progress: out,
		check: async (route) => {
			const report = await runCheck({ oldOrigin: old, newOrigin: next, routes: [route] });
			await writeReport(report, join(cwd, STATE_DIR));
			await recordResults(cwd, report);
			return { ok: report.ok, summary: summarize(report) };
		},
	});
	const human = outcomes.filter((o) => o.outcome === 'needs a human');
	out(`\n${outcomes.length - human.length} of ${outcomes.length} routes green.${human.length ? ` Needs a human: ${human.map((o) => o.route).join(', ')}.` : ''} Log: ${join(cwd, STATE_DIR, 'run.log')}\n`);
	return human.length ? 1 : 0;
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
			const { values } = parseArgs({
				args: rest,
				options: {
					old: { type: 'string' },
					new: { type: 'string' },
					route: { type: 'string', multiple: true },
					json: { type: 'boolean' },
					open: { type: 'boolean' },
					source: { type: 'string' },
					data: { type: 'string' },
					staging: { type: 'boolean' },
					block: { type: 'string', multiple: true },
					allow: { type: 'string', multiple: true },
					'no-freeze': { type: 'boolean' },
					time: { type: 'string' },
					seed: { type: 'string' },
					timezone: { type: 'string' },
					locale: { type: 'string' },
				},
			});
			if (!values.old || !values.new) fail('check needs --old <origin> and --new <origin>');
			if (values.data && values.data !== 'record' && values.data !== 'replay') fail('--data must be record or replay');
			const time = values.time ? Date.parse(values.time) : undefined;
			if (time !== undefined && Number.isNaN(time)) fail('--time must be a date, for example 2026-01-15T12:00:00Z');
			const seed = values.seed ? Number(values.seed) : undefined;
			if (seed !== undefined && !Number.isInteger(seed)) fail('--seed must be a whole number');
			const inventory = await readInventory(cwd);
			const routes = values.route?.length ? values.route : inventory?.routes.map((r) => r.route);
			if (!routes?.length) fail('no routes: pass --route <path> or run plan first');
			let source: CheckOptions['source'];
			if (values.source) {
				const scanned = await loadSourceFacts(resolve(values.source));
				if (scanned.error) err(`markless-migrate: --source ignored: ${scanned.error}\n`);
				source = scanned.facts;
			}
			const freeze = values['no-freeze'] ? false : { ...(time !== undefined ? { time } : {}), ...(seed !== undefined ? { seed } : {}), ...(values.timezone ? { timezone: values.timezone } : {}), ...(values.locale ? { locale: values.locale } : {}) };
			const report = await runCheck({
				oldOrigin: values.old,
				newOrigin: values.new,
				routes,
				locales: inventory?.locales,
				freeze,
				block: { add: values.block ?? [], allow: values.allow ?? [] },
				...(values.staging ? { staging: { old: true, new: true } } : {}),
				...(source ? { source } : {}),
				...(values.data ? { data: { mode: values.data as 'record' | 'replay', dir: join(cwd, STATE_DIR, DATA_DIR) } } : {}),
			});
			const path = await writeReport(report, join(cwd, STATE_DIR));
			await recordResults(cwd, report);
			const html = join(dirname(path), 'report.html');
			out(values.json ? `${JSON.stringify(jsonReport(report), null, 2)}\n` : `${summarize(report)}Report: ${path}\nVisual report: ${html}\n`);
			if (values.open) await openFile(html);
			return report.ok ? 0 : 1;
		}
		case 'status':
			out(summarizeStatus(await status(cwd)));
			return 0;
		case 'recorder':
			out(`Start each Node server (old and new) with the request recorder loaded:\n\n  export NODE_OPTIONS="${recorderEnv().NODE_OPTIONS}"\n\nIt records what the server fetches while rendering each page check loads (fetch: method, URL, body and response; node:http and node:https: method, URL and status), and serves recordings on --data replay. It answers loopback callers only; set MARKLESS_MIGRATE_TOKEN in both the server and check environments to reach a remote server.\nModule: ${RECORDER.pathname}\n`);
			return 0;
		case 'setup':
			return setup(rest);
		case 'mcp': {
			const { serveStdio } = await import('./mcp/server.ts');
			await serveStdio(cwd);
			return -1;
		}
		case 'run':
			return run(rest, cwd);
		case 'switch':
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
