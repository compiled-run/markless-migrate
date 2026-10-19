import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { matchRoute, specificity } from '../source/index.ts';
import { fetchFacts } from './evidence.ts';

async function pageFiles(app: string, rel = 'pages'): Promise<string[]> {
	const out: string[] = [];
	for (const entry of await readdir(join(app, rel), { withFileTypes: true }).catch(() => [])) {
		const path = `${rel}/${entry.name}`;
		if (entry.isDirectory()) out.push(...(await pageFiles(app, path)));
		else if (/\.(tsrx|mdx?)$/.test(entry.name)) out.push(path);
	}
	return out;
}

/** The route pattern Markless's router serves a page file at: `pages/blog/[slug].tsrx` is `/blog/:slug`, `[...path]` is `*path`. */
export function filePattern(file: string): string {
	const segments = file
		.replace(/^pages\//, '')
		.replace(/\.(tsrx|mdx?)$/, '')
		.split('/')
		.filter((s, i, all) => !(s === 'index' && i === all.length - 1));
	return `/${segments.map((s) => s.replace(/^\[\.\.\.(\w+)\]$/, '*$1').replace(/^\[\[(\w+)\]\]$/, ':$1?').replace(/^\[(\w+)\]$/, ':$1')).join('/')}`;
}

/** The page file that renders each route, by the router's file names: the most specific pattern that matches. */
export async function pageFilesByConvention(app: string, routes: readonly string[]): Promise<Record<string, string>> {
	const files = (await pageFiles(app)).filter((f) => !/\/(404|500|_[^/]*)\.(tsrx|mdx?)$/.test(f));
	const patterns = files.map((file) => ({ file, pattern: filePattern(file) }));
	const out: Record<string, string> = {};
	for (const route of routes) {
		const path = route.split(/[?#]/)[0]!.replace(/(.)\/$/, '$1');
		const best = patterns.filter((p) => matchRoute(p.pattern, path)).sort((a, b) => specificity(b.pattern) - specificity(a.pattern))[0];
		if (best) out[route] = best.file;
	}
	return out;
}

/** The page file each route's response names in Markless's route marker: what actually rendered it. */
export async function pageFilesFromOrigin(origin: string, routes: readonly string[]): Promise<Record<string, string>> {
	const out: Record<string, string> = {};
	for (const route of routes) {
		const facts = await fetchFacts(new URL(route, origin).href).catch(() => undefined);
		if (facts?.routeFile) out[route] = facts.routeFile;
	}
	return out;
}
