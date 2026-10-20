import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { bypassOptions } from '../check/blocked.ts';
import type { Inventory } from '../plan/inventory.ts';
import { applyCaching, fragmentHeader, fragmentPath, type ApplyResult } from './apply.ts';
import { pageFilesByConvention, pageFilesFromOrigin } from './pages.ts';
import { planCaching, readCachingPlan, summarizeCachingPlan, writeCachingPlan, type CachingPlan } from './plan.ts';
import { summarizeCachingReport, verifyCaching } from './verify.ts';

const STATE_DIR = '.migrate';

export const CACHE_USAGE = `  cache plan [--old <origin>] [--route <path>]... [--header <name:value>]...
          Classify every route of the inventory as prerender, CDN with revalidation, or never cached, from
          the old app's response headers (Cache-Control, ETag, Vary, Set-Cookie, Age, x-vercel-cache,
          cf-cache-status) and its source (auth guards, request reads, server data), with the reason, into
          .migrate/caching.json. plan runs it after the inventory.
  cache apply [--app <dir>] [--new <origin>] [--prerender]
          Write the plan into the Markless app as migrate-cache.ts (Nitro routeRules and Vercel routes) and
          add migrateCache() to its vite.config.ts. A page the app reads cookies or the session in is never
          cached. run applies it before every build.
  cache check --new <origin> [--app <dir>] [--passes <n>] [--json]
          Read the deployment's caching (x-vercel-cache MISS then HIT, Age, Cache-Control, Vary) route by route
          into .migrate/caching-report.json. Exits 1 when a personal page or a cookie is cached, a fragment and a
          document share an entry, HTML is kept long after it changes, a static page or one the old site cached
          is not kept, or a content-hashed file is not kept by browsers.
`;

async function readInventory(cwd: string): Promise<Inventory | undefined> {
	return JSON.parse(await readFile(join(cwd, STATE_DIR, 'inventory.json'), 'utf8').catch(() => 'null')) as Inventory | undefined;
}

/** Plans caching from the inventory and writes .migrate/caching.json. */
export async function planAndWrite(cwd: string, inventory: Inventory, options: { readonly headers?: Record<string, string>; readonly routes?: readonly string[] } = {}): Promise<{ plan: CachingPlan; path: string; text: string }> {
	const plan = await planCaching(inventory, options);
	const path = await writeCachingPlan(plan, join(cwd, STATE_DIR));
	return { plan, path, text: summarizeCachingPlan(plan) };
}

/** Applies .migrate/caching.json to the app when there is one: what run does before every build. */
export async function applyIfPlanned(cwd: string, app: string): Promise<ApplyResult | undefined> {
	const plan = await readCachingPlan(join(cwd, STATE_DIR));
	if (!plan) return undefined;
	const result = await applyCaching(plan, app, await pageFilesByConvention(app, plan.routes.map((r) => r.route)));
	await writeCachingPlan({ ...plan, applied: result.routes }, join(cwd, STATE_DIR));
	return result;
}

export async function cacheCommand(args: readonly string[], cwd: string, out: (text: string) => void): Promise<number> {
	const [sub, ...rest] = args;
	if (sub === 'plan') {
		const { values } = parseArgs({ args: rest, options: { old: { type: 'string' }, route: { type: 'string', multiple: true }, header: { type: 'string', multiple: true } } });
		const inventory = await readInventory(cwd);
		if (!inventory && !values.old) throw new Error('cache plan needs .migrate/inventory.json (run plan) or --old <origin> with --route');
		const base: Inventory = inventory ? { ...inventory, ...(values.old ? { origin: values.old } : {}) } : ({ version: 1, origin: values.old!, generatedAt: '', limit: 0, truncated: false, routes: [], locales: [], localeRouting: { prefixes: [], negotiation: {} } } as Inventory);
		const { path, text } = await planAndWrite(cwd, base, { headers: bypassOptions(values.header).headers ?? {}, ...(values.route?.length ? { routes: values.route } : {}) });
		out(`${text}Wrote ${path}\n`);
		return 0;
	}
	if (sub === 'apply') {
		const { values } = parseArgs({ args: rest, options: { app: { type: 'string' }, new: { type: 'string' }, prerender: { type: 'boolean' } } });
		const plan = await readCachingPlan(join(cwd, STATE_DIR));
		if (!plan) throw new Error('cache apply needs .migrate/caching.json: run cache plan first');
		const app = resolve(cwd, values.app ?? '.');
		const routes = plan.routes.map((r) => r.route);
		const files = values.new ? { ...(await pageFilesByConvention(app, routes)), ...(await pageFilesFromOrigin(values.new, routes)) } : await pageFilesByConvention(app, routes);
		const result = await applyCaching(plan, app, files, { ...(values.prerender ? { prerender: true } : {}) });
		await writeCachingPlan({ ...plan, applied: result.routes }, join(cwd, STATE_DIR));
		const before = new Map(plan.routes.map((r) => [r.route, r.class]));
		const changed = result.routes.filter((r) => r.class !== before.get(r.route));
		out(`Wrote ${result.module}: ${result.routes.length} of ${plan.routes.length} planned routes are rendered by the app's pages; ${Object.keys(result.rules.routeRules).length} routeRules, ${result.rules.vercelRoutes.length} Vercel routes${result.fragmentHeader ? ` keeping ${result.fragmentHeader} requests in their own CDN entries` : ''}${result.fragmentPath ? `, each page's ${result.fragmentPath}/ fragment cached as the page is` : ''}\n`);
		for (const r of changed) out(`  ${r.route}: ${r.class} because ${r.reasons[0]}\n`);
		out(result.wired ? `vite.config.ts uses migrateCache()\n` : `vite.config.ts has no plugins array: add migrateCache() from ./migrate-cache.ts to it\n`);
		return result.wired ? 0 : 1;
	}
	if (sub === 'check') {
		const { values } = parseArgs({ args: rest, options: { new: { type: 'string' }, app: { type: 'string' }, passes: { type: 'string' }, json: { type: 'boolean' }, route: { type: 'string', multiple: true } } });
		if (!values.new) throw new Error('cache check needs --new <origin>');
		const plan = await readCachingPlan(join(cwd, STATE_DIR));
		if (!plan) throw new Error('cache check needs .migrate/caching.json: run cache plan first');
		const header = await fragmentHeader(resolve(cwd, values.app ?? '.'));
		const prefix = await fragmentPath(resolve(cwd, values.app ?? '.'));
		const judged = plan.applied ?? plan.routes;
		const routes = values.route?.length ? judged.filter((r) => values.route!.includes(r.route)) : judged;
		const report = await verifyCaching(values.new, routes, { ...(header ? { fragmentHeader: header } : {}), ...(prefix ? { fragmentPath: prefix } : {}), ...(values.passes ? { passes: Number(values.passes) } : {}) }, plan.hashedAssets);
		await writeFile(join(cwd, STATE_DIR, 'caching-report.json'), `${JSON.stringify(report, null, '\t')}\n`);
		out(values.json ? `${JSON.stringify(report, null, '\t')}\n` : summarizeCachingReport(report));
		return report.findings.length ? 1 : 0;
	}
	throw new Error(`cache needs plan, apply or check\n\n${CACHE_USAGE}`);
}
