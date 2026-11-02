import { HINTS } from './hints.ts';
import type { Failure, HttpCapture, RouteCoverage } from './types.ts';

const statusClass = (status: number) => Math.floor(status / 100);

/** `200`, or `301 -> /docs/ (200)` for a redirect. */
export function describeHttp(http: HttpCapture): string {
	const first = http.chain[0]!;
	return http.chain.length > 1 ? `${first.status} -> ${http.chain.at(-1)!.url} (${http.status})` : String(first.status);
}

/** The new app answers the route as the old one does: the same status class and, for a redirect, the same target. */
export function samePresence(old: HttpCapture, next: HttpCapture): boolean {
	if (statusClass(old.chain[0]!.status) !== statusClass(next.chain[0]!.status)) return false;
	if (old.chain.length === 1) return true;
	return old.chain.at(-1)!.url === next.chain.at(-1)!.url && statusClass(old.status) === statusClass(next.status);
}

export function missingRoute(route: string, old: HttpCapture, next: string): Failure {
	return { route, dimension: 'coverage', check: 'route on the new app', expected: describeHttp(old), actual: next, hint: HINTS.routeMissing };
}

export const NOT_RENDERED = 'route rendered by the new app';

/** An HTML route the new app answers with a page its own Markless code did not render: no router route marker names a page file. */
export function servedByOld(route: string, old: HttpCapture, next: HttpCapture): Failure {
	return { route, dimension: 'coverage', check: NOT_RENDERED, expected: `${describeHttp(old)}, a page the new app's Markless code renders (the router names its page file)`, actual: `${describeHttp(next)}, served by the old app: the page carries no Markless route marker, so it is the old app's HTML passed through, not a port`, hint: HINTS.routeServedByOld };
}

/** Open failures' routes: missing, and served by the old app (a route missing for any role is missing). */
export function split(open: readonly Failure[]): { missing: string[]; servedByOld: string[] } {
	const missing = new Set(open.filter((f) => f.check !== NOT_RENDERED).map((f) => f.route));
	return { missing: [...missing].sort(), servedByOld: [...new Set(open.filter((f) => f.check === NOT_RENDERED && !missing.has(f.route)).map((f) => f.route))].sort() };
}

/** Routes of the old site the new app does not port yet: missing, or served by the old app. */
export const notPorted = (c: { readonly missing?: readonly string[]; readonly servedByOld?: readonly string[] }): string[] => [...(c.missing ?? []), ...(c.servedByOld ?? [])];

/** One role's coverage, or every role's together: a route is present when the new app answers it alike for every role. */
export function mergeCoverage(parts: readonly RouteCoverage[]): RouteCoverage {
	if (parts.length === 1) return parts[0]!;
	const failures = parts.flatMap((p) => p.failures).sort((x, y) => x.route.localeCompare(y.route) || (x.role ?? '').localeCompare(y.role ?? ''));
	const routes = new Set(parts.flatMap((p) => [...p.failures.map((f) => f.route)]));
	const total = Math.max(0, ...parts.map((p) => p.total));
	return {
		total,
		present: Math.max(0, total - routes.size),
		...split(failures),
		accepted: [],
		failures,
		notOnOld: [...new Set(parts.flatMap((p) => p.notOnOld))].sort(),
		unreachable: [...new Set(parts.flatMap((p) => p.unreachable))].sort(),
		roles: parts.flatMap((p) => p.roles ?? []),
	};
}

/** Coverage with accepted differences applied: an accepted missing route is listed apart and no longer counts as missing. */
export function settleCoverage(coverage: RouteCoverage, failures: readonly Failure[]): RouteCoverage {
	const open = failures.filter((f) => !f.accepted);
	const missing = new Set(open.map((f) => f.route));
	const accepted = failures.filter((f) => f.accepted && !missing.has(f.route)).map((f) => f.route);
	const roles = coverage.roles?.map((r) => ({ ...r, missing: open.filter((f) => f.role === r.role).length, present: r.total - open.filter((f) => f.role === r.role).length }));
	return { ...coverage, failures, ...split(open), accepted: [...new Set(accepted)], present: Math.max(0, coverage.total - new Set(failures.map((f) => f.route)).size), ...(roles ? { roles } : {}) };
}

export function coverageLines(c: RouteCoverage): string[] {
	const old = c.servedByOld ?? [];
	const lines = [`Routes on the new app: ${c.present} of ${c.total} routes of the old site present${c.missing.length ? `, ${c.missing.length} missing` : ''}${old.length ? `, ${old.length} served by the old app` : ''}${c.accepted.length ? `, ${c.accepted.length} left out on purpose (accepted)` : ''}.`];
	if (c.roles && c.roles.length > 1) lines.push(`  by role: ${c.roles.map((r) => `${r.role} ${r.total - r.missing} of ${r.total}`).join(', ')}`);
	const open = c.failures.filter((f) => !f.accepted);
	const missing = open.filter((f) => f.check !== NOT_RENDERED);
	const passed = open.filter((f) => f.check === NOT_RENDERED);
	if (missing.length) lines.push(`Missing on the new app (${missing.length}):`, ...missing.map((f) => `  ${f.route}${f.role ? ` (${f.role})` : ''}  old ${f.expected}, new ${f.actual}${f.id ? `  [${f.id}]` : ''}`));
	if (passed.length) lines.push(`Served by the old app, not rendered by the new app's Markless code (${passed.length}):`, ...passed.map((f) => `  ${f.route}${f.role ? ` (${f.role})` : ''}${f.id ? `  [${f.id}]` : ''}`));
	const accepted = c.failures.filter((f) => f.accepted);
	if (accepted.length) lines.push('Left out on purpose:', ...accepted.map((f) => `  ${f.route}  (${f.accepted!.reason}, ${f.accepted!.by})`));
	if (c.unreachable.length) lines.push(`Not measured, an app did not answer after three tries, so coverage is not green (${c.unreachable.length}): ${c.unreachable.join(', ')}`);
	return lines;
}
