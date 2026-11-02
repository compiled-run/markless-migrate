// `check judge`: a run's report again from its recorded observations alone. Each route is judged by the same flow a live
// check runs (route-judge.ts), its observations answered from its rows, and the report assembled as a live run assembles it.
import type { Observed } from '../data/observations.ts';
import { routeKey, type RouteKey } from '../data/observations.ts';
import { replaying, type Row } from '../data/rows.ts';
import { forgetFailures } from './compare.ts';
import { applyLoads, asRole, embedsOnly, finishReport, outOfPart, roleCompared, routeOutcome, templateGroups, withTemplate, type RunEvent, type RunHeader } from './report-judge.ts';
import { deadlineResult, loadTimeout, partialResult, probesOnly, roleCheck, stopped, Unobserved, type Deadline, type RouteContext } from './route-judge.ts';
import type { TemplateGroup } from './templates.ts';
import { ANONYMOUS, type Failure, type LoginResult, type Report, type RouteCoverage, type RouteResult } from './types.ts';
import type { NavigationResult } from './nav-parity.ts';

/** What a route's judge reads of the run's header. */
export function headerContext(header: RunHeader, route: string, role: string | undefined, light: boolean): RouteContext {
	return {
		route,
		...(role ? { role } : {}),
		viewports: header.viewports,
		locales: header.locales,
		light,
		origins: { old: header.old, new: header.new },
		frozen: Boolean(header.freeze),
		...(header.source ? { source: header.source } : {}),
		writes: { old: { sendWrites: header.sendWrites }, new: { sendWrites: header.sendWrites } },
		...(header.oldRouting ? { oldRouting: header.oldRouting } : {}),
		stages: header.stages,
	};
}

/** One page's result as one role, from its rows: the check's own flow, stopped where its deadline stopped it, or the outcome its rows record. */
export async function judgeRouteRows(header: RunHeader, route: string, role: string | undefined, light: boolean, groupOf: ReadonlyMap<string, TemplateGroup>, rows: readonly Row[]): Promise<RouteResult> {
	const special = (stage: string) => rows.find((r) => r.stage === stage);
	const resumed = special('resumed');
	if (resumed) return resumed.value as RouteResult;
	const origins = [header.old, header.new] as const;
	const outcome = special('outcome');
	let done: RouteResult;
	if (outcome) done = stopped(route, new Error(`${String(outcome.value)}, on both tries`), origins);
	else {
		let latest: RouteResult | undefined;
		try {
			const first = await roleCheck(replaying(rows), { ...headerContext(header, route, role, light), reached: (result) => void (latest = result) });
			const timing = special('timing');
			done = timing ? { ...first, timing: timing.value as NonNullable<RouteResult['timing']> } : first;
		} catch (error) {
			const deadline = special('deadline');
			if (error instanceof Unobserved && deadline) done = deadlineResult(route, deadline.value as Deadline, latest?.failures ?? []);
			else if (error instanceof Unobserved) throw new Error(`${route}${role ? ` as ${role}` : ''}: its rows end before its check did (no ${error.stage} observation), and no deadline stopped it`);
			else done = loadTimeout(route, error, origins) ?? stopped(route, error, origins);
		}
	}
	forgetFailures(done.failures);
	return routeOutcome(groupOf, done, role, (special('data')?.value as Failure[] | undefined) ?? []);
}

/** The run's report from its observations, as the live run built it. */
export async function judgeObserved(observed: Observed): Promise<Report> {
	const { header, events } = observed;
	let at = 0;
	const next = <K extends RunEvent['kind']>(kind: K): Extract<RunEvent, { kind: K }> => {
		const event = events[at];
		if (event?.kind !== kind) throw new Error(`the run's events hold ${event?.kind ?? 'nothing more'} where its report reads ${kind}`);
		at++;
		return event as Extract<RunEvent, { kind: K }>;
	};
	const rowsOf = (key: RouteKey): readonly Row[] => {
		const rows = observed.routes.get(routeKey(key));
		if (!rows) throw new Error(`no rows of ${key.route}${key.role ? ` as ${key.role}` : ''}`);
		return rows;
	};
	const plan = next('plan');
	const allPages = header.routes.filter((route) => !plan.endpoints.includes(route) && !plan.redirects.includes(route));
	const { groupOf, light } = templateGroups(plan.groups);
	let routes: RouteResult[] = [];
	const logins: LoginResult[] = [];
	const coverages: RouteCoverage[] = [];
	const navigation: NavigationResult[] = [];
	for (const role of header.roles) {
		if (header.auth && role && role !== ANONYMOUS) {
			const signed = next('login');
			logins.push(signed.login);
			if (!signed.signedIn) continue;
		}
		if (header.only === 'load') {
			if (!role || role === ANONYMOUS) routes.push(...allPages.map((route) => withTemplate(groupOf, { ...partialResult(route, [], []), ok: true, only: 'load' as const })), ...outOfPart(plan.endpoints, plan.redirects, 'load', role));
			continue;
		}
		if (header.only === 'embeds') {
			for (const route of allPages) routes.push(embedsOnly(groupOf, route, next('embeds only').out, role));
			routes.push(...outOfPart(plan.endpoints, plan.redirects, 'embeds', role));
			continue;
		}
		if (header.only === 'probes') {
			for (const route of allPages) {
				const result = await probesOnly(replaying(rowsOf({ route, ...(role ? { role } : {}), kind: 'probes' })), headerContext(header, route, role, false));
				routes.push(asRole(withTemplate(groupOf, { ...result, ok: result.failures.length === 0, only: 'probes' as const }), role));
			}
			routes.push(...outOfPart(plan.endpoints, plan.redirects, 'probes', role));
			continue;
		}
		if (header.coverage) coverages.push(next('coverage').coverage);
		const checked: RouteResult[] = [];
		for (const route of allPages) checked.push(await judgeRouteRows(header, route, role, light(route), groupOf, rowsOf({ route, ...(role ? { role } : {}), kind: 'page' })));
		const navigated = header.stages.navigation ? next('navigation').result : undefined;
		if (navigated) navigation.push(navigated);
		routes.push(...roleCompared(checked, navigated));
		for (const _ of plan.endpoints) routes.push(asRole(next('endpoint').result, role));
		for (const _ of plan.redirects) routes.push(asRole(next('redirect').result, role));
	}
	if (header.stages.load) routes = applyLoads(routes, new Map(next('loads').loads));
	return finishReport(header, routes, logins, coverages, navigation, plan.groups, allPages, next('footer'));
}
