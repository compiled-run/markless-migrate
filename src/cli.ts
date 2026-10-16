#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline/promises';
import { dirname, join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { AGENTS, detectAgents, findBinary, type HostEnv, type ServerCommand } from './agents/registry.ts';
import { applySetup, describeChanges, planSetup } from './agents/setup.ts';
import { openFile } from './check/open.ts';
import { readAuthFile } from './check/auth.ts';
import { bypassOptions } from './check/blocked.ts';
import { DATA_DIR } from './check/data.ts';
import { RECORDER, recorderEnv } from './check/recorder.ts';
import { jsonReport, runCheck, writeReport, type CheckOptions } from './check/run.ts';
import { loadSourceFacts } from './check/source-facts.ts';
import { summarize } from './check/summary.ts';
import { defaultEnv } from './check/browser.ts';
import { discoverEndpoints, redirectTargets, UNKNOWN_PATH } from './check/endpoints.ts';
import { readSamples, routeTargets } from './plan/routes.ts';
import { writeStarterAuth } from './plan/auth.ts';
import { plan, summarizeInventory, writeInventory } from './plan/inventory.ts';
import { copiedLogin, DRIVERS, driver } from './run/drivers.ts';
import { startAppServer } from './run/server.ts';
import { runRoutes } from './run/loop.ts';
import { readInventory, recordResults, STATE_DIR, status, summarizeStatus } from './status.ts';
import { VERSION } from './version.ts';
import { nitroSnippet, notServedBy, pageAssets, vercelConfig } from './switch/deploy.ts';
import { startProxy } from './switch/proxy.ts';
import { readSwitched, switchRoute, unswitchRoute } from './switch/state.ts';
import { ACCEPTED_FILE, acceptFailure, readAccepted, writeAccepted } from './check/accepted.ts';
import type { RouteState } from './status.ts';

const USAGE = `markless-migrate ${VERSION}

  plan    --old <origin> [--source <path>] [--limit <n>]
          Inventory the old app's routes, SEO, assets and locales into .migrate/inventory.json.
          With --source, auth guards propose roles and the login route in a starter .migrate/auth.json.
  check   --old <origin> --new <origin> [--route <path>]... [--json] [--open]
          [--source <path>] [--data record|replay] [--staging] [--block <host>]... [--allow <host>]...
          [--no-freeze] [--time <iso>] [--seed <n>] [--timezone <tz>] [--locale <tag>]
          [--auth <file>] [--header <name:value>]... [--cookie <name=value>]... [--user-agent <ua>]
          [--all] [--allow-unchecked] [--new-source <path>]
          Compare routes old vs new (default: every route in the inventory). Exits 1 when any is red.
          --all adds every route the source scan knows (dynamic segments filled from crawled paths or
          .migrate/samples.json; check exits 1 while any is left unchecked, unless --allow-unchecked),
          a path no app has (the not-found page), redirects (the config's own and the other
          trailing-slash form of every page, compared by status and redirect chain) and the non-page endpoints: robots.txt, sitemaps, feeds, the manifest,
          /.well-known files and JSON route handlers, compared as data.
          --source and --new-source map each failing element to its old and new source file and line.
          Writes .migrate/report.json and .migrate/report.html; --open opens the HTML report.
          Pages load with a fixed clock, seeded randomness, a fixed timezone and locale, and trackers
          blocked. --source scans the old app's code for what varies and which handlers write.
          --data record saves what OLD fetched per route in .migrate/data/; --data replay serves it to
          both apps. Writes (form posts, non-GET requests) are sent only when both origins are on this
          machine or --staging; otherwise they are held back and compared unsent.
          --auth names roles (a login script or a Playwright storage state file each, see plan's
          .migrate/auth.json); every route is checked once per role and once anonymous. A route a bot
          wall answers is stopped as blocked; --header and --cookie send a bypass token to both apps.
  accept  <failure-id> --reason <why> [--by <name>]
          Record a failure as an intended difference in .migrate/accepted.json: from then on it shows as
          accepted (with the reason), not red. For a human only; ids are printed with every failure.
  recorder
          Print the NODE_OPTIONS that loads the request recorder into a Node server, so check compares
          what the server fetches while rendering and can replay recorded data to it.
  status  Show which routes are green, red or not checked yet.
  setup   [--agent <id>]... [--yes] [--dry-run]
          Register the MCP server and install the migration skill for your coding agents.
          Agents: ${AGENTS.map((a) => a.id).join(', ')}.
  mcp     Run the MCP server on stdio (started by your agent).
  switch  <route> [--force <reason>]
          Serve a route from the new app: refused unless its last check (every role) is green; --force
          switches anyway and records the reason in .migrate/switched.json. A route may be a pattern
          (/blog/:slug, /docs/*rest).
  unswitch <route>
          Send a route back to the old app.
  proxy   --old <origin> --new <origin> [--port <n>] [--host <addr>]
          One origin in front of both apps: switched routes from NEW, everything else from OLD, with
          method, body, headers and cookies passed through, redirects to either app pointed back at the
          proxy, cookie Domains that would not apply dropped, and each asset taken from the app that
          served the page it was loaded from (falling back to the other app).
  config  --old <deployment> --new <deployment> [--vercel <file>] [--nitro <file>]
          Production routing for the switched routes: a vercel.json (switched routes and the assets
          their pages load to NEW, the rest to OLD) and Nitro routeRules for the Markless app in front
          (every inventoried route and asset not switched yet proxied to OLD).
  run     --agent <id> --old <origin> --new <origin> [--route <path>]... [--all] [--attempts <n>] [--model <name>]
          [--source <path>] [--new-source <path>] [--auth <file>] [--header <name:value>]... [--cookie <name=value>]...
          [--serve <command>] [--build <command>] [--restart-on <path>]
          Drive your agent's own CLI headless, one route at a time, until each route is green or
          needs a human after n attempts (default 3). Logs to .migrate/run.log. Each route is checked
          with the same --source, --new-source, --auth and bypass flags as check (--all as in check),
          and the prompt names them. --serve makes run own the new app's server: it runs --build and
          restarts the server after every attempt and waits until --new answers; with --restart-on it
          also restarts whenever that file changes, so the agent's own builds are served.
          It passes the MCP server to codex and claude on the command line and refuses a CODEX_HOME
          that holds a copy of ~/.codex/auth.json (refresh tokens are single-use).
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
		options: {
			agent: { type: 'string' },
			old: { type: 'string' },
			new: { type: 'string' },
			route: { type: 'string', multiple: true },
			routes: { type: 'string' },
			attempts: { type: 'string' },
			model: { type: 'string' },
			source: { type: 'string' },
			'new-source': { type: 'string' },
			auth: { type: 'string' },
			all: { type: 'boolean' },
			header: { type: 'string', multiple: true },
			cookie: { type: 'string', multiple: true },
			serve: { type: 'string' },
			build: { type: 'string' },
			'restart-on': { type: 'string' },
		},
	});
	if (!values.agent) fail(`run needs --agent <id> (${DRIVERS.map((d) => d.id).join(', ')})`);
	if (!values.old || !values.new) fail('run needs --old <origin> and --new <origin>');
	const attempts = values.attempts ? Number(values.attempts) : 3;
	if (!Number.isInteger(attempts) || attempts < 1) fail('--attempts must be a whole number of at least 1');
	if ((values.build || values['restart-on']) && !values.serve) fail('--build and --restart-on need --serve <command>, the command that serves the new app');
	const agent = driver(values.agent);
	const home = process.env.HOME || homedir();
	if (!(await findBinary(agent.binary, { home, env: process.env }))) fail(`${agent.binary} is not on PATH; install it and sign in first`);
	const copied = await copiedLogin(agent.id, process.env, home);
	if (copied) fail(copied);
	let bypass: ReturnType<typeof bypassOptions> = {};
	try {
		bypass = bypassOptions(values.header, values.cookie);
	} catch (error) {
		fail((error as Error).message);
	}
	const auth = values.auth ? await readAuthFile(values.auth).catch((error: Error) => fail(error.message)) : undefined;
	const source = values.source ? resolve(values.source) : undefined;
	const newSource = values['new-source'] ? resolve(values['new-source']) : undefined;
	const facts = source ? (await loadSourceFacts(source)).facts : undefined;
	const named = [...(values.route ?? []), ...(values.routes?.split(',').map((r) => r.trim()).filter(Boolean) ?? [])];
	const inventory = await readInventory(cwd);
	let routes = named.length ? named : inventory?.routes.map((r) => r.route);
	let unchecked: CheckOptions['unchecked'] = [];
	let redirects = new Set<string>();
	if (values.all) {
		if (!inventory) fail('run --all needs .migrate/inventory.json: run plan first');
		const all = routeTargets(inventory, await readSamples(join(cwd, STATE_DIR)));
		redirects = new Set(redirectTargets(all.pages, inventory.source?.redirects));
		routes = [...new Set([...named, ...all.pages, UNKNOWN_PATH, ...(await discoverEndpoints(defaultEnv(values.old, bypass), all.pages, all.endpoints)), ...redirects])];
		unchecked = all.needsSample;
	}
	if (!routes?.length) fail('no routes: pass --route <path> or run plan first');
	const { old, new: next } = values;
	const server = values.serve ? await startAppServer({ cwd, serve: values.serve, ...(values.build ? { build: values.build } : {}), ...(values['restart-on'] ? { restartOn: values['restart-on'] } : {}), origin: next, log: (line) => out(`server: ${line}\n`) }).catch((error: Error) => fail(error.message)) : undefined;
	const mcp = serverCommand();
	try {
		const outcomes = await runRoutes({
			cwd,
			driver: agent,
			old,
			new: next,
			routes,
			attempts,
			model: values.model,
			cli: [mcp.command, ...mcp.args.slice(0, -1)].join(' '),
			mcp,
			context: { ...(source ? { source } : {}), ...(newSource ? { newSource } : {}), ...(values.auth ? { auth: resolve(values.auth) } : {}), flags: [...(values.header ?? []).flatMap((h) => ['--header', h]), ...(values.cookie ?? []).flatMap((c) => ['--cookie', c])] },
			...(server ? { server, serving: { ...(values.build ? { build: values.build } : {}), ...(values['restart-on'] ? { restartOn: values['restart-on'] } : {}) } } : {}),
			progress: out,
			check: async (route) => {
				const report = await runCheck({
					oldOrigin: old,
					newOrigin: next,
					routes: redirects.has(route) ? [] : [route],
					...(redirects.has(route) ? { redirects: [route] } : {}),
					locales: inventory?.locales,
					accepted: await readAccepted(join(cwd, STATE_DIR, ACCEPTED_FILE)),
					...(facts ? { source: facts } : {}),
					...(source || newSource ? { sourceDirs: { ...(source ? { old: source } : {}), ...(newSource ? { new: newSource } : {}) } } : {}),
					...(auth ? { auth, authStateDir: join(cwd, STATE_DIR, 'auth') } : {}),
					...bypass,
				});
				await writeReport(report, join(cwd, STATE_DIR));
				await recordResults(cwd, report);
				return { ok: report.ok, summary: summarize(report) };
			},
		});
		const human = outcomes.filter((o) => o.outcome === 'needs a human');
		const left = unchecked?.length ? ` Not checked, needs a sample: ${unchecked.map((u) => u.route).join(', ')}.` : '';
		out(`\n${outcomes.length - human.length} of ${outcomes.length} routes green.${human.length ? ` Needs a human: ${human.map((o) => o.route).join(', ')}.` : ''}${left} Log: ${join(cwd, STATE_DIR, 'run.log')}\n`);
		return human.length || unchecked?.length ? 1 : 0;
	} finally {
		await server?.stop();
	}
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
			const authPath = join(cwd, STATE_DIR, 'auth.json');
			if (inventory.auth) out((await writeStarterAuth(authPath, inventory.auth)) ? `Wrote ${authPath}: set the credentials it names in the environment, check its login steps, then pass --auth ${authPath} to check.\n` : `Kept ${authPath} (already there); roles found: ${Object.keys(inventory.auth.roles).join(', ')}.\n`);
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
					auth: { type: 'string' },
					header: { type: 'string', multiple: true },
					cookie: { type: 'string', multiple: true },
					'user-agent': { type: 'string' },
					all: { type: 'boolean' },
					'allow-unchecked': { type: 'boolean' },
					'new-source': { type: 'string' },
				},
			});
			if (!values.old || !values.new) fail('check needs --old <origin> and --new <origin>');
			let bypass: ReturnType<typeof bypassOptions> = {};
			try {
				bypass = bypassOptions(values.header, values.cookie);
			} catch (error) {
				fail((error as Error).message);
			}
			const auth = values.auth ? await readAuthFile(values.auth).catch((error: Error) => fail(error.message)) : undefined;
			if (values.data && values.data !== 'record' && values.data !== 'replay') fail('--data must be record or replay');
			const time = values.time ? Date.parse(values.time) : undefined;
			if (time !== undefined && Number.isNaN(time)) fail('--time must be a date, for example 2026-01-15T12:00:00Z');
			const seed = values.seed ? Number(values.seed) : undefined;
			if (seed !== undefined && !Number.isInteger(seed)) fail('--seed must be a whole number');
			const inventory = await readInventory(cwd);
			let routes = values.route?.length ? values.route : inventory?.routes.map((r) => r.route);
			let targets: { endpoints: string[]; unchecked: CheckOptions['unchecked']; redirects: string[] } | undefined;
			if (values.all) {
				if (!inventory) fail('check --all needs .migrate/inventory.json: run plan first');
				const all = routeTargets(inventory, await readSamples(join(cwd, STATE_DIR)));
				routes = [...new Set([...(values.route ?? []), ...all.pages, UNKNOWN_PATH])];
				targets = { endpoints: await discoverEndpoints(defaultEnv(values.old), all.pages, all.endpoints), unchecked: all.needsSample, redirects: redirectTargets(all.pages, inventory.source?.redirects) };
			}
			if (!routes?.length && !targets?.endpoints.length) fail('no routes: pass --route <path> or run plan first');
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
				routes: routes ?? [],
				locales: inventory?.locales,
				freeze,
				block: { add: values.block ?? [], allow: values.allow ?? [] },
				...(values.staging ? { staging: { old: true, new: true } } : {}),
				...(source ? { source } : {}),
				...(values.data ? { data: { mode: values.data as 'record' | 'replay', dir: join(cwd, STATE_DIR, DATA_DIR) } } : {}),
				...bypass,
				...(values['user-agent'] ? { userAgent: values['user-agent'] } : {}),
				...(auth ? { auth, authStateDir: join(cwd, STATE_DIR, 'auth') } : {}),
				...(targets ? { endpoints: targets.endpoints, unchecked: targets.unchecked, redirects: targets.redirects } : {}),
				...(values.source || values['new-source'] ? { sourceDirs: { ...(values.source ? { old: resolve(values.source) } : {}), ...(values['new-source'] ? { new: resolve(values['new-source']) } : {}) } } : {}),
				accepted: await readAccepted(join(cwd, STATE_DIR, ACCEPTED_FILE)).catch((error: Error) => fail(error.message)),
			});
			const path = await writeReport(report, join(cwd, STATE_DIR));
			await recordResults(cwd, report);
			const html = join(dirname(path), 'report.html');
			out(values.json ? `${JSON.stringify(jsonReport(report), null, 2)}\n` : `${summarize(report)}Report: ${path}\nVisual report: ${html}\n`);
			if (values.open) await openFile(html);
			if (report.ok && report.unchecked?.length && !values['allow-unchecked']) {
				err(`markless-migrate: ${report.unchecked.length} route${report.unchecked.length === 1 ? '' : 's'} not checked for want of a sample value; add them to .migrate/samples.json, or pass --allow-unchecked.\n`);
				return 1;
			}
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
		case 'accept': {
			const { values, positionals } = parseArgs({ args: rest, allowPositionals: true, options: { reason: { type: 'string' }, by: { type: 'string' } } });
			if (positionals.length !== 1) fail('accept needs one failure id, as printed in [brackets] after a failure');
			if (!values.reason?.trim()) fail('accept needs --reason: why this difference is intended');
			const id = positionals[0]!;
			const results = JSON.parse(await readFile(join(cwd, STATE_DIR, 'results.json'), 'utf8').catch(() => '{}')) as Record<string, RouteState>;
			const found = Object.values(results).flatMap((r) => (r.failures ?? []).filter((f) => f.id === id).map((failure) => ({ failure, r })))[0];
			if (!found) fail(`no failure with id ${id} in ${join(STATE_DIR, 'results.json')}: run check first and copy an id from its output`);
			const path = join(cwd, STATE_DIR, ACCEPTED_FILE);
			const accepted = await readAccepted(path);
			if (accepted.some((a) => a.id === id)) {
				out(`${id} is already accepted.\n`);
				return 0;
			}
			const by = values.by ?? process.env.GIT_AUTHOR_NAME ?? process.env.USER ?? 'unknown';
			const entry = acceptFailure(found.failure, { old: found.r.old, new: found.r.new }, values.reason.trim(), by);
			await writeAccepted(path, [...accepted, entry]);
			out(`Accepted ${entry.route} ${entry.dimension}: ${entry.check} (${entry.reason}). ${path}\n`);
			return 0;
		}
		case 'switch': {
			const { values, positionals } = parseArgs({ args: rest, allowPositionals: true, options: { force: { type: 'string' } } });
			if (positionals.length !== 1) fail('switch needs one route, for example switch /about/');
			const outcome = await switchRoute(cwd, positionals[0]!, values.force !== undefined ? { force: values.force } : {});
			if (!outcome.ok) {
				err(`markless-migrate: ${outcome.reason}\n`);
				return 1;
			}
			out(`${outcome.already ? 'Still switched' : 'Switched'} ${outcome.entry.route} to the new app${outcome.entry.forced ? ` (forced: ${outcome.entry.forced.reason}; last check ${outcome.entry.checks.join('; ') || 'none'})` : ''}. ${outcome.path}\n`);
			return 0;
		}
		case 'unswitch': {
			const { positionals } = parseArgs({ args: rest, allowPositionals: true, options: {} });
			if (positionals.length !== 1) fail('unswitch needs one route');
			const { removed, path } = await unswitchRoute(cwd, positionals[0]!);
			out(removed ? `${positionals[0]} goes to the old app again. ${path}\n` : `${positionals[0]} was not switched.\n`);
			return 0;
		}
		case 'proxy': {
			const { values } = parseArgs({ args: rest, options: { old: { type: 'string' }, new: { type: 'string' }, port: { type: 'string' }, host: { type: 'string' }, quiet: { type: 'boolean' } } });
			if (!values.old || !values.new) fail('proxy needs --old <origin> and --new <origin>');
			const port = values.port ? Number(values.port) : 4300;
			if (!Number.isInteger(port) || port < 0) fail('--port must be a whole number');
			const proxy = await startProxy({ old: values.old, new: values.new, port, host: values.host ?? '127.0.0.1', switched: async () => (await readSwitched(cwd)).routes.map((r) => r.route), ...(values.quiet ? {} : { log: (line: string) => out(`${line}\n`) }) });
			const switched = (await readSwitched(cwd)).routes.map((r) => r.route);
			out(`${proxy.origin}\nSwitched to NEW (${values.new}): ${switched.join(', ') || 'none yet'}; everything else from OLD (${values.old}).\n`);
			return -1;
		}
		case 'config': {
			const { values } = parseArgs({ args: rest, options: { old: { type: 'string' }, new: { type: 'string' }, vercel: { type: 'string' }, nitro: { type: 'string' } } });
			if (!values.old || !values.new) fail('config needs --old <deployment> and --new <deployment>');
			const switched = (await readSwitched(cwd)).routes.map((r) => r.route);
			const inventory = await readInventory(cwd);
			const concrete = switched.filter((r) => !/[:*]/.test(r));
			const newAssets = await notServedBy(values.old, await pageAssets(values.new, concrete));
			const oldPaths = [...new Set(inventory?.routes.flatMap((r) => r.assets.map((a) => a.url)).filter((u) => u.startsWith('/')) ?? [])].sort();
			const oldAssets = await notServedBy(values.new, oldPaths);
			const input = { old: values.old, new: values.new, switched, newAssets, oldAssets, oldRoutes: [...new Set([...(inventory?.routes.map((r) => r.route) ?? []), ...(inventory?.source?.routes.map((r) => r.path) ?? [])])] };
			const vercel = `${JSON.stringify(vercelConfig(input), null, '\t')}\n`;
			const nitro = nitroSnippet(input);
			if (values.vercel) await writeFile(values.vercel, vercel);
			if (values.nitro) await writeFile(values.nitro, nitro);
			if (!values.vercel && !values.nitro) out(`vercel.json:\n${vercel}\nNitro routeRules:\n${nitro}`);
			else out(`Wrote ${[values.vercel, values.nitro].filter(Boolean).join(' and ')} for ${switched.length} switched route${switched.length === 1 ? '' : 's'}.\n`);
			return 0;
		}
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
