// A drawing's facts (convert's ChartPlan writes them on data-mm-facts) as the recharts parts read them: the hit ranges a
// category axis decides (`gt`, its states in tick order) and the tooltip places the arrow keys hold are left for this to rebuild.

type Triple = readonly [number, number, number];

interface Written {
	readonly v?: readonly [number, number, number, number];
	readonly m?: string;
	readonly l?: string;
	readonly a?: readonly ({ readonly t: string; readonly num?: true; readonly c: readonly number[] } | null)[];
	readonly g?: readonly Triple[];
	readonly gt?: readonly number[];
	readonly p?: readonly (readonly [number | null, number | null])[];
	readonly k?: readonly Triple[];
}

/** recharts' calculateActiveTickIndex ranges: halfway between neighbouring ticks' coordinates, the ends at the plot's edges. */
function categoryRanges(f: Written): Triple[] {
	const horizontal = (f.l ?? 'horizontal') === 'horizontal';
	const axis = f.a?.find((a) => a && !a.num && a.t === (horizontal ? 'xAxis' : 'yAxis'));
	if (!axis || !f.v || !f.gt) return [];
	const [start, length] = horizontal ? [f.v[0], f.v[2]] : [f.v[1], f.v[3]];
	const c = [...axis.c].sort((a, b) => a - b);
	return f.gt.map((state, i) => [i === 0 ? start : (c[i]! + c[i - 1]!) / 2, i === c.length - 1 ? start + length : (c[i]! + c[i + 1]!) / 2, state]);
}

export function expandFacts<T extends object>(facts: T): T & { g: readonly Triple[]; p: readonly (readonly [number | null, number | null])[] } {
	const f = facts as Written;
	const g = f.g ?? categoryRanges(f);
	let p = f.p;
	if (!p) {
		const states = Math.max(0, ...g.map((s) => s[2] + 1), ...(f.k ?? []).map((e) => e[0] + 1));
		p = Array.from({ length: states }, (_, s) => {
			const key = f.k?.find((e) => e[0] === s);
			const x = key?.[1] ?? null;
			const y = key?.[2] ?? null;
			return f.m === 'x' ? [x, null] : f.m === 'y' ? [null, y] : [x, y];
		});
	}
	return { ...facts, g, p };
}
