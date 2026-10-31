import { shellRoute, type OldRouting } from './hash-routes.ts';
import { hashLinkFailures } from './hash-links.ts';
import { randomUUID } from 'node:crypto';
import { checkEmbeds, type EmbedCheckOptions } from '../embed/check.ts';
import { createWriteStream } from 'node:fs';
import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import { availableParallelism } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { chromium, firefox, webkit, type Browser } from 'playwright';
import { checkBusyCpu, type BusyCpuOptions } from './busy-cpu.ts';
import { applyAccepted, type Accept } from './accepted.ts';
import { journeysFile, journeysJson, RouteArtifacts, SHOTS_DIR, shotName, type Png } from './artifacts.ts';
import type { AutomaticRule } from './automatic.ts';
import { accessFailures, ANONYMOUS, saysDenied, compareLogin, loginRoutes, saveState, signIn, type AuthConfig, type RoleSpec } from './auth.ts';
import { BlockedError, blockedResult, detectChallenge, probeWall } from './blocked.ts';
import type { ClientFact } from './source-facts.ts';
import { adoptAnswers, LAUNCH, DEFINITE, defaultEnv, isLoopback, pushRecording, resetSharedAnswers, shareAnswers, storedAnswers, tagHeaders, type StoredAnswer, type SideEnv, type StorageState, type WallHit } from './browser.ts';
import { captureHttp, captureRoute, captureRouteHttp, landing, mime, pageLoads, thirdPartyLoads } from './capture.ts';
import { OldCache } from './cache.ts';
import { everyRecording, readRecording, recordable, slug, writeRecording } from './data.ts';
import { mergeRecordings, recordLive, restRecords } from './live-record.ts';
import { checkEndpoint, checkRedirect, isPage } from './endpoints.ts';
import { DEFAULT_FREEZE, pinnedBy, pinnedSummary, type FreezeOptions } from './freeze.ts';
import { HINTS } from './hints.ts';
import { locateFailures, NOT_EXERCISED } from './locate.ts';
import { checkClock } from './clock-shift.ts';
import { checkProbes, type ProbeOptions, type SharedProbe } from './probes.ts';
import { checkControlParity, type ControlParityOptions } from './control-parity.ts';
import { mapRules } from './sourcemap.ts';
import { negotiationFailures } from './i18n.ts';
import { compareJourneys, describeTarget, interimViews, MAX_ARRIVED, replay, timedOnly, type Journey, type Step, DEFAULT_JOURNEY_BUDGET_MS, doorPageErrors, explore, inDarkMode, themed, replayAll, replayDestructive, survey, type ElementCoverage, type Exploration, type ExploreOptions, type RecordedJourney, type Run as RunResults } from './journeys.ts';
import { storageOwner, unreachableCandidate, type StorageOwner } from './automatic.ts';
import { checkResponsiveness, summarizeResponsiveness, type ResponsivenessOptions } from './responsiveness.ts';
import { checkMotion, motionRules, type MotionOptions } from './motion.ts';
import { CheckProgress } from './progress.ts';
import { applyNavigation, checkNavigation, type NavigationOptions, type NavigationResult } from './nav-parity.ts';
import { loadFailures, measureLoad, psiFailures, type LoadOptions } from './load.ts';
import { measurePsi, psiKey } from './psi.ts';
import { CHECK_AFTER_ANSWER_MS, CHECK_RUN_TIMEOUT_MS, measureRoutesNetwork } from './slow-network.ts';
import { measureWaste, type WasteReport } from './waste.ts';
import { networkFailures } from './slow-network-verdicts.ts';
import { assetsToProbe, compareRoute, cssTargets, forgetFailures, httpFailures, noiseReport, noisyStyles, weightAllowed, withFailures, type Probe } from './compare.ts';
import { matchElements } from './match.ts';
import { contractLines, type NetworkRecord } from './network.ts';
import type { SourceFacts } from './source-facts.ts';
import { compareStates, type StateInput } from './states.ts';
import { discoverStates, parseRules, type StyleSource } from './stylesheet.ts';
import { renderHtmlParts } from './html.ts';
import type { Status } from '../status.ts';
import { blocker, type BlockList } from './trackers.ts';
import { learnLiveCounts, pinnedCounts } from './live-counts.ts';
import { matchRoute } from '../source/pattern.ts';
import { isSwitched } from '../switch/state.ts';
import type { Blocked, Coverage, Dimension, Failure, HttpCapture, Infrastructure, LoginResult, PageCapture, Report, RouteCapture, RouteCoverage, RouteResult, Shot, Viewport } from './types.ts';
import { DIMENSIONS, REPRESENTATIVE_ONLY, VIEWPORTS } from './types.ts';
import { checkCoverage, mergeCoverage } from './coverage.ts';
import { groupTemplates, TEMPLATE_THRESHOLD, type TemplateGroup } from './templates.ts';
import { bodyText, request } from './http.ts';
import { classify, InfrastructureError, Scope } from './infrastructure.ts';

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
	/** Servers that run the recorder render each page load at the frozen time too (`--server-clock`). */
	readonly serverClock?: boolean;
	/** Changes to the shipped tracker block list. */
	readonly block?: BlockList;
	/** Origins marked as staging: writes are sent only when both apps are staging or on this machine. */
	readonly staging?: { readonly old?: boolean; readonly new?: boolean };
	/** What scanning the old app's source found. */
	readonly source?: SourceFacts;
	/** Record OLD's responses per route into dir, or serve them to both apps from there. */
	readonly data?: { readonly mode: 'record' | 'replay'; readonly dir: string; /** While recording, how long a page of each route that spoke to a realtime database stays open to hear its updates. */ readonly liveWindowMs?: number };
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
	/** Automatic acceptance rules turned off in `.migrate/overrides.json`. */
	readonly automaticOff?: readonly AutomaticRule[];
	/** Routes checked at once; default half the cores, at most 4. */
	readonly concurrency?: number;
	/** How long exploring each route's interactions may take, and at most how many journeys it records. */
	readonly journeys?: Pick<ExploreOptions, 'budgetMs' | 'maxJourneys'>;
	/** Routes served by the new app (`.migrate/switched.json`): a journey on NEW that reaches any other page gets the old app's, as through the front door. */
	readonly switched?: readonly string[];
	/** Time the first use of every control the journeys exercised and every internal link they followed, old and new, at desktop speed and on a throttled phone. */
	readonly responsiveness?: ResponsivenessOptions;
	/** Record the transitions and animations every interaction starts, and those hovering and focusing each control start, old and new, with motion allowed and with reduced motion. */
	readonly motion?: MotionOptions;
	/** Write each route's result to `<dir>/check-progress/` as it finishes; `resume` takes the results an earlier run of the same check wrote. */
	readonly progress?: { readonly dir: string; readonly resume: boolean };
	/** Compare each embed on the old page with what the new page has in its place: pixels at rest, hovered and focused, at each viewport in light and dark, then what activating it does. */
	readonly embeds?: Omit<EmbedCheckOptions, 'claimed'>;
	/** Compare each sampled page reached by an in-place navigation (a link click, back, forward) with a fresh load of it, on the new app. */
	readonly navigation?: NavigationOptions;
	/** Lighthouse's mobile page load (FCP, LCP, Speed Index, TBT, CLS and the score), a median of several runs per side, after every other check so nothing else competes for the machine. */
	readonly load?: LoadOptions;
	/** `load`: only page load is measured, after nothing else; `embeds`: only the embed step runs, on each page route; `probes`: only the widget probes and the moved clock; every other dimension is skipped. */
	readonly only?: 'load' | 'embeds' | 'probes';
	/** The widget probes (probes.ts) and the moved-clock look (clock-shift.ts) on each page route; left out when absent. */
	readonly probes?: Omit<ProbeOptions, 'shared'>;
	/** Control parity (control-parity.ts) with the widget probes: controls at each width and their boxes, hit points, pop-up places (in WebKit too with `webkit`), pop-up motion, keys and field input. */
	readonly controls?: Omit<ControlParityOptions, 'webkit'> & { readonly webkit?: boolean };
	/** The busy-CPU lane on each template group's representative: its controls used while the machine's CPUs are kept busy, in Chromium, Firefox and WebKit. */
	readonly busyCpu?: BusyCpuOptions;
	/** How long one route's check (as one role) may take before it is stopped and reported as an infrastructure failure. */
	readonly timeoutMs?: number;
	/** Every route of the old site, each checked for existence on the new app (the coverage dimension). */
	readonly coverage?: readonly string[];
	/** The run checks fewer routes than the plan lists (`total`, null without a plan): the report says so and is never overall green. */
	readonly partial?: { readonly total: number | null };
	/** Above TEMPLATE_THRESHOLD pages, visual, responsiveness and motion run on one representative per template group; false runs them on every page. `patterns` are the source's route patterns. */
	readonly templates?: false | { readonly patterns?: readonly string[]; /** Above how many pages templates are grouped (default TEMPLATE_THRESHOLD). */ readonly threshold?: number; /** Every page of the site when this run checks a shard of it: groups are made over all of them, so a group's representative may be another shard's page. */ readonly site?: readonly string[] };
	/** Where OLD's captures and journeys are kept between runs (`.migrate/cache`), reused only while every response the old page loaded is unchanged. */
	readonly cacheDir?: string;
	/** The report directory: each route's screenshots, diffs and motion frames are written under its `shots` as soon as the route is checked, and the report keeps only their paths. */
	readonly artifactsDir?: string;
	/** Told as each page route's check finishes, with its result as the report will keep it. */
	readonly onRoute?: (result: RouteResult) => void;
	readonly oldRouting?: OldRouting;
}


export const DEFAULT_CONCURRENCY = Math.max(1, Math.min(4, Math.floor(availableParallelism() / 2)));

async function pool<T, R>(items: readonly T[], size: number, task: (item: T) => Promise<R>): Promise<R[]> {
	const out: R[] = new Array(items.length);
	let next = 0;
	const worker = async () => {
		while (next < items.length) {
			const i = next++;
			out[i] = await task(items[i]!);
		}
	};
	await Promise.all(Array.from({ length: Math.max(1, Math.min(size, items.length)) }, worker));
	return out;
}

interface Run {
	readonly old: SideEnv;
	/** OLD's captures and journeys from earlier runs, reused while nothing the old page loads has changed. */
	readonly oldCache?: OldCache;
	/** Which route exercises each shared layout control, as the journeys cache keys it. */
	readonly owners?: readonly (readonly [string, string])[];
	readonly new: SideEnv;
	readonly frozen: boolean;
	readonly source?: SourceFacts;
	readonly sourceDirs?: { readonly old?: string; readonly new?: string };
	readonly journeys?: ExploreOptions;
	readonly switched?: readonly string[];
	readonly responsiveness?: ResponsivenessOptions;
	readonly motion?: MotionOptions;
	readonly embeds?: EmbedCheckOptions;
	readonly probes?: ProbeOptions;
	readonly controls?: ControlParityOptions;
	readonly busyCpu?: BusyCpuOptions & { readonly browsers: { readonly chromium: Browser; readonly firefox: Browser; readonly webkit: Browser } };
}

/** The hosts the old app's API clients name in absolute URLs. */
export function clientHosts(clients: readonly ClientFact[]): Set<string> {
	const hosts = new Set<string>();
	for (const c of clients) for (const u of [...(c.queries ?? []), ...(c.base ? [c.base] : [])]) {
		const url = URL.parse(u);
		if (url && /^https?:$/.test(url.protocol)) hosts.add(url.host);
	}
	return hosts;
}

async function probe(env: SideEnv, url: string): Promise<Probe> {
	try {
		const response = await request(new URL(url, env.origin), { redirect: 'follow', headers: tagHeaders(env) });
		const headers: Record<string, string> = {};
		response.headers.forEach((value, key) => (headers[key] = value));
		const wall = detectChallenge({ status: response.status, headers, body: '' });
		if (wall && DEFINITE.test(wall.evidence)) env.walls?.push({ status: response.status, ...wall });
		await response.body?.cancel();
		return { status: response.status, contentType: mime(response.headers.get('content-type')) };
	} catch (error) {
		// The new app not answering is the network's failure, not a file it lacks: the route is not checked rather than red.
		if (classify(error)) throw error;
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
		const http = await captureRouteHttp(env, route, { 'accept-language': locale, ...tagHeaders(env) }).catch(() => undefined);
		out[locale] = http ? http.chain.at(-1)!.url : '(no response)';
	}
	return out;
}

function routeLocales(capture: RouteCapture, known: readonly string[]): string[] {
	const seo = Object.values(capture.pages)[0]?.seo ?? {};
	const found = Object.keys(seo).flatMap((key) => (key.startsWith('hreflang:') && key !== 'hreflang:x-default' ? [key.slice('hreflang:'.length)] : []));
	return [...new Set([...known, ...found, ...(seo['html:lang'] ? [seo['html:lang']] : [])])].sort();
}

/** Two loads of OLD and one of NEW, and a third of OLD after NEW when the first two differ; OLD's from the cache when nothing it loaded changed since. */
async function loadBoth(browser: Browser, run: Run, route: string, viewports: readonly Viewport[]): Promise<{ olds: RouteCapture[]; next: RouteCapture; loads: readonly string[] }> {
	const key = { route, viewports };
	const cached = await run.oldCache?.read<{ olds: RouteCapture[]; loads: string[]; answers?: StoredAnswer[] }>('captures', run.old, key);
	// The new page gets the third-party answers the cached old page read; one this run already got differently means the old page is loaded again.
	if (cached && (await adoptAnswers(cached.answers ?? []))) {
		for (const page of cached.olds.flatMap((o) => Object.values(o.pages))) shareAnswers(page.network?.records ?? [], run.old.origin);
		if (run.new.liveCounts) await learnLiveCounts(cached.olds, run.new.liveCounts);
		return { olds: cached.olds, loads: cached.loads, next: await steadyWeight(browser, run, route, viewports, cached.olds, await captureRoute(browser, run.new.origin, route, viewports, run.new)) };
	}
	if (cached) run.oldCache?.demote();
	// The OLD loads must not overlap, or time-based noise (clocks, counters) looks stable; the third comes after NEW so it brackets it in time.
	const oldA = await captureRoute(browser, run.old.origin, route, viewports, run.old);
	if (run.new.liveCounts) await learnLiveCounts([oldA], run.new.liveCounts);
	const [oldB, next] = await Promise.all([captureRoute(browser, run.old.origin, route, viewports, run.old), captureRoute(browser, run.new.origin, route, viewports, run.new)]);
	const olds = [oldA, oldB];
	if (loadsDiffer(oldA, oldB)) olds.push(await captureRoute(browser, run.old.origin, route, viewports, run.old));
	const loads = [...new Set(olds.flatMap((o) => Object.values(o.pages).flatMap((p) => pageLoads.get(p) ?? [])))];
	const answers = await storedAnswers([...new Set(olds.flatMap((o) => Object.values(o.pages).flatMap((p) => thirdPartyLoads.get(p) ?? [])))]);
	// A page that heard a live database is that moment's data: it is loaded afresh each run unless the data is replayed.
	if (!olds.some((o) => Object.values(o.pages).some((p) => p.sockets?.length))) await run.oldCache?.write('captures', run.old, key, loads, { olds, loads, answers });
	return { olds, next: await steadyWeight(browser, run, route, viewports, olds, next), loads };
}

/**
 * A page's own start-up can take a longer path on some loads: React hydrating before the streamed data it waits on has
 * arrived suspends and retries, about 2 to 4 kB more code run on one load in five or so of a Next.js page, on either side.
 * The old side's spread comes from two or three loads; the new side's one load over the allowance is loaded once more,
 * and the load that ran less stands, so only code every new load runs is counted against the old page.
 */
async function steadyWeight(browser: Browser, run: Run, route: string, viewports: readonly Viewport[], olds: readonly RouteCapture[], next: RouteCapture): Promise<RouteCapture> {
	const desktop = Object.keys(olds[0]!.pages)[0]!;
	const first = next.pages[desktop];
	if (!first || first.weight.executed <= weightAllowed(olds, 'executed')) return next;
	const again = (await captureRoute(browser, run.new.origin, route, viewports.slice(0, 1), run.new)).pages[desktop];
	if (!again || again.weight.executed >= first.weight.executed) return next;
	const kept: PageCapture = { ...first, weight: again.weight };
	for (const map of [pageLoads, thirdPartyLoads]) if (map.has(first)) map.set(kept, map.get(first)!);
	return { ...next, pages: { ...next.pages, [desktop]: kept } };
}

/** The old page loaded without a stylesheet of its own in every load (a stale snapshot naming a file its host no longer serves): it shows unstyled, so nothing is compared against it and the route is not checked rather than red. */
export function brokenOld(route: string, olds: readonly RouteCapture[]): RouteResult | undefined {
	const missing = (o: RouteCapture) => new Set(Object.values(o.pages).flatMap((p) => p.assets.filter((a) => a.type === 'stylesheet' && (a.status === 0 || a.status >= 400)).map((a) => `${a.url} (${a.status || 'no answer'})`)));
	const [first, ...rest] = olds.map(missing);
	const always = [...(first ?? [])].filter((s) => rest.every((r) => r.has(s)));
	if (!always.length) return undefined;
	return partialResult(route, [], [], undefined, { side: 'old', cause: 'old page broken', message: `OLD: the old page loads without its stylesheet ${always.join(', ')}, so it shows unstyled; serve the old side as it was (a snapshot whose files are all there) and check again` });
}

/** OLD's captures of the route, so a record run can save what OLD fetched. */
const oldCaptures = new WeakMap<RouteResult, RouteCapture>();

export async function checkRoute(browser: Browser, run: Run, route: string, viewports: readonly Viewport[] = VIEWPORTS, locales: readonly string[] = []): Promise<RouteResult> {
	const oldOrigin = run.old.origin;
	const newOrigin = run.new.origin;
	stepsOf(route).total = 3 + [run.probes, run.busyCpu, run.motion, run.responsiveness, run.embeds].filter(Boolean).length;
	const { olds, next, loads } = await profiled(route, 'load both sides', () => loadBoth(browser, run, route, viewports));
	const broken = brokenOld(route, olds);
	if (broken) return broken;
	const oldA = olds[0]!;
	const probes = new Map<string, Probe>();
	const toProbe = assetsToProbe(oldA, next);
	for (const [i, found] of (await pool(toProbe, 8, (url) => probe(run.new, url))).entries()) probes.set(toProbe[i]!, found);
	const languages = routeLocales(oldA, locales);
	const [negotiatedA, negotiatedB, negotiatedNew] = await Promise.all([negotiate(run.old, route, languages), negotiate(run.old, route, languages), negotiate(run.new, route, languages)]);
	const compared = compareRoute(route, olds, next, probes, run.source?.clients);
	const noise = noiseReport(olds, run.frozen, run.source?.nondeterminism);
	const loadWrites = (Object.values(oldA.pages)[0]?.writes ?? []).map((w) => ({ ...w, during: 'page load' }));
	const result = withFailures(compared, [...compared.failures, ...negotiationFailures(route, languages, [negotiatedA, negotiatedB], negotiatedNew)], { noise, writes: loadWrites });
	const owner = storageOwner(olds.flatMap((o) => Object.values(o.pages)), Object.values(next.pages));
	const journeyed = await statesAndJourneys(run, result, (input) => profiled(route, 'forced states', () => checkStates(browser, run, route, viewports, olds, input)), (input) => profiled(route, 'journeys', () => checkJourneys(browser, run, route, viewports[0]!, input, owner, loads)));
	const explored = run.probes ? await profiled(route, 'widget probes', () => probeRoute(browser, run, route, viewports[0]!, journeyed, true)) : journeyed;
	const busy = run.busyCpu ? await profiled(route, 'busy CPU', () => checkBusyCpu(run.busyCpu!.browsers, { old: run.old, new: run.new }, route, viewports[0]!, run.busyCpu)) : undefined;
	const lane = busy?.failures.length ? withFailures(explored, [...explored.failures, ...busy.failures]) : explored;
	const moved = run.motion && lane.journeys?.length ? await profiled(route, 'motion', () => checkMoves(browser, run, route, viewports[0]!, lane, oldA.pages[viewports[0]!.name]?.stylesheets ?? [])) : lane;
	const timed = run.responsiveness && moved.journeys?.length ? await profiled(route, 'responsiveness', () => checkTimings(browser, run, route, moved)) : moved;
	// The page captures already list each side's embeds: a route with none on either side has nothing for the embed step.
	const embedded = [...olds, next].some((capture) => Object.values(capture.pages).some((page) => page.liveEmbeds?.length));
	const checked = run.embeds && embedded ? await profiled(route, 'embeds', () => checkRouteEmbeds(browser, run, route, viewports, timed)) : timed;
	const located = await locateFailures(checked, { route, old: oldA, next, sides: { old: { origin: oldOrigin, dir: run.sourceDirs?.old }, new: { origin: newOrigin, dir: run.sourceDirs?.new } }, ...(run.source ? { facts: run.source } : {}) });
	const done = oldA.http.status < 400 && (next.http.status === 404 || next.http.status === 410) ? { ...located, notPorted: true } : located;
	oldCaptures.set(done, oldA);
	return done;
}

/** The forced CSS states, then the journeys on top. While both apps hold every write back, nothing a journey does can change what a forced state shows, so the two run side by side and the result is the same. */
export async function statesAndJourneys(run: Pick<Run, 'old' | 'new'>, result: RouteResult, states: (input: RouteResult) => Promise<RouteResult>, journeys: (input: RouteResult) => Promise<RouteResult>): Promise<RouteResult> {
	if (run.old.sendWrites || run.new.sendWrites) return journeys(await states(result));
	const [stated, journeyed] = await Promise.allSettled([states(result), journeys(result)]);
	if (stated.status === 'rejected') throw stated.reason;
	if (journeyed.status === 'rejected') throw journeyed.reason;
	const j = journeyed.value;
	return withFailures(stated.value, [...stated.value.failures, ...j.failures.slice(result.failures.length)], { journeys: j.journeys, coverage: j.coverage, writes: j.writes });
}

/** The widget probes of the route's controls, the moved-clock look and control parity, old against new, on top of what the journeys found; pop-up motion is filmed on routes that carry motion. */
async function probeRoute(browser: Browser, run: Pick<Run, 'old' | 'new' | 'probes' | 'controls' | 'motion'>, route: string, viewport: Viewport, result: RouteResult, film = false): Promise<RouteResult> {
	const sides = { old: run.old, new: run.new };
	const clock = await checkClock(browser, sides, route, viewport);
	const out = await checkProbes(browser, sides, route, viewport, result.journeys, run.probes);
	const parity = run.controls
		? await profiled(route, 'control parity', () => checkControlParity(browser, sides, route, viewport, { ...run.controls, film: film && Boolean(run.motion) })).catch((error: Error) => ({ failures: [{ route, dimension: 'behaviour' as const, check: 'control parity', expected: 'control parity runs', actual: error.message.split('\n')[0]!, hint: 'Control parity could not load the route on one side.' }], shots: [], tried: 0, leftOut: 0, ms: 0 }))
		: undefined;
	const failures = [...clock, ...out.failures, ...(parity?.failures ?? [])];
	const shots = parity?.shots.length ? { shots: [...result.shots, ...parity.shots] } : {};
	return { ...(failures.length ? withFailures(result, [...result.failures, ...failures], shots) : { ...result, ...shots }), probes: { controls: out.controls, ms: out.ms }, ...(parity ? { controlParity: { tried: parity.tried, leftOut: parity.leftOut, ms: parity.ms } } : {}) };
}

async function checkRouteEmbeds(browser: Browser, run: Run, route: string, viewports: readonly Viewport[], result: RouteResult): Promise<RouteResult> {
	const out = await checkEmbeds(browser, { old: run.old, new: run.new }, route, viewports, run.embeds!);
	return out.failures.length || out.shots.length ? withFailures(result, [...result.failures, ...out.failures], { shots: [...result.shots, ...out.shots] }) : result;
}

/** One viewport's http, rendered, seo, assets, css, a11y, i18n, network, weight and behaviour checks: what a page gets when its template group's representative carries visual, responsiveness and motion. Every page's own controls are used and compared, whatever its template: two pages alike in layout can hold different widgets. */
export async function checkLight(browser: Browser, run: Run, route: string, viewports: readonly Viewport[] = VIEWPORTS): Promise<RouteResult> {
	const first = [viewports[0]!];
	const { olds, next, loads } = await loadBoth(browser, run, route, first);
	const broken = brokenOld(route, olds);
	if (broken) return broken;
	const oldA = olds[0]!;
	const probes = new Map<string, Probe>();
	const toProbe = assetsToProbe(oldA, next);
	for (const [i, found] of (await pool(toProbe, 8, (url) => probe(run.new, url))).entries()) probes.set(toProbe[i]!, found);
	const compared = compareRoute(route, olds, next, probes, run.source?.clients);
	const kept = compared.failures.filter((f) => !REPRESENTATIVE_ONLY.includes(f.dimension as Dimension));
	const checked = withFailures({ ...compared, visualDiffs: [], shots: [] }, kept, { noise: noiseReport(olds, run.frozen, run.source?.nondeterminism) });
	const skipped = { ...checked, dimensions: { ...checked.dimensions, ...Object.fromEntries(REPRESENTATIVE_ONLY.map((d) => [d, 'skipped'])) } as RouteResult['dimensions'] };
	const owner = storageOwner(olds.flatMap((o) => Object.values(o.pages)), Object.values(next.pages));
	const journeyed = await checkJourneys(browser, run, route, first[0]!, skipped, owner, loads);
	const probed = run.probes ? await probeRoute(browser, run, route, first[0]!, journeyed) : journeyed;
	const located = await locateFailures(probed, { route, old: oldA, next, sides: { old: { origin: run.old.origin, dir: run.sourceDirs?.old }, new: { origin: run.new.origin, dir: run.sourceDirs?.new } }, ...(run.source ? { facts: run.source } : {}) });
	const done = oldA.http.status < 400 && (next.http.status === 404 || next.http.status === 410) ? { ...located, notPorted: true } : located;
	oldCaptures.set(done, oldA);
	return done;
}

// Explores OLD, then replays every journey on OLD again and on NEW; a third OLD replay confirms noise when the first two differ.
// Journeys that end the session or delete run last, each in a fresh session, so what they end or delete cannot change what the others saw.
async function checkJourneys(browser: Browser, run: Run, route: string, viewport: Viewport, result: RouteResult, owner?: StorageOwner, loads: readonly string[] = []): Promise<RouteResult> {
	const key = { route, viewport, budgetMs: run.journeys?.budgetMs, maxJourneys: run.journeys?.maxJourneys, prune: process.env.MARKLESS_MIGRATE_PRUNE === '1', owners: run.owners, switched: run.switched };
	const cached = loads.length ? await run.oldCache?.read<OldJourneys>('journeys', run.old, key) : undefined;
	const explored = cached?.explored ?? (await profiled(route, 'explore old', () => explore(browser, run.old, route, viewport, { ...run.journeys, serves: (path) => isSwitched([route, ...(run.switched ?? [])], path) })));
	if (explored.incomplete) throw new InfrastructureError({ cause: 'incomplete', message: `${explored.incomplete}: the machine ran far slower than the journeys need, so ${route} is not checked rather than compared on fewer of them` });
	const plain = explored.journeys;
	const recorded = plain.map((j) => j.expected);
	const door = { old: run.old.origin, serves: (path: string) => isSwitched([route, ...(run.switched ?? [])], path), ...(run.old.storageState ? { storageState: run.old.storageState } : {}), ...(run.old.signIn ? { signIn: run.old.signIn } : {}) };
	// A hash-routed old server only ever serves its shell, so no request of its pages can be handed to the new app.
	const front: SideEnv = run.old.routing === 'hash' ? run.new : { ...run.new, frontDoor: door };
	const [again, next] = await profiled(route, `replay ${plain.length} journeys old and new`, () => Promise.all([cached ? cached.runs[1]! : replayAll(browser, run.old, route, viewport, plain), replayAll(browser, front, route, viewport, plain)]));
	const runs = cached?.runs ?? [recorded, again];
	// A third old run, for the journeys whose two old runs differed: the others agree, and their second run stands for the third.
	const differing = plain.flatMap((_, j) => (JSON.stringify(recorded[j], unframed) !== JSON.stringify(again[j], unframed) ? [j] : []));
	if (!cached && differing.length) {
		const third = await profiled(route, `third old replay of ${differing.length} journeys`, () => replayAll(browser, run.old, route, viewport, differing.map((j) => plain[j]!)));
		runs.push(plain.map((_, j) => (differing.includes(j) ? third[differing.indexOf(j)]! : again[j]!)));
	}
	const risky = explored.deferred.map((d) => d.journey);
	const [oldRisky, newRisky] = risky.length ? await Promise.all([cached ? cached.oldRisky : replayDestructive(browser, run.old, route, viewport, risky), replayDestructive(browser, front, route, viewport, risky)]) : [[], []];
	// Sent, a delete cannot be done twice; held back, it can, and a second run shows what varies.
	const oldRiskyAgain = cached ? cached.oldRiskyAgain : risky.length && !run.old.sendWrites ? await replayDestructive(browser, run.old, route, viewport, risky) : oldRisky;
	const mine: OldJourneys = { explored, runs, oldRisky, oldRiskyAgain };
	if (!cached && loads.length && clientOnly(mine)) await run.oldCache?.write('journeys', run.old, key, loads, mine);
	const journeys: RecordedJourney[] = [...plain, ...risky.map((j, i) => ({ ...j, expected: oldRisky[i]! }))];
	const olds = runs.map((r, k) => [...r, ...(k === 0 ? oldRisky : oldRiskyAgain)]);
	const elements = explored.elements.map((e) => destructiveCoverage(e, explored.deferred, oldRisky));
	const reachable = await profiled(route, 'unreachable on new', () => unreachableOnBoth(browser, front, route, viewport, elements));
	const writes = journeys.flatMap((j) => j.expected.flatMap((step) => (step.writes ?? []).map((w) => ({ ...w, during: j.name }))));
	const coverage: Coverage = { total: elements.length, exercised: elements.filter((e) => e.by).length, elements, skipped: explored.skipped, ...(explored.sequencesSkipped ? { sequencesSkipped: explored.sequencesSkipped } : {}) };
	const unexercised = [...elements.filter((e) => !e.by && !e.shared).map((e) => notExercised(route, e.element, e.reason ?? 'no journey used it', reachable.get(e.signature))), ...leftOut(route, explored)];
	const doorErrors = await doorPageErrors(browser, run.old, viewport, [...next, ...newRisky]);
	// A theme toggle starts from the OS colour scheme: its cycles run again with the OS in dark mode, twice on old (what varies there may vary) and once on new.
	const dark = themed(plain);
	const darkOld: SideEnv = { ...run.old, colorScheme: 'dark' };
	const [darkOlds, darkNext] = dark.length ? await Promise.all([Promise.all([replayAll(browser, darkOld, route, viewport, dark), replayAll(browser, darkOld, route, viewport, dark)]), replayAll(browser, { ...front, colorScheme: 'dark' }, route, viewport, dark)]) : [[], []];
	const improvements: string[] = [];
	// A page to arrive from that does not load is no reason to drop the route's own result: those journeys are reported as not compared, and the route stays red.
	const arrivedFailures = explored.arrival
		? await profiled(route, 'arrival journeys', () => checkArrived(browser, run, route, viewport, plain, explored.arrival!, owner, improvements)).catch((error: unknown): Failure[] => {
				if (run.old.scope?.closed) throw error;
				return [{ route, dimension: 'behaviour', check: `journeys after arriving from ${explored.arrival!.entry} by ${describeTarget(explored.arrival!.link)}`, expected: 'the route\'s journeys compared after arriving in place', actual: `not compared: ${(error as Error).message.split('\n')[0]}`, hint: HINTS.coverage }];
			})
		: [];
	const mainFailures = await retime(browser, { old: run.old, new: front }, route, viewport, journeys, compareJourneys(route, olds, journeys, [...next, ...newRisky], owner, doorErrors, improvements));
	const darkFailures = dark.length ? compareJourneys(route, darkOlds, inDarkMode(dark), darkNext, owner, doorErrors, improvements) : [];
	const compared = withFailures(result, [...result.failures, ...mainFailures, ...darkFailures, ...arrivedFailures, ...unexercised], { journeys, coverage, writes: [...(result.writes ?? []), ...writes] });
	return improvements.length ? { ...compared, improvements: [...(compared.improvements ?? []), ...improvements] } : compared;
}

// Which pixels a step changed varies a little from run to run; a third run is for steps whose other results differ.
const unframed = (key: string, value: unknown) => (key === 'regions' || key === 'answeredMs' || key === 'shift' ? undefined : value);

/**
 * The route's journeys again, arriving the way a visitor does from another page: that page loads, its link to the route is
 * followed (the router swaps the page in place), then the journey's steps run. Twice on old and once on new, compared alike;
 * a part that only works on a fresh load (one whose script runs once, at load) is red here.
 */
async function checkArrived(browser: Browser, run: Run, route: string, viewport: Viewport, plain: readonly RecordedJourney[], arrival: NonNullable<Exploration['arrival']>, owner: StorageOwner | undefined, improvements: string[]): Promise<Failure[]> {
	const arrive: Step = { action: 'click', target: arrival.link };
	const how = `after arriving from ${arrival.entry} by ${describeTarget(arrival.link)}`;
	// One journey per kind of control is enough to show the parts are wired after the swap: the same control under another nth repeats it.
	const kinds = new Set<string>();
	const distinct = plain.filter((j) => {
		const first = j.steps[0]!;
		const key = `${j.steps.length}|${first.action}|${first.target.role}|${first.target.name}`;
		if (j.cycle || j.destructive || j.pattern || kinds.has(key)) return false;
		kinds.add(key);
		return true;
	});
	const journeys: Journey[] = distinct.slice(0, MAX_ARRIVED).map((j) => ({ name: `${j.name}, ${how}`, steps: [arrive, ...j.steps], start: arrival.entry, ...(j.patience ? { patience: j.patience } : {}) }));
	if (!journeys.length) return [];
	const [a, b, next] = await Promise.all([replayAll(browser, run.old, route, viewport, journeys), replayAll(browser, run.old, route, viewport, journeys), replayAll(browser, run.new, route, viewport, journeys)]);
	return retime(browser, { old: run.old, new: run.new }, route, viewport, journeys, compareJourneys(route, [a, b], journeys, next, owner, undefined, improvements));
}

const RETIMED = 10;
const RETIMES = 2;

/**
 * A step answered more slowly on the new page, or showing a view in between only there, is timed again one side at a time
 * (old, then new, twice), since a busy machine slows whichever side it happens to: it stands only when it happens every time.
 */
async function retime(browser: Browser, sides: { readonly old: SideEnv; readonly new: SideEnv }, route: string, viewport: Viewport, journeys: readonly Journey[], failures: Failure[]): Promise<Failure[]> {
	const slow = failures.filter((f) => timedOnly.has(f)).slice(0, RETIMED);
	if (!slow.length) return failures;
	const dropped = new Set<Failure>();
	const notes = new Map<Failure, string>();
	for (const failure of slow) {
		const { journey, step, views } = timedOnly.get(failure)!;
		const times: { old?: number; next?: number }[] = [];
		const shown: (string | undefined | null)[] = [];
		for (let i = 0; i < RETIMES; i++) {
			const old = (await replay(browser, sides.old, route, viewport, journeys[journey]!).catch(() => []))[step];
			const next = (await replay(browser, sides.new, route, viewport, journeys[journey]!).catch(() => []))[step];
			times.push({ old: old?.reaction?.answeredMs, next: next?.reaction?.answeredMs });
			shown.push(old?.reaction?.views && next?.reaction?.views ? interimViews([old], next) : null);
		}
		if (views) {
			if (shown.some((s) => s === null)) notes.set(failure, '; it could not be timed again one side at a time');
			else if (shown.some((s) => s === undefined)) dropped.add(failure);
			else notes.set(failure, `; timed again one side at a time, the new page showed it every time (${shown.join('; ')})`);
			continue;
		}
		// Timed again only where both sides answered: a step that could not be timed again keeps its failure, unconfirmed.
		if (times.some((t) => t.old === undefined || t.next === undefined)) notes.set(failure, '; it could not be timed again one side at a time');
		else if (times.some((t) => t.next! - t.old! <= 100 || t.next! <= t.old! * 1.5)) dropped.add(failure);
		else notes.set(failure, `; timed again one side at a time: old ${times.map((t) => t.old).join(' and ')} ms, new ${times.map((t) => t.next).join(' and ')} ms`);
	}
	return failures.filter((f) => !dropped.has(f)).map((f) => (notes.has(f) ? { ...f, actual: `${f.actual}${notes.get(f)}` } : f));
}

/** The parts of each route's check that have finished, the ones running and how many it was going to run: what a timed-out route reports. */
const routeSteps = new Map<string, { readonly done: string[]; readonly running: Set<string>; total: number }>();
const stepsOf = (route: string) => routeSteps.get(route) ?? routeSteps.set(route, { done: [], running: new Set(), total: 0 }).get(route)!;

/** How far a route's check got: "steps done 2 of 6 (load both sides, forced states; running: journeys)". */
export function stepsDone(route: string): string {
	const s = stepsOf(route);
	const running = [...s.running];
	return `steps done ${s.done.length} of ${Math.max(s.total, s.done.length + running.length)}${s.done.length || running.length ? ` (${s.done.join(', ')}${running.length ? `${s.done.length ? '; ' : ''}running: ${running.join(', ')}` : ''})` : ''}`;
}

// MARKLESS_MIGRATE_PROFILE=1 prints how long each part of a route's check took, on stderr.
export async function profiled<T>(route: string, part: string, work: () => Promise<T>): Promise<T> {
	const steps = stepsOf(route);
	steps.running.add(part);
	const started = Date.now();
	try {
		return await work();
	} finally {
		steps.running.delete(part);
		steps.done.push(part);
		if (process.env.MARKLESS_MIGRATE_PROFILE) process.stderr.write(`[profile] ${route} ${part}: ${((Date.now() - started) / 1000).toFixed(1)} s\n`);
	}
}

/** What OLD's journeys recorded: the exploration and every replay of it. */
interface OldJourneys {
	readonly explored: Exploration;
	readonly runs: RunResults[];
	readonly oldRisky: RunResults;
	readonly oldRiskyAgain: RunResults;
}

/** OLD's journeys made no request to an app and wrote nothing: what they did is the page's own code, which the page-load fingerprint covers. */
function clientOnly(o: OldJourneys): boolean {
	return [...o.runs, o.oldRisky, o.oldRiskyAgain].every((r) => r.every((steps) => steps.every((step) => !step.requests.length && !step.writes?.length && !step.door)));
}

/** How a control that ends the session or deletes was exercised: by its journey, with the requests it made held back or sent. */
export function destructiveCoverage(e: ElementCoverage, deferred: Exploration['deferred'], results: RunResults): ElementCoverage {
	const at = deferred.findIndex((d) => d.signature === e.signature);
	if (at < 0) return e;
	const journey = deferred[at]!.journey;
	const steps = results[at] ?? [];
	const last = steps.at(-1);
	const { reason: _, ...rest } = e;
	if (!last || last.failed || steps.length < journey.steps.length) return { ...rest, reason: `it could not be used on the old page: ${last?.failed ?? 'the journey stopped before it'}`, ...(last?.unreachable ? { unreachable: { journey, kind: last.unreachable } } : {}) };
	const writes = steps.flatMap((s) => s.writes ?? []);
	const held = writes.filter((w) => !w.sent).map((w) => w.line);
	const how = held.length ? `; held back and compared unsent: ${held.join(', ')}` : writes.length ? '; its writes sent (staging or this machine), in a session of its own' : '';
	return { ...rest, by: `${journey.name}${how}`, journeys: [journey.name] };
}

/** Elements the old page would not let a visitor use, tried on the new page too: the same reason on both is accepted automatically. */
async function unreachableOnBoth(browser: Browser, env: SideEnv, route: string, viewport: Viewport, elements: readonly ElementCoverage[]): Promise<Map<string, NonNullable<Failure['automatic']>>> {
	const tried = elements.filter((e) => e.unreachable && !e.by && !e.shared);
	const out = new Map<string, NonNullable<Failure['automatic']>>();
	if (!tried.length) return out;
	const results = await replayAll(browser, env, route, viewport, tried.map((e) => e.unreachable!.journey));
	tried.forEach((e, i) => {
		const steps = results[i]!;
		const failed = steps.find((r) => r.failed);
		const candidate = unreachableCandidate(e.unreachable!.kind, e.reason ?? '', failed);
		if (candidate) out.set(e.signature, candidate);
	});
	return out;
}

async function checkMoves(browser: Browser, run: Run, route: string, viewport: Viewport, result: RouteResult, sources: readonly StyleSource[]): Promise<RouteResult> {
	const moved = await checkMotion(browser, { old: run.old, new: run.new }, route, viewport, result.journeys ?? [], { ...run.motion, rules: motionRules(parseRules(sources)) });
	return withFailures(result, [...result.failures, ...moved.failures], { motion: moved.motion, ...(moved.filmstrips.length ? { filmstrips: moved.filmstrips } : {}) });
}

async function checkTimings(browser: Browser, run: Run, route: string, result: RouteResult): Promise<RouteResult> {
	// The new app is timed on its own, not through the front door: a link's target is its page as it will serve it.
	const timed = await checkResponsiveness(browser, { old: run.old, new: run.new }, route, (result.journeys ?? []).filter((j) => !j.destructive), run.responsiveness);
	return withFailures(result, [...result.failures, ...timed.failures], { responsiveness: timed.responsiveness });
}

/** Keyboard journeys and repeated-use sequences the budget left out: what they would have compared was compared nowhere, so the route is red until they run. */
export function leftOut(route: string, explored: Pick<Exploration, 'skipped' | 'sequencesSkipped'>): Failure[] {
	const out: Failure[] = [];
	const n = (k: number, what: string) => `${k} ${what}${k === 1 ? '' : 's'}`;
	if (explored.skipped) out.push(notExercised(route, n(explored.skipped, 'keyboard journey'), `left out when the journey budget ran out; raise --max-journeys until they run`));
	if (explored.sequencesSkipped) out.push(notExercised(route, n(explored.sequencesSkipped, 'repeated-use or closing sequence'), `left out when the journey budget ran out; raise --max-journeys until they run`));
	return out;
}

export function notExercised(route: string, element: string, reason: string, automatic?: Failure['automatic']): Failure {
	return { route, dimension: 'behaviour', check: `${NOT_EXERCISED}${element}`, expected: 'a journey that uses it on the old page, replayed on the new one', actual: reason, hint: HINTS.coverage, ...(automatic ? { automatic } : {}) };
}

/** Each shared layout control is exercised by the first route of the run that has it; the others carry its verdict. */
export function shareLayout(results: readonly RouteResult[]): RouteResult[] {
	const byRoute = new Map(results.map((r) => [r.route, r]));
	return results.map((r) => {
		const shared = r.coverage?.elements.filter((e) => e.shared) ?? [];
		if (!shared.length) return r;
		const added: Failure[] = [];
		let exercised = r.coverage!.exercised;
		for (const e of shared) {
			const owner = byRoute.get(e.shared!);
			const theirs = owner?.coverage?.elements.find((o) => o.signature === e.signature);
			if (!theirs || !theirs.by) {
				added.push(notExercised(r.route, `${e.element}, shared with ${e.shared}`, theirs?.reason ?? `${e.shared} was not compared, so its shared controls were not exercised`));
				continue;
			}
			exercised++;
			const names = theirs.journeys ?? [];
			for (const f of owner!.failures) if (names.some((n) => f.check === n || f.check.startsWith(`${n} (step `))) added.push({ ...f, route: r.route, check: `${f.check}, in the layout shared with ${e.shared}` });
		}
		const coverage = { ...r.coverage!, exercised };
		return added.length ? withFailures({ ...r, coverage }, [...r.failures, ...added]) : { ...r, coverage };
	});
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

async function replayRoute(run: Run, dir: string, route: string, shared: Promise<{ set: string; responses: readonly NetworkRecord[] }>): Promise<{ run: Run; failures: Failure[] }> {
	const recording = await readRecording(dir, route);
	if (!recording) {
		return { run, failures: [{ route, dimension: 'network', check: 'recorded data', expected: `a recording in ${dir}`, actual: 'none for this route', hint: HINTS.dataMissing }] };
	}
	const replay = { set: randomUUID(), responses: [...recording.responses, ...restRecords(recording.live)], shared: await shared, ...(recording.live ? { live: recording.live } : {}) };
	const next: Run = { ...run, old: { ...run.old, replay }, new: { ...run.new, replay } };
	const failures: Failure[] = [];
	if (replay.responses.some((r) => r.side === 'server')) {
		// The database's REST answers are offered to a server that reads them; one that does not run the recorder only fails a recording of its own requests.
		const recordedServer = recording.responses.some((r) => r.side === 'server');
		for (const [label, env] of [['old', next.old], ['new', next.new]] as const) {
			if (!(await pushRecording(env)) && recordedServer) failures.push({ route, dimension: 'network', check: `recorded server responses on ${label.toUpperCase()}`, expected: 'served by the request recorder in the server', actual: 'the server does not run the request recorder, so it fetched live data', hint: HINTS.networkRecorder });
		}
	}
	return { run: next, failures };
}

/** The navigation check moves between the checked routes, so on replay it is served every route's recording at once. */
async function navigationRun(run: Run, data: CheckOptions['data'], routes: readonly string[]): Promise<Run> {
	if (data?.mode !== 'replay') return run;
	const recordings = (await Promise.all(routes.map((route) => readRecording(data.dir, route)))).filter((r) => r !== undefined);
	const merged = mergeRecordings(recordings);
	const replay = { set: randomUUID(), responses: [...merged.responses, ...restRecords(merged.live)], ...(merged.live ? { live: merged.live } : {}) };
	const next: Run = { ...run, old: { ...run.old, replay }, new: { ...run.new, replay } };
	if (replay.responses.some((r) => r.side === 'server')) await Promise.all([pushRecording(next.old), pushRecording(next.new)]);
	return next;
}

/** A route that was not compared in full: only `compared` dimensions carry a verdict, the rest are skipped. */
function partialResult(route: string, failures: readonly Failure[], compared: readonly Dimension[], blocked?: Blocked, infrastructure?: Infrastructure): RouteResult {
	const failed = new Set(failures.map((f) => f.dimension));
	const dimensions = Object.fromEntries(DIMENSIONS.map((d) => [d, failed.has(d) ? 'fail' : compared.includes(d) ? 'pass' : 'skipped'])) as RouteResult['dimensions'];
	const zero = { downloaded: 0, source: 0, executed: 0 };
	return { route, ok: false, dimensions, failures, weight: { old: zero, new: zero }, visualDiffs: [], shots: [], ...(blocked ? { blocked } : {}), ...(infrastructure ? { infrastructure } : {}) };
}

/** The route's result when the network failed it (a page that would not load after a retry, an origin that does not resolve or refuses the connection): an infrastructure failure, not the app's; undefined for any other error. */
export function loadTimeout(route: string, error: unknown, [oldOrigin, newOrigin]: readonly [string, string]): RouteResult | undefined {
	const kind = classify(error);
	if (!kind || !(error instanceof Error)) return undefined;
	const origin = error instanceof InfrastructureError ? error.infrastructure.origin : undefined;
	const at = (o: string) => origin !== undefined && new URL(origin).origin === new URL(o).origin;
	const side = oldOrigin === newOrigin ? undefined : at(newOrigin) ? 'new' : at(oldOrigin) ? 'old' : undefined;
	const message = error.message.split('\n')[0]!.split(oldOrigin).join('OLD').split(newOrigin).join('NEW');
	return partialResult(route, [], [], undefined, { ...(side ? { side } : {}), cause: kind.cause, ...(kind.code && kind.code !== 'timeout' ? { code: kind.code } : {}), ...(origin ? { origin } : {}), message: `${side ? `${side.toUpperCase()}: ` : ''}${message}` });
}

/** A route whose check stopped part way (the page navigated away while it was captured, a script broke the page): red with why, and every other route is still checked. */
export function stopped(route: string, error: unknown, [oldOrigin, newOrigin]: readonly [string, string]): RouteResult {
	const message = (error instanceof Error ? error.message : String(error)).split('\n')[0]!.split(oldOrigin).join('OLD').split(newOrigin).join('NEW');
	return partialResult(route, [{ route, dimension: 'http', check: 'the check of this route', expected: 'the check runs to the end', actual: `it stopped: ${message}`, hint: HINTS.checkStopped }], []);
}

/** Default per route check: ten minutes, or five journey budgets when the budget is raised. */
/** What the embed step may add to a route's check: its embeds pictured in every state and scheme, then activated. */
export const EMBED_STEP_BUDGET_MS = 600_000;

export function routeTimeout(options: Pick<CheckOptions, 'timeoutMs' | 'journeys' | 'embeds'>): number {
	return options.timeoutMs ?? Math.max(1_800_000, 5 * (options.journeys?.budgetMs ?? DEFAULT_JOURNEY_BUDGET_MS)) + (options.embeds ? EMBED_STEP_BUDGET_MS : 0);
}

/** Runs one route's check under a deadline: past it, every page the check opened is closed and the route is reported as an infrastructure failure. */
export async function withDeadline(route: string, run: Run, ms: number, work: (run: Run) => Promise<RouteResult>): Promise<RouteResult> {
	routeSteps.delete(route);
	const scope = new Scope();
	const task = work({ ...run, old: { ...run.old, scope }, new: { ...run.new, scope } });
	task.catch(() => {});
	let timer: ReturnType<typeof setTimeout> | undefined;
	const late = new Promise<'late'>((done) => (timer = setTimeout(() => done('late'), ms)));
	try {
		const first = await Promise.race([task, late]);
		if (first !== 'late') return first;
	} finally {
		clearTimeout(timer);
	}
	// A route whose pages were all answered right up to the deadline is not a network failure: it took longer to check than --timeout allows.
	const window = Math.min(30_000, ms / 2);
	const stalled = scope.stalled(window);
	const answers = [scope.sinceAnswer(run.old.origin), scope.sinceAnswer(run.new.origin)];
	const lastAnswer = answers.every((a) => a !== undefined) ? Math.max(...(answers as number[])) : undefined;
	const failedLately = scope.failed > 0 && Date.now() - scope.failed < window;
	const steps = stepsDone(route);
	await scope.close();
	await Promise.race([task.catch(() => {}), new Promise((done) => setTimeout(done, 10_000))]);
	// A request left waiting, one failing, or an app that never answered is the servers' doing; a long part that sends no request (journeys deciding, a busy-CPU lane) is the check's own time.
	if (stalled || failedLately || lastAnswer === undefined) return partialResult(route, [], [], undefined, { cause: 'check timeout', message: `incomplete: timed out after ${Math.round(ms / 1000)} s, ${steps}: ${stalled ? `${stalled.url} had waited ${Math.round((Date.now() - stalled.at) / 1000)} s for an answer` : failedLately ? 'a request failed just before it stopped' : 'an app never answered its pages'}` });
	const answering = lastAnswer < window ? `both apps were still answering (each answered within ${(lastAnswer / 1000).toFixed(1)} s of it stopping)` : `both apps had answered and no request was waiting or had failed (the last answer ${Math.round(lastAnswer / 1000)} s before it stopped)`;
	return partialResult(route, [{ route, dimension: 'http', check: 'the check of this route', expected: 'the check runs to the end', actual: `incomplete: timed out after ${Math.round(ms / 1000)} s, ${steps}; ${answering}`, hint: HINTS.checkOutOfTime }], []);
}

function asRole(result: RouteResult, role: string | undefined): RouteResult {
	return role ? { ...result, role, failures: result.failures.map((f) => ({ ...f, role })) } : result;
}

async function deniedPage(env: SideEnv, http: HttpCapture): Promise<boolean> {
	if (http.status !== 200) return false;
	const url = new URL(http.chain.at(-1)!.url, env.origin);
	const response = await request(url, { headers: tagHeaders(env) }).catch(() => undefined);
	return response ? saysDenied(await bodyText(response, url).catch(() => '')) : false;
}

/** Checks one route as one role: a bot wall stops it, a different access decision is reported without comparing two different pages. */
async function checkAs(browser: Browser, run: Run, route: string, role: string | undefined, logins: readonly string[], options: CheckOptions, light = false): Promise<RouteResult> {
	const [oldWall, newWall] = await Promise.all([probeWall(run.old, route, 'old'), probeWall(run.new, route, 'new')]);
	const wall = oldWall ?? newWall;
	if (wall) return partialResult(route, [], [], wall);
	const gate: Failure[] = [];
	if (role) {
		const [a, b, n] = await Promise.all([captureRouteHttp(run.old, route, tagHeaders(run.old)), captureRouteHttp(run.old, route, tagHeaders(run.old)), captureRouteHttp(run.new, route, tagHeaders(run.new))]);
		const guarded = run.source?.guarded?.some((pattern) => matchRoute(pattern, route)) ? { old: { saysDenied: await deniedPage(run.old, a) }, new: { saysDenied: await deniedPage(run.new, n) } } : undefined;
		const decided = accessFailures(route, role, a, n, logins, guarded);
		if (!decided.comparable) return partialResult(route, [...httpFailures(route, [a, b], n), ...decided.failures], ['http', 'auth']);
		gate.push(...decided.failures);
	}
	const walls = { old: [] as WallHit[], new: [] as WallHit[] };
	const watched: Run = { ...run, old: { ...run.old, walls: walls.old }, new: { ...run.new, walls: walls.new } };
	try {
		const checked = light ? await checkLight(browser, watched, route, options.viewports) : await checkRoute(browser, watched, route, options.viewports, options.locales);
		const links = shellRoute(route, run.old.routing) ? await hashLinkFailures(browser, run.new, route, (options.viewports ?? VIEWPORTS)[0]!) : [];
		const result = links.length ? withFailures(checked, [...checked.failures, ...links]) : checked;
		if (result !== checked && oldCaptures.has(checked)) oldCaptures.set(result, oldCaptures.get(checked)!);
		// A wall that started part way through (an asset, a journey's post, a forced state) stops the route like one at the door.
		const hit = walls.old[0] ? ({ side: 'old', ...walls.old[0] } as const) : walls.new[0] ? ({ side: 'new', ...walls.new[0] } as const) : undefined;
		if (hit) return partialResult(route, [], [], blockedResult(hit.side, hit.status, hit));
		if (!gate.length) return result;
		const gated = withFailures(result, [...gate, ...result.failures]);
		const old = oldCaptures.get(result);
		if (old) oldCaptures.set(gated, old);
		return gated;
	} catch (error) {
		if (run.old.scope?.closed) throw error;
		const timedOut = loadTimeout(route, error, [run.old.origin, run.new.origin]);
		if (timedOut) return timedOut;
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
	const saved = (side: 'old' | 'new') => (typeof spec.storageState === 'string' ? spec.storageState : spec.storageState?.[side]);
	const fresh = (side: 'old' | 'new') => (spec.login?.length && !saved(side) ? { signIn: () => signIn(browser, base[side], side, role, spec, auth.dir) } : {});
	const compared = states.new ? compareLogin(role, route, states.old, states.new, base.old.origin, base.new.origin) : undefined;
	const all = [...failures, ...(compared?.failures ?? [])];
	return {
		run: { ...base, old: { ...base.old, storageState: states.old, ...fresh('old') }, new: { ...base.new, ...(states.new ? { storageState: states.new, ...fresh('new') } : {}) } },
		login: { role, ok: all.length === 0, failures: all, cookies: compared?.cookies ?? { old: [], new: [] } },
	};
}

/** Which route exercises each shared layout control: the first, in the order the routes were given, that has it. */
// About as many controls as a route's journey budget exercises at its default (49 on ui.shadcn.com's home page, its heaviest).
const ROUTE_ROOM = 40;

async function layoutOwners(browser: Browser, run: Run, routes: readonly string[], options: CheckOptions): Promise<Map<string, string>> {
	const viewport = (options.viewports ?? VIEWPORTS)[0]!;
	// A survey that fails once is tried again: an empty survey hands its route's shared controls to another route.
	const found = await pool(routes, options.concurrency ?? DEFAULT_CONCURRENCY, (route) => survey(browser, run.old, route, viewport).catch(() => survey(browser, run.old, route, viewport)).catch(() => ({ layout: [] as string[], own: 0 })));
	// The first route with room exercises a shared control, so one page full of its own controls does not leave
	// every shared one to run out of its budget; past every route's room, the least loaded takes it.
	const load = found.map((f) => f.own);
	const having = new Map<string, number[]>();
	routes.forEach((_, i) => {
		for (const signature of found[i]!.layout) (having.get(signature) ?? having.set(signature, []).get(signature)!).push(i);
	});
	const owners = new Map<string, string>();
	for (const [signature, at] of having) {
		const i = at.find((k) => load[k]! < ROUTE_ROOM) ?? at.reduce((a, b) => (load[b]! < load[a]! ? b : a));
		load[i]!++;
		owners.set(signature, routes[i]!);
	}
	return owners;
}

export async function runCheck(options: CheckOptions): Promise<Report> {
	const startedAt = new Date().toISOString();
	resetSharedAnswers();
	const browser = options.browser ?? (await chromium.launch({ ...LAUNCH, ignoreDefaultArgs: [...LAUNCH.ignoreDefaultArgs] }));
	const freeze: FreezeOptions | false = options.freeze === false ? false : { ...DEFAULT_FREEZE, ...options.freeze };
	const bypass = { ...(options.headers ? { headers: options.headers } : {}), ...(options.cookies?.length ? { cookies: options.cookies } : {}), ...(options.userAgent ? { userAgent: options.userAgent } : {}) };
	const dataHosts = clientHosts(options.source?.clients ?? []);
	const shared = { freeze, block: blocker(options.block), sendWrites: writesAllowed(options), writeFacts: options.source?.writes ?? [], ...(options.data ? { renderFresh: true } : {}), ...(dataHosts.size ? { dataHosts } : {}), ...(options.serverClock && freeze ? { serverClock: true } : {}), ...bypass };
	const artifacts = options.artifactsDir ? new RouteArtifacts(options.artifactsDir, options.oldOrigin) : undefined;
	const oldCache = options.cacheDir ? new OldCache(join(options.cacheDir, 'old'), { block: options.block ?? null }) : undefined;
	const webkitBrowser = options.controls?.webkit ? await webkit.launch().catch((error: Error) => {
		throw new Error(`control parity compares pop-up places in WebKit, which did not start (${error.message.split('\n')[0]}): install it with \`npx playwright install webkit\`, or leave out --control-webkit`);
	}) : undefined;
	const laneBrowsers = options.busyCpu ? await Promise.all([firefox.launch(), webkitBrowser ?? webkit.launch()]).catch((error: Error) => {
		throw new Error(`the busy-CPU lane uses Firefox and WebKit, which did not start (${error.message.split('\n')[0]}): install them with \`npx playwright install firefox webkit\`, or leave out --busy-cpu`);
	}) : undefined;
	const base: Run = { old: defaultEnv(options.oldOrigin, { ...shared, ...(options.oldRouting ? { routing: options.oldRouting } : {}) }), new: defaultEnv(options.newOrigin, { ...shared, liveCounts: new Map<string, string>() }), frozen: Boolean(freeze), ...(oldCache ? { oldCache } : {}), ...(options.responsiveness ? { responsiveness: options.responsiveness } : {}), ...(options.motion ? { motion: options.motion } : {}), ...(options.embeds ? { embeds: { ...options.embeds, claimed: new Map<string, string>() } } : {}), ...(options.probes ? { probes: options.probes } : {}), ...(options.controls ? { controls: { ...options.controls, webkit: webkitBrowser } } : {}), ...(options.busyCpu && laneBrowsers ? { busyCpu: { ...options.busyCpu, browsers: { chromium: browser, firefox: laneBrowsers[0], webkit: laneBrowsers[1] } } } : {}), ...(options.switched ? { switched: options.switched } : {}), ...(options.source ? { source: options.source } : {}), ...(options.sourceDirs ? { sourceDirs: options.sourceDirs } : {}) };
	const auth = options.auth;
	const roles: (string | undefined)[] = auth ? [ANONYMOUS, ...Object.keys(auth.roles)] : [undefined];
	const logins: LoginResult[] = [];
	const loginPaths = auth ? loginRoutes(auth) : [];
	try {
		const routes: RouteResult[] = [];
		const unreachable = (route: string) => (error: unknown) => loadTimeout(route, error, [options.oldOrigin, options.newOrigin]) ?? stopped(route, error, [options.oldOrigin, options.newOrigin]);
		const endpoints = new Set(options.endpoints ?? []);
		const redirects = new Set(options.redirects ?? []);
		const kinds = await pool(options.routes, 8, async (route) => {
			const http = await captureRouteHttp(base.old, route, tagHeaders(base.old)).catch((error: unknown) => (classify(error) ? ('unreachable' as const) : undefined));
			if (http === 'unreachable') return 'page';
			// A route the old app redirects off its own origin is compared by its status and redirect chain: the page it lands on
			// is another site's. (A same-origin redirect, a login guard or a locale, still checks the page it shows.)
			if (http && http.chain.length > 1 && new URL(http.chain.at(-1)!.url, options.oldOrigin).origin !== new URL(options.oldOrigin).origin) return 'redirect';
			return isPage(http?.contentType ?? '') ? 'page' : 'endpoint';
		});
		options.routes.forEach((route, i) => {
			if (kinds[i] === 'endpoint') endpoints.add(route);
			if (kinds[i] === 'redirect') redirects.add(route);
		});
		const allPages = options.routes.filter((route) => !endpoints.has(route) && !redirects.has(route));
		const groupPages = options.templates !== false && options.templates?.site ? [...new Set([...options.templates.site, ...allPages])] : allPages;
		const groups: TemplateGroup[] = options.templates !== false && groupPages.length > (options.templates?.threshold ?? TEMPLATE_THRESHOLD) ? await groupTemplates(base.old, groupPages, options.templates?.patterns) : [];
		const groupOf = new Map(groups.filter((g) => g.members.length > 1).flatMap((g) => g.members.map((m) => [m, g] as const)));
		const light = (route: string) => groupOf.has(route) && groupOf.get(route)!.representative !== route;
		const withTemplate = (result: RouteResult): RouteResult => {
			const group = groupOf.get(result.route);
			return group ? { ...result, template: { pattern: group.pattern, representative: group.representative, members: group.members.length } } : result;
		};
		const coverages: RouteCoverage[] = [];
		const wasteReferences: WasteReport[] = [];
		const navigation: NavigationResult[] = [];
		for (const role of roles) {
			let roleRun = base;
			if (auth && role && role !== ANONYMOUS) {
				const signed = await signInAs(browser, base, role, auth.roles[role]!, auth, options.authStateDir);
				logins.push(signed.login);
				if (!signed.run) continue;
				roleRun = signed.run;
			}
			// A widget is shared only among one role's routes: a signed-in visitor may meet another one behind the same markup.
			if (roleRun.probes) roleRun = { ...roleRun, probes: { ...roleRun.probes, shared: new Map<string, SharedProbe>() } };
			if (options.only === 'load') {
				if (!role || role === ANONYMOUS) routes.push(...allPages.map((route) => withTemplate({ ...partialResult(route, [], []), ok: true, only: 'load' as const })));
				continue;
			}
			if (options.only === 'embeds') {
				const step: EmbedCheckOptions = { ...(options.embeds ?? {}), claimed: new Map<string, string>() };
				const viewports = options.viewports ?? VIEWPORTS;
				for (const route of allPages) {
					const out = await checkEmbeds(browser, { old: roleRun.old, new: roleRun.new }, route, viewports, step).catch((error: Error) => ({ failures: [{ route, dimension: 'rendered' as const, check: 'embed step', expected: 'the embed step runs', actual: error.message.split('\n')[0]!, hint: 'The embed step could not load the route on one side.' }], shots: [], results: [] }));
					const result = { ...partialResult(route, out.failures, [...new Set(out.failures.map((f) => f.dimension as Dimension))]), shots: out.shots, only: 'embeds' as const };
					routes.push(asRole(withTemplate({ ...result, ok: out.failures.length === 0 }), role));
				}
				continue;
			}
			if (options.only === 'probes') {
				const probing = { ...roleRun, probes: roleRun.probes ?? { shared: new Map<string, SharedProbe>() } };
				const viewport = (options.viewports ?? VIEWPORTS)[0]!;
				for (const route of allPages) {
					const empty = { ...partialResult(route, [], ['behaviour', 'a11y', 'rendered']), ok: true };
					const result = await probeRoute(browser, probing, route, viewport, empty).catch((error: Error) => partialResult(route, [{ route, dimension: 'behaviour', check: 'the widget probes', expected: 'the widget probes run', actual: error.message.split('\n')[0]!, hint: 'The widget probes could not load the route on one side.' }], []));
					routes.push(asRole(withTemplate({ ...result, ok: result.failures.length === 0, only: 'probes' as const }), role));
				}
				continue;
			}
			const oldLanding = (env: SideEnv) => (route: string) => landing(browser, env, route, (options.viewports ?? VIEWPORTS)[0]!);
			if (options.coverage) coverages.push(await checkCoverage(roleRun.old, roleRun.new, options.coverage, role, oldLanding(roleRun.old)));
			const data = options.data && role && role !== ANONYMOUS ? { ...options.data, dir: join(options.data.dir, slug(role)) } : options.data;
			const shared = data?.mode === 'replay' ? everyRecording(data.dir).then((responses) => ({ set: randomUUID(), responses })) : undefined;
			const pages = allPages;
			const full = pages.filter((route) => !light(route));
			const owners = full.length > 1 ? await layoutOwners(browser, roleRun, full, options) : new Map<string, string>();
			roleRun = { ...roleRun, owners: [...owners].sort(), journeys: { ...options.journeys, owner: (signature) => owners.get(signature.split(' > ')[0]!) } };
			const progress = options.progress && artifacts ? new CheckProgress(options.progress.dir, { old: options.oldOrigin, new: options.newOrigin, routes: [...options.routes].sort(), role, freeze, block: options.block ?? null, motion: options.motion ?? null, responsiveness: options.responsiveness ?? null, journeys: options.journeys ?? null, only: options.only ?? null, templates: options.templates ?? null, data: options.data?.mode ?? null }, options.progress.resume) : undefined;
			const checked = await pool(pages, options.concurrency ?? DEFAULT_CONCURRENCY, async (route) => {
				const earlier = await progress?.done(route, role);
				if (earlier) {
					options.onRoute?.(earlier);
					return earlier;
				}
				const { run, failures } = data?.mode === 'replay' ? await replayRoute(roleRun, data.dir, route, shared!) : { run: roleRun, failures: [] };
				const done = await withDeadline(route, run, routeTimeout(options), (scoped) => checkAs(browser, scoped, route, role, loginPaths, options, light(route))).catch(unreachable(route));
				const old = oldCaptures.get(done);
				oldCaptures.delete(done);
				forgetFailures(done.failures);
				if (data?.mode === 'record' && old) {
					const first = Object.values(old.pages)[0];
					const records = first?.network?.records ?? [];
					const live = await recordLive(browser, run.old, route, first?.sockets ?? [], data.liveWindowMs ?? 0, (options.viewports ?? VIEWPORTS)[0]!);
					await writeRecording(data.dir, { route, recordedFrom: options.oldOrigin, at: startedAt, responses: recordable(records), ...(live ? { live } : {}) });
				}
				const result = withTemplate(done);
				const checkedAs = asRole(failures.length ? withFailures(result, [...failures, ...result.failures]) : result, role);
				const kept = artifacts ? await artifacts.keep(checkedAs) : checkedAs;
				await progress?.write(route, role, kept);
				options.onRoute?.(kept);
				return kept;
			});
			const navRun = options.navigation ? await navigationRun(roleRun, data, pages) : undefined;
			const navigated = navRun ? await checkNavigation(browser, navRun.new, pages, { concurrency: options.concurrency ?? DEFAULT_CONCURRENCY, old: navRun.old, ...options.navigation }) : undefined;
			if (navigated) navigation.push(navigated);
			const compared = navigated ? applyNavigation(shareLayout(checked), navigated) : shareLayout(checked);
			routes.push(...(artifacts ? await Promise.all(compared.map((r) => artifacts.keep(r))) : compared));
			for (const route of endpoints) routes.push(asRole(await checkEndpoint(roleRun, route).catch(unreachable(route)), role));
			for (const route of redirects) routes.push(asRole(await checkRedirect(roleRun, route, oldLanding(roleRun.old)).catch(unreachable(route)), role));
		}
		if ((options.load && options.only !== 'embeds') || options.only === 'load') {
			const anonymous = (r: RouteResult) => !r.role || r.role === ANONYMOUS;
			const loadable = routes.filter((r) => anonymous(r) && !r.endpoint && !r.blocked && !r.infrastructure && !r.notPorted && !light(r.route) && allPages.includes(r.route));
			const bypassed = Boolean(options.headers && Object.keys(options.headers).length) || Boolean(options.cookies?.length);
			const routesToLoad = [...new Set(loadable.map((r) => r.route))];
			// The bypass token goes to the two apps' origins alone; PageSpeed Insights, which cannot carry it, is left out.
			const bypass = bypassed ? { origins: [options.oldOrigin, options.newOrigin], ...(options.headers ? { headers: options.headers } : {}), ...(options.cookies?.length ? { cookies: options.cookies } : {}) } : undefined;
			const loads = await measureLoad({ old: options.oldOrigin, new: options.newOrigin }, routesToLoad, { ...(options.block ? { block: options.block } : {}), ...options.load, ...(bypass ? { bypass } : {}) });
			const psiOptions = options.load?.psi;
			if (psiOptions !== false && !bypassed) {
				const key = psiOptions?.key ?? psiKey();
				for (const [route, load] of loads) loads.set(route, { ...load, psi: await measurePsi({ old: options.oldOrigin, new: options.newOrigin }, route, { ...psiOptions, ...(key ? { key } : {}) }) });
			}
			const networkOptions = options.load?.network;
			if (networkOptions) {
				// The proxy cannot add a bypass token to https requests it only tunnels.
				const measured = bypassed ? undefined : await measureRoutesNetwork({ old: options.oldOrigin, new: options.newOrigin }, [...loads.keys()], { afterAnswerMs: CHECK_AFTER_ANSWER_MS, timeoutMs: CHECK_RUN_TIMEOUT_MS, ...networkOptions });
				for (const [route, load] of loads) loads.set(route, { ...load, network: measured?.get(route) ?? { unavailable: 'not measured: --header and --cookie cannot be sent through the throttling proxy' } });
			}
			const wasteOptions = options.load?.waste;
			if (wasteOptions) {
				const control = networkOptions?.control ? { control: networkOptions.control } : {};
				for (const [route, load] of loads) {
					const waste = bypassed ? { unavailable: 'not measured: --header and --cookie cannot be sent through the throttling proxy' } : await measureWaste(new URL(route, options.newOrigin).href, { ...wasteOptions, ...control }).catch((error: Error) => ({ unavailable: error.message.split('\n')[0]! }));
					loads.set(route, { ...load, waste });
				}
				for (const url of wasteOptions.references ?? []) wasteReferences.push(await measureWaste(url, wasteOptions));
			}
			routes.forEach((r, i) => {
				const load = anonymous(r) ? loads.get(r.route) : undefined;
				if (!load) return;
				// Real PageSpeed Insights, when it answered, is the gate; the calibrated lab stands in for it otherwise.
				const failures = [...r.failures, ...(psiFailures(r.route, load.psi) ?? loadFailures(r.route, load)), ...networkFailures(r.route, load.network)];
				routes[i] = r.only ? { ...r, load, failures, ok: failures.length === 0, dimensions: { ...r.dimensions, load: failures.length ? 'fail' : 'pass' } } : withFailures(r, failures, { load });
			});
		}
		const sources = options.source?.nondeterminism.map((f) => ({ ...f, pinned: pinnedBy(`${f.kind} ${f.what ?? ''}`, f.side, freeze) }));
		const coverage = options.coverage ? mergeCoverage(coverages) : undefined;
		const checkedCount = new Set([...options.routes, ...(options.redirects ?? []), ...(options.endpoints ?? [])]).size;
		const grouped = groups.filter((g) => g.members.length > 1 && g.members.some((m) => allPages.includes(m)));
		return applyAccepted({
			version: 1,
			old: options.oldOrigin,
			new: options.newOrigin,
			startedAt,
			ok: routes.every((r) => r.ok) && logins.every((l) => l.ok),
			routes,
			pinned: [...pinnedSummary(freeze), ...pinnedCounts(base.new.liveCounts ?? new Map())],
			...(sources ? { sources } : {}),
			...(options.data ? { data: options.data } : {}),
			writes: shared.sendWrites ? 'sent' : 'held back',
			...(auth ? { roles: roles as string[], logins } : {}),
			...(options.unchecked?.length ? { unchecked: options.unchecked } : {}),
			...(options.responsiveness ? { responsiveness: summarizeResponsiveness(routes, options.responsiveness) } : {}),
			...(coverage ? { coverage } : {}),
			...(options.partial ? { partial: { checked: checkedCount, total: options.partial.total } } : {}),
			...(grouped.length ? { templates: { groups: grouped.map((g) => ({ pattern: g.pattern, representative: g.representative, members: g.members })) } } : {}),
			...(wasteReferences.length ? { wasteReferences } : {}),
			...(oldCache ? { cache: { ...oldCache.counts } } : {}),
			...(navigation.length ? { navigation: { destinations: navigation.reduce((n, r) => n + r.destinations.length, 0), pairs: navigation.reduce((n, r) => n + r.pairs.length, 0), inPlace: navigation.reduce((n, r) => n + r.pairs.filter((p) => p.inPlace).length, 0), loads: navigation.reduce((n, r) => n + r.loads, 0), ms: navigation.reduce((n, r) => n + r.ms, 0) } } : {}),
		}, options.accepted ?? [], options.automaticOff ?? []);
	} finally {
		if (!options.browser) await browser.close();
		await webkitBrowser?.close();
		await laneBrowsers?.[0].close();
		if (!webkitBrowser) await laneBrowsers?.[1].close();
	}
}

export function jsonReport(report: Report, diffs: Readonly<Record<string, string[]>> = {}) {
	return { ...report, routes: report.routes.map(({ visualDiffs: _, shots: __, filmstrips: ___, journeys, storedJourneys, ...route }) => ({ ...route, visualDiffs: diffs[route.route] ?? [], journeys: journeys?.length ?? storedJourneys?.names.length ?? 0 })) };
}

export async function writeReport(report: Report, dir: string, status?: Status): Promise<string> {
	await mkdir(dir, { recursive: true });
	const put = (png: Png, file: string) => (Buffer.isBuffer(png) ? writeFile(file, png) : copyFile(png.path, file));
	const diffs: Record<string, string[]> = {};
	for (const route of report.routes) {
		for (const diff of route.visualDiffs) {
			const file = join(dir, 'diffs', `${slug(route.route)}.${diff.viewport}.png`);
			await mkdir(join(dir, 'diffs'), { recursive: true });
			await put(diff.png, file);
			(diffs[route.route] ??= []).push(file);
		}
	}
	for (const route of report.routes) {
		const file = journeysFile(dir, route.route);
		if (!route.journeys?.length && (!route.storedJourneys || resolve(route.storedJourneys.path) === resolve(file))) continue;
		await mkdir(dirname(file), { recursive: true });
		await (route.journeys?.length ? writeFile(file, journeysJson(route.route, report.old, route.journeys)) : copyFile(route.storedJourneys!.path, file));
	}
	const path = join(dir, 'report.json');
	// Written a route at a time: a whole run's report as one string (65 MB of JSON and 80 MB of HTML on a large site) ran the checker out of heap at its very end.
	await streamTo(path, jsonReportParts(report, diffs));
	const shots = resolve(dir, SHOTS_DIR);
	const images = new Map<string, Png>();
	await streamTo(join(dir, 'report.html'), renderHtmlParts(report, (png) => {
		const name = Buffer.isBuffer(png) ? shotName(png) : `${SHOTS_DIR}/${basename(png.path)}`;
		if (Buffer.isBuffer(png) || resolve(dirname(png.path)) !== shots) images.set(name, png);
		return name;
	}, status));
	if (images.size) await mkdir(shots, { recursive: true });
	for (const [name, png] of images) await put(png, join(dir, name));
	return path;
}

/** report.json in pieces, one route at a time. */
export function* jsonReportParts(report: Report, diffs: Readonly<Record<string, string[]>> = {}): Generator<string> {
	const { routes, ...top } = jsonReport(report, diffs);
	const head = JSON.stringify(top, null, '\t');
	yield `${head.slice(0, -2)},\n\t"routes": [`;
	for (const [i, r] of routes.entries()) yield `${i ? ',' : ''}\n\t\t${JSON.stringify(r)}`;
	yield '\n\t]\n}\n';
}

/** Writes the pieces to a stream one after another, waiting for each to drain, so no more than a piece is held. */
export async function writePieces(out: NodeJS.WritableStream, pieces: Iterable<string>): Promise<void> {
	for (const piece of pieces) if (!out.write(piece)) await new Promise<void>((drained) => out.once('drain', () => drained()));
}

async function streamTo(file: string, pieces: Iterable<string>): Promise<void> {
	const out = createWriteStream(file);
	const done = new Promise<void>((resolveDone, reject) => {
		out.on('finish', resolveDone);
		out.on('error', reject);
	});
	await writePieces(out, pieces);
	out.end();
	await done;
}
