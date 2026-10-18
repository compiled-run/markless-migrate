#!/usr/bin/env node
import { readOverrides, rulesOff } from './overrides.ts';
import { readFile, writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline/promises';
import { dirname, join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { AGENTS, detectAgents, findBinary, type HostEnv, type ServerCommand } from './agents/registry.ts';
import { applySetup, describeChanges, planSetup, undoSetup, writeUndo } from './agents/setup.ts';
import { renderStatusPage } from './check/html.ts';
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
import { runRoutes, summarizeRun } from './run/loop.ts';
import { acceptedLabel } from './check/automatic.ts';
import { readInventory, readResults, recordResults, STATE_DIR, status, summarizeStatus } from './status.ts';
import { changedSince, gitHead, selectChanged } from './check/changed.ts';
import { VERSION } from './version.ts';
import { buildAssets, nitroSnippet, notServedBy, pageAssets, vercelConfig } from './switch/deploy.ts';
import { startProxy } from './switch/proxy.ts';
import { AGENT_ENV, readSwitched, switchRoute, unswitchRoute } from './switch/state.ts';
import { ACCEPTED_FILE, acceptFailure, readAccepted, writeAccepted } from './check/accepted.ts';
import { decisionLine, LIBRARIES_FILE, planLibraries, readLibraries, summarizeParity, writeParity } from './library/index.ts';
import type { RouteState } from './status.ts';
import { CLI_CONFIG, CLI_REPORT, readCliConfig, runCliCheck, summarizeCli } from './check/cli/conform.ts';

const USAGE = `markless-migrate ${VERSION}

  plan    --old <origin> [--source <path>] [--limit <n>] [--header <name:value>]... [--cookie <name=value>]... [--user-agent <ua>]
          Inventory the old app's routes, SEO, assets and locales into .migrate/inventory.json.
          With --source, auth guards propose roles and the login route in a starter .migrate/auth.json,
          and every library the old app imports goes in .migrate/libraries.json: the exact surface used,
          each usage site, and whether it maps to @markless/ui, stays as-is, needs a port, or draws
          its own UI (a grid, chart or editor). For those, plan decides by measured rules whether to port
          the parts the app uses or to use the library directly, loaded when needed, and says why; a
          framework wrapper (ag-grid-react) is always ported. .migrate/overrides.json may change it.
          A webpack app's pages are what HtmlWebpackPlugin and CopyPlugin emit, linked to their entries.
  check   --old <origin> --new <origin> [--route <path>]... [--json] [--open]
          [--source <path>] [--data record|replay] [--staging] [--block <host>]... [--allow <host>]...
          [--no-freeze] [--time <iso>] [--seed <n>] [--timezone <tz>] [--locale <tag>]
          [--auth <file>] [--header <name:value>]... [--cookie <name=value>]... [--user-agent <ua>]
          [--all] [--allow-unchecked] [--new-source <path>] [--concurrency <n>] [--changed]
          [--journey-budget <seconds>] [--max-journeys <n>] [--timeout <seconds>]
          [--no-responsiveness] [--interaction-budget <ms>] [--cpu-throttle <rate>] [--interaction-controls <n>]
          Compare routes old vs new (default: every route in the inventory). Exits 1 when any is red.
          Every interactive element of the old page (including those a click reveals, such as a
          dialog's controls) must be used by a journey, or the route stays red: journeys are explored main content first (tables, forms), until each element is used or
          --journey-budget (default 120 s per route) runs out; --max-journeys caps their number. A
          control in a shared header, nav, sidebar or footer is exercised by the first route of the
          run that has it, and the others carry its result.
          --all adds every route the source scan knows (dynamic segments filled from crawled paths or
          .migrate/samples.json; check exits 1 while any is left unchecked, unless --allow-unchecked),
          a path no app has (the not-found page), redirects (the config's own and the other
          trailing-slash form of every page, compared by status and redirect chain) and the non-page endpoints: robots.txt, sitemaps, feeds, the manifest,
          /.well-known files and JSON route handlers, compared as data.
          Responsiveness: each control the journeys used and each internal link they followed is used
          once on a fresh page load, old then new, at desktop speed and on a phone-sized page with the
          CPU slowed (--cpu-throttle, default 4x). A first interaction must stay within max(16 ms, 10%)
          of the old app at both speeds, answer within --interaction-budget (default 200 ms) at the
          slow speed and fetch no code; a link must show the next page within max(16 ms, 10%) of the
          old app at the slow speed. --interaction-controls caps the controls timed per route (16).
          --no-responsiveness leaves it out.
          --source and --new-source map each failing element to its old and new source file and line.
          --concurrency checks that many routes at once (default half the cores, at most 4).
          --timeout stops one route's check after that many seconds (default 600, or five journey
          budgets when that is more). A page load that times out or cannot connect is tried again
          once, 2 s later; a route the network still fails, or that passes --timeout, is reported
          as not checked for an infrastructure failure (DNS, connection or timeout, named), not as
          red. check exits 3 when nothing is red but such a route was not checked.
          --changed checks only routes not green last time, and routes whose files in the new app
          (--new-source, else this directory) changed since the commit of their last check.
          Writes .migrate/report.json and .migrate/report.html; --open opens the HTML report.
          Pages load with a fixed clock, seeded randomness, a fixed timezone and locale, and trackers
          blocked. --source scans the old app's code for what varies and which handlers write.
          --data record saves what OLD fetched per route in .migrate/data/; --data replay serves it to
          both apps. Writes (form posts, non-GET requests) are sent only when both origins are on this
          machine or --staging; otherwise they are held back and compared unsent.
          --auth names roles (a login script or a Playwright storage state file each, see plan's
          .migrate/auth.json); every route is checked once per role and once anonymous. A route a bot
          wall answers is stopped as blocked; --header and --cookie send a bypass token to both apps.
  parity  <library> [--route <path>]... [--new-source <path>]
          Write a port skeleton for one library into lib/parity/<library>/ of the new app: exactly the
          components, props, hooks, options and fields the old app uses (narrowed to --route), plus
          behaviour.md and behaviour.json: what each usage site must do, and the recorded journeys that
          exercise it. Needs plan --source (it writes .migrate/libraries.json). Existing port files are kept.
  cli     [--config <file>] [--case <name>]... [--record] [--json]
          Compare the old and new command-line tool (default config .migrate/cli.json): each case runs
          the old tool twice and the new one once, each in fresh temporary directories with a clean
          environment and a temporary HOME, the case's files, args, env and stdin answers (each sent
          once its prompt shows). Exit codes, stdout and stderr, every file written (tree and
          contents) and every request made must match; paths, colours, durations, versions and
          timestamps are normalised, and what varied between the two old runs may vary. Node tools
          get their fetch answered from .migrate/cli-network/<case>.json; --record first runs the old
          tool against the real network to write it. Writes .migrate/cli-report.json; exits 1 when a
          case differs.
  accept  <failure-id> --reason <why> [--by <name>]
          Record a failure as an intended difference in .migrate/accepted.json: from then on it shows as
          accepted (with the reason), not red. An expert's tool, never needed to finish a migration;
          ids are printed with every failure. check also accepts on its own, labelled "accepted
          automatically", the old framework's scripts the new page no longer loads, markup the old
          framework adds for itself when the accessibility tree and announcements otherwise match,
          live content in a third-party embed both pages show, a control neither page lets a visitor
          use for the same reason, and storage keys only the old framework writes (htmx's history
          cache, Laravel's sealed cookies) when no journey differs (each rule may be turned off under
          "automatic" in .migrate/overrides.json).
  recorder
          Print the NODE_OPTIONS that loads the request recorder into a Node server, so check compares
          what the server fetches while rendering and can replay recorded data to it.
  status  Show every planned route as green, red, not ported or not checked yet, which are switched
          (and which were forced without proof), and whether the migration is done.
  setup   [--agent <id>]... [--dry-run] [--undo]
          Register the MCP server and install the migration skill for your coding agents. Applies
          straight away (running it is the request), backs up every file it changes and prints what
          changed. --dry-run only shows what it would change; --undo puts every file setup changed back
          as it was before setup first changed it. --yes is accepted and changes nothing.
          Agents: ${AGENTS.map((a) => a.id).join(', ')}.
  mcp     Run the MCP server on stdio (started by your agent).
  switch  <route> [--force --by <name> --reason <why>]
          Serve a route from the new app: refused unless its last check (every role) is green. --force
          is an expert override for a route that is not, with --by and --reason, or confirmed at a
          terminal; never from an agent that run drives. A forced route is recorded in .migrate/switched.json
          and shown in red as "forced, not proven" in status and the report. A route may be a pattern
          (/blog/:slug, /docs/*rest).
  unswitch <route>
          Send a route back to the old app.
  proxy   --old <origin> --new <origin> [--port <n>] [--host <addr>]
          One origin in front of both apps: switched routes from NEW, everything else from OLD, with
          method, body, headers and cookies passed through, redirects to either app pointed back at the
          proxy, cookie Domains that would not apply dropped, and each asset taken from the app that
          served the page it was loaded from (falling back to the other app).
  config  --old <deployment> --new <deployment> [--vercel <file>] [--nitro <file>] [--new-build <dir>] [--index <file>]
          Production routing for the switched routes: a vercel.json (switched routes and the assets
          their pages load to NEW, the rest to OLD) and Nitro routeRules for the Markless app in front
          (every inventoried route and asset not switched yet proxied to OLD). Every file of the new
          build (--new-build, default .output/public or .vercel/output/static) goes to NEW unless the
          old app serves that file itself; an SPA's index.html answer to every path does not count.
          --index writes the front door's status page: every planned route, what serves it, and what
          is not ported yet.
  run     --agent <id> --old <origin> --new <origin> [--route <path>]... [--all] [--attempts <n>] [--model <name>]
          [--source <path>] [--new-source <path>] [--auth <file>] [--header <name:value>]... [--cookie <name=value>]...
          [--serve <command>] [--build <command>] [--restart-on <path>]
          Drive your agent's own CLI headless, one route at a time, until each route is green or is
          left red after n attempts (default 3), then go on with the next; it never waits for an answer.
          It ends with one report: green routes, library decisions, automatic acceptances, and what to
          look at if you care. Logs to .migrate/run.log. Each route is checked
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

function journeyOptions(budget: string | undefined, max: string | undefined): NonNullable<CheckOptions['journeys']> {
	const seconds = budget === undefined ? undefined : Number(budget);
	if (seconds !== undefined && !(seconds > 0)) fail('--journey-budget must be a number of seconds above 0');
	const cap = max === undefined ? undefined : Number(max);
	if (cap !== undefined && (!Number.isInteger(cap) || cap < 1)) fail('--max-journeys must be a whole number of at least 1');
	return { ...(seconds !== undefined ? { budgetMs: seconds * 1000 } : {}), ...(cap !== undefined ? { maxJourneys: cap } : {}) };
}

function timeoutOption(value: string | undefined): { timeoutMs?: number } {
	if (value === undefined) return {};
	const seconds = Number(value);
	if (!(seconds > 0)) fail('--timeout must be a number of seconds above 0');
	return { timeoutMs: seconds * 1000 };
}

const TIMING_FLAGS = {
	'no-responsiveness': { type: 'boolean' },
	'interaction-budget': { type: 'string' },
	'cpu-throttle': { type: 'string' },
	'interaction-controls': { type: 'string' },
} as const;

function timingOptions(values: { 'no-responsiveness'?: boolean; 'interaction-budget'?: string; 'cpu-throttle'?: string; 'interaction-controls'?: string }): CheckOptions['responsiveness'] {
	if (values['no-responsiveness']) return undefined;
	const number = (flag: 'interaction-budget' | 'cpu-throttle' | 'interaction-controls', test: (n: number) => boolean, what: string) => {
		const raw = values[flag];
		if (raw === undefined) return undefined;
		const n = Number(raw);
		if (!test(n)) fail(`--${flag} must be ${what}`);
		return n;
	};
	const budgetMs = number('interaction-budget', (n) => n > 0, 'a number of milliseconds above 0');
	const cpu = number('cpu-throttle', (n) => n >= 1, 'a slowdown rate of at least 1');
	const maxControls = number('interaction-controls', (n) => Number.isInteger(n) && n >= 1, 'a whole number of at least 1');
	return { ...(budgetMs !== undefined ? { budgetMs } : {}), ...(cpu !== undefined ? { cpu } : {}), ...(maxControls !== undefined ? { maxControls } : {}) };
}

function timingFlags(values: Partial<Record<keyof typeof TIMING_FLAGS, string | boolean>>): string[] {
	return Object.keys(TIMING_FLAGS).flatMap((flag) => {
		const value = values[flag as keyof typeof TIMING_FLAGS];
		return value === undefined || value === false ? [] : value === true ? [`--${flag}`] : [`--${flag}`, value];
	});
}

async function firstDir(cwd: string, dirs: readonly string[]): Promise<string | undefined> {
	const { stat } = await import('node:fs/promises');
	for (const dir of dirs) if (await stat(join(cwd, dir)).then((s) => s.isDirectory(), () => false)) return dir;
	return undefined;
}

function serverCommand(): ServerCommand {
	const cli = fileURLToPath(import.meta.url);
	if (cli.includes('/_npx/')) return { command: 'npx', args: ['-y', `@markless/migrate@${VERSION}`, 'mcp'] };
	return { command: process.execPath, args: [cli, 'mcp'] };
}

/** A forced switch is an expert override: named with --by and --reason, or confirmed at a terminal. */
async function forceDecision(route: string, reason: string | undefined, by: string | undefined): Promise<{ reason: string; by: string }> {
	if (process.env[AGENT_ENV]) fail('switch --force is for a person: an agent run by markless-migrate run may not force a route');
	if (reason?.trim() && by?.trim()) return { reason: reason.trim(), by: by.trim() };
	if (!process.stdin.isTTY || !process.stderr.isTTY) fail('switch --force needs --by <name> and --reason <why> (or a terminal to confirm at): a forced route is served from the new app without proof that it works');
	const rl = createInterface({ input: process.stdin, output: process.stderr });
	try {
		err(`Forcing ${route} serves it from the new app although its check is not green. The report will show it as "forced, not proven".\n`);
		const why = reason?.trim() || (await rl.question('Why? ')).trim();
		const who = by?.trim() || (await rl.question('Your name: ')).trim();
		const typed = (await rl.question(`Type the route (${route}) to confirm: `)).trim();
		if (!why || !who || typed !== route) fail('not forced: a reason, a name and the route typed back are all needed');
		return { reason: why, by: who };
	} finally {
		rl.close();
	}
}

async function setup(args: string[]): Promise<number> {
	const { values } = parseArgs({ args, options: { agent: { type: 'string', multiple: true }, yes: { type: 'boolean' }, 'dry-run': { type: 'boolean' }, undo: { type: 'boolean' } } });
	const host: HostEnv = { home: process.env.HOME || homedir(), env: process.env };
	const tilde = (path: string) => (path.startsWith(host.home) ? `~${path.slice(host.home.length)}` : path);
	if (values.undo) {
		const undone = await undoSetup(host.home);
		if (!undone) {
			out('Nothing to undo: no setup has changed anything here.\n');
			return 0;
		}
		for (const u of undone) out(`  ${u.outcome.padEnd(9)} ${tilde(u.path)}\n`);
		out('\nUndone. Restart your agents so they drop the markless-migrate server and skill.\n');
		return undone.some((u) => u.outcome.startsWith('kept')) ? 1 : 0;
	}
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
	if (changes.some((c) => c.action === 'blocked')) {
		out(`${describeChanges(changes, host.home)}\nSetup is blocked by the files marked "blocked" above. Nothing was written.\n`);
		return 1;
	}
	if (changes.every((c) => c.action === 'unchanged')) {
		out(`${describeChanges(changes, host.home)}\nEverything is already set up.\n`);
		return 0;
	}
	if (values['dry-run']) {
		out(`Would change (nothing written):\n${describeChanges(changes, host.home)}`);
		return 0;
	}
	const applied = await applySetup(changes);
	out(`Changed:\n${describeChanges(changes, host.home)}`);
	for (const { change, backup } of applied) if (change.action !== 'unchanged') out(`  wrote ${tilde(change.path)}${backup ? ` (the file before: ${tilde(backup)})` : ' (new file)'}\n`);
	await writeUndo(host.home, applied);
	out('\nDone. Restart your agents so they load the markless-migrate server and skill.\nTo undo it: markless-migrate setup --undo\n');
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
			'journey-budget': { type: 'string' },
			'max-journeys': { type: 'string' },
			timeout: { type: 'string' },
			...TIMING_FLAGS,
		},
	});
	const deadline = timeoutOption(values.timeout);
	const journeys = journeyOptions(values['journey-budget'], values['max-journeys']);
	const timing = timingOptions(values);
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
	const automatic = new Map<string, string>();
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
			context: { ...(source ? { source } : {}), ...(newSource ? { newSource } : {}), ...(values.auth ? { auth: resolve(values.auth) } : {}), flags: [...(values.header ?? []).flatMap((h) => ['--header', h]), ...(values.cookie ?? []).flatMap((c) => ['--cookie', c]), ...(values['journey-budget'] ? ['--journey-budget', values['journey-budget']] : []), ...(values['max-journeys'] ? ['--max-journeys', values['max-journeys']] : []), ...timingFlags(values)] },
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
					automaticOff: rulesOff(await readOverrides(join(cwd, STATE_DIR))),
					...(facts ? { source: facts } : {}),
					...(source || newSource ? { sourceDirs: { ...(source ? { old: source } : {}), ...(newSource ? { new: newSource } : {}) } } : {}),
					...(auth ? { auth, authStateDir: join(cwd, STATE_DIR, 'auth') } : {}),
					...bypass,
					journeys,
					...deadline,
					...(timing ? { responsiveness: timing } : {}),
					switched: (await readSwitched(cwd)).routes.map((r) => r.route),
				});
				await recordResults(cwd, report);
				await writeReport(report, join(cwd, STATE_DIR), await status(cwd));
				const open = [...report.routes.flatMap((r) => r.failures), ...(report.logins ?? []).flatMap((l) => l.failures)].filter((f) => !f.accepted).map((f) => `${f.dimension}: ${f.check}${f.viewport ? ` (${f.viewport})` : ''}${f.id ? ` [${f.id}]` : ''}`);
				for (const f of report.routes.flatMap((r) => r.failures)) if (f.accepted?.automatic) automatic.set(`${f.route} ${f.dimension}: ${f.check}`, `${f.route} ${f.dimension}: ${f.check}, ${acceptedLabel(f.accepted)} (${f.accepted.reason})`);
				const network = report.routes.flatMap((r) => (r.infrastructure ? [r.infrastructure.message] : []));
				return { ok: report.ok, summary: summarize(report), open: [...new Set(open)], ...(network.length && !open.length ? { infrastructure: network.join('; ') } : {}) };
			},
		});
		const red = outcomes.filter((o) => o.outcome === 'left red');
		const libraries = (await readLibraries(join(cwd, STATE_DIR)))?.libraries.flatMap((l) => (l.decision ? [`${l.name}: ${decisionLine(l)}`] : [])) ?? [];
		out(`\n${summarizeRun(outcomes, { libraries, automatic: [...automatic.values()], needsSample: unchecked?.map((u) => u.route), log: join(cwd, STATE_DIR, 'run.log') })}`);
		return red.length || unchecked?.length ? 1 : outcomes.some((o) => o.outcome === 'not checked') ? 3 : 0;
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
			const { values } = parseArgs({ args: rest, options: { old: { type: 'string' }, source: { type: 'string' }, limit: { type: 'string' }, header: { type: 'string', multiple: true }, cookie: { type: 'string', multiple: true }, 'user-agent': { type: 'string' } } });
			if (!values.old) fail('plan needs --old <origin>');
			let bypass: ReturnType<typeof bypassOptions> = {};
			try {
				bypass = bypassOptions(values.header, values.cookie);
			} catch (error) {
				fail((error as Error).message);
			}
			const inventory = await plan({ origin: values.old, source: values.source ? resolve(values.source) : undefined, limit: values.limit ? Number(values.limit) : undefined, ...bypass, ...(values['user-agent'] ? { userAgent: values['user-agent'] } : {}) });
			const path = await writeInventory(inventory, join(cwd, STATE_DIR));
			out(`${summarizeInventory(inventory)}Wrote ${path}\n`);
			if (inventory.source) {
				const libraries = await planLibraries(inventory.source, join(cwd, STATE_DIR), cwd);
				out(`${libraries.text}Wrote ${libraries.path}\n`);
			}
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
					changed: { type: 'boolean' },
					concurrency: { type: 'string' },
					'new-source': { type: 'string' },
					'journey-budget': { type: 'string' },
					'max-journeys': { type: 'string' },
					timeout: { type: 'string' },
					...TIMING_FLAGS,
				},
			});
			const deadline = timeoutOption(values.timeout);
			if (!values.old || !values.new) fail('check needs --old <origin> and --new <origin>');
			const journeys = journeyOptions(values['journey-budget'], values['max-journeys']);
			const timing = timingOptions(values);
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
			const concurrency = values.concurrency ? Number(values.concurrency) : undefined;
			if (concurrency !== undefined && (!Number.isInteger(concurrency) || concurrency < 1)) fail('--concurrency must be a whole number of at least 1');
			const newDir = resolve(values['new-source'] ?? cwd);
			const commit = await gitHead(newDir);
			if (values.changed) {
				const previous = (await readResults(cwd)) ?? {};
				const picked = await selectChanged([...(routes ?? []), ...(targets?.endpoints ?? []), ...(targets?.redirects ?? [])], previous, (since) => changedSince(newDir, since));
				const keep = new Set(picked.check);
				routes = (routes ?? []).filter((r) => keep.has(r));
				if (targets) targets = { ...targets, endpoints: targets.endpoints.filter((r) => keep.has(r)), redirects: targets.redirects.filter((r) => keep.has(r)) };
				out(`--changed: ${picked.check.length} route${picked.check.length === 1 ? '' : 's'} to check, ${picked.skipped.length} green and unchanged since their last check${picked.skipped.length ? ` (${picked.skipped.join(', ')})` : ''}.\n`);
				if (!picked.check.length) return 0;
			}
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
				automaticOff: rulesOff(await readOverrides(join(cwd, STATE_DIR)).catch((error: Error) => fail(error.message))),
				...(concurrency ? { concurrency } : {}),
				journeys,
				...deadline,
				...(timing ? { responsiveness: timing } : {}),
				switched: (await readSwitched(cwd)).routes.map((r) => r.route),
				...(!values['new-source'] && !values.changed ? {} : { sourceDirs: { ...(values.source ? { old: resolve(values.source) } : {}), new: newDir } }),
			});
			await recordResults(cwd, report, commit ? { commit } : {});
			const path = await writeReport(report, join(cwd, STATE_DIR), await status(cwd));
			const html = join(dirname(path), 'report.html');
			out(values.json ? `${JSON.stringify(jsonReport(report), null, 2)}\n` : `${summarize(report)}Report: ${path}\nVisual report: ${html}\n`);
			if (values.open) await openFile(html);
			const needSample = report.unchecked?.filter((u) => !u.reason) ?? [];
			if (report.ok && needSample.length && !values['allow-unchecked']) {
				err(`markless-migrate: ${needSample.length} route${needSample.length === 1 ? '' : 's'} not checked for want of a sample value; add them to .migrate/samples.json, or pass --allow-unchecked.\n`);
				return 1;
			}
			if (report.ok) return 0;
			const red = report.routes.some((r) => !r.ok && !r.infrastructure) || (report.logins ?? []).some((l) => !l.ok);
			if (!red) err(`markless-migrate: nothing is red, but ${report.routes.filter((r) => r.infrastructure).length} route check(s) could not be done for an infrastructure failure; check them again.\n`);
			return red ? 1 : 3;
		}
		case 'status':
			out(summarizeStatus(await status(cwd)));
			return 0;
		case 'parity': {
			const { values, positionals } = parseArgs({ args: rest, allowPositionals: true, options: { route: { type: 'string', multiple: true }, 'new-source': { type: 'string' } } });
			if (positionals.length !== 1) fail('parity needs one library name, as plan lists it (for example parity recharts)');
			const libraries = await readLibraries(join(cwd, STATE_DIR));
			if (!libraries) fail(`no ${join(STATE_DIR, LIBRARIES_FILE)}: run plan --source <old app> first`);
			const result = await writeParity(libraries, positionals[0]!, { newApp: resolve(values['new-source'] ?? cwd), ...(values.route?.length ? { routes: values.route } : {}), journeysDir: join(cwd, STATE_DIR, 'journeys') }).catch((error: Error) => fail(error.message));
			out(summarizeParity(result));
			return 0;
		}
		case 'cli': {
			const { values } = parseArgs({ args: rest, options: { config: { type: 'string' }, case: { type: 'string', multiple: true }, record: { type: 'boolean' }, json: { type: 'boolean' } } });
			const path = resolve(cwd, values.config ?? join(STATE_DIR, CLI_CONFIG));
			const config = await readCliConfig(path).catch((error: Error) => fail(error.message));
			const report = await runCliCheck({ config, base: dirname(path), fixturesDir: join(cwd, STATE_DIR, 'cli-network'), ...(values.case?.length ? { only: values.case } : {}), ...(values.record ? { record: true } : {}) });
			if (values.case?.length && report.cases.length !== values.case.length) fail(`no case named ${values.case.filter((n) => !report.cases.some((c) => c.name === n)).join(', ')} in ${path}`);
			await writeFile(join(cwd, STATE_DIR, CLI_REPORT), `${JSON.stringify(report, null, '\t')}\n`);
			out(values.json ? `${JSON.stringify(report, null, '\t')}\n` : `${summarizeCli(report)}Wrote ${join(cwd, STATE_DIR, CLI_REPORT)}\n`);
			return report.ok ? 0 : 1;
		}
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
			if (process.env[AGENT_ENV]) fail('accept is for a person: an agent run by markless-migrate run may not accept a difference');
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
			const { values, positionals } = parseArgs({ args: rest, allowPositionals: true, options: { force: { type: 'boolean' }, reason: { type: 'string' }, by: { type: 'string' } } });
			if (positionals.length !== 1) fail('switch needs one route, for example switch /about/');
			const route = positionals[0]!;
			const force = values.force ? await forceDecision(route, values.reason, values.by) : undefined;
			const outcome = await switchRoute(cwd, route, force ? { force } : {});
			if (!outcome.ok) {
				err(`markless-migrate: ${outcome.reason}\n`);
				return 1;
			}
			out(`${outcome.already ? 'Still switched' : 'Switched'} ${outcome.entry.route} to the new app${outcome.entry.forced ? ` (forced by ${outcome.entry.forced.by}, not proven: ${outcome.entry.forced.reason}; last check ${outcome.entry.checks.join('; ') || 'none'})` : ''}. ${outcome.path}\n`);
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
			const { values } = parseArgs({ args: rest, options: { old: { type: 'string' }, new: { type: 'string' }, vercel: { type: 'string' }, nitro: { type: 'string' }, 'new-build': { type: 'string' }, index: { type: 'string' } } });
			if (!values.old || !values.new) fail('config needs --old <deployment> and --new <deployment>');
			if (values.index) await writeFile(values.index, renderStatusPage(await status(cwd), { old: values.old, new: values.new }));
			const buildDir = values['new-build'] ?? (await firstDir(cwd, ['.output/public', '.vercel/output/static']));
			const switched = (await readSwitched(cwd)).routes.map((r) => r.route);
			const inventory = await readInventory(cwd);
			const concrete = switched.filter((r) => !/[:*]/.test(r));
			const built = buildDir ? await buildAssets(resolve(cwd, buildDir)) : [];
			const newAssets = await notServedBy(values.old, [...new Set([...(await pageAssets(values.new, concrete)), ...built])].sort());
			const oldPaths = [...new Set(inventory?.routes.flatMap((r) => r.assets.map((a) => a.url)).filter((u) => u.startsWith('/')) ?? [])].sort();
			const oldAssets = await notServedBy(values.new, oldPaths);
			const input = { old: values.old, new: values.new, switched, newAssets, oldAssets, oldPaths, oldRoutes: [...new Set([...(inventory?.routes.map((r) => r.route) ?? []), ...(inventory?.source?.routes.map((r) => r.path) ?? [])])] };
			const vercel = `${JSON.stringify(vercelConfig(input), null, '\t')}\n`;
			const nitro = nitroSnippet(input);
			if (values.vercel) await writeFile(values.vercel, vercel);
			if (values.nitro) await writeFile(values.nitro, nitro);
			if (!values.vercel && !values.nitro && !values.index) out(`vercel.json:\n${vercel}\nNitro routeRules:\n${nitro}`);
			else out(`Wrote ${[values.vercel, values.nitro, values.index].filter(Boolean).join(' and ')} for ${switched.length} switched route${switched.length === 1 ? '' : 's'}.\n`);
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
