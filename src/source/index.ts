import { scanAuth } from './auth.ts';
import { scanClients } from './clients.ts';
import { planOrder, scanComponents } from './components.ts';
import { createContext } from './context.ts';
import { openProject } from './files.ts';
import { detectFramework } from './framework.ts';
import { scanNondeterminism } from './nondeterminism.ts';
import { scanRedirects } from './redirects.ts';
import { codeRoutes, routesConfig } from './routes/config.ts';
import { djangoRoutes } from './routes/django.ts';
import { astroRoutes, htmlRoutes, nextRoutes, nuxtRoutes, remixFlatRoutes, solidStartRoutes, svelteKitRoutes, tanstackRoutes } from './routes/files.ts';
import { laravelRoutes } from './routes/laravel.ts';
import { railsRoutes } from './routes/rails.ts';
import { serverRoutes } from './routes/servers.ts';
import { wordpressRoutes } from './routes/wordpress.ts';
import type { AuthGuard, SourceFacts, SourceRoute, Write } from './types.ts';
import { scanWrites, settleWrites } from './writes.ts';

export type * from './types.ts';
export { matchRoute, specificity } from './pattern.ts';
export { planOrder };

const FILE_ROUTERS: Record<string, (ctx: ReturnType<typeof createContext>) => Promise<SourceRoute[]>> = {
	next: nextRoutes,
	sveltekit: svelteKitRoutes,
	nuxt: nuxtRoutes,
	astro: astroRoutes,
	'solid-start': solidStartRoutes,
	'tanstack-router': tanstackRoutes,
	'tanstack-start': tanstackRoutes,
};

function mergeRoutes(routes: SourceRoute[]): SourceRoute[] {
	const out = new Map<string, SourceRoute>();
	for (const r of routes) {
		const key = `${r.kind} ${r.path.toLowerCase()}`;
		const prior = out.get(key);
		if (!prior) out.set(key, { ...r, ...(r.methods ? { methods: [...r.methods] } : {}) });
		else if (r.methods) prior.methods = [...new Set([...(prior.methods ?? []), ...r.methods])];
	}
	return [...out.values()].sort((a, b) => a.path.localeCompare(b.path) || a.kind.localeCompare(b.kind));
}

/** Reads an app's source with real parsers and reports what a migration has to preserve. Never runs the app. */
export async function scanSource(dir: string): Promise<SourceFacts> {
	const project = await openProject(dir);
	const ctx = createContext(project);
	const framework = await detectFramework(project);
	const routes: SourceRoute[] = [];
	const writes: Write[] = [];
	const guards: AuthGuard[] = [];
	if (framework && FILE_ROUTERS[framework]) routes.push(...(await FILE_ROUTERS[framework](ctx)));
	if (framework === 'remix' || framework === 'react-router') {
		routes.push(...((await routesConfig(ctx)) ?? (project.files.some((f) => f.startsWith('app/routes/')) ? await remixFlatRoutes(ctx) : [])));
	}
	if (framework === 'vite' || framework === null) routes.push(...htmlRoutes(ctx));
	const code = await codeRoutes(ctx);
	routes.push(...code.routes);
	guards.push(...code.guards);
	for (const reader of [serverRoutes, railsRoutes, laravelRoutes, djangoRoutes, wordpressRoutes]) {
		const found = await reader(ctx);
		routes.push(...found.routes);
		writes.push(...found.writes);
		guards.push(...found.guards);
	}
	const merged = mergeRoutes(routes);
	const sites = await scanWrites(ctx, merged);
	const clients = await scanClients(ctx);
	writes.push(...sites.writes, ...clients.writes);
	guards.push(...(await scanAuth(ctx, merged)));
	const nondeterminism = await scanNondeterminism(ctx, framework);
	const components = await scanComponents(ctx, merged);
	const redirects = await scanRedirects(ctx);
	for (const g of guards) {
		for (const path of g.routes) {
			for (const r of merged) {
				if (r.path !== path) continue;
				const label = g.role ?? 'signed-in';
				r.auth = [...new Set([...(r.auth ?? []), label])].sort();
			}
		}
	}
	const mergedGuards = new Map<string, AuthGuard>();
	for (const g of guards) {
		const key = `${g.file}:${g.line}:${g.how}:${g.role}`;
		const prior = mergedGuards.get(key);
		if (prior) {
			prior.routes = [...new Set([...prior.routes, ...g.routes])];
			if (g.writes) prior.writes = [...new Set([...(prior.writes ?? []), ...g.writes])];
		}
		else mergedGuards.set(key, { ...g, routes: [...g.routes] });
	}
	const byLocation = (a: { file: string; line: number }, b: { file: string; line: number }) => a.file.localeCompare(b.file) || a.line - b.line;
	return {
		framework,
		routes: merged,
		nondeterminism: nondeterminism.sort(byLocation),
		writes: settleWrites(writes, sites.plain ?? new Set()).sort((a, b) => byLocation(a.handler, b.handler) || a.method.localeCompare(b.method)),
		clients: clients.clients.sort(byLocation),
		authGuards: [...mergedGuards.values()].sort(byLocation),
		components,
		limits: [...new Set(ctx.limits)].sort(),
		...(redirects.length ? { redirects } : {}),
	};
}
