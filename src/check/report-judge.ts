// A run's report from what it observed: each route's judged result, then the run's own rows (its plan, sign-ins, coverage,
// navigation, endpoints and page loads). The live run and `check judge` both build the report here.
import { accountSource } from './inventory-compare.ts';
import { applyAccepted, type Accept } from './accepted.ts';
import type { AutomaticRule } from './automatic.ts';
import { withFailures } from './compare.ts';
import { mergeCoverage } from './coverage.ts';
import { pinnedBy, pinnedSummary, type FreezeOptions } from './freeze.ts';
import type { NavigationResult } from './nav-parity.ts';
import { notExercised, partialResult } from './route-judge.ts';
import { summarizeResponsiveness } from './responsiveness-summary.ts';
import { routeState } from './route-state.ts';
import type { ResponsivenessOptions } from './responsiveness.ts';
import type { SourceFacts } from './source-facts.ts';
import type { TemplateGroup } from './templates.ts';
import { loadFailures, psiFailures } from './load-verdicts.ts';
import { networkFailures } from './slow-network-verdicts.ts';
import { ANONYMOUS, type Dimension, type Failure, type LoginResult, type Report, type RouteCoverage, type RouteNavigation, type RouteResult, type Viewport } from './types.ts';
import type { RouteLoad } from './load.ts';
import type { RouteContext } from './route-judge.ts';
import type { WasteReport } from './waste.ts';

/** What a run was asked to check and how: the inputs its judges read beside the rows. */
export interface RunHeader {
	readonly old: string;
	readonly new: string;
	readonly startedAt: string;
	readonly routes: readonly string[];
	readonly endpoints: readonly string[];
	readonly redirects: readonly string[];
	readonly viewports: readonly Viewport[];
	readonly locales: readonly string[];
	readonly freeze: FreezeOptions | false;
	readonly sendWrites: boolean;
	readonly source?: SourceFacts;
	readonly oldRouting?: 'hash';
	readonly data?: { readonly mode: 'record' | 'replay'; readonly dir: string; readonly liveWindowMs?: number };
	readonly roles: readonly (string | undefined)[];
	readonly unchecked?: Report['unchecked'];
	readonly accepted: readonly Accept[];
	readonly automaticOff: readonly AutomaticRule[];
	readonly only?: 'load' | 'embeds' | 'probes';
	readonly stages: RouteContext['stages'] & { readonly load: boolean; readonly navigation: boolean };
	readonly responsiveness?: ResponsivenessOptions;
	readonly coverage: boolean;
	readonly partial?: { readonly total: number | null };
	readonly cache: boolean;
	readonly auth: boolean;
	/** A shard of a site's run, its shared layout controls left to the merge (`shareLayoutLater`). */
	readonly sharedLater?: true;
}

/** The run's own observations, in the order the run made them; a route's result is judged from its own rows. */
export type RunEvent =
	| { readonly kind: 'plan'; readonly endpoints: readonly string[]; readonly redirects: readonly string[]; readonly groups: readonly TemplateGroup[] }
	| { readonly kind: 'login'; readonly role: string; readonly login: LoginResult; readonly signedIn: boolean }
	| { readonly kind: 'embeds only'; readonly role?: string; readonly route: string; readonly out: { readonly failures: readonly Failure[]; readonly shots: RouteResult['shots'] } }
	| { readonly kind: 'coverage'; readonly coverage: RouteCoverage }
	| { readonly kind: 'navigation'; readonly result: NavigationResult }
	| { readonly kind: 'endpoint'; readonly role?: string; readonly route: string; readonly result: RouteResult }
	| { readonly kind: 'redirect'; readonly role?: string; readonly route: string; readonly result: RouteResult }
	| { readonly kind: 'loads'; readonly loads: readonly (readonly [string, RouteLoad])[] }
	| { readonly kind: 'footer'; readonly pinned: readonly string[]; readonly cache?: Report['cache']; readonly wasteReferences: readonly WasteReport[] }
	/** Results `check --reuse` kept from earlier runs and added to the report after the run. */
	| { readonly kind: 'reused'; readonly routes: readonly RouteResult[] };

/** Template groups of more than one page, by member: a member that is not its group's representative is checked light. */
export function templateGroups(groups: readonly TemplateGroup[]): { readonly groupOf: ReadonlyMap<string, TemplateGroup>; readonly light: (route: string) => boolean } {
	const groupOf = new Map(groups.filter((g) => g.members.length > 1).flatMap((g) => g.members.map((m) => [m, g] as const)));
	return { groupOf, light: (route) => groupOf.has(route) && groupOf.get(route)!.representative !== route };
}

export function withTemplate(groupOf: ReadonlyMap<string, TemplateGroup>, result: RouteResult): RouteResult {
	const group = groupOf.get(result.route);
	return group ? { ...result, template: { pattern: group.pattern, representative: group.representative, members: group.members.length } } : result;
}

export function asRole(result: RouteResult, role: string | undefined): RouteResult {
	return role ? { ...result, role, failures: result.failures.map((f) => ({ ...f, role })) } : result;
}

/** A checked page's result as the report keeps it: in its template group, as its role, after the failures its recorded data could not give. */
export function routeOutcome(groupOf: ReadonlyMap<string, TemplateGroup>, done: RouteResult, role: string | undefined, dataFailures: readonly Failure[]): RouteResult {
	const result = withTemplate(groupOf, done);
	return asRole(dataFailures.length ? withFailures(result, [...dataFailures, ...result.failures]) : result, role);
}

/** A run of one part leaves endpoints and redirects to the full check; they are listed as that part's, not as not checked. */
export function outOfPart(endpoints: readonly string[], redirects: readonly string[], only: 'load' | 'embeds' | 'probes', role: string | undefined): RouteResult[] {
	return [...endpoints, ...redirects].map((route) => asRole({ ...partialResult(route, [], []), ok: true, only }, role));
}

/** `check --only embeds`: one page's embed step as its result, nothing else compared. */
export function embedsOnly(groupOf: ReadonlyMap<string, TemplateGroup>, route: string, out: { readonly failures: readonly Failure[]; readonly shots: RouteResult['shots'] }, role: string | undefined): RouteResult {
	const result = { ...partialResult(route, out.failures, [...new Set(out.failures.map((f) => f.dimension as Dimension))]), shots: out.shots, only: 'embeds' as const };
	return asRole(withTemplate(groupOf, { ...result, ok: out.failures.length === 0 }), role);
}

/** Each shared layout control is exercised by the first route of the run that has it; the others carry its verdict. */
export function shareLayout(results: readonly RouteResult[]): RouteResult[] {
	const byRoute = new Map(results.map((r) => [r.route, r]));
	return results.map((r) => {
		const shared = r.coverage?.elements.filter((e) => e.shared) ?? [];
		if (!shared.length) return r;
		const added: Failure[] = [];
		let exercised = r.coverage!.exercised;
		for (const e of shared) {
			const owner = byRoute.get(e.shared!);
			const theirs = owner?.coverage?.elements.find((o) => o.signature === e.signature);
			if (!theirs || !theirs.by) {
				added.push(notExercised(r.route, `${e.element}, shared with ${e.shared}`, theirs?.reason ?? `${e.shared} was not compared, so its shared controls were not exercised`));
				continue;
			}
			exercised++;
			const names = theirs.journeys ?? [];
			for (const f of owner!.failures) if (names.some((n) => f.check === n || f.check.startsWith(`${n} (step `))) added.push({ ...f, route: r.route, check: `${f.check}, in the layout shared with ${e.shared}` });
		}
		const coverage = { ...r.coverage!, exercised };
		return added.length ? withFailures({ ...r, coverage }, [...r.failures, ...added]) : { ...r, coverage };
	});
}

/** Adds the navigation check's failures and what it compared to each route's result: destinations name their entry pages, routes of the same shape the page that stood for them. */
export function applyNavigation(results: readonly RouteResult[], nav: NavigationResult): RouteResult[] {
	const by = new Map<string, Failure[]>();
	for (const f of nav.failures) by.set(f.route, [...(by.get(f.route) ?? []), f]);
	const covered = new Map<string, RouteNavigation>();
	for (const d of nav.destinations) {
		const pairs = nav.pairs.filter((p) => p.to === d.route && p.inPlace && !p.swappedByPage);
		if (!pairs.length) continue;
		covered.set(d.route, { from: pairs.map((p) => `${p.from}${p.control ? ` after ${p.control}` : ''}`) });
		for (const r of d.represents) covered.set(r, { from: [], representedBy: d.route });
	}
	return results.map((r) => {
		const navigation = covered.get(r.route);
		const added = by.get(r.route) ?? [];
		if (!navigation && !added.length) return r;
		const shots = nav.shots.filter((s) => s.route === r.route).map((s) => s.shot);
		return withFailures(r, [...r.failures, ...added], { navigation: navigation ?? { from: [] }, ...(shots.length ? { shots: [...r.shots, ...shots] } : {}) });
	});
}

/** One role's pages after the run-wide comparisons over them: shared layouts, then in-place navigation. A shard of a site's run (`later`) leaves shared layouts to the merge of every shard, where each owner's results are. */
export function roleCompared(checked: readonly RouteResult[], navigated: NavigationResult | undefined, later = false): RouteResult[] {
	const shared = later ? checked.map((r) => (r.coverage?.elements.some((e) => e.shared) ? { ...r, sharedLater: true as const } : r)) : shareLayout(checked);
	return navigated ? applyNavigation(shared, navigated) : shared;
}

/** What `shareLayoutLater` reads and writes of a route: a run's result or its JSON in a shard's report. */
type Sharing = Pick<RouteResult, 'route' | 'role' | 'ok' | 'failures' | 'coverage' | 'dimensions' | 'sharedLater'> & { readonly state?: string };

/**
 * The merge of a site's shards: each route that left its shared layout controls to their owners carries the owners' verdicts,
 * whichever shard each owner was checked in, as `shareLayout` does within one run. A copy keeps the owner's acceptance.
 */
export function shareLayoutLater<R extends Sharing>(routes: readonly R[]): R[] {
	const key = (role: string | undefined, route: string) => `${role ?? ANONYMOUS}\u0000${route}`;
	const byRoute = new Map(routes.map((r) => [key(r.role, r.route), r]));
	return routes.map((r) => {
		if (!r.sharedLater) return r;
		const { sharedLater: _, ...rest } = r;
		const added: Failure[] = [];
		let exercised = r.coverage!.exercised;
		for (const e of r.coverage!.elements.filter((x) => x.shared)) {
			const owner = byRoute.get(key(r.role, e.shared!));
			const theirs = owner?.coverage?.elements.find((o) => o.signature === e.signature);
			if (!theirs || !theirs.by) {
				added.push(notExercised(r.route, `${e.element}, shared with ${e.shared}`, theirs?.reason ?? `${e.shared} was not compared, so its shared controls were not exercised`));
				continue;
			}
			exercised++;
			const names = theirs.journeys ?? [];
			for (const { id: _id, ...f } of owner!.failures) if (names.some((n) => f.check === n || f.check.startsWith(`${n} (step `))) added.push({ ...f, route: r.route, check: `${f.check}, in the layout shared with ${e.shared}` });
		}
		const open = added.filter((f) => !f.accepted);
		const dimensions = { ...r.dimensions };
		for (const f of open) if (f.dimension in dimensions) dimensions[f.dimension as Dimension] = 'fail';
		const out = { ...rest, coverage: { ...r.coverage!, exercised }, failures: [...r.failures, ...added], dimensions, ok: r.ok && open.length === 0 } as unknown as R;
		return r.state === undefined ? out : ({ ...out, state: routeState(out as unknown as RouteResult) } as R);
	});
}

const anonymous = (r: RouteResult) => !r.role || r.role === ANONYMOUS;

/** The routes page load measured: anonymous, pages of their own (not a template group's lighter members), compared. */
export function loadable(routes: readonly RouteResult[], allPages: readonly string[], light: (route: string) => boolean): string[] {
	return [...new Set(routes.filter((r) => anonymous(r) && !r.endpoint && !r.blocked && !r.infrastructure && !r.notPorted && !light(r.route) && allPages.includes(r.route)).map((r) => r.route))];
}

/** Each anonymous route with its page load measured, and the failures that measurement found. */
export function applyLoads(routes: readonly RouteResult[], loads: ReadonlyMap<string, RouteLoad>): RouteResult[] {
	return routes.map((r) => {
		const load = anonymous(r) ? loads.get(r.route) : undefined;
		if (!load) return r;
		// Real PageSpeed Insights, when it answered, is the gate; the calibrated lab stands in for it otherwise.
		const failures = [...r.failures, ...(psiFailures(r.route, load.psi) ?? loadFailures(r.route, load)), ...networkFailures(r.route, load.network)];
		return r.only ? { ...r, load, failures, ok: failures.length === 0, dimensions: { ...r.dimensions, load: failures.length ? 'fail' : 'pass' } } : withFailures(r, failures, { load });
	});
}

/** The report of a run: its routes and sign-ins, what it pinned, and the accepted differences applied. */
export function finishReport(header: RunHeader, routes: readonly RouteResult[], logins: readonly LoginResult[], coverages: readonly RouteCoverage[], navigation: readonly NavigationResult[], groups: readonly TemplateGroup[], allPages: readonly string[], footer: Extract<RunEvent, { kind: 'footer' }>): Report {
	const freeze = header.freeze;
	const sources = header.source?.nondeterminism.map((f) => ({ ...f, pinned: pinnedBy(`${f.kind} ${f.what ?? ''}`, f.side, freeze) }));
	const coverage = header.coverage ? mergeCoverage(coverages) : undefined;
	const checkedCount = new Set([...header.routes, ...header.redirects, ...header.endpoints]).size;
	const grouped = groups.filter((g) => g.members.length > 1 && g.members.some((m) => allPages.includes(m)));
	// A run of some routes cannot tell a source behaviour no checked page showed from one on a page it left out.
	const inventory = header.source?.behaviours?.length && header.stages.behaviours && !header.partial ? accountSource(header.source.behaviours, routes) : undefined;
	return applyAccepted(
		{
			version: 1,
			old: header.old,
			new: header.new,
			startedAt: header.startedAt,
			ok: routes.every((r) => r.ok) && logins.every((l) => l.ok),
			routes,
			pinned: [...pinnedSummary(freeze), ...footer.pinned],
			...(sources ? { sources } : {}),
			...(header.data ? { data: header.data } : {}),
			writes: header.sendWrites ? 'sent' : 'held back',
			...(header.auth ? { roles: header.roles as string[], logins: [...logins] } : {}),
			...(header.unchecked?.length ? { unchecked: header.unchecked } : {}),
			...(header.responsiveness ? { responsiveness: summarizeResponsiveness(routes, header.responsiveness) } : {}),
			...(coverage ? { coverage } : {}),
			...(inventory ? { inventory: { source: inventory.items, failures: [...inventory.failures] } } : {}),
			...(header.partial ? { partial: { checked: checkedCount, total: header.partial.total } } : {}),
			...(grouped.length ? { templates: { groups: grouped.map((g) => ({ pattern: g.pattern, representative: g.representative, members: g.members })) } } : {}),
			...(footer.wasteReferences.length ? { wasteReferences: footer.wasteReferences } : {}),
			...(footer.cache ? { cache: footer.cache } : {}),
			...(navigation.length ? { navigation: { destinations: navigation.reduce((n, r) => n + r.destinations.length, 0), pairs: navigation.reduce((n, r) => n + r.pairs.length, 0), inPlace: navigation.reduce((n, r) => n + r.pairs.filter((p) => p.inPlace).length, 0), loads: navigation.reduce((n, r) => n + r.loads, 0), ms: navigation.reduce((n, r) => n + r.ms, 0) } } : {}),
		},
		header.accepted,
		header.automaticOff,
	);
}

/** report.json as check writes it: each route's state, its visual diffs' files, and its journeys counted. */
export function jsonReport(report: Report, diffs: Readonly<Record<string, string[]>> = {}) {
	return { ...report, routes: report.routes.map(({ visualDiffs: _, shots: __, filmstrips: ___, journeys, storedJourneys, ...route }) => ({ ...route, state: routeState(route), visualDiffs: diffs[route.route] ?? [], journeys: journeys?.length ?? storedJourneys?.names.length ?? 0 })) };
}
