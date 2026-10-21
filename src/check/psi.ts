import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { isLoopback } from './browser.ts';
import { judgeLoad, readRun, type LoadRun, type LoadVerdict, type Metrics } from './load.ts';

export const PSI_ENDPOINT = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed';
/** Where a PageSpeed Insights API key is created: free, one click after choosing a Google Cloud project. */
export const PSI_KEY_URL = 'https://developers.google.com/speed/docs/insights/v5/get-started#APIKey';
export const PSI_KEY_ENV = 'PSI_API_KEY';
export const DEFAULT_PSI_RUNS = 5;
export type Strategy = 'mobile' | 'desktop';

/** What real users saw, from the Chrome UX Report, as PageSpeed Insights returns it for the URL (or its origin). */
export interface FieldData {
	readonly scope: 'url' | 'origin';
	readonly category?: string;
	/** 75th percentile per metric: ms, and CLS as a plain number. */
	readonly p75: Readonly<Partial<Record<'fcp' | 'lcp' | 'cls' | 'inp' | 'ttfb', number>>>;
}

export interface PsiSide {
	readonly runs: readonly (Metrics | { readonly error: string })[];
	readonly median?: Metrics;
	readonly field?: FieldData;
	/** Lighthouse version and the benchmarkIndex of Google's machine. */
	readonly lighthouse?: string;
	readonly benchmarkIndex?: number;
}

export interface PsiStrategyResult {
	readonly strategy: Strategy;
	readonly old: PsiSide;
	readonly new: PsiSide;
	readonly verdicts: readonly LoadVerdict[];
	readonly ok: boolean;
}

export type PsiResult = { readonly strategies: readonly PsiStrategyResult[]; readonly keyed: boolean } | { readonly unavailable: string };

export interface PsiOptions {
	readonly key?: string;
	readonly runs?: number;
	readonly strategies?: readonly Strategy[];
	/** Waits before each retry of a rate-limited call, in ms; the default backs off 5 s, 15 s and 45 s. */
	readonly backoffMs?: readonly number[];
	/** PageSpeed Insights answers the same URL from its cache for about a minute: a repeated report is not a run, so it waits this long and asks again; default 30 s. */
	readonly repeatWaitMs?: number;
}

export type Fetcher = (url: string) => Promise<{ status: number; json: () => Promise<unknown> }>;

const FIELD_METRICS = { FIRST_CONTENTFUL_PAINT_MS: 'fcp', LARGEST_CONTENTFUL_PAINT_MS: 'lcp', CUMULATIVE_LAYOUT_SHIFT_SCORE: 'cls', INTERACTION_TO_NEXT_PAINT: 'inp', EXPERIMENTAL_TIME_TO_FIRST_BYTE: 'ttfb' } as const;

interface Experience {
	readonly metrics?: Readonly<Record<string, { readonly percentile?: number }>>;
	readonly overall_category?: string;
	readonly origin_fallback?: boolean;
}

export function fieldData(response: { loadingExperience?: Experience; originLoadingExperience?: Experience }): FieldData | undefined {
	const url = response.loadingExperience;
	const own = url?.metrics && !url.origin_fallback;
	const source = own ? url : response.originLoadingExperience;
	if (!source?.metrics) return undefined;
	const p75: Partial<Record<'fcp' | 'lcp' | 'cls' | 'inp' | 'ttfb', number>> = {};
	for (const [name, metric] of Object.entries(FIELD_METRICS)) {
		const value = source.metrics[name]?.percentile;
		// CrUX reports CLS multiplied by 100.
		if (value !== undefined) p75[metric] = metric === 'cls' ? value / 100 : value;
	}
	return { scope: own ? 'url' : 'origin', ...(source.overall_category ? { category: source.overall_category } : {}), p75 };
}

export class PsiUnavailable extends Error {}

/** One PageSpeed Insights run of `url`, retried with backoff while the API answers 429; a quota that stays exhausted throws PsiUnavailable. */
export async function psiRun(url: string, strategy: Strategy, options: PsiOptions = {}, fetcher: Fetcher = fetch): Promise<{ run: LoadRun; field?: FieldData; lighthouse?: string; benchmarkIndex?: number; analysis?: string }> {
	const query = new URLSearchParams({ url, strategy, category: 'performance' });
	if (options.key) query.set('key', options.key);
	const waits = options.backoffMs ?? [5000, 15000, 45000];
	for (let attempt = 0; ; attempt++) {
		const response = await fetcher(`${PSI_ENDPOINT}?${query}`);
		const body = (await response.json().catch(() => ({}))) as { error?: { message?: string }; lighthouseResult?: unknown; loadingExperience?: Experience; originLoadingExperience?: Experience; analysisUTCTimestamp?: string };
		if (response.status === 429) {
			if (attempt >= waits.length) throw new PsiUnavailable(`quota: ${body.error?.message?.split('.')[0] ?? 'rate limited'}`);
			await new Promise((done) => setTimeout(done, waits[attempt]));
			continue;
		}
		if (response.status === 400 || response.status === 403) throw new PsiUnavailable(`${response.status}: ${body.error?.message?.split('\n')[0] ?? 'refused'}`);
		if (response.status !== 200 || !body.lighthouseResult) return { run: { error: `PageSpeed Insights answered ${response.status}: ${body.error?.message?.split('\n')[0] ?? 'no result'}` } };
		const lhr = body.lighthouseResult as Parameters<typeof readRun>[0] & { lighthouseVersion?: string; environment?: { benchmarkIndex?: number } };
		const field = fieldData(body);
		return { run: readRun(lhr, new URL(url).origin), ...(body.analysisUTCTimestamp ? { analysis: body.analysisUTCTimestamp } : {}), ...(field ? { field } : {}), ...(lhr.lighthouseVersion ? { lighthouse: lhr.lighthouseVersion } : {}), ...(lhr.environment?.benchmarkIndex ? { benchmarkIndex: Math.round(lhr.environment.benchmarkIndex) } : {}) };
	}
}

const median = (values: readonly number[]) => {
	const s = [...values].sort((a, b) => a - b);
	const m = s.length >> 1;
	return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

function side(taken: Awaited<ReturnType<typeof psiRun>>[]): PsiSide {
	const good = taken.flatMap((t) => (t.run.metrics ? [t.run.metrics] : []));
	const medianMetrics = good.length ? (Object.fromEntries((['score', 'fcp', 'lcp', 'si', 'tbt', 'cls'] as const).map((m) => [m, median(good.map((g) => g[m]))])) as Metrics) : undefined;
	const field = taken.find((t) => t.field)?.field;
	const lighthouse = taken.find((t) => t.lighthouse)?.lighthouse;
	const indexes = taken.flatMap((t) => (t.benchmarkIndex ? [t.benchmarkIndex] : []));
	return { runs: taken.map((t) => t.run.metrics ?? { error: t.run.error ?? 'failed' }), ...(medianMetrics ? { median: medianMetrics } : {}), ...(field ? { field } : {}), ...(lighthouse ? { lighthouse } : {}), ...(indexes.length ? { benchmarkIndex: Math.round(median(indexes)) } : {}) };
}

/** PageSpeed Insights on both deployments, `runs` a side, old and new taken in turn; unavailable (never silently) when the API refuses or a side is on this machine. */
export async function measurePsi(origins: { readonly old: string; readonly new: string }, route: string, options: PsiOptions = {}, fetcher: Fetcher = fetch): Promise<PsiResult> {
	for (const origin of [origins.old, origins.new]) if (isLoopback(origin)) return { unavailable: `PageSpeed Insights cannot reach ${origin}: it measures deployed URLs only` };
	const runs = Math.max(1, options.runs ?? DEFAULT_PSI_RUNS);
	const strategies: PsiStrategyResult[] = [];
	const seen = new Set<string>();
	// A report PageSpeed Insights already gave is its cache, not a new run: ask again after a wait, a few times at most.
	const fresh = async (url: string, strategy: Strategy) => {
		for (let attempt = 0; ; attempt++) {
			const got = await psiRun(url, strategy, options, fetcher);
			if (!got.analysis || !seen.has(`${strategy} ${got.analysis}`) || attempt >= 4) {
				if (got.analysis) seen.add(`${strategy} ${got.analysis}`);
				return got;
			}
			await new Promise((done) => setTimeout(done, options.repeatWaitMs ?? 30_000));
		}
	};
	try {
		for (const strategy of options.strategies ?? (['mobile', 'desktop'] as const)) {
			const taken: { old: Awaited<ReturnType<typeof psiRun>>[]; new: Awaited<ReturnType<typeof psiRun>>[] } = { old: [], new: [] };
			for (let i = 0; i < runs; i++)
				for (const which of i % 2 ? (['new', 'old'] as const) : (['old', 'new'] as const)) taken[which].push(await fresh(new URL(route, origins[which]).href, strategy));
			const old = side(taken.old);
			const next = side(taken.new);
			const oldGood = taken.old.flatMap((t) => (t.run.metrics ? [t.run.metrics] : []));
			const newGood = taken.new.flatMap((t) => (t.run.metrics ? [t.run.metrics] : []));
			const verdicts = oldGood.length && newGood.length ? judgeLoad(oldGood, newGood) : [];
			strategies.push({ strategy, old, new: next, verdicts, ok: verdicts.every((v) => v.ok) && newGood.length > 0 });
		}
	} catch (error) {
		if (error instanceof PsiUnavailable) return { unavailable: `PSI unavailable (${error.message}), using PageSpeed-equivalent (lab, calibrated)` };
		throw error;
	}
	return { strategies, keyed: Boolean(options.key) };
}

/** Where `setup --psi-key` stores the key for this user, outside any repository. */
export const userEnvFile = (home = homedir()) => join(home, '.config', 'markless-migrate', 'env');

function fromEnvFile(path: string): string | undefined {
	if (!existsSync(path)) return undefined;
	const line = readFileSync(path, 'utf8').split('\n').find((l) => l.trim().startsWith(`${PSI_KEY_ENV}=`));
	return line?.slice(line.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '') || undefined;
}

/** The PageSpeed Insights key: PSI_API_KEY in the environment, else in the project's .env, else where `setup --psi-key` put it. */
export function psiKey(cwd = process.cwd(), env: NodeJS.ProcessEnv = process.env, home = homedir()): string | undefined {
	return env[PSI_KEY_ENV] || fromEnvFile(join(cwd, '.env')) || fromEnvFile(userEnvFile(home));
}

/** Said once, at plan and in a report without a key: what a key adds and how to get one. */
export const PSI_NOTICE = `Optional: create a free PageSpeed Insights key in about a minute (${PSI_KEY_URL}), then run \`markless-migrate setup --psi-key <key>\`. With it, page load is verified on Google's own PageSpeed Insights (FCP, LCP, Speed Index, TBT, CLS) with real users' field data; without it, a calibrated lab run stands in.`;
