import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { isSwitched } from './state.ts';
import { request } from '../check/http.ts';

export interface DeployInput {
	/** Production (or preview) deployment URLs of each app. */
	readonly old: string;
	readonly new: string;
	readonly switched: readonly string[];
	/** Paths the switched pages load from the new app that the old app does not serve. */
	readonly newAssets?: readonly string[];
	/** The old app's pages and endpoints, from the inventory. */
	readonly oldRoutes?: readonly string[];
	/** Paths the old app's pages load that the new app does not serve. */
	readonly oldAssets?: readonly string[];
	/** Every path the old app's pages load: a directory holding any of them is not the new app's alone. */
	readonly oldPaths?: readonly string[];
}

const strip = (origin: string) => new URL(origin).origin;

/** `:slug` stays, `*rest` becomes `:rest+`, `*rest?` becomes `:rest*` (Vercel's path-to-regexp). */
export function vercelPattern(route: string): string {
	return route.replace(/\*(\w*)(\?)?/g, (_, name: string, optional?: string) => `:${name || 'rest'}${optional ? '*' : '+'}`);
}

/** `:slug` stays, `*rest` becomes `**` (rou3, Nitro's router). */
export function nitroPattern(route: string): string {
	return route.replace(/\/\*\w*\??$/, '/**').replace(/:(\w+)\?/g, ':$1');
}

const firstDir = (path: string) => path.split('/').filter(Boolean).slice(0, -1)[0];

/** Asset paths as rewrite sources: a whole directory when no path the other app serves shares it, else each file. */
export function assetSources(paths: readonly string[], otherPaths: readonly string[]): string[] {
	const taken = new Set(otherPaths.map(firstDir).filter(Boolean));
	const out = new Set<string>();
	for (const path of paths) {
		const dir = firstDir(path);
		out.add(dir && !taken.has(dir) ? `/${dir}/**` : path);
	}
	return [...out].sort();
}

function bothSlashes(route: string): string[] {
	if (route === '/') return [route];
	const bare = route.replace(/\/+$/, '');
	return [...new Set([route, bare, `${bare}/`])];
}

/** `vercel.json` for a project in front of both deployments: switched routes and their assets to NEW, everything else to OLD. */
export function vercelConfig(input: DeployInput): { rewrites: { source: string; destination: string }[] } {
	const next = strip(input.new);
	const old = strip(input.old);
	const rewrites: { source: string; destination: string }[] = [];
	for (const route of input.switched) {
		for (const source of bothSlashes(route)) {
			const pattern = vercelPattern(source);
			rewrites.push({ source: pattern, destination: `${next}${pattern}` });
		}
	}
	for (const source of assetSources(input.newAssets ?? [], [...(input.oldPaths ?? []), ...(input.oldAssets ?? [])])) {
		const pattern = source.endsWith('/**') ? `${source.slice(0, -3)}/:path*` : source;
		rewrites.push({ source: pattern, destination: `${next}${pattern}` });
	}
	// `/:path*` matches neither `/` nor a path ending in `/`, so those get their own rules.
	rewrites.push({ source: '/', destination: `${old}/` }, { source: '/:path*/', destination: `${old}/:path*/` }, { source: '/:path*', destination: `${old}/:path*` });
	return { rewrites };
}

/** Nitro `routeRules` for the Markless app in front: every route and asset of the old app not switched yet is proxied to OLD. */
export function nitroRouteRules(input: DeployInput): Record<string, { proxy: string }> {
	const old = strip(input.old);
	const rules: Record<string, { proxy: string }> = {};
	for (const route of input.oldRoutes ?? []) {
		if (isSwitched(input.switched, route.split(/[?#]/)[0]!)) continue;
		for (const path of bothSlashes(route.split(/[?#]/)[0]!)) {
			const pattern = nitroPattern(path);
			rules[pattern] = { proxy: `${old}${pattern}` };
		}
	}
	for (const path of input.oldAssets ?? []) rules[path] = { proxy: `${old}${path}` };
	return rules;
}

export function nitroSnippet(input: DeployInput): string {
	const rules = nitroRouteRules(input);
	const body = Object.entries(rules)
		.map(([path, rule]) => `\t\t\t${JSON.stringify(path)}: { proxy: ${JSON.stringify(rule.proxy)} },`)
		.join('\n');
	return `// markless-migrate: paths the old app still serves. Paths not listed here are answered by the Markless app.
// vite.config.ts: router() reads Nitro's options from the top-level nitro key.
import { markless } from '@markless/core/vite';
import { router } from '@markless/router/vite';

export default {
	plugins: [markless(), router()],
	nitro: {
		routeRules: {
${body}
		},
	},
};
`;
}

const ASSET_ATTRS = /<(?:script|img|source|video|audio|iframe|link)\b[^>]*?\s(?:src|href|srcset|poster)\s*=\s*["']([^"']+)["'][^>]*>/gi;

/** Same-origin paths a page loads (scripts, styles, images, icons, preloads), from its HTML. */
export function assetPaths(html: string, origin: string): string[] {
	const out = new Set<string>();
	for (const match of html.matchAll(ASSET_ATTRS)) {
		const tag = match[0];
		if (/^<link\b/i.test(tag) && /\brel\s*=\s*["']?(canonical|alternate|next|prev|manifest)\b/i.test(tag)) continue;
		for (const candidate of match[1]!.split(',').map((s) => s.trim().split(/\s+/)[0]!)) {
			try {
				const url = new URL(candidate, origin);
				if (url.origin === new URL(origin).origin && url.pathname !== '/') out.add(url.pathname);
			} catch {
				// not a URL
			}
		}
	}
	return [...out].sort();
}

// A file path an app answers with an HTML page is its fallback (an SPA's index.html for every path), not the file.
const isPagePath = (path: string) => !/\.[a-z0-9]+$/i.test(path) || /\.html?$/i.test(path);

async function serves(origin: string, path: string): Promise<boolean> {
	try {
		const response = await request(new URL(path, origin), { method: 'GET', redirect: 'manual' });
		await response.body?.cancel();
		if (!((response.status >= 200 && response.status < 300) || response.status === 304)) return false;
		return isPagePath(path) || !(response.headers.get('content-type') ?? '').toLowerCase().startsWith('text/html');
	} catch {
		return false;
	}
}

/** Every file of the new app's static build output (Nitro's .output/public, Vercel's .vercel/output/static) as a URL path. */
export async function buildAssets(dir: string): Promise<string[]> {
	const out: string[] = [];
	const visit = async (rel: string) => {
		for (const entry of await readdir(join(dir, rel), { withFileTypes: true }).catch(() => [])) {
			const path = rel ? `${rel}/${entry.name}` : entry.name;
			if (entry.isDirectory()) await visit(path);
			else if (entry.isFile() && !isPagePath(`/${path}`)) out.push(`/${path}`);
		}
	};
	await visit('');
	return out.sort();
}

// A quoted path to a script: import specifiers, and the chunk tables bundlers resolve import() calls through.
const MODULE_SPECIFIER = /["'`]((?:\.{1,2}\/|\/)[^"'`\\\s]+\.m?js)\\?["'`]/g;

/** Same-origin modules a script names, statically, with import() or in a chunk table: chunks loaded on interaction or route change. */
export function moduleImports(code: string, scriptUrl: string, origin: string): string[] {
	const out = new Set<string>();
	for (const match of code.matchAll(MODULE_SPECIFIER)) {
		try {
			const url = new URL(match[1]!, scriptUrl);
			if (url.origin === new URL(origin).origin) out.add(url.pathname);
		} catch {
			// not a URL
		}
	}
	return [...out];
}

/** The same-origin asset paths the given pages load, read from each page's HTML, and every module their scripts import. */
export async function pageAssets(origin: string, pages: readonly string[]): Promise<string[]> {
	const paths = new Set<string>();
	for (const page of pages) {
		const response = await request(new URL(page, origin)).catch(() => undefined);
		if (!response?.ok) continue;
		for (const path of assetPaths(await response.text(), origin)) paths.add(path);
	}
	const queue = [...paths].filter((path) => /\.m?js$/.test(path));
	const seen = new Set(queue);
	while (queue.length && seen.size < 5000) {
		const path = queue.shift()!;
		const url = new URL(path, origin).href;
		const response = await request(url).catch(() => undefined);
		if (!response?.ok) continue;
		for (const imported of moduleImports(await response.text(), url, origin)) {
			paths.add(imported);
			if (!seen.has(imported)) {
				seen.add(imported);
				queue.push(imported);
			}
		}
	}
	return [...paths].sort();
}

/** The paths an app answers with an error or not at all. */
export async function notServedBy(origin: string, paths: readonly string[]): Promise<string[]> {
	const out: string[] = [];
	for (const path of paths) if (!(await serves(origin, path))) out.push(path);
	return out;
}
