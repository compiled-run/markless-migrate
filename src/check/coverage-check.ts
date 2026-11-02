// Whether every route of the old site exists on the new app: both apps asked over HTTP, judged by coverage.ts.
import { createHash } from 'node:crypto';
import { tagHeaders, type SideEnv } from './browser.ts';
import { captureHttp, captureRouteHttp, mime, routeFile } from './capture.ts';
import { answeredThenRedirected, UNKNOWN_PATH, type Landing } from './endpoints.ts';
import { movedInBrowser } from './compare.ts';
import { describeHttp, missingRoute, samePresence, servedByOld, split } from './coverage.ts';
import { request } from './http.ts';
import type { Failure, HttpCapture, RouteCoverage } from './types.ts';

const CONCURRENCY = 8;
const RETRIES_MS = [1_000, 4_000];

/** A request the network dropped is tried again after a pause, twice: a busy server or a rate limit must not read as a missing route. */
async function http(env: SideEnv, route: string): Promise<HttpCapture | undefined> {
	for (let attempt = 0; ; attempt++) {
		const got = await captureRouteHttp(env, route, tagHeaders(env)).catch(() => undefined);
		if (got && got.chain[0]!.status !== 429 && got.chain[0]!.status !== 503) return got;
		if (attempt >= RETRIES_MS.length) return got;
		await new Promise((done) => setTimeout(done, RETRIES_MS[attempt]));
	}
}

async function body(env: SideEnv, path: string): Promise<{ hash: string; html: string } | undefined> {
	try {
		const response = await request(new URL(path, env.origin), { headers: tagHeaders(env) });
		const html = await response.text();
		return { hash: createHash('sha256').update(html).digest('hex'), html };
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
 * answers a path no app has with that same route (its catch-all redirects there), which the new app then rightly copies. An HTML
 * page counts as ported only when the new app's Markless code renders it; one without Markless's route marker is served by the old app.
 */
export async function checkCoverage(old: SideEnv, next: SideEnv, routes: readonly string[], role?: string, land?: Landing): Promise<RouteCoverage> {
	const failures: Failure[] = [];
	const notOnOld: string[] = [];
	const unreachable: string[] = [];
	let total = 0;
	let present = 0;
	const fallback = await captureHttp(next.origin, UNKNOWN_PATH, tagHeaders(next)).catch(() => undefined);
	const catchAll = fallback && fallback.status < 300 ? (await body(next, fallback.chain.at(-1)!.url))?.hash : undefined;
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
		const moved = land && answeredThenRedirected(a, b) ? await land(route) : undefined;
		if (!samePresence(a, b) && !(moved && movedInBrowser([a], b, [moved]))) {
			failures.push(tag(missingRoute(route, a, describeHttp(b))));
			return;
		}
		const oldsOwnFallback = oldCatchAll !== undefined && new URL(a.chain.at(-1)!.url, old.origin).pathname === oldCatchAll;
		// A redirect that ends on another site (a chat invite, a sponsor) lands on that site's page, not either app's.
		const home = (h: HttpCapture, env: SideEnv) => new URL(h.chain.at(-1)!.url, env.origin).origin === new URL(env.origin).origin;
		const html = mime(b.contentType) === 'text/html' && mime(a.contentType) === 'text/html' && home(a, old) && home(b, next);
		const page = b.status < 300 && a.status < 300 && (html || (catchAll && !oldsOwnFallback)) ? await body(next, b.chain.at(-1)!.url) : undefined;
		if (catchAll && !oldsOwnFallback && page?.hash === catchAll) failures.push(tag(missingRoute(route, a, `${describeHttp(b)}, the same page the new app answers for a path no app has (${UNKNOWN_PATH})`)));
		else if (page && html && !routeFile(page.html).routeFile) failures.push(tag(servedByOld(route, a, b)));
		else present++;
	});
	failures.sort((x, y) => x.route.localeCompare(y.route));
	return { total, present, ...split(failures), accepted: [], failures, notOnOld: notOnOld.sort(), unreachable: unreachable.sort(), ...(role ? { roles: [{ role, total, present, missing: failures.length }] } : {}) };
}
