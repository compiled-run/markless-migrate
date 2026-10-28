import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { PORTS } from '../convert/parts.ts';

/** A route glob: `*` is any text within one path segment, `**` any text across segments. */
export function routeGlob(glob: string): RegExp {
	const source = glob.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*\*/g, '\u0000').replace(/\*/g, '[^/]*').replace(/\u0000/g, '.*');
	return new RegExp(`^${source}$`);
}

/** Which port modules each converted route's page loads, by route (`ports` in convert's report). */
export type PortMap = Readonly<Record<string, readonly string[]>>;

/** The ports module a file under `parts/` is: `base-ui/combobox.ts` is `base-ui/combobox`. */
export const moduleOf = (file: string): string => file.replace(/\\/g, '/').replace(/\.ts$/, '');

/** The modules every page loads whatever its ports: a change to one touches every route. */
const EVERY_PAGE = new Set(['index', 'reveal', 'registry', 'choices']);

/** The port modules that load `module`: itself, and every port that needs it, directly or through another module. */
export function portsLoading(module: string): Set<string> | 'every' {
	if (EVERY_PAGE.has(module)) return 'every';
	const found = new Set([module]);
	for (let grew = true; grew; ) {
		grew = false;
		for (const p of PORTS) if (!found.has(p.module) && (p.needs ?? []).some((n) => found.has(n))) found.add(p.module), (grew = true);
	}
	return found;
}

/** The routes whose pages load a port touched by a change to `module`, among `routes` (all of them when the map does not know). */
export function routesUsing(module: string, map: PortMap, routes: readonly string[]): string[] {
	const loading = portsLoading(module);
	if (loading === 'every') return [...routes];
	return routes.filter((r) => !map[r] || map[r]!.some((p) => loading.has(p)));
}

export interface RouteChoice {
	readonly route?: readonly string[];
	readonly routes?: string;
	readonly part?: string;
}

/** The routes a dev run takes: those named, those a glob matches, and those whose page loads the part named. */
export function selectRoutes(choice: RouteChoice, pages: readonly string[], map: PortMap): { routes: string[]; unknown: string[] } {
	const picked = new Set<string>();
	const unknown: string[] = [];
	for (const r of choice.route ?? []) (pages.includes(r) ? picked.add(r) : unknown.push(r));
	if (choice.routes) for (const r of pages) if (routeGlob(choice.routes).test(r)) picked.add(r);
	if (choice.part) {
		const loading = portsLoading(moduleOf(choice.part));
		for (const r of pages) if (map[r] && (loading === 'every' || map[r]!.some((p) => loading.has(p)))) picked.add(r);
	}
	return { routes: pages.filter((r) => picked.has(r)), unknown };
}

/** Reads a convert report's routes into the port map, over what `map` knew (a subset convert updates only its routes). */
export async function readPortMap(report: string, map: PortMap = {}): Promise<PortMap> {
	const routes = await readFile(report, 'utf8').then((t) => (JSON.parse(t) as { routes?: { route: string; ports?: string[] }[] }).routes ?? [], () => []);
	const next: Record<string, readonly string[]> = { ...map };
	for (const r of routes) if (r.ports) next[r.route] = r.ports;
	return next;
}

export async function writePortMap(file: string, map: PortMap): Promise<void> {
	await mkdir(dirname(file), { recursive: true });
	await writeFile(file, `${JSON.stringify(map, null, '\t')}\n`);
}

/** The HTML pages plan found, in inventory order. */
export async function inventoryPages(app: string): Promise<{ pages: string[]; origin?: string; source?: string }> {
	const inventory = JSON.parse(await readFile(join(app, '.migrate', 'inventory.json'), 'utf8')) as { origin?: string; source?: { path?: string }; routes: { route: string; status: number }[]; allRoutes?: { route: string; status?: number; contentType?: string }[] };
	// As convert takes them: the routes plan loaded, and every route it found with an answer.
	const types = new Map((inventory.allRoutes ?? []).map((r) => [r.route, r.contentType]));
	const all = new Map<string, number>(inventory.routes.map((r) => [r.route, r.status]));
	for (const r of inventory.allRoutes ?? []) if (r.status !== undefined) all.set(r.route, r.status);
	const pages = [...all].filter(([route, status]) => status === 200 && (types.get(route) ?? 'text/html').includes('html')).map(([route]) => route);
	return { pages, ...(inventory.origin ? { origin: inventory.origin } : {}), ...(inventory.source?.path ? { source: inventory.source.path } : {}) };
}
