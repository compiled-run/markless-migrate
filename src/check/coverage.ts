import { createHash } from 'node:crypto';
import { tagHeaders, type SideEnv } from './browser.ts';
import { captureHttp } from './capture.ts';
import { UNKNOWN_PATH } from './endpoints.ts';
import { HINTS } from './hints.ts';
import { request } from './http.ts';
import type { Failure, HttpCapture, RouteCoverage } from './types.ts';

const CONCURRENCY = 8;
const RETRIES_MS = [1_000, 4_000];

/** A request the network dropped is tried again after a pause, twice: a busy server or a rate limit must not read as a missing route. */
async function http(env: SideEnv, route: string): Promise<HttpCapture | undefined> {
	for (let attempt = 0; ; attempt++) {
		const got = await captureHttp(env.origin, route, tagHeaders(env)).catch(() => undefined);
		if (got && got.chain[0]!.status !== 429 && got.chain[0]!.status !== 503) return got;
		if (attempt >= RETRIES_MS.length) return got;
		await new Promise((done) => setTimeout(done, RETRIES_MS[attempt]));
	}
}

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

async function bodyHash(env: SideEnv, path: string): Promise<string | undefined> {
	try {
		const response = await request(new URL(path, env.origin), { headers: tagHeaders(env) });
		return createHash('sha256').update(await response.text()).digest('hex');
	} catch {
		return undefined;
	}
}

async function pool<T>(items: readonly T[], task: (item: T) => Promise<void>): Promise<void> {
	let next = 0;
	await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
		while (next < items.length) await task(items[next++]!);
	}));
}

/**
 * Whether every route of the old site exists on the new app: each is fetched from both (redirects followed by hand), and a route
 * the old app answers without an error must get the same status class and redirect target from the new one. When the new app
 * answers a path no app has with a page, a route whose page is byte for byte that page counts as missing, unless the old app
 * answers a path no app has with that same route (its catch-all redirects there), which the new app then rightly copies.
 */
export async function checkCoverage(old: SideEnv, next: SideEnv, routes: readonly string[], role?: string): Promise<RouteCoverage> {
	const failures: Failure[] = [];
	const notOnOld: string[] = [];
	const unreachable: string[] = [];
	let total = 0;
	let present = 0;
	const fallback = await captureHttp(next.origin, UNKNOWN_PATH, tagHeaders(next)).catch(() => undefined);
	const catchAll = fallback && fallback.status < 300 ? await bodyHash(next, fallback.chain.at(-1)!.url) : undefined;
	const oldFallback = catchAll ? await captureHttp(old.origin, UNKNOWN_PATH, tagHeaders(old)).catch(() => undefined) : undefined;
	const oldCatchAll = oldFallback && oldFallback.status < 300 ? new URL(oldFallback.chain.at(-1)!.url, old.origin).pathname : undefined;
	await pool([...new Set(routes)], async (route) => {
		const a = await http(old, route);
		const as = role ? ` as ${role}` : '';
		if (!a) {
			unreachable.push(`${route} (OLD${as})`);
			return;
		}
		if (a.chain[0]!.status >= 400) {
			notOnOld.push(route);
			return;
		}
		total++;
		const b = await http(next, route);
		if (!b) {
			unreachable.push(`${route} (NEW${as})`);
			return;
		}
		const tag = (f: Failure): Failure => (role ? { ...f, role } : f);
		if (!samePresence(a, b)) {
			failures.push(tag(missingRoute(route, a, describeHttp(b))));
			return;
		}
		const oldsOwnFallback = oldCatchAll !== undefined && new URL(a.chain.at(-1)!.url, old.origin).pathname === oldCatchAll;
		if (catchAll && !oldsOwnFallback && b.status < 300 && a.status < 300 && (await bodyHash(next, b.chain.at(-1)!.url)) === catchAll) failures.push(tag(missingRoute(route, a, `${describeHttp(b)}, the same page the new app answers for a path no app has (${UNKNOWN_PATH})`)));
		else present++;
	});
	failures.sort((x, y) => x.route.localeCompare(y.route));
	return { total, present, missing: failures.map((f) => f.route), accepted: [], failures, notOnOld: notOnOld.sort(), unreachable: unreachable.sort(), ...(role ? { roles: [{ role, total, present, missing: failures.length }] } : {}) };
}

/** One role's coverage, or every role's together: a route is present when the new app answers it alike for every role. */
export function mergeCoverage(parts: readonly RouteCoverage[]): RouteCoverage {
	if (parts.length === 1) return parts[0]!;
	const failures = parts.flatMap((p) => p.failures).sort((x, y) => x.route.localeCompare(y.route) || (x.role ?? '').localeCompare(y.role ?? ''));
	const routes = new Set(parts.flatMap((p) => [...p.failures.map((f) => f.route)]));
	const total = Math.max(0, ...parts.map((p) => p.total));
	return {
		total,
		present: Math.max(0, total - routes.size),
		missing: [...routes].sort(),
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
	return { ...coverage, failures, missing: [...missing], accepted: [...new Set(accepted)], present: Math.max(0, coverage.total - new Set(failures.map((f) => f.route)).size), ...(roles ? { roles } : {}) };
}

export function coverageLines(c: RouteCoverage): string[] {
	const lines = [`Routes on the new app: ${c.present} of ${c.total} routes of the old site present${c.missing.length ? `, ${c.missing.length} missing` : ''}${c.accepted.length ? `, ${c.accepted.length} left out on purpose (accepted)` : ''}.`];
	if (c.roles && c.roles.length > 1) lines.push(`  by role: ${c.roles.map((r) => `${r.role} ${r.total - r.missing} of ${r.total}`).join(', ')}`);
	const open = c.failures.filter((f) => !f.accepted);
	if (open.length) lines.push(`Missing on the new app (${open.length}):`, ...open.map((f) => `  ${f.route}${f.role ? ` (${f.role})` : ''}  old ${f.expected}, new ${f.actual}${f.id ? `  [${f.id}]` : ''}`));
	const accepted = c.failures.filter((f) => f.accepted);
	if (accepted.length) lines.push('Left out on purpose:', ...accepted.map((f) => `  ${f.route}  (${f.accepted!.reason}, ${f.accepted!.by})`));
	if (c.unreachable.length) lines.push(`Not measured, an app did not answer after three tries, so coverage is not green (${c.unreachable.length}): ${c.unreachable.join(', ')}`);
	return lines;
}
