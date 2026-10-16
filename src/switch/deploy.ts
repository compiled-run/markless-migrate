import { isSwitched } from './state.ts';

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
	for (const source of assetSources(input.newAssets ?? [], input.oldAssets ?? [])) {
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
// vite.config.ts
import { markless } from '@markless/router/vite';

export default {
	plugins: [
		markless({
			nitro: {
				routeRules: {
${body}
				},
			},
		}),
	],
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

async function serves(origin: string, path: string): Promise<boolean> {
	try {
		const response = await fetch(new URL(path, origin), { method: 'GET', redirect: 'manual' });
		await response.body?.cancel();
		return response.status < 400;
	} catch {
		return false;
	}
}

/** The same-origin asset paths the given pages load, read from each page's HTML. */
export async function pageAssets(origin: string, pages: readonly string[]): Promise<string[]> {
	const paths = new Set<string>();
	for (const page of pages) {
		const response = await fetch(new URL(page, origin)).catch(() => undefined);
		if (!response?.ok) continue;
		for (const path of assetPaths(await response.text(), origin)) paths.add(path);
	}
	return [...paths].sort();
}

/** The paths an app answers with an error or not at all. */
export async function notServedBy(origin: string, paths: readonly string[]): Promise<string[]> {
	const out: string[] = [];
	for (const path of paths) if (!(await serves(origin, path))) out.push(path);
	return out;
}
