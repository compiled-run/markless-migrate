import { IMMUTABLE, NEVER_SHARED, NEVER_STORED } from './headers.ts';
import type { RouteCaching } from './classify.ts';

/** The query key a fragment request is rewritten with, so the CDN keeps it apart from the page's document. */
export const FRAGMENT_QUERY = '__markless_fragment';

export interface NitroRule {
	prerender?: boolean;
	isr?: boolean | number | { expiration: number | false; allowQuery?: string[] };
	headers?: Record<string, string>;
}

export interface VercelRoute {
	src: string;
	dest?: string;
	has?: { type: 'header'; key: string; value?: string }[];
	headers?: Record<string, string>;
	continue?: boolean;
}

export interface CacheRules {
	readonly routeRules: Record<string, NitroRule>;
	/** Routes placed before Nitro's own in the Vercel build output, with the path each serves. */
	readonly vercelRoutes: { readonly path: string; readonly route: VercelRoute }[];
}

export interface RulesOptions {
	/** The request header a Markless fragment fetch carries, read from the app's @markless/router. Absent: no fragment navigation. */
	readonly fragmentHeader?: string;
	/** The path prefix a Markless fragment fetch goes to (`/_markless/fragment`): each page's fragment is its own URL, cached as the page is. */
	readonly fragmentPath?: string;
	/** Same-origin content-hashed files outside the build directories Markless and Nitro already mark immutable. */
	readonly hashedAssets?: readonly string[];
	/** Write static pages to files at build time as well as keeping an ISR function for their fragment requests. */
	readonly prerender?: boolean;
}

/** Nitro's Vercel preset names an ISR function after the route: `/docs/` is `docs/-isr`, `/` is `index-isr`. Concrete paths only. */
export function isrFunction(path: string): string {
	const dest = path.split('/').slice(1).map((s) => s.replace(/[^a-zA-Z0-9_.[\]/]/g, '-')).join('/') || 'index';
	return `/${dest}-isr`;
}

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** CDN caching by Cache-Control: what a page that reads the query gets, since Vercel's ISR hands the page no query (docs/notes/caching.md). */
export const cdnCacheControl = (revalidate: number) => `public, max-age=0, s-maxage=${revalidate}, stale-while-revalidate=${revalidate * 10}`;

/**
 * Each route's caching as Nitro routeRules, and the Vercel routes that keep fragment requests in an ISR entry of their own.
 * Vercel's ISR cache ignores Vary, so a fragment and a document of one URL share an entry unless their keys differ.
 */
export function cacheRules(routes: readonly RouteCaching[], options: RulesOptions = {}): CacheRules {
	const routeRules: Record<string, NitroRule> = {};
	const vercelRoutes: { path: string; route: VercelRoute }[] = [];
	const fragment = options.fragmentHeader;
	for (const r of routes) {
		if (r.status !== 200 || /[:*]/.test(r.route)) continue;
		const path = r.route.split(/[?#]/)[0]!;
		if (r.class === 'no-cache') {
			routeRules[path] = { isr: false, headers: { 'cache-control': r.sensitive ? NEVER_STORED : NEVER_SHARED } };
			continue;
		}
		if (r.allowQuery?.length) {
			// The CDN keys on the whole URL and honours Vary, and the page sees its query.
			routeRules[path] = { isr: false, headers: { 'cache-control': cdnCacheControl(r.revalidate ?? 60) } };
			continue;
		}
		const split = Boolean(fragment && r.html);
		const expiration = r.class === 'isr' ? (r.revalidate ?? 60) : false;
		routeRules[path] = { ...(r.class === 'prerender' && options.prerender && r.html ? { prerender: true } : {}), isr: { expiration, allowQuery: split ? [FRAGMENT_QUERY] : [] } };
		if (options.fragmentPath && r.html) routeRules[`${options.fragmentPath}${path}`] = { isr: { expiration, allowQuery: [] } };
		if (split) vercelRoutes.push({ path, route: { src: `(?<__isr_route>${escapeRegex(path)})`, has: [{ type: 'header', key: fragment!, value: '1' }], dest: `${isrFunction(path)}?__isr_route=$__isr_route&${FRAGMENT_QUERY}=1` } });
	}
	for (const asset of options.hashedAssets ?? []) routeRules[asset] = { headers: { 'cache-control': IMMUTABLE } };
	return { routeRules, vercelRoutes };
}
