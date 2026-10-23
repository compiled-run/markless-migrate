import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { bypassOptions } from '../check/blocked.ts';
import type { Inventory } from '../plan/inventory.ts';
import { applyCaching, fragmentEndMarkers, fragmentHeader, fragmentPath, type ApplyResult } from './apply.ts';
import { pageFilesByConvention, pageFilesFromOrigin } from './pages.ts';
import { planCaching, readCachingPlan, summarizeCachingPlan, writeCachingPlan, type CachingPlan } from './plan.ts';
import { summarizeCachingReport, verifyCaching } from './verify.ts';
import { psiFailures, psiLines } from '../check/load.ts';
import { measurePsi, PSI_NOTICE, psiKey } from '../check/psi.ts';

const STATE_DIR = '.migrate';

export const CACHE_USAGE = `  cache plan [--old <origin>] [--route <path>]... [--header <name:value>]...
          Classify every route of the inventory as prerender, CDN with revalidation, or never cached, from
          the old app's response headers (Cache-Control, ETag, Vary, Set-Cookie, Age, x-vercel-cache,
          cf-cache-status) and its source (auth guards, request reads, server data), with the reason, into
          .migrate/caching.json. plan runs it after the inventory.
  cache apply [--app <dir>] [--new <origin>] [--prerender]
          Write the plan into the Markless app as migrate-cache.ts (Nitro routeRules) and
          add migrateCache() to its vite.config.ts. A page the app reads cookies or the session in is never
          cached. run applies it before every build.
  cache check --new <origin> [--app <dir>] [--passes <n>] [--expiry-wait <s>] [--json] [--no-psi] [--psi-key <key>]
          Read the deployment's caching (x-vercel-cache MISS then HIT, Age, Cache-Control, Vary) route by route
          into .migrate/caching-report.json, then the homepage's load on PageSpeed Insights, old against new
          (--no-psi leaves it out; the key as in check). Each page's fragment and document are asked for in both orders on
          fresh or expired entries (waiting out revalidations up to --expiry-wait, default 130 s). Exits 1 when a
          personal page or a cookie is cached, a document request gets a fragment or a fragment request a
          document, a page that reads the query does not render it, HTML is kept long after it changes, a static
          page or one the old site cached is not kept, or a content-hashed file is not kept by browsers.
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
		const fragments = result.fragmentPath ? `, each page's ${result.fragmentPath}/ fragment cached as the page is` : result.fragmentHeader ? `, pages kept by the CDN by Cache-Control since ${result.fragmentHeader} requests share their URL (Vercel's ISR keeps one entry per URL)` : '';
		const query = result.routes.some((r) => r.status === 200 && r.class !== 'no-cache' && r.allowQuery?.length) ? (result.passQuery ? `, pages that read the query on ISR with passQuery (nitro ${result.nitro})` : `, pages that read the query kept by the CDN by Cache-Control (nitro ${result.nitro ?? 'not installed'} drops the query on ISR)`) : '';
		out(`Wrote ${result.module}: ${result.routes.length} of ${plan.routes.length} planned routes are rendered by the app's pages; ${Object.keys(result.rules.routeRules).length} routeRules${fragments}${query}\n`);
		for (const r of changed) out(`  ${r.route}: ${r.class} because ${r.reasons[0]}\n`);
		out(result.wired ? `vite.config.ts uses migrateCache()\n` : `vite.config.ts has no plugins array: add migrateCache() from ./migrate-cache.ts to it\n`);
		return result.wired ? 0 : 1;
	}
	if (sub === 'check') {
		const { values } = parseArgs({ args: rest, options: { new: { type: 'string' }, app: { type: 'string' }, passes: { type: 'string' }, json: { type: 'boolean' }, route: { type: 'string', multiple: true }, 'expiry-wait': { type: 'string' }, 'no-psi': { type: 'boolean' }, 'psi-key': { type: 'string' } } });
		if (!values.new) throw new Error('cache check needs --new <origin>');
		const plan = await readCachingPlan(join(cwd, STATE_DIR));
		if (!plan) throw new Error('cache check needs .migrate/caching.json: run cache plan first');
		const header = await fragmentHeader(resolve(cwd, values.app ?? '.'));
		const prefix = await fragmentPath(resolve(cwd, values.app ?? '.'));
		const markers = await fragmentEndMarkers(resolve(cwd, values.app ?? '.'));
		const judged = plan.applied ?? plan.routes;
		const routes = values.route?.length ? judged.filter((r) => values.route!.includes(r.route)) : judged;
		const report = await verifyCaching(values.new, routes, { ...(header ? { fragmentHeader: header } : {}), ...(prefix ? { fragmentPath: prefix } : {}), fragmentMarkers: markers, oldOrigin: plan.origin, ...(values.passes ? { passes: Number(values.passes) } : {}), ...(values['expiry-wait'] ? { expiryWaitS: Number(values['expiry-wait']) } : {}) }, plan.hashedAssets);
		await writeFile(join(cwd, STATE_DIR, 'caching-report.json'), `${JSON.stringify(report, null, '\t')}\n`);
		out(values.json ? `${JSON.stringify(report, null, '\t')}\n` : summarizeCachingReport(report));
		// The deployed pages' load, old against new, on PageSpeed Insights: what the caching was for.
		let slower = false;
		if (!values['no-psi'] && !values.json) {
			const key = values['psi-key'] ?? psiKey(cwd);
			const route = routes.find((r) => r.route === '/')?.route ?? routes[0]?.route ?? '/';
			const psi = await measurePsi({ old: plan.origin, new: values.new }, route, { ...(key ? { key } : {}), strategies: ['mobile'] });
			const failures = psiFailures(route, psi) ?? [];
			slower = failures.length > 0;
			out(`\nPage load of ${route}, deployed:\n${psiLines(psi).map((l) => `  ${l}`).join('\n')}\n${failures.map((f) => `  FAIL ${f.check}: ${f.actual}\n`).join('')}${key ? '' : `\n${PSI_NOTICE}\n`}`);
		}
		return report.findings.length || slower ? 1 : 0;
	}
	throw new Error(`cache needs plan, apply or check\n\n${CACHE_USAGE}`);
}
