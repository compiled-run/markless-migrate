// The run's responsiveness headlines from each route's timings: text over measured times, no browser.
import type { ControlTiming, Responsiveness, ResponsivenessOptions, SpeedName, Worst } from './responsiveness.ts';
import type { ResponsivenessSummary, RouteResult, Slowest } from './types.ts';

export const DEFAULT_BUDGET_MS = 200;
export const DEFAULT_CPU = 4;

export const msText = (n: number | undefined) => (n === undefined ? 'no visible result' : `${n} ms`);

/** The run's slowest first interaction and navigation on each side, and each route's slowest control, for the headline. */
export function summarizeResponsiveness(routes: readonly RouteResult[], options: ResponsivenessOptions = {}): ResponsivenessSummary {
	const slowest = (kind: ControlTiming['kind']) => {
		const out: Partial<Record<SpeedName, Slowest>> = {};
		for (const r of routes) {
			for (const c of r.responsiveness?.controls ?? []) {
				if (c.kind !== kind) continue;
				for (const t of c.speeds) {
					const at = `${r.route}${r.role && r.role !== 'anonymous' ? ` as ${r.role}` : ''} ${c.control}`;
					const cur: Slowest = out[t.speed] ?? {};
					out[t.speed] = {
						...cur,
						...(t.oldMs !== undefined && t.oldMs > (cur.old ?? -1) ? { old: t.oldMs, oldAt: at } : {}),
						...(t.newMs !== undefined && t.newMs > (cur.new ?? -1) ? { new: t.newMs, newAt: at } : {}),
					};
				}
			}
		}
		return Object.keys(out).length ? out : undefined;
	};
	const interaction = slowest('in-page');
	const navigation = slowest('navigation');
	const serverOf = (side: 'old' | 'new') => Math.max(-1, ...routes.flatMap((r) => (r.responsiveness?.controls ?? []).flatMap((c) => c.speeds.flatMap((t) => t[side].flatMap((s) => (s.server ? [s.server.ttfb] : []))))));
	const server = { old: serverOf('old'), new: serverOf('new') };
	const latencyMs = routes.find((r) => r.responsiveness?.latencyMs !== undefined)?.responsiveness?.latencyMs;
	return {
		cpu: options.cpu ?? DEFAULT_CPU,
		budgetMs: options.budgetMs ?? DEFAULT_BUDGET_MS,
		...(latencyMs !== undefined ? { latencyMs } : {}),
		...(server.old >= 0 || server.new >= 0 ? { server: { ...(server.old >= 0 ? { old: server.old } : {}), ...(server.new >= 0 ? { new: server.new } : {}) } } : {}),
		...(interaction ? { interaction } : {}),
		...(navigation ? { navigation } : {}),
		routes: routes.flatMap((r) => (r.responsiveness ? [{ route: r.route, ...(r.role ? { role: r.role } : {}), ok: r.dimensions.responsiveness !== 'fail', ...(r.responsiveness.worst.interaction ? { interaction: r.responsiveness.worst.interaction } : {}), ...(r.responsiveness.worst.navigation ? { navigation: r.responsiveness.worst.navigation } : {}) }] : [])),
	};
}

const pair = (s: Slowest | undefined) => `old ${msText(s?.old)} → new ${msText(s?.new)}`;

/** `First interaction: old X ms → new Y ms (4x CPU)` and the same for navigation; desktop figures after. */
export function headlines(summary: ResponsivenessSummary): string[] {
	const lines: string[] = [];
	for (const [label, part] of [['First interaction', summary.interaction], ['Navigation', summary.navigation]] as const) {
		if (!part) continue;
		lines.push(`${label}: ${pair(part.throttled)} (${summary.cpu}x CPU)${part.desktop ? `; desktop ${pair(part.desktop)}` : ''}`);
	}
	if (lines.length && summary.latencyMs !== undefined) {
		const server = summary.server ? `; server time, apart: slowest page old ${msText(summary.server.old)} → new ${msText(summary.server.new)} (the checker's own fetch, network included)` : '';
		lines.push(`Network while timing: every response reaches either page ${summary.latencyMs} ms after it is asked for, from one copy fetched from the app beforehand${server}`);
	}
	return lines;
}

/** The slowest new control of a route at the throttled speed, old against new. */
export function worstLine(r: Responsiveness): string {
	const parts: string[] = [];
	const i = r.worst.interaction?.throttled;
	const n = r.worst.navigation?.throttled;
	if (i) parts.push(`slowest first interaction ${i.control}: old ${msText(i.old)} → new ${msText(i.new)}`);
	if (n) parts.push(`slowest navigation ${n.control}: old ${msText(n.old)} → new ${msText(n.new)}`);
	return `${parts.join('; ') || 'nothing timed'} (${r.cpu}x CPU)${r.notMeasured.length ? `; ${r.notMeasured.length} not timed` : ''}`;
}

export type RouteTiming = Responsiveness['worst'] & { readonly cpu: number };

/** The headlines across routes' last checks, as status shows them. */
export function timingHeadlines(routes: readonly { readonly route: string; readonly timing?: RouteTiming }[]): string[] {
	const timed = routes.filter((r) => r.timing);
	if (!timed.length) return [];
	const across = (kind: 'interaction' | 'navigation') => {
		const out: Partial<Record<SpeedName, Slowest>> = {};
		for (const r of timed) {
			for (const [speed, w] of Object.entries(r.timing![kind] ?? {}) as [SpeedName, Worst][]) {
				const cur: Slowest = out[speed] ?? {};
				const at = `${r.route} ${w.control}`;
				const old = w.slowestOld ?? w.old;
				out[speed] = { ...cur, ...(old !== undefined && old > (cur.old ?? -1) ? { old, oldAt: r.route } : {}), ...(w.new !== undefined && w.new > (cur.new ?? -1) ? { new: w.new, newAt: at } : {}) };
			}
		}
		return Object.keys(out).length ? out : undefined;
	};
	const interaction = across('interaction');
	const navigation = across('navigation');
	return headlines({ cpu: timed[0]!.timing!.cpu, budgetMs: DEFAULT_BUDGET_MS, ...(interaction ? { interaction } : {}), ...(navigation ? { navigation } : {}), routes: [] });
}
