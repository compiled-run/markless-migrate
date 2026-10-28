import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { classify, type RouteCaching } from './classify.ts';
import { isContentHashed } from './headers.ts';
import type { CachingPlan } from './plan.ts';
import { cacheRules, type CacheRules } from './rules.ts';
import { NO_SIGNALS, pageFileSignals, type RouteSignals } from './signals.ts';

/** The module `cache apply` writes into the Markless app; vite.config.ts imports it. */
export const CACHE_MODULE = 'migrate-cache.ts';
const IMPORT_LINE = `import { migrateCache } from './${CACHE_MODULE}';`;

async function routerConstant(app: string, name: string): Promise<string | undefined> {
	const dist = join(app, 'node_modules/@markless/router/dist');
	const pattern = new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`);
	for (const file of await readdir(dist).catch(() => [] as string[])) {
		if (!file.endsWith('.js')) continue;
		const m = (await readFile(join(dist, file), 'utf8')).match(pattern);
		if (m) return m[1];
	}
	return undefined;
}

/** The packages cache apply and check read from the app's node_modules; one the app declares but has not installed would silently drop its rules. */
const READ_FROM_INSTALL = ['@markless/router', 'nitro'];

/** Fails when the app declares a package whose installed build the caching rules are read from, but it is not installed. */
export async function requireInstalled(app: string): Promise<void> {
	const pkg = JSON.parse(await readFile(join(app, 'package.json'), 'utf8').catch(() => '{}')) as Record<string, Record<string, string> | undefined>;
	const declared = READ_FROM_INSTALL.filter((name) => pkg.dependencies?.[name] ?? pkg.devDependencies?.[name]);
	const missing: string[] = [];
	for (const name of declared) if (!(await readFile(join(app, 'node_modules', name, 'package.json'), 'utf8').catch(() => undefined))) missing.push(name);
	if (missing.length) throw new Error(`${missing.join(', ')} declared in ${join(app, 'package.json')} but not installed in its node_modules: the rules read the fragment URL prefix and Nitro's query support from them, so without them no page's fragment URL is cached and every navigation runs a function. install the app's dependencies first`);
}

/** The fragment request header the app's own @markless/router sends (up to 0.5), read from its build; undefined when it has none. */
export const fragmentHeader = (app: string): Promise<string | undefined> => routerConstant(app, 'FRAGMENT_REQUEST_HEADER');

/** The path prefix the app's own @markless/router fetches fragments from (0.7 on: `/_markless/fragment/<page path>`), read from its build. */
export const fragmentPath = (app: string): Promise<string | undefined> => routerConstant(app, 'FRAGMENT_PATH_PREFIX');

/** The comments the app's own @markless/router ends a fragment response with: a body ending in one is a fragment, not a document. */
export async function fragmentEndMarkers(app: string): Promise<string[]> {
	return (await Promise.all(['FRAGMENT_REGION_END', 'FRAGMENT_APPEND_END'].map((name) => routerConstant(app, name)))).filter((m): m is string => Boolean(m));
}

/** First Nitro release measured to hand an ISR function its allowed query keys on Vercel (`passQuery`); 3.0.260429-beta drops them. */
export const NITRO_PASS_QUERY = '3.0.260903-beta';

/** Whether a Nitro version is NITRO_PASS_QUERY or later: `3.0.<yymmdd>-beta` betas compare by their date, any later minor or major passes. */
export function nitroPassesQuery(version: string | undefined): boolean {
	const m = version?.match(/^(\d+)\.(\d+)\.(\d+)/);
	if (!m) return false;
	const [major, minor, patch] = m.slice(1).map(Number) as [number, number, number];
	const [, , min] = NITRO_PASS_QUERY.match(/^(\d+)\.(\d+)\.(\d+)/)!.slice(1).map(Number) as [number, number, number];
	return major > 3 || (major === 3 && (minor > 0 || patch >= min));
}

/** The Nitro version installed in the app. */
export async function nitroVersion(app: string): Promise<string | undefined> {
	const pkg = await readFile(join(app, 'node_modules/nitro/package.json'), 'utf8').catch(() => undefined);
	return pkg ? (JSON.parse(pkg) as { version?: string }).version : undefined;
}

async function walk(dir: string, rel = ''): Promise<string[]> {
	const out: string[] = [];
	for (const entry of await readdir(join(dir, rel), { withFileTypes: true }).catch(() => [])) {
		const path = rel ? `${rel}/${entry.name}` : entry.name;
		if (entry.isDirectory()) out.push(...(await walk(dir, path)));
		else if (entry.isFile()) out.push(`/${path}`);
	}
	return out;
}

// Markless marks /build/ immutable and Nitro /assets/ (its build output); these are the app's own public files.
const COVERED = /^\/(build|assets)\//;

/**
 * Content-hashed files in the app's public/ that nothing else marks immutable, minus any the old site kept short.
 * A directory holding only hashed files is one `/dir/**` rule, so a rebuild that renames them stays covered.
 */
export async function publicHashedAssets(app: string, plan: Pick<CachingPlan, 'hashedAssets'>): Promise<string[]> {
	const all = (await walk(join(app, 'public'))).filter((p) => !COVERED.test(p) && !/\.(br|gz|zst)$/.test(p));
	const oldShort = new Set(plan.hashedAssets.filter((a) => !a.longLived).map((a) => a.path));
	const hashed = all.filter((p) => isContentHashed(p) && !oldShort.has(p));
	const dirOf = (p: string) => p.split('/').slice(0, -1).join('/');
	const whole = new Set([...new Set(hashed.map(dirOf))].filter((dir) => dir && all.every((p) => dirOf(p) !== dir || hashed.includes(p))));
	return [...new Set(hashed.map((p) => (whole.has(dirOf(p)) ? `${dirOf(p)}/**` : p)))].sort();
}

/** Every route classified again with what the Markless app's page for it reads: a port that reads cookies is never cached. */
export async function refineWithNewSource(plan: CachingPlan, app: string, pageFiles: Readonly<Record<string, string>>): Promise<RouteCaching[]> {
	const cache = new Map<string, RouteSignals>();
	const out: RouteCaching[] = [];
	for (const [i, e] of plan.evidence.entries()) {
		const file = pageFiles[e.route];
		let signals: RouteSignals | undefined;
		if (file) {
			signals = cache.get(file) ?? { ...NO_SIGNALS, ...(await pageFileSignals(app, file)) };
			cache.set(file, signals);
		}
		const prior = plan.routes[i]!;
		const next = classify({ evidence: e, ...(signals ? { new: signals } : {}) });
		// The plan's old-source reasons stand: the new side can only make a route less cacheable, never more.
		const keys = [...new Set([...(prior.allowQuery ?? []), ...(next.allowQuery ?? [])])].sort();
		if (rank(next.class) < rank(prior.class)) out.push({ ...next, reasons: [...next.reasons, ...prior.reasons] });
		// The new page may read query keys the old one read only in the browser: each value is its own cached page.
		else if (keys.length > (prior.allowQuery?.length ?? 0)) out.push({ ...prior, allowQuery: keys, reasons: [...prior.reasons, `the new page reads the query (${keys.join(', ')}), so each value is cached apart`] });
		else out.push(prior);
	}
	return out;
}

const rank = (c: RouteCaching['class']) => (c === 'no-cache' ? 0 : c === 'isr' ? 1 : 2);

export function cacheModule(rules: CacheRules, routes: readonly RouteCaching[]): string {
	const shares = { prerender: 0, isr: 0, 'no-cache': 0 };
	for (const r of routes) if (r.status === 200) shares[r.class]++;
	return `// Generated by \`markless-migrate cache apply\` from .migrate/caching.json (prerender ${shares.prerender}, revalidated ${shares.isr}, never cached ${shares['no-cache']}); run it again rather than editing.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import type { Plugin } from 'vite';

export const routeRules: Record<string, Record<string, unknown>> = ${JSON.stringify(rules.routeRules, null, '\t')};

const CACHING_KEYS = ['isr', 'prerender', 'cache', 'swr', 'static'];

interface NitroLike {
	options: { routeRules: Record<string, Record<string, any>>; preset?: string; output?: { dir: string; publicDir: string; serverDir: string } };
	hooks?: { hook(name: string, run: (arg: any) => unknown): void };
}

// Vercel serves a static file ahead of a route's ISR function, so a prerendered page that revalidates moves into the function's fallback.
function prerenderFallbacks(nitro: NitroLike): void {
	const output = nitro.options.output;
	if (!output || !String(nitro.options.preset ?? '').includes('vercel')) return;
	for (const [path, rule] of Object.entries(routeRules)) {
		const isr = rule.isr as { expiration?: number | false } | undefined;
		if (!rule.prerender || !isr || isr.expiration === false) continue;
		const file = [join(output.publicDir, path, 'index.html'), join(output.publicDir, path + '.html')].find((f) => existsSync(f));
		const dest = path.split('/').slice(1).map((s) => s.replace(/[^a-zA-Z0-9_.[\\]/]/g, '-')).join('/') || 'index';
		const func = join(dirname(output.serverDir), dest + '-isr');
		if (!file || !existsSync(func + '.prerender-config.json')) continue;
		const fallback = func + '.prerender-fallback.html';
		mkdirSync(dirname(fallback), { recursive: true });
		renameSync(file, fallback);
		const config = JSON.parse(readFileSync(func + '.prerender-config.json', 'utf8'));
		writeFileSync(func + '.prerender-config.json', JSON.stringify({ ...config, fallback: basename(fallback) }, null, 2));
	}
}

/** Puts each route's caching into Nitro's options, in place of any caching the app set for that path; a proxied path is left alone. */
export function applyRules(nitro: NitroLike): void {
	// Nitro's prerenderer copies the app's config with each server asset listed twice, and mounting one twice stops it.
	nitro.hooks?.hook('prerender:init', (renderer) => {
		const seen = new Set<string>();
		renderer.options.serverAssets = renderer.options.serverAssets.filter((a) => !seen.has(a.baseName) && Boolean(seen.add(a.baseName)));
	});
	nitro.hooks?.hook('compiled', () => prerenderFallbacks(nitro));
	const rules = nitro.options.routeRules;
	const proxied = (path: string) => Boolean(rules[path]?.proxy);
	for (const [path, rule] of Object.entries(routeRules)) {
		if (proxied(path)) continue;
		const own = Object.fromEntries(Object.entries(rules[path] ?? {}).filter(([key]) => !CACHING_KEYS.includes(key)));
		rules[path] = { ...own, ...structuredClone(rule), ...(rule.headers || own.headers ? { headers: { ...(own.headers as object), ...(rule.headers as object) } } : {}) };
	}
}

/** A Vite plugin carrying a Nitro module: Nitro runs it once its options are resolved, after every plugin's config. */
export function migrateCache(): Plugin & { nitro: { name: string; setup: (nitro: NitroLike) => void } } {
	return { name: 'markless-migrate:cache', nitro: { name: 'markless-migrate:cache', setup: applyRules } };
}
`;
}

/** Adds `migrateCache()` to vite.config.ts's plugins, once. Returns false when the config has no plugins array to add it to. */
export function wireViteConfig(source: string): string | false {
	if (source.includes('migrateCache()')) return source;
	const plugins = source.match(/\bplugins\s*:\s*\[/);
	if (!plugins) return false;
	const at = plugins.index! + plugins[0].length;
	const withPlugin = `${source.slice(0, at)}migrateCache(), ${source.slice(at)}`;
	const imports = [...withPlugin.matchAll(/^import\b[^;]*;[ \t]*$/gm)];
	const last = imports.at(-1);
	const insertAt = last ? last.index! + last[0].length : 0;
	return `${withPlugin.slice(0, insertAt)}${last ? '\n' : ''}${IMPORT_LINE}${last ? '' : '\n'}${withPlugin.slice(insertAt)}`;
}

export interface ApplyResult {
	readonly module: string;
	readonly wired: boolean;
	readonly routes: readonly RouteCaching[];
	readonly rules: CacheRules;
	readonly fragmentHeader?: string;
	readonly fragmentPath?: string;
	readonly nitro?: string;
	readonly passQuery: boolean;
}

/** Writes the caching rules into the Markless app and wires them into its vite.config.ts. */
export async function applyCaching(plan: CachingPlan, app: string, pageFiles: Readonly<Record<string, string>> = {}, options: { readonly prerender?: boolean } = {}): Promise<ApplyResult> {
	await requireInstalled(app);
	const routes = await refineWithNewSource(plan, app, pageFiles);
	const header = await fragmentHeader(app);
	const prefix = await fragmentPath(app);
	const nitro = await nitroVersion(app);
	const passQuery = nitroPassesQuery(nitro);
	// Only the routes a page of the app renders: a path the app leaves to its static files or the old app keeps its own answer.
	const rendered = routes.filter((r) => pageFiles[r.route]);
	const rules = cacheRules(rendered, { ...(header ? { fragmentHeader: header } : {}), ...(prefix ? { fragmentPath: prefix } : {}), passQuery, hashedAssets: await publicHashedAssets(app, plan), ...(options.prerender ? { prerender: true } : {}) });
	const module = join(app, CACHE_MODULE);
	await writeFile(module, cacheModule(rules, rendered));
	const configPath = join(app, 'vite.config.ts');
	const config = await readFile(configPath, 'utf8').catch(() => undefined);
	const wired = config === undefined ? false : wireViteConfig(config);
	if (wired !== false && wired !== config) await writeFile(configPath, wired);
	return { module, wired: wired !== false, routes: rendered, rules, ...(header ? { fragmentHeader: header } : {}), ...(prefix ? { fragmentPath: prefix } : {}), ...(nitro ? { nitro } : {}), passQuery };
}
