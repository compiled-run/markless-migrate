// One route's check as a judge over observations: every page load, replay and probe is a row a producer returns through
// `observe`, and everything between the rows is decided here, from the rows alone. run.ts answers `observe` with a browser
// and records each row; `check judge` answers it from the recorded rows, so a judge change re-scores a run with no browser.
import { storageOwner, unreachableCandidate, type StorageOwner } from './automatic.ts';
import { BlockedError, blockedResult } from './blocked.ts';
import { assetsToProbe, compareRoute, noiseReport, withFailures, type Probe } from './compare.ts';
import { judgeControlParity, type ControlParityResult, type ParityRow } from './control-parity-compare.ts';
import { shellRoute, type OldRouting } from './hash-routes.ts';
import { HINTS } from './hints.ts';
import { negotiationFailures } from './i18n.ts';
import { classify, InfrastructureError } from './infrastructure.ts';
import { choppier, compareJourneys, describeTarget, inDarkMode, interimViews, MAX_ARRIVED, themed, timedOnly } from './journeys-compare.ts';
import type { ElementCoverage, Exploration, Journey, RecordedJourney, Run as Runs, Step, StepResult } from './journeys.ts';
import { NOT_EXERCISED } from './locate.ts';
import { judgeMotion, motionRules, type MotionOptions, type MotionRow } from './motion-compare.ts';
import { judgeProbes, notifiers, type ProbesRow } from './probes-compare.ts';
import type { Responsiveness } from './responsiveness.ts';
import { judgeResponsiveness } from './responsiveness-compare.ts';
import type { SourceFacts } from './source-facts.ts';
import { judgeStates, statesPlan, statesRequest, type StatesRequest, type StatesRow } from './states-compare.ts';
import { discoverStates, parseRules, type StyleSource } from './stylesheet.ts';
import { answerFloor, judgeInTurn, judgeTiming, type Samples } from './timing-verdicts.ts';
import { DIMENSIONS, REPRESENTATIVE_ONLY, type Blocked, type Coverage, type Dimension, type Failure, type Infrastructure, type RouteCapture, type RouteResult, type Shot, type SourceLink, type Viewport } from './types.ts';
import type { WallHit } from './browser.ts';

/** A row the judge asked for that the recorded run never made: the live run stopped before it (its deadline), or the judge asks for other observations than the run made. */
export class Unobserved extends Error {
	readonly stage: string;
	constructor(stage: string) {
		super(`no recorded ${stage} observation`);
		this.name = 'Unobserved';
		this.stage = stage;
	}
}

/** One sequence of journey replays, old then new, timed again one side at a time. */
export interface RetimeRound {
	readonly old: StepResult[];
	readonly next: StepResult[];
}

/** What the journeys producer read: the exploration, every replay of it on both sides, and what the judge needs beside them. */
export interface JourneysRow {
	readonly explored: Exploration;
	/** The old runs: the exploration's own, a replay, and a third where those two differ. */
	readonly runs: readonly Runs[];
	readonly next: Runs;
	readonly oldRisky: Runs;
	readonly oldRiskyAgain: Runs;
	readonly newRisky: Runs;
	/** Elements the old page would not let a visitor use, by signature: the same reason on the new page, an automatic acceptance. */
	readonly reachable: readonly (readonly [string, NonNullable<Failure['automatic']>])[];
	/** What each page of the old app a new journey reached logs on a plain load of it. */
	readonly doorErrors: readonly (readonly [string, readonly string[]])[];
	/** The theme cycles again with the OS in dark mode: two old runs and the new one. */
	readonly dark?: { readonly olds: readonly Runs[]; readonly next: Runs };
}

/** What each stage asks of its producer and what the producer returns: the rows of one route's check. */
export interface RouteStages {
	readonly wall: { readonly request: Record<string, never>; readonly value: { readonly old?: Blocked; readonly new?: Blocked } };
	readonly gate: { readonly request: { readonly role: string }; readonly value: { readonly comparable: boolean; readonly failures: readonly Failure[] } };
	readonly load: { readonly request: { readonly light: boolean }; readonly value: { readonly olds: readonly RouteCapture[]; readonly next: RouteCapture; readonly loads: readonly string[] } };
	readonly assets: { readonly request: { readonly urls: readonly string[] }; readonly value: readonly (readonly [string, Probe])[] };
	readonly negotiate: { readonly request: { readonly languages: readonly string[] }; readonly value: readonly [Record<string, string>, Record<string, string>, Record<string, string>] };
	readonly selfUrls: { readonly request: Record<string, never>; readonly value: readonly Failure[] };
	readonly states: { readonly request: StatesRequest; readonly value: StatesRow };
	readonly journeys: { readonly request: Record<string, never>; readonly value: JourneysRow };
	/** The route's journeys after arriving from another page: undefined when the new app does not serve that page. */
	readonly arrival: { readonly request: { readonly entry: string; readonly journeys: readonly Journey[] }; readonly value: { readonly a: Runs; readonly b: Runs; readonly next: Runs } | null };
	readonly retime: { readonly request: { readonly set: 'main' | 'arrival'; readonly journey: Journey }; readonly value: readonly RetimeRound[] };
	readonly clock: { readonly request: Record<string, never>; readonly value: readonly Failure[] };
	readonly probes: { readonly request: { readonly notify: readonly string[] }; readonly value: ProbesRow };
	readonly parity: { readonly request: { readonly film: boolean; readonly webkit: boolean }; readonly value: ParityRow };
	readonly busy: { readonly request: Record<string, never>; readonly value: { readonly failures: readonly Failure[]; readonly ms: number } };
	readonly motion: { readonly request: { readonly journeys: readonly RecordedJourney[] }; readonly value: MotionRow };
	readonly responsiveness: { readonly request: { readonly journeys: readonly RecordedJourney[] }; readonly value: { readonly responsiveness: Responsiveness; readonly failures: readonly Failure[] } };
	readonly embeds: { readonly request: Record<string, never>; readonly value: { readonly failures: readonly Failure[]; readonly shots: readonly Shot[] } };
	/** Where each failure's element comes from in the old and new source, index for index. */
	readonly locate: { readonly request: { readonly failures: readonly Failure[] }; readonly value: { readonly patches: readonly (LocatePatch | null)[]; readonly newFiles?: readonly string[] } };
	readonly hashLinks: { readonly request: Record<string, never>; readonly value: readonly Failure[] };
	/** The first bot wall each side hit while the route was checked. */
	readonly walls: { readonly request: Record<string, never>; readonly value: { readonly old?: WallHit; readonly new?: WallHit } };
}

export interface LocatePatch {
	readonly old?: SourceLink;
	readonly new?: SourceLink;
	readonly where: string;
}

export type Stage = keyof RouteStages;
export type Observe = <K extends Stage>(stage: K, request: RouteStages[K]['request']) => Promise<RouteStages[K]['value']>;

/** What a route's check is configured with: the parts that change what is judged, not how a browser is driven. */
export interface RouteContext {
	readonly route: string;
	/** The role it is checked as, `anonymous` among them when check signs in. */
	readonly role?: string;
	readonly viewports: readonly Viewport[];
	readonly locales: readonly string[];
	/** Checked as a template group's lighter member: one viewport, and the representative carries visual, responsiveness and motion. */
	readonly light: boolean;
	readonly origins: { readonly old: string; readonly new: string };
	readonly frozen: boolean;
	readonly source?: SourceFacts;
	/** Writes are sent on a side: forced states and journeys run one after the other. */
	readonly writes: { readonly old: { readonly sendWrites?: boolean }; readonly new: { readonly sendWrites?: boolean } };
	readonly oldRouting?: OldRouting;
	readonly stages: { readonly probes: boolean; readonly controls?: { readonly webkit: boolean }; readonly busyCpu: boolean; readonly motion?: MotionOptions; readonly responsiveness: boolean; readonly embeds: boolean; /** The old side's loads and journeys come from this original's dataset: timing is judged from fresh paired rounds alone. */ readonly original?: { readonly originalId: string; readonly conditionsId: string } };
	/** Live: names the part of the check running, for the report's step times and a stopped route's message. */
	readonly span?: <T>(part: string, work: () => Promise<T>) => Promise<T>;
	/** The result as far as the check has got: what a route stopped at its deadline still reports. */
	readonly reached?: (result: RouteResult) => void;
	/** How many parts the check runs. */
	readonly total?: (parts: number) => void;
	/** Live: the route's deadline passed and what it opened is closed, so an error is that, not the page's. */
	readonly closed?: () => boolean;
	/** The check ran to its end and compared the page (a record run then saves what the old page fetched). */
	readonly passed?: () => void;
}

const span = <T>(ctx: RouteContext, part: string, work: () => Promise<T>) => (ctx.span ? ctx.span(part, work) : work());
const reach = (ctx: RouteContext, result: RouteResult) => (ctx.reached?.(result), result);
/** An error that ends the route's check outright: past its deadline live, or a row the recorded run never made. */
const stops = (ctx: RouteContext, error: unknown) => error instanceof Unobserved || Boolean(ctx.closed?.());

/** A route that was not compared in full: only `compared` dimensions carry a verdict, the rest are skipped. */
export function partialResult(route: string, failures: readonly Failure[], compared: readonly Dimension[], blocked?: Blocked, infrastructure?: Infrastructure): RouteResult {
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

/** A route's check that stopped at its deadline: what its finished steps found, and why it stopped. */
export type Deadline = { readonly infrastructure: Infrastructure } | { readonly failure: Failure };

export function deadlineResult(route: string, deadline: Deadline, found: readonly Failure[]): RouteResult {
	const so = (r: RouteResult) => (found.length ? withFailures(r, [...found, ...r.failures]) : r);
	return 'infrastructure' in deadline ? so(partialResult(route, [], [], undefined, deadline.infrastructure)) : so(partialResult(route, [deadline.failure], []));
}

/** The old page loaded without a stylesheet of its own in every load (a stale snapshot naming a file its host no longer serves): it shows unstyled, so nothing is compared against it and the route is not checked rather than red. */
export function brokenOld(route: string, olds: readonly RouteCapture[]): RouteResult | undefined {
	const missing = (o: RouteCapture) => new Set(Object.values(o.pages).flatMap((p) => p.assets.filter((a) => a.type === 'stylesheet' && (a.status === 0 || a.status >= 400)).map((a) => `${a.url} (${a.status || 'no answer'})`)));
	const [first, ...rest] = olds.map(missing);
	const always = [...(first ?? [])].filter((s) => rest.every((r) => r.has(s)));
	if (!always.length) return undefined;
	return partialResult(route, [], [], undefined, { side: 'old', cause: 'old page broken', message: `OLD: the old page loads without its stylesheet ${always.join(', ')}, so it shows unstyled; serve the old side as it was (a snapshot whose files are all there) and check again` });
}

export function routeLocales(capture: RouteCapture, known: readonly string[]): string[] {
	const seo = Object.values(capture.pages)[0]?.seo ?? {};
	const found = Object.keys(seo).flatMap((key) => (key.startsWith('hreflang:') && key !== 'hreflang:x-default' ? [key.slice('hreflang:'.length)] : []));
	return [...new Set([...known, ...found, ...(seo['html:lang'] ? [seo['html:lang']] : [])])].sort();
}

/** The forced CSS states, then the journeys on top. While both apps hold every write back, nothing a journey does can change what a forced state shows, so the two run side by side and the result is the same. */
export async function statesAndJourneys(run: RouteContext['writes'], result: RouteResult, states: (input: RouteResult) => Promise<RouteResult>, journeys: (input: RouteResult) => Promise<RouteResult>): Promise<RouteResult> {
	if (run.old.sendWrites || run.new.sendWrites) return journeys(await states(result));
	const [stated, journeyed] = await Promise.allSettled([states(result), journeys(result)]);
	if (stated.status === 'rejected') throw stated.reason;
	if (journeyed.status === 'rejected') throw journeyed.reason;
	const j = journeyed.value;
	return withFailures(stated.value, [...stated.value.failures, ...j.failures.slice(result.failures.length)], { journeys: j.journeys, coverage: j.coverage, writes: j.writes });
}

/** Every check of one route as one role, from the bot-wall probe to where each failure's element is in the source. */
export async function roleCheck(o: Observe, ctx: RouteContext): Promise<RouteResult> {
	const { route } = ctx;
	const walls = await o('wall', {});
	const wall = walls.old ?? walls.new;
	if (wall) return partialResult(route, [], [], wall);
	const gate: Failure[] = [];
	if (ctx.role) {
		const decided = await o('gate', { role: ctx.role });
		if (!decided.comparable) return partialResult(route, decided.failures, ['http', 'auth']);
		gate.push(...decided.failures);
	}
	try {
		const checked = ctx.light ? await lightCheck(o, ctx) : await routeCheck(o, ctx);
		const links = shellRoute(route, ctx.oldRouting) ? await o('hashLinks', {}) : [];
		const result = links.length ? withFailures(checked, [...checked.failures, ...links]) : checked;
		// A wall that started part way through (an asset, a journey's post, a forced state) stops the route like one at the door.
		const hits = await o('walls', {});
		const hit = hits.old ? ({ side: 'old', ...hits.old } as const) : hits.new ? ({ side: 'new', ...hits.new } as const) : undefined;
		if (hit) return partialResult(route, [], [], blockedResult(hit.side, hit.status, hit));
		ctx.passed?.();
		if (!gate.length) return result;
		return withFailures(result, [...gate, ...result.failures]);
	} catch (error) {
		if (stops(ctx, error)) throw error;
		const timedOut = loadTimeout(route, error, [ctx.origins.old, ctx.origins.new]);
		if (timedOut) return timedOut;
		if (!(error instanceof BlockedError)) throw error;
		return partialResult(route, [], [], blockedResult(error.origin === ctx.origins.new && error.origin !== ctx.origins.old ? 'new' : 'old', error.blocked.status, error.blocked));
	}
}

/** Every viewport's checks of a page, then its forced states, journeys, widget probes, busy-CPU lane, motion, timings and embeds. */
export async function routeCheck(o: Observe, ctx: RouteContext): Promise<RouteResult> {
	const { route, viewports } = ctx;
	ctx.total?.(3 + [ctx.stages.probes, ctx.stages.busyCpu, ctx.stages.motion, ctx.stages.responsiveness, ctx.stages.embeds].filter(Boolean).length);
	const { olds, next } = await span(ctx, 'load both sides', () => o('load', { light: false }));
	const broken = brokenOld(route, olds);
	if (broken) return broken;
	const oldA = olds[0]!;
	const probes = new Map(await o('assets', { urls: assetsToProbe(oldA, next) }));
	const languages = routeLocales(oldA, ctx.locales);
	const [negotiatedA, negotiatedB, negotiatedNew] = await o('negotiate', { languages });
	const compared = compareRoute(route, olds, next, probes, ctx.source?.clients);
	const noise = noiseReport(olds, ctx.frozen, ctx.source?.nondeterminism);
	const loadWrites = (Object.values(oldA.pages)[0]?.writes ?? []).map((w) => ({ ...w, during: 'page load' }));
	const selfUrls = await o('selfUrls', {});
	const result = reach(ctx, withFailures(compared, [...compared.failures, ...negotiationFailures(route, languages, [negotiatedA, negotiatedB], negotiatedNew), ...selfUrls], { noise, writes: loadWrites }));
	const owner = storageOwner(olds.flatMap((x) => Object.values(x.pages)), Object.values(next.pages));
	const journeyed = reach(ctx, await statesAndJourneys(ctx.writes, result, (input) => span(ctx, 'forced states', () => statesCheck(o, ctx, olds, input)), (input) => span(ctx, 'journeys', () => journeysCheck(o, ctx, input, owner))));
	const explored = reach(ctx, ctx.stages.probes ? await span(ctx, 'widget probes', () => probeCheck(o, ctx, journeyed, true, Boolean(ctx.stages.controls?.webkit))) : journeyed);
	const busy = ctx.stages.busyCpu ? await span(ctx, 'busy CPU', () => o('busy', {})) : undefined;
	const lane = reach(ctx, busy?.failures.length ? withFailures(explored, [...explored.failures, ...busy.failures]) : explored);
	const moved = reach(ctx, ctx.stages.motion && lane.journeys?.length ? await span(ctx, 'motion', () => motionCheck(o, ctx, lane, oldA.pages[viewports[0]!.name]?.stylesheets ?? [])) : lane);
	const timed = reach(ctx, ctx.stages.responsiveness && moved.journeys?.length ? await span(ctx, 'responsiveness', () => responsivenessCheck(o, ctx.route, moved)) : moved);
	// The page captures already list each side's embeds: a route with none on either side has nothing for the embed step.
	const embedded = [...olds, next].some((capture) => Object.values(capture.pages).some((page) => page.liveEmbeds?.length));
	const checked = ctx.stages.embeds && embedded ? await span(ctx, 'embeds', () => embedsCheck(o, timed)) : timed;
	const located = await locateCheck(o, checked);
	return oldA.http.status < 400 && (next.http.status === 404 || next.http.status === 410) ? { ...located, notPorted: true } : located;
}

/** One viewport's http, rendered, seo, assets, css, a11y, i18n, network, weight and behaviour checks: what a page gets when its template group's representative carries visual, responsiveness and motion. Every page's own controls are used and compared, whatever its template: two pages alike in layout can hold different widgets. */
export async function lightCheck(o: Observe, ctx: RouteContext): Promise<RouteResult> {
	const { route } = ctx;
	const { olds, next } = await o('load', { light: true });
	const broken = brokenOld(route, olds);
	if (broken) return broken;
	const oldA = olds[0]!;
	const probes = new Map(await o('assets', { urls: assetsToProbe(oldA, next) }));
	const compared = compareRoute(route, olds, next, probes, ctx.source?.clients);
	const kept = compared.failures.filter((f) => !REPRESENTATIVE_ONLY.includes(f.dimension as Dimension));
	const checked = withFailures({ ...compared, visualDiffs: [], shots: [] }, kept, { noise: noiseReport(olds, ctx.frozen, ctx.source?.nondeterminism) });
	const skipped = { ...checked, dimensions: { ...checked.dimensions, ...Object.fromEntries(REPRESENTATIVE_ONLY.map((d) => [d, 'skipped'])) } as RouteResult['dimensions'] };
	const owner = storageOwner(olds.flatMap((x) => Object.values(x.pages)), Object.values(next.pages));
	reach(ctx, skipped);
	const journeyed = reach(ctx, await journeysCheck(o, ctx, skipped, owner));
	// The second engine's pop-up places are compared on the template group's representative, as the other per-template checks are.
	const probed = ctx.stages.probes ? await probeCheck(o, ctx, journeyed, false, false) : journeyed;
	const located = await locateCheck(o, probed);
	return oldA.http.status < 400 && (next.http.status === 404 || next.http.status === 410) ? { ...located, notPorted: true } : located;
}

// Forces every state the OLD stylesheets style, on the first viewport, and names the OLD rule behind each computed-style failure.
async function statesCheck(o: Observe, ctx: RouteContext, olds: readonly RouteCapture[], result: RouteResult): Promise<RouteResult> {
	const plan = statesPlan(result, olds, ctx.viewports, discoverStates(olds[0]!.pages[ctx.viewports[0]!.name]?.stylesheets ?? []));
	return judgeStates(ctx.route, result, plan, olds, ctx.viewports, await o('states', statesRequest(plan)));
}

/** What OLD's journeys did, replayed on OLD again and on NEW, compared; a step slower only on NEW is timed again before it stands. */
async function journeysCheck(o: Observe, ctx: RouteContext, result: RouteResult, owner?: StorageOwner): Promise<RouteResult> {
	const { route } = ctx;
	const row = await o('journeys', {});
	const { explored, runs, next, oldRisky, oldRiskyAgain, newRisky } = row;
	const plain = explored.journeys;
	const risky = explored.deferred.map((d) => d.journey);
	const journeys: RecordedJourney[] = [...plain, ...risky.map((j, i) => ({ ...j, expected: oldRisky[i]! }))];
	const olds = runs.map((r, k) => [...r, ...(k === 0 ? oldRisky : oldRiskyAgain)]);
	const elements = explored.elements.map((e) => destructiveCoverage(e, explored.deferred, oldRisky));
	const reachable = new Map(row.reachable);
	const writes = journeys.flatMap((j) => j.expected.flatMap((step) => (step.writes ?? []).map((w) => ({ ...w, during: j.name }))));
	const coverage: Coverage = { total: elements.length, exercised: elements.filter((e) => e.by).length, elements, skipped: explored.skipped, ...(explored.sequencesSkipped ? { sequencesSkipped: explored.sequencesSkipped } : {}) };
	const unexercised = [...elements.filter((e) => !e.by && !e.shared && !notAControl(e.reason)).map((e) => notExercised(route, e.element, e.reason ?? 'no journey used it', reachable.get(e.signature))), ...leftOut(route, explored)];
	const doorErrors = new Map(row.doorErrors);
	const dark = themed(plain);
	const improvements: string[] = [];
	// A page to arrive from that does not load is no reason to drop the route's own result: those journeys are reported as not compared, and the route stays red.
	const arrivedFailures = explored.arrival
		? await span(ctx, 'arrival journeys', () => arrivalCheck(o, route, plain, explored.arrival!, owner, improvements, Boolean(ctx.stages.original))).catch((error: unknown): Failure[] => {
				if (stops(ctx, error)) throw error;
				return [{ route, dimension: 'behaviour', check: `journeys after arriving from ${explored.arrival!.entry} by ${describeTarget(explored.arrival!.link)}`, expected: 'the route\'s journeys compared after arriving in place', actual: `not compared: ${(error as Error).message.split('\n')[0]}`, hint: HINTS.coverage }];
			})
		: [];
	const mainFailures = await retime(o, 'main', journeys, compareJourneys(route, olds, journeys, [...next, ...newRisky], owner, doorErrors, improvements), olds, [...next, ...newRisky], Boolean(ctx.stages.original));
	if (dark.length && !row.dark) throw new Error(`the journeys row has no dark-mode replays of ${route}'s theme cycles`);
	const darkFailures = dark.length ? compareJourneys(route, row.dark!.olds, inDarkMode(dark), row.dark!.next, owner, doorErrors, improvements) : [];
	const compared = withFailures(result, [...result.failures, ...mainFailures, ...darkFailures, ...arrivedFailures, ...unexercised], { journeys, coverage, writes: [...(result.writes ?? []), ...writes] });
	return improvements.length ? { ...compared, improvements: [...(compared.improvements ?? []), ...improvements] } : compared;
}

/** The journeys run after arriving from another page: one per kind of control, each starting with the link that arrives. */
export function arrivalJourneys(plain: readonly RecordedJourney[], arrival: NonNullable<Exploration['arrival']>): Journey[] {
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
	return distinct.slice(0, MAX_ARRIVED).map((j) => ({ name: `${j.name}, ${how}`, steps: [arrive, ...j.steps], start: arrival.entry, ...(j.patience ? { patience: j.patience } : {}) }));
}

/**
 * The route's journeys again, arriving the way a visitor does from another page: that page loads, its link to the route is
 * followed (the router swaps the page in place), then the journey's steps run. Twice on old and once on new, compared alike;
 * a part that only works on a fresh load (one whose script runs once, at load) is red here.
 */
async function arrivalCheck(o: Observe, route: string, plain: readonly RecordedJourney[], arrival: NonNullable<Exploration['arrival']>, owner: StorageOwner | undefined, improvements: string[], fresh: boolean): Promise<Failure[]> {
	const journeys = arrivalJourneys(plain, arrival);
	if (!journeys.length) return [];
	// A page the new app does not serve (a port of only some routes) has no link to arrive by: that page's own check reports it, not this route's journeys.
	const seen = await o('arrival', { entry: arrival.entry, journeys });
	if (!seen) return [];
	const { a, b, next } = seen;
	return retime(o, 'arrival', journeys, compareJourneys(route, [a, b], journeys, next, owner, undefined, improvements), [a, b], next, fresh);
}

// The candidates a route confirms at a time, the largest first: five old and four new samples in all (the replays producer
// takes three rounds of each), enough for a one-sided test to reach the share of 0.05 five candidates leave the first of them.
const RETIMED = 5;

/**
 * A step answered more slowly on the new page, or showing a view in between only there, is timed again one side at a time,
 * old then new, since a busy machine slows whichever side it happens to. It stands only when the samples say so beyond chance,
 * the route's candidates sharing one significance, and an answer only by more than the route's own old runs differ.
 */
async function retime(o: Observe, set: 'main' | 'arrival', journeys: readonly Journey[], failures: Failure[], olds: readonly Runs[], next: Runs, fresh = false): Promise<Failure[]> {
	// Stored old runs were timed on another machine at another time: with them, they only pick the candidates (`fresh`).
	const floor = Math.max(100, answerFloor(olds));
	const freshOld: StepResult[][][] = [];
	const judgedFloor = () => (fresh ? Math.max(100, answerFloor(freshOld)) : floor);
	const effect = (f: Failure) => {
		const { journey, step, views, cadence } = timedOnly.get(f)!;
		if (views || cadence) return Infinity;
		const times = olds.map((x) => x[journey]?.[step]?.reaction?.answeredMs);
		const mine = next[journey]?.[step]?.reaction?.answeredMs;
		return mine === undefined || times.some((t) => t === undefined) ? Infinity : mine - Math.max(...(times as number[]));
	};
	const timed = failures.filter((f) => timedOnly.has(f));
	// Within what the route's own old runs differ by is the machine, not the page.
	const candidates = timed.filter((f) => effect(f) > floor).sort((a, b) => effect(b) - effect(a));
	const replays = new Map<number, Promise<readonly RetimeRound[]>>();
	const roundsOf = (journey: number) => {
		if (!replays.has(journey)) replays.set(journey, o('retime', { set, journey: journeys[journey]! }));
		return replays.get(journey)!;
	};
	const unconfirmed = new Set<Failure>();
	const sample = async (i: number): Promise<Samples> => {
		const failure = candidates[i]!;
		const { journey, step, views, cadence } = timedOnly.get(failure)!;
		const first = olds.map((x) => x[journey]?.[step]).filter((r): r is StepResult => Boolean(r));
		const got = await roundsOf(journey);
		if (fresh) got.forEach((r, k) => ((freshOld[k] ??= [])[journey] = [...r.old]));
		const rounds = got.map((r) => ({ old: r.old[step], next: r.next[step] }));
		const mine = next[journey]?.[step];
		if (views || cadence) {
			const shows = (r: StepResult | undefined) => (r?.reaction?.views ? (cadence ? choppier(first, r) : interimViews(first, r)) !== undefined : undefined);
			const ox = rounds.map((r) => shows(r.old)), nx = rounds.map((r) => shows(r.next));
			if ([...ox, ...nx].some((x) => x === undefined)) unconfirmed.add(failure);
			return fresh ? { kind: 'shown', old: ox.map(Boolean), next: nx.map(Boolean) } : { kind: 'shown', old: [...first.map(() => false), ...ox.map(Boolean)], next: [true, ...nx.map(Boolean)] };
		}
		const ox = rounds.map((r) => r.old?.reaction?.answeredMs), nx = rounds.map((r) => r.next?.reaction?.answeredMs);
		if ([...ox, ...nx].some((x) => x === undefined)) unconfirmed.add(failure);
		if (fresh) return { kind: 'answer', old: ox.map((x) => x ?? 0), next: nx.map((x) => x ?? 0) };
		return { kind: 'answer', old: [...first.map((r) => r.reaction?.answeredMs ?? 0), ...ox.map((x) => x ?? 0)], next: [mine?.reaction?.answeredMs ?? 0, ...nx.map((x) => x ?? 0)] };
	};
	const verdicts = await judgeInTurn(candidates.length, RETIMED, sample, (batch) => judgeTiming(batch, judgedFloor()));
	const stands = new Map<Failure, string>();
	for (const [i, { samples: s, judged: v, among }] of verdicts.entries()) {
		const failure = candidates[i]!;
		// A step that could not be timed again keeps its failure, unconfirmed, as before.
		if (unconfirmed.has(failure)) stands.set(failure, '; it could not be timed again one side at a time');
		else if (v.stands) stands.set(failure, s.kind === 'answer' ? `; timed again one side at a time: old ${s.old.join(', ')} ms, new ${s.next.join(', ')} ms (p = ${v.p.toFixed(3)}, under the ${v.alpha.toFixed(4)} its rank among the ${among} judged with it needs; old runs differ by up to ${judgedFloor()} ms here)` : `; timed again one side at a time: the new page showed it in ${s.next.filter(Boolean).length} of ${s.next.length} runs, the old in ${s.old.filter(Boolean).length} of ${s.old.length} (p = ${v.p.toFixed(3)})`);
	}
	return failures.filter((f) => !timedOnly.has(f) || stands.has(f)).map((f) => (stands.has(f) ? { ...f, actual: `${f.actual}${stands.get(f)}` } : f));
}

/** The widget probes of the route's controls, the moved-clock look and control parity, old against new, on top of what the journeys found; pop-up motion is filmed on routes that carry motion. */
export async function probeCheck(o: Observe, ctx: RouteContext, result: RouteResult, film: boolean, webkit: boolean): Promise<RouteResult> {
	const { route } = ctx;
	const clock = await o('clock', {});
	const out = judgeProbes(route, await o('probes', { notify: notifiers(result.journeys) }));
	const parity = ctx.stages.controls
		? await span(ctx, 'control parity', () => o('parity', { film: film && Boolean(ctx.stages.motion), webkit }).then((row) => judgeControlParity(route, row))).catch((error: Error): ControlParityResult => {
				if (error instanceof Unobserved) throw error;
				return { failures: [{ route, dimension: 'behaviour' as const, check: 'control parity', expected: 'control parity runs', actual: error.message.split('\n')[0]!, hint: 'Control parity could not load the route on one side.' }], shots: [], tried: 0, leftOut: 0, ms: 0 };
			})
		: undefined;
	const failures = [...clock, ...out.failures, ...(parity?.failures ?? [])];
	const shots = parity?.shots.length ? { shots: [...result.shots, ...parity.shots] } : {};
	return { ...(failures.length ? withFailures(result, [...result.failures, ...failures], shots) : { ...result, ...shots }), probes: { controls: out.controls, ms: out.ms, stateMs: out.stateMs, stateSpread: out.stateSpread }, ...(parity ? { controlParity: { tried: parity.tried, leftOut: parity.leftOut, ms: parity.ms } } : {}) };
}

/** `check --only probes`: the widget probes alone, on a result that compares nothing else. */
export function probesOnly(o: Observe, ctx: RouteContext): Promise<RouteResult> {
	const { route } = ctx;
	const empty = { ...partialResult(route, [], ['behaviour', 'a11y', 'rendered']), ok: true };
	return probeCheck(o, ctx, empty, false, Boolean(ctx.stages.controls?.webkit)).catch((error: Error) => {
		if (error instanceof Unobserved) throw error;
		return partialResult(route, [{ route, dimension: 'behaviour', check: 'the widget probes', expected: 'the widget probes run', actual: error.message.split('\n')[0]!, hint: 'The widget probes could not load the route on one side.' }], []);
	});
}

async function motionCheck(o: Observe, ctx: RouteContext, result: RouteResult, sources: readonly StyleSource[]): Promise<RouteResult> {
	const journeys = result.journeys ?? [];
	const moved = judgeMotion(ctx.route, ctx.viewports[0]!, journeys, { ...ctx.stages.motion, rules: motionRules(parseRules(sources)) }, await o('motion', { journeys }));
	return withFailures(result, [...result.failures, ...moved.failures], { motion: moved.motion, ...(moved.filmstrips.length ? { filmstrips: moved.filmstrips } : {}) });
}

async function responsivenessCheck(o: Observe, route: string, result: RouteResult): Promise<RouteResult> {
	// The new app is timed on its own, not through the front door: a link's target is its page as it will serve it.
	const timed = judgeResponsiveness(route, await o('responsiveness', { journeys: (result.journeys ?? []).filter((j) => !j.destructive) }));
	return withFailures(result, [...result.failures, ...timed.failures], { responsiveness: timed.responsiveness });
}

async function embedsCheck(o: Observe, result: RouteResult): Promise<RouteResult> {
	const out = await o('embeds', {});
	return out.failures.length || out.shots.length ? withFailures(result, [...result.failures, ...out.failures], { shots: [...result.shots, ...out.shots] }) : result;
}

async function locateCheck(o: Observe, result: RouteResult): Promise<RouteResult> {
	const { patches, newFiles } = await o('locate', { failures: result.failures });
	if (patches.length !== result.failures.length) throw new Error(`the locate row places ${patches.length} failures where the route has ${result.failures.length}`);
	return { ...result, failures: result.failures.map((f, i) => (patches[i] ? { ...f, ...patches[i] } : f)), ...(newFiles ? { newFiles } : {}) };
}

/** How a control that ends the session or deletes was exercised: by its journey, with the requests it made held back or sent. */
export function destructiveCoverage(e: ElementCoverage, deferred: Exploration['deferred'], results: Runs): ElementCoverage {
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

/** Elements the old page would not let a visitor use, tried on the new page: the same reason on both is accepted automatically. */
export function unreachableAlike(elements: readonly ElementCoverage[], results: Runs): [string, NonNullable<Failure['automatic']>][] {
	const out: [string, NonNullable<Failure['automatic']>][] = [];
	unreachableTried(elements).forEach((e, i) => {
		const failed = results[i]!.find((r) => r.failed);
		const candidate = unreachableCandidate(e.unreachable!.kind, e.reason ?? '', failed);
		if (candidate) out.push([e.signature, candidate]);
	});
	return out;
}

/** The elements whose journey is tried on the new page to see whether it is unreachable there too. */
export const unreachableTried = (elements: readonly ElementCoverage[]) => elements.filter((e) => e.unreachable && !e.by && !e.shared);

/** Keyboard journeys and repeated-use sequences the budget left out: what they would have compared was compared nowhere, so the route is red until they run. */
export function leftOut(route: string, explored: Pick<Exploration, 'skipped' | 'sequencesSkipped'>): Failure[] {
	const out: Failure[] = [];
	const n = (k: number, what: string) => `${k} ${what}${k === 1 ? '' : 's'}`;
	if (explored.skipped) out.push(notExercised(route, n(explored.skipped, 'keyboard journey'), `left out when the journey budget ran out; raise --max-journeys until they run`));
	if (explored.sequencesSkipped) out.push(notExercised(route, n(explored.sequencesSkipped, 'repeated-use or closing sequence'), `left out when the journey budget ran out; raise --max-journeys until they run`));
	return out;
}

/**
 * What the original's page lists as clickable but no visitor can use as such: a box of no size at rest, and one covered by a
 * link or button over it (a card's stretched link), where the cover is the control.
 */
export const notAControl = (reason: string | undefined): boolean => /could not be used: hidden: it has no size|could not be used: occluded: covered by (a|button)\b/.test(reason ?? '');

export function notExercised(route: string, element: string, reason: string, automatic?: Failure['automatic']): Failure {
	return { route, dimension: 'behaviour', check: `${NOT_EXERCISED}${element}`, expected: 'a journey that uses it on the old page, replayed on the new one', actual: reason, hint: HINTS.coverage, ...(automatic ? { automatic } : {}) };
}
