// The statistics the timing verdicts share: pure arithmetic over samples, so a judge can use it without loading what measures them.
/** One-sided significance a worse median needs before it counts: below it the two sides' runs overlap as much as noise does. */
export const SIGNIFICANCE = 0.05;

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

/** The 90th percentile of the gap between the medians of two halves of `old`, over every way to split its runs: how far apart the old page lands from itself. */
export function noiseBand(old: readonly number[]): number | undefined {
	if (old.length < 4) return undefined;
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
	return gaps[Math.min(gaps.length - 1, Math.floor(0.9 * gaps.length))]!;
}
