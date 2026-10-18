import { matchRoute, planOrder, scanSource, specificity, type PlanStep, type SourceFacts, type SourceRoute } from '../source/index.ts';

export interface RouteUnionEntry {
	/** The source pattern, or the crawled path when no source route serves it. */
	readonly route: string;
	readonly knownBy: readonly ('source' | 'crawl')[];
	/** Crawled paths this pattern serves: the sample values for its dynamic segments. */
	readonly crawled: readonly string[];
	readonly file?: string;
	readonly line?: number;
	readonly dynamic?: boolean;
	readonly auth?: readonly string[];
	readonly kind?: 'page' | 'endpoint';
}

export interface SourceInventory extends SourceFacts {
	readonly path: string;
	/** Routes as file names spell them (`/[lang]/about`), kept for older readers of the inventory. */
	readonly fileRoutes: readonly string[];
	readonly order: readonly PlanStep[];
}

const servesGet = (r: SourceRoute) => r.kind === 'page' || !r.methods || r.methods.some((m) => m === 'GET' || m === '*' || m === 'ALL');

/** Every route either side knows: each crawled path under the most specific source pattern that serves it. */
export function unionRoutes(crawled: readonly string[], routes: readonly SourceRoute[]): RouteUnionEntry[] {
	const candidates = routes.filter(servesGet);
	const byPattern = new Map<string, string[]>();
	const orphans: string[] = [];
	for (const path of crawled) {
		const best = candidates.filter((r) => matchRoute(r.path, path)).sort((a, b) => specificity(b.path) - specificity(a.path))[0];
		if (best) byPattern.set(best.path, [...(byPattern.get(best.path) ?? []), path]);
		else orphans.push(path);
	}
	const entries: RouteUnionEntry[] = [];
	const seen = new Set<string>();
	for (const r of candidates) {
		if (seen.has(r.path)) continue;
		seen.add(r.path);
		const hits = byPattern.get(r.path) ?? [];
		entries.push({ route: r.path, knownBy: hits.length ? ['crawl', 'source'] : ['source'], crawled: [...hits].sort(), file: r.file, line: r.line, dynamic: r.dynamic, kind: r.kind, ...(r.auth ? { auth: r.auth } : {}) });
	}
	for (const path of orphans) entries.push({ route: path, knownBy: ['crawl'], crawled: [path] });
	return entries.sort((a, b) => a.route.localeCompare(b.route));
}

export async function scanForInventory(path: string, fileRoutes: readonly string[]): Promise<SourceInventory> {
	const facts = await scanSource(path);
	return { path, fileRoutes, ...facts, order: planOrder(facts) };
}

const count = <T>(items: readonly T[], key: (item: T) => string) => {
	const counts = new Map<string, number>();
	for (const item of items) counts.set(key(item), (counts.get(key(item)) ?? 0) + 1);
	return [...counts].map(([k, n]) => `${k} ${n}`).join(', ');
};

/** The route patterns a migration step is part of: a route's own pattern, the routes below a layout, the routes rendering a component. */
export function stepRoutes(source: Pick<SourceInventory, 'routes' | 'components'>, step: Pick<PlanStep, 'kind' | 'id' | 'file'>): string[] {
	const pages = source.routes.filter((r) => r.kind === 'page');
	const below = (file: string) => {
		const dir = file.includes('/') ? file.slice(0, file.lastIndexOf('/') + 1) : '';
		return pages.filter((r) => r.file.startsWith(dir) && !/\.html?$/.test(r.file));
	};
	const byId = new Map(source.components.map((c) => [c.id, c]));
	const files = new Set<string>();
	const queue = [step.id];
	const seen = new Set<string>();
	while (queue.length) {
		const id = queue.pop()!;
		if (seen.has(id)) continue;
		seen.add(id);
		const c = byId.get(id);
		if (!c) continue;
		if (c.kind === 'route' || c.kind === 'layout') files.add(c.file);
		queue.push(...c.usedBy);
	}
	if (!byId.has(step.id)) files.add(step.file);
	const kindOf = (file: string) => byId.get([...byId.keys()].find((id) => byId.get(id)!.file === file) ?? '')?.kind;
	const matched = [...files].flatMap((file) => [...(kindOf(file) === 'layout' ? below(file) : []), ...pages.filter((r) => (kindOf(file) !== 'layout' && r.file === file) || r.entries?.includes(file))]);
	return [...new Set(matched.map((r) => r.path))].sort();
}

/** A readable account of what the source scan found, for the plan output. */
export function summarizeSource(source: SourceInventory, union: readonly RouteUnionEntry[] = []): string {
	const lines = [`Source: ${source.framework ?? 'framework not recognised'} at ${source.path}`];
	const onlySource = union.filter((u) => u.knownBy.length === 1 && u.knownBy[0] === 'source');
	const onlyCrawl = union.filter((u) => u.knownBy.length === 1 && u.knownBy[0] === 'crawl');
	lines.push(`  Routes: ${source.routes.length} in source${union.length ? `; ${onlySource.length} only in source, ${onlyCrawl.length} only in the crawl` : ''}`);
	if (union.length) {
		for (const u of union) {
			const where = u.file ? `  ${u.file}:${u.line}` : '';
			const flag = u.knownBy.length === 2 ? (u.dynamic ? `  crawled ${u.crawled.join(', ')}` : '') : u.knownBy[0] === 'source' ? '  (only in source: not reached by the crawl)' : '  (only in the crawl: no source route serves it)';
			lines.push(`    ${u.route}${u.auth ? ` [${u.auth.join(', ')}]` : ''}${flag}${where}`);
		}
	} else for (const r of source.routes) lines.push(`    ${r.path}${r.kind === 'endpoint' ? ` (${r.methods?.join(', ') ?? 'endpoint'})` : ''}${r.auth ? ` [${r.auth.join(', ')}]` : ''}  ${r.file}:${r.line}`);
	const at = (x: { file: string; line: number }) => `${x.file}:${x.line}`;
	lines.push(`  Nondeterminism: ${source.nondeterminism.length ? count(source.nondeterminism, (n) => n.kind) : 'none found'}`);
	for (const n of source.nondeterminism) lines.push(`    ${n.kind} ${n.what} (${n.side})  ${at(n)}`);
	lines.push(`  Writes: ${source.writes.length || 'none found'}`);
	for (const w of source.writes) lines.push(`    ${w.method} ${w.path ?? '(same page)'}  ${w.via}${w.touches ? ` touching ${w.touches.join(', ')}` : ''}  ${at(w.handler)}`);
	lines.push(`  Clients: ${source.clients.length || 'none found'}`);
	for (const c of source.clients) lines.push(`    ${c.kind} ${c.base ?? ''}${(c.queries ?? []).join(' | ').slice(0, 120)}${c.fields?.length ? `  fields ${c.fields.join(', ')}` : ''}  ${at(c)}`);
	lines.push(`  Auth guards: ${source.authGuards.length || 'none found'}`);
	for (const g of source.authGuards) lines.push(`    ${g.role ?? 'signed-in'} via ${g.how} on ${[...g.routes, ...(g.writes ?? [])].join(', ')}${g.redirectTo ? `, login at ${g.redirectTo}` : ''}  ${at(g)}`);
	lines.push(`  Components: ${source.components.length}`);
	if (source.order.length) {
		lines.push('  Migration order (shared layouts and components first, each before what renders it):');
		source.order.forEach((step, i) => {
			const routes = stepRoutes(source, step);
			lines.push(`    ${String(i + 1).padStart(2)}. ${step.kind} ${step.name}  ${step.file}${step.unlocks ? `  unlocks ${step.unlocks}` : ''}${routes.length ? `  routes ${routes.join(', ')}` : ''}`);
		});
	}
	for (const limit of source.limits) lines.push(`  Limit: ${limit}`);
	return `${lines.join('\n')}\n`;
}
