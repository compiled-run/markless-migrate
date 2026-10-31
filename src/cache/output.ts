import { access, readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { cloudflareAssetFile, type NitroRule } from './rules.ts';

const exists = (path: string) => access(path).then(() => true, () => false);

// Nitro's Vercel preset names a route's ISR function this way (normalizeRouteDest).
const routeDest = (path: string) => path.split('/').slice(1).map((s) => s.replace(/[^a-zA-Z0-9_.[\]/]/g, '-')).join('/') || 'index';

/** The cached paths of these routeRules that a built Vercel output serves from neither an ISR function nor a static file: each runs the server function on every request. */
export async function missingIsrFunctions(outputDir: string, routeRules: Readonly<Record<string, NitroRule>>): Promise<string[]> {
	const missing: string[] = [];
	for (const [path, rule] of Object.entries(routeRules)) {
		if (/[:*]/.test(path)) continue;
		const isr = rule.isr !== undefined && rule.isr !== false;
		if (!isr && !rule.prerender) continue;
		const dest = routeDest(path);
		const served = isr ? await exists(join(outputDir, 'functions', `${dest}-isr.func`)) : (await exists(join(outputDir, 'static', path, 'index.html'))) || (await exists(join(outputDir, 'static', `${path}.html`)));
		if (!served) missing.push(path);
	}
	return missing;
}

/** Workers static assets limits on the paid plan (developers.cloudflare.com/workers/platform/limits, 2026-10-30). */
export const CLOUDFLARE_LIMITS = { files: 100_000, fileBytes: 25 * 1024 * 1024, workerBytes: 64 * 1024 * 1024 };

export interface CloudflareOutputReport {
	readonly missing: string[];
	readonly files: number;
	readonly tooLarge: string[];
	readonly workerBytes: number;
	readonly compressedCopies: string[];
	/** Files `assets.run_worker_first` sends to the Worker though they are uploaded: each request for them is a Worker request. */
	readonly workerFirst: string[];
}

async function filesUnder(dir: string): Promise<{ path: string; size: number }[]> {
	const out: { path: string; size: number }[] = [];
	for (const entry of await readdir(dir, { recursive: true, withFileTypes: true }).catch(() => [])) {
		if (!entry.isFile()) continue;
		const path = join(entry.parentPath, entry.name);
		out.push({ path: path.slice(dir.length + 1), size: (await stat(path)).size });
	}
	return out;
}

/**
 * Reads a Nitro `cloudflare-module` build (default .output) before it is uploaded: every path these routeRules prerender
 * must be a file Cloudflare serves at that exact URL, or each request for it runs the Worker; the upload must fit the limits.
 */
export async function checkCloudflareOutput(outputDir: string, routeRules: Readonly<Record<string, NitroRule>>): Promise<CloudflareOutputReport> {
	const publicDir = join(outputDir, 'public');
	const assets = await filesUnder(publicDir);
	const names = new Set(assets.map((a) => a.path));
	const missing = Object.entries(routeRules)
		.filter(([path, rule]) => rule.prerender && !/[:*]/.test(path))
		.map(([path]) => path)
		.filter((path) => !names.has(cloudflareAssetFile(path)));
	const ignored = new Set(['_headers', '_redirects', '.assetsignore']);
	const uploaded = assets.filter((a) => !ignored.has(a.path));
	const server = await filesUnder(join(outputDir, 'server'));
	const config = JSON.parse(await readFile(join(outputDir, 'server/wrangler.json'), 'utf8').catch(() => '{}')) as { assets?: { run_worker_first?: boolean | string[] } };
	const first = config.assets?.run_worker_first;
	const patterns = (first === true ? ['/*'] : first || []).filter((p) => !p.startsWith('!')).map((p) => new RegExp(`^${p.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`));
	const urlOf = (file: string) => `/${file.replace(/(?:^|\/)index\.html$/, (m) => (m.startsWith('/') ? '/' : '')).replace(/\.html$/, '')}`;
	return {
		missing,
		files: uploaded.length,
		tooLarge: uploaded.filter((a) => a.size > CLOUDFLARE_LIMITS.fileBytes).map((a) => a.path),
		workerBytes: server.filter((f) => /\.(?:m?js|wasm)$/.test(f.path)).reduce((sum, f) => sum + f.size, 0),
		compressedCopies: uploaded.filter((a) => /\.(?:br|gz|zst)$/.test(a.path)).map((a) => a.path),
		workerFirst: uploaded.map((a) => urlOf(a.path)).filter((url) => patterns.some((p) => p.test(url))),
	};
}

const LOAD_TAG = /<(script|link|img)\b([^>]*)>/gi;
const ATTR = (name: string) => new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i');
const LOADED_RELS = /\b(?:stylesheet|modulepreload|preload|icon|apple-touch-icon|manifest)\b/i;
const IMPORT_MAP = /<script\b[^>]*\btype=["']importmap["'][^>]*>([\s\S]*?)<\/script>/gi;

/** Same-origin URLs a page's HTML loads as it opens: scripts, stylesheets, preloads, icons, images and import map targets. */
export function loadedUrls(html: string): string[] {
	const urls: string[] = [];
	const attr = (attrs: string, name: string) => { const m = ATTR(name).exec(attrs); return m ? (m[1] ?? m[2] ?? m[3]) : undefined; };
	for (const [, tag, attrs] of html.matchAll(LOAD_TAG)) {
		const lower = tag!.toLowerCase();
		const url = lower === 'link' ? (LOADED_RELS.test(attr(attrs!, 'rel') ?? '') ? attr(attrs!, 'href') : undefined) : attr(attrs!, 'src');
		if (url) urls.push(url);
	}
	for (const [, source] of html.matchAll(IMPORT_MAP)) {
		try {
			const map = JSON.parse(source!) as { imports?: Record<string, string>; scopes?: Record<string, Record<string, string>> };
			urls.push(...Object.values(map.imports ?? {}), ...Object.values(map.scopes ?? {}).flatMap((scope) => Object.values(scope)));
		} catch {}
	}
	return [...new Set(urls.filter((url) => typeof url === 'string' && url.startsWith('/') && !url.startsWith('//')).map((url) => url.split(/[?#]/)[0]!))];
}

/**
 * Same-origin URLs the uploaded pages load as they open that are not uploaded files: each request for one runs the Worker
 * (a 404 included), on every page view. Returns each URL with the first page that loads it.
 */
export async function workerLoads(outputDir: string): Promise<{ url: string; page: string; pages: number }[]> {
	const publicDir = join(outputDir, 'public');
	const assets = await filesUnder(publicDir);
	const names = new Set(assets.map((a) => a.path));
	const isFile = (url: string) => {
		const path = decodeURIComponent(url).slice(1);
		return names.has(path) || names.has(cloudflareAssetFile(url));
	};
	const found = new Map<string, { page: string; pages: number }>();
	for (const asset of assets) {
		if (!asset.path.endsWith('.html')) continue;
		for (const url of loadedUrls(await readFile(join(publicDir, asset.path), 'utf8'))) {
			if (isFile(url)) continue;
			const seen = found.get(url);
			if (seen) seen.pages++;
			else found.set(url, { page: asset.path, pages: 1 });
		}
	}
	return [...found].map(([url, { page, pages }]) => ({ url, page, pages })).sort((a, b) => b.pages - a.pages);
}
