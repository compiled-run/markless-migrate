import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium, type Browser } from 'playwright';
import { applyAccepted, type Accept } from './accepted.ts';
import { accessFailures, ANONYMOUS, compareLogin, loginRoutes, saveState, signIn, type AuthConfig, type RoleSpec } from './auth.ts';
import { BlockedError, blockedResult, probeWall } from './blocked.ts';
import { defaultEnv, isLoopback, pushRecording, tagHeaders, type SideEnv, type StorageState } from './browser.ts';
import { captureHttp, captureRoute, mime } from './capture.ts';
import { readRecording, recordable, slug, writeRecording } from './data.ts';
import { checkEndpoint, checkRedirect, isPage } from './endpoints.ts';
import { DEFAULT_FREEZE, pinnedBy, pinnedSummary, type FreezeOptions } from './freeze.ts';
import { HINTS } from './hints.ts';
import { locateFailures } from './locate.ts';
import { mapRules } from './sourcemap.ts';
import { negotiationFailures } from './i18n.ts';
import { compareJourneys, explore, replayAll } from './journeys.ts';
import { assetsToProbe, compareRoute, cssTargets, httpFailures, noiseReport, noisyStyles, withFailures, type Probe } from './compare.ts';
import { matchElements } from './match.ts';
import { contractLines } from './network.ts';
import type { SourceFacts } from './source-facts.ts';
import { compareStates, type StateInput } from './states.ts';
import { discoverStates, parseRules } from './stylesheet.ts';
import { renderHtml } from './html.ts';
import { blocker, type BlockList } from './trackers.ts';
import type { Blocked, Dimension, Failure, LoginResult, PageCapture, Report, RouteCapture, RouteResult, Shot, Viewport } from './types.ts';
import { DIMENSIONS, VIEWPORTS } from './types.ts';

export interface CheckOptions {
	readonly oldOrigin: string;
	readonly newOrigin: string;
	readonly routes: readonly string[];
	readonly viewports?: readonly Viewport[];
	/** Locales the inventory found; each route's own hreflang and lang are added. */
	readonly locales?: readonly string[];
	readonly browser?: Browser;
	/** Clock, seed, timezone and locale pinned in the browser; false loads pages unfrozen. */
	readonly freeze?: Partial<FreezeOptions> | false;
	/** Changes to the shipped tracker block list. */
	readonly block?: BlockList;
	/** Origins marked as staging: writes are sent only when both apps are staging or on this machine. */
	readonly staging?: { readonly old?: boolean; readonly new?: boolean };
	/** What scanning the old app's source found. */
	readonly source?: SourceFacts;
	/** Record OLD's responses per route into dir, or serve them to both apps from there. */
	readonly data?: { readonly mode: 'record' | 'replay'; readonly dir: string };
	/** Roles to sign in as; every route is checked once per role and once anonymous. */
	readonly auth?: AuthConfig;
	/** Where each role's signed-in storage state is written, per side. */
	readonly authStateDir?: string;
	/** Sent to both apps' own origins only, for example a bot-protection bypass token. */
	readonly headers?: Readonly<Record<string, string>>;
	readonly cookies?: readonly { readonly name: string; readonly value: string }[];
	readonly userAgent?: string;
	/** Paths compared as data rather than as pages; any route whose OLD response is not HTML is too. */
	readonly endpoints?: readonly string[];
	/** Paths the old app redirects: only the status and redirect chain are compared. */
	readonly redirects?: readonly string[];
	/** Source routes that could not be checked for want of a sample value, listed in the report. */
	readonly unchecked?: Report['unchecked'];
	/** Source checkouts of the old and new app, to name the file and line behind each failing element. */
	readonly sourceDirs?: { readonly old?: string; readonly new?: string };
	/** Intended differences (`.migrate/accepted.json`): failures they match are reported as accepted, not red. */
	readonly accepted?: readonly Accept[];
}

interface Run {
	readonly old: SideEnv;
	readonly new: SideEnv;
	readonly frozen: boolean;
	readonly source?: SourceFacts;
	readonly sourceDirs?: { readonly old?: string; readonly new?: string };
}

async function probe(env: SideEnv, url: string): Promise<Probe> {
	try {
		const response = await fetch(new URL(url, env.origin), { redirect: 'follow', headers: tagHeaders(env) });
		await response.body?.cancel();
		return { status: response.status, contentType: mime(response.headers.get('content-type')) };
	} catch {
		return { status: 0, contentType: '' };
	}
}

export function loadsDiffer(a: RouteCapture, b: RouteCapture): boolean {
	if (JSON.stringify(a.http) !== JSON.stringify(b.http)) return true;
	return Object.entries(a.pages).some(([viewport, pa]) => {
		const pb = b.pages[viewport];
		if (!pb) return true;
		const facts = (p: PageCapture) => JSON.stringify([p.aria, p.text, p.seo, p.fonts, p.elements.map((el) => [el.text, el.name, el.style]), p.network ? contractLines(p.network, a.origin) : []]);
		return facts(pa) !== facts(pb) || !pa.screenshot.equals(pb.screenshot);
	});
}

async function negotiate(env: SideEnv, route: string, locales: readonly string[]): Promise<Record<string, string>> {
	const out: Record<string, string> = {};
	for (const locale of locales) {
		const http = await captureHttp(env.origin, route, { 'accept-language': locale, ...tagHeaders(env) }).catch(() => undefined);
		out[locale] = http ? http.chain.at(-1)!.url : '(no response)';
	}
	return out;
}

function routeLocales(capture: RouteCapture, known: readonly string[]): string[] {
	const seo = Object.values(capture.pages)[0]?.seo ?? {};
	const found = Object.keys(seo).flatMap((key) => (key.startsWith('hreflang:') && key !== 'hreflang:x-default' ? [key.slice('hreflang:'.length)] : []));
	return [...new Set([...known, ...found, ...(seo['html:lang'] ? [seo['html:lang']] : [])])].sort();
}

/** OLD's captures of the route, so a record run can save what OLD fetched. */
const oldCaptures = new WeakMap<RouteResult, RouteCapture>();

export async function checkRoute(browser: Browser, run: Run, route: string, viewports: readonly Viewport[] = VIEWPORTS, locales: readonly string[] = []): Promise<RouteResult> {
	const oldOrigin = run.old.origin;
	const newOrigin = run.new.origin;
	// The OLD loads must not overlap, or time-based noise (clocks, counters) looks stable; the third comes after NEW so it brackets it in time.
	const oldA = await captureRoute(browser, oldOrigin, route, viewports, run.old);
	const [oldB, next] = await Promise.all([captureRoute(browser, oldOrigin, route, viewports, run.old), captureRoute(browser, newOrigin, route, viewports, run.new)]);
	const olds = [oldA, oldB];
	if (loadsDiffer(oldA, oldB)) olds.push(await captureRoute(browser, oldOrigin, route, viewports, run.old));
	const probes = new Map<string, Probe>();
	for (const url of assetsToProbe(oldA, next)) probes.set(url, await probe(run.new, url));
	const languages = routeLocales(oldA, locales);
	const [negotiatedA, negotiatedB, negotiatedNew] = await Promise.all([negotiate(run.old, route, languages), negotiate(run.old, route, languages), negotiate(run.new, route, languages)]);
	const compared = compareRoute(route, olds, next, probes, run.source?.clients);
	const noise = noiseReport(olds, run.frozen, run.source?.nondeterminism);
	const loadWrites = (Object.values(oldA.pages)[0]?.writes ?? []).map((w) => ({ ...w, during: 'page load' }));
	const result = withFailures(compared, [...compared.failures, ...negotiationFailures(route, languages, [negotiatedA, negotiatedB], negotiatedNew)], { noise, writes: loadWrites });
	const checked = await checkJourneys(browser, run, route, viewports[0]!, await checkStates(browser, run, route, viewports, olds, result));
	const done = await locateFailures(checked, { route, old: oldA, next, sides: { old: { origin: oldOrigin, dir: run.sourceDirs?.old }, new: { origin: newOrigin, dir: run.sourceDirs?.new } }, ...(run.source ? { facts: run.source } : {}) });
	oldCaptures.set(done, oldA);
	return done;
}

// Explores OLD, then replays every journey on OLD again and on NEW; a third OLD replay confirms noise when the first two differ.
async function checkJourneys(browser: Browser, run: Run, route: string, viewport: Viewport, result: RouteResult): Promise<RouteResult> {
	const journeys = await explore(browser, run.old, route, viewport);
	const recorded = journeys.map((j) => j.expected);
	const [again, next] = await Promise.all([replayAll(browser, run.old, route, viewport, journeys), replayAll(browser, run.new, route, viewport, journeys)]);
	const runs = [recorded, again];
	if (JSON.stringify(recorded) !== JSON.stringify(again)) runs.push(await replayAll(browser, run.old, route, viewport, journeys));
	const writes = journeys.flatMap((j) => j.expected.flatMap((step) => (step.writes ?? []).map((w) => ({ ...w, during: j.name }))));
	return withFailures(result, [...result.failures, ...compareJourneys(route, runs, journeys, next)], { journeys, writes: [...(result.writes ?? []), ...writes] });
}

// Forces every state the OLD stylesheets style, on the first viewport, and names the OLD rule behind each computed-style failure.
async function checkStates(browser: Browser, run: Run, route: string, viewports: readonly Viewport[], olds: readonly RouteCapture[], result: RouteResult): Promise<RouteResult> {
	const oldOrigin = run.old.origin;
	const newOrigin = run.new.origin;
	const first = viewports[0]!;
	const sources = olds[0]!.pages[first.name]?.stylesheets ?? [];
	const states = discoverStates(sources);
	const rules = await mapRules(parseRules(sources), sources, run.old.origin, run.sourceDirs?.old);
	const failures: Failure[] = [];
	const explained = new Map<Failure, Failure>();
	const shots: Shot[] = [];
	const checked: string[] = [];
	const skipped: string[] = [];
	for (const viewport of viewports) {
		const a = olds[0]!.pages[viewport.name];
		if (!a) continue;
		const others = olds.slice(1).map((o) => o.pages[viewport.name]!).filter(Boolean);
		const explain = result.failures.flatMap((failure) => {
			const target = failure.viewport === viewport.name ? cssTargets.get(failure) : undefined;
			return target ? [{ failure, ...target }] : [];
		});
		const forced = viewport === first ? states : [];
		if (!forced.length && !explain.length) continue;
		const styleNoise = noisyStyles(a.elements, others.map((o) => o.elements));
		const textNoise = new Set(others.flatMap((o) => [...matchElements(a.elements, o.elements)].filter(([i, j]) => a.elements[i]!.text !== o.elements[j]!.text).map(([i]) => i)));
		const noise = a.elements.flatMap((element, i): StateInput['noise'][number][] => (textNoise.has(i) ? [{ element, props: 'text' }] : styleNoise.get(i)?.size ? [{ element, props: styleNoise.get(i)! }] : []));
		const out = await compareStates({ browser, oldOrigin, newOrigin, envs: { old: run.old, new: run.new }, route, viewport, states: forced, rules, noise, explain });
		failures.push(...out.failures);
		for (const [from, to] of out.explained) explained.set(from, to);
		shots.push(...out.shots);
		checked.push(...out.checked.map((label) => (viewports.length > 1 ? `${label} (${viewport.name})` : label)));
		skipped.push(...out.skipped);
	}
	return withFailures(result, [...result.failures.map((f) => explained.get(f) ?? f), ...failures], { shots: [...result.shots, ...shots], states: { checked, skipped } });
}

/** Writes go out only when both apps are staging or on this machine; otherwise both are held back, so they compare alike. */
export function writesAllowed(options: Pick<CheckOptions, 'oldOrigin' | 'newOrigin' | 'staging'>): boolean {
	return (Boolean(options.staging?.old) || isLoopback(options.oldOrigin)) && (Boolean(options.staging?.new) || isLoopback(options.newOrigin));
}

async function replayRoute(run: Run, dir: string, route: string): Promise<{ run: Run; failures: Failure[] }> {
	const recording = await readRecording(dir, route);
	if (!recording) {
		return { run, failures: [{ route, dimension: 'network', check: 'recorded data', expected: `a recording in ${dir}`, actual: 'none for this route', hint: HINTS.dataMissing }] };
	}
	const replay = { set: randomUUID(), responses: recording.responses };
	const next: Run = { ...run, old: { ...run.old, replay }, new: { ...run.new, replay } };
	const failures: Failure[] = [];
	if (recording.responses.some((r) => r.side === 'server')) {
		for (const [label, env] of [['old', next.old], ['new', next.new]] as const) {
			if (!(await pushRecording(env))) failures.push({ route, dimension: 'network', check: `recorded server responses on ${label.toUpperCase()}`, expected: 'served by the request recorder in the server', actual: 'the server does not run the request recorder, so it fetched live data', hint: HINTS.networkRecorder });
		}
	}
	return { run: next, failures };
}

/** A route that was not compared in full: only `compared` dimensions carry a verdict, the rest are skipped. */
function partialResult(route: string, failures: readonly Failure[], compared: readonly Dimension[], blocked?: Blocked): RouteResult {
	const failed = new Set(failures.map((f) => f.dimension));
	const dimensions = Object.fromEntries(DIMENSIONS.map((d) => [d, failed.has(d) ? 'fail' : compared.includes(d) ? 'pass' : 'skipped'])) as RouteResult['dimensions'];
	const zero = { downloaded: 0, source: 0, executed: 0 };
	return { route, ok: false, dimensions, failures, weight: { old: zero, new: zero }, visualDiffs: [], shots: [], ...(blocked ? { blocked } : {}) };
}

function asRole(result: RouteResult, role: string | undefined): RouteResult {
	return role ? { ...result, role, failures: result.failures.map((f) => ({ ...f, role })) } : result;
}

/** Checks one route as one role: a bot wall stops it, a different access decision is reported without comparing two different pages. */
async function checkAs(browser: Browser, run: Run, route: string, role: string | undefined, logins: readonly string[], options: CheckOptions): Promise<RouteResult> {
	const wall = (await probeWall(run.old, route, 'old')) ?? (await probeWall(run.new, route, 'new'));
	if (wall) return partialResult(route, [], [], wall);
	const gate: Failure[] = [];
	if (role) {
		const [a, b, n] = await Promise.all([captureHttp(run.old.origin, route, tagHeaders(run.old)), captureHttp(run.old.origin, route, tagHeaders(run.old)), captureHttp(run.new.origin, route, tagHeaders(run.new))]);
		const decided = accessFailures(route, role, a, n, logins);
		if (!decided.comparable) return partialResult(route, [...httpFailures(route, [a, b], n), ...decided.failures], ['http', 'auth']);
		gate.push(...decided.failures);
	}
	try {
		const result = await checkRoute(browser, run, route, options.viewports, options.locales);
		if (!gate.length) return result;
		const gated = withFailures(result, [...gate, ...result.failures]);
		const old = oldCaptures.get(result);
		if (old) oldCaptures.set(gated, old);
		return gated;
	} catch (error) {
		if (!(error instanceof BlockedError)) throw error;
		return partialResult(route, [], [], blockedResult(error.origin === run.new.origin && error.origin !== run.old.origin ? 'new' : 'old', error.blocked.status, error.blocked));
	}
}

async function signInAs(browser: Browser, base: Run, role: string, spec: RoleSpec, auth: AuthConfig, stateDir: string | undefined): Promise<{ run?: Run; login: LoginResult }> {
	const route = auth.loginRoute ?? loginRoutes(auth)[0] ?? '(login)';
	const states: Partial<Record<'old' | 'new', StorageState>> = {};
	const failures: Failure[] = [];
	for (const side of ['old', 'new'] as const) {
		try {
			states[side] = await signIn(browser, base[side], side, role, spec, auth.dir);
			if (stateDir) await saveState(stateDir, role, side, states[side]!);
		} catch (error) {
			failures.push({ route, role, dimension: 'auth', check: `signing in as ${role} on ${side.toUpperCase()}`, expected: 'the login script completes', actual: (error as Error).message, hint: side === 'old' ? HINTS.loginOld : HINTS.loginNew });
		}
	}
	if (!states.old) return { login: { role, ok: false, failures, cookies: { old: [], new: [] } } };
	const compared = states.new ? compareLogin(role, route, states.old, states.new, base.old.origin, base.new.origin) : undefined;
	const all = [...failures, ...(compared?.failures ?? [])];
	return {
		run: { ...base, old: { ...base.old, storageState: states.old }, new: { ...base.new, ...(states.new ? { storageState: states.new } : {}) } },
		login: { role, ok: all.length === 0, failures: all, cookies: compared?.cookies ?? { old: [], new: [] } },
	};
}

export async function runCheck(options: CheckOptions): Promise<Report> {
	const startedAt = new Date().toISOString();
	const browser = options.browser ?? (await chromium.launch());
	const freeze: FreezeOptions | false = options.freeze === false ? false : { ...DEFAULT_FREEZE, ...options.freeze };
	const bypass = { ...(options.headers ? { headers: options.headers } : {}), ...(options.cookies?.length ? { cookies: options.cookies } : {}), ...(options.userAgent ? { userAgent: options.userAgent } : {}) };
	const shared = { freeze, block: blocker(options.block), sendWrites: writesAllowed(options), writeFacts: options.source?.writes ?? [], ...bypass };
	const base: Run = { old: defaultEnv(options.oldOrigin, shared), new: defaultEnv(options.newOrigin, shared), frozen: Boolean(freeze), ...(options.source ? { source: options.source } : {}), ...(options.sourceDirs ? { sourceDirs: options.sourceDirs } : {}) };
	const auth = options.auth;
	const roles: (string | undefined)[] = auth ? [ANONYMOUS, ...Object.keys(auth.roles)] : [undefined];
	const logins: LoginResult[] = [];
	const loginPaths = auth ? loginRoutes(auth) : [];
	try {
		const routes: RouteResult[] = [];
		const endpoints = new Set(options.endpoints ?? []);
		for (const route of options.routes) if (!isPage((await captureHttp(options.oldOrigin, route, tagHeaders(base.old)).catch(() => undefined))?.contentType ?? '')) endpoints.add(route);
		for (const role of roles) {
			let roleRun = base;
			if (auth && role && role !== ANONYMOUS) {
				const signed = await signInAs(browser, base, role, auth.roles[role]!, auth, options.authStateDir);
				logins.push(signed.login);
				if (!signed.run) continue;
				roleRun = signed.run;
			}
			const data = options.data && role && role !== ANONYMOUS ? { ...options.data, dir: join(options.data.dir, slug(role)) } : options.data;
			for (const route of options.routes) {
				if (endpoints.has(route)) continue;
				const { run, failures } = data?.mode === 'replay' ? await replayRoute(roleRun, data.dir, route) : { run: roleRun, failures: [] };
				const result = await checkAs(browser, run, route, role, loginPaths, options);
				routes.push(asRole(failures.length ? withFailures(result, [...failures, ...result.failures]) : result, role));
				const old = oldCaptures.get(result);
				if (data?.mode === 'record' && old) {
					const records = Object.values(old.pages)[0]?.network?.records ?? [];
					await writeRecording(data.dir, { route, recordedFrom: options.oldOrigin, at: startedAt, responses: recordable(records) });
				}
			}
			for (const route of endpoints) routes.push(asRole(await checkEndpoint(roleRun, route), role));
			for (const route of options.redirects ?? []) routes.push(asRole(await checkRedirect(roleRun, route), role));
		}
		const sources = options.source?.nondeterminism.map((f) => ({ ...f, pinned: pinnedBy(`${f.kind} ${f.what ?? ''}`, f.side, freeze) }));
		return applyAccepted({
			version: 1,
			old: options.oldOrigin,
			new: options.newOrigin,
			startedAt,
			ok: routes.every((r) => r.ok) && logins.every((l) => l.ok),
			routes,
			pinned: pinnedSummary(freeze),
			...(sources ? { sources } : {}),
			...(options.data ? { data: options.data } : {}),
			writes: shared.sendWrites ? 'sent' : 'held back',
			...(auth ? { roles: roles as string[], logins } : {}),
			...(options.unchecked?.length ? { unchecked: options.unchecked } : {}),
		}, options.accepted ?? []);
	} finally {
		if (!options.browser) await browser.close();
	}
}

export function jsonReport(report: Report, diffs: Readonly<Record<string, string[]>> = {}) {
	return { ...report, routes: report.routes.map(({ visualDiffs: _, shots: __, journeys, ...route }) => ({ ...route, visualDiffs: diffs[route.route] ?? [], journeys: journeys?.length ?? 0 })) };
}

export async function writeReport(report: Report, dir: string): Promise<string> {
	await mkdir(dir, { recursive: true });
	const diffs: Record<string, string[]> = {};
	for (const route of report.routes) {
		for (const diff of route.visualDiffs) {
			const file = join(dir, 'diffs', `${slug(route.route)}.${diff.viewport}.png`);
			await mkdir(join(dir, 'diffs'), { recursive: true });
			await writeFile(file, diff.png);
			(diffs[route.route] ??= []).push(file);
		}
	}
	for (const route of report.routes) {
		if (!route.journeys?.length) continue;
		await mkdir(join(dir, 'journeys'), { recursive: true });
		await writeFile(join(dir, 'journeys', `${slug(route.route)}.json`), `${JSON.stringify({ route: route.route, origin: report.old, viewport: 'desktop', journeys: route.journeys }, null, '\t')}\n`);
	}
	const path = join(dir, 'report.json');
	await writeFile(path, `${JSON.stringify(jsonReport(report, diffs), null, '\t')}\n`);
	await writeFile(join(dir, 'report.html'), renderHtml(report));
	return path;
}
