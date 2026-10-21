import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import lighthouse from 'lighthouse';
import { throttling } from 'lighthouse/core/config/constants.js';
import { chromium } from 'playwright';
import { HINTS } from './hints.ts';
import { TRACKER_HOSTS, type BlockList } from './trackers.ts';
import type { Failure } from './types.ts';
import type { FieldData, PsiOptions, PsiResult } from './psi.ts';

export const LOAD_METRICS = ['score', 'fcp', 'lcp', 'si', 'tbt', 'cls'] as const;
export type LoadMetric = (typeof LOAD_METRICS)[number];
export type Metrics = Readonly<Record<LoadMetric, number>>;

export const METRIC_LABEL: Readonly<Record<LoadMetric, string>> = {
	score: 'Performance score',
	fcp: 'First Contentful Paint',
	lcp: 'Largest Contentful Paint',
	si: 'Speed Index',
	tbt: 'Total Blocking Time',
	cls: 'Cumulative Layout Shift',
};

export interface LoadOptions {
	/** Lighthouse runs per side and route, old and new taken in turn; default 5, and as many again when a metric is worse but not yet beyond noise. */
	readonly runs?: number;
	/** The CPU slowdown Lighthouse simulates with: 4 by default, as Lighthouse and PageSpeed Insights do; `calibrated` derives it from each run's own benchmarkIndex by Lighthouse's calculator. Against real PageSpeed Insights on ten sites, 4 came closer (TBT within 10% on 18 of 20 pages against 12) and neither matched its score within 5 points on more than 12 of 20, so real PSI is the gate whenever it answers. */
	readonly cpu?: 'calibrated' | number;
	/** Hosts blocked on both sides, as in the rest of the check. */
	readonly block?: BlockList;
	/** Real PageSpeed Insights on the deployed URLs; false leaves it out. The key defaults to the PSI_API_KEY environment variable; without one it runs on the shared keyless quota, best effort. */
	readonly psi?: PsiOptions | false;
}

export const DEFAULT_LOAD_RUNS = 5;
/** A run that errors (on a busy machine headless Chromium can skip painting, NO_FCP) is taken again, at most this many times. */
const RETRIES = 2;
/** One-sided significance a worse median needs before it counts: below it the two sides' runs overlap as much as noise does. */
export const SIGNIFICANCE = 0.05;

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
	/** Why the route has no verdict: a side never finished a run. */
	readonly skipped?: string;
	/** PageSpeed Insights on the deployments: when it answered, its verdicts gate the route instead of the lab's. */
	readonly psi?: PsiResult;
}

export function median(values: readonly number[]): number {
	const sorted = [...values].sort((a, b) => a - b);
	const mid = sorted.length >> 1;
	return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

export function spread(values: readonly number[]): number {
	const m = median(values);
	return median(values.map((v) => Math.abs(v - m)));
}

/** P(U >= observed) for `higher` against `lower` under the null that both come from one distribution: the exact distribution of `higher`'s rank sum over every split of the pooled runs, ties at their mid-rank. */
export function mannWhitneyGreater(lower: readonly number[], higher: readonly number[]): number {
	if (!lower.length || !higher.length) return 1;
	const pooled = [...lower.map((v) => ({ v, high: false })), ...higher.map((v) => ({ v, high: true }))].sort((a, b) => a.v - b.v);
	// Doubled mid-ranks keep every rank sum a whole number.
	const ranks: number[] = [];
	for (let i = 0; i < pooled.length; ) {
		let j = i;
		while (j < pooled.length && pooled[j]!.v === pooled[i]!.v) j++;
		for (let t = i; t < j; t++) ranks.push(i + j + 1);
		i = j;
	}
	const observed = ranks.reduce((sum, r, i) => sum + (pooled[i]!.high ? r : 0), 0);
	const k = higher.length;
	const max = ranks.reduce((a, b) => a + b, 0);
	let ways: number[][] = Array.from({ length: k + 1 }, () => new Array<number>(max + 1).fill(0));
	ways[0]![0] = 1;
	for (const r of ranks) {
		const next = ways.map((row) => [...row]);
		for (let c = 0; c < k; c++) for (let sum = 0; sum + r <= max; sum++) if (ways[c]![sum]) next[c + 1]![sum + r]! += ways[c]![sum]!;
		ways = next;
	}
	const row = ways[k]!;
	const total = row.reduce((a, b) => a + b, 0);
	return row.reduce((n, count, sum) => n + (sum >= observed ? count : 0), 0) / total;
}

/** Each metric's verdict: red when the new median is worse than the old by more than its floor and the runs say that is not noise. */
export function judgeLoad(old: readonly Metrics[], next: readonly Metrics[]): LoadVerdict[] {
	return LOAD_METRICS.map((metric) => {
		const o = old.map((m) => m[metric]);
		const n = next.map((m) => m[metric]);
		const higherIsBetter = metric === 'score';
		const om = median(o);
		const nm = median(n);
		const worse = higherIsBetter ? om - nm : nm - om;
		const p = higherIsBetter ? mannWhitneyGreater(n, o) : mannWhitneyGreater(o, n);
		const f = floor(metric, om);
		return { metric, old: om, new: nm, worse, floor: f, p, spread: { old: spread(o), new: spread(n) }, ok: !(worse > f && p < SIGNIFICANCE) };
	});
}

// Lighthouse result shapes this module reads; the package's own types cover the whole report.
interface Audit {
	readonly numericValue?: number;
	readonly details?: { readonly items?: readonly any[] };
}
interface Lhr {
	readonly environment?: { readonly hostUserAgent?: string; readonly benchmarkIndex?: number };
	readonly configSettings?: { readonly throttling?: { readonly cpuSlowdownMultiplier?: number } };
	readonly runtimeError?: { readonly code: string; readonly message: string };
	readonly categories: { readonly performance?: { readonly score: number | null } };
	readonly audits: Readonly<Record<string, Audit | undefined>>;
}

const shortUrl = (url: string, origin: string) => (url.startsWith(origin) ? url.slice(origin.length) || '/' : url).slice(0, 120);

export function readRun(lhr: Lhr, origin: string): LoadRun {
	if (lhr.runtimeError) return { error: `${lhr.runtimeError.code}: ${lhr.runtimeError.message}` };
	const a = lhr.audits;
	const value = (id: string) => a[id]?.numericValue;
	const values = { fcp: value('first-contentful-paint'), lcp: value('largest-contentful-paint'), si: value('speed-index'), tbt: value('total-blocking-time'), cls: value('cumulative-layout-shift') };
	const score = lhr.categories.performance?.score;
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
async function startChromium(): Promise<{ port: number; close: () => Promise<void> }> {
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

export type Lighthouse = (url: string, port: number, blocked: readonly string[], cpu: 'calibrated' | number) => Promise<Lhr>;

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

const runLighthouse: Lighthouse = async (url, port, blocked, cpu) => {
	const flags = { port, output: 'json' as const, onlyCategories: ['performance'], logLevel: 'error' as const, blockedUrlPatterns: [...blocked] };
	if (cpu !== 'calibrated') {
		const result = await lighthouse(url, { ...flags, throttling: { ...throttling.mobileSlow4G, cpuSlowdownMultiplier: cpu } });
		if (!result) throw new Error('Lighthouse returned no result');
		return result.lhr as unknown as Lhr;
	}
	// The simulation runs when the artifacts are audited, so the load is gathered once and simulated at the slowdown its own benchmarkIndex calls for.
	const dir = await mkdtemp(join(tmpdir(), 'markless-migrate-lhr-'));
	try {
		await lighthouse(url, { ...flags, gatherMode: dir });
		const file = join(dir, 'artifacts.json');
		const artifacts = JSON.parse(await readFile(file, 'utf8')) as { BenchmarkIndex?: number; settings?: { throttlingMethod?: string; throttling?: Record<string, number> } };
		const multiplier = artifacts.BenchmarkIndex ? cpuMultiplier(artifacts.BenchmarkIndex) : throttling.mobileSlow4G.cpuSlowdownMultiplier;
		// With simulated throttling the gather never slows the CPU, so the saved settings may name the slowdown the audit simulates.
		if (artifacts.settings?.throttlingMethod !== 'simulate') throw new Error(`Lighthouse gathered with ${artifacts.settings?.throttlingMethod} throttling; a calibrated run needs simulate`);
		artifacts.settings.throttling = { ...artifacts.settings.throttling, cpuSlowdownMultiplier: multiplier };
		await writeFile(file, JSON.stringify(artifacts));
		const result = await lighthouse(url, { ...flags, auditMode: dir, throttling: { ...throttling.mobileSlow4G, cpuSlowdownMultiplier: multiplier } });
		if (!result) throw new Error('Lighthouse returned no result');
		return result.lhr as unknown as Lhr;
	} finally {
		await rm(dir, { recursive: true, force: true }).catch(() => {});
	}
};

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
	try {
		const once = async (which: 'old' | 'new', route: string): Promise<LoadRun> => {
			const origin = origins[which];
			const url = new URL(route, origin).href;
			let result: LoadRun = { error: 'not run' };
			for (let attempt = 0; attempt <= RETRIES && !result.metrics; attempt++) result = await run(url, browser.port, blocked, cpu).then((lhr) => readRun(lhr, origin), (error: unknown) => ({ error: error instanceof Error ? error.message.split('\n')[0]! : String(error) }));
			return result;
		};
		for (const route of routes) {
			const taken: { old: LoadRun[]; new: LoadRun[] } = { old: [], new: [] };
			const take = async (from: number) => {
				for (let i = from; i < from + runs; i++) for (const which of i % 2 ? (['new', 'old'] as const) : (['old', 'new'] as const)) taken[which].push(await once(which, route));
			};
			await take(0);
			if (undecided(taken.old, taken.new)) await take(runs);
			out.set(route, routeLoad(taken.old.length, taken.old, taken.new));
		}
	} finally {
		await browser.close();
	}
	return out;
}

/** A metric worse than its floor whose runs do not yet tell it from noise: worth as many runs again before judging. */
export function undecided(oldRuns: readonly LoadRun[], newRuns: readonly LoadRun[]): boolean {
	const o = oldRuns.flatMap((r) => (r.metrics ? [r.metrics] : []));
	const n = newRuns.flatMap((r) => (r.metrics ? [r.metrics] : []));
	return o.length > 0 && n.length > 0 && judgeLoad(o, n).some((v) => v.worse > v.floor && v.p >= SIGNIFICANCE);
}

/** A route whose load was not measured, with why; never red. */
export function unmeasured(reason: string): RouteLoad {
	return { runs: 0, old: { runs: [] }, new: { runs: [] }, verdicts: [], ok: true, skipped: reason };
}

export function routeLoad(runs: number, oldRuns: readonly LoadRun[], newRuns: readonly LoadRun[]): RouteLoad {
	const old = side(oldRuns);
	const next = side(newRuns);
	const oldGood = oldRuns.flatMap((r) => (r.metrics ? [r.metrics] : []));
	const newGood = newRuns.flatMap((r) => (r.metrics ? [r.metrics] : []));
	if (!oldGood.length) return { runs, old, new: next, verdicts: [], ok: true, skipped: `no Lighthouse run of the old page finished (${oldRuns[0]?.error ?? 'no run'})` };
	if (!newGood.length) return { runs, old, new: next, verdicts: [], ok: false, skipped: `no Lighthouse run of the new page finished (${newRuns[0]?.error ?? 'no run'})` };
	const verdicts = judgeLoad(oldGood, newGood);
	const ok = verdicts.every((v) => v.ok);
	const browser = [...oldRuns, ...newRuns].find((r) => r.browser)?.browser;
	const all = [...oldRuns, ...newRuns];
	const indexes = all.flatMap((r) => (r.benchmarkIndex ? [r.benchmarkIndex] : []));
	const multipliers = all.flatMap((r) => (r.cpuMultiplier ? [r.cpuMultiplier] : []));
	const machine = { ...(indexes.length ? { benchmarkIndex: Math.round(median(indexes)) } : {}), ...(multipliers.length ? { cpuMultiplier: Math.round(median(multipliers) * 10) / 10 } : {}) };
	if (ok) {
		if (old.detail) delete old.detail.filmstrip;
		if (next.detail) delete next.detail.filmstrip;
	}
	return { runs, ...(browser ? { browser } : {}), ...machine, old, new: next, verdicts, ok };
}

export const formatMetric = (metric: LoadMetric, value: number): string =>
	metric === 'score' ? `${Math.round(value)}` : metric === 'cls' ? value.toFixed(3) : value >= 1000 ? `${(value / 1000).toFixed(2)} s` : `${Math.round(value)} ms`;

const kB = (bytes: number) => `${(bytes / 1024).toFixed(1)} kB`;

function describeFcp(d: LoadDetail | undefined): string {
	if (!d?.beforeFcp) return '';
	const largest = d.beforeFcp.largest.slice(0, 6).map((r) => `${r.url} ${kB(r.bytes)} ${r.priority} ${r.type}`).join('; ');
	return [
		d.observed.fcp !== undefined ? `unthrottled load first painted at ${Math.round(d.observed.fcp)} ms` : '',
		`${d.beforeFcp.count} requests at a render-blocking priority (VeryHigh, or a High-priority script) finished before it and hold it back (${kB(d.beforeFcp.bytes)})${largest ? `: ${largest}` : ''}`,
		d.htmlBytes !== undefined ? `HTML ${kB(d.htmlBytes)} on the wire` : '',
		d.renderBlocking.length ? `render-blocking: ${d.renderBlocking.join(', ')}` : '',
	]
		.filter(Boolean)
		.join('; ');
}

function describeSide(d: LoadDetail | undefined): string {
	if (!d) return '';
	const phases = d.lcpPhases ? Object.entries(d.lcpPhases).map(([k, v]) => `${k} ${v} ms`).join(', ') : '';
	const largest = d.beforeLcp.largest.slice(0, 5).map((r) => `${r.url} ${kB(r.bytes)} ${r.priority} ${r.type}`).join('; ');
	return [
		d.lcpElement ? `LCP element ${d.lcpElement}` : '',
		phases ? `LCP breakdown ${phases}` : '',
		d.observed.lcp !== undefined ? `unthrottled load painted it at ${Math.round(d.observed.lcp)} ms` : '',
		`${d.beforeLcp.count} requests (${kB(d.beforeLcp.bytes)}) began before it and count toward it${largest ? `, largest: ${largest}` : ''}`,
		d.htmlBytes !== undefined ? `HTML ${kB(d.htmlBytes)} on the wire` : '',
		d.renderBlocking.length ? `render-blocking: ${d.renderBlocking.join(', ')}` : '',
		d.scripts.length ? `main thread ${d.mainThreadMs ?? '?'} ms, scripts: ${d.scripts.map((s) => `${s.url} ${s.ms} ms`).join(', ')}` : '',
	]
		.filter(Boolean)
		.join('; ');
}

const runList = (runs: LoadSide['runs'], metric: LoadMetric) => runs.map((r) => ('error' in r ? 'failed' : formatMetric(metric, (r as Metrics)[metric]))).join(', ');

/** The route's page-load failures, one per metric that is worse beyond noise, each naming what the new page's load spent its time on next to the old page's. */
export function loadFailures(route: string, load: RouteLoad): Failure[] {
	const check = (what: string) => `page load: ${what} (Lighthouse, mobile)`;
	if (load.skipped) return load.ok ? [] : [{ route, dimension: 'load', check: check('the page'), viewport: 'mobile', expected: 'Lighthouse finishes a run of the new page, as it does of the old one', actual: load.skipped, hint: HINTS.load }];
	return load.verdicts
		.filter((v) => !v.ok)
		.map((v) => {
			const paint = v.metric === 'lcp' || v.metric === 'fcp' || v.metric === 'si' || v.metric === 'score';
			const describe = v.metric === 'fcp' ? describeFcp : describeSide;
			return {
				route,
				dimension: 'load' as const,
				check: check(METRIC_LABEL[v.metric]),
				viewport: 'mobile',
				expected: `${formatMetric(v.metric, v.old)} or better, the old page's median of ${load.runs} (runs ${runList(load.old.runs, v.metric)})${paint ? `; old: ${describe(load.old.detail)}` : ''}`,
				actual: `${formatMetric(v.metric, v.new)}, the median of ${load.runs} (runs ${runList(load.new.runs, v.metric)}): ${v.metric === 'score' ? `${Math.round(v.worse)} points lower` : `${formatMetric(v.metric, v.worse)} worse`}, beyond the ${formatMetric(v.metric, v.floor)} allowed and the noise between runs (p = ${v.p.toFixed(3)})${paint ? `; new: ${describe(load.new.detail)}` : ''}`,
				hint: HINTS.load,
			};
		});
}

/** One line per route: each metric old -> new, the medians of the runs. */
export function loadLine(load: RouteLoad): string {
	if (load.skipped) return `page load, PageSpeed-equivalent (lab): not compared, ${load.skipped}`;
	const parts = load.verdicts.map((v) => `${v.metric === 'score' ? 'score' : v.metric.toUpperCase()} ${formatMetric(v.metric, v.old)} -> ${formatMetric(v.metric, v.new)}${v.ok ? '' : ' (worse)'}`);
	const cpu = load.cpuMultiplier ? `, ${load.cpuMultiplier}x CPU${load.benchmarkIndex ? ` for benchmarkIndex ${load.benchmarkIndex}` : ''}` : '';
	return `page load, PageSpeed-equivalent (lab; Lighthouse mobile, median of ${load.runs}${load.browser ? `, ${load.browser}` : ''}${cpu}): ${parts.join(', ')}`;
}

const PSI_LABEL = (strategy: string) => `PageSpeed Insights, ${strategy}`;

/** The route's PageSpeed Insights failures, when PSI answered; a side PSI never finished is red only when it is the new one. */
export function psiFailures(route: string, psi: PsiResult | undefined): Failure[] | undefined {
	if (!psi || 'unavailable' in psi) return undefined;
	return psi.strategies.flatMap((s) =>
		s.verdicts.length
			? s.verdicts
					.filter((v) => !v.ok)
					.map((v) => ({
						route,
						dimension: 'load' as const,
						check: `page load: ${METRIC_LABEL[v.metric]} (${PSI_LABEL(s.strategy)})`,
						viewport: s.strategy,
						expected: `${formatMetric(v.metric, v.old)} or better, the old page's median of ${s.old.runs.length} PageSpeed Insights runs (${runList(s.old.runs, v.metric)})`,
						actual: `${formatMetric(v.metric, v.new)}, the median of ${s.new.runs.length} (${runList(s.new.runs, v.metric)}): ${v.metric === 'score' ? `${Math.round(v.worse)} points lower` : `${formatMetric(v.metric, v.worse)} worse`}, beyond the ${formatMetric(v.metric, v.floor)} allowed and the noise between runs (p = ${v.p.toFixed(3)})`,
						hint: HINTS.load,
					}))
			: s.new.median
				? []
				: [{ route, dimension: 'load' as const, check: `page load: the page (${PSI_LABEL(s.strategy)})`, viewport: s.strategy, expected: 'PageSpeed Insights finishes a run of the new page', actual: String((s.new.runs[0] as { error?: string } | undefined)?.error ?? 'no run finished'), hint: HINTS.load }],
	);
}

const fieldLine = (f: FieldData) =>
	`${f.scope === 'url' ? 'this URL' : 'its origin'}${f.category ? ` ${f.category}` : ''}: ${Object.entries(f.p75).map(([k, v]) => `${k.toUpperCase()} ${k === 'cls' ? v.toFixed(2) : `${Math.round(v)} ms`}`).join(', ')}`;

/** One line per strategy PSI measured, or why it did not, for the summary. */
export function psiLines(psi: PsiResult | undefined): string[] {
	if (!psi) return [];
	if ('unavailable' in psi) return [`PageSpeed Insights: ${psi.unavailable}`];
	return psi.strategies.flatMap((s) => {
		const parts = s.verdicts.map((v) => `${v.metric === 'score' ? 'score' : v.metric.toUpperCase()} ${formatMetric(v.metric, v.old)} -> ${formatMetric(v.metric, v.new)}${v.ok ? '' : ' (worse)'}`);
		const field = [s.old.field ? `old ${fieldLine(s.old.field)}` : '', s.new.field ? `new ${fieldLine(s.new.field)}` : ''].filter(Boolean);
		return [`PageSpeed Insights ${s.strategy}${psi.keyed ? '' : ' (keyless)'}, median of ${s.old.runs.length}${s.old.lighthouse ? `, Lighthouse ${s.old.lighthouse}` : ''}: ${parts.join(', ') || 'no run finished'}`, ...(field.length ? [`  field data (Chrome UX Report, p75): ${field.join('; ')}`] : [])];
	});
}
