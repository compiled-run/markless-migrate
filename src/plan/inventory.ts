import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, relative, sep } from 'node:path';
import { chromium, type Browser, type BrowserContext } from 'playwright';
import { detectChallenge } from '../check/blocked.ts';
import { captureHttp, mime, toLocal } from '../check/capture.ts';
import { collectPage } from '../check/collect.ts';
import { proposeAuth, readLoginForm, withLoginForm, type ProposedAuth } from './auth.ts';
import { scanForInventory, summarizeSource, unionRoutes, type RouteUnionEntry, type SourceInventory } from './source.ts';

export interface InventoryRoute {
	readonly route: string;
	readonly status: number;
	readonly redirectsTo?: string;
	readonly foundIn: readonly ('sitemap' | 'crawl' | 'hreflang')[];
	readonly seo: Readonly<Record<string, string>>;
	readonly assets: readonly { url: string; type: string; status: number; contentType: string }[];
}

export interface Inventory {
	readonly version: 1;
	readonly origin: string;
	readonly generatedAt: string;
	readonly limit: number;
	readonly truncated: boolean;
	readonly routes: readonly InventoryRoute[];
	readonly locales: readonly string[];
	/** How the old app routes locales: path prefixes in use, and where / sends a browser by Accept-Language. */
	readonly localeRouting: { readonly prefixes: readonly string[]; readonly negotiation: Readonly<Record<string, string>> };
	readonly source?: SourceInventory;
	/** Crawled and source routes together; an entry known by one side only is flagged by `knownBy`. */
	readonly routeUnion?: readonly RouteUnionEntry[];
	/** Roles and the login route proposed from the source's auth guards: the starter for check --auth. */
	readonly auth?: ProposedAuth;
}

export interface SourceInfo {
	readonly path: string;
	readonly framework: string;
	readonly fileRoutes: readonly string[];
}

export interface PlanOptions {
	readonly origin: string;
	readonly source?: string;
	readonly limit?: number;
	readonly browser?: Browser;
	/** A bot-protection bypass, as for check: headers and cookies go to the old app's own origin only. */
	readonly headers?: Readonly<Record<string, string>>;
	readonly cookies?: readonly { readonly name: string; readonly value: string }[];
	readonly userAgent?: string;
}

function ownHeaders(options: Pick<PlanOptions, 'headers' | 'cookies' | 'userAgent'>): Record<string, string> {
	return { ...options.headers, ...(options.cookies?.length ? { cookie: options.cookies.map((c) => `${c.name}=${c.value}`).join('; ') } : {}), ...(options.userAgent ? { 'user-agent': options.userAgent } : {}) };
}

/** A browser context that sends the bypass to the old app's own origin and nowhere else. */
async function bypassContext(browser: Browser, origin: string, options: Pick<PlanOptions, 'headers' | 'cookies' | 'userAgent'>): Promise<BrowserContext> {
	const context = await browser.newContext(options.userAgent ? { userAgent: options.userAgent } : {});
	if (options.cookies?.length) await context.addCookies(options.cookies.map((c) => ({ ...c, url: origin })));
	const headers = options.headers;
	if (headers && Object.keys(headers).length) {
		const home = new URL(origin).origin;
		await context.route('**/*', (route) => (new URL(route.request().url()).origin === home ? route.continue({ headers: { ...route.request().headers(), ...headers } }) : route.continue()));
	}
	return context;
}

function routeOf(url: string, origin: string): string | undefined {
	try {
		const parsed = new URL(url, origin);
		if (parsed.origin !== new URL(origin).origin) return undefined;
		return parsed.pathname + parsed.search;
	} catch {
		return undefined;
	}
}

async function text(url: string, headers: Record<string, string> = {}): Promise<string | undefined> {
	try {
		const response = await fetch(url, { headers });
		return response.ok ? await response.text() : undefined;
	} catch {
		return undefined;
	}
}

// Sitemap URLs name the production host; only their paths apply to the origin being planned.
export async function sitemapRoutes(origin: string, headers: Record<string, string> = {}): Promise<string[]> {
	const robots = (await text(new URL('/robots.txt', origin).href, headers)) ?? '';
	const maps = robots.split('\n').flatMap((line) => {
		const match = line.match(/^\s*sitemap:\s*(\S+)/i);
		return match ? [new URL(match[1]!, origin).pathname] : [];
	});
	const queue = [...new Set(maps.length ? maps : ['/sitemap.xml'])];
	const routes: string[] = [];
	for (let i = 0; i < queue.length && i < 50; i++) {
		const xml = await text(new URL(queue[i]!, origin).href, headers);
		if (!xml) continue;
		const isIndex = /<sitemapindex[\s>]/.test(xml);
		for (const match of xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)) {
			const path = new URL(match[1]!.replace(/&amp;/g, '&')).pathname + new URL(match[1]!.replace(/&amp;/g, '&')).search;
			if (isIndex) queue.push(path);
			else routes.push(path);
		}
	}
	return [...new Set(routes)];
}

async function walk(dir: string): Promise<string[]> {
	const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
	const files = await Promise.all(
		entries.map((entry) => {
			const path = join(dir, entry.name);
			if (entry.isDirectory()) return entry.name === 'node_modules' || entry.name.startsWith('.') ? [] : walk(path);
			return [path];
		}),
	);
	return files.flat();
}

export async function inspectSource(path: string): Promise<SourceInfo> {
	const pkg = JSON.parse(await readFile(join(path, 'package.json'), 'utf8').catch(() => '{}')) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
	const deps = { ...pkg.dependencies, ...pkg.devDependencies };
	const framework = ['next', 'nuxt', 'astro', '@sveltejs/kit', '@remix-run/react', 'react-router', 'vite'].find((name) => name in deps) ?? 'unknown';
	const fileRoutes: string[] = [];
	if (framework === 'next') {
		for (const appDir of ['app', 'src/app']) {
			for (const file of await walk(join(path, appDir))) {
				if (!/[\\/](page|route)\.(t|j)sx?$/.test(file)) continue;
				const segments = relative(join(path, appDir), dirname(file)).split(sep).filter((s) => s && !/^\(.*\)$/.test(s) && !s.startsWith('@'));
				fileRoutes.push(`/${segments.join('/')}`);
			}
		}
	} else {
		for (const file of await walk(path)) {
			if (file.endsWith('.html') && !relative(path, file).startsWith('dist')) fileRoutes.push(`/${relative(path, file).split(sep).join('/')}`.replace(/index\.html$/, ''));
		}
	}
	return { path, framework, fileRoutes: [...new Set(fileRoutes)].sort() };
}

/** The source scan, with the framework and file routes older readers of the inventory expect. */
export async function readSource(path: string): Promise<SourceInventory> {
	const info = await inspectSource(path);
	const source = await scanForInventory(path, info.fileRoutes);
	return { ...source, framework: source.framework ?? (info.framework === 'unknown' ? null : info.framework) };
}

export async function plan(options: PlanOptions): Promise<Inventory> {
	const { origin } = options;
	const limit = options.limit ?? 100;
	const browser = options.browser ?? (await chromium.launch());
	const found = new Map<string, Set<InventoryRoute['foundIn'][number]>>();
	const note = (route: string, how: InventoryRoute['foundIn'][number]) => {
		const set = found.get(route) ?? new Set();
		set.add(how);
		found.set(route, set);
	};
	const own = ownHeaders(options);
	note('/', 'crawl');
	for (const route of await sitemapRoutes(origin, own)) note(route, 'sitemap');
	const routes: InventoryRoute[] = [];
	const done = new Set<string>();
	try {
		const context = await bypassContext(browser, origin, options);
		const page = await context.newPage();
		while (routes.length < limit) {
			const route = [...found.keys()].find((r) => !done.has(r));
			if (route === undefined) break;
			done.add(route);
			const http = await captureHttp(origin, route, own);
			const assets: InventoryRoute['assets'][number][] = [];
			const onResponse = (response: import('playwright').Response) => {
				const type = response.request().resourceType();
				if (['image', 'font', 'stylesheet', 'script', 'media'].includes(type)) {
					assets.push({ url: toLocal(response.url(), origin), type, status: response.status(), contentType: mime(response.headers()['content-type']) });
				}
			};
			page.on('response', onResponse);
			const navigation = await page.goto(new URL(route, origin).href, { waitUntil: 'load' });
			const wall = navigation && detectChallenge({ status: navigation.status(), headers: await navigation.allHeaders(), body: (await navigation.text().catch(() => '')).slice(0, 256 * 1024) });
			if (wall) throw new Error(`plan was stopped by ${wall.vendor} on ${route} (${navigation!.status()}, ${wall.evidence}): plan a staging URL, or pass the bypass with --header, --cookie or --user-agent`);
			await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => {});
			page.off('response', onResponse);
			const collected = await page.evaluate(collectPage, { origin, full: false });
			const last = http.chain.at(-1)!;
			for (const link of collected.links) {
				const target = routeOf(link.split('#')[0]!, origin);
				if (target !== undefined) note(target, 'crawl');
			}
			for (const [key, href] of Object.entries(collected.seo)) {
				if (!key.startsWith('hreflang:')) continue;
				const target = routeOf(href.replace('{origin}', origin), origin) ?? new URL(href.replace('{origin}', origin)).pathname;
				note(target, 'hreflang');
			}
			if (last.url !== route) note(last.url, 'crawl');
			routes.push({
				route,
				status: http.chain[0]!.status,
				...(http.chain.length > 1 ? { redirectsTo: last.url } : {}),
				foundIn: [],
				seo: collected.seo,
				assets,
			});
		}
		await context.close();
	} finally {
		if (!options.browser) await browser.close();
	}
	const locales = new Set<string>();
	for (const route of routes) {
		for (const [key, value] of Object.entries(route.seo)) {
			if (key === 'html:lang') locales.add(value);
			else if (key.startsWith('hreflang:') && key !== 'hreflang:x-default') locales.add(key.slice('hreflang:'.length));
		}
	}
	const sortedLocales = [...locales].sort();
	const prefixes = sortedLocales.filter((locale) => routes.some((r) => r.route === `/${locale}` || r.route.startsWith(`/${locale}/`)));
	const landing: Record<string, string> = {};
	for (const locale of sortedLocales) landing[locale] = (await captureHttp(origin, '/', { ...own, 'accept-language': locale })).chain.at(-1)!.url;
	const negotiation = new Set(Object.values(landing)).size > 1 ? landing : {};
	const source = options.source ? await readSource(options.source) : undefined;
	const crawled = [...found.keys()].map((r) => r.split(/[?#]/)[0]!);
	const union = source ? unionRoutes([...new Set(crawled)], source.routes) : [];
	let auth = source ? proposeAuth(source.authGuards, source.routes, union, routes.find((r) => r.route === '/')?.redirectsTo) : undefined;
	if (auth?.loginRoute) {
		const formBrowser = options.browser ?? (await chromium.launch());
		try {
			auth = withLoginForm(auth, await readLoginForm(formBrowser, new URL(auth.loginRoute, origin).href, (b) => bypassContext(b, origin, options)));
		} finally {
			if (!options.browser) await formBrowser.close();
		}
	}
	return {
		version: 1,
		origin,
		generatedAt: new Date().toISOString(),
		limit,
		truncated: [...found.keys()].some((r) => !done.has(r)),
		routes: routes.map((r) => ({ ...r, foundIn: [...found.get(r.route)!].sort() })).sort((a, b) => a.route.localeCompare(b.route)),
		locales: sortedLocales,
		localeRouting: { prefixes, negotiation },
		...(source ? { source, routeUnion: union } : {}),
		...(auth ? { auth } : {}),
	};
}

export async function writeInventory(inventory: Inventory, dir: string): Promise<string> {
	await mkdir(dir, { recursive: true });
	const path = join(dir, 'inventory.json');
	await writeFile(path, `${JSON.stringify(inventory, null, '\t')}\n`);
	return path;
}

export function summarizeInventory(inventory: Inventory): string {
	const lines = [`${inventory.routes.length} routes on ${inventory.origin}${inventory.truncated ? ` (stopped at the limit of ${inventory.limit})` : ''}`];
	for (const r of inventory.routes) {
		lines.push(`  ${String(r.status).padEnd(4)}${r.route}${r.redirectsTo ? ` -> ${r.redirectsTo}` : ''}${r.seo.title ? `  "${r.seo.title}"` : ''}`);
	}
	lines.push(`Locales: ${inventory.locales.join(', ') || '(none declared)'}`);
	if (inventory.localeRouting.prefixes.length) lines.push(`Locale prefixes: ${inventory.localeRouting.prefixes.map((p) => `/${p}`).join(', ')}`);
	const negotiated = Object.entries(inventory.localeRouting.negotiation);
	if (negotiated.length) lines.push(`Accept-Language at /: ${negotiated.map(([locale, to]) => `${locale} -> ${to}`).join(', ')}`);
	if (inventory.auth) {
		lines.push(`Roles to check (from auth guards): ${Object.keys(inventory.auth.roles).join(', ')}, and anonymous; login at ${inventory.auth.loginRoute ?? '(not found: set loginRoute)'}`);
		for (const guarded of inventory.auth.guards) lines.push(`  ${guarded}`);
	}
	return `${lines.join('\n')}\n${inventory.source ? summarizeSource(inventory.source, inventory.routeUnion) : ''}`;
}
