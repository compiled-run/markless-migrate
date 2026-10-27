/** A file a page of the previous deployment loads that the next deployment does not serve. */
export interface GoneFile {
	readonly route: string;
	readonly path: string;
	readonly status: number;
}

const FILE = /\.(?:m?js|css|woff2?|wasm)$/;
// What a page names to load: scripts, stylesheets and preloads.
const NAMED = /<(?:script|link)\b[^>]*?\s(?:src|href)="([^"#]+)"/g;
// What a chunk imports, at once or on use: `import "./x.js"`, `from "./x.js"`, `import("./x.js")`.
const IMPORTED = /\b(?:import|from)\s*\(?\s*["'`]([^"'`]+\.m?js)["'`]/g;

/**
 * The files the pages of the previous deployment load, at once or on use (each script's static and dynamic imports,
 * followed), that the next one answers with an error. A tab opened before a deploy keeps asking for them by the names
 * its page was served with: a chunk it imports on first use, a stylesheet the router adds on the next in-place visit.
 */
export async function previousFilesGone(previous: string, next: string, routes: readonly string[], limit = 2000): Promise<GoneFile[]> {
	const prevOrigin = new URL(previous).origin;
	const fileOf = new Map<string, string>();
	const queue: { path: string; route: string }[] = [];
	const add = (raw: string, base: string, route: string) => {
		const url = URL.parse(raw, base);
		if (!url || url.origin !== prevOrigin || !FILE.test(url.pathname) || fileOf.has(url.pathname) || fileOf.size >= limit) return;
		fileOf.set(url.pathname, route);
		queue.push({ path: url.pathname, route });
	};
	for (const route of routes) {
		const page = await fetch(new URL(route, previous)).then((r) => (r.ok ? r.text() : ''), () => '');
		for (const m of page.matchAll(NAMED)) add(m[1]!, new URL(route, previous).href, route);
	}
	const gone: GoneFile[] = [];
	for (let i = 0; i < queue.length; i++) {
		const { path, route } = queue[i]!;
		if (/\.m?js$/.test(path)) {
			const code = await fetch(new URL(path, previous)).then((r) => (r.ok ? r.text() : ''), () => '');
			for (const m of code.matchAll(IMPORTED)) add(m[1]!, new URL(path, previous).href, route);
		}
		const status = await fetch(new URL(path, next), { method: 'HEAD' }).then((r) => r.status, () => 0);
		if (status === 0 || status >= 400) gone.push({ route, path, status });
	}
	return gone;
}
