import type { RawSource } from './hints-page.ts';
import type { RecordedJourney } from './journeys.ts';
import type { NetworkCapture } from './network.ts';
import type { NondeterminismFact } from './source-facts.ts';

export const DIMENSIONS = ['http', 'auth', 'rendered', 'visual', 'seo', 'assets', 'css', 'a11y', 'i18n', 'behaviour', 'network', 'data', 'weight'] as const;
export type Dimension = (typeof DIMENSIONS)[number];

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
	readonly dimension: Dimension;
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
	/** Set when `.migrate/accepted.json` lists this difference as intended: it does not turn the route red. */
	readonly accepted?: { readonly reason: string; readonly by: string; readonly date: string };
}

/** A pair of screenshots of one route in one viewport and state, with the boxes where they differ. */
export interface Shot {
	readonly label: string;
	readonly viewport: string;
	readonly old: Buffer;
	readonly new: Buffer;
	readonly diff?: Buffer;
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
	readonly failures: readonly Failure[];
	readonly weight: { readonly old: Omit<Weight, 'scripts'>; readonly new: Omit<Weight, 'scripts'> };
	readonly visualDiffs: readonly { viewport: string; png: Buffer }[];
	readonly shots: readonly Shot[];
	/** CSS states and conditions found in the OLD stylesheets: the ones forced and compared, and the ones that could not be. */
	readonly states?: { readonly checked: readonly string[]; readonly skipped: readonly string[] };
	/** Interactions explored on the OLD page and replayed on NEW, with what OLD did at each step. */
	readonly journeys?: readonly RecordedJourney[];
	/** What still varied between OLD loads after freezing, and what was blocked. */
	readonly noise?: NoiseReport;
	/** The request contract of each side's first load: `browser GET host/path?query {body shape}`. */
	readonly network?: { readonly old: readonly string[]; readonly new: readonly string[]; readonly server: { readonly old: boolean; readonly new: boolean } };
	/** Every write the OLD page and its interactions made, and whether it was sent. */
	readonly writes?: readonly (WriteLine & { readonly during: string })[];
	/** Set when the route is not a page (robots.txt, a sitemap, a feed, JSON): what it was compared as. */
	readonly endpoint?: string;
}

export interface Blocked {
	readonly side: 'old' | 'new';
	readonly vendor: string;
	readonly status: number;
	/** What gave the challenge away: a header, a cookie or a marker in the page. */
	readonly evidence: string;
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
	readonly unchecked?: readonly { readonly route: string; readonly params: readonly string[]; readonly file?: string; readonly line?: number }[];
	/** Roles checked, `anonymous` first, when check ran with --auth; routes are grouped in this order. */
	readonly roles?: readonly string[];
	readonly logins?: readonly LoginResult[];
	/** How many failures an accepted difference covered. */
	readonly acceptedCount?: number;
	/** Accepted differences for routes checked in this run that no longer match any failure. */
	readonly staleAccepts?: readonly import('./accepted.ts').Accept[];
}
