import type { RecordedJourney } from './journeys.ts';
import type { NetworkCapture } from './network.ts';
import type { NondeterminismFact } from './source-facts.ts';

export const DIMENSIONS = ['http', 'rendered', 'visual', 'seo', 'assets', 'css', 'a11y', 'i18n', 'behaviour', 'network', 'weight'] as const;
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

export interface Failure {
	readonly route: string;
	readonly dimension: Dimension;
	readonly check: string;
	readonly viewport?: string;
	readonly expected: string;
	readonly actual: string;
	readonly hint: string;
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
	readonly ok: boolean;
	readonly dimensions: Readonly<Record<Dimension, 'pass' | 'fail'>>;
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
}
