import { previousFilesGone } from './skew.ts';
import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { bypassOptions } from '../check/blocked.ts';
import type { Inventory } from '../plan/inventory.ts';
import { applyCaching, fragmentEndMarkers, fragmentHeader, fragmentPath, nitroPassesQuery, nitroVersion, requireInstalled, type ApplyResult } from './apply.ts';
import { checkCloudflareLive } from './cloudflare-live.ts';
import { checkCloudflareOutput, CLOUDFLARE_LIMITS, missingIsrFunctions } from './output.ts';
import { cacheRules, cloudflareRules } from './rules.ts';
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
  cache output [--app <dir>] [--vercel <dir> | --cloudflare [<dir>]]
          Read the app's Vercel build (default .vercel/output) before it is deployed: exits 1 when a page the plan
          caches, or its fragment URL, has no ISR function or static file there, so every request for it would run
          the server function. deploy runs it before uploading. With --cloudflare, reads a Nitro cloudflare-module
          build (default .output) instead: exits 1 when a page the plan caches, or its fragment URL, is not a file
          Cloudflare serves at that exact URL, or the upload exceeds the Workers limits (files, file size, Worker size).
  cache check --new <origin> --cloudflare --route <path>... [--app <dir>]
          Read a Cloudflare deployment: each page and its fragment URL must come from the uploaded files at its own URL
          (no redirect, not the Worker), be the document or the fragment asked for, and a client chunk arrive as brotli,
          kept for a year. Exits 1 on any finding.
  cache check --new <origin> [--app <dir>] [--header <name:value>]... [--passes <n>] [--expiry-wait <s>] [--json] [--no-psi] [--psi-key <key>]
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
	if (sub === 'output') {
		const cloudflareAt = rest.indexOf('--cloudflare');
		const cloudflare = cloudflareAt >= 0 ? (rest[cloudflareAt + 1] && !rest[cloudflareAt + 1]!.startsWith('--') ? rest[cloudflareAt + 1]! : '.output') : undefined;
		const own = cloudflareAt >= 0 ? rest.filter((_, i) => i !== cloudflareAt && !(i === cloudflareAt + 1 && rest[i] === cloudflare)) : rest;
		const { values } = parseArgs({ args: own, options: { app: { type: 'string' }, vercel: { type: 'string' } } });
		const app = resolve(cwd, values.app ?? '.');
		await requireInstalled(app);
		const plan = await readCachingPlan(join(cwd, STATE_DIR));
		if (!plan?.applied) throw new Error('cache output needs .migrate/caching.json with applied routes: run cache apply first');
		const header = await fragmentHeader(app);
		const prefix = await fragmentPath(app);
		if (cloudflare !== undefined) {
			const output = resolve(app, cloudflare);
			const expected = cloudflareRules(plan.applied, prefix ? { fragmentPath: prefix } : {});
			const report = await checkCloudflareOutput(output, expected.routeRules);
			const prerendered = Object.values(expected.routeRules).filter((r) => r.prerender).length;
			const fails = [
				...(report.missing.length ? [`${report.missing.length} of ${prerendered} cached paths are not a file Cloudflare serves at that URL, so every request for them runs the Worker:\n${report.missing.slice(0, 20).map((p) => `  ${p}\n`).join('')}${report.missing.length > 20 ? `  and ${report.missing.length - 20} more\n` : ''}`] : []),
				...(report.files > CLOUDFLARE_LIMITS.files ? [`${report.files} files to upload, over Workers' ${CLOUDFLARE_LIMITS.files} per version\n`] : []),
				...(report.headerRules > CLOUDFLARE_LIMITS.headerRules ? [`_headers has ${report.headerRules} rules, over the ${CLOUDFLARE_LIMITS.headerRules} a version upload accepts\n`] : []),
				...(report.tooLarge.length ? [`files over 25 MiB, which Workers static assets refuse: ${report.tooLarge.join(', ')}\n`] : []),
				...(report.workerBytes > CLOUDFLARE_LIMITS.workerBytes ? [`the Worker is ${report.workerBytes} bytes, over the 64 MiB limit\n`] : []),
				...(report.compressedCopies.length ? [`${report.compressedCopies.length} compressed copies Cloudflare never serves (Nitro's compressPublicAssets), e.g. ${report.compressedCopies.slice(0, 3).join(', ')}\n`] : []),
				...(report.workerFirst.length ? [`assets.run_worker_first sends ${report.workerFirst.length} uploaded files to the Worker, each request a billed Worker request, e.g. ${report.workerFirst.slice(0, 3).join(', ')}\n`] : []),
			];
			const rendered = plan.applied.filter((r) => r.status === 200 && !expected.routeRules[r.route.split(/[?#]/)[0]!]?.prerender).map((r) => r.route);
			out(`${output}: ${prerendered - report.missing.length} of ${prerendered} cached paths are files${prefix ? `, each page's ${prefix}/ fragment included` : ''}; ${report.files} files to upload; Worker ${(report.workerBytes / 1024 / 1024).toFixed(1)} MiB\n`);
			out(`The Worker runs for ${rendered.length} of the plan's pages${rendered.length ? ` (${rendered.slice(0, 10).join(', ')}${rendered.length > 10 ? `, and ${rendered.length - 10} more` : ''})` : ''}${prefix && rendered.length ? ' and their fragment URLs' : ''}, and for any URL that is not an uploaded file.\n`);
			for (const fail of fails) out(`FAIL ${fail}`);
			return fails.length ? 1 : 0;
		}
		const expected = cacheRules(plan.applied, { ...(header ? { fragmentHeader: header } : {}), ...(prefix ? { fragmentPath: prefix } : {}), passQuery: nitroPassesQuery(await nitroVersion(app)) });
		const output = resolve(app, values.vercel ?? '.vercel/output');
		const missing = await missingIsrFunctions(output, expected.routeRules);
		const cached = Object.values(expected.routeRules).filter((r) => r.isr !== undefined && r.isr !== false).length;
		if (!missing.length) {
			out(`${output}: all ${cached} cached paths have an ISR function${prefix ? `, each page's ${prefix}/ fragment included` : ''}\n`);
			return 0;
		}
		out(`FAIL ${output}: ${missing.length} of ${cached} cached paths have no ISR function or static file, so every request for them runs the server function:\n${missing.slice(0, 20).map((p) => `  ${p}\n`).join('')}${missing.length > 20 ? `  and ${missing.length - 20} more\n` : ''}Run cache apply with the app's dependencies installed, then build again.\n`);
		return 1;
	}
	if (sub === 'check') {
		const { values } = parseArgs({ args: rest, options: { new: { type: 'string' }, cloudflare: { type: 'boolean' }, previous: { type: 'string' }, app: { type: 'string' }, passes: { type: 'string' }, json: { type: 'boolean' }, route: { type: 'string', multiple: true }, header: { type: 'string', multiple: true }, 'expiry-wait': { type: 'string' }, 'no-psi': { type: 'boolean' }, 'psi-key': { type: 'string' } } });
		if (!values.new) throw new Error('cache check needs --new <origin>');
		if (values.cloudflare) {
			const app = resolve(cwd, values.app ?? '.');
			const prefix = await fragmentPath(app);
			const routes = values.route ?? [];
			if (!routes.length) throw new Error('cache check --cloudflare needs --route <path> for each page to read');
			const findings = await checkCloudflareLive(values.new, routes, { ...(prefix ? { fragmentPath: prefix } : {}), fragmentMarkers: await fragmentEndMarkers(app), ...(values.header?.length ? { headers: bypassOptions(values.header).headers ?? {} } : {}) });
			out(`${values.new}: ${routes.length} pages and their fragment URLs read${findings.length ? '' : ', all from the uploaded files'}\n${findings.map((f) => `  FAIL ${f.url} ${f.problem}\n`).join('')}`);
			return findings.length ? 1 : 0;
		}
		const plan = await readCachingPlan(join(cwd, STATE_DIR));
		if (!plan) throw new Error('cache check needs .migrate/caching.json: run cache plan first');
		await requireInstalled(resolve(cwd, values.app ?? '.'));
		const header = await fragmentHeader(resolve(cwd, values.app ?? '.'));
		const prefix = await fragmentPath(resolve(cwd, values.app ?? '.'));
		const markers = await fragmentEndMarkers(resolve(cwd, values.app ?? '.'));
		const judged = plan.applied ?? plan.routes;
		const routes = values.route?.length ? judged.filter((r) => values.route!.includes(r.route)) : judged;
		const report = await verifyCaching(values.new, routes, { ...(header ? { fragmentHeader: header } : {}), ...(prefix ? { fragmentPath: prefix } : {}), fragmentMarkers: markers, oldOrigin: plan.origin, ...(values.header?.length ? { headers: bypassOptions(values.header).headers ?? {} } : {}), ...(values.passes ? { passes: Number(values.passes) } : {}), ...(values['expiry-wait'] ? { expiryWaitS: Number(values['expiry-wait']) } : {}) }, plan.hashedAssets);
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
		// A tab opened on the deployment this one replaces asks for that deployment's files by their names.
		let gone = 0;
		if (values.previous) {
			const files = await previousFilesGone(values.previous, values.new, routes.filter((r) => r.html !== false).map((r) => r.route));
			gone = files.length;
			out(`\nFiles the previous deployment's pages load, at once or on use, still served by this one: ${files.length ? `${files.length} are not` : 'all'}\n${files.slice(0, 20).map((f) => `  FAIL ${f.status || 'no answer'} ${f.path} (loaded by ${f.route} on ${values.previous})\n`).join('')}${files.length ? '  A tab opened before this deploy loses its next chunk or stylesheet: keep each content-hashed file of earlier deployments in this one (they cannot collide), or pin a tab to its deployment (Vercel Skew Protection).\n' : ''}`);
		}
		return report.findings.length || slower || gone ? 1 : 0;
	}
	throw new Error(`cache needs plan, apply, output or check\n\n${CACHE_USAGE}`);
}
