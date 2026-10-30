import { IMMUTABLE, NEVER_SHARED, NEVER_STORED } from './headers.ts';
import type { RouteCaching } from './classify.ts';

export interface NitroRule {
	prerender?: boolean;
	isr?: boolean | number | { expiration: number | false; allowQuery?: string[]; passQuery?: boolean };
	headers?: Record<string, string>;
}

export interface CacheRules {
	readonly routeRules: Record<string, NitroRule>;
}

export interface RulesOptions {
	/** The request header a Markless fragment fetch carries (@markless/router up to 0.5), read from the app's router. Absent: no header-marked fragments. */
	readonly fragmentHeader?: string;
	/** The path prefix a Markless fragment fetch goes to (`/_markless/fragment`, 0.7 on): each page's fragment is its own URL, cached as the page is. */
	readonly fragmentPath?: string;
	/** The app's Nitro hands an ISR function its allowed query keys (`passQuery`), so a page that reads the query can stay on ISR. */
	readonly passQuery?: boolean;
	/** Same-origin content-hashed files outside the build directories Markless and Nitro already mark immutable. */
	readonly hashedAssets?: readonly string[];
	/** Render each cached page and its fragment URL at build time; one that revalidates becomes its ISR function's fallback on Vercel. */
	readonly prerender?: boolean;
}

/** CDN caching by Cache-Control: the CDN keys on the whole URL and honours Vary. `false`: kept until the next deploy, which starts a new cache. */
export const cdnCacheControl = (revalidate: number | false) => (revalidate === false ? 'public, max-age=0, s-maxage=31536000' : `public, max-age=0, s-maxage=${revalidate}, stale-while-revalidate=${revalidate * 10}`);

/**
 * Each route's caching as Nitro routeRules. Vercel's ISR cache keeps one entry per URL and ignores Vary, so a page whose
 * fragments differ from its document only by a request header is cached by the CDN (which honours the router's Vary) instead.
 */
export function cacheRules(routes: readonly RouteCaching[], options: RulesOptions = {}): CacheRules {
	const routeRules: Record<string, NitroRule> = {};
	const headerOnly = Boolean(options.fragmentHeader && !options.fragmentPath);
	for (const r of routes) {
		if (r.status !== 200 || /[:*]/.test(r.route)) continue;
		const path = r.route.split(/[?#]/)[0]!;
		const fragment = options.fragmentPath && r.html ? `${options.fragmentPath}${path}` : undefined;
		const set = (rule: NitroRule) => {
			routeRules[path] = rule;
			if (fragment) routeRules[fragment] = structuredClone(rule);
		};
		if (r.class === 'no-cache') {
			set({ isr: false, headers: { 'cache-control': r.sensitive ? NEVER_STORED : NEVER_SHARED } });
			continue;
		}
		const expiration = r.class === 'isr' ? (r.revalidate ?? 60) : false;
		const keys = r.allowQuery ?? [];
		if ((headerOnly && r.html) || (keys.length && !options.passQuery)) {
			set({ isr: false, headers: { 'cache-control': cdnCacheControl(expiration) } });
			continue;
		}
		set({ ...(options.prerender && r.html && !keys.length ? { prerender: true } : {}), isr: { expiration, allowQuery: [...keys], ...(keys.length ? { passQuery: true } : {}) } });
	}
	for (const asset of options.hashedAssets ?? []) routeRules[asset] = { headers: { 'cache-control': IMMUTABLE } };
	return { routeRules };
}

/**
 * Each route's caching for Cloudflare Workers, which has no ISR: a page cached on Vercel, with no query keys, is built
 * into a file, page and fragment URL alike, and Cloudflare serves it without running the Worker until the next deploy.
 * Every other route renders in the Worker.
 */
export function cloudflareRules(routes: readonly RouteCaching[], options: Pick<RulesOptions, 'fragmentPath' | 'hashedAssets'> = {}): CacheRules {
	const routeRules: Record<string, NitroRule> = {};
	for (const r of routes) {
		if (r.status !== 200 || /[:*]/.test(r.route)) continue;
		const path = r.route.split(/[?#]/)[0]!;
		const fragment = options.fragmentPath && r.html ? `${options.fragmentPath}${path}` : undefined;
		const keys = r.allowQuery ?? [];
		const rule: NitroRule =
			r.class === 'no-cache' ? { headers: { 'cache-control': r.sensitive ? NEVER_STORED : NEVER_SHARED } } : r.html && !keys.length ? { prerender: true } : {};
		if (!Object.keys(rule).length) continue;
		routeRules[path] = rule;
		if (fragment) routeRules[fragment] = structuredClone(rule);
	}
	for (const asset of options.hashedAssets ?? []) routeRules[asset] = { headers: { 'cache-control': IMMUTABLE } };
	return { routeRules };
}

/**
 * The file a Cloudflare build serves a prerendered path from: `/guide` from guide.html, `/guide/` from guide/index.html,
 * and `/page.html` from page.html (Cloudflare answers that URL with a redirect to `/page`, served from the same file).
 */
export function cloudflareAssetFile(path: string): string {
	const decoded = decodeURIComponent(path);
	return decoded.endsWith('/') ? `${decoded.slice(1)}index.html` : decoded.endsWith('.html') ? decoded.slice(1) : `${decoded.slice(1)}.html`;
}
