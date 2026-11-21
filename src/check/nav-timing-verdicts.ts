// Navigation timing verdicts: the port is red where a press reaches the next page later than on the original beyond the
// original's own noise, per browser, network, pointer behaviour and first visit or revisit, with the cause it shows.
// Runs are the unit: presses in one run share a browser and the machine's moment, so each run gives one value, its median.
import type { NavCell, NavClick, NavRun, RouteNavTiming, StepKind } from './nav-timing.ts';
import { minWorse } from './slow-network-verdicts.ts';
import { mannWhitneyGreater, median, noiseBand, SIGNIFICANCE } from './stats.ts';
import type { Failure } from './types.ts';

/** Port data over this many times the original's, on a red row, names the payload. */
const PAYLOAD_FACTOR = 1.25;
/** One 60 Hz frame: the paint is read on the frame after the content changes. */
const FRAME_MS = 17;
/**
 * The original's own spread counts as noise up to a quarter of its median (at least 50 ms): an original whose runs land
 * in two clusters (fetched ahead or not) would otherwise widen the band enough to hide a real slowdown.
 */
const NOISE_CAP_FRACTION = 0.25;
const NOISE_CAP_MIN_MS = 50;
/** Bytes before the presses are reported beside the times; with no noise model for them yet they never make a row red. */
export const BYTES_REPORT_FACTOR = 1.5;

export type Cause = 'did not arrive' | 'budget spent' | `prefetch ruled out (${string})` | 'not prefetched' | 'prefetched too late' | 'prefetch cancelled' | 'refetched on revisit' | 'larger payload' | 'main thread' | 'unexplained';

export interface NavRow {
	readonly browser: string;
	readonly profile: string;
	readonly mode: string;
	readonly kind: StepKind;
	/** Medians of the runs' medians. */
	readonly old?: number;
	readonly new?: number;
	/** Runs compared a side, and presses each run should have made. */
	readonly runs: { readonly old: number; readonly new: number; readonly presses: number };
	/** new minus old, ms. */
	readonly gap?: number;
	/** The least gap that counts: the original's own run-to-run spread (capped), two frames or 5%, whichever is most. */
	readonly band: number;
	readonly p: number;
	readonly alpha?: number;
	readonly verdict: 'faster' | 'same' | 'slower' | 'not checked';
	readonly cause?: Cause;
	/** Shares of presses answered without a fetch of their own, and medians of bytes. */
	readonly served: { readonly old: number; readonly new: number };
	readonly bytesBefore: { readonly old: number; readonly new: number };
	readonly bytesAfter: { readonly old: number; readonly new: number };
	readonly dataAfter: { readonly old: number; readonly new: number };
	readonly mainThread?: { readonly old: number; readonly new: number };
	readonly ahead: { readonly old: Readonly<Record<NavClick['ahead'], number>>; readonly new: Readonly<Record<NavClick['ahead'], number>> };
	/** Hosts other than the app's own that the presses fetched from: their data is not matched to a page. */
	readonly otherHosts?: readonly string[];
	readonly reason?: string;
}

const med = (values: readonly number[]) => (values.length ? median(values) : 0);
const share = (clicks: readonly NavClick[], test: (c: NavClick) => boolean) => (clicks.length ? clicks.filter(test).length / clicks.length : 0);
const aheadOf = (clicks: readonly NavClick[]) => ({ arrived: clicks.filter((c) => c.ahead === 'arrived').length, arriving: clicks.filter((c) => c.ahead === 'arriving').length, cancelled: clicks.filter((c) => c.ahead === 'cancelled').length, none: clicks.filter((c) => c.ahead === 'none').length });
const timed = (c: NavClick) => c.ms !== undefined && !c.error;

/** A run's value for one kind of press: the median of its presses, or why it has none (a press that did not arrive, a failed run). */
function runValue(run: NavRun, kind: StepKind, presses: number): { readonly value?: number; readonly missing?: string } {
	if (run.error) return { missing: run.error };
	const mine = run.clicks.filter((c) => c.kind === kind);
	const failed = mine.find((c) => !timed(c));
	if (failed) return { missing: `${failed.target}: ${failed.error ?? 'no time'}` };
	if (mine.length < presses) return { missing: `${presses - mine.length} of its ${presses} presses were not made` };
	return { value: median(mine.map((c) => c.ms!)) };
}

function mostCommon(values: readonly string[]): string {
	const counts = new Map<string, number>();
	for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
	return [...counts].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0]?.[0] ?? '';
}

/** The cause that explains the gap: what the original had that the port lacked, earliest in the press's path first. */
function causeOf(kind: StepKind, o: readonly NavClick[], n: readonly NavClick[], gap: number): Cause {
	const oServed = share(o, (c) => c.served);
	const nServed = share(n, (c) => c.served);
	if (kind === 'revisit' && oServed > nServed + 0.25) return 'refetched on revisit';
	if (oServed > nServed + 0.25 || share(o, (c) => c.ahead === 'arrived') > share(n, (c) => c.ahead === 'arrived') + 0.25) {
		// The router says why it did not fetch ahead: that names the cause better than anything read from outside.
		const reasons = n.flatMap((c) => (c.ruledOut ? [c.ruledOut] : []));
		if (reasons.length >= n.length / 4) return `prefetch ruled out (${mostCommon(reasons)})`;
		if (share(n, (c) => c.budgetSpent === true) >= 0.25) return 'budget spent';
		if (share(n, (c) => c.ahead === 'cancelled') >= 0.25) return 'prefetch cancelled';
		return share(n, (c) => c.ahead === 'arriving') >= 0.25 ? 'prefetched too late' : 'not prefetched';
	}
	const od = med(o.map((c) => c.dataAfter));
	const nd = med(n.map((c) => c.dataAfter));
	const om = med(o.flatMap((c) => (c.mainThreadMs !== undefined ? [c.mainThreadMs] : [])));
	const nm = med(n.flatMap((c) => (c.mainThreadMs !== undefined ? [c.mainThreadMs] : [])));
	if (nm - om >= gap / 2) return 'main thread';
	if (nd > od * PAYLOAD_FACTOR && nd > 0) return 'larger payload';
	return 'unexplained';
}

/** The noise band for an original whose run medians are `ov`. */
export function bandOf(ov: readonly number[]): number {
	const om = median(ov);
	const cap = Math.max(NOISE_CAP_MIN_MS, om * NOISE_CAP_FRACTION);
	return Math.max(Math.min(noiseBand(ov) ?? cap, cap), minWorse(om), FRAME_MS);
}

function row(cell: NavCell, kind: StepKind): NavRow | undefined {
	const presses = cell.steps.filter((s) => s.kind === kind).length;
	if (!presses) return undefined;
	const all = (runs: readonly NavRun[]) => runs.flatMap((r) => r.clicks.filter((c) => c.kind === kind));
	const o = all(cell.old).filter(timed);
	const n = all(cell.new).filter(timed);
	const hosts = [...new Set([...all(cell.old), ...all(cell.new)].flatMap((c) => c.otherHosts ?? []))].sort();
	const base = {
		browser: cell.browser,
		profile: cell.profile,
		mode: cell.mode,
		kind,
		runs: { old: cell.old.length, new: cell.new.length, presses },
		served: { old: share(o, (c) => c.served), new: share(n, (c) => c.served) },
		bytesBefore: { old: med(o.map((c) => c.bytesBefore)), new: med(n.map((c) => c.bytesBefore)) },
		bytesAfter: { old: med(o.map((c) => c.bytesAfter)), new: med(n.map((c) => c.bytesAfter)) },
		dataAfter: { old: med(o.map((c) => c.dataAfter)), new: med(n.map((c) => c.dataAfter)) },
		...(o.some((c) => c.mainThreadMs !== undefined) ? { mainThread: { old: med(o.flatMap((c) => (c.mainThreadMs !== undefined ? [c.mainThreadMs] : []))), new: med(n.flatMap((c) => (c.mainThreadMs !== undefined ? [c.mainThreadMs] : []))) } } : {}),
		ahead: { old: aheadOf(o), new: aheadOf(n) },
		...(hosts.length ? { otherHosts: hosts } : {}),
	};
	if (cell.notChecked) return { ...base, band: 0, p: 1, verdict: 'not checked', reason: cell.notChecked };
	const olds = cell.old.map((r) => runValue(r, kind, presses));
	const news = cell.new.map((r) => runValue(r, kind, presses));
	const oldGap = olds.find((v) => v.missing);
	// The original must answer every press of every run: a gap there leaves nothing to hold the port to.
	if (oldGap || !olds.length) return { ...base, band: 0, p: 1, verdict: 'not checked', reason: oldGap ? `the original: ${oldGap.missing}` : 'no original run' };
	const ov = olds.map((v) => v.value!);
	const om = median(ov);
	const failed = news.filter((v) => v.missing);
	// A press the port never answers where the original answered every one is the slowest result there is, not missing data.
	if (failed.length) return { ...base, old: om, band: 0, p: 0, verdict: 'slower', cause: 'did not arrive', reason: `${failed.length} of ${news.length} port runs: ${failed[0]!.missing}` };
	if (olds.length < 4) return { ...base, band: 0, p: 1, verdict: 'not checked', reason: `only ${olds.length} original runs` };
	const band = bandOf(ov);
	if (news.length < 4) return { ...base, band: 0, p: 1, verdict: 'not checked', reason: `only ${news.length} port runs` };
	const nv = news.map((v) => v.value!);
	const nm = median(nv);
	return { ...base, old: om, new: nm, gap: nm - om, band, p: mannWhitneyGreater(ov, nv), verdict: 'same' };
}

/**
 * A check times up to `layouts` routes; each gets an equal share of `SIGNIFICANCE`, so identical sites go red in at most
 * that share of whole checks, not of routes.
 */
export function routeSignificance(timing: Pick<RouteNavTiming, 'layouts'>): number {
	return SIGNIFICANCE / Math.max(1, timing.layouts ?? 1);
}

/**
 * Every row of the route. A row is slower when its gap is over its band and its p value passes Holm's step-down over the
 * route's compared rows (so identical sides go red on a route at most `SIGNIFICANCE` of the time); faster the same way
 * the other way round, so the tally does not overstate wins either.
 */
export function navRows(timing: RouteNavTiming, significance = routeSignificance(timing)): NavRow[] {
	const rows = timing.cells.filter((c) => !c.unavailable || c.notChecked).flatMap((c) => (['first', 'revisit'] as const).flatMap((kind) => row(c, kind) ?? []));
	const compared = rows.map((r, i) => ({ r, i })).filter(({ r }) => r.gap !== undefined);
	const holm = (pOf: (r: NavRow) => number, beyond: (r: NavRow) => boolean, mark: (r: NavRow, alpha: number, yes: boolean) => NavRow) => {
		const family = compared.map(({ r, i }) => ({ i, p: pOf(r) })).sort((a, b) => a.p - b.p);
		let rejecting = true;
		for (const [rank, { i, p }] of family.entries()) {
			const alpha = significance / (family.length - rank);
			rejecting &&= p < alpha;
			rows[i] = mark(rows[i]!, alpha, rejecting && beyond(rows[i]!));
		}
	};
	const o = (r: NavRow) => timing.cells.find((c) => c.browser === r.browser && c.profile === r.profile && c.mode === r.mode)!;
	const clicksOf = (r: NavRow, side: 'old' | 'new') => o(r)[side].flatMap((run) => run.clicks.filter((c) => c.kind === r.kind && timed(c)));
	holm(
		(r) => r.p,
		(r) => r.gap! > r.band,
		(r, alpha, yes) => (yes ? { ...r, alpha, verdict: 'slower', cause: causeOf(r.kind, clicksOf(r, 'old'), clicksOf(r, 'new'), r.gap!) } : { ...r, alpha }),
	);
	holm(
		(r) => {
			const cell = o(r);
			const values = (side: 'old' | 'new') => cell[side].map((run) => runValue(run, r.kind, r.runs.presses).value!);
			return mannWhitneyGreater(values('new'), values('old'));
		},
		(r) => r.verdict !== 'slower' && -r.gap! > r.band,
		(r, _alpha, yes) => (yes ? { ...r, verdict: 'faster' } : r),
	);
	return rows;
}

/** Per network profile: how many rows the port wins, ties and loses, and the median gap of the rows compared. */
export function navTally(rows: readonly NavRow[]): { readonly profile: string; readonly faster: number; readonly same: number; readonly slower: number; readonly notChecked: number; readonly medianGap?: number }[] {
	const profiles = [...new Set(rows.map((r) => r.profile))];
	return profiles.map((profile) => {
		const mine = rows.filter((r) => r.profile === profile);
		const gaps = mine.flatMap((r) => (r.gap !== undefined ? [r.gap] : []));
		return { profile, faster: mine.filter((r) => r.verdict === 'faster').length, same: mine.filter((r) => r.verdict === 'same').length, slower: mine.filter((r) => r.verdict === 'slower').length, notChecked: mine.filter((r) => r.verdict === 'not checked').length, ...(gaps.length ? { medianGap: Math.round(median(gaps)) } : {}) };
	});
}

/** Page data fetched ahead of the presses, per browser and network, the port's against the original's: reported, never red. */
export function byteRows(timing: RouteNavTiming): { readonly browser: string; readonly profile: string; readonly old: number; readonly new: number; readonly over: boolean }[] {
	const seen = new Set<string>();
	const out: { browser: string; profile: string; old: number; new: number; over: boolean }[] = [];
	for (const cell of timing.cells) {
		const key = `${cell.browser} ${cell.profile}`;
		if (cell.unavailable || seen.has(key) || !cell.old.length || !cell.new.length) continue;
		seen.add(key);
		const perRun = (runs: readonly NavRun[]) => med(runs.filter((r) => !r.error).map((r) => r.clicks.reduce((s, c) => s + c.bytesBefore, 0)));
		const old = perRun(cell.old);
		const next = perRun(cell.new);
		out.push({ browser: cell.browser, profile: cell.profile, old, new: next, over: old > 0 && next > old * BYTES_REPORT_FACTOR });
	}
	return out;
}

const kb = (b: number) => `${Math.round(b / 1024)} kB`;
const pct = (x: number) => `${Math.round(x * 100)}%`;
const PROFILE_WORDS: Readonly<Record<string, string>> = { fast: 'a fast line', 'cpu-4x': 'a fast line with the CPU 4x slower', 'slow-4g': 'slow 4G (1.6 Mbit/s, 150 ms)' };
const MODE_WORDS: Readonly<Record<string, string>> = { instant: 'pressed the instant the pointer arrives', 'dwell-100': 'pressed 100 ms after the pointer arrives', 'dwell-250': 'pressed 250 ms after the pointer arrives', 'dwell-400': 'pressed 400 ms after the pointer arrives', touch: 'tapped' };
const RULED_OUT_HINT = "The port's router ruled out fetching ahead on the page shown (the reason in brackets: Save-Data, a hidden tab, or a network it judged too slow), where the original still fetched ahead. Where the reason is the network, the router's `'fast'` setting is what stops it; the original fetched on that network.";
const hintOf = (cause: Cause): string => (cause.startsWith('prefetch ruled out') ? RULED_OUT_HINT : CAUSE_HINT[cause as keyof typeof CAUSE_HINT]);
const CAUSE_HINT: Readonly<Record<Exclude<Cause, `prefetch ruled out (${string})`>, string>> = {
	'budget spent': "The port's router had spent its budget for fetching ahead on the page shown before the press, so this page was not fetched ahead where the original's was. Its page data is larger than the original's or it fetched more pages ahead; a smaller page, or a budget the router allows, brings it back.",
	'did not arrive': 'The port did not show the next page for a press that showed it on the original: the address did not change, the content never did, or it took longer than the check waits (20 s). That is the slowest result a press can have.',
	'not prefetched': "The original had this page's data before the press and the port did not. Fetch it as early as the original does: the port's router prefetch setting (convert's report, `prefetch`) should start it on the same trigger.",
	'prefetched too late': "The port started fetching this page before the press but later than the original, so it was still arriving when the press came: start it on the original's trigger (in view, or at load) instead of on hover.",
	'prefetch cancelled': 'The port started fetching this page ahead and cancelled it before the press: a budget or a newer fetch stopped it. Let it finish.',
	'refetched on revisit': 'The original showed this page again without asking the network; the port fetched it again. Keep pages already shown and answer a revisit from them (or let the browser cache the page data).',
	'larger payload': "The port's data for this page is larger than the original's and its download is most of the gap. Send less with each page.",
	'main thread': "The port's main thread was busy longer between the press and the paint (long animation frames). Do less work to show the page.",
	unexplained: 'Neither prefetching, payload size nor main-thread work explains the gap; compare the two runs request by request.',
};

const cellWords = (r: { browser: string; profile: string; mode: string; kind: StepKind }) => `${r.browser}, ${PROFILE_WORDS[r.profile] ?? r.profile}, link ${MODE_WORDS[r.mode] ?? r.mode}, ${r.kind === 'first' ? 'first visit' : 'revisit'}`;

/** The route's red rows: each a press that reaches the next page later on the port beyond the original's own noise, or never. */
export function navTimingFailures(route: string, timing: RouteNavTiming | { readonly unavailable: string } | undefined): Failure[] {
	if (!timing || 'unavailable' in timing) return [];
	return navRows(timing)
		.filter((x) => x.verdict === 'slower')
		.map((r) => ({
			route,
			dimension: 'load' as const,
			check: `navigation timing: ${cellWords(r)}`,
			expected: r.old !== undefined ? `the next page shown ${Math.round(r.old)} ms after the press or sooner, the original's median over ${r.runs.old} runs of ${r.runs.presses} presses (${pct(r.served.old)} answered from what it fetched ahead or kept, ${kb(r.bytesBefore.old)} of page data fetched before each press, ${kb(r.dataAfter.old)} after)` : 'every press answered',
			actual:
				r.cause === 'did not arrive'
					? `not shown: ${r.reason}`
					: `${Math.round(r.new!)} ms over ${r.runs.new} runs: ${Math.round(r.gap!)} ms later, beyond the ${Math.round(r.band)} ms band (p = ${r.p.toFixed(4)}, under the ${r.alpha?.toFixed(4)} its rank among the route's rows needs); ${pct(r.served.new)} answered without a fetch, ${kb(r.bytesBefore.new)} before each press, ${kb(r.dataAfter.new)} of page data after${r.mainThread ? `, ${r.mainThread.new} ms of long frames against ${r.mainThread.old}` : ''}${r.otherHosts ? `; data from ${r.otherHosts.join(', ')} not matched to a page` : ''}: ${r.cause}`,
			hint: hintOf(r.cause ?? 'unexplained'),
		}));
}

/** Why a timed route has no verdict where it should: the measurement failed, a cell could not be finished, or a row has no original to hold the port to. Such a route is never green. */
export function navTimingUnmeasured(timing: RouteNavTiming | { readonly unavailable: string; readonly failed?: true } | undefined): string | undefined {
	if (!timing) return undefined;
	if ('unavailable' in timing) return timing.failed ? `navigation timing ${timing.unavailable}` : undefined;
	const row = navRows(timing).find((r) => r.verdict === 'not checked');
	return row ? `navigation timing not checked in ${cellWords(row)}: ${row.reason}` : undefined;
}

/**
 * What fetching ahead as much as the original would cost the port before the presses: the original's page data ahead,
 * scaled by how large a page's data is on each side (from presses that fetched it). Undefined when either side never fetched one.
 */
export function aheadCost(timing: RouteNavTiming): { readonly old: number; readonly estimate: number; readonly pageOld: number; readonly pageNew: number } | undefined {
	const pages = (side: 'old' | 'new') => timing.cells.flatMap((c) => c[side].flatMap((r) => r.clicks.filter((x) => x.fetched && x.dataAfter > 0).map((x) => x.dataAfter)));
	const po = pages('old');
	const pn = pages('new');
	const bytes = byteRows(timing);
	if (!po.length || !pn.length || !bytes.length) return undefined;
	const old = median(bytes.map((b) => b.old));
	return { old, estimate: Math.round((old * median(pn)) / median(po)), pageOld: median(po), pageNew: median(pn) };
}

const HEADLINE = ['dwell-250', 'touch'];

/** The route's table, human-like mouse and touch first (what a visitor feels), the instant press last as the worst case. */
export function navTimingLines(timing: RouteNavTiming | { readonly unavailable: string } | undefined): string[] {
	if (!timing) return [];
	if ('unavailable' in timing) return [`Navigation timing: ${timing.unavailable}`];
	const rows = navRows(timing);
	const listed = timing.cells.filter((c) => c.unavailable && !c.notChecked).map((c) => `  ${c.browser} ${c.profile} ${c.mode}: not measured (${c.unavailable})`);
	if (!rows.length) return [`Navigation timing: not measured: ${timing.cells.find((c) => c.unavailable)?.unavailable ?? 'no shared navigation to follow'}`];
	const order = (r: NavRow) => (HEADLINE.includes(r.mode) ? 0 : r.mode === 'instant' ? 2 : 1);
	const sorted = [...rows].sort((a, b) => order(a) - order(b));
	const tally = navTally(rows)
		.map((t) => `${PROFILE_WORDS[t.profile] ?? t.profile}: port faster in ${t.faster}, level in ${t.same}, slower in ${t.slower}${t.notChecked ? `, not checked in ${t.notChecked}` : ''}${t.medianGap !== undefined ? `, median gap ${t.medianGap > 0 ? '+' : ''}${t.medianGap} ms` : ''}`)
		.join('; ');
	const ms = (v: number | undefined) => (v === undefined ? '-' : `${Math.round(v)} ms`);
	const cost = rows.some((r) => r.verdict === 'slower' || r.verdict === 'same') ? aheadCost(timing) : undefined;
	const set = timing.set === 'full' ? 'every cell' : timing.set === 'named' ? `the ${timing.cells.length} cells named with --nav-timing-cell` : `the default ${timing.cells.length} cells, not the full matrix (--nav-timing-cells full)`;
	return [
		`Navigation timing, press to next page shown, original -> port, ${set} (${Math.round(timing.ms / 60000)} min): ${tally}`,
		...sorted.map((r) => `  ${r.browser} ${r.profile} ${r.mode} ${r.kind}: ${ms(r.old)} -> ${ms(r.new)}${r.gap !== undefined ? ` (${r.gap > 0 ? '+' : ''}${Math.round(r.gap)}, band ${Math.round(r.band)})` : ''}, served without a fetch ${pct(r.served.old)} -> ${pct(r.served.new)}, page data before the press ${kb(r.bytesBefore.old)} -> ${kb(r.bytesBefore.new)}, after ${kb(r.bytesAfter.old)} -> ${kb(r.bytesAfter.new)}${r.otherHosts ? `, data host not matched: ${r.otherHosts.join(', ')}` : ''}: ${r.verdict}${r.cause ? ` (${r.cause})` : ''}${r.reason ? ` (${r.reason})` : ''}`),
		...listed,
		...(timing.marks ? [] : ["  the installed router names no prefetch marks (PREFETCH_MARKS): 'budget spent' and 'prefetch ruled out' cannot be told apart from 'not prefetched'"]),
		...byteRows(timing).map((b) => `  page data fetched ahead of the presses, ${b.browser} ${b.profile}: ${kb(b.old)} -> ${kb(b.new)}${b.over ? `, over ${BYTES_REPORT_FACTOR}x (reported, not judged: no noise bound for bytes yet)` : ''}`),
		...(cost ? [`  fetching ahead as much as the original would cost the port about ${kb(cost.estimate)} before the presses (the original fetches ${kb(cost.old)}; a page's data is ${kb(cost.pageNew)} on the port, ${kb(cost.pageOld)} on the original)`] : []),
	];
}
