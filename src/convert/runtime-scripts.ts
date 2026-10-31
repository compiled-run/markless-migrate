import { frameworkRuntime } from '../check/automatic.ts';

const SCRIPT_SRC = /<script\b[^>]*\ssrc=["']([^"']+)["']/gi;
const IMPORTS = /\bimport\s*\(\s*["']([^"']+)["']\s*\)|\b(?:import|export)\b[^"'`;]*?\bfrom\s*["']([^"']+)["']|\bimport\s*["']([^"']+)["']/g;

/**
 * The same-origin scripts of a served page that are the old framework's code though the page names no framework (a
 * Vite-built React app): a module carrying a framework's runtime, and every module that imports one, by path. `seen`
 * caches each module's verdict across the site's pages.
 */
export async function frameworkScriptsOf(html: string, origin: string, seen: Map<string, Promise<boolean>>): Promise<Set<string>> {
	const own = new URL(origin).origin;
	const found = new Set<string>();
	const visit = (path: string, chain: readonly string[]): Promise<boolean> => {
		const known = seen.get(path);
		if (known) return known;
		if (chain.includes(path)) return Promise.resolve(false);
		const verdict = (async () => {
			const text = await fetch(new URL(path, origin)).then((r) => (r.ok ? r.text() : ''), () => '');
			if (!text) return false;
			let framework = frameworkRuntime(text) !== undefined;
			for (const m of text.matchAll(IMPORTS)) {
				const url = URL.parse(m[1] ?? m[2] ?? m[3]!, new URL(path, origin));
				if (!url || url.origin !== own || !/\.m?js$/.test(url.pathname)) continue;
				if (await visit(url.pathname, [...chain, path])) {
					framework = true;
					found.add(url.pathname);
				}
			}
			return framework;
		})();
		seen.set(path, verdict);
		return verdict;
	};
	for (const m of html.matchAll(SCRIPT_SRC)) {
		const url = URL.parse(m[1]!, origin);
		if (url && url.origin === own && (await visit(url.pathname, []))) found.add(url.pathname);
	}
	// A chunk whose verdict an earlier page settled is the framework's on this page too.
	for (const [path, verdict] of seen) if (!found.has(path) && (await verdict) && html.includes(path)) found.add(path);
	return found;
}
