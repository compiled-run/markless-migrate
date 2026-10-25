import { request } from '../check/http.ts';
import { mime } from '../check/capture.ts';

/** Where plan learned of a route: a sitemap, a link on a crawled page, the old app's source, robots.txt, a feed, a fixed non-page path, or a redirect. */
export type RouteSource = 'sitemap' | 'crawl' | 'hreflang' | 'source' | 'robots' | 'feed' | 'endpoint' | 'redirect';

export interface PlannedRoute {
	readonly route: string;
	readonly sources: readonly RouteSource[];
	/** First response of the old app, when the crawl fetched the route. */
	readonly status?: number;
	readonly redirectsTo?: string;
	readonly contentType?: string;
	/** Roles a visitor reaches the route as, when plan crawled signed in too (absent: anonymous only). */
	readonly roles?: readonly string[];
}

export interface Enumeration {
	/** Every route of the old site plan found, from every source, sorted. */
	readonly routes: readonly PlannedRoute[];
	/** Pages the link crawl fetched, and the most it may fetch. */
	readonly fetched: number;
	readonly bound: number;
	/** The crawl stopped at the bound with routes still unfetched: their links were not followed. */
	readonly truncated: boolean;
	readonly sitemaps: readonly string[];
	/** Pages whose links were not followed: each repeats an earlier page of its route apart from its numbers and links on to the next one (pagination that runs on past its last page). */
	readonly repeats: readonly { readonly route: string; readonly sameAs: string; readonly next: string }[];
}

export const DEFAULT_CRAWL_BOUND = 10_000;
const CONCURRENCY = 8;
const MAX_BODY = 4 * 1024 * 1024;
const PAGINATION = /^(page|p|pg|paged|offset|start|cursor|after|before)$/i;
const NOT_LINKS = /^(javascript|mailto|tel|data|blob|about|sms|ftp):/i;

const shapeOf = (route: string) => route.replace(/\d+/g, '#');
// What a page shows apart from its numbers: scripts, styles and tags dropped, digits folded.
const contentOf = (html: string) =>
	html
		.replace(/<(script|style|template)\b[\s\S]*?<\/\1>/gi, '')
		.replace(/<[^>]*>/g, ' ')
		.replace(/\d+/g, '#')
		.replace(/\s+/g, ' ')
		.trim();

const decode = (value: string) => value.replace(/&amp;/g, '&').replace(/&#x2F;/gi, '/').replace(/&#47;/g, '/').replace(/&quot;/g, '"').replace(/&#39;/g, "'");

/** The route a link names on the old origin: its path, with a query kept only when every key is a pagination key. */
export function routeOf(href: string, base: string, origin: string): string | undefined {
	const raw = decode(href.trim());
	if (!raw || raw.startsWith('#') || NOT_LINKS.test(raw)) return undefined;
	try {
		const url = new URL(raw, base);
		if (url.origin !== new URL(origin).origin || !/^https?:$/.test(url.protocol)) return undefined;
		const keys = [...url.searchParams.keys()];
		return url.pathname + (keys.length && keys.every((k) => PAGINATION.test(k)) ? url.search : '');
	} catch {
		return undefined;
	}
}

/** Hrefs of `<a>`, `<area>`, the `<link>`s that name another page of the site (next, prev, alternate, canonical), and the pages `<iframe>`s embed. */
export function pageLinks(html: string): string[] {
	const out: string[] = [];
	const body = html.replace(/<script\b[\s\S]*?<\/script>/gi, '').replace(/<!--[\s\S]*?-->/g, '');
	for (const m of body.matchAll(/<(a|area)\b[^>]*?\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi)) out.push(m[2] ?? m[3] ?? m[4] ?? '');
	for (const m of body.matchAll(/<(iframe|frame)\b[^>]*?\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi)) out.push(m[2] ?? m[3] ?? m[4] ?? '');
	for (const m of body.matchAll(/<link\b[^>]*>/gi)) {
		const tag = m[0];
		const rel = /\brel\s*=\s*["']?([^"'>]+)/i.exec(tag)?.[1]?.toLowerCase() ?? '';
		const href = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(tag);
		if (href && /\b(next|prev|previous|alternate|canonical|manifest)\b/.test(rel)) out.push(href[1] ?? href[2] ?? href[3] ?? '');
	}
	return out;
}

/** Item links of an RSS or Atom feed. */
export function feedLinks(xml: string): string[] {
	const out: string[] = [];
	for (const m of xml.matchAll(/<link\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*\/?>/gi)) out.push(m[1]!);
	for (const m of xml.matchAll(/<link>\s*(?:<!\[CDATA\[)?\s*([^<\s\]]+)\s*(?:\]\]>)?\s*<\/link>/gi)) out.push(m[1]!);
	for (const m of xml.matchAll(/<guid\b[^>]*isPermaLink\s*=\s*["']true["'][^>]*>\s*([^<\s]+)\s*<\/guid>/gi)) out.push(m[1]!);
	return out;
}

/** Concrete paths robots.txt allows (Allow lines without wildcards; Disallow names what crawlers should leave alone, often no page), and its sitemaps. */
export function robotsPaths(text: string): { paths: string[]; sitemaps: string[] } {
	const paths: string[] = [];
	const sitemaps: string[] = [];
	for (const line of text.split('\n')) {
		const sitemap = line.match(/^\s*sitemap:\s*(\S+)/i);
		if (sitemap) sitemaps.push(sitemap[1]!);
		const rule = line.match(/^\s*allow:\s*(\/\S*)/i);
		if (rule && !/[*$]/.test(rule[1]!) && rule[1] !== '/') paths.push(rule[1]!);
	}
	return { paths, sitemaps };
}

async function fetchText(url: string, headers: Record<string, string>): Promise<{ status: number; location?: string; contentType: string; body?: string } | undefined> {
	try {
		const response = await request(url, { redirect: 'manual', headers });
		const contentType = mime(response.headers.get('content-type'));
		const location = response.headers.get('location') ?? undefined;
		const readable = response.status < 300 && /html|xml|rss|atom|text\/plain/.test(contentType);
		if (!readable) {
			await response.body?.cancel();
			return { status: response.status, ...(location ? { location } : {}), contentType };
		}
		const body = (await response.text()).slice(0, MAX_BODY);
		return { status: response.status, ...(location ? { location } : {}), contentType, body };
	} catch {
		return undefined;
	}
}

/** Paths of every page a sitemap (or sitemap index, followed) lists, and the sitemap files read. */
export async function readSitemaps(origin: string, start: readonly string[], headers: Record<string, string> = {}, limit = 500): Promise<{ routes: string[]; sitemaps: string[] }> {
	const queue = [...new Set(start)];
	const routes = new Set<string>();
	const read: string[] = [];
	for (let i = 0; i < queue.length && i < limit; i++) {
		const got = await fetchText(new URL(queue[i]!, origin).href, headers);
		if (!got?.body || got.status >= 300 || !/<(urlset|sitemapindex)[\s>]/.test(got.body)) continue;
		read.push(queue[i]!);
		const isIndex = /<sitemapindex[\s>]/.test(got.body);
		for (const match of got.body.matchAll(/<loc>\s*(?:<!\[CDATA\[)?\s*([^<\s\]]+)\s*(?:\]\]>)?\s*<\/loc>/g)) {
			let url: URL;
			try {
				url = new URL(decode(match[1]!), origin);
			} catch {
				continue;
			}
			const path = url.pathname + url.search;
			if (isIndex) {
				if (!queue.includes(path)) queue.push(path);
			} else routes.add(path);
		}
		for (const match of got.body.matchAll(/<xhtml:link\b[^>]*\bhref\s*=\s*["']([^"']+)["']/g)) {
			const path = routeOf(match[1]!, origin, origin);
			if (path) routes.add(path);
		}
	}
	return { routes: [...routes], sitemaps: read };
}

export interface EnumerateOptions {
	readonly headers?: Record<string, string>;
	/** At most this many pages fetched by the link crawl (default 10,000). */
	readonly bound?: number;
	/** Routes known before the crawl (the browser crawl's, the source scan's), each with where it came from. */
	readonly seeds?: ReadonlyMap<string, readonly RouteSource[]>;
}

/**
 * Every route of the old site: the sitemaps (indexes followed), robots.txt, feeds, and a same-origin link crawl of every page
 * from `/` and every other known route, following pagination and redirects, until nothing new is found or the bound is reached.
 */
export async function enumerateRoutes(origin: string, options: EnumerateOptions = {}): Promise<Enumeration> {
	const headers = options.headers ?? {};
	const bound = options.bound ?? DEFAULT_CRAWL_BOUND;
	const found = new Map<string, Set<RouteSource>>();
	const facts = new Map<string, { status: number; redirectsTo?: string; contentType: string }>();
	const queue: string[] = [];
	const note = (route: string, how: RouteSource) => {
		const set = found.get(route);
		if (set) {
			set.add(how);
			return;
		}
		found.set(route, new Set([how]));
		queue.push(route);
	};
	note('/', 'crawl');
	for (const [seed, sources] of options.seeds ?? []) {
		const route = routeOf(seed, origin, origin);
		if (route) for (const how of sources) note(route, how);
	}
	const robotsText = await fetchText(new URL('/robots.txt', origin).href, headers);
	// An app that answers every path with its HTML shell has no robots.txt, whatever the status says.
	const realRobots = robotsText?.status === 200 && Boolean(robotsText.body) && !/html/.test(robotsText.contentType);
	const robots = realRobots ? robotsPaths(robotsText!.body!) : { paths: [], sitemaps: [] };
	if (realRobots) note('/robots.txt', 'robots');
	for (const path of robots.paths) note(path, 'robots');
	const declared = robots.sitemaps.flatMap((s) => {
		try {
			return [new URL(s, origin).pathname];
		} catch {
			return [];
		}
	});
	const sitemaps = await readSitemaps(origin, declared.length ? declared : ['/sitemap.xml', '/sitemap_index.xml'], headers);
	for (const path of sitemaps.sitemaps) note(path, 'sitemap');
	for (const route of sitemaps.routes) note(route, 'sitemap');
	let fetched = 0;
	let next = 0;
	const pages = new Map<string, string>();
	const repeats: { route: string; sameAs: string; next: string }[] = [];
	const visit = async (route: string) => {
		const url = new URL(route, origin).href;
		const got = await fetchText(url, headers);
		if (!got) return;
		const redirect = got.status >= 300 && got.status < 400 && got.location ? routeOf(got.location, url, origin) : undefined;
		facts.set(route, { status: got.status, contentType: got.contentType, ...(got.location ? { redirectsTo: redirect ?? got.location } : {}) });
		if (redirect) note(redirect, 'redirect');
		if (!got.body) return;
		if (/<(rss|feed|rdf:RDF)[\s>]/.test(got.body.slice(0, 4096))) {
			found.get(route)!.add('feed');
			for (const href of feedLinks(got.body)) {
				const target = routeOf(href, url, origin);
				if (target) note(target, 'feed');
			}
			return;
		}
		if (!/html/.test(got.contentType)) return;
		const base = /<base\b[^>]*\bhref\s*=\s*["']([^"']+)["']/i.exec(got.body)?.[1];
		const from = base ? new URL(decode(base), url).href : url;
		const targets = pageLinks(got.body).flatMap((href) => routeOf(href, from, origin) ?? []);
		const shape = shapeOf(route);
		const key = `${shape} ${contentOf(got.body)}`;
		const sameAs = pages.get(key);
		const onward = targets.find((t) => t !== route && !found.has(t) && shapeOf(t) === shape);
		if (sameAs && onward) {
			repeats.push({ route, sameAs, next: onward });
			return;
		}
		if (!sameAs) pages.set(key, route);
		for (const target of targets) note(target, 'crawl');
		for (const m of got.body.matchAll(/<link\b[^>]*\bhreflang\s*=[^>]*>/gi)) {
			const href = /\bhref\s*=\s*["']([^"']+)["']/i.exec(m[0])?.[1];
			const target = href && routeOf(href, from, origin);
			if (target) note(target, 'hreflang');
		}
	};
	const worker = async () => {
		while (next < queue.length && fetched < bound) {
			const route = queue[next++]!;
			fetched++;
			await visit(route);
		}
	};
	// Workers stop when the queue is momentarily empty while another is still parsing; run rounds until nothing is left.
	while (next < queue.length && fetched < bound) await Promise.all(Array.from({ length: CONCURRENCY }, worker));
	const routes = [...found].map(([route, sources]): PlannedRoute => {
		const fact = facts.get(route);
		return { route, sources: [...sources].sort(), ...(fact ? { status: fact.status, contentType: fact.contentType, ...(fact.redirectsTo ? { redirectsTo: fact.redirectsTo } : {}) } : {}) };
	});
	return { routes: routes.sort((a, b) => a.route.localeCompare(b.route)), fetched, bound, truncated: next < queue.length, sitemaps: sitemaps.sitemaps, repeats: repeats.sort((a, b) => a.route.localeCompare(b.route)) };
}

/** The routes a migration must port: every planned route the old app answers without an error (or has not been fetched yet). */
export function routesToPort(routes: readonly PlannedRoute[]): PlannedRoute[] {
	return routes.filter((r) => r.status === undefined || r.status < 400);
}
