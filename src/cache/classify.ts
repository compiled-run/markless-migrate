import type { RouteEvidence, ResponseFacts } from './evidence.ts';
import { parseCacheControl } from './headers.ts';
import type { RouteSignals, Signal } from './signals.ts';

/**
 * `prerender`: the same for every visitor until the next deploy, served from the CDN.
 * `isr`: the same for every visitor, but its data changes: the CDN serves it and renders it again in the background
 * once it is older than `revalidate` seconds (stale-while-revalidate).
 * `no-cache`: personal to the visitor, or depends on the request: never kept by a shared cache.
 */
export type CacheClass = 'prerender' | 'isr' | 'no-cache';

/** How the old app's answer was cached, read from its headers. */
export interface OldCaching {
	/** A shared cache (CDN) answered it, or may keep it. */
	readonly shared: boolean;
	/** It was kept from shared caches (private, no-store, Set-Cookie, Vary: Cookie). */
	readonly personal: boolean;
	/** Seconds the old headers let a shared cache keep it, when they say. */
	readonly ttl?: number;
	readonly cdn?: string;
	readonly cacheControl?: string;
}

export interface RouteCaching {
	readonly route: string;
	readonly class: CacheClass;
	/** For `isr`: seconds until the CDN renders it again in the background. */
	readonly revalidate?: number;
	/** Query keys the page reads: each value is cached apart. Every other query string shares the page's entry. */
	readonly allowQuery?: readonly string[];
	/** For `no-cache`: it involves sign-in, a session or a cookie the server sets, so browsers must not store it either. */
	readonly sensitive?: boolean;
	/** Why, one line each, with the evidence. */
	readonly reasons: readonly string[];
	readonly old: OldCaching;
	readonly status: number;
	readonly html: boolean;
}

/** Revalidation for a page whose data changes, when the old headers do not say: one minute. */
export const DEFAULT_REVALIDATE = 60;

const at = (s: Signal) => `${s.file}:${s.line}`;
const describe = (s: Signal) => `${s.what} (${at(s)})`;

export function oldCaching(facts: readonly ResponseFacts[]): OldCaching {
	const last = facts.at(-1)!;
	const cc = parseCacheControl(last.cacheControl);
	const personal = facts.some((f) => {
		const c = parseCacheControl(f.cacheControl);
		return c.private === true || c.noStore === true || f.setCookies.length > 0 || f.vary.some((v) => v === 'cookie' || v === 'authorization' || v === '*');
	});
	const hit = facts.some((f) => f.cdn && ['hit', 'stale', 'prerender', 'revalidated'].includes(f.cdn.status));
	const aged = facts.some((f) => (f.age ?? 0) > 0);
	const ttl = cc.sMaxAge ?? (cc.public || !cc.private ? cc.maxAge : undefined);
	const shared = !personal && (hit || aged || (ttl ?? 0) > 0);
	return { shared, personal, ...(ttl !== undefined ? { ttl } : {}), ...(last.cdn ? { cdn: `${last.cdn.vendor} ${last.cdn.raw}` } : {}), ...(last.cacheControl ? { cacheControl: last.cacheControl } : {}) };
}

export interface ClassifyInput {
	readonly evidence: RouteEvidence;
	/** The old source's signals for the route; absent without --source. */
	readonly old?: RouteSignals;
	/** The Markless app's signals for the page that renders the route, once it exists. */
	readonly new?: RouteSignals;
	/** Reached only by a signed-in role in plan's crawl. */
	readonly signedInOnly?: boolean;
	/** The old app renders pages on the server; when false (an SPA), its data fetches run in the browser. */
	readonly serverRendered?: boolean;
}

/** The safest class the evidence allows that still serves the route from the CDN whenever it is the same for every visitor. */
export function classify(input: ClassifyInput): RouteCaching {
	const { evidence } = input;
	const facts = [evidence.first, evidence.second, ...(evidence.withCookie ? [evidence.withCookie] : [])];
	const old = oldCaching([evidence.first, evidence.second]);
	const status = evidence.first.status;
	const html = /html/.test(evidence.first.contentType);
	const base = { route: evidence.route, old, status, html };
	const personal: string[] = [];
	const sides = [
		['old', input.old],
		['new', input.new],
	] as const;
	for (const [side, s] of sides) {
		if (!s) continue;
		if (s.guard) personal.push(`${side} source: ${describe(s.guard)}`);
		for (const r of s.requestReads) personal.push(`${side} source reads the request: ${describe(r)}`);
		for (const r of s.perVisitor) personal.push(`${side} source varies per visitor: ${describe(r)}`);
		for (const r of s.setsCookies) personal.push(`${side} source ${describe(r)}`);
	}
	if (input.signedInOnly) personal.push('plan reached it only signed in');
	const cookies = [...new Set(facts.flatMap((f) => f.setCookies))];
	if (cookies.length) personal.push(`old response sets cookies: ${cookies.join(', ')}`);
	const cc = parseCacheControl(evidence.first.cacheControl);
	if (cc.private || cc.noStore) personal.push(`old Cache-Control: ${evidence.first.cacheControl}`);
	const varyPersonal = evidence.first.vary.filter((v) => v === 'cookie' || v === 'authorization' || v === '*');
	if (varyPersonal.length) personal.push(`old response varies on ${varyPersonal.join(', ')}`);
	if (evidence.withCookie && evidence.withCookie.bodyHash !== evidence.second.bodyHash && evidence.first.bodyHash === evidence.second.bodyHash) personal.push('old page changes when a cookie is sent');
	const sensitive = Boolean(input.signedInOnly || cookies.length || cc.noStore || sides.some(([, s]) => s && (s.guard || s.setsCookies.length || s.requestReads.some((r) => /session/.test(r.what)))));
	if (personal.length) return { ...base, class: 'no-cache', ...(sensitive ? { sensitive } : {}), reasons: personal };

	const keys = [...new Set([...(input.old?.queryKeys ?? []), ...(input.new?.queryKeys ?? [])])].sort();
	const allowQuery = keys.length ? { allowQuery: keys } : { allowQuery: [] as string[] };
	const queryReason = keys.length ? [`cached apart per value of the query keys the source reads: ${keys.join(', ')}`] : [];

	const changing: string[] = [];
	for (const [side, s] of sides) {
		if (!s) continue;
		for (const c of s.changing) if (side === 'new' || input.serverRendered !== false || !/fetches data/.test(c.what)) changing.push(`${side} source: ${describe(c)}`);
	}
	if (evidence.first.bodyHash !== evidence.second.bodyHash) changing.push('old page changed between two requests');
	else if (evidence.first.etag && evidence.second.etag && evidence.first.etag !== evidence.second.etag) changing.push('old ETag changed between two requests');
	const swr = cc.staleWhileRevalidate !== undefined || evidence.first.cdn?.status === 'stale' || evidence.second.cdn?.status === 'stale' || evidence.second.cdn?.status === 'revalidated';
	if (swr) changing.push(`old CDN revalidates it in the background (${[evidence.first.cacheControl, evidence.second.cdn?.raw].filter(Boolean).join('; ')})`);
	const oldTtl = old.ttl && old.ttl > 0 && old.ttl < 31_536_000 ? old.ttl : undefined;
	if (oldTtl && (cc.sMaxAge !== undefined || swr)) changing.push(`old headers let a shared cache keep it ${oldTtl} s`);
	if (changing.length) {
		const revalidate = oldTtl ?? DEFAULT_REVALIDATE;
		return { ...base, class: 'isr', revalidate, ...allowQuery, reasons: [...changing, oldTtl ? `revalidates after ${revalidate} s, as the old headers did` : `revalidates after ${revalidate} s (no old TTL to copy)`, ...queryReason] };
	}
	if (keys.length) return { ...base, class: 'isr', revalidate: oldTtl ?? DEFAULT_REVALIDATE, ...allowQuery, reasons: [`the page reads the query, so it is rendered per value and cannot be built ahead`, ...queryReason] };
	const why = [`same body on both requests${evidence.first.etag ? ` and the same ETag ${evidence.first.etag}` : ''}`, input.old || input.new ? 'no source reads the request, the session or per-request data' : 'no source given: classified from the response alone'];
	if (old.shared) why.push(`old ${old.cdn ?? 'shared cache'} kept it${evidence.second.age !== undefined ? ` (Age ${evidence.second.age})` : ''}`);
	return { ...base, class: 'prerender', ...allowQuery, reasons: why };
}
