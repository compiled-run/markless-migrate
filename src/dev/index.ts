import { spawn, type ChildProcess } from 'node:child_process';
import { createWriteStream, existsSync, watch, type FSWatcher } from 'node:fs';
import { copyFile, cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { createHash } from 'node:crypto';
import { basename, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { convertInputArgs, missingDependencies, prepareDevApp, SITE_DIR } from './app.ts';
import { diffRuns, formatDiffs, parseProbeLines, type RouteProbe } from './findings.ts';
import { inventoryPages, moduleOf, readPortMap, routesUsing, selectRoutes, writePortMap, type PortMap } from './routes.ts';
import { PROBE_ENGINES, shardCheckArgs, type ProbeEngine } from '../check/ci-settings.ts';
import { CONVERT_INPUTS, type ConvertInputs } from '../convert/inputs.ts';
import { formatVerdicts, routeVerdict, type CheckedRoute, type RouteVerdict } from './verdict.ts';
import { recordingProxy } from './proxy.ts';
import { fragmentPath } from '../cache/apply.ts';

const REPO = fileURLToPath(new URL('../../', import.meta.url));
const CLI = join(REPO, 'src', 'cli.ts');
const PROBE_PATH = 'scripts/probe/dead-controls.mjs';
/** Converter files whose change can change the server (route handlers, prerendered outputs): those rewrite it. */
const SERVER_SOURCES = /^(endpoints|prerender\/|fumadocs\/)/;

export interface DevOptions {
	readonly app: string;
	readonly route: readonly string[];
	readonly routes?: string;
	readonly part?: string;
	readonly old?: string;
	readonly source?: string;
	readonly fallthrough?: string;
	/** Only the uses whose id this regular expression matches (the probe's ONLY): `combobox` for every combobox use. */
	readonly control?: string;
	/** The widths each control's box and hit points are compared at (default 1280). */
	readonly widths?: string;
	/** The probe's full sweep: every width, anchors at 1440, its default action budget. */
	readonly full?: boolean;
	readonly port?: number;
	readonly watch?: boolean;
	/** A production build of the routes instead of the dev server. */
	readonly build?: boolean;
	/** Also run check's widget probes (`check --only probes`) on the routes. */
	readonly check?: boolean;
	readonly probe?: string;
	readonly noProbes?: boolean;
	readonly concurrency?: number;
	/** The full check of the routes on a production build of them: check as each CI shard runs it, and the dead-controls probe in Chromium and WebKit with CI's budgets, then one PASS or FAIL. */
	readonly verdict?: boolean;
	/** Every page of the site (a `check --write-targets` file), so template groups are made as in the full check; default deploy/<site>/check-targets.json. */
	readonly siteTargets?: string;
	readonly log?: (line: string) => void;
}

/** How many times a verdict adds the pages its routes navigate to and checks again, and how many it adds at once. */
const MAX_ROUNDS = 2;
const MAX_DESTINATIONS = 60;

const seconds = (since: number) => `${((Date.now() - since) / 1000).toFixed(1)} s`;

function run(command: string, args: readonly string[], options: { cwd: string; env?: NodeJS.ProcessEnv; logFile?: string }): Promise<{ code: number; output: string }> {
	return new Promise((done) => {
		const child = spawn(command, args, { cwd: options.cwd, env: { ...process.env, ...options.env }, stdio: ['ignore', 'pipe', 'pipe'] });
		const file = options.logFile ? createWriteStream(options.logFile) : undefined;
		let output = '';
		const take = (d: Buffer) => {
			output += d;
			file?.write(d);
		};
		child.stdout.on('data', take);
		child.stderr.on('data', take);
		child.on('close', (code) => {
			if (file) file.end(() => done({ code: code ?? 1, output }));
			else done({ code: code ?? 1, output });
		});
	});
}

async function freePort(): Promise<number> {
	return new Promise((done, fail) => {
		const server = createServer();
		server.unref();
		server.on('error', fail);
		server.listen(0, '127.0.0.1', () => {
			const port = (server.address() as { port: number }).port;
			server.close(() => done(port));
		});
	});
}

async function answers(url: string, timeoutMs: number): Promise<boolean> {
	const until = Date.now() + timeoutMs;
	while (Date.now() < until) {
		const status = await fetch(url, { redirect: 'manual' }).then((r) => r.status, () => 0);
		if (status >= 200 && status < 400) return true;
		await new Promise((r) => setTimeout(r, 250));
	}
	return false;
}

/** The server of the dev app: Markless's dev server, or with `build`, a production build of only these routes. */
class AppServer {
	private child: ChildProcess | undefined;
	private readonly dev: string;
	readonly port: number;
	private readonly build: boolean;
	private readonly log: (line: string) => void;
	constructor(dev: string, port: number, build: boolean, log: (line: string) => void) {
		this.dev = dev;
		this.port = port;
		this.build = build;
		this.log = log;
	}
	get origin(): string {
		return `http://localhost:${this.port}`;
	}
	async start(first: string): Promise<void> {
		const since = Date.now();
		const vp = join(this.dev, 'node_modules', '.bin', 'vp');
		const env = { ...process.env, MARKLESS_MIGRATE_DEV: '1', PORT: String(this.port), VITE_APP_URL: process.env.VITE_APP_URL ?? this.origin };
		if (this.build) {
			const built = await run(vp, ['build'], { cwd: this.dev, env, logFile: join(this.dev, '.migrate', 'dev', 'build.log') });
			if (built.code) throw new Error(`the build of the dev app failed: ${join(this.dev, '.migrate', 'dev', 'build.log')}`);
			this.log(`built in ${seconds(since)}`);
		}
		const args = this.build ? [join(this.dev, '.output', 'server', 'index.mjs')] : [vp, 'dev', '--port', String(this.port), '--strictPort'];
		// Its own process group, so stopping it stops the Vite process vp starts too.
		this.child = spawn(process.execPath, args, { cwd: this.dev, env, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
		const logged: string[] = [];
		const keep = (d: Buffer) => logged.push(String(d));
		this.child.stdout!.on('data', keep);
		this.child.stderr!.on('data', keep);
		if (!(await answers(this.origin + first, 120_000))) throw new Error(`the dev app's server did not answer ${first}:\n${logged.join('').slice(-2000)}`);
		this.log(`${this.build ? 'production build' : 'dev server'} answers ${this.origin}${first} after ${seconds(since)}`);
	}
	stop(): void {
		if (this.child?.pid) {
			try {
				process.kill(-this.child.pid, 'SIGTERM');
			} catch {}
		}
		this.child = undefined;
	}
}

/**
 * Each route loaded once on the port, in one browser context: what stops a page (an error status, or Vite's error
 * overlay over a module that does not build), so the probes are not run on a broken page.
 */
async function brokenPages(origin: string, routes: readonly string[]): Promise<Map<string, string>> {
	const broken = new Map<string, string>();
	const browser = await chromium.launch();
	try {
		const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
		for (const route of routes) {
			const page = await context.newPage();
			const thrown: string[] = [];
			page.on('pageerror', (e) => thrown.push(e.message.split('\n')[0]!));
			const response = await page.goto(origin + route, { waitUntil: 'load', timeout: 60_000 }).catch((e: Error) => e);
			await page.waitForTimeout(500);
			const overlay = await page.evaluate(() => document.querySelector('vite-error-overlay')?.shadowRoot?.querySelector('.message')?.textContent ?? null).catch(() => null);
			const status = response instanceof Error ? response.message.split('\n')[0] : response && response.status() >= 400 ? `answers ${response.status()}` : undefined;
			// An error thrown while loading is the probe's to compare with the original's; a page that does not build is not probed.
			const problem = status ?? (overlay ? `Vite's error overlay: ${overlay.trim().split('\n')[0]}${thrown.length ? ` (throws ${thrown[0]})` : ''}` : undefined);
			if (problem) broken.set(route, problem);
			await page.close();
		}
		await context.close();
	} finally {
		await browser.close();
	}
	return broken;
}

/** A plan made in another checkout (a CI runner's) names the source there: the same path under this checkout's deploy/. */
function sourceHere(path: string): string {
	if (existsSync(path)) return path;
	const at = path.lastIndexOf('/deploy/');
	return at < 0 ? path : join(REPO, path.slice(at + 1));
}

/** The dead-controls probe: the option's file, or this checkout's. */
async function probeScript(given: string | undefined): Promise<string> {
	return given ? resolve(given) : join(REPO, PROBE_PATH);
}

export async function dev(options: DevOptions): Promise<number> {
	const log = options.log ?? ((line: string) => process.stdout.write(`${line}\n`));
	const app = resolve(options.app);
	const devApp = join(app, '.migrate', 'dev', 'app');
	const work = join(devApp, '.migrate', 'dev');
	const portsFile = join(app, '.migrate', 'dev', 'ports.json');
	const inventory = await inventoryPages(app);
	const old = options.old ?? inventory.origin;
	if (!old) throw new Error('dev needs --old <origin> (the inventory names none)');
	const source = options.source ?? (inventory.source ? sourceHere(inventory.source) : undefined);
	if (source && !existsSync(source)) throw new Error(`the plan's source ${source} is not on this machine: pass --source <the old app's source>`);
	let map: PortMap = await readPortMap(join(app, '.migrate', 'convert', 'report.json'), JSON.parse(await readFile(portsFile, 'utf8').catch(() => '{}')) as PortMap);
	map = await readPortMap(join(devApp, '.migrate', 'convert', 'report.json'), map);
	if (options.part && !Object.keys(map).length) throw new Error(`no record of which pages load each part yet: convert the app once without --only (its report lists each page's parts), then run dev --part again`);
	const { routes, unknown } = selectRoutes({ route: options.route, ...(options.routes ? { routes: options.routes } : {}), ...(options.part ? { part: options.part } : {}) }, inventory.pages, map);
	if (unknown.length) throw new Error(`not a page of the old site (inventory.json): ${unknown.join(', ')}`);
	if (!routes.length) throw new Error('no route to work on: pass --route <path>, --routes <glob> or --part <module>');
	log(`${routes.length} route${routes.length === 1 ? '' : 's'}: ${routes.slice(0, 8).join(', ')}${routes.length > 8 ? ', ...' : ''}`);
	if (!(await answers(old + routes[0], 10_000))) throw new Error(`the original does not answer ${old}${routes[0]}: start it (deploy/<app>/serve-old.sh) or pass --old <reference URL>`);

	const site = basename(app).replace(/-markless$/, '');
	const siteTargets = options.siteTargets ? resolve(options.siteTargets) : join(REPO, 'deploy', site, 'check-targets.json');
	if (options.verdict && !existsSync(siteTargets)) throw new Error(`--verdict makes template groups over every page of the site, as the full check does: pass --site-targets <check --all --write-targets file> (no ${siteTargets})`);
	const fetchOld = join(REPO, 'deploy', site, 'fetch-old.sh');
	const oldBuild = existsSync(fetchOld) ? createHash('sha256').update(await readFile(fetchOld)).digest('hex') : undefined;

	await prepareDevApp(app, devApp);
	await mkdir(work, { recursive: true });
	const routesFile = join(work, 'routes.txt');
	// A verdict also builds the pages its routes navigate to (learned from earlier runs), so a click that leaves a route lands on the port.
	const destinationsFile = join(work, 'destinations.json');
	const destinations = options.verdict ? (JSON.parse(await readFile(destinationsFile, 'utf8').catch(() => '{}')) as Record<string, string[]>) : {};
	const built = new Set([...routes, ...routes.flatMap((r) => destinations[r] ?? [])]);
	const builtList = () => [...routes, ...inventory.pages.filter((p) => built.has(p) && !routes.includes(p))];
	const lastRoutes = await readFile(routesFile, 'utf8').catch(() => '');
	if (lastRoutes !== builtList().join('\n')) await rm(join(devApp, 'pages'), { recursive: true, force: true });
	await writeFile(routesFile, builtList().join('\n'));

	const inputs = await readFile(join(app, '.migrate', 'convert', CONVERT_INPUTS), 'utf8').then((t) => JSON.parse(t) as ConvertInputs, () => undefined);
	if (options.verdict && !inputs) log(`no ${join('.migrate', 'convert', CONVERT_INPUTS)} from a whole convert of the app: the routes are converted without its --page-order-from, which a whole convert may have had`);
	const inputArgs = convertInputArgs(inputs);
	const argsFile = join(work, 'convert-inputs.json');
	// The server a reused convert keeps was written with the last run's inputs: other inputs write it again.
	let sameInputs = (await readFile(argsFile, 'utf8').catch(() => '')) === JSON.stringify(inputArgs);
	const convertRoutes = async (reuse: boolean) => {
		const since = Date.now();
		const args = [CLI, 'convert', '--old', old, '--only', routesFile, '--fallthrough', options.fallthrough ?? old, ...(source ? ['--source', source] : []), ...inputArgs, ...(reuse && sameInputs ? ['--reuse'] : [])];
		const done = await run(process.execPath, args, { cwd: devApp, logFile: join(work, 'convert.log') });
		if (done.code) {
			log(`convert failed after ${seconds(since)}: ${join(work, 'convert.log')}\n${done.output.split('\n').slice(-12).join('\n')}`);
			return false;
		}
		map = await readPortMap(join(devApp, '.migrate', 'convert', 'report.json'), map);
		await writePortMap(portsFile, map);
		await writeFile(argsFile, JSON.stringify(inputArgs));
		sameInputs = true;
		const missing = await missingDependencies(app, devApp);
		if (missing.length) {
			log(`the converted routes import ${missing.join(', ')}, which the app has not installed: run npm install in ${app}, then run this again`);
			return false;
		}
		await prepareDevApp(app, devApp);
		log(`converted in ${seconds(since)} (${join(work, 'convert.log')})`);
		return true;
	};
	if (!(await convertRoutes(true))) return 1;

	const publicPort = options.port ?? (await freePort());
	const server = new AppServer(devApp, options.verdict ? await freePort() : publicPort, options.build === true || options.verdict === true, log);
	const pageSet = new Set(inventory.pages);
	const reached = new Set<string>();
	const proxy = options.verdict ? await recordingProxy(server.port, publicPort, (page) => pageSet.has(page) && !built.has(page), await fragmentPath(app), reached) : undefined;
	const origin = proxy ? `http://127.0.0.1:${publicPort}` : server.origin;
	const stop = () => {
		server.stop();
		proxy?.close();
		process.exit(130);
	};
	process.once('SIGINT', stop);
	process.once('SIGTERM', stop);
	try {
		await server.start(routes[0]!);
		for (const r of routes.slice(1)) await fetch(server.origin + r).catch(() => {});
		log(`original: ${old}${routes[0]}\nport:     ${origin}${routes[0]}`);
		const probe = options.noProbes ? undefined : await probeScript(options.probe);
		let before: RouteProbe[] | undefined;
		const probeRoutes = async (asked: readonly string[]) => {
			const broken = await brokenPages(server.origin, asked);
			for (const [route, problem] of broken) log(`\n${route} does not load on the port, not probed: ${problem}`);
			const which = asked.filter((r) => !broken.has(r));
			if (!probe || !which.length) return;
			const since = Date.now();
			const strips = join(work, 'strips');
			await mkdir(strips, { recursive: true });
			const routesJson = join(work, 'probe-routes.json');
			await writeFile(routesJson, JSON.stringify(which));
			const width = Math.max(1, Math.min(options.concurrency ?? 1, which.length));
			const outs = Array.from({ length: width }, (_, i) => join(work, `findings-${i}.jsonl`));
			await Promise.all(outs.map((f) => rm(f, { force: true })));
			const env = {
				OLD: old,
				NEW: server.origin,
				STRIPS: strips,
				WORKERS: String(width),
				...(options.full ? {} : { STATIC_WIDTHS: options.widths ?? '1280', ANCHOR_WIDTHS: '' }),
				...(options.control ? { ONLY: options.control } : {}),
			};
			const results = await Promise.all(outs.map((out, i) => run(process.execPath, [probe, routesJson, out], { cwd: REPO, env: { ...env, WORKER: String(i) }, logFile: join(work, `probe-${i}.log`) })));
			for (const [i, r] of results.entries()) if (r.code) log(`probe ${i} stopped (${join(work, `probe-${i}.log`)}): ${r.output.split('\n').slice(-3).join(' ')}`);
			const now = (await Promise.all(outs.map((f) => readFile(f, 'utf8').catch(() => '')))).flatMap(parseProbeLines);
			const merged = [...(before ?? []).filter((b) => !which.includes(b.route)), ...now];
			log(`\nprobes on ${which.length} route${which.length === 1 ? '' : 's'} in ${seconds(since)}${options.control ? ` (uses matching /${options.control}/)` : ''}:`);
			log(formatDiffs(diffRuns(now, before)).trimEnd());
			await writeFile(join(work, 'findings.json'), JSON.stringify(merged, null, '\t'));
			before = merged;
		};
		const checkRoutes = async (which: readonly string[]) => {
			if (!options.check || !which.length) return;
			const since = Date.now();
			const done = await run(process.execPath, [CLI, 'check', '--old', old, '--new', server.origin, ...which.flatMap((r) => ['--route', r]), '--only', 'probes', '--no-cache'], { cwd: devApp, logFile: join(work, 'check.log') });
			log(`check --only probes in ${seconds(since)}:\n${done.output.trim().split('\n').slice(-8).join('\n')}`);
		};
		const verdictProbe = probe ?? (await probeScript(options.probe));
		const checkOn = async (which: readonly string[]): Promise<CheckedRoute[] | undefined> => {
			const since = Date.now();
			const report = join(devApp, '.migrate', 'report.json');
			await rm(report, { force: true });
			const args = [CLI, 'check', '--old', old, '--new', origin, ...which.flatMap((r) => ['--route', r]), '--site-targets', siteTargets, ...shardCheckArgs()];
			const done = await run(process.execPath, args, { cwd: devApp, env: { MARKLESS_MIGRATE_PROFILE: '1' }, logFile: join(work, 'verdict-check.log') });
			log(`check in ${seconds(since)} (exit ${done.code}, ${join(work, 'verdict-check.log')})`);
			const parsed = await readFile(report, 'utf8').then((t) => JSON.parse(t) as { routes?: CheckedRoute[] }, () => undefined);
			return parsed?.routes ?? [];
		};
		const probeOn = async (engine: ProbeEngine, which: readonly string[]): Promise<RouteProbe[]> => {
			const since = Date.now();
			const routesJson = join(work, `verdict-routes-${engine}.json`);
			const out = join(work, `verdict-${engine}.jsonl`);
			await writeFile(routesJson, JSON.stringify(which));
			await rm(out, { force: true });
			const strips = join(work, 'strips', engine);
			await mkdir(strips, { recursive: true });
			const env = { OLD: old, NEW: origin, ENGINE: engine, STRIPS: strips, ...PROBE_ENGINES[engine], ...(oldBuild ? { REUSE: join(app, '.migrate', 'probe-reuse'), OLD_BUILD: oldBuild } : {}) };
			const done = await run(process.execPath, [verdictProbe, routesJson, out], { cwd: REPO, env, logFile: join(work, `verdict-${engine}.log`) });
			log(`${engine} probe in ${seconds(since)} (exit ${done.code}, ${join(work, `verdict-${engine}.log`)})`);
			return parseProbeLines(await readFile(out, 'utf8').catch(() => ''));
		};
		const ENGINES = Object.keys(PROBE_ENGINES) as ProbeEngine[];
		const verdictOn = async (which: readonly string[]): Promise<RouteVerdict[]> => {
			const since = Date.now();
			let checked = await checkOn(which);
			const probes: Partial<Record<ProbeEngine, RouteProbe[]>> = {};
			for (const engine of ENGINES) probes[engine] = await probeOn(engine, which);
			let verdicts = which.map((r) => routeVerdict(r, checked, probes));
			// A result that is not the port's (an infrastructure failure, a probe that stopped) is taken once more, never reported as a third outcome.
			const again = verdicts.filter((v) => v.rerun.check).map((v) => v.route);
			if (again.length) {
				log(`check again on ${again.join(', ')}: not checked the first time`);
				const second = await checkOn(again);
				checked = [...(checked ?? []).filter((c) => !again.includes(c.route)), ...(second ?? [])];
			}
			for (const engine of ENGINES) {
				const stopped = verdicts.filter((v) => v.rerun.engines.includes(engine)).map((v) => v.route);
				if (!stopped.length) continue;
				log(`${engine} probe again on ${stopped.join(', ')}: it stopped the first time`);
				probes[engine] = [...(probes[engine] ?? []).filter((p) => !stopped.includes(p.route)), ...(await probeOn(engine, stopped))];
			}
			verdicts = which.map((r) => routeVerdict(r, checked, probes));
			await writeFile(join(work, 'verdict.json'), JSON.stringify({ verdicts, probes }, null, '\t'));
			log(`\n${formatVerdicts(verdicts).trimEnd()}\n(${seconds(since)} for check and probes; ${join(work, 'verdict.json')})`);
			return verdicts;
		};
		const verdictLanding = async (): Promise<RouteVerdict[]> => {
			for (let round = 1; ; round++) {
				reached.clear();
				const verdicts = await verdictOn(routes);
				const more = [...reached].filter((p) => !built.has(p)).slice(0, MAX_DESTINATIONS);
				if (!more.length) return verdicts;
				if (round > MAX_ROUNDS) {
					log(`the routes still navigate to pages this build does not hold (${more.slice(0, 8).join(', ')}): those steps reached the original's page, so the verdict stands as a FAIL`);
					return verdicts.map((v) => ({ ...v, pass: false, reasons: [...v.reasons, `navigates to pages the build did not hold after ${MAX_ROUNDS} rounds: ${more.slice(0, 4).join(', ')}`] }));
				}
				log(`\nthe routes navigated to ${more.length} page${more.length === 1 ? '' : 's'} this build does not hold (${more.slice(0, 8).join(', ')}${more.length > 8 ? ', ...' : ''}): building them too and checking again`);
				for (const r of routes) destinations[r] = [...new Set([...(destinations[r] ?? []), ...more])];
				await writeFile(destinationsFile, JSON.stringify(destinations, null, '\t'));
				for (const p of more) built.add(p);
				await writeFile(routesFile, builtList().join('\n'));
				if (!(await convertRoutes(true))) return verdicts.map((v) => ({ ...v, pass: false, reasons: [...v.reasons, 'convert failed while adding the pages it navigates to'] }));
				server.stop();
				await server.start(routes[0]!);
			}
		};
		if (options.verdict) {
			const verdicts = await verdictLanding();
			if (!options.watch) return verdicts.every((v) => v.pass) ? 0 : 1;
		} else {
			await probeRoutes(routes);
			await checkRoutes(routes);
			if (!options.watch) return before?.some((r) => r.findings.length) ? 1 : 0;
		}

		// Watch: a part is copied into the dev app and its routes probed again; a converter change converts again first.
		log(`\nwatching parts/, src/convert/ and ${relative(process.cwd(), join(app, SITE_DIR)) || SITE_DIR}/ (Ctrl+C stops)`);
		const pending = { convert: false, server: false, routes: new Set<string>() };
		let running = false;
		let timer: NodeJS.Timeout | undefined;
		const flush = async () => {
			if (running) return;
			running = true;
			try {
				while (pending.convert || pending.routes.size) {
					const reconvert = pending.convert;
					const reuse = !pending.server;
					const which = reconvert ? routes : routes.filter((r) => pending.routes.has(r));
					pending.convert = pending.server = false;
					pending.routes.clear();
					if (reconvert && !(await convertRoutes(reuse))) continue;
					// Vite answers the next load with the changed modules; a production build is built again.
					if (options.build || options.verdict) {
						server.stop();
						await server.start(routes[0]!);
					}
					if (options.verdict) await verdictLanding();
					else {
						await probeRoutes(which);
						await checkRoutes(which);
					}
				}
			} finally {
				running = false;
			}
		};
		const later = () => {
			clearTimeout(timer);
			timer = setTimeout(() => void flush(), 400);
		};
		const watchers: FSWatcher[] = [
			watch(join(REPO, 'parts'), { recursive: true }, (_, file) => {
				if (!file || !file.endsWith('.ts')) return;
				const target = join(devApp, 'lib', 'parts', file);
				if (!existsSync(target)) return;
				void copyFile(join(REPO, 'parts', file), target).then(() => {
					const affected = routesUsing(moduleOf(file), map, routes);
					log(`\nparts/${file} changed: ${affected.length} of ${routes.length} routes load it`);
					for (const r of affected) pending.routes.add(r);
					later();
				});
			}),
			watch(join(REPO, 'src', 'convert'), { recursive: true }, (_, file) => {
				if (!file) return;
				log(`\nsrc/convert/${file} changed: converting again`);
				pending.convert = true;
				if (SERVER_SOURCES.test(file.replace(/\\/g, '/'))) pending.server = true;
				later();
			}),
			watch(join(app, SITE_DIR), { recursive: true }, (_, file) => {
				if (!file) return;
				void cp(join(app, SITE_DIR, file), join(devApp, SITE_DIR, file), { force: true }).catch(() => {}).then(() => {
					log(`\n${SITE_DIR}/${file} changed`);
					// The site's control and component lists are read by convert; its code is served as it is.
					if (file.endsWith('.json')) pending.convert = true;
					else for (const r of routes) pending.routes.add(r);
					later();
				});
			}),
		];
		void watchers;
		// Runs until Ctrl+C, whose handler stops the server.
		return await new Promise<number>(() => {});
	} finally {
		server.stop();
		proxy?.close();
	}
}
