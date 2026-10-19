import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ANONYMOUS } from '../check/auth.ts';
import { plannedRoutes, type Inventory } from '../plan/inventory.ts';
import { classify, type CacheClass, type RouteCaching } from './classify.ts';
import { fetchFacts, probeRoutes, type RouteEvidence } from './evidence.ts';
import { isContentHashed, longLived, parseCacheControl } from './headers.ts';
import { oldRouteSignals } from './signals.ts';

export interface CachingPlan {
	readonly version: 1;
	readonly origin: string;
	readonly generatedAt: string;
	readonly routes: readonly RouteCaching[];
	/** Content-hashed files of the old site that it let browsers keep a long time: the new app must too. */
	readonly hashedAssets: readonly { readonly path: string; readonly cacheControl?: string; readonly longLived: boolean }[];
	/** The routes the Markless app's pages render, classified again with what those pages read: written by cache apply, judged by cache check. */
	readonly applied?: readonly RouteCaching[];
	/** The raw evidence per route, so a later apply or check can classify again without fetching. */
	readonly evidence: readonly RouteEvidence[];
}

export const CACHING_FILE = 'caching.json';

// Frameworks whose pages render on the server: their data fetches run per request, not in the browser.
const SERVER_RENDERED = /^(next|nuxt|astro|@sveltejs\/kit|sveltekit|remix|@remix-run\/react|react-router|rails|django|laravel|wordpress|express|fastify|hono|docusaurus)$/i;

export interface PlanCachingOptions {
	readonly headers?: Readonly<Record<string, string>>;
	/** Routes to classify (default: every route the inventory plans to port, pages and endpoints). */
	readonly routes?: readonly string[];
	readonly gapMs?: number;
	readonly concurrency?: number;
}

/** Classifies every route's caching from the old app's response headers and its source, and why. */
export async function planCaching(inventory: Inventory, options: PlanCachingOptions = {}): Promise<CachingPlan> {
	const routes = [...new Set(options.routes ?? plannedRoutes(inventory))];
	const evidence = await probeRoutes(inventory.origin, routes, { ...(options.headers ? { headers: options.headers } : {}), gapMs: options.gapMs ?? 1500, cookieProbe: true, concurrency: options.concurrency ?? 8 });
	const signedIn = new Set((inventory.allRoutes ?? []).filter((r) => r.roles?.length && !r.roles.includes(ANONYMOUS)).map((r) => r.route));
	const source = inventory.source;
	const serverRendered = source?.framework ? SERVER_RENDERED.test(source.framework) : undefined;
	const classified: RouteCaching[] = [];
	for (const e of evidence) {
		const old = source ? await oldRouteSignals(source, e.route) : undefined;
		classified.push(classify({ evidence: e, ...(old ? { old } : {}), signedInOnly: signedIn.has(e.route), ...(serverRendered !== undefined ? { serverRendered } : {}) }));
	}
	const assetPaths = [...new Set(inventory.routes.flatMap((r) => r.assets.map((a) => a.url)).filter((u) => u.startsWith('/') && isContentHashed(u)))].sort().slice(0, 300);
	const hashedAssets: { path: string; cacheControl?: string; longLived: boolean }[] = [];
	for (const path of assetPaths) {
		const facts = await fetchFacts(new URL(path, inventory.origin).href, options.headers).catch(() => undefined);
		if (!facts || facts.status !== 200) continue;
		hashedAssets.push({ path, ...(facts.cacheControl ? { cacheControl: facts.cacheControl } : {}), longLived: longLived(parseCacheControl(facts.cacheControl)) });
	}
	return { version: 1, origin: inventory.origin, generatedAt: new Date().toISOString(), routes: classified, hashedAssets, evidence };
}

export async function writeCachingPlan(plan: CachingPlan, dir: string): Promise<string> {
	await mkdir(dir, { recursive: true });
	const path = join(dir, CACHING_FILE);
	await writeFile(path, `${JSON.stringify(plan, null, '\t')}\n`);
	return path;
}

export async function readCachingPlan(dir: string): Promise<CachingPlan | undefined> {
	try {
		return JSON.parse(await readFile(join(dir, CACHING_FILE), 'utf8')) as CachingPlan;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
		throw error;
	}
}

export function classShares(routes: readonly RouteCaching[]): Record<CacheClass, number> {
	const out: Record<CacheClass, number> = { prerender: 0, isr: 0, 'no-cache': 0 };
	for (const r of routes) out[r.class]++;
	return out;
}

const pct = (n: number, of: number) => (of ? `${Math.round((100 * n) / of)}%` : '0%');

export function summarizeCachingPlan(plan: CachingPlan): string {
	const pages = plan.routes.filter((r) => r.status === 200);
	const shares = classShares(pages);
	const lines = [`Caching for ${pages.length} routes answered 200 on ${plan.origin}: prerender ${shares.prerender} (${pct(shares.prerender, pages.length)}), CDN with revalidation ${shares.isr} (${pct(shares.isr, pages.length)}), never cached ${shares['no-cache']} (${pct(shares['no-cache'], pages.length)})`];
	for (const r of pages.filter((p) => p.class !== 'prerender')) lines.push(`  ${r.class.padEnd(9)}${r.route}${r.revalidate ? ` (revalidate ${r.revalidate} s)` : ''}: ${r.reasons[0]}`);
	const short = plan.hashedAssets.filter((a) => !a.longLived);
	lines.push(`${plan.hashedAssets.length} content-hashed files on the old site${short.length ? `, ${short.length} of them not kept long by browsers there` : ''}`);
	return `${lines.join('\n')}\n`;
}
