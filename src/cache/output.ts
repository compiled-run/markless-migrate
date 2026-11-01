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
export const CLOUDFLARE_LIMITS = { files: 100_000, fileBytes: 25 * 1024 * 1024, workerBytes: 64 * 1024 * 1024, headerRules: 100 };

export interface CloudflareOutputReport {
	readonly missing: string[];
	readonly files: number;
	readonly tooLarge: string[];
	readonly workerBytes: number;
	/** URL patterns in `_headers`: a version upload with more than 100 is refused. */
	readonly headerRules: number;
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
		headerRules: (await readFile(join(publicDir, '_headers'), 'utf8').catch(() => '')).split('\n').filter((l) => l.trim() && !/^\s/.test(l) && !l.startsWith('#')).length,
		workerBytes: server.filter((f) => /\.(?:m?js|wasm)$/.test(f.path)).reduce((sum, f) => sum + f.size, 0),
		compressedCopies: uploaded.filter((a) => /\.(?:br|gz|zst)$/.test(a.path)).map((a) => a.path),
		workerFirst: uploaded.map((a) => urlOf(a.path)).filter((url) => patterns.some((p) => p.test(url))),
	};
}
