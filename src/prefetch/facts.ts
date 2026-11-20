// How the original fetches pages ahead of a click, read from what the network did during experiments on its pages: which
// requests are a page's data is learned from the URLs the app itself fetched for link targets, never from framework names.

/** One same-origin request the page made during a recording, in the experiment phase it started in. */
export interface PrefetchRequest {
	/** Path and query, as requested. */
	readonly path: string;
	/** Playwright's resource type: document, fetch, xhr, script, other... */
	readonly type: string;
	/** The `Sec-Purpose` or `Purpose` header the browser sent (`prefetch`, `prefetch;prerender`). */
	readonly purpose?: string;
	readonly phase: string;
	/** ms after the recording's page load started. */
	readonly start: number;
	readonly end?: number;
	/** Response body bytes as sent (compressed), plus headers. */
	readonly bytes?: number;
	/** Completed with a response, cancelled (aborted by the page or the browser), failed otherwise, or still open when the phase ended. */
	readonly outcome: 'completed' | 'cancelled' | 'failed' | 'pending';
	readonly status?: number;
	/** Resource Timing says no byte crossed the network: the answer came from the browser's cache. */
	readonly cached?: boolean;
}

/** A same-origin link on the page. */
export interface PrefetchLink {
	/** The target's path (no trailing slash but on `/`), query kept. */
	readonly target: string;
	/** The landmark it sits in: header, nav, aside, main, footer, or body. */
	readonly region: string;
	/** Inside the viewport when the page had loaded. */
	readonly visibleAtLoad: boolean;
}

/**
 * `load` and `visible`: fetched while the page loaded (links off screen too, or only those on screen). `timer`: fetched
 * after the load went quiet with nothing done to the page (an idle callback, a timeout). `viewport`: fetched for a link the
 * probe's scroll brought into view. `scroll`: fetched during a scroll for a link it did not bring into view (a page that
 * starts fetching once the visitor first scrolls).
 */
export type Trigger = 'load' | 'visible' | 'timer' | 'viewport' | 'scroll' | 'hover' | 'focus' | 'pointerdown';
/** Earliest first: what each trigger fetches is fetched by every trigger before it too. */
export const TRIGGERS: readonly Trigger[] = ['load', 'visible', 'timer', 'viewport', 'scroll', 'hover', 'focus', 'pointerdown'];

export interface TriggerEvidence {
	/** Links whose target the experiment could tell about (not already fetched by an earlier trigger). */
	readonly tested: number;
	/** Of those, the ones whose target's data was fetched. */
	readonly fired: number;
	readonly targets: readonly string[];
	/** Median ms from the action to the first request for its target. */
	readonly delayMs?: number;
	/** Bytes those requests fetched (data and the code fetched in the same phase). */
	readonly bytes: number;
	readonly cancelled: number;
}

export const CONDITIONS = ['no-info', '4g', '3g', '2g', 'slow-2g', 'save-data', 'slow-link'] as const;
export type Condition = (typeof CONDITIONS)[number];

/** Under one network condition, whether each trigger still fired. Undefined: nothing to test it with. */
export interface ConditionResult {
	readonly load?: boolean;
	readonly visible?: boolean;
	readonly viewport?: boolean;
	readonly hover?: boolean;
	/** Runs taken under the condition: one when every trigger that fired without it fired again, else three, the majority deciding. */
	readonly runs?: number;
	/** Triggers the runs did not agree on. */
	readonly disagreed?: readonly string[];
	readonly error?: string;
}

export interface PrefetchFacts {
	readonly route: string;
	readonly browser: string;
	/** How this app spells a page's data for in-place navigation, `{path}` standing for the target; empty when no request named a link target. */
	readonly shapes: readonly string[];
	/** Navigation loads a new document (no in-place router). */
	readonly fullLoads: boolean;
	readonly links: number;
	readonly triggers: Readonly<Partial<Record<Trigger, TriggerEvidence>>>;
	/** The most navigational requests in flight at once before any click. */
	readonly concurrency: number;
	/** Every same-origin byte fetched after the load went quiet and before the first click. */
	readonly bytesBeforeClick: number;
	/** A click on a target fetched ahead: whether its data was asked for again, and from where. */
	readonly prefetchedClick?: { readonly target: string; readonly refetched: boolean; readonly fromCache: boolean };
	/** The page left and come back to by a link: whether its data was asked for again. */
	readonly revisit?: { readonly target: string; readonly by: 'link' | 'back'; readonly refetched: boolean; readonly fromCache: boolean; readonly afterMs: number };
	/** Prefetch hints the page itself declares: `<link rel=prefetch|prerender|modulepreload>` and Speculation Rules. */
	readonly hints: { readonly links: readonly { readonly rel: string; readonly href: string }[]; readonly speculationRules: readonly unknown[] };
	readonly conditions?: Readonly<Partial<Record<Condition, ConditionResult>>>;
	/** The page declares prefetch hints (above) but no trigger was seen fetching ahead: the browser's own prefetch may not show as a request, so nothing ahead is not established. */
	readonly unobserved?: string;
	/** A press probe that should never activate anything did (the page navigated): the intent probes stopped there. */
	readonly pressActivated?: string;
	readonly requests: readonly PrefetchRequest[];
	readonly error?: string;
}

/** A target's path as links are compared: no trailing slash (but `/`). */
export function targetOf(path: string): string {
	const [pathname = '/', query] = path.split('?', 2) as [string, string | undefined];
	const trimmed = pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
	return query === undefined ? trimmed : `${trimmed}?${query}`;
}

/** Query values stand for any value: `?_rsc=1x9z` and `?_rsc=q2` are one shape. */
function openQuery(path: string): string {
	const at = path.indexOf('?');
	if (at < 0) return path;
	const params = new URLSearchParams(path.slice(at + 1));
	return `${path.slice(0, at)}?${[...params.keys()].sort().map((k) => `${k}=*`).join('&')}`;
}

const ASSET_TYPES = new Set(['script', 'stylesheet', 'image', 'font', 'media', 'manifest', 'texttrack', 'websocket', 'eventsource']);
/** Requests that can carry a page: documents, fetches and the browser's own prefetches. */
export function mayCarryPage(r: Pick<PrefetchRequest, 'type'>): boolean {
	return !ASSET_TYPES.has(r.type);
}

/** Where `target` sits in `path` on segment edges, or -1. */
function placeOf(path: string, target: string): number {
	const pathname = path.split('?', 1)[0]!;
	for (let at = pathname.indexOf(target); at >= 0; at = pathname.indexOf(target, at + 1)) {
		const before = at === 0 || target.startsWith('/') || pathname[at - 1] === '/';
		const next = pathname[at + target.length];
		if (before && (next === undefined || next === '/' || next === '.')) return at;
	}
	return -1;
}

/** The shape a request gives a target, or undefined when the request does not name it. */
export function shapeOf(path: string, target: string): string | undefined {
	const bare = target.split('?', 1)[0]!;
	const query = path.includes('?') ? path.slice(path.indexOf('?')) : '';
	if (bare === '/') return path.split('?', 1)[0] === '/' ? openQuery(`{path}${query}`) : undefined;
	const at = placeOf(path, bare);
	if (at < 0) return undefined;
	return openQuery(`${path.slice(0, at)}{path}${path.slice(at + bare.length)}`);
}

/**
 * The shapes this app fetches pages in: a shape counts when requests for two different link targets share it, or when a
 * click fetched it for the page it went to.
 */
export function learnShapes(requests: readonly PrefetchRequest[], targets: readonly string[], clicked: readonly { readonly phase: string; readonly target: string }[] = [], own?: string): string[] {
	const seen = new Map<string, Set<string>>();
	const confirmed = new Set<string>();
	const others = targets.filter((t) => t !== own);
	for (const r of requests) {
		const best = bestTarget(r, others);
		if (!best) continue;
		(seen.get(best.shape) ?? seen.set(best.shape, new Set()).get(best.shape)!).add(best.target);
	}
	// A click to a page nothing fetched ahead: its own fetch is the first of its phase, what the new page fetches after it names its children.
	for (const c of clicked) {
		const first = requests.filter((r) => r.phase === c.phase && mayCarryPage(r)).sort((a, b) => a.start - b.start)[0];
		const best = first && bestTarget(first, others);
		if (best?.target === c.target) confirmed.add(best.shape);
	}
	return [...seen].filter(([shape, by]) => by.size >= 2 || confirmed.has(shape)).map(([shape]) => shape).sort();
}

/** The target that names the most of the request's path (`/docs/a/b` is `/docs/a/b`'s page, not `/docs`'s), with its shape. */
function bestTarget(r: PrefetchRequest, targets: readonly string[], shapes?: readonly string[]): { readonly target: string; readonly shape: string } | undefined {
	if (!mayCarryPage(r)) return undefined;
	let best: { target: string; shape: string } | undefined;
	for (const target of targets) {
		const shape = shapeOf(r.path, target);
		if (!shape || (shapes && !shapes.includes(shape))) continue;
		if (!best || target.length > best.target.length) best = { target, shape };
	}
	return best;
}

/** The link target a request fetches the page of, under the learned shapes. */
export function pageOf(r: PrefetchRequest, shapes: readonly string[], targets: readonly string[]): string | undefined {
	return bestTarget(r, targets, shapes)?.target;
}

/** Most requests in flight at once. */
export function maxInFlight(requests: readonly PrefetchRequest[]): number {
	const edges = requests.flatMap((r) => [[r.start, 1] as const, [r.end ?? Infinity, -1] as const]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
	let now = 0;
	let most = 0;
	for (const [, step] of edges) most = Math.max(most, (now += step));
	return most;
}

export function median(values: readonly number[]): number | undefined {
	if (!values.length) return undefined;
	const sorted = [...values].sort((a, b) => a - b);
	const mid = sorted.length >> 1;
	return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1]! + sorted[mid]!) / 2;
}
