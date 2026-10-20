import { refineWithNewSource } from './apply.ts';
import type { CacheClass } from './classify.ts';
import { pageFilesByConvention } from './pages.ts';
import type { CachingPlan } from './plan.ts';

export interface CachingRegression {
	readonly route: string;
	readonly old: CacheClass;
	readonly new: CacheClass;
	/** The new source's reads that cost the route its caching, with file and line. */
	readonly reads: readonly string[];
	readonly expected: string;
	readonly actual: string;
	readonly fix: string;
}

const NAMES: Record<CacheClass, string> = { prerender: 'built ahead and served from the CDN', isr: 'served from the CDN with revalidation', 'no-cache': 'never cached' };

/**
 * Routes the old app let a CDN keep that the Markless app's own source makes uncacheable, read from the source before any
 * deploy: a page whose server code reads a cookie the old app read in the browser is personal only because of the port.
 */
export async function cachingRegressions(plan: CachingPlan, app: string, routes: readonly string[]): Promise<CachingRegression[]> {
	const wanted = new Set(routes);
	const indices = plan.evidence.flatMap((e, i) => (wanted.has(e.route) ? [i] : []));
	if (!indices.length) return [];
	const subset: CachingPlan = { ...plan, evidence: indices.map((i) => plan.evidence[i]!), routes: indices.map((i) => plan.routes[i]!) };
	const files = await pageFilesByConvention(app, subset.routes.map((r) => r.route));
	const refined = await refineWithNewSource(subset, app, files);
	const out: CachingRegression[] = [];
	for (const [i, next] of refined.entries()) {
		const prior = subset.routes[i]!;
		if (prior.class === next.class || next.class !== 'no-cache' || prior.status !== 200) continue;
		const reads = next.reasons.filter((r) => r.startsWith('new source')).map((r) => r.replace(/^new source /, ''));
		if (!reads.length) continue;
		out.push({
			route: next.route,
			old: prior.class,
			new: next.class,
			reads,
			expected: `${NAMES[prior.class]}, as on the old site`,
			actual: `${NAMES[next.class]}: the port's server code ${reads.join('; ')}`,
			fix: 'The old app reads nothing from the request on the server. Read these values in the browser, as the old app does (a value the first paint needs, such as a theme class, from an inline script before it paints), so the page is the same for every visitor and cache apply can cache it again.',
		});
	}
	return out;
}

/** The failure block run's check adds for one route, in check's own layout; `others` are the routes the same reads keep uncached. */
export function formatRegression(r: CachingRegression, others: readonly string[]): string {
	const shared = others.length ? ` The port does the same on ${others.length} more route${others.length === 1 ? '' : 's'} (${others.join(', ')}): one shared change covers them all.` : '';
	return `FAIL  ${r.route}  [caching]  read from the port's source, before any deploy
      caching: the CDN cannot keep this page
        expected: ${r.expected}
        actual:   ${r.actual}
        fix:      ${r.fix}${shared} The route stays red until it is fixed.
`;
}
