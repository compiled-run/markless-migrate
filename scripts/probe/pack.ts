// Shards of the dead-control probe packed by what each route cost the last run, so no worker is left with the slow pages.

/** Routes split into `count` bins, longest first onto the least loaded bin; a route not yet measured counts as the median. */
export function packByCost(routes: readonly string[], costs: ReadonlyMap<string, number>, count: number): string[][] {
	const known = routes.map((r) => costs.get(r)).filter((c): c is number => c !== undefined).sort((a, b) => a - b);
	const fallback = known.length ? known[known.length >> 1]! : 1;
	const cost = (r: string) => costs.get(r) ?? fallback;
	const index = new Map(routes.map((r, i) => [r, i]));
	const order = [...routes].sort((a, b) => cost(b) - cost(a) || index.get(a)! - index.get(b)!);
	const load = Array.from({ length: count }, () => 0);
	const bins: string[][] = Array.from({ length: count }, () => []);
	for (const route of order) {
		let at = 0;
		for (let i = 1; i < count; i++) if (load[i]! < load[at]!) at = i;
		load[at]! += cost(route);
		bins[at]!.push(route);
	}
	return bins.map((b) => b.sort((x, y) => index.get(x)! - index.get(y)!));
}

/** Each route's time in a probe run's JSONL lines for one engine; a route written twice keeps its longest. */
export function costsFrom(lines: Iterable<string>, engine: string): Map<string, number> {
	const costs = new Map<string, number>();
	for (const line of lines) {
		let row: { route?: unknown; engine?: unknown; ms?: unknown };
		try {
			row = JSON.parse(line) as typeof row;
		} catch {
			continue;
		}
		if (row?.engine !== engine || typeof row.route !== 'string' || typeof row.ms !== 'number') continue;
		costs.set(row.route, Math.max(row.ms, costs.get(row.route) ?? 0));
	}
	return costs;
}
