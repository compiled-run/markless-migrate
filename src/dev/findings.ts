/** One difference a probe found between the original and the port on a route. */
export interface Finding {
	readonly route: string;
	readonly control: string;
	readonly kind: string;
	readonly width?: number;
	readonly expected: string;
	readonly actual: string;
	readonly strip?: string;
}

/** A probe's record of one route: how many controls it used, in how long, and what differed. */
export interface RouteProbe {
	readonly route: string;
	readonly tried: number;
	readonly ms: number;
	readonly findings: readonly Finding[];
}

export function parseProbeLines(text: string): RouteProbe[] {
	return text
		.split('\n')
		.filter((l) => l.trim().startsWith('{'))
		.map((l) => JSON.parse(l) as RouteProbe);
}

/** What makes a finding the same one in the next run: where and what, not the measured values. */
export const findingKey = (f: Finding): string => `${f.route}|${f.kind}|${f.control}|${f.width ?? ''}`;

export interface RouteDiff {
	readonly route: string;
	readonly now: readonly Finding[];
	readonly fixed: readonly Finding[];
	readonly added: readonly Finding[];
	readonly tried: number;
	readonly ms: number;
}

/** Each route's findings against the previous run's on the same route; with none before, nothing counts as fixed or new. */
export function diffRuns(now: readonly RouteProbe[], before: readonly RouteProbe[] | undefined): RouteDiff[] {
	return now.map((r) => {
		const was = before?.find((b) => b.route === r.route);
		const wasKeys = new Set(was?.findings.map(findingKey));
		const nowKeys = new Set(r.findings.map(findingKey));
		return {
			route: r.route,
			now: r.findings,
			fixed: was ? was.findings.filter((f) => !nowKeys.has(findingKey(f))) : [],
			added: was ? r.findings.filter((f) => !wasKeys.has(findingKey(f))) : [],
			tried: r.tried,
			ms: r.ms,
		};
	});
}

const line = (f: Finding) => `${f.kind}  ${f.control}${f.width ? ` at ${f.width} px` : ''}: ${f.expected}  ->  ${f.actual}${f.strip ? `  [strip ${f.strip}]` : ''}`;

/** The lines a person reads after a run: per route, the counts, what was fixed, what is new, then what stays (up to `limit`). */
export function formatDiffs(diffs: readonly RouteDiff[], limit = 25): string {
	const out: string[] = [];
	for (const d of diffs) {
		const change = d.fixed.length || d.added.length ? ` (${d.fixed.length} fixed, ${d.added.length} new)` : '';
		out.push(`${d.route}: ${d.now.length} differences from the original, ${d.tried} controls used in ${Math.round(d.ms / 1000)} s${change}`);
		for (const f of d.fixed) out.push(`  fixed  ${line(f)}`);
		for (const f of d.added) out.push(`  NEW    ${line(f)}`);
		const added = new Set(d.added.map(findingKey));
		const still = d.now.filter((f) => !added.has(findingKey(f)));
		for (const f of still.slice(0, limit)) out.push(`         ${line(f)}`);
		if (still.length > limit) out.push(`         ... ${still.length - limit} more in the run's findings file`);
	}
	return `${out.join('\n')}\n`;
}
