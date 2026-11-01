// Whether a step's slower answer, or a view in between only the new page shows, is the page's or the machine's: samples of
// both sides taken in turn, judged by a one-sided test whose significance the route's candidates share (Holm's step-down).
import { mannWhitneyGreater, median, SIGNIFICANCE } from './load.ts';
import type { StepResult } from './journeys.ts';

/** How far apart two old runs of one step land, over the route's steps: what a busy machine alone does to an answer time. */
export function answerFloor(olds: readonly (readonly (readonly StepResult[])[])[]): number {
	const gaps: number[] = [];
	const journeys = Math.max(0, ...olds.map((o) => o.length));
	for (let j = 0; j < journeys; j++) {
		const steps = Math.max(0, ...olds.map((o) => o[j]?.length ?? 0));
		for (let k = 0; k < steps; k++) {
			const runs = olds.map((o) => o[j]?.[k]);
			if (runs.some((r) => !r || r.requests.length || r.writes?.length || r.reaction?.answeredMs === undefined)) continue;
			const times = runs.map((r) => r!.reaction!.answeredMs!);
			gaps.push(Math.max(...times) - Math.min(...times));
		}
	}
	if (!gaps.length) return 0;
	gaps.sort((a, b) => a - b);
	return gaps[Math.min(gaps.length - 1, Math.floor(0.95 * gaps.length))]!;
}

/** P(at least `bTrue` of the b runs show it) when showing it is no more likely on b than on a: one-sided Fisher exact. */
export function fisherGreater(aTrue: number, aRuns: number, bTrue: number, bRuns: number): number {
	const total = aTrue + bTrue;
	const choose = (n: number, k: number) => {
		if (k < 0 || k > n) return 0;
		let c = 1;
		for (let i = 1; i <= k; i++) c = (c * (n - k + i)) / i;
		return c;
	};
	const all = choose(aRuns + bRuns, total);
	let p = 0;
	for (let x = bTrue; x <= Math.min(total, bRuns); x++) p += (choose(bRuns, x) * choose(aRuns, total - x)) / all;
	return Math.min(1, p);
}

export type Samples = { readonly kind: 'answer'; readonly old: readonly number[]; readonly next: readonly number[] } | { readonly kind: 'shown'; readonly old: readonly boolean[]; readonly next: readonly boolean[] };

export interface Judged {
	readonly p: number;
	readonly alpha: number;
	readonly stands: boolean;
}

/**
 * Each candidate's samples judged one-sided, the route's candidates sharing one significance: an answer stands when the new
 * median is later than the old by more than `floorMs` and 1.5 times, a view in between when the new page shows it more often.
 */
export function judgeTiming(candidates: readonly Samples[], floorMs: number, beyond = (o: number, n: number) => n - o > floorMs && n > o * 1.5): Judged[] {
	const ps = candidates.map((c) => (c.kind === 'answer' ? mannWhitneyGreater(c.old, c.next) : fisherGreater(c.old.filter(Boolean).length, c.old.length, c.next.filter(Boolean).length, c.next.length)));
	const big = candidates.map((c) => c.kind === 'shown' || beyond(median(c.old), median(c.next)));
	const order = ps.map((p, i) => ({ p, i })).sort((a, b) => a.p - b.p);
	const out = new Array<Judged>(candidates.length);
	let rejecting = true;
	for (const [rank, { p, i }] of order.entries()) {
		const alpha = SIGNIFICANCE / (order.length - rank);
		rejecting &&= p < alpha;
		out[i] = { p, alpha, stands: rejecting && big[i]! };
	}
	return out;
}

/**
 * Candidates judged `size` at a time, the largest first, each batch sharing one significance: the next batch is sampled and
 * judged only when every candidate of the one before stood (serial gatekeeping), so a route with more real slowdowns than one
 * batch reports them all and a route of chance differences still stops at its first.
 */
export async function judgeInTurn(count: number, size: number, sample: (i: number) => Promise<Samples>, judge: (batch: readonly Samples[]) => Judged[]): Promise<{ readonly samples: Samples; readonly judged: Judged; readonly among: number }[]> {
	const out: { samples: Samples; judged: Judged; among: number }[] = [];
	for (let start = 0; start < count; start += size) {
		const batch: Samples[] = [];
		for (let i = start; i < Math.min(count, start + size); i++) batch.push(await sample(i));
		const judged = judge(batch);
		batch.forEach((samples, k) => out.push({ samples, judged: judged[k]!, among: batch.length }));
		if (!judged.every((j) => j.stands)) break;
	}
	return out;
}
