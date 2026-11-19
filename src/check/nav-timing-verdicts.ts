// Navigation timing verdicts: the port is red where a press reaches the next page later than on the original beyond the
// original's own noise, per browser, network, pointer behaviour and first visit or revisit, with the cause it shows.
import type { NavCell, NavClick, NavRun, RouteNavTiming, StepKind } from './nav-timing.ts';
import { minWorse } from './slow-network-verdicts.ts';
import { mannWhitneyGreater, median, noiseBand, SIGNIFICANCE } from './stats.ts';
import type { Failure } from './types.ts';

/** The port may fetch at most this many times the original's bytes before the presses, where the original fetches ahead at all. */
export const BYTES_FACTOR = 1.5;
/** Port data over this many times the original's, on a red row, names the payload. */
const PAYLOAD_FACTOR = 1.25;
/** A run the machine stalled in this long is left out: every time in it is skewed. */
const STALL_LIMIT_MS = 1000;
/** One 60 Hz frame: the paint is read on the frame after the content changes. */
const FRAME_MS = 17;

export type Cause = 'not prefetched' | 'prefetched too late' | 'prefetch cancelled' | 'refetched on revisit' | 'larger payload' | 'main thread' | 'unexplained';

export interface NavRow {
	readonly browser: string;
	readonly profile: string;
	readonly mode: string;
	readonly kind: StepKind;
	readonly old?: number;
	readonly new?: number;
	readonly samples: { readonly old: number; readonly new: number };
	/** new minus old, ms. */
	readonly gap?: number;
	/** How far the original's runs differ from themselves, or the least gap that counts (two frames, 5%), whichever is more. */
	readonly band: number;
	readonly p: number;
	readonly alpha?: number;
	readonly verdict: 'faster' | 'same' | 'slower' | 'unmeasured';
	readonly cause?: Cause;
	/** Shares of presses answered without a fetch of their own, and medians of bytes. */
	readonly served: { readonly old: number; readonly new: number };
	readonly bytesBefore: { readonly old: number; readonly new: number };
	readonly bytesAfter: { readonly old: number; readonly new: number };
	readonly dataAfter: { readonly old: number; readonly new: number };
	readonly mainThread?: { readonly old: number; readonly new: number };
	readonly ahead: { readonly old: Readonly<Record<NavClick['ahead'], number>>; readonly new: Readonly<Record<NavClick['ahead'], number>> };
	readonly reason?: string;
}

const usable = (runs: readonly NavRun[]) => runs.filter((r) => !r.error && (r.stalledMs ?? 0) < STALL_LIMIT_MS);
const clicksOf = (runs: readonly NavRun[], kind: StepKind) => usable(runs).flatMap((r) => r.clicks.filter((c) => c.kind === kind && c.ms !== undefined && !c.error));
const med = (values: readonly number[]) => (values.length ? median(values) : 0);
const share = (clicks: readonly NavClick[], test: (c: NavClick) => boolean) => (clicks.length ? clicks.filter(test).length / clicks.length : 0);
const aheadOf = (clicks: readonly NavClick[]) => ({ arrived: clicks.filter((c) => c.ahead === 'arrived').length, arriving: clicks.filter((c) => c.ahead === 'arriving').length, cancelled: clicks.filter((c) => c.ahead === 'cancelled').length, none: clicks.filter((c) => c.ahead === 'none').length });

/** The cause that explains the gap: what the original had that the port lacked, earliest in the press's path first. */
function causeOf(kind: StepKind, o: readonly NavClick[], n: readonly NavClick[], gap: number): Cause {
	const oServed = share(o, (c) => c.served);
	const nServed = share(n, (c) => c.served);
	if (kind === 'revisit' && oServed > nServed + 0.25) return 'refetched on revisit';
	if (oServed > nServed + 0.25 || share(o, (c) => c.ahead === 'arrived') > share(n, (c) => c.ahead === 'arrived') + 0.25) {
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

function row(cell: NavCell, kind: StepKind): NavRow {
	const o = clicksOf(cell.old, kind);
	const n = clicksOf(cell.new, kind);
	const ov = o.map((c) => c.ms!);
	const nv = n.map((c) => c.ms!);
	const base = {
		browser: cell.browser,
		profile: cell.profile,
		mode: cell.mode,
		kind,
		samples: { old: ov.length, new: nv.length },
		served: { old: share(o, (c) => c.served), new: share(n, (c) => c.served) },
		bytesBefore: { old: med(o.map((c) => c.bytesBefore)), new: med(n.map((c) => c.bytesBefore)) },
		bytesAfter: { old: med(o.map((c) => c.bytesAfter)), new: med(n.map((c) => c.bytesAfter)) },
		dataAfter: { old: med(o.map((c) => c.dataAfter)), new: med(n.map((c) => c.dataAfter)) },
		...(o.some((c) => c.mainThreadMs !== undefined) ? { mainThread: { old: med(o.flatMap((c) => (c.mainThreadMs !== undefined ? [c.mainThreadMs] : []))), new: med(n.flatMap((c) => (c.mainThreadMs !== undefined ? [c.mainThreadMs] : []))) } } : {}),
		ahead: { old: aheadOf(o), new: aheadOf(n) },
	};
	const noise = noiseBand(ov);
	if (!ov.length || !nv.length || noise === undefined) {
		const failedNew = cell.new.flatMap((r) => r.clicks.filter((c) => c.kind === kind && c.error)).length;
		return { ...base, band: 0, p: 1, verdict: !nv.length && ov.length && failedNew ? 'slower' : 'unmeasured', reason: !ov.length ? 'the original gave no timed press' : !nv.length ? `the port gave no timed press (${cell.new.flatMap((r) => r.clicks).find((c) => c.kind === kind && c.error)?.error ?? cell.new.find((r) => r.error)?.error ?? 'no run'})` : 'too few original presses to tell its noise' };
	}
	const om = median(ov);
	const nm = median(nv);
	const band = Math.max(noise, minWorse(om), FRAME_MS);
	const p = mannWhitneyGreater(ov, nv);
	const faster = om - nm > band && mannWhitneyGreater(nv, ov) < SIGNIFICANCE;
	const slower = nm - om > band && p < SIGNIFICANCE;
	return { ...base, old: om, new: nm, gap: nm - om, band, p, verdict: slower ? 'slower' : faster ? 'faster' : 'same', ...(slower ? { cause: causeOf(kind, o, n, nm - om) } : {}) };
}

/** Every measured row of the route; a slower row stays red only under Holm's step-down over the route's rows. */
export function navRows(timing: RouteNavTiming): NavRow[] {
	const rows = timing.cells.filter((c) => !c.unavailable).flatMap((c) => (['first', 'revisit'] as const).map((kind) => row(c, kind)));
	const family = rows.map((r, i) => ({ r, i })).filter(({ r }) => r.old !== undefined && r.new !== undefined).sort((a, b) => a.r.p - b.r.p);
	let rejecting = true;
	for (const [rank, { r, i }] of family.entries()) {
		const alpha = SIGNIFICANCE / (family.length - rank);
		rejecting &&= r.p < alpha;
		const slower = r.gap! > r.band && rejecting;
		rows[i] = { ...r, alpha, verdict: slower ? 'slower' : r.verdict === 'slower' ? 'same' : r.verdict, ...(slower ? { cause: r.cause ?? causeOf(r.kind, [], [], r.gap!) } : { cause: undefined }) };
	}
	return rows;
}

/** Per network profile: how many rows the port wins, ties and loses, and the median gap. */
export function navTally(rows: readonly NavRow[]): { readonly profile: string; readonly faster: number; readonly same: number; readonly slower: number; readonly medianGap?: number }[] {
	const profiles = [...new Set(rows.map((r) => r.profile))];
	return profiles.map((profile) => {
		const mine = rows.filter((r) => r.profile === profile && r.verdict !== 'unmeasured');
		const gaps = mine.flatMap((r) => (r.gap !== undefined ? [r.gap] : []));
		return { profile, faster: mine.filter((r) => r.verdict === 'faster').length, same: mine.filter((r) => r.verdict === 'same').length, slower: mine.filter((r) => r.verdict === 'slower').length, ...(gaps.length ? { medianGap: Math.round(median(gaps)) } : {}) };
	});
}

/** Bytes before the presses, per browser and network: the port's against the original's, where the original fetches ahead at all. */
export function byteRows(timing: RouteNavTiming): { readonly browser: string; readonly profile: string; readonly old: number; readonly new: number; readonly ok: boolean }[] {
	const seen = new Set<string>();
	const out: { browser: string; profile: string; old: number; new: number; ok: boolean }[] = [];
	for (const cell of timing.cells) {
		const key = `${cell.browser} ${cell.profile}`;
		if (cell.unavailable || seen.has(key)) continue;
		const perRun = (runs: readonly NavRun[]) => med(usable(runs).map((r) => r.clicks.reduce((s, c) => s + c.bytesBefore, 0)));
		const old = perRun(cell.old);
		const next = perRun(cell.new);
		if (!usable(cell.old).length || !usable(cell.new).length) continue;
		seen.add(key);
		out.push({ browser: cell.browser, profile: cell.profile, old, new: next, ok: old === 0 || next <= old * BYTES_FACTOR });
	}
	return out;
}

const kb = (b: number) => `${Math.round(b / 1024)} kB`;
const pct = (x: number) => `${Math.round(x * 100)}%`;
const PROFILE_WORDS: Readonly<Record<string, string>> = { fast: 'a fast line', 'cpu-4x': 'a fast line with the CPU 4x slower', 'slow-4g': 'slow 4G (1.6 Mbit/s, 150 ms)' };
const MODE_WORDS: Readonly<Record<string, string>> = { instant: 'pressed the instant the pointer arrives', 'dwell-100': 'pressed 100 ms after the pointer arrives', 'dwell-250': 'pressed 250 ms after the pointer arrives', 'dwell-400': 'pressed 400 ms after the pointer arrives', touch: 'tapped' };
const CAUSE_HINT: Readonly<Record<Cause, string>> = {
	'not prefetched': "The original had this page's data before the press and the port did not. Fetch it as early as the original does: the port's router prefetch setting (convert's report, `prefetch`) should start it on the same trigger.",
	'prefetched too late': "The port started fetching this page before the press but later than the original, so it was still arriving when the press came: start it on the original's trigger (in view, or at load) instead of on hover.",
	'prefetch cancelled': 'The port started fetching this page ahead and cancelled it before the press: a budget or a newer fetch stopped it. Let it finish.',
	'refetched on revisit': 'The original showed this page again without asking the network; the port fetched it again. Keep pages already shown and answer a revisit from them (or let the browser cache the page data).',
	'larger payload': "The port's data for this page is larger than the original's and its download is most of the gap. Send less with each page.",
	'main thread': "The port's main thread was busy longer between the press and the paint (long animation frames). Do less work to show the page.",
	unexplained: 'Neither prefetching, payload size nor main-thread work explains the gap; compare the two runs request by request.',
};

/** The route's red rows: each a press that reaches the next page later on the port beyond the original's own noise, and bytes before the presses over the factor. */
export function navTimingFailures(route: string, timing: RouteNavTiming | { readonly unavailable: string } | undefined): Failure[] {
	if (!timing || 'unavailable' in timing) return [];
	const out: Failure[] = [];
	for (const r of navRows(timing).filter((x) => x.verdict === 'slower')) {
		const cell = `${r.browser}, ${PROFILE_WORDS[r.profile] ?? r.profile}, link ${MODE_WORDS[r.mode] ?? r.mode}, ${r.kind === 'first' ? 'first visit' : 'revisit'}`;
		out.push({
			route,
			dimension: 'load',
			check: `navigation timing: ${cell}`,
			expected: r.old !== undefined ? `the next page shown ${Math.round(r.old)} ms after the press or sooner, the original's median of ${r.samples.old} presses (${pct(r.served.old)} answered from what it fetched ahead or kept, ${kb(r.bytesBefore.old)} fetched before each press, ${kb(r.dataAfter.old)} of page data after)` : 'a timed press',
			actual: r.new !== undefined ? `${Math.round(r.new)} ms, the median of ${r.samples.new}: ${Math.round(r.gap!)} ms later, beyond the ${Math.round(r.band)} ms the original's own runs differ by (p = ${r.p.toFixed(3)}); ${pct(r.served.new)} answered without a fetch, ${kb(r.bytesBefore.new)} before each press, ${kb(r.dataAfter.new)} of page data after${r.mainThread ? `, ${r.mainThread.new} ms of long frames against ${r.mainThread.old}` : ''}: ${r.cause}` : (r.reason ?? 'no timed press'),
			hint: CAUSE_HINT[r.cause ?? 'unexplained'],
		});
	}
	for (const b of byteRows(timing).filter((x) => !x.ok))
		out.push({
			route,
			dimension: 'load',
			check: `navigation timing: bytes before the presses, ${b.browser}, ${PROFILE_WORDS[b.profile] ?? b.profile}`,
			expected: `at most ${BYTES_FACTOR} times the original's ${kb(b.old)} fetched before the presses`,
			actual: `${kb(b.new)}, ${(b.new / b.old).toFixed(1)} times`,
			hint: 'The port fetches more ahead of the presses than the original, so a visitor on a metered or slow link pays for it. Send less with each page fetched ahead.',
		});
	return out;
}

const HEADLINE = ['dwell-250', 'touch'];

/**
 * What fetching ahead as much as the original would cost the port before the presses: the original's bytes ahead, scaled by
 * how large a page's data is on each side (from presses that fetched it). Undefined when either side never fetched one.
 */
export function aheadCost(timing: RouteNavTiming): { readonly old: number; readonly estimate: number; readonly pageOld: number; readonly pageNew: number } | undefined {
	const pages = (side: 'old' | 'new') => timing.cells.flatMap((c) => usable(c[side]).flatMap((r) => r.clicks.filter((x) => x.fetched && x.dataAfter > 0).map((x) => x.dataAfter)));
	const po = pages('old');
	const pn = pages('new');
	const bytes = byteRows(timing);
	if (!po.length || !pn.length || !bytes.length) return undefined;
	const old = median(bytes.map((b) => b.old));
	return { old, estimate: Math.round((old * median(pn)) / median(po)), pageOld: median(po), pageNew: median(pn) };
}

/** The route's table, human-like mouse and touch first (what a visitor feels), the instant press last as the worst case. */
export function navTimingLines(timing: RouteNavTiming | { readonly unavailable: string } | undefined): string[] {
	if (!timing) return [];
	if ('unavailable' in timing) return [`Navigation timing: not measured: ${timing.unavailable}`];
	const rows = navRows(timing);
	if (!rows.length) return [`Navigation timing: not measured: ${timing.cells.find((c) => c.unavailable)?.unavailable ?? 'no shared navigation to follow'}`];
	const order = (r: NavRow) => (HEADLINE.includes(r.mode) ? 0 : r.mode === 'instant' ? 2 : 1);
	const sorted = [...rows].sort((a, b) => order(a) - order(b));
	const tally = navTally(rows)
		.map((t) => `${PROFILE_WORDS[t.profile] ?? t.profile}: port faster in ${t.faster}, level in ${t.same}, slower in ${t.slower}${t.medianGap !== undefined ? `, median gap ${t.medianGap > 0 ? '+' : ''}${t.medianGap} ms` : ''}`)
		.join('; ');
	const ms = (v: number | undefined) => (v === undefined ? '-' : `${Math.round(v)} ms`);
	return [
		`Navigation timing, press to next page shown, original -> port (${Math.round(timing.ms / 60000)} min): ${tally}`,
		...sorted.map((r) => `  ${r.browser} ${r.profile} ${r.mode} ${r.kind}: ${ms(r.old)} -> ${ms(r.new)}${r.gap !== undefined ? ` (${r.gap > 0 ? '+' : ''}${Math.round(r.gap)}, noise ${Math.round(r.band)})` : ''}, served without a fetch ${pct(r.served.old)} -> ${pct(r.served.new)}, before the press ${kb(r.bytesBefore.old)} -> ${kb(r.bytesBefore.new)}, after ${kb(r.bytesAfter.old)} -> ${kb(r.bytesAfter.new)}: ${r.verdict}${r.cause ? ` (${r.cause})` : ''}${r.reason ? ` (${r.reason})` : ''}`),
		...byteRows(timing).map((b) => `  bytes before the presses, ${b.browser} ${b.profile}: ${kb(b.old)} -> ${kb(b.new)}${b.ok ? '' : `, over ${BYTES_FACTOR}x`}`),
		...costLine(timing, rows),
	];
}

function costLine(timing: RouteNavTiming, rows: readonly NavRow[]): string[] {
	if (!rows.some((r) => r.verdict === 'slower' || r.verdict === 'same')) return [];
	const cost = aheadCost(timing);
	if (!cost) return [];
	return [`  fetching ahead as much as the original would cost the port about ${kb(cost.estimate)} before the presses (the original fetches ${kb(cost.old)}; a page's data is ${kb(cost.pageNew)} on the port, ${kb(cost.pageOld)} on the original), ${cost.old ? `${(cost.estimate / cost.old).toFixed(1)} times the original's, ${cost.estimate <= cost.old * BYTES_FACTOR ? 'within' : 'over'} the ${BYTES_FACTOR}x limit` : 'where the original fetches nothing ahead'}`];
}

/** Why a timed route has no verdict where it should: the measurement failed, or a side's runs left a row without presses to compare. */
export function navTimingUnmeasured(timing: RouteNavTiming | { readonly unavailable: string; readonly failed?: true } | undefined): string | undefined {
	if (!timing) return undefined;
	if ('unavailable' in timing) return timing.failed ? `navigation timing ${timing.unavailable}` : undefined;
	// A press the original itself could not make (no link to it at this width) is not a row to compare; too few to tell its noise is.
	const row = navRows(timing).find((r) => r.verdict === 'unmeasured' && r.samples.old > 0 && r.samples.new > 0);
	return row ? `navigation timing not measured in ${row.browser} ${row.profile} ${row.mode} ${row.kind}: ${row.reason}` : undefined;
}
