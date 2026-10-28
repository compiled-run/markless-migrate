import { mannWhitneyGreater, median, psiFailures, SIGNIFICANCE } from './load.ts';
import { CLICK_EVERY_MS, FRAME_EVERY_MS, formatValue, RUN_METRIC_LABEL, runMetric, type NetworkCell, type NetworkRun, type RouteNetwork, type RunMetric } from './slow-network.ts';
import { NETWORK_PROFILES } from './throttle.ts';
import type { Failure, RouteResult } from './types.ts';

/** The times that gate a route: a page that paints or answers later on any browser and network is slower there. */
export const GATED: readonly RunMetric[] = ['firstFrame', 'lcp', 'answered'];
const BAND_QUANTILE = 0.9;
/** Old runs a band needs: fewer cannot be split in two halves of two. */
const MIN_OLD_RUNS = 4;
// A paint's time is the frame it was presented in (60 Hz): content ready a few ms later can land a whole frame later.
const PAINT_FRAME_MS = 17;
/** The instrument's own step: a first frame is read from screenshots this far apart, a click is sent no more often than this, and a largest paint is timed to its frame, so a smaller difference cannot be seen. */
export const resolution = (metric: RunMetric): number => (metric === 'firstFrame' ? FRAME_EVERY_MS : metric === 'answered' ? CLICK_EVERY_MS : metric === 'lcp' ? PAINT_FRAME_MS : 0);

/** The 90th percentile of the gap between the medians of two halves of `old`, over every way to split its runs: how far apart the old page lands from itself. */
export function noiseBand(old: readonly number[]): number | undefined {
	if (old.length < MIN_OLD_RUNS) return undefined;
	const n = old.length;
	const small = n >> 1;
	const gaps: number[] = [];
	const pick = (start: number, chosen: number[]) => {
		if (chosen.length === small) {
			const a = chosen.map((i) => old[i]!);
			const b = old.filter((_, i) => !chosen.includes(i));
			gaps.push(Math.abs(median(a) - median(b)));
			return;
		}
		for (let i = start; i < n; i++) pick(i + 1, [...chosen, i]);
	};
	pick(0, []);
	gaps.sort((x, y) => x - y);
	return gaps[Math.min(gaps.length - 1, Math.floor(BAND_QUANTILE * gaps.length))]!;
}

export interface NetworkVerdict {
	readonly metric: RunMetric;
	readonly old?: number;
	readonly new?: number;
	readonly worse: number;
	/** The larger of the old page's own noise and the instrument's step. */
	readonly band: number;
	readonly p: number;
	readonly ok: boolean;
	/** Why there is a red verdict without two medians to compare. */
	readonly reason?: string;
}

// A run that stopped waiting for its answer counts it at that moment: an old page's answer is no sooner than that.
const values = (runs: readonly NetworkRun[], metric: RunMetric) => runs.map((r) => runMetric(r, metric) ?? (metric === 'answered' && !r.error ? r.answeredAfter : undefined)).filter((v): v is number => v !== undefined);
const unanswered = (r: NetworkRun) => Boolean(r.error && /never answered/.test(r.error));

/** Each gated time old against new in one browser and network. */
export function networkVerdicts(old: NetworkCell, next: NetworkCell): NetworkVerdict[] {
	const out: NetworkVerdict[] = [];
	for (const metric of GATED) {
		const o = values(old.runs, metric);
		const n = values(next.runs, metric);
		if (metric === 'answered' && o.length && !n.length && next.runs.length && next.runs.every(unanswered)) {
			out.push({ metric, old: median(o), worse: Infinity, band: 0, p: 0, ok: false, reason: next.runs[0]!.error! });
			continue;
		}
		// A cell stopped once settled has too few runs to split the old ones; nothing it could still take would have made it red.
		const noise = noiseBand(o) ?? (old.settled || next.settled ? 0 : undefined);
		if (!o.length || !n.length || noise === undefined) continue;
		const band = Math.max(noise, resolution(metric));
		const om = median(o);
		const nm = median(n);
		const p = mannWhitneyGreater(o, n);
		out.push({ metric, old: om, new: nm, worse: nm - om, band, p, ok: !(nm - om > band && p < SIGNIFICANCE) });
	}
	return out;
}

/** The median of `known` and `missing` more values, each of those as large as it can be (`hi`) or as small (`lo`). */
function medianWith(known: readonly number[], missing: number, fill: number): number {
	return median([...known, ...Array.from({ length: Math.max(0, missing) }, () => fill)]);
}

/** The latest the new page's median answer can come, whatever answers its missing runs bring; undefined while it can still be any time. */
export function latestAnswer(next: readonly NetworkRun[], runs: number): number | undefined {
	if (next.some((r) => r.error)) return undefined;
	const answers = values(next, 'answered');
	if (answers.length !== next.length) return undefined;
	const latest = medianWith(answers, runs - next.length, Infinity);
	return Number.isFinite(latest) ? latest : undefined;
}

/**
 * Whether the runs a cell has yet to take can no longer make the new page slower: on every gated time, the new page's median
 * with each missing run as late as can be is no later than the old page's with each missing run at 0. Runs that failed, or a
 * time some runs have and others lack, leave the cell unsettled.
 */
export function settledNotSlower(old: readonly NetworkRun[], next: readonly NetworkRun[], runs: number): boolean {
	if (!old.length || !next.length || [...old, ...next].some((r) => r.error)) return false;
	for (const metric of GATED) {
		const o = values(old, metric);
		const n = values(next, metric);
		if (!o.length && !n.length) continue;
		if (o.length !== old.length || n.length !== next.length) return false;
		if (medianWith(n, runs - next.length, Infinity) > medianWith(o, runs - old.length, 0)) return false;
	}
	return true;
}

const KB = (bytes: number) => `${(bytes / 1000).toFixed(1)} kB`;

/** The requests the run finished before its answer (or its first painted frame), largest first, each with the seconds of the link its bytes took. */
export function criticalPath(run: NetworkRun | undefined, metric: RunMetric, bytesPerSecond: number, count = 5): string {
	if (!run) return '';
	const by = metric === 'answered' ? run.answered : metric === 'lcp' ? run.lcp : run.firstFrame;
	if (by === undefined) return '';
	const before = run.requests.filter((r) => r.end <= by).sort((a, b) => b.bytes - a.bytes);
	const total = before.reduce((sum, r) => sum + r.bytes, 0);
	const path = (url: string) => {
		try {
			const u = new URL(url);
			return `${u.pathname}${u.search}`;
		} catch {
			return url;
		}
	};
	const what = metric === 'answered' ? 'the answer' : metric === 'lcp' ? 'the largest paint' : 'the first painted frame';
	return `before ${what} the new page finished ${Math.round(total / 1000)} kB (${(total / bytesPerSecond).toFixed(1)} s of the link): ${before
		.slice(0, count)
		.map((r) => `${r.type} ${path(r.url)} ${KB(r.bytes)} (${(r.bytes / bytesPerSecond).toFixed(1)} s)`)
		.join(', ')}`;
}

const runList = (runs: readonly NetworkRun[], metric: RunMetric) => values(runs, metric).map((v) => formatValue(metric, v)).join(', ');

export const NETWORK_HINT =
	'The new page paints or answers its first click later than the old one in this browser on this network, beyond how far the old page differs from itself. Every byte it needs first shares one slow link: the requests listed came before the answer, largest first. Fetch less before the first paint and the first click (fonts the first view does not show, stylesheets for other pages, code for controls below the fold), and keep the HTML small.';

/** The route's red cells: each browser and network where a gated time of the new page is worse beyond the old page's own noise. */
export function networkFailures(route: string, network: RouteNetwork | { readonly unavailable: string } | undefined): Failure[] {
	if (!network || 'unavailable' in network) return [];
	const out: Failure[] = [];
	for (const [i, old] of network.old.cells.entries()) {
		const next = network.new.cells[i];
		if (!next || old.unavailable || next.unavailable) continue;
		const profile = NETWORK_PROFILES[old.profile];
		const cell = `${old.browser} ${profile?.label ?? old.profile}`;
		for (const v of networkVerdicts(old, next).filter((x) => !x.ok)) {
			const runs = next.runs.filter((r) => !r.error).length || next.runs.length;
			const path = criticalPath(next.medianRun, v.metric, profile?.downBytesPerSecond ?? 1);
			out.push({
				route,
				dimension: 'load',
				check: `page load: slow network, ${cell}: ${RUN_METRIC_LABEL[v.metric]}`,
				expected: `${formatValue(v.metric, v.old)} or sooner, the old page's median of ${values(old.runs, v.metric).length} cold loads (runs ${runList(old.runs, v.metric)})`,
				actual: v.reason
					? `never, in ${next.runs.length} cold loads: ${v.reason}`
					: `${formatValue(v.metric, v.new)}, the median of ${runs} (runs ${runList(next.runs, v.metric)}): ${formatValue(v.metric, v.worse)} worse, beyond the ${formatValue(v.metric, v.band)} the old page's own runs differ by or the measurement can tell apart (p = ${v.p.toFixed(3)})${path ? `; ${path}` : ''}`,
				hint: NETWORK_HINT,
			});
		}
	}
	return out;
}

/** Why the route's slow network was not measured: a browser and network where a side's runs failed (a server that stopped answering, a stalled machine) and left too few to compare; undefined when every measured cell has its verdict. */
export function networkUnmeasured(network: RouteNetwork | { readonly unavailable: string } | undefined): string | undefined {
	if (!network || 'unavailable' in network) return undefined;
	for (const [i, old] of network.old.cells.entries()) {
		const next = network.new.cells[i];
		if (!next || old.unavailable || next.unavailable) continue;
		const cell = `${old.browser} ${NETWORK_PROFILES[old.profile]?.label ?? old.profile}`;
		const usable = (c: NetworkCell) => c.runs.filter((r) => !r.error).length;
		const why = (c: NetworkCell) => c.runs.find((r) => r.error)?.error ?? 'no run was taken';
		if (usable(old) < MIN_OLD_RUNS && !(old.settled || next.settled)) return `slow network not measured in ${cell}: ${usable(old)} of ${old.runs.length} old runs finished (${why(old)})`;
		if (!usable(next) && !(next.runs.length && next.runs.every(unanswered))) return `slow network not measured in ${cell}: none of ${next.runs.length} new runs finished (${why(next)})`;
	}
	return undefined;
}

/** A route green but for a page load whose old or new runs never finished (the lab's or the slow network's) is not checked, never green. */
export function unmeasuredNotChecked(route: RouteResult): RouteResult {
	const lab = route.load?.skipped && route.load.ok && !psiFailures(route.route, route.load.psi) ? `page load (lab) not measured: ${route.load.skipped}` : undefined;
	const why = route.ok && !route.infrastructure ? (lab ?? networkUnmeasured(route.load?.network)) : undefined;
	return why ? { ...route, ok: false, dimensions: { ...route.dimensions, load: 'skipped' }, infrastructure: { cause: 'not measured', message: why } } : route;
}

const SUMMARY_METRICS: readonly RunMetric[] = ['answered', 'visibleToAnswer', 'firstFrame', 'lcp', 'bytesByAnswer', 'jsExecutedByAnswer'];

/** What the route's slow-network measurement covered: cells measured, reused and skipped, and the time it took. */
export function networkHeadline(network: RouteNetwork): string {
	const cells = network.old.cells.map((old, i) => [old, network.new.cells[i]!] as const);
	const skipped = cells.filter(([o, n]) => o.unavailable || n.unavailable).length;
	const reused = cells.filter(([o]) => o.cached).length;
	const minutes = network.ms !== undefined ? `, ${(network.ms / 60_000).toFixed(1)} min` : '';
	return `slow network: ${cells.length - skipped} of ${cells.length} browser and network cells measured${skipped ? `, ${skipped} skipped` : ''}${reused ? `, old runs reused from an earlier check of the same deploy in ${reused}` : ''}${minutes}`;
}

/** One line per browser and network: the summary's medians, old -> new, a gated time marked when it is slower beyond noise. */
export function networkLines(network: RouteNetwork | { readonly unavailable: string } | undefined): string[] {
	if (!network) return [];
	if ('unavailable' in network) return [`slow network: ${network.unavailable}`];
	return [
		networkHeadline(network),
		...network.old.cells.map((old, i) => {
			const next = network.new.cells[i]!;
			const label = `slow network, ${old.browser} ${NETWORK_PROFILES[old.profile]?.label ?? old.profile}`;
			const skip = old.unavailable ?? next.unavailable;
			if (skip) return `${label}: skipped, ${skip}`;
			const slower = new Set(networkVerdicts(old, next).filter((v) => !v.ok).map((v) => v.metric));
			const runs = Math.min(old.runs.filter((r) => !r.error).length, next.runs.filter((r) => !r.error).length);
			const parts = SUMMARY_METRICS.filter((m) => old.median[m] !== undefined || next.median[m] !== undefined).map((m) => `${RUN_METRIC_LABEL[m].replace(/ \(Chromium\)$/, '')} ${formatValue(m, old.median[m])} -> ${formatValue(m, next.median[m])}${slower.has(m) ? ' (slower)' : ''}`);
			const failed = [old, next].flatMap((c, side) => (c.runs.some((r) => r.error) ? [`${side ? 'new' : 'old'} ${c.runs.filter((r) => r.error).length} of ${c.runs.length} runs failed: ${c.runs.find((r) => r.error)!.error}`] : []));
			const none = [old, next].every((c) => c.runs.length && c.runs.every((r) => r.noControl)) ? '; nothing to click on either page' : '';
			return `${label} (median of ${runs} cold loads${old.cached ? ', old reused' : ''}): ${parts.join(', ') || 'no run finished'}${none}${failed.length ? `; ${failed.join('; ')}` : ''}`;
		}),
	];
}
