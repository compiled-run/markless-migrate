// Pages the original serves that the inventory does not list: found where the old page links to them or a journey went, judged here without a browser (judges-pure.test.ts).
import { HINTS } from './hints.ts';
import type { RecordedJourney } from './journeys.ts';
import { matchRoute } from '../source/pattern.ts';
import type { Failure, RouteCapture } from './types.ts';

/** What the plan lists: every route it found, and the source's route patterns (`/news/:slug`). */
export interface InventoryRoutes {
	readonly routes: readonly string[];
	readonly patterns: readonly string[];
}

/** How the old app answered a path: its status and whether it is a page. */
export interface Served {
	readonly path: string;
	readonly status: number;
	readonly page: boolean;
	/** Where it ended after redirects, by path. */
	readonly landed: string;
}

/** Paths probed at most per route; any beyond are reported as not probed. */
export const MAX_UNLISTED = 40;

const trim = (p: string) => (p.length > 1 && p.endsWith('/') ? p.slice(0, -1) : p);
const listed = (inventory: InventoryRoutes, path: string) => {
	const at = trim(path.split(/[?#]/)[0]!);
	return inventory.routes.some((r) => trim(r.split(/[?#]/)[0]!) === at) || inventory.patterns.some((p) => matchRoute(p, at));
};
// A file the page links to (a PDF, an image, a feed) is an asset or an endpoint, not a page to port.
const looksLikeFile = (path: string) => /\.[a-z0-9]{2,5}$/i.test(path.split(/[?#]/)[0]!);

/** The paths of the old app's own pages this route's old page links to or a journey reached, that the inventory does not list. */
export function unlistedCandidates(route: string, olds: readonly RouteCapture[], journeys: readonly RecordedJourney[], inventory: InventoryRoutes): string[] {
	const linked = olds.flatMap((o) => Object.values(o.pages).flatMap((p) => p.links ?? []));
	const reached = journeys.flatMap((j) => j.expected.filter((r) => r.navigated && !r.door).map((r) => r.url));
	const paths = [...new Set([...linked, ...reached].filter((p) => p.startsWith('/') && !looksLikeFile(p)).map((p) => p.split('#')[0]!))];
	return paths.filter((p) => trim(p) !== trim(route) && !listed(inventory, p)).sort();
}

/** Red for each path the old app answers with a page that the inventory does not list, and for paths left unprobed past the cap. */
export function unlistedFailures(route: string, candidates: readonly string[], served: readonly Served[], inventory: InventoryRoutes): Failure[] {
	const failures: Failure[] = [];
	for (const s of served) {
		// A link that leaves for another site (a chat invite, a sponsor) lands on that site's page, not the original's.
		if (s.status >= 400 || !s.page || !s.landed.startsWith('/') || listed(inventory, s.landed)) continue;
		failures.push({ route, dimension: 'coverage', check: `a page the inventory does not list: ${s.path}`, expected: 'every page the original serves is in .migrate/inventory.json, so it is checked', actual: `the original serves ${s.path}${s.landed !== s.path ? ` (landing on ${s.landed})` : ''} with ${s.status}, linked from ${route} or reached by its journeys, and the inventory does not list it`, hint: HINTS.unlistedRoute });
	}
	const left = candidates.length - served.length;
	if (left > 0) failures.push({ route, dimension: 'coverage', check: 'pages the inventory does not list, past the probe limit', expected: `at most ${MAX_UNLISTED} linked paths the inventory does not list, each asked of the original`, actual: `${left} more linked path${left === 1 ? '' : 's'} the inventory does not list were not asked: ${candidates.slice(served.length, served.length + 5).join(', ')}${left > 5 ? ', ...' : ''}`, hint: HINTS.unlistedRoute });
	return failures;
}

/** The routes and route patterns a plan's inventory lists. */
export function inventoryRoutes(inventory: { readonly routes: readonly { readonly route: string }[]; readonly allRoutes?: readonly { readonly route: string }[]; readonly routeUnion?: readonly { readonly route: string }[] }): InventoryRoutes {
	const routes = [...new Set([...inventory.routes, ...(inventory.allRoutes ?? [])].map((r) => r.route))].sort();
	const patterns = [...new Set((inventory.routeUnion ?? []).map((r) => r.route).filter((r) => /[:*[]/.test(r)))].sort();
	return { routes, patterns };
}
