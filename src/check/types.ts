import type { Png } from './artifacts.ts';
import type { RuntimeMarker } from './residue.ts';
import type { AutomaticRule } from '../overrides.ts';
import type { RawSource } from './hints-page.ts';
import type { ElementCoverage, RecordedJourney } from './journeys.ts';
import type { NetworkCapture } from './network.ts';
import type { LiveEmbed } from './embeds.ts';
import type { LoopEffect } from './loops.ts';
import type { NondeterminismFact } from './source-facts.ts';
import type { Responsiveness, SpeedName, Worst } from './responsiveness.ts';
import type { Filmstrip, MotionResult } from './motion.ts';
import type { RouteLoad } from './load.ts';

export const DIMENSIONS = ['http', 'auth', 'rendered', 'visual', 'seo', 'assets', 'css', 'a11y', 'i18n', 'behaviour', 'network', 'data', 'weight', 'load', 'responsiveness', 'motion', 'navigation'] as const;
export type Dimension = (typeof DIMENSIONS)[number];
/** Route coverage is measured for the whole site, not per route: a failure of it names the route the new app lacks. */
export type FailureDimension = Dimension | 'coverage';

/** Checked only on its template group's representative: the rest of the group gets every other dimension. */
export const REPRESENTATIVE_ONLY: readonly Dimension[] = ['visual', 'behaviour', 'responsiveness', 'motion', 'load'];

/** A dimension was left out because a side was blocked or let this role in differently; unmeasured responsiveness or motion, or one its template's representative checks, is not that. */
export function notCompared(route: Pick<RouteResult, 'dimensions' | 'template' | 'route' | 'only'>): boolean {
	if (route.only) return false;
	const byRepresentative = route.template && route.template.representative !== route.route;
	return Object.entries(route.dimensions).some(([d, state]) => state === 'skipped' && d !== 'responsiveness' && d !== 'motion' && d !== 'navigation' && d !== 'load' && !(byRepresentative && REPRESENTATIVE_ONLY.includes(d as Dimension)));
}

export interface Viewport {
	readonly name: string;
	readonly width: number;
	readonly height: number;
	readonly isMobile: boolean;
}

export const VIEWPORTS: readonly Viewport[] = [
	{ name: 'desktop', width: 1280, height: 800, isMobile: false },
	{ name: 'mobile', width: 390, height: 844, isMobile: true },
];

export interface HttpHop {
	readonly url: string;
	readonly status: number;
}

export interface HttpCapture {
	readonly chain: readonly HttpHop[];
	readonly status: number;
	readonly contentType: string;
}

export interface Box {
	readonly x: number;
	readonly y: number;
	readonly width: number;
	readonly height: number;
}

export interface ElementSnapshot {
	readonly id: number;
	readonly role: string;
	readonly name: string;
	readonly tag: string;
	readonly text: string;
	readonly path: string;
	readonly box: Box;
	readonly style: Readonly<Record<string, string>>;
	/** The font files that render this element's own text: web fonts by content hash, system fonts by name. */
	readonly font?: string;
	/** Where the page says this element was written: dev hooks, data attributes, component functions. */
	readonly sources?: readonly RawSource[];
	/** Its ancestors from `html` down and itself, each `tag:n` (the n-th of its tag among its siblings). */
	readonly chain?: string;
}

export interface AssetRecord {
	readonly url: string;
	readonly type: string;
	readonly status: number;
	readonly contentType: string;
	readonly bytes: number;
	readonly fingerprinted: boolean;
	/** For a script: the UI framework whose runtime its code carries. */
	readonly runtime?: string;
}

export interface ImageRecord {
	readonly src: string;
	readonly alt: string | null;
	readonly naturalWidth: number;
	readonly naturalHeight: number;
	readonly broken: boolean;
}

export interface ScriptWeight {
	readonly url: string;
	readonly bytes: number;
	readonly source: number;
	readonly executed: number;
}

/** downloaded: bytes on the wire (compressed when the server compresses); source and executed: uncompressed source bytes. */
export interface Weight {
	readonly downloaded: number;
	readonly source: number;
	readonly executed: number;
	readonly scripts: readonly ScriptWeight[];
}

export interface A11yCapture {
	/** axe-core violations by rule id. */
	readonly violations: Readonly<Record<string, { readonly impact: string; readonly help: string; readonly helpUrl: string; readonly count: number; readonly targets: readonly string[] }>>;
	readonly landmarks: readonly string[];
	/** Role and name of each element Tab reaches, from Chromium's accessibility tree. */
	readonly focusOrder: readonly string[];
	/** Animations still running while prefers-reduced-motion is reduce. */
	readonly motion: readonly string[];
}

export interface PageCapture {
	readonly viewport: string;
	readonly finalUrl: string;
	/** The page file that rendered the route, when the app names it (Markless's router does). */
	readonly routeFile?: string;
	readonly aria: readonly string[];
	readonly text: readonly string[];
	readonly seo: Readonly<Record<string, string>>;
	readonly assets: readonly AssetRecord[];
	readonly stylesheets: readonly { readonly url: string; readonly text: string }[];
	readonly decoded: Readonly<Record<string, { width: number; height: number }>>;
	readonly images: readonly ImageRecord[];
	readonly fonts: readonly string[];
	readonly elements: readonly ElementSnapshot[];
	readonly screenshot: Buffer;
	readonly weight: Weight;
	readonly a11y?: A11yCapture;
	readonly network?: NetworkCapture;
	/** Requests to tracker hosts that were blocked, by host. */
	readonly blocked?: Readonly<Record<string, number>>;
	/** Writes the page made while loading, sent or held back. */
	readonly writes?: readonly WriteLine[];
	/** What the page keeps in the browser once loaded: storage keys, IndexedDB stores, cookies. */
	readonly storage?: readonly string[];
	/** Cookies whose value is in a server framework's own sealed format, by name: the framework that wrote them. */
	readonly sealed?: Readonly<Record<string, string>>;
	/** Markup the page's framework adds for itself (a route announcer), with the roles inside it. */
	readonly internals?: readonly { readonly framework: string; readonly what: string; readonly selector: string; readonly roles: readonly string[]; readonly text: string }[];
	/** Markers an old framework's runtime writes for itself, in the served HTML or the loaded page. */
	readonly residue?: readonly RuntimeMarker[];
	/** Iframes and images from other origins, with their boxes in page coordinates. */
	readonly embeds?: readonly { readonly tag: 'iframe' | 'img'; readonly src: string; readonly box: Box }[];
	/** Iframes and plugins from other origins, and videos: masked in screenshots, compared by what the page controls. */
	readonly liveEmbeds?: readonly LiveEmbed[];
	/** Loops (live intervals, self-scheduling timeouts and animation frames) held at their start for the capture, and what each kept changing. */
	readonly loops?: readonly LoopEffect[];
}

export interface WriteLine {
	/** `POST /path {shape}`, or `would POST ...` when it was held back. */
	readonly line: string;
	readonly reason: string;
	readonly sent: boolean;
}

export interface RouteCapture {
	readonly origin: string;
	readonly route: string;
	readonly http: HttpCapture;
	readonly pages: Readonly<Record<string, PageCapture>>;
}

export interface SourceLink {
	/** Path relative to the app's source root when known, else as the source map or page names it. */
	readonly file: string;
	readonly line?: number;
	readonly column?: number;
	/** Absolute path on this machine, when the file exists, for editor links. */
	readonly path?: string;
	/** How it was found: `source map`, `react`, `vue`, `svelte`, `data attribute`, `markless route`, `source text`... */
	readonly how: string;
}

export interface Failure {
	readonly route: string;
	/** The role the route was checked as, when check ran with --auth. */
	readonly role?: string;
	readonly dimension: FailureDimension;
	readonly check: string;
	readonly viewport?: string;
	readonly expected: string;
	readonly actual: string;
	readonly hint: string;
	/** Where the element behind this failure comes from in the old and new source. */
	readonly old?: SourceLink;
	readonly new?: SourceLink;
	/** One line naming both locations, for example `old ProductCard.tsx:42 renders "£4"; new product-card.tsrx:17 renders "£5"`. */
	readonly where?: string;
	/** Stable across runs: the same difference on the same route gets the same id, for `accept <id>`. */
	readonly id?: string;
	/** Evidence the check found that this difference is no user-visible regression, and the rule it meets; granted by applyAccepted. */
	readonly automatic?: { readonly rule: AutomaticRule; readonly reason: string };
	/** Set when `.migrate/accepted.json` lists this difference as intended, or an automatic rule accepted it (`automatic`): it does not turn the route red. */
	readonly accepted?: { readonly reason: string; readonly by: string; readonly date: string; readonly automatic?: AutomaticRule };
}

/** A pair of screenshots of one route in one viewport and state, with the boxes where they differ. */
export interface Shot {
	readonly label: string;
	readonly viewport: string;
	readonly old: Png;
	readonly new: Png;
	readonly diff?: Png;
	readonly regions: readonly Box[];
	readonly ok: boolean;
}

export interface RouteResult {
	readonly route: string;
	/** The role the route was checked as, when check ran with --auth. */
	readonly role?: string;
	readonly ok: boolean;
	/** `skipped`: not compared, because a side was blocked or the two sides did not let this role in alike. */
	readonly dimensions: Readonly<Record<Dimension, 'pass' | 'fail' | 'skipped'>>;
	/** A bot wall or challenge page answered instead of the app, so nothing was compared. */
	readonly blocked?: Blocked;
	/** An app could not be reached or did not answer in time, so the route was not compared: the network's failure, not the app's. */
	readonly infrastructure?: Infrastructure;
	readonly failures: readonly Failure[];
	readonly weight: { readonly old: Omit<Weight, 'scripts'>; readonly new: Omit<Weight, 'scripts'> };
	readonly visualDiffs: readonly { viewport: string; png: Png }[];
	readonly shots: readonly Shot[];
	/** CSS states and conditions found in the OLD stylesheets: the ones forced and compared, and the ones that could not be. */
	readonly states?: { readonly checked: readonly string[]; readonly skipped: readonly string[] };
	/** Interactions explored on the OLD page and replayed on NEW, with what OLD did at each step. */
	readonly journeys?: readonly RecordedJourney[];
	/** Set instead of `journeys` once they were written to disk at the end of the route's check: the file, and each journey's name. */
	readonly storedJourneys?: { readonly path: string; readonly names: readonly string[] };
	/** Every interactive element of the OLD page and the journey that exercised it; one that none did keeps the route red. */
	readonly coverage?: Coverage;
	/** What still varied between OLD loads after freezing, and what was blocked. */
	readonly noise?: NoiseReport;
	/** The request contract of each side's first load: `browser GET host/path?query {body shape}`. */
	readonly network?: { readonly old: readonly string[]; readonly new: readonly string[]; readonly server: { readonly old: boolean; readonly new: boolean } };
	/** Every write the OLD page and its interactions made, and whether it was sent. */
	readonly writes?: readonly (WriteLine & { readonly during: string })[];
	/** Set when the route is not a page (robots.txt, a sitemap, a feed, JSON): what it was compared as. */
	readonly endpoint?: string;
	/** The new app's source files this route is rendered from, relative to its checkout, when check had it. */
	readonly newFiles?: readonly string[];
	/** The old app serves the route and the new one answers 404 or 410. */
	readonly notPorted?: boolean;
	/** Only this dimension was compared (`check --only load`); every other one is skipped, not passed. */
	readonly only?: 'load';
	/** How soon each control the journeys exercised answers its first use, and each internal link shows the next page, old and new, at desktop speed and on a throttled phone. */
	readonly responsiveness?: Responsiveness;
	/** The template group the route was put in (by URL pattern, page structure and the kinds of control it renders); visual, behaviour, responsiveness and motion were checked on its representative. */
	readonly template?: { readonly pattern: string; readonly representative: string; readonly members: number };
	/** The transitions and animations each interaction starts, old and new, with motion allowed and with reduced motion, and those hovering and focusing each control start. */
	readonly motion?: MotionResult;
	/** Frames of interactions whose motion differs, old and new at the same offsets. */
	readonly filmstrips?: readonly Filmstrip[];
	/** How in-place navigation to this page was compared with a fresh load of it: from which pages, or which page of the same shape stood for it. */
	readonly navigation?: RouteNavigation;
	/** Lighthouse's mobile page-load metrics, old and new, a median of several runs each, and each metric's verdict. */
	readonly load?: RouteLoad;
}

/** The new app's in-place navigation to one route, compared with a fresh load of it (src/check/nav-parity.ts). */
export interface RouteNavigation {
	/** The entry pages it was reached from, each `from (variant)`; empty when another route of its shape stood for it. */
	readonly from: readonly string[];
	/** The route of the same layout and scripts that was checked for it. */
	readonly representedBy?: string;
}

/** Whether every route of the old site exists on the new app. */
export interface RouteCoverage {
	/** Planned routes the old app answers without an error. */
	readonly total: number;
	/** Of those, the ones the new app answers alike (same status class, same redirect target), HTML pages rendered by its Markless code. */
	readonly present: number;
	/** Routes the new app lacks that no accepted difference covers. */
	readonly missing: readonly string[];
	/** HTML routes the new app answers with a page its Markless code did not render (the old app's page passed through), that no accepted difference covers: not ported, like a missing route. */
	readonly servedByOld?: readonly string[];
	/** Routes the new app lacks on purpose, by an owner-recorded accepted difference. */
	readonly accepted: readonly string[];
	/** One failure per route the new app lacks, accepted or not. */
	readonly failures: readonly Failure[];
	/** Planned routes the old app itself answers with an error: not routes of the old site, so not counted. */
	readonly notOnOld: readonly string[];
	/** Planned routes an app did not answer after three tries (`/path (OLD)` or `/path (NEW)`), so not measured: coverage is not green while any is listed. */
	readonly unreachable: readonly string[];
	/** With --auth, the counts for each role: every route is fetched as each role, with its session, on both apps. */
	readonly roles?: readonly { readonly role: string; readonly total: number; readonly present: number; readonly missing: number }[];
}

/** The slowest timing on each side, and where: `route control`. */
export interface Slowest {
	readonly old?: number;
	readonly oldAt?: string;
	readonly new?: number;
	readonly newAt?: string;
}

/** The run's slowest first interaction and slowest navigation on each side, and each route's. */
export interface ResponsivenessSummary {
	readonly cpu: number;
	readonly budgetMs: number;
	/** The fixed latency every response had on both sides while timing. */
	readonly latencyMs?: number;
	/** The slowest document each app took to answer, as the checker fetched it (network included): reported beside the timings, which leave it out. */
	readonly server?: { readonly old?: number; readonly new?: number };
	readonly interaction?: Partial<Record<SpeedName, Slowest>>;
	readonly navigation?: Partial<Record<SpeedName, Slowest>>;
	readonly routes: readonly { readonly route: string; readonly role?: string; readonly ok: boolean; readonly interaction?: Partial<Record<SpeedName, Worst>>; readonly navigation?: Partial<Record<SpeedName, Worst>> }[];
}

export interface Coverage {
	readonly total: number;
	readonly exercised: number;
	readonly elements: readonly ElementCoverage[];
	/** Keyboard and dismiss journeys left out when the budget ran out. */
	readonly skipped: number;
	/** Repeated-use, closing and follow-a-link sequences left out when the budget ran out. */
	readonly sequencesSkipped?: number;
}

export interface Blocked {
	readonly side: 'old' | 'new';
	readonly vendor: string;
	readonly status: number;
	/** What gave the challenge away: a header, a cookie or a marker in the page. */
	readonly evidence: string;
	readonly message: string;
}

export type InfrastructureCause = 'dns' | 'connect' | 'timeout' | 'check timeout';

export interface Infrastructure {
	readonly side?: 'old' | 'new';
	readonly cause: InfrastructureCause;
	/** The network error code (`ERR_NAME_NOT_RESOLVED`, `ECONNREFUSED`), when there was one. */
	readonly code?: string;
	readonly origin?: string;
	readonly message: string;
}

/** Signing in as one role on both apps, and how the session cookies it set compare. */
export interface LoginResult {
	readonly role: string;
	readonly ok: boolean;
	readonly failures: readonly Failure[];
	/** Cookie names with their attributes, per side. */
	readonly cookies: { readonly old: readonly string[]; readonly new: readonly string[] };
}

export interface NoiseReport {
	/** Elements whose text changed between OLD loads, with why. */
	readonly noisy: readonly { readonly viewport: string; readonly element: string; readonly why: string }[];
	/** Tracker hosts blocked on the OLD page, with request counts. */
	readonly blocked: Readonly<Record<string, number>>;
}

/** A source of nondeterminism the source scan found, and whether the checker pins it. */
export interface PinnedSource extends NondeterminismFact {
	readonly pinned: string;
}

export interface Report {
	readonly version: 1;
	readonly old: string;
	readonly new: string;
	readonly startedAt: string;
	readonly ok: boolean;
	readonly routes: readonly RouteResult[];
	/** What freezing pinned in the browser for this run. */
	readonly pinned?: readonly string[];
	/** Nondeterminism sources the old app's source scan found, with how each is handled. */
	readonly sources?: readonly PinnedSource[];
	/** Recorded data: written from OLD (record) or served to both apps (replay). */
	readonly data?: { readonly mode: 'record' | 'replay'; readonly dir: string };
	/** Whether writes were sent to the apps or held back and compared unsent. */
	readonly writes?: 'sent' | 'held back';
	/** Source routes not checked because no crawled path or sample gave their dynamic segments a value. */
	readonly unchecked?: readonly { readonly route: string; readonly params: readonly string[]; readonly file?: string; readonly line?: number; readonly reason?: string }[];
	/** Roles checked, `anonymous` first, when check ran with --auth; routes are grouped in this order. */
	readonly roles?: readonly string[];
	readonly logins?: readonly LoginResult[];
	/** How many failures an accepted difference covered, automatic ones included. */
	readonly acceptedCount?: number;
	/** How many of those an automatic rule accepted. */
	readonly automaticCount?: number;
	/** First-interaction and navigation timings across the run, for the headline and the showcase. */
	readonly responsiveness?: ResponsivenessSummary;
	/** Accepted differences for routes checked in this run that no longer match any failure. */
	readonly staleAccepts?: readonly import('./accepted.ts').Accept[];
	/** Every checked route and sign-in is green: the verdict for the routes this run checked, which is the overall one only when the run is not partial. */
	readonly checkedOk?: boolean;
	/** Set when the run checked fewer routes than the plan lists (--route, --changed): it is never overall green. `total` is null without a plan. */
	readonly partial?: { readonly checked: number; readonly total: number | null };
	/** Every route of the old site checked for existence on the new app. */
	readonly coverage?: RouteCoverage;
	/** Pages grouped by template: every page got the other dimensions, visual, behaviour, responsiveness and motion ran on each group's representative. */
	readonly templates?: { readonly groups: readonly { readonly pattern: string; readonly representative: string; readonly members: readonly string[] }[] };
	/** In-place navigation compared with fresh loads on the new app: pages sampled, page loads it made and how long it took. */
	readonly navigation?: { readonly destinations: number; readonly pairs: number; readonly inPlace: number; readonly loads: number; readonly ms: number };
	/** How OLD's captures and journeys were found in the cache between runs: reused, never written, or not reused because a response the old page loaded or the checker changed. */
	readonly cache?: { readonly hit: number; readonly miss: number; readonly changed: number; readonly 'stale-checker': number };
}
