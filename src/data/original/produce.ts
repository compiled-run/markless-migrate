// The producers of the original's tables: each observes the frozen old site alone, with nothing of a port in the room, and
// returns rows. What a row holds is what the check's old half held, so the judges read either the same way.
import type { Browser } from 'playwright';
import { storedAnswers, tagHeaders, type SideEnv, type StoredAnswer } from '../../check/browser.ts';
import { captureRoute, captureRouteHttp, pageLoads, thirdPartyLoads } from '../../check/capture.ts';
import { isPage } from '../../check/endpoints.ts';
import { request } from '../../check/http.ts';
import { themed } from '../../check/journeys-compare.ts';
import { explore, replayAll, replayDestructive, type Exploration, type ExploreOptions, type Journey, type Run } from '../../check/journeys.ts';
import { arrivalJourneys } from '../../check/route-judge.ts';
import type { HttpCapture, RouteCapture, Viewport } from '../../check/types.ts';
import { keys, SAMPLES, type ReplayMode } from './dataset.ts';
import type { DatasetWriter } from './store.ts';

export interface RouteRow {
	readonly kind: 'page' | 'endpoint' | 'redirect';
	readonly status: number;
	readonly contentType: string;
	readonly chain: HttpCapture['chain'];
	/** The route's observations are that moment's data (a live socket, journeys that talked to a server): a check observes them on every run. */
	readonly live?: { readonly loads?: true; readonly journeys?: true };
}

export interface ServedRow {
	readonly http: HttpCapture;
	readonly html: Buffer;
}

/** What a route is to the old server, by plain HTTP: a page, an endpoint, or a redirect off its own origin. */
export async function observeRoute(env: SideEnv, route: string): Promise<{ readonly route: Omit<RouteRow, 'live'>; readonly served?: ServedRow }> {
	const http = await captureRouteHttp(env, route, tagHeaders(env));
	const last = http.chain.at(-1)!;
	const offsite = http.chain.length > 1 && new URL(last.url, env.origin).origin !== new URL(env.origin).origin;
	const kind = offsite ? 'redirect' : isPage(http.contentType ?? '') ? 'page' : 'endpoint';
	const row = { kind, status: http.status, contentType: http.contentType ?? '', chain: http.chain } as const;
	if (kind !== 'page') return { route: row };
	const response = await request(new URL(last.url, env.origin), { headers: tagHeaders(env) });
	return { route: row, served: { http, html: Buffer.from(await response.arrayBuffer()) } };
}

export interface LoadsRow {
	readonly samples: readonly RouteCapture[];
	/** Every URL the samples' pages loaded. */
	readonly loads: readonly string[];
	readonly answers: readonly StoredAnswer[];
}

/** The route loaded three times, one after another, so time-based noise (clocks, counters) shows across them. */
export async function observeLoads(browser: Browser, env: SideEnv, route: string, viewports: readonly Viewport[]): Promise<LoadsRow> {
	const samples: RouteCapture[] = [];
	for (let i = 0; i < SAMPLES.loads; i++) samples.push(await captureRoute(browser, env.origin, route, viewports, env));
	const pages = samples.flatMap((s) => Object.values(s.pages));
	const loads = [...new Set(pages.flatMap((p) => pageLoads.get(p) ?? []))];
	const answers = await storedAnswers([...new Set(pages.flatMap((p) => thirdPartyLoads.get(p) ?? []))]);
	return { samples, loads, answers };
}

export interface JourneysOriginal {
	readonly explored: Exploration;
	/** Every replay of the original, by mode: `plain[0]` is what exploring recorded. */
	readonly replays: Readonly<Record<ReplayMode, readonly Run[]>>;
	/** The journeys after arriving from `explored.arrival.entry`, as the judge builds them. */
	readonly arrival: readonly Journey[];
}

/** Explores the route, then replays its journeys: plain three times, the session-ending ones and the dark-mode and arrival runs twice. */
export async function observeJourneys(browser: Browser, env: SideEnv, route: string, viewport: Viewport, options: ExploreOptions): Promise<JourneysOriginal> {
	const explored = await explore(browser, env, route, viewport, options);
	const plain = explored.journeys;
	const runs: Run[] = [plain.map((j) => j.expected)];
	for (let i = 1; i < SAMPLES.plain; i++) runs.push(await replayAll(browser, env, route, viewport, plain));
	const risky = explored.deferred.map((d) => d.journey);
	const riskyRuns: Run[] = [];
	// Sent, a delete cannot be done twice; held back, it can, and a second run shows what varies.
	if (risky.length) {
		riskyRuns.push(await replayDestructive(browser, env, route, viewport, risky));
		riskyRuns.push(env.sendWrites ? riskyRuns[0]! : await replayDestructive(browser, env, route, viewport, risky));
	}
	const dark = themed(plain);
	const darkEnv: SideEnv = { ...env, colorScheme: 'dark' };
	const darkRuns: Run[] = [];
	if (dark.length) for (let i = 0; i < SAMPLES.dark; i++) darkRuns.push(await replayAll(browser, darkEnv, route, viewport, dark));
	const arrival = explored.arrival ? arrivalJourneys(plain, explored.arrival) : [];
	const arrivalRuns: Run[] = [];
	if (arrival.length) for (let i = 0; i < SAMPLES.arrival; i++) arrivalRuns.push(await replayAll(browser, env, route, viewport, arrival));
	return { explored, replays: { plain: runs, risky: riskyRuns, dark: darkRuns, arrival: arrivalRuns }, arrival };
}

/** Whether the original's journeys made no request to an app and wrote nothing: what they did is the page's own code, the same every run. */
export function clientOnly(journeys: JourneysOriginal): boolean {
	return Object.values(journeys.replays).every((runs) => runs.every((run) => run.every((steps) => steps.every((step) => !step.requests.length && !step.writes?.length && !step.door))));
}

/** A journey as the journeys table keeps it: its steps and how it was recorded, without the run that exploring recorded (a replay row). */
const journeyRow = (j: Exploration['journeys'][number]) => {
	const { expected: _expected, ...rest } = j;
	return rest;
};

export interface ProduceRouteOptions {
	readonly viewports: readonly Viewport[];
	readonly explore: ExploreOptions;
}

/** One page route's observations of the original, before they are rows. */
export interface RouteObservation {
	readonly route: Omit<RouteRow, 'live'>;
	readonly served: ServedRow;
	readonly viewports: readonly string[];
	readonly loads: LoadsRow;
	readonly journeys: JourneysOriginal;
}

/** Observes every table of one route; an endpoint or a redirect has its routes row alone. */
export async function observeOriginal(browser: Browser, env: SideEnv, route: string, options: ProduceRouteOptions): Promise<RouteObservation | Omit<RouteRow, 'live'>> {
	const seen = await observeRoute(env, route);
	if (!seen.served) return seen.route;
	const loads = await observeLoads(browser, env, route, options.viewports);
	// What the original's loads held as loops (an autoplaying carousel) stays held in every page its journeys open, as a check holds it.
	const timers = [...new Set(loads.samples.flatMap((c) => Object.values(c.pages).flatMap((p) => p.timers ?? [])))].sort();
	const journeys = await observeJourneys(browser, timers.length ? { ...env, skipTimers: timers } : env, route, options.viewports[0]!, options.explore);
	return { route: seen.route, served: seen.served, viewports: options.viewports.map((v) => v.name), loads, journeys };
}

/** The rows of one route's observations, its routes row last, so a route with a routes row is whole. */
export async function writeRoute(writer: DatasetWriter, path: string, seen: RouteObservation | Omit<RouteRow, 'live'>): Promise<RouteRow> {
	if (!('served' in seen)) {
		await writer.add('routes', keys.route(path), path, seen);
		return seen;
	}
	await writer.add('served', keys.served(path, null), path, seen.served);
	for (const [i, sample] of seen.loads.samples.entries()) await writer.add('loads', keys.load(path, seen.viewports, i), path, sample);
	await writer.add('loads', keys.load(path, seen.viewports, -1), path, { loads: seen.loads.loads });
	for (const answer of seen.loads.answers) await writer.add('responses', keys.response(answer.url, 'GET', 'browser'), path, answer);
	const { journeys: plain, elements, ...exploration } = seen.journeys.explored;
	await writer.add('journeys', keys.exploration(path), path, { ...exploration, journeys: plain.length, elements: elements.length, arrivalJourneys: seen.journeys.arrival });
	for (const [i, j] of plain.entries()) await writer.add('journeys', keys.journey(path, i), path, journeyRow(j));
	for (const [i, e] of elements.entries()) await writer.add('controls', keys.control(path, e.signature, i), path, e);
	for (const [mode, runs] of Object.entries(seen.journeys.replays) as [ReplayMode, readonly Run[]][])
		for (const [sample, run] of runs.entries()) for (const [j, steps] of run.entries()) await writer.add('replays', keys.replay(path, mode, j, sample), path, steps);
	const sockets = seen.loads.samples.some((s) => Object.values(s.pages).some((p) => p.sockets?.length));
	const live = { ...(sockets ? { loads: true as const } : {}), ...(clientOnly(seen.journeys) ? {} : { journeys: true as const }) };
	const row: RouteRow = { ...seen.route, ...(Object.keys(live).length ? { live } : {}) };
	await writer.add('routes', keys.route(path), path, row);
	return row;
}
