import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import { availableParallelism } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { chromium, firefox, webkit, type Browser } from 'playwright';
import { Relauncher } from '../convert/relaunch.ts';
import { digest } from '../data/codec.ts';
import { recording, RouteLog, type Producers } from '../data/rows.ts';
import { conditionsId, type Conditions } from '../data/original/dataset.ts';
import { originalAnswers, originalJourneys, originalLoads, originalRoute, originalStates, type OriginalJourneys } from '../data/original/read.ts';
import { DatasetError, type Dataset } from '../data/original/store.ts';
import { GuardedObservations, type Observations } from '../data/observations.ts';
import { checkEmbeds, type EmbedCheckOptions } from '../embed/check.ts';
import { matchRoute } from '../source/pattern.ts';
import { isSwitched } from '../switch/state.ts';
import type { Status } from '../status.ts';
import type { Accept } from './accepted.ts';
import { joinRounds, plannedLoad, readParts, readPlan, sliceJourneys, SliceDone, writePart, writePlan, type Slicing } from './journey-slices.ts';
import { journeysFile, journeysJson, RouteArtifacts, SHOTS_DIR, shotName, type Png } from './artifacts.ts';
import type { AutomaticRule } from './automatic.ts';
import { accessFailures, compareLogin, loginRoutes, saveState, saysDenied, signIn, type AuthConfig, type RoleSpec } from './auth.ts';
import { detectChallenge } from './blocked.ts';
import { adoptAnswers, DEFINITE, defaultEnv, isLoopback, LAUNCH, offerAnswers, probeWall, pushRecording, resetSharedAnswers, shareAnswers, storedAnswers, tagHeaders, type SideEnv, type StorageState, type StoredAnswer, type WallHit } from './browser.ts';
import { checkBusyCpu, type BusyCpuOptions } from './busy-cpu.ts';
import { OldCache } from './cache.ts';
import { captureRoute, captureRouteHttp, landing, mime, pageLoads, thirdPartyLoads } from './capture.ts';
import { checkClock } from './clock-shift.ts';
import { forgetFailures, httpFailures, weightAllowed, type Probe } from './compare.ts';
import { observeControlParity, type ControlParityOptions } from './control-parity.ts';
import { checkCoverage } from './coverage-check.ts';
import { everyRecording, readRecording, recordable, slug, writeRecording } from './data.ts';
import { checkEndpoint, checkRedirect, isPage } from './endpoints.ts';
import { DEFAULT_FREEZE, type FreezeOptions } from './freeze.ts';
import { layoutOwners, LAYOUT_SURVEY_VERSION, surveyRows, type LayoutSurvey, type SurveyRow } from './layout-survey.ts';
import { hashLinkFailures } from './hash-links.ts';
import type { OldRouting } from './hash-routes.ts';
import { HINTS } from './hints.ts';
import { renderHtmlParts } from './html.ts';
import { classify, InfrastructureError, Scope } from './infrastructure.ts';
import { themed } from './journeys-compare.ts';
import { DEFAULT_JOURNEY_BUDGET_MS, doorPageErrors, explore, replay, replayAll, replayDestructive, survey, type Exploration, type ExploreOptions, type Run as RunResults } from './journeys.ts';
import { learnLiveCounts, pinnedCounts } from './live-counts.ts';
import { mergeRecordings, recordLive, restRecords } from './live-record.ts';
import { measureLoad, type LoadOptions } from './load.ts';
import { locateFailures } from './locate.ts';
import { motionRules, type MotionOptions } from './motion-compare.ts';
import { observeMotion } from './motion.ts';
import { checkNavigation, type NavigationOptions, type NavigationResult } from './nav-parity.ts';
import { contractLines, type NetworkRecord } from './network.ts';
import { observeProbes, type ProbeOptions, type SharedProbe } from './probes.ts';
import { CheckProgress } from './progress.ts';
import { measurePsi, psiKey } from './psi.ts';
import { applyLoads, asRole, embedsOnly, finishReport, jsonReport, loadable, outOfPart, roleCompared, routeOutcome, templateGroups, withTemplate, type RunEvent, type RunHeader } from './report-judge.ts';
import { checkResponsiveness, type ResponsivenessOptions } from './responsiveness.ts';
import { deadlineResult, destructiveCoverage, loadTimeout, partialResult, probesOnly, roleCheck, stopped, unreachableAlike, unreachableTried, type Deadline, type JourneysRow, type RouteContext, type RouteStages } from './route-judge.ts';
import { selfUrlFailures } from './self-urls.ts';
import { CHECK_AFTER_ANSWER_MS, CHECK_RUN_TIMEOUT_MS, measureRoutesNetwork } from './slow-network.ts';
import type { ClientFact, SourceFacts } from './source-facts.ts';
import { mapRules } from './sourcemap.ts';
import { stateNoise, type StatesRequest, type StatesRow, type StatesViewportRow } from './states-compare.ts';
import { explainDefaults, observeStates, observeStatesAgainst } from './states.ts';
import { discoverStates, parseRules } from './stylesheet.ts';
import { groupTemplates, TEMPLATE_THRESHOLD, type TemplateGroup } from './templates.ts';
import { blocker, type BlockList } from './trackers.ts';
import { ANONYMOUS, VIEWPORTS, type Failure, type HttpCapture, type LoginResult, type PageCapture, type Report, type RouteCapture, type RouteCoverage, type RouteResult, type Viewport } from './types.ts';
import { measureWaste, type WasteReport } from './waste.ts';
import { observeMedia } from './media.ts';
import type { InventoryRoutes, Served } from './unlisted.ts';
import { bodyText, request } from './http.ts';

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
	readonly journeys?: Pick<ExploreOptions, 'budgetMs' | 'maxJourneys' | 'maxDepth'>;
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
	/** Every picture of each page compared again at every width once the page was scrolled through and they loaded. */
	readonly media?: boolean;
	/** Every route the plan lists and the source's route patterns: a page the original serves that a checked page links to, or its journeys reach, and that this does not list, is red. */
	readonly inventory?: InventoryRoutes;
	/** How long one route's check (as one role) may take before it is stopped and reported as an infrastructure failure. */
	readonly timeoutMs?: number;
	/** One part of a route checked across jobs (journey-slices.ts): exploring it, replaying a slice of its journeys, or joining the slices and checking the rest. */
	readonly slicing?: Slicing;
	/** Every route of the old site, each checked for existence on the new app (the coverage dimension). */
	readonly coverage?: readonly string[];
	/** The run checks fewer routes than the plan lists (`total`, null without a plan): the report says so and is never overall green. */
	readonly partial?: { readonly total: number | null };
	/** Above TEMPLATE_THRESHOLD pages, visual, responsiveness and motion run on one representative per template group; false runs them on every page. `patterns` are the source's route patterns. */
	readonly templates?: false | { readonly patterns?: readonly string[]; /** Above how many pages templates are grouped (default TEMPLATE_THRESHOLD). */ readonly threshold?: number; /** Every page of the site when this run checks a shard of it: groups are made over all of them, so a group's representative may be another shard's page. */ readonly site?: readonly string[] };
	/** The site's layout survey (`check --write-layout-survey`), read instead of surveying this run's pages: every shard of a site's check reads the same one, and the merge of the shards gives each route its shared controls' verdicts. */
	readonly layoutSurvey?: LayoutSurvey;
	/** Survey the site's shared layout controls and hand the survey here, checking nothing. */
	readonly writeLayoutSurvey?: (survey: LayoutSurvey) => Promise<void>;
	/** Where OLD's captures and journeys are kept between runs (`.migrate/cache`), reused only while every response the old page loaded is unchanged. */
	readonly cacheDir?: string;
	/** The report directory: each route's screenshots, diffs and motion frames are written under its `shots` as soon as the route is checked, and the report keeps only their paths. */
	readonly artifactsDir?: string;
	/** Told as each page route's check finishes, with its result as the report will keep it. */
	readonly onRoute?: (result: RouteResult) => void;
	readonly oldRouting?: OldRouting;
	/** Where every observation the check makes is written as it is made, for `check judge` to judge again with no browser. */
	readonly observations?: Observations;
	/** The original's dataset (`--original`): the old side's loads and journeys are read from it by route, not observed; timing stays live and paired. */
	readonly original?: Dataset;
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
	readonly original?: Dataset;
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
	readonly media?: boolean;
	readonly inventory?: InventoryRoutes;
	readonly slicing?: Slicing;
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

/** A row the check reads from the original's dataset; one it lacks stops the route as not checked, never observed live instead. */
function fromDataset<T>(route: string, read: () => T): T {
	try {
		return read();
	} catch (error) {
		if (!(error instanceof DatasetError)) throw error;
		throw new InfrastructureError({ cause: 'not in the original dataset', message: `${route}: ${error.message}` });
	}
}

const originalRouteRow = (dataset: Dataset, route: string) => fromDataset(route, () => originalRoute(dataset, route));

/** What the run's conditions are, as an original's dataset names those it was produced under. */
export function originalConditions(options: Pick<CheckOptions, 'viewports' | 'freeze' | 'block' | 'journeys' | 'switched' | 'oldRouting' | 'serverClock' | 'oldOrigin' | 'newOrigin' | 'staging'>, role: string | null = null): Conditions {
	const freeze: FreezeOptions | false = options.freeze === false ? false : { ...DEFAULT_FREEZE, ...options.freeze };
	return {
		viewports: options.viewports ?? VIEWPORTS,
		freeze,
		block: { add: options.block?.add ?? [], allow: options.block?.allow ?? [] },
		sendWrites: writesAllowed(options),
		serverClock: Boolean(options.serverClock && freeze),
		journeys: { ...(options.journeys?.budgetMs !== undefined ? { budgetMs: options.journeys.budgetMs } : {}), ...(options.journeys?.maxJourneys !== undefined ? { maxJourneys: options.journeys.maxJourneys } : {}), ...(options.journeys?.maxDepth !== undefined ? { maxDepth: options.journeys.maxDepth } : {}) },
		switched: [...(options.switched ?? [])].sort(),
		...(options.oldRouting ? { routing: options.oldRouting } : {}),
		role,
	};
}

/** Two loads of OLD and one of NEW, and a third of OLD after NEW when the first two differ; OLD's from the cache when nothing it loaded changed since. */
async function loadBoth(browser: Browser, run: Run, route: string, viewports: readonly Viewport[]): Promise<{ olds: RouteCapture[]; next: RouteCapture; loads: readonly string[] }> {
	const stored = run.original && !originalRouteRow(run.original, route).live?.loads ? fromDataset(route, () => originalLoads(run.original!, route, viewports)) : undefined;
	if (stored) {
		for (const page of stored.olds.flatMap((o) => Object.values(o.pages))) shareAnswers(page.network?.records ?? [], run.old.origin);
		if (run.new.liveCounts) await learnLiveCounts(stored.olds, run.new.liveCounts);
		const olds = [...stored.olds];
		return { olds, loads: stored.loads, next: await steadyWeight(browser, run, route, viewports, olds, await captureRoute(browser, run.new.origin, route, viewports, run.new)) };
	}
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

// Which pixels a step changed varies a little from run to run; a third run is for steps whose other results differ.
const unframed = (key: string, value: unknown) => (key === 'regions' || key === 'answeredMs' || key === 'shift' ? undefined : value);

/** How the old app answers each path: its status after redirects, whether it is an HTML page, and where it landed. */
async function servedPaths(env: SideEnv, paths: readonly string[]): Promise<Served[]> {
	return pool(paths, 8, async (path): Promise<Served> => {
		const http = await captureRouteHttp(env, path, tagHeaders(env)).catch(() => undefined);
		if (!http) return { path, status: 0, page: false, landed: path };
		const landed = new URL(http.chain.at(-1)!.url, env.origin);
		return { path, status: http.status, page: isPage(http.contentType), landed: landed.origin === new URL(env.origin).origin ? `${landed.pathname}${landed.search}` : landed.href };
	});
}

export async function servesPage(env: SideEnv, path: string): Promise<boolean> {
	try {
		const response = await request(new URL(path, env.origin).href, { redirect: 'manual', headers: tagHeaders(env), signal: AbortSignal.timeout(15_000) });
		await response.body?.cancel();
		return response.status < 400;
	} catch {
		return true;
	}
}

const RETIMES = 3;
// With the old side stored, every timing sample is a fresh round: five a side is the fewest a one-sided exact test can reject at.
const FRESH_RETIMES = 5;

/** What each stage of one route's check observes, with the browser and both apps. */
function liveProducers(browser: Browser, run: Run, watched: Run, walls: { readonly old: readonly WallHit[]; readonly new: readonly WallHit[] }, route: string, viewports: readonly Viewport[], logins: readonly string[], seen: { loaded?: RouteStages['load']['value'] } = {}): Producers {
	const viewport = viewports[0]!;
	let loaded: RouteStages['load']['value'] | undefined;
	let loadReq = '';
	let slicedRow: Promise<JourneysRow> | undefined;
	const sliced = () => {
		const sides = steady();
		return (slicedRow ??= slicedJourneys(browser, { ...watched, old: sides.old, new: sides.new }, route, viewport, frontOf(sides.new), watched.slicing!, { req: loadReq, value: load() }));
	};
	const load = () => {
		if (!loaded) throw new Error(`${route} was not loaded before a stage that reads its page loads`);
		return loaded;
	};
	const door = { old: watched.old.origin, serves: (path: string) => isSwitched([route, ...(watched.switched ?? [])], path), ...(watched.old.storageState ? { storageState: watched.old.storageState } : {}), ...(watched.old.signIn ? { signIn: watched.old.signIn } : {}) };
	// A hash-routed old server only ever serves its shell, so no request of its pages can be handed to the new app.
	const frontOf = (next: SideEnv): SideEnv => (watched.old.routing === 'hash' ? next : { ...next, frontDoor: door });
	// What a capture of each side held as a loop (an autoplaying carousel) stays held on every page the route opens after it.
	const timersOf = (captures: readonly RouteCapture[]) => [...new Set(captures.flatMap((c) => Object.values(c.pages).flatMap((p) => p.timers ?? [])))].sort();
	const held = (env: SideEnv, timers: readonly string[]): SideEnv => (timers.length ? { ...env, skipTimers: timers } : env);
	const steady = () => {
		const { olds, next } = load();
		return { old: held(watched.old, timersOf(olds)), new: held(watched.new, timersOf([next])) };
	};
	// A stage a run takes without the page load (--only probes) has no capture to hold loops from.
	const later = () => (loaded ? steady() : { old: watched.old, new: watched.new });
	return {
		wall: async () => {
			const [old, next] = await Promise.all([probeWall(run.old, route, 'old'), probeWall(run.new, route, 'new')]);
			return { ...(old ? { old } : {}), ...(next ? { new: next } : {}) };
		},
		gate: async ({ role }) => {
			const [a, b, n] = await Promise.all([captureRouteHttp(run.old, route, tagHeaders(run.old)), captureRouteHttp(run.old, route, tagHeaders(run.old)), captureRouteHttp(run.new, route, tagHeaders(run.new))]);
			const guarded = run.source?.guarded?.some((pattern) => matchRoute(pattern, route)) ? { old: { saysDenied: await deniedPage(run.old, a) }, new: { saysDenied: await deniedPage(run.new, n) } } : undefined;
			const decided = accessFailures(route, role, a, n, logins, guarded);
			return decided.comparable ? { comparable: true, failures: decided.failures } : { comparable: false, failures: [...httpFailures(route, [a, b], n), ...decided.failures] };
		},
		load: async (request) => {
			loadReq = digest(request);
			if (watched.slicing && watched.slicing.mode !== 'explore') {
				const given = plannedLoad(await readPlan(watched.slicing.dir), request);
				for (const page of given.olds.flatMap((o) => Object.values(o.pages))) shareAnswers(page.network?.records ?? [], watched.old.origin);
				if (watched.new.liveCounts) await learnLiveCounts(given.olds, watched.new.liveCounts);
				return (seen.loaded = loaded = given);
			}
			return (seen.loaded = loaded = await loadBoth(browser, watched, route, request.light ? viewports.slice(0, 1) : viewports));
		},
		assets: async ({ urls }) => {
			const found = await pool(urls, 8, (url) => probe(watched.new, url));
			return urls.map((url, i) => [url, found[i]!] as const);
		},
		negotiate: ({ languages }) => Promise.all([negotiate(watched.old, route, languages), negotiate(watched.old, route, languages), negotiate(watched.new, route, languages)]),
		selfUrls: () => selfUrlFailures(route, Object.values(load().next.pages)[0]?.seo ?? {}, watched.new),
		// Forced states are the joining part's: the exploring and replaying parts end with their journeys part, whichever stage asks first.
		states: (asked) => (watched.slicing && watched.slicing.mode !== 'finish' ? sliced().then((): never => { throw new SliceDone(watched.slicing!.mode, route); }) : observeRouteStates(browser, { ...watched, ...later() }, route, viewports, load().olds, asked)),
		journeys: () => {
			if (watched.slicing) return sliced();
			const sides = steady();
			return observeJourneys(browser, { ...watched, old: sides.old, new: sides.new }, route, viewport, frontOf(sides.new), load().loads);
		},
		arrival: async ({ entry, journeys }) => {
			if (!(await servesPage(watched.new, entry))) return null;
			const sides = steady();
			if (watched.original && !originalRouteRow(watched.original, route).live?.journeys) {
				const stored = fromDataset(route, () => originalJourneys(watched.original!, route)).arrival;
				if (!stored || digest(stored.journeys) !== digest(journeys)) throw new InfrastructureError({ cause: 'not in the original dataset', message: `${route}: the original's dataset holds no replays of the journeys after arriving from ${entry} that this check builds` });
				return { a: stored.runs[0]!, b: stored.runs[1]!, next: await replayAll(browser, sides.new, route, viewport, journeys) };
			}
			const [a, b, next] = await Promise.all([replayAll(browser, sides.old, route, viewport, journeys), replayAll(browser, sides.old, route, viewport, journeys), replayAll(browser, sides.new, route, viewport, journeys)]);
			return { a, b, next };
		},
		retime: ({ set, journey }) => profiled(route, `retime ${set}`, async () => {
			const sides = steady();
			const other = set === 'main' ? frontOf(sides.new) : sides.new;
			const rounds: { old: RunResults[number]; next: RunResults[number] }[] = [];
			for (let i = 0; i < (watched.original ? FRESH_RETIMES : RETIMES); i++) {
				const old = await replay(browser, sides.old, route, viewport, journey).catch(() => []);
				rounds.push({ old, next: await replay(browser, other, route, viewport, journey).catch(() => []) });
			}
			return rounds.map((r) => ({ old: [...r.old], next: [...r.next] }));
		}),
		clock: () => checkClock(browser, later(), route, viewport),
		probes: ({ notify, prefixes }) => observeProbes(browser, later(), route, viewport, notify, watched.probes, prefixes),
		parity: ({ film, webkit }) => observeControlParity(browser, later(), route, viewport, { ...watched.controls, webkit: webkit ? watched.controls?.webkit : undefined, film }),
		busy: () => checkBusyCpu(watched.busyCpu!.browsers, later(), route, viewport, watched.busyCpu),
		motion: ({ journeys }) => observeMotion(browser, later(), route, viewport, journeys, { ...watched.motion, rules: motionRules(parseRules(load().olds[0]!.pages[viewport.name]?.stylesheets ?? [])) }),
		responsiveness: ({ journeys }) => checkResponsiveness(browser, later(), route, journeys, watched.responsiveness),
		embeds: async () => {
			const out = await checkEmbeds(browser, later(), route, viewports, watched.embeds!);
			return { failures: out.failures, shots: out.shots };
		},
		locate: async ({ failures }) => {
			const { olds, next } = load();
			const located = await locateFailures({ failures } as unknown as RouteResult, { route, old: olds[0]!, next, sides: { old: { origin: watched.old.origin, dir: watched.sourceDirs?.old }, new: { origin: watched.new.origin, dir: watched.sourceDirs?.new } }, ...(watched.source ? { facts: watched.source } : {}) });
			return { patches: located.failures.map((f, i) => (f === failures[i] ? null : { ...(f.old ? { old: f.old } : {}), ...(f.new ? { new: f.new } : {}), where: f.where! })), ...(located.newFiles ? { newFiles: located.newFiles } : {}) };
		},
		hashLinks: () => hashLinkFailures(browser, run.new, route, viewport),
		media: ({ viewports: names }) => observeMedia(browser, later(), route, viewports.filter((v) => names.includes(v.name))),
		served: ({ paths }) => servedPaths(watched.old, paths),
		walls: async () => ({ ...(walls.old[0] ? { old: walls.old[0] } : {}), ...(walls.new[0] ? { new: walls.new[0] } : {}) }),
	};
}

// Forces every state the OLD stylesheets style, on the first viewport, and traces each default-state computed style the judge asks about to its OLD rule.
async function observeRouteStates(browser: Browser, run: Run, route: string, viewports: readonly Viewport[], olds: readonly RouteCapture[], asked: StatesRequest): Promise<StatesRow> {
	const sources = olds[0]!.pages[viewports[0]!.name]?.stylesheets ?? [];
	const states = discoverStates(sources);
	const rules = asked.viewports.length ? await mapRules(parseRules(sources), sources, run.old.origin, run.sourceDirs?.old) : [];
	const out: StatesViewportRow[] = [];
	// With the old loads stored, the old half of every state is too: its shots, styles and noise come from one producer run.
	const stored = run.original && !originalRouteRow(run.original, route).live?.loads;
	for (const { name, forced, explain } of asked.viewports) {
		const viewport = viewports.find((v) => v.name === name)!;
		const envs = { old: run.old, new: run.new };
		if (!stored) out.push(await observeStates({ browser, envs, route, viewport, states: forced ? states : [], rules, noise: stateNoise(olds, name), explain }));
		else if (forced) out.push(await observeStatesAgainst({ browser, envs, route, viewport, stored: fromDataset(route, () => originalStates(run.original!, route, name, sources)), rules, explain }));
		else out.push({ viewport: name, explained: await explainDefaults(browser, run.old, route, viewport, rules, explain), base1: [], baseN: [], states: [] });
	}
	return { viewports: out };
}

// Explores OLD, then replays every journey on OLD again and on NEW; a third OLD replay confirms noise when the first two differ.
// Journeys that end the session or delete run last, each in a fresh session, so what they end or delete cannot change what the others saw.
async function observeJourneys(browser: Browser, run: Run, route: string, viewport: Viewport, front: SideEnv, loads: readonly string[]): Promise<JourneysRow> {
	if (run.original && !originalRouteRow(run.original, route).live?.journeys) return storedJourneys(browser, run, route, viewport, front, fromDataset(route, () => originalJourneys(run.original!, route)));
	const key = { route, viewport, budgetMs: run.journeys?.budgetMs, maxJourneys: run.journeys?.maxJourneys, owners: run.owners, switched: run.switched, skipTimers: run.old.skipTimers ?? [] };
	const cached = loads.length ? await run.oldCache?.read<OldJourneys>('journeys', run.old, key) : undefined;
	const explored = cached?.explored ?? (await profiled(route, 'explore old', () => explore(browser, run.old, route, viewport, { ...run.journeys, serves: (path) => isSwitched([route, ...(run.switched ?? [])], path) })));
	if (explored.incomplete) throw new InfrastructureError({ cause: 'incomplete', message: `${explored.incomplete}: the machine ran far slower than the journeys need, so ${route} is not checked rather than compared on fewer of them` });
	const plain = explored.journeys;
	const recorded = plain.map((j) => j.expected);
	const [again, next] = await profiled(route, `replay ${plain.length} journeys old and new`, () => Promise.all([cached ? cached.runs[1]! : replayAll(browser, run.old, route, viewport, plain), replayAll(browser, front, route, viewport, plain)]));
	const runs = cached?.runs ?? [recorded, again];
	// A third old run, for the journeys whose two old runs differed: the others agree, and their second run stands for the third.
	const differing = plain.flatMap((_, j) => (JSON.stringify(recorded[j], unframed) !== JSON.stringify(again[j], unframed) ? [j] : []));
	if (!cached && differing.length) {
		const third = await profiled(route, `third old replay of ${differing.length} journeys`, () => replayAll(browser, run.old, route, viewport, differing.map((j) => plain[j]!)));
		runs.push(plain.map((_, j) => (differing.includes(j) ? third[differing.indexOf(j)]! : again[j]!)));
	}
	return journeysTail(browser, run, route, viewport, front, explored, runs, next, cached, (mine) => (!cached && loads.length && clientOnly(mine) ? run.oldCache?.write('journeys', run.old, key, loads, mine) : undefined));
}

/** The journeys that end the session or delete, the unreachable controls, the pages the new journeys reached and the theme cycles in dark mode, after the replays. */
async function journeysTail(browser: Browser, run: Run, route: string, viewport: Viewport, front: SideEnv, explored: Exploration, runs: RunResults[], next: RunResults, cached?: OldJourneys, keep?: (mine: OldJourneys) => Promise<void> | undefined): Promise<JourneysRow> {
	const plain = explored.journeys;
	const risky = explored.deferred.map((d) => d.journey);
	const [oldRisky, newRisky] = risky.length ? await profiled(route, 'session-ending replays', () => Promise.all([cached ? cached.oldRisky : replayDestructive(browser, run.old, route, viewport, risky), replayDestructive(browser, front, route, viewport, risky)])) : [[], []];
	// Sent, a delete cannot be done twice; held back, it can, and a second run shows what varies.
	const oldRiskyAgain = cached ? cached.oldRiskyAgain : risky.length && !run.old.sendWrites ? await profiled(route, 'session-ending replays', () => replayDestructive(browser, run.old, route, viewport, risky)) : oldRisky;
	await keep?.({ explored, runs, oldRisky, oldRiskyAgain });
	const elements = explored.elements.map((e) => destructiveCoverage(e, explored.deferred, oldRisky));
	const tried = unreachableTried(elements);
	const reachable = await profiled(route, 'unreachable on new', async () => (tried.length ? unreachableAlike(elements, await replayAll(browser, front, route, viewport, tried.map((e) => e.unreachable!.journey))) : []));
	const doorErrors = [...(await doorPageErrors(browser, run.old, viewport, [...next, ...newRisky]))];
	// A theme toggle starts from the OS colour scheme: its cycles run again with the OS in dark mode, twice on old (what varies there may vary) and once on new.
	const dark = themed(plain);
	const darkOld: SideEnv = { ...run.old, colorScheme: 'dark' };
	const darkRuns = dark.length ? await profiled(route, 'dark-mode replays', () => Promise.all([Promise.all([replayAll(browser, darkOld, route, viewport, dark), replayAll(browser, darkOld, route, viewport, dark)]), replayAll(browser, { ...front, colorScheme: 'dark' }, route, viewport, dark)])) : undefined;
	return { explored, runs, next, oldRisky, oldRiskyAgain, newRisky, reachable, doorErrors, ...(darkRuns ? { dark: { olds: darkRuns[0], next: darkRuns[1] } } : {}) };
}


/** A part of a sliced route's journeys (journey-slices.ts): the exploration, one slice's replays, or the slices joined by journey index and the rest observed as an unsliced check does. */
async function slicedJourneys(browser: Browser, run: Run, route: string, viewport: Viewport, front: SideEnv, slicing: Slicing, loaded: { req: string; value: RouteStages['load']['value'] }): Promise<JourneysRow> {
	if (run.oldCache || run.original) throw new Error(`${route}: a sliced check reads no old-side store or dataset`);
	if (slicing.mode === 'explore') {
		const explored = await profiled(route, 'explore old', () => explore(browser, run.old, route, viewport, { ...run.journeys, serves: (path) => isSwitched([route, ...(run.switched ?? [])], path) }));
		await writePlan(slicing.dir, { route, loadReq: loaded.req, load: loaded.value, explored });
		throw new SliceDone('explore', route);
	}
	const { explored } = await readPlan(slicing.dir);
	if (explored.incomplete) {
		if (slicing.mode === 'replay') throw new SliceDone('replay', route);
		throw new InfrastructureError({ cause: 'incomplete', message: `${explored.incomplete}: the machine ran far slower than the journeys need, so ${route} is not checked rather than compared on fewer of them` });
	}
	const plain = explored.journeys;
	if (slicing.mode === 'replay') {
		const { at, of } = slicing.slice!;
		const journeys = sliceJourneys(plain.length, at, of);
		const mine = journeys.map((j) => plain[j]!);
		const [again, next] = await profiled(route, `replay ${mine.length} journeys old and new`, () => Promise.all([replayAll(browser, run.old, route, viewport, mine), replayAll(browser, front, route, viewport, mine)]));
		const differing = mine.flatMap((j, i) => (JSON.stringify(j.expected, unframed) !== JSON.stringify(again[i], unframed) ? [i] : []));
		const third = differing.length ? await profiled(route, `third old replay of ${differing.length} journeys`, () => replayAll(browser, run.old, route, viewport, differing.map((i) => mine[i]!))) : [];
		await writePart(slicing.dir, { route, at, of, journeys, again, next, third: differing.map((i, k) => [journeys[i]!, third[k]!] as const) });
		throw new SliceDone('replay', route);
	}
	const rounds = joinRounds(plain.length, await readParts(slicing.dir));
	const runs: RunResults[] = [plain.map((j) => j.expected), rounds.again, ...(rounds.third ? [rounds.third] : [])];
	return journeysTail(browser, run, route, viewport, front, explored, runs, rounds.next);
}

/** The new side's half of the journeys row, against the original's stored exploration and replays. */
async function storedJourneys(browser: Browser, run: Run, route: string, viewport: Viewport, front: SideEnv, stored: OriginalJourneys): Promise<JourneysRow> {
	const { explored, runs, oldRisky, oldRiskyAgain } = stored;
	if (explored.incomplete) throw new InfrastructureError({ cause: 'incomplete', message: `${explored.incomplete}: the original's dataset holds an exploration the time cap ended, so ${route} is not checked` });
	const plain = explored.journeys;
	const next = await profiled(route, `replay ${plain.length} journeys new`, () => replayAll(browser, front, route, viewport, plain));
	const risky = explored.deferred.map((d) => d.journey);
	const newRisky = risky.length ? await profiled(route, 'session-ending replays', () => replayDestructive(browser, front, route, viewport, risky)) : [];
	const elements = explored.elements.map((e) => destructiveCoverage(e, explored.deferred, oldRisky));
	const tried = unreachableTried(elements);
	const reachable = await profiled(route, 'unreachable on new', async () => (tried.length ? unreachableAlike(elements, await replayAll(browser, front, route, viewport, tried.map((e) => e.unreachable!.journey))) : []));
	const doorErrors = [...(await doorPageErrors(browser, run.old, viewport, [...next, ...newRisky]))];
	const dark = themed(plain);
	if (dark.length && !stored.dark) throw new InfrastructureError({ cause: 'not in the original dataset', message: `${route}: the original's dataset has no dark-mode replays of its theme cycles` });
	const darkNext = dark.length ? await profiled(route, 'dark-mode replays', () => replayAll(browser, { ...front, colorScheme: 'dark' }, route, viewport, dark)) : undefined;
	return { explored, runs: [...runs], next, oldRisky, oldRiskyAgain, newRisky, reachable, doorErrors, ...(darkNext ? { dark: { olds: [...stored.dark!], next: darkNext } } : {}) };
}

/** What the judge reads of the run's configuration for one route. */
function routeContext(run: Run, route: string, role: string | undefined, options: Pick<CheckOptions, 'viewports' | 'locales'>, light: boolean): RouteContext {
	return {
		route,
		...(role ? { role } : {}),
		viewports: options.viewports ?? VIEWPORTS,
		locales: options.locales ?? [],
		light,
		origins: { old: run.old.origin, new: run.new.origin },
		frozen: run.frozen,
		...(run.source ? { source: run.source } : {}),
		writes: { old: run.old, new: run.new },
		...(run.old.routing ? { oldRouting: run.old.routing } : {}),
		stages: routeStages(run),
		span: (part, work) => profiled(route, part, work),
		reached: (result) => void reached(route, result),
		total: (parts) => void (stepsOf(route).total = parts),
		closed: () => Boolean(run.old.scope?.closed),
	};
}

const routeStages = (run: Run): RouteContext['stages'] => ({ ...(run.original ? { original: { originalId: run.original.manifest.originalId, conditionsId: run.original.manifest.conditionsId } } : {}), probes: Boolean(run.probes), ...(run.controls ? { controls: { webkit: Boolean(run.controls.webkit) } } : {}), busyCpu: Boolean(run.busyCpu), ...(run.motion ? { motion: run.motion } : {}), responsiveness: Boolean(run.responsiveness), embeds: Boolean(run.embeds), ...(run.inventory ? { inventory: run.inventory } : {}), ...(run.media ? { media: true } : {}) });

/** OLD's captures of the route, so a record run can save what OLD fetched. */
const oldCaptures = new WeakMap<RouteResult, RouteCapture>();

/** Checks one route as one role, its rows in `log`: a bot wall stops it, a different access decision is reported without comparing two different pages. */
async function liveRouteCheck(browser: Browser, run: Run, route: string, role: string | undefined, logins: readonly string[], options: CheckOptions, light: boolean, log: RouteLog): Promise<RouteResult> {
	const walls = { old: [] as WallHit[], new: [] as WallHit[] };
	const watched: Run = { ...run, old: { ...run.old, walls: walls.old }, new: { ...run.new, walls: walls.new } };
	let passed = false;
	const seen: { loaded?: RouteStages['load']['value'] } = {};
	const result = await roleCheck(recording(liveProducers(browser, run, watched, walls, route, options.viewports ?? VIEWPORTS, logins, seen), log), { ...routeContext(run, route, role, options, light), passed: () => void (passed = true) });
	const old = seen.loaded?.olds[0];
	if (passed && old) oldCaptures.set(result, old);
	return result;
}

/** The parts of each route's check that have finished, the ones running and how many it was going to run: what a timed-out route reports. */
const routeSteps = new Map<string, { readonly done: { readonly name: string; readonly ms: number }[]; readonly running: Set<string>; total: number; stages: number; latest?: RouteResult }>();
const stepsOf = (route: string) => routeSteps.get(route) ?? routeSteps.set(route, { done: [], running: new Set(), total: 0, stages: 0 }).get(route)!;
// Which route's timed part encloses the code running now: a part timed inside another is not one of the route's stages.
const enclosing = new AsyncLocalStorage<string>();

/** How far a route's check got: "steps done 2 of 6 (load both sides, forced states; running: journeys)". */
export function stepsDone(route: string): string {
	const s = stepsOf(route);
	const running = [...s.running];
	return `steps done ${s.stages} of ${Math.max(s.total, s.stages + running.length)}${s.done.length || running.length ? ` (${s.done.map((d) => d.name).join(', ')}${running.length ? `${s.done.length ? '; ' : ''}running: ${running.join(', ')}` : ''})` : ''}`;
}

/** The route's result as far as its check has got: what a route stopped at --timeout still reports. */
export function reached(route: string, result: RouteResult): RouteResult {
	stepsOf(route).latest = result;
	return result;
}

// MARKLESS_MIGRATE_PROFILE=1 prints how long each part of a route's check took, on stderr.
export async function profiled<T>(route: string, part: string, work: () => Promise<T>): Promise<T> {
	const steps = stepsOf(route);
	const stage = enclosing.getStore() !== route;
	steps.running.add(part);
	const started = Date.now();
	try {
		return await enclosing.run(route, work);
	} finally {
		steps.running.delete(part);
		steps.done.push({ name: part, ms: Date.now() - started });
		if (stage) steps.stages++;
		profileLine(route, part, Date.now() - started);
	}
}

/** A part timed outside the route's own check (Lighthouse, slow network), as a profile line only. */
function profileLine(route: string, part: string, ms: number): void {
	if (process.env.MARKLESS_MIGRATE_PROFILE) process.stderr.write(`[profile] ${route} ${part}: ${(ms / 1000).toFixed(1)} s\n`);
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

/** Default per route check: ten minutes, or five journey budgets when the budget is raised. */
/** What the embed step may add to a route's check: its embeds pictured in every state and scheme, then activated. */
export const EMBED_STEP_BUDGET_MS = 600_000;

export function routeTimeout(options: Pick<CheckOptions, 'timeoutMs' | 'journeys' | 'embeds'>): number {
	return options.timeoutMs ?? Math.max(1_800_000, 5 * (options.journeys?.budgetMs ?? DEFAULT_JOURNEY_BUDGET_MS)) + (options.embeds ? EMBED_STEP_BUDGET_MS : 0);
}

/** Runs one route's check under a deadline: past it, every page the check opened is closed and the route is reported as an infrastructure failure. */
export async function withDeadline(route: string, run: Run, ms: number, work: (run: Run) => Promise<RouteResult>, log?: RouteLog): Promise<RouteResult> {
	routeSteps.delete(route);
	const began = Date.now();
	const scope = new Scope();
	const task = work({ ...run, old: { ...run.old, scope }, new: { ...run.new, scope } });
	task.catch(() => {});
	let timer: ReturnType<typeof setTimeout> | undefined;
	const late = new Promise<'late'>((done) => (timer = setTimeout(() => done('late'), ms)));
	try {
		const first = await Promise.race([task, late]);
		if (first !== 'late') {
			const timing = { ms: Date.now() - began, steps: [...stepsOf(route).done] };
			log?.record({ stage: 'timing', req: '', value: timing });
			const timed = { ...first, timing };
			routeSteps.delete(route);
			if (oldCaptures.has(first)) oldCaptures.set(timed, oldCaptures.get(first)!);
			return timed;
		}
	} finally {
		clearTimeout(timer);
	}
	log?.seal();
	// A route whose pages were all answered right up to the deadline is not a network failure: it took longer to check than --timeout allows.
	const window = Math.min(30_000, ms / 2);
	const stalled = scope.stalled(window);
	const answers = [scope.sinceAnswer(run.old.origin), scope.sinceAnswer(run.new.origin)];
	const lastAnswer = answers.every((a) => a !== undefined) ? Math.max(...(answers as number[])) : undefined;
	const failedLately = scope.failed > 0 && Date.now() - scope.failed < window;
	const steps = stepsDone(route);
	// What the finished steps found stands: a route stopped part way is reported with them, the stop beside them.
	const found = stepsOf(route).latest?.failures ?? [];
	routeSteps.delete(route);
	await scope.close();
	await Promise.race([task.catch(() => {}), new Promise((done) => setTimeout(done, 10_000))]);
	// A request left waiting, one failing, or an app that never answered is the servers' doing; a long part that sends no request (journeys deciding, a busy-CPU lane) is the check's own time.
	const answering = lastAnswer !== undefined && lastAnswer < window ? `both apps were still answering (each answered within ${(lastAnswer / 1000).toFixed(1)} s of it stopping)` : `both apps had answered and no request was waiting or had failed (the last answer ${Math.round((lastAnswer ?? 0) / 1000)} s before it stopped)`;
	const deadline: Deadline =
		stalled || failedLately || lastAnswer === undefined
			? { infrastructure: { cause: 'check timeout', message: `incomplete: timed out after ${Math.round(ms / 1000)} s, ${steps}: ${stalled ? `${stalled.url} had waited ${Math.round((Date.now() - stalled.at) / 1000)} s for an answer` : failedLately ? 'a request failed just before it stopped' : 'an app never answered its pages'}` } }
			: { failure: { route, dimension: 'http', check: 'the check of this route', expected: 'the check runs to the end', actual: `incomplete: timed out after ${Math.round(ms / 1000)} s, ${steps}; ${answering}`, hint: HINTS.checkOutOfTime } };
	log?.record({ stage: 'deadline', req: '', value: deadline }, true);
	return deadlineResult(route, deadline, found);
}

async function deniedPage(env: SideEnv, http: HttpCapture): Promise<boolean> {
	if (http.status !== 200) return false;
	const url = new URL(http.chain.at(-1)!.url, env.origin);
	const response = await request(url, { headers: tagHeaders(env) }).catch(() => undefined);
	return response ? saysDenied(await bodyText(response, url).catch(() => '')) : false;
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

async function surveyLayout(browser: Browser, run: Run, routes: readonly string[], options: CheckOptions): Promise<SurveyRow[]> {
	const viewport = (options.viewports ?? VIEWPORTS)[0]!;
	// A survey that fails once is tried again: an empty survey hands its route's shared controls to another route.
	return pool(routes, options.concurrency ?? DEFAULT_CONCURRENCY, (route) =>
		survey(browser, run.old, route, viewport)
			.catch(() => survey(browser, run.old, route, viewport))
			.then((found): SurveyRow => ({ route, ...found }), (): SurveyRow => ({ route, layout: [], own: 0, failed: true })),
	);
}

async function launchedTogether(launches: [Promise<Browser>, Promise<Browser>], kept?: Browser): Promise<[Browser, Browser]> {
	const settled = await Promise.allSettled(launches);
	const failed = settled.find((r): r is PromiseRejectedResult => r.status === 'rejected');
	if (!failed) return settled.map((r) => (r as PromiseFulfilledResult<Browser>).value) as [Browser, Browser];
	await Promise.all(settled.map((r) => (r.status === 'fulfilled' && r.value !== kept ? r.value.close() : undefined)));
	throw failed.reason;
}

export async function runCheck(options: CheckOptions): Promise<Report> {
	const startedAt = new Date().toISOString();
	resetSharedAnswers();
	if (options.original) {
		const role = options.auth ? undefined : null;
		if (role === undefined) throw new Error('--original reads an anonymous original: leave out --auth');
		const want = conditionsId(originalConditions(options));
		if (options.original.manifest.conditionsId !== want) throw new Error(`the original's dataset was produced under other conditions than this check's (${options.original.manifest.conditionsId.slice(0, 12)}, this check ${want.slice(0, 12)})`);
		offerAnswers(originalAnswers(options.original, options.routes));
	}
	if (options.slicing && (options.routes.length !== 1 || options.original || options.auth || options.data)) throw new Error('a sliced check checks one route, anonymous, with no --original or --data');
	// A browser of the check's own is launched again if it dies, and the route it died under checked once more; a given one is the caller's.
	const relaunched = options.browser ? undefined : await new Relauncher<Browser>(() => chromium.launch({ ...LAUNCH, ignoreDefaultArgs: [...LAUNCH.ignoreDefaultArgs] }), (line) => void process.stderr.write(`${line}\n`)).start();
	const browser = options.browser ?? relaunched!.shared;
	const freeze: FreezeOptions | false = options.freeze === false ? false : { ...DEFAULT_FREEZE, ...options.freeze };
	const bypass = { ...(options.headers ? { headers: options.headers } : {}), ...(options.cookies?.length ? { cookies: options.cookies } : {}), ...(options.userAgent ? { userAgent: options.userAgent } : {}) };
	const dataHosts = clientHosts(options.source?.clients ?? []);
	const shared = { freeze, block: blocker(options.block), sendWrites: writesAllowed(options), writeFacts: options.source?.writes ?? [], ...(options.data ? { renderFresh: true } : {}), ...(dataHosts.size ? { dataHosts } : {}), ...(options.serverClock && freeze ? { serverClock: true } : {}), ...bypass };
	const artifacts = options.artifactsDir ? new RouteArtifacts(options.artifactsDir, options.oldOrigin) : undefined;
	const oldCache = options.cacheDir && !options.original && !options.slicing ? new OldCache(join(options.cacheDir, 'old'), { block: options.block ?? null }) : undefined;
	// A browser that did not start closes the ones that did, or they keep the process alive after the error.
	let webkitBrowser: Browser | undefined;
	let laneBrowsers: [Browser, Browser] | undefined;
	try {
		webkitBrowser = options.controls?.webkit && !options.writeLayoutSurvey ? await webkit.launch().catch((error: Error) => {
			throw new Error(`control parity compares pop-up places in WebKit, which did not start (${error.message.split('\n')[0]}): install it with \`npx playwright install webkit\`, or leave out --control-webkit`);
		}) : undefined;
		laneBrowsers = options.busyCpu && !options.writeLayoutSurvey ? await launchedTogether([firefox.launch(), webkitBrowser ? Promise.resolve(webkitBrowser) : webkit.launch()], webkitBrowser).catch((error: Error) => {
			throw new Error(`the busy-CPU lane uses Firefox and WebKit, which did not start (${error.message.split('\n')[0]}): install them with \`npx playwright install firefox webkit\`, or leave out --busy-cpu`);
		}) : undefined;
	} catch (error) {
		await relaunched?.close();
		await webkitBrowser?.close();
		throw error;
	}
	const base: Run = { ...(options.slicing ? { slicing: options.slicing } : {}), ...(options.original ? { original: options.original } : {}), old: defaultEnv(options.oldOrigin, { ...shared, ...(options.oldRouting ? { routing: options.oldRouting } : {}) }), new: defaultEnv(options.newOrigin, { ...shared, liveCounts: new Map<string, string>() }), frozen: Boolean(freeze), ...(oldCache ? { oldCache } : {}), ...(options.responsiveness ? { responsiveness: options.responsiveness } : {}), ...(options.motion ? { motion: options.motion } : {}), ...(options.embeds ? { embeds: { ...options.embeds, claimed: new Map<string, string>() } } : {}), ...(options.probes ? { probes: options.probes } : {}), ...(options.controls ? { controls: { ...options.controls, webkit: webkitBrowser } } : {}), ...(options.busyCpu && laneBrowsers ? { busyCpu: { ...options.busyCpu, browsers: { chromium: browser, firefox: laneBrowsers[0], webkit: laneBrowsers[1] } } } : {}), ...(options.switched ? { switched: options.switched } : {}), ...(options.inventory ? { inventory: options.inventory } : {}), ...(options.media ? { media: true } : {}), ...(options.source ? { source: options.source } : {}), ...(options.sourceDirs ? { sourceDirs: options.sourceDirs } : {}) };
	const auth = options.auth;
	const roles: (string | undefined)[] = auth ? [ANONYMOUS, ...Object.keys(auth.roles)] : [undefined];
	const logins: LoginResult[] = [];
	const loginPaths = auth ? loginRoutes(auth) : [];
	// Only the joining part of a sliced route measures its page load and navigation: the other parts end at the journeys.
	const partial = Boolean(options.slicing && options.slicing.mode !== 'finish');
	const loadPhase = !partial && (Boolean(options.load && options.only !== 'embeds') || options.only === 'load');
	const header: RunHeader = {
		old: options.oldOrigin,
		new: options.newOrigin,
		startedAt,
		routes: options.routes,
		endpoints: options.endpoints ?? [],
		redirects: options.redirects ?? [],
		viewports: options.viewports ?? VIEWPORTS,
		locales: options.locales ?? [],
		freeze,
		sendWrites: shared.sendWrites,
		...(options.source ? { source: options.source } : {}),
		...(options.oldRouting ? { oldRouting: options.oldRouting } : {}),
		...(options.data ? { data: options.data } : {}),
		roles,
		...(options.unchecked ? { unchecked: options.unchecked } : {}),
		accepted: options.accepted ?? [],
		automaticOff: options.automaticOff ?? [],
		...(options.only ? { only: options.only } : {}),
		stages: { ...routeStages(base), load: loadPhase, navigation: Boolean(options.navigation) },
		...(options.responsiveness ? { responsiveness: options.responsiveness } : {}),
		coverage: Boolean(options.coverage),
		...(options.partial ? { partial: options.partial } : {}),
		cache: Boolean(oldCache),
		auth: Boolean(auth),
		...(options.layoutSurvey ? { sharedLater: true as const } : {}),
	};
	const observed = options.observations && new GuardedObservations(options.observations, (line) => void process.stderr.write(line));
	await observed?.header(header);
	const event = async (e: RunEvent) => void (await observed?.event(e));
	try {
		let routes: RouteResult[] = [];
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
		await event({ kind: 'plan', endpoints: [...endpoints], redirects: [...redirects], groups });
		const { groupOf, light } = templateGroups(groups);
		const coverages: RouteCoverage[] = [];
		const wasteReferences: WasteReport[] = [];
		const navigation: NavigationResult[] = [];
		const full = allPages.filter((route) => !light(route));
		const layoutOf = async (env: Run, role: string | undefined): Promise<readonly SurveyRow[]> => {
			if (options.layoutSurvey) return surveyRows(options.layoutSurvey, role, full);
			return full.length > 1 ? surveyLayout(browser, env, full, options) : [];
		};
		const surveys: { role: string | null; routes: readonly SurveyRow[] }[] = [];
		for (const role of roles) {
			let roleRun = base;
			if (auth && role && role !== ANONYMOUS) {
				const signed = await signInAs(browser, base, role, auth.roles[role]!, auth, options.authStateDir);
				logins.push(signed.login);
				await event({ kind: 'login', role, login: signed.login, signedIn: Boolean(signed.run) });
				if (!signed.run) continue;
				roleRun = signed.run;
			}
			// A widget is shared only among one role's routes: a signed-in visitor may meet another one behind the same markup.
			if (roleRun.probes) roleRun = { ...roleRun, probes: { ...roleRun.probes, shared: new Map<string, SharedProbe>() } };
			if (options.writeLayoutSurvey) {
				surveys.push({ role: role ?? null, routes: await surveyLayout(browser, roleRun, full, options) });
				continue;
			}
			if (options.only === 'load') {
				if (!role || role === ANONYMOUS) routes.push(...allPages.map((route) => withTemplate(groupOf, { ...partialResult(route, [], []), ok: true, only: 'load' as const })), ...outOfPart([...endpoints], [...redirects], 'load', role));
				continue;
			}
			if (options.only === 'embeds') {
				const step: EmbedCheckOptions = { ...(options.embeds ?? {}), claimed: new Map<string, string>() };
				const viewports = options.viewports ?? VIEWPORTS;
				for (const route of allPages) {
					const out = await checkEmbeds(browser, { old: roleRun.old, new: roleRun.new }, route, viewports, step).catch((error: Error) => ({ failures: [{ route, dimension: 'rendered' as const, check: 'embed step', expected: 'the embed step runs', actual: error.message.split('\n')[0]!, hint: 'The embed step could not load the route on one side.' }], shots: [], results: [] }));
					await event({ kind: 'embeds only', ...(role ? { role } : {}), route, out: { failures: out.failures, shots: out.shots } });
					routes.push(embedsOnly(groupOf, route, out, role));
				}
				routes.push(...outOfPart([...endpoints], [...redirects], 'embeds', role));
				continue;
			}
			if (options.only === 'probes') {
				const probing = { ...roleRun, probes: roleRun.probes ?? { shared: new Map<string, SharedProbe>() } };
				const viewports = options.viewports ?? VIEWPORTS;
				for (const route of allPages) {
					const log = new RouteLog(observed && ((row) => observed.row(row)));
					const result = await probesOnly(recording(liveProducers(browser, probing, probing, { old: [], new: [] }, route, viewports, loginPaths), log), routeContext(probing, route, role, options, false));
					await observed?.route({ route, ...(role ? { role } : {}), kind: 'probes' }, log.rows);
					routes.push(asRole(withTemplate(groupOf, { ...result, ok: result.failures.length === 0, only: 'probes' as const }), role));
				}
				routes.push(...outOfPart([...endpoints], [...redirects], 'probes', role));
				continue;
			}
			const oldLanding = (env: SideEnv) => (route: string) => landing(browser, env, route, (options.viewports ?? VIEWPORTS)[0]!);
			if (options.coverage) {
				const coverage = await checkCoverage(roleRun.old, roleRun.new, options.coverage, role, oldLanding(roleRun.old));
				coverages.push(coverage);
				await event({ kind: 'coverage', coverage });
			}
			const data = options.data && role && role !== ANONYMOUS ? { ...options.data, dir: join(options.data.dir, slug(role)) } : options.data;
			const sharedData = data?.mode === 'replay' ? everyRecording(data.dir).then((responses) => ({ set: randomUUID(), responses })) : undefined;
			const pages = allPages;
			const owners = layoutOwners(await layoutOf(roleRun, role));
			roleRun = { ...roleRun, owners: [...owners].sort(), journeys: { ...options.journeys, owner: (signature) => owners.get(signature.split(' > ')[0]!) } };
			const progress = options.progress && artifacts ? new CheckProgress(options.progress.dir, { old: options.oldOrigin, new: options.newOrigin, routes: [...options.routes].sort(), role, freeze, block: options.block ?? null, motion: options.motion ?? null, responsiveness: options.responsiveness ?? null, journeys: options.journeys ?? null, only: options.only ?? null, templates: options.templates ?? null, data: options.data?.mode ?? null }, options.progress.resume) : undefined;
			const checked = await pool(pages, options.concurrency ?? DEFAULT_CONCURRENCY, async (route) => {
				const key = { route, ...(role ? { role } : {}), kind: 'page' as const };
				const earlier = await progress?.done(route, role);
				if (earlier) {
					if (observed) await observed.route(key, [observed.row({ stage: 'resumed', req: '', value: earlier })]);
					options.onRoute?.(earlier);
					return earlier;
				}
				const { run, failures } = data?.mode === 'replay' ? await replayRoute(roleRun, data.dir, route, sharedData!) : { run: roleRun, failures: [] };
				const newLog = () => new RouteLog(observed && ((row) => observed.row(row)));
				let log = newLog();
				const checkOn = (browser: Browser) => {
					const mine = (log = newLog());
					return withDeadline(route, run, routeTimeout(options), (scoped) => liveRouteCheck(browser, scoped, route, role, loginPaths, options, light(route), mine), mine);
				};
				const done = await (relaunched
					? relaunched.retried(route, checkOn, async () => {}).then((got) => {
							if ('value' in got) return got.value;
							log = newLog();
							log.record({ stage: 'outcome', req: '', value: got.failed });
							return stopped(route, new Error(`${got.failed}, on both tries`), [options.oldOrigin, options.newOrigin]);
						})
					: checkOn(browser)
				).catch(unreachable(route));
				const old = oldCaptures.get(done);
				oldCaptures.delete(done);
				forgetFailures(done.failures);
				if (data?.mode === 'record' && old) {
					const first = Object.values(old.pages)[0];
					const records = first?.network?.records ?? [];
					const live = await recordLive(browser, run.old, route, first?.sockets ?? [], data.liveWindowMs ?? 0, (options.viewports ?? VIEWPORTS)[0]!);
					await writeRecording(data.dir, { route, recordedFrom: options.oldOrigin, at: startedAt, responses: recordable(records), ...(live ? { live } : {}) });
				}
				if (observed) await observed.route(key, [...(failures.length ? [observed.row({ stage: 'data', req: '', value: failures })] : []), ...log.rows]);
				const checkedAs = routeOutcome(groupOf, done, role, failures);
				const kept = artifacts ? await artifacts.keep(checkedAs) : checkedAs;
				await progress?.write(route, role, kept);
				options.onRoute?.(kept);
				return kept;
			});
			const navRun = options.navigation && !partial ? await navigationRun(roleRun, data, pages) : undefined;
			const navigated = navRun ? await checkNavigation(browser, navRun.new, pages, { concurrency: options.concurrency ?? DEFAULT_CONCURRENCY, old: navRun.old, ...options.navigation }) : undefined;
			if (navigated) {
				navigation.push(navigated);
				await event({ kind: 'navigation', result: navigated });
			}
			const compared = roleCompared(checked, navigated, Boolean(options.layoutSurvey));
			routes.push(...(artifacts ? await Promise.all(compared.map((r) => artifacts.keep(r))) : compared));
			for (const route of endpoints) {
				const result = await checkEndpoint(roleRun, route).catch(unreachable(route));
				await event({ kind: 'endpoint', ...(role ? { role } : {}), route, result });
				routes.push(asRole(result, role));
			}
			for (const route of redirects) {
				const result = await checkRedirect(roleRun, route, oldLanding(roleRun.old)).catch(unreachable(route));
				await event({ kind: 'redirect', ...(role ? { role } : {}), route, result });
				routes.push(asRole(result, role));
			}
		}
		if (options.writeLayoutSurvey) {
			await options.writeLayoutSurvey({ version: LAYOUT_SURVEY_VERSION, roles: surveys });
			return finishReport(header, [], logins, [], [], groups, allPages, { kind: 'footer', pinned: pinnedCounts(new Map()), wasteReferences: [] });
		}
		if (loadPhase) {
			const routesToLoad = loadable(routes, allPages, light);
			const bypassed = Boolean(options.headers && Object.keys(options.headers).length) || Boolean(options.cookies?.length);
			// The bypass token goes to the two apps' origins alone; PageSpeed Insights, which cannot carry it, is left out.
			const bypass = bypassed ? { origins: [options.oldOrigin, options.newOrigin], ...(options.headers ? { headers: options.headers } : {}), ...(options.cookies?.length ? { cookies: options.cookies } : {}) } : undefined;
			const loads = await measureLoad({ old: options.oldOrigin, new: options.newOrigin }, routesToLoad, { ...(options.block ? { block: options.block } : {}), ...options.load, ...(bypass ? { bypass } : {}) });
			for (const [route, load] of loads) if (load.ms !== undefined) profileLine(route, 'Lighthouse', load.ms);
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
				for (const [route, network] of measured ?? []) if (network.ms) profileLine(route, 'slow network', network.ms);
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
			await event({ kind: 'loads', loads: [...loads] });
			routes = applyLoads(routes, loads);
		}
		const footer = { kind: 'footer' as const, pinned: pinnedCounts(base.new.liveCounts ?? new Map()), ...(oldCache ? { cache: { ...oldCache.counts } } : {}), wasteReferences };
		await event(footer);
		return finishReport(header, routes, logins, coverages, navigation, groups, allPages, footer);
	} finally {
		await relaunched?.close();
		await webkitBrowser?.close();
		await laneBrowsers?.[0].close();
		if (!webkitBrowser) await laneBrowsers?.[1].close();
	}
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
