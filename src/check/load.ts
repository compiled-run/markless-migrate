import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Worker } from 'node:worker_threads';
import { throttling } from 'lighthouse/core/config/constants.js';
import { chromium } from 'playwright';
import { mannWhitneyGreater, median, noiseBand, SIGNIFICANCE, spread } from './stats.ts';
import { LOAD_METRICS, type LoadMetric, type Metrics } from './load-verdicts.ts';
import { TRACKER_HOSTS, type BlockList } from './trackers.ts';
import type { WasteCheckOptions, WasteReport } from './waste.ts';
import type { PsiOptions, PsiResult } from './psi.ts';
import type { RouteNetwork, SlowNetworkOptions } from './slow-network.ts';

export interface LoadOptions {
	/** Lighthouse runs per side and route, old and new taken in turn; default 5, and as many again when a metric is worse but not yet beyond noise. */
	readonly runs?: number;
	/** The CPU slowdown Lighthouse applies, with slow 4G, for real: 4 by default, as Lighthouse and PageSpeed Insights use; `calibrated` simulates instead, at the slowdown each run's own benchmarkIndex calls for by Lighthouse's calculator. Against real PageSpeed Insights on ten sites, 4 came closer (TBT within 10% on 18 of 20 pages against 12) and neither matched its score within 5 points on more than 12 of 20, so real PSI is the gate whenever it answers. */
	readonly cpu?: 'calibrated' | number;
	/** `simulated` predicts the throttled load from an unthrottled one, as PageSpeed Insights does; the default applies slow 4G and the CPU slowdown for real. */
	readonly throttle?: 'applied' | 'simulated';
	/** Hosts blocked on both sides, as in the rest of the check. */
	readonly block?: BlockList;
	/** Real PageSpeed Insights on the deployed URLs; false leaves it out. The key defaults to the PSI_API_KEY environment variable; without one it runs on the shared keyless quota, best effort. */
	readonly psi?: PsiOptions | false;
	/** A bypass token for the apps alone (--header, --cookie): sent with requests to these origins only, never to another host the pages load. */
	readonly bypass?: AppBypass;
	/** Cold loads over named slow networks in each browser, old and new in turn, with the first click timed (--network); left out unless given. */
	readonly network?: SlowNetworkOptions;
	/** What the new page's first click did not need, by owner (waste.ts); left out unless given. */
	readonly waste?: WasteCheckOptions;
}

export interface AppBypass {
	readonly origins: readonly string[];
	readonly headers?: Readonly<Record<string, string>>;
	readonly cookies?: readonly { readonly name: string; readonly value: string }[];
}

type Cdp = { send(method: string, params?: object, sessionId?: string): Promise<any>; on(listener: (message: { method: string; params: any; sessionId?: string }) => void): void; close(): void };

async function browserCdp(port: number): Promise<Cdp> {
	const { webSocketDebuggerUrl } = (await (await fetch(`http://127.0.0.1:${port}/json/version`)).json()) as { webSocketDebuggerUrl: string };
	const socket = new WebSocket(webSocketDebuggerUrl);
	await new Promise((resolve, reject) => {
		socket.addEventListener('open', resolve, { once: true });
		socket.addEventListener('error', reject, { once: true });
	});
	let next = 0;
	const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
	const listeners: ((message: any) => void)[] = [];
	socket.addEventListener('message', (event) => {
		const message = JSON.parse(String(event.data));
		if (message.id !== undefined) {
			const waiter = pending.get(message.id);
			pending.delete(message.id);
			if (message.error) waiter?.reject(new Error(message.error.message));
			else waiter?.resolve(message.result);
		} else for (const listener of listeners) listener(message);
	});
	return {
		send: (method, params = {}, sessionId) =>
			new Promise((resolve, reject) => {
				const id = ++next;
				pending.set(id, { resolve, reject });
				socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
			}),
		on: (listener) => void listeners.push(listener),
		close: () => socket.close(),
	};
}

/**
 * Hands the apps' bypass token to the load browser for their origins alone. Cookies are set for each origin (Lighthouse
 * keeps cookies between runs); headers are added by pausing only the requests to those origins in every page, which
 * is held until its interception is on, since Lighthouse's own extraHeaders would send them to every host.
 */
export async function bypassForOrigins(port: number, bypass: AppBypass): Promise<() => void> {
	const cdp = await browserCdp(port);
	if (bypass.cookies?.length) await cdp.send('Storage.setCookies', { cookies: bypass.origins.flatMap((url) => bypass.cookies!.map((c) => ({ name: c.name, value: c.value, url }))) });
	const extra = Object.entries(bypass.headers ?? {});
	if (extra.length) {
		const patterns = bypass.origins.map((origin) => ({ urlPattern: `${new URL(origin).origin}/*`, requestStage: 'Request' }));
		cdp.on(({ method, params, sessionId }) => {
			if (method === 'Target.attachedToTarget') {
				const child = params.sessionId as string;
				void (async () => {
					if (params.targetInfo.type === 'page' || params.targetInfo.type === 'iframe') await cdp.send('Fetch.enable', { patterns }, child).catch(() => {});
					await cdp.send('Runtime.runIfWaitingForDebugger', {}, child).catch(() => {});
				})();
			} else if (method === 'Fetch.requestPaused') {
				const own = Object.entries(params.request.headers as Record<string, string>).filter(([name]) => !extra.some(([e]) => e.toLowerCase() === name.toLowerCase()));
				void cdp.send('Fetch.continueRequest', { requestId: params.requestId, headers: [...own, ...extra].map(([name, value]) => ({ name, value })) }, sessionId).catch(() => {});
			}
		});
		await cdp.send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: true, flatten: true });
	}
	return () => cdp.close();
}

export const DEFAULT_LOAD_RUNS = 5;
/** A run that errors (on a busy machine headless Chromium can skip painting, NO_FCP) is taken again, at most this many times; a page with no largest paint (NO_LCP) has none however often it loads. */
const RETRIES = 2;

/** How much worse the new median may be before it matters, whatever the noise: a score point is a rounding, 5% of a paint time is below what a person notices. */
export function floor(metric: LoadMetric, old: number): number {
	if (metric === 'score') return 3;
	if (metric === 'tbt') return 50;
	if (metric === 'cls') return 0.02;
	return Math.max(100, old * 0.05);
}

export interface LoadRequest {
	readonly url: string;
	readonly type: string;
	readonly priority: string;
	readonly bytes: number;
	/** When the page asked for it, in the unthrottled load Lighthouse simulates from (ms after navigation start). */
	readonly start: number;
}

/** What one Lighthouse run saw, for the run whose LCP is the side's median. */
export interface LoadDetail {
	readonly lcpElement?: string;
	/** Lighthouse's LCP breakdown (TTFB, Load Delay, Load Time, Render Delay), in simulated ms. */
	readonly lcpPhases?: Readonly<Record<string, number>>;
	/** The paint times of the unthrottled load the simulation starts from. */
	readonly observed: { readonly fcp?: number; readonly lcp?: number; readonly si?: number };
	readonly htmlBytes?: number;
	/** Requests that began before the observed LCP, which Lighthouse's simulated LCP waits for (a low-priority image excepted). */
	readonly beforeLcp: { readonly count: number; readonly bytes: number; readonly largest: readonly LoadRequest[] };
	/** Requests at a render-blocking priority (VeryHigh, or a High-priority script) that finished before the observed first paint: what Lighthouse's simulated FCP waits for. */
	readonly beforeFcp?: { readonly count: number; readonly bytes: number; readonly largest: readonly LoadRequest[] };
	readonly renderBlocking: readonly string[];
	readonly mainThreadMs?: number;
	readonly scripts: readonly { readonly url: string; readonly ms: number }[];
	/** Lighthouse's screenshot thumbnails of the load, kept when the route is red. */
	filmstrip?: readonly { readonly ms: number; readonly image: string }[];
}

export interface LoadRun {
	readonly browser?: string;
	/** This machine's speed as Lighthouse measured it during the run, and the CPU slowdown the run was simulated with. */
	readonly benchmarkIndex?: number;
	readonly cpuMultiplier?: number;
	readonly metrics?: Metrics;
	readonly error?: string;
	/** A load with nothing that qualifies as its largest paint (NO_LCP): its other times, which have no score without an LCP. */
	readonly noLcp?: Omit<Metrics, 'score' | 'lcp'>;
	/** A load whose network never went quiet within Lighthouse's wait (NO_TTI_NETWORK_IDLE_PERIOD): its other times; TBT has no end to count to. */
	readonly noTbt?: Omit<Metrics, 'score' | 'tbt'>;
	readonly detail?: LoadDetail;
}

export interface LoadSide {
	readonly runs: readonly (Metrics | { readonly error: string })[];
	readonly median?: Metrics;
	readonly detail?: LoadDetail;
}

export interface LoadVerdict {
	readonly metric: LoadMetric;
	readonly old: number;
	readonly new: number;
	/** How much worse new is (positive is worse; for the score, points lost). */
	readonly worse: number;
	readonly floor: number;
	/** One-sided exact Mann-Whitney p that new's runs are worse than old's by chance. */
	readonly p: number;
	/** Median absolute deviation of each side's runs. */
	readonly spread: { readonly old: number; readonly new: number };
	/** The p this metric had to be under: Holm's share of `SIGNIFICANCE` for its rank among the route's metrics. */
	readonly alpha?: number;
	/** A side whose runs fall in separate clusters, each of two runs or more: no difference smaller than their distance can be told. */
	readonly bimodal?: { readonly side: 'old' | 'new'; readonly clusters: readonly (readonly number[])[] };
	readonly ok: boolean;
}

export interface RouteLoad {
	readonly runs: number;
	/** The median benchmarkIndex and CPU slowdown of the runs. */
	readonly benchmarkIndex?: number;
	readonly cpuMultiplier?: number;
	/** The browser Lighthouse ran in, as its user agent names it. */
	readonly browser?: string;
	readonly old: LoadSide;
	readonly new: LoadSide;
	readonly verdicts: readonly LoadVerdict[];
	readonly ok: boolean;
	/** A side whose page has nothing that qualifies as a largest paint (NO_LCP) on some run: LCP and the score that needs it are not compared. */
	readonly noLcp?: { readonly old: boolean; readonly new: boolean };
	/** A side whose network never went quiet within Lighthouse's wait on some run: TBT is not compared, and the side counts as the slower there. */
	readonly noTbt?: { readonly old: boolean; readonly new: boolean };
	/** A side whose first run hung on all of its attempts (PAGE_HUNG), with Lighthouse's reason: its other runs were not taken. */
	readonly hung?: { readonly old?: string; readonly new?: string };
	/** Why the route has no verdict: a side never finished a run. */
	readonly skipped?: string;
	/** PageSpeed Insights on the deployments: when it answered, its verdicts gate the route instead of the lab's. */
	readonly psi?: PsiResult;
	/** How long the route's Lighthouse runs took. */
	readonly ms?: number;
	/** Cold loads over slow networks, old and new: shown beside the rest, not a verdict. */
	readonly network?: RouteNetwork | { readonly unavailable: string };
	/** The new page's first-click waste: shown beside the rest, a warning when over budget, never red. */
	readonly waste?: WasteReport | { readonly unavailable: string };
}

/** Paint times are read from frames at 60 Hz: a smaller difference cannot be seen. */
const PAINT_STEP_MS = 17;
/** Times the owner gates on any slowdown the runs can show: no allowance beyond the old page's own noise and the instrument's step. */
const PAINTS: ReadonlySet<LoadMetric> = new Set(['fcp', 'si']);

/**
 * Runs that fall in two or more groups of two or more, the groups further apart than 5% of the median (or four frames): a page
 * whose paint comes at one of several moments by chance. Such a side is no baseline for a smaller difference.
 */
export function clusters(values: readonly number[]): number[][] | undefined {
	const sorted = [...values].sort((a, b) => a - b);
	const apart = Math.max(4 * PAINT_STEP_MS, 0.05 * median(sorted));
	const groups: number[][] = [];
	for (const v of sorted) {
		const last = groups.at(-1);
		if (last && v - last.at(-1)! <= apart) last.push(v);
		else groups.push([v]);
	}
	return groups.filter((g) => g.length >= 2).length >= 2 ? groups : undefined;
}

/**
 * Each metric's verdict: red when the new median is worse than the old by more than its allowance and the runs say that is not
 * noise. Significance is shared by the route's metrics (Holm's step-down), so identical pages go red at most `SIGNIFICANCE` of
 * the time however many metrics are compared. A paint time on a side whose runs fall in clusters is red as inconclusive.
 */
export function judgeLoad(old: readonly Metrics[], next: readonly Metrics[], metrics: readonly LoadMetric[] = LOAD_METRICS): LoadVerdict[] {
	const verdicts = metrics.map((metric) => {
		const o = old.map((m) => m[metric]);
		const n = next.map((m) => m[metric]);
		const higherIsBetter = metric === 'score';
		const om = median(o);
		const nm = median(n);
		const worse = higherIsBetter ? om - nm : nm - om;
		const p = higherIsBetter ? mannWhitneyGreater(n, o) : mannWhitneyGreater(o, n);
		const paint = PAINTS.has(metric);
		const f = paint ? Math.max(noiseBand(o) ?? 0, PAINT_STEP_MS) : floor(metric, om);
		const found = paint ? (clusters(o) ? { side: 'old' as const, clusters: clusters(o)! } : clusters(n) ? { side: 'new' as const, clusters: clusters(n)! } : undefined) : undefined;
		// A difference wider than the clustered side's whole spread is told whichever cluster each run landed in.
		const split = found && Math.abs(worse) <= found.clusters.at(-1)!.at(-1)! - found.clusters[0]![0]! ? found : undefined;
		return { metric, old: om, new: nm, worse, floor: f, p, spread: { old: spread(o), new: spread(n) }, ...(split ? { bimodal: split } : {}), ok: true };
	});
	let rejecting = true;
	const ranked = [...verdicts].sort((a, b) => a.p - b.p);
	const judged = new Map<LoadMetric, LoadVerdict>();
	for (const [rank, v] of ranked.entries()) {
		const alpha = SIGNIFICANCE / (ranked.length - rank);
		rejecting &&= v.p < alpha;
		judged.set(v.metric, { ...v, alpha, ok: !v.bimodal && !(v.worse > v.floor && rejecting) });
	}
	return verdicts.map((v) => judged.get(v.metric)!);
}

// Lighthouse result shapes this module reads; the package's own types cover the whole report.
interface Audit {
	readonly numericValue?: number;
	readonly errorMessage?: string;
	readonly details?: { readonly items?: readonly any[] };
}
interface Lhr {
	readonly environment?: { readonly hostUserAgent?: string; readonly benchmarkIndex?: number };
	readonly configSettings?: { readonly throttling?: { readonly cpuSlowdownMultiplier?: number } };
	readonly runtimeError?: { readonly code: string; readonly message: string };
	readonly categories: { readonly performance?: { readonly score: number | null } };
	readonly audits: Readonly<Record<string, Audit | undefined>>;
}

/**
 * The audits readRun reads, and two whose gatherers instrument the load itself (JsUsage's coverage, ConsoleMessages), so the
 * trace every judged time comes from is recorded as with the whole performance category; what this leaves out runs after the load.
 */
export const LIGHTHOUSE_AUDITS = ['first-contentful-paint', 'largest-contentful-paint', 'speed-index', 'total-blocking-time', 'cumulative-layout-shift', 'metrics', 'largest-contentful-paint-element', 'lcp-breakdown-insight', 'network-requests', 'render-blocking-insight', 'render-blocking-resources', 'mainthread-work-breakdown', 'bootup-time', 'screenshot-thumbnails', 'script-treemap-data', 'no-document-write'] as const;

const shortUrl = (url: string, origin: string) => (url.startsWith(origin) ? url.slice(origin.length) || '/' : url).slice(0, 120);

export function readRun(lhr: Lhr, origin: string): LoadRun {
	if (lhr.runtimeError) return { error: `${lhr.runtimeError.code}: ${lhr.runtimeError.message}` };
	const a = lhr.audits;
	const value = (id: string) => a[id]?.numericValue;
	const values = { fcp: value('first-contentful-paint'), lcp: value('largest-contentful-paint'), si: value('speed-index'), tbt: value('total-blocking-time'), cls: value('cumulative-layout-shift') };
	const score = lhr.categories.performance?.score;
	// A page with nothing that qualifies as its largest paint has none on every load: its other times still compare.
	if (/\(NO_LCP\)/.test(a['largest-contentful-paint']?.errorMessage ?? '')) {
		const { lcp: _, ...rest } = values;
		const error = `NO_LCP: ${a['largest-contentful-paint']!.errorMessage!.replace(/ \(NO_LCP\)$/, '')}`;
		return Object.values(rest).some((v) => v === undefined) ? { error } : { error, noLcp: rest as Omit<Metrics, 'score' | 'lcp'> };
	}
	// A page whose network never went quiet within Lighthouse's wait has no end to its load: TBT is left without one.
	if (/\(NO_TTI_NETWORK_IDLE_PERIOD\)/.test(a['total-blocking-time']?.errorMessage ?? '')) {
		const { tbt: _, ...rest } = values;
		const error = `NO_TTI_NETWORK_IDLE_PERIOD: ${a['total-blocking-time']!.errorMessage!.replace(/ \(NO_TTI_NETWORK_IDLE_PERIOD\)$/, '')}`;
		return Object.values(rest).some((v) => v === undefined) ? { error } : { error, noTbt: rest as Omit<Metrics, 'score' | 'tbt'> };
	}
	if (score == null || Object.values(values).some((v) => v === undefined)) return { error: 'Lighthouse returned no performance metrics' };
	const metrics = { score: Math.round(score * 100), ...(values as Record<Exclude<LoadMetric, 'score'>, number>) };
	const observedRaw = a.metrics?.details?.items?.[0] ?? {};
	const observed = { fcp: observedRaw.observedFirstContentfulPaint, lcp: observedRaw.observedLargestContentfulPaint, si: observedRaw.observedSpeedIndex };
	const lcpItems = a['largest-contentful-paint-element']?.details?.items ?? [];
	// Lighthouse 13, as PageSpeed Insights runs it, reports the element and its parts in the LCP breakdown insight instead.
	const insight = a['lcp-breakdown-insight']?.details?.items ?? [];
	const node = lcpItems[0]?.items?.[0]?.node ?? insight.find((i: { type?: string }) => i.type === 'node');
	const subparts = insight.find((i: { type?: string }) => i.type === 'table')?.items as readonly { label: string; duration: number }[] | undefined;
	const phases = (lcpItems[1]?.items as readonly { phase: string; timing: number }[] | undefined) ?? subparts?.map((p) => ({ phase: p.label, timing: p.duration }));
	const requests = (a['network-requests']?.details?.items ?? []) as readonly { url: string; resourceType?: string; priority?: string; transferSize?: number; rendererStartTime?: number; networkRequestTime?: number; networkEndTime?: number }[];
	const asRequest = (r: (typeof requests)[number]): LoadRequest => ({ url: shortUrl(r.url, origin), type: r.resourceType ?? '', priority: r.priority ?? '', bytes: r.transferSize ?? 0, start: Math.round(r.networkRequestTime ?? r.rendererStartTime ?? 0) });
	const cutoff = observed.lcp ?? Infinity;
	const counted = requests.filter((r) => (r.networkRequestTime ?? r.rendererStartTime ?? 0) < cutoff && !(r.resourceType === 'Image' && /^(Low|VeryLow)$/.test(r.priority ?? '')) && !r.url.startsWith('data:'));
	const paintBlocking = requests.filter((r) => (r.networkEndTime ?? Infinity) <= (observed.fcp ?? -Infinity) && (r.priority === 'VeryHigh' || (r.priority === 'High' && r.resourceType === 'Script')));
	const summary = (list: typeof requests) => ({ count: list.length, bytes: list.reduce((n, r) => n + (r.transferSize ?? 0), 0), largest: [...list].sort((x, y) => (y.transferSize ?? 0) - (x.transferSize ?? 0)).slice(0, 8).map(asRequest) });
	const blocking = [...(a['render-blocking-insight']?.details?.items ?? []), ...(a['render-blocking-resources']?.details?.items ?? [])].map((i: { url?: string }) => i.url).filter((u): u is string => Boolean(u));
	const detail: LoadDetail = {
		...(node ? { lcpElement: `${node.selector ?? ''}${node.nodeLabel ? ` "${String(node.nodeLabel).slice(0, 60)}"` : ''}`.trim() } : {}),
		...(phases?.length ? { lcpPhases: Object.fromEntries(phases.map((p) => [p.phase, Math.round(p.timing)])) } : {}),
		observed,
		...(requests[0]?.resourceType === 'Document' ? { htmlBytes: requests[0].transferSize ?? 0 } : {}),
		beforeLcp: summary(counted),
		...(observed.fcp !== undefined ? { beforeFcp: summary(paintBlocking) } : {}),
		renderBlocking: [...new Set(blocking.map((u) => shortUrl(u, origin)))],
		...(value('mainthread-work-breakdown') !== undefined ? { mainThreadMs: Math.round(value('mainthread-work-breakdown')!) } : {}),
		scripts: ((a['bootup-time']?.details?.items ?? []) as readonly { url: string; scripting?: number }[]).slice(0, 4).map((s) => ({ url: shortUrl(s.url, origin), ms: Math.round(s.scripting ?? 0) })),
		filmstrip: ((a['screenshot-thumbnails']?.details?.items ?? []) as readonly { timing: number; data: string }[]).map((f) => ({ ms: Math.round(f.timing), image: f.data })),
	};
	const browser = /(?:Headless)?Chrome\/[\d.]+/.exec(lhr.environment?.hostUserAgent ?? '')?.[0];
	const benchmarkIndex = lhr.environment?.benchmarkIndex;
	const cpuMultiplier = lhr.configSettings?.throttling?.cpuSlowdownMultiplier;
	return { metrics, detail, ...(browser ? { browser } : {}), ...(benchmarkIndex ? { benchmarkIndex: Math.round(benchmarkIndex) } : {}), ...(cpuMultiplier ? { cpuMultiplier: Math.round(cpuMultiplier * 10) / 10 } : {}) };
}

const CHROME_STABLE: Readonly<Partial<Record<NodeJS.Platform, readonly string[]>>> = {
	darwin: ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'],
	linux: ['/usr/bin/google-chrome-stable', '/usr/bin/google-chrome', '/opt/google/chrome/chrome'],
	win32: [`${process.env.PROGRAMFILES ?? 'C:\\Program Files'}\\Google\\Chrome\\Application\\chrome.exe`],
};

/** PageSpeed Insights runs Chrome stable, which paints later than Playwright's Chromium build on the same machine; MARKLESS_MIGRATE_CHROME names another browser. */
export function loadBrowserPath(): string {
	const named = process.env.MARKLESS_MIGRATE_CHROME;
	if (named) return named;
	return (CHROME_STABLE[process.platform] ?? []).find((path) => existsSync(path)) ?? chromium.executablePath();
}

/** A browser for Lighthouse alone: it drives the browser over its debugging port, which the check's Playwright browser does not open. */
export async function startChromium(): Promise<{ port: number; close: () => Promise<void> }> {
	const dir = await mkdtemp(join(tmpdir(), 'markless-migrate-load-'));
	const proc = spawn(loadBrowserPath(), ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${dir}`, '--no-first-run', '--no-default-browser-check', 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
	const exited = new Promise<void>((done) => proc.once('exit', () => done()));
	const port = await new Promise<number>((resolve, reject) => {
		let output = '';
		proc.stderr!.on('data', (chunk: Buffer) => {
			output += chunk;
			const found = /DevTools listening on ws:\/\/[^:]+:(\d+)\//.exec(output);
			if (found) resolve(Number(found[1]));
		});
		proc.once('exit', () => reject(new Error(`Chromium for page load exited: ${output.slice(-500)}`)));
	});
	return {
		port,
		close: async () => {
			proc.kill();
			await exited;
			// Chromium's helper processes can still write to the profile just after the browser exits.
			await rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }).catch(() => {});
		},
	};
}

/** Lighthouse's URL patterns cannot unblock one host under a blocked domain, so a domain with an allowed host anywhere under or above it loads on both sides. */
export function blockedPatterns(block: BlockList = {}): string[] {
	const allow = (block.allow ?? []).map((h) => h.toLowerCase());
	const related = (a: string, b: string) => a === b || a.endsWith(`.${b}`) || b.endsWith(`.${a}`);
	return [...TRACKER_HOSTS, ...(block.add ?? [])].map((h) => h.toLowerCase()).filter((h) => !allow.some((a) => related(a, h))).flatMap((h) => [`*://${h}/*`, `*.${h}/*`]);
}

export type Lighthouse = (url: string, port: number, blocked: readonly string[], cpu: 'calibrated' | number, throttle?: 'applied' | 'simulated') => Promise<Lhr>;

/**
 * The CPU slowdown that makes a machine of this benchmarkIndex stand for Lighthouse's reference device, the one PageSpeed
 * Insights' 4x emulates: Lighthouse's own calculator (lighthouse-cpu-throttling-calculator.vercel.app, linked from its
 * throttling docs). A fast laptop measures about 4400 and needs about 16x; PageSpeed's servers measure about 1500.
 */
export function cpuMultiplier(benchmarkIndex: number): number {
	if (benchmarkIndex >= 1300) return 3 + (benchmarkIndex - 1300) / 233;
	if (benchmarkIndex >= 800) return 2 + (benchmarkIndex - 800) / 500;
	if (benchmarkIndex >= 150) return 1 + (benchmarkIndex - 150) / 650;
	return 1;
}

/** What one Lighthouse run is given, in its worker. */
export interface LighthouseJob {
	readonly url: string;
	readonly port: number;
	readonly blocked: readonly string[];
	readonly cpu: 'calibrated' | number;
	readonly throttle: 'applied' | 'simulated';
}

// Each run in a worker of its own, which takes the trace engine's module state with it when it exits.
const runLighthouse: Lighthouse = (url, port, blocked, cpu, throttle = 'applied') =>
	new Promise<Lhr>((resolve, reject) => {
		const job: LighthouseJob = { url, port, blocked: [...blocked], cpu, throttle };
		const worker = new Worker(new URL('./lighthouse-worker.ts', import.meta.url), { workerData: job });
		let answered = false;
		worker.once('message', (out: { lhr: Lhr } | { error: string }) => {
			answered = true;
			void worker.terminate();
			if ('error' in out) reject(new Error(out.error));
			else resolve(out.lhr);
		});
		worker.once('error', reject);
		worker.once('exit', (code) => {
			if (!answered) reject(new Error(`the Lighthouse worker exited (${code}) before it answered`));
		});
	});

const lcpOf = (run: LoadRun) => run.metrics?.lcp ?? Infinity;

function side(runs: readonly LoadRun[]): LoadSide {
	const good = runs.filter((r) => r.metrics);
	const middle = good.length ? (Object.fromEntries(LOAD_METRICS.map((m) => [m, median(good.map((r) => r.metrics![m]))])) as Metrics) : undefined;
	const typical = [...good].sort((a, b) => lcpOf(a) - lcpOf(b))[good.length >> 1];
	return { runs: runs.map((r) => r.metrics ?? { error: r.error ?? 'failed' }), ...(middle ? { median: middle } : {}), ...(typical?.detail ? { detail: typical.detail } : {}) };
}

/** Measures each route's load on both apps with Lighthouse's mobile settings, one run at a time, old and new in turn so drift in the machine's load falls on both. */
export async function measureLoad(origins: { readonly old: string; readonly new: string }, routes: readonly string[], options: LoadOptions = {}, run: Lighthouse = runLighthouse): Promise<Map<string, RouteLoad>> {
	const runs = Math.max(1, options.runs ?? DEFAULT_LOAD_RUNS);
	const cpu = options.cpu ?? throttling.mobileSlow4G.cpuSlowdownMultiplier;
	const blocked = blockedPatterns(options.block);
	const out = new Map<string, RouteLoad>();
	if (!routes.length) return out;
	const browser = await startChromium();
	const unbypass = options.bypass ? await bypassForOrigins(browser.port, options.bypass) : undefined;
	try {
		const once = async (which: 'old' | 'new', route: string, idleOnce = false): Promise<LoadRun & { hungEvery?: true; idleEvery?: true }> => {
			const origin = origins[which];
			const url = new URL(route, origin).href;
			let result: LoadRun = { error: 'not run' };
			let hangs = 0;
			let idle = 0;
			for (let attempt = 0; attempt <= RETRIES && !result.metrics && !result.error?.startsWith('NO_LCP') && !(idleOnce && result.error?.startsWith('NO_TTI_NETWORK_IDLE_PERIOD')); attempt++) {
				result = await run(url, browser.port, blocked, cpu, options.throttle).then((lhr) => readRun(lhr, origin), (error: unknown) => ({ error: error instanceof Error ? error.message.split('\n')[0]! : String(error) }));
				if (result.error?.startsWith('PAGE_HUNG')) hangs++;
				if (result.error?.startsWith('NO_TTI_NETWORK_IDLE_PERIOD')) idle++;
			}
			return hangs > RETRIES ? { ...result, hungEvery: true } : idle > RETRIES ? { ...result, idleEvery: true } : result;
		};
		for (const route of routes) {
			const started = Date.now();
			const taken: { old: LoadRun[]; new: LoadRun[] } = { old: [], new: [] };
			// A side whose first run hung on every attempt hangs on every load: its other runs are not taken.
			const hung: { old?: string; new?: string } = {};
			// A side whose first run never went quiet on every attempt does the same on every load: its later runs are taken once each.
			const neverIdle = { old: false, new: false };
			const take = async (from: number) => {
				for (let i = from; i < from + runs; i++)
					for (const which of i % 2 ? (['new', 'old'] as const) : (['old', 'new'] as const)) {
						if (hung[which]) continue;
						const { hungEvery, idleEvery, ...got } = await once(which, route, neverIdle[which]);
						taken[which].push(got);
						if (i === 0 && hungEvery) hung[which] = got.error!;
						if (i === 0 && idleEvery) neverIdle[which] = true;
					}
			};
			await take(0);
			if (undecided(taken.old, taken.new)) await take(runs);
			out.set(route, { ...routeLoad(Math.max(taken.old.length, taken.new.length), taken.old, taken.new, hung), ms: Date.now() - started });
		}
	} finally {
		unbypass?.();
		await browser.close();
	}
	return out;
}

/**
 * The metrics both sides' runs can be judged on: all of them, or, where a side's page has no largest paint (NO_LCP) or its
 * network never went quiet (NO_TTI_NETWORK_IDLE_PERIOD, no TBT), the times both sides have, without the score that needs them all.
 */
export function judged(oldRuns: readonly LoadRun[], newRuns: readonly LoadRun[]): { old: Metrics[]; new: Metrics[]; metrics: readonly LoadMetric[]; noLcp?: { readonly old: boolean; readonly new: boolean }; noTbt?: { readonly old: boolean; readonly new: boolean } } {
	const full = (runs: readonly LoadRun[]) => runs.flatMap((r) => (r.metrics ? [r.metrics] : []));
	const lacks = (runs: readonly LoadRun[], kind: 'noLcp' | 'noTbt') => runs.some((r) => r[kind]);
	const noLcp = { old: lacks(oldRuns, 'noLcp'), new: lacks(newRuns, 'noLcp') };
	const noTbt = { old: lacks(oldRuns, 'noTbt'), new: lacks(newRuns, 'noTbt') };
	const anyLcp = noLcp.old || noLcp.new;
	const anyTbt = noTbt.old || noTbt.new;
	if (!anyLcp && !anyTbt) return { old: full(oldRuns), new: full(newRuns), metrics: LOAD_METRICS };
	const partial = (runs: readonly LoadRun[]) => runs.flatMap((r) => (r.metrics ?? r.noLcp ?? r.noTbt ? [{ score: NaN, lcp: NaN, tbt: NaN, ...(r.metrics ?? r.noLcp ?? r.noTbt)! } as Metrics] : []));
	const metrics = LOAD_METRICS.filter((m) => m !== 'score' && !(m === 'lcp' && anyLcp) && !(m === 'tbt' && anyTbt));
	return { old: partial(oldRuns), new: partial(newRuns), metrics, ...(anyLcp ? { noLcp } : {}), ...(anyTbt ? { noTbt } : {}) };
}

/** A metric worse than its floor whose runs do not yet tell it from noise: worth as many runs again before judging. */
export function undecided(oldRuns: readonly LoadRun[], newRuns: readonly LoadRun[]): boolean {
	const { old: o, new: n, metrics } = judged(oldRuns, newRuns);
	return o.length > 0 && n.length > 0 && judgeLoad(o, n, metrics).some((v) => !v.bimodal && v.worse > v.floor && v.p >= (v.alpha ?? SIGNIFICANCE));
}

/** A route whose load was not measured, with why; never red. */
export function unmeasured(reason: string): RouteLoad {
	return { runs: 0, old: { runs: [] }, new: { runs: [] }, verdicts: [], ok: true, skipped: reason };
}

export function routeLoad(runs: number, oldRuns: readonly LoadRun[], newRuns: readonly LoadRun[], hung: { readonly old?: string; readonly new?: string } = {}): RouteLoad {
	const old = side(oldRuns);
	const next = side(newRuns);
	// A page that hangs is slower than any that loads: the port passes an original that hung only by finishing every run of its own.
	if (hung.old || hung.new) {
		const finished = !hung.new && newRuns.length >= runs && newRuns.every((r) => r.metrics || r.noLcp || r.noTbt);
		return { runs: newRuns.length, old, new: next, verdicts: [], ok: Boolean(hung.old) && finished, hung };
	}
	const { old: oldGood, new: newGood, metrics, noLcp, noTbt } = judged(oldRuns, newRuns);
	if (!oldGood.length) return { runs, old, new: next, verdicts: [], ok: true, skipped: `no Lighthouse run of the old page finished (${oldRuns[0]?.error ?? 'no run'})` };
	if (!newGood.length) return { runs, old, new: next, verdicts: [], ok: false, skipped: `no Lighthouse run of the new page finished (${newRuns[0]?.error ?? 'no run'})` };
	const verdicts = judgeLoad(oldGood, newGood, metrics);
	// The new page losing the largest paint the old page has is red; one the old page lacks is reported, never red.
	// An original that never goes quiet is slower than any port that does; a port that never does is red, whatever the original.
	const ok = verdicts.every((v) => v.ok) && !(noLcp?.new && !noLcp.old) && !noTbt?.new;
	const browser = [...oldRuns, ...newRuns].find((r) => r.browser)?.browser;
	const all = [...oldRuns, ...newRuns];
	const indexes = all.flatMap((r) => (r.benchmarkIndex ? [r.benchmarkIndex] : []));
	const multipliers = all.flatMap((r) => (r.cpuMultiplier ? [r.cpuMultiplier] : []));
	const machine = { ...(indexes.length ? { benchmarkIndex: Math.round(median(indexes)) } : {}), ...(multipliers.length ? { cpuMultiplier: Math.round(median(multipliers) * 10) / 10 } : {}) };
	if (ok) {
		if (old.detail) delete old.detail.filmstrip;
		if (next.detail) delete next.detail.filmstrip;
	}
	return { runs, ...(browser ? { browser } : {}), ...machine, old, new: next, verdicts, ok, ...(noLcp ? { noLcp } : {}), ...(noTbt ? { noTbt } : {}) };
}

