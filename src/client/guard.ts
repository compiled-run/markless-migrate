import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { parseHtml } from '../usage/html.ts';
import { classifyScript, RUNTIME_NAMES } from './classify.ts';

export interface RuntimeHit {
	readonly file: string;
	readonly runtimes: readonly string[];
	/** Inside the build's own bundles (client chunks or the server), a file copied into the public output, or an inline script of a built page. */
	readonly where: 'bundle' | 'public file' | 'inline script';
	/**
	 * For a public file: whether a page loads it. `page` when the app's own bundles or built pages reference its URL
	 * (or a file they load does), `copied page` when only a static HTML file copied into the output does, `none` when
	 * nothing does (a download, such as htmx.org's own htmx.js and test suite).
	 */
	readonly loadedBy: 'page' | 'copied page' | 'none';
	readonly evidence?: string;
}

export interface LibraryHit {
	readonly file: string;
	readonly libraries: readonly string[];
	readonly where: RuntimeHit['where'];
	readonly loadedBy: RuntimeHit['loadedBy'];
}

/** A script a page loads from another origin when it runs (a third-party widget on intent): not in the build, so listed. */
export interface RemoteScript {
	readonly url: string;
	/** The client file that names it. */
	readonly file: string;
	/** What it is when known: a widget that brings its own UI runtime is named with it. */
	readonly note?: string;
}

// Scripts known to bring a UI runtime of their own, so the listing says so.
const KNOWN_REMOTE: readonly { readonly test: RegExp; readonly note: string }[] = [
	{ test: /\/npm\/@docsearch\/js@3\b/, note: 'DocSearch 3 with its own UI runtime (Preact), loaded when a visitor first goes to search' },
];

export interface BuildScan {
	/** Scripts the client code loads from another origin at run time: listed, never failed. */
	readonly remote: RemoteScript[];
	/** Foreign runtimes a page loads or runs: each fails the build. */
	readonly hits: RuntimeHit[];
	/** Foreign runtimes in files no Markless page loads: allowed, listed. */
	readonly downloads: RuntimeHit[];
	/** JavaScript-only libraries the build ships: kept, listed for `upgrade`. */
	readonly libraries: LibraryHit[];
	readonly files: number;
}

const SCRIPT = /\.(m?js|cjs)$/;
// Client code: Markless's browser build. The server bundles name the same URLs for rendering, not loading.
const CLIENT = /(^|\/)public\/build\/|^build\//;
// A script URL on another origin as client code names it: a .js file, or a package entry on an npm CDN.
const REMOTE_SCRIPT = /["'`](https:\/\/[^"'`\s\\]+?(?:\.m?js|\/npm\/(?:@[\w.-]+\/)?[\w.-]+@[\w.-]+)(?:\?[^"'`\s\\]*)?)["'`]/g;
// The app's own output: Markless's client build and the server; everything else under public/ was copied in.
const BUNDLE = /(^|\/)(server|functions)\/|(^|\/)public\/build\/|^build\/|(^|\/)markless\//;
// A built page Markless rendered (its route container or its import map), not a static HTML file copied in.
const MARKLESS_PAGE = /data-async-container|"@markless\/c\//;

/**
 * The URL paths a script's text refers to, read lexically: each quoted string that is a path or URL (not one used as an
 * object key: a static server's asset table lists every file by path), and each src, href or import inside a string.
 */
function scriptPaths(source: string, into: Set<string>): void {
	for (const m of source.matchAll(/(["'`])((?:\/|https?:\/\/)[^"'`\s\\]{1,500})\1(?!\s*:)/g)) referencedPaths(m[2]!, into);
	for (const m of source.matchAll(/(?:src|href)\s*=\s*\\?["'`]?((?:\/|https?:\/\/)[^"'`\s>\\]+)/g)) referencedPaths(m[1]!, into);
}

/** The URL path a string names: a root-relative path, or an absolute URL's path. */
function referencedPaths(value: string, into: Set<string>): void {
	const add = (v: string) => {
		const bare = v.split(/[?#]/)[0]!;
		if (bare.startsWith('/')) into.add(bare);
		else if (/^https?:\/\//.test(bare)) {
			try {
				into.add(new URL(bare).pathname);
			} catch {}
		}
	};
	add(value);
}

/**
 * Every file of a build output that carries another framework's or library's runtime, split by evidence: a foreign
 * runtime a page loads or runs fails the build; one in a file nothing loads is a download and is listed; a
 * JavaScript-only library is kept and listed.
 */
export async function scanBuild(dir: string): Promise<BuildScan> {
	const files: { rel: string; path: string }[] = [];
	const visit = async (d: string): Promise<void> => {
		for (const entry of await readdir(d, { withFileTypes: true }).catch(() => [])) {
			const path = join(d, entry.name);
			if (entry.isDirectory()) await visit(path);
			else if (SCRIPT.test(entry.name) || entry.name.endsWith('.html')) files.push({ rel: relative(dir, path), path });
		}
	};
	await visit(dir);
	const publicRoot = files.some((f) => f.rel.startsWith('public/')) ? 'public/' : '';
	const urlOf = (rel: string) => `/${rel.slice(publicRoot.length)}`;
	const own = new Set<string>();
	const copiedPages = new Set<string>();
	const hits: RuntimeHit[] = [];
	const downloads: RuntimeHit[] = [];
	const libraries: LibraryHit[] = [];
	const remote: RemoteScript[] = [];
	const publicScripts = new Map<string, { rel: string; text: string; runtimes: string[]; libraries: string[] }>();
	for (const f of files) {
		const text = await readFile(f.path, 'utf8');
		if (f.rel.endsWith('.html')) {
			const page = MARKLESS_PAGE.test(text);
			const refs = parseHtml(text).flatMap((el) => [el.attrs.get('src'), el.attrs.get('href')].filter((v): v is string => !!v).map((v) => new URL(v, `http://x${urlOf(f.rel)}`).pathname));
			for (const r of refs) (page ? own : copiedPages).add(r);
			for (const el of parseHtml(text)) {
				if (el.tag !== 'script' || el.attrs.has('src') || !el.text?.trim()) continue;
				const type = el.attrs.get('type');
				if (type && !/javascript|ecmascript|^module$/.test(type)) continue;
				const c = classifyScript(el.text);
				if (c.runtimes.length) (page ? hits : downloads).push({ file: `${f.rel}:${el.line}`, runtimes: c.runtimes.map((r) => RUNTIME_NAMES[r]), where: 'inline script', loadedBy: page ? 'page' : 'copied page' });
			}
			continue;
		}
		const c = classifyScript(text);
		const runtimes = c.runtimes.map((r) => RUNTIME_NAMES[r]);
		if (CLIENT.test(f.rel)) {
			for (const m of text.matchAll(REMOTE_SCRIPT)) {
				const url = m[1]!;
				if (remote.some((r) => r.url === url)) continue;
				const note = KNOWN_REMOTE.find((k) => k.test.test(url))?.note;
				remote.push({ url, file: f.rel, ...(note ? { note } : {}) });
			}
		}
		if (BUNDLE.test(f.rel)) {
			scriptPaths(text, own);
			if (runtimes.length) hits.push({ file: f.rel, runtimes, where: 'bundle', loadedBy: 'page', evidence: 'in the app\'s own bundle' });
			if (c.libraries.length) libraries.push({ file: f.rel, libraries: c.libraries, where: 'bundle', loadedBy: 'page' });
		} else publicScripts.set(urlOf(f.rel), { rel: f.rel, text, runtimes, libraries: c.libraries });
	}
	// What a page loads, then what those files load in turn.
	const loaded = new Map<string, string>();
	let frontier = own;
	let source = 'the app\'s bundles or built pages';
	while (frontier.size) {
		const next = new Set<string>();
		for (const [url, file] of publicScripts) {
			if (loaded.has(url) || !frontier.has(url)) continue;
			loaded.set(url, source);
			scriptPaths(file.text, next);
		}
		frontier = next;
		source = 'a file a page loads';
	}
	for (const [url, file] of publicScripts) {
		const by = loaded.get(url);
		const loadedBy: RuntimeHit['loadedBy'] = by ? 'page' : copiedPages.has(url) ? 'copied page' : 'none';
		if (file.runtimes.length) (by ? hits : downloads).push({ file: file.rel, runtimes: file.runtimes, where: 'public file', loadedBy, ...(by ? { evidence: `referenced by ${by}` } : {}) });
		if (file.libraries.length) libraries.push({ file: file.rel, libraries: file.libraries, where: 'public file', loadedBy });
	}
	return { remote, hits, downloads, libraries, files: files.length };
}

export function summarizeBuild(dir: string, result: BuildScan): string {
	const lines: string[] = [];
	if (!result.hits.length) lines.push(`Build guard: ${result.files} script and HTML files in ${dir}; no page loads or runs another framework's runtime.`);
	else {
		lines.push(`Build guard: ${result.hits.length} file${result.hits.length === 1 ? '' : 's'} in ${dir} that a page loads or runs carry another framework's runtime; a Markless port ships none (implement what the pages use in Markless):`);
		for (const h of result.hits.slice(0, 40)) lines.push(`  FAIL  ${h.file}  ${h.runtimes.join(' + ')} (${h.where}${h.evidence ? `, ${h.evidence}` : ''})`);
		if (result.hits.length > 40) lines.push(`  ... ${result.hits.length - 40} more`);
	}
	if (result.downloads.length) {
		const copied = result.downloads.filter((d) => d.loadedBy === 'copied page').length;
		lines.push(`  Allowed: ${result.downloads.length} file${result.downloads.length === 1 ? '' : 's'} with a foreign runtime that no Markless page loads, served as downloads${copied ? ` (${copied} referenced only by static HTML copied into the output)` : ''}: ${result.downloads.slice(0, 8).map((d) => d.file).join(', ')}${result.downloads.length > 8 ? ', ...' : ''}`);
	}
	if (result.remote.length) lines.push(`  Loaded from another origin when a page runs (not in the build, listed): ${result.remote.map((r) => `${r.url}${r.note ? ` (${r.note})` : ''}`).join('; ')}`);
	if (result.libraries.length) lines.push(`  Kept libraries (JavaScript only; markless-migrate upgrade measures them): ${[...new Set(result.libraries.flatMap((l) => l.libraries))].join(', ')} in ${result.libraries.map((l) => l.file).slice(0, 6).join(', ')}`);
	return `${lines.join('\n')}\n`;
}

/**
 * A Vite plugin that fails `vite build` when a chunk carries another framework's runtime:
 * `plugins: [foreignRuntimeGuard()]` in the Markless app's vite.config. JavaScript-only libraries pass.
 */
export function foreignRuntimeGuard(): { name: string; apply: 'build'; generateBundle(this: { error(message: string): never }, options: unknown, bundle: Record<string, { type: string; code?: string; source?: string | Uint8Array; fileName: string }>): void } {
	return {
		name: 'markless-migrate:foreign-runtime-guard',
		apply: 'build',
		generateBundle(_options, bundle) {
			const hits: string[] = [];
			for (const item of Object.values(bundle)) {
				const code = item.type === 'chunk' ? item.code : SCRIPT.test(item.fileName) && typeof item.source === 'string' ? item.source : undefined;
				if (!code) continue;
				const runtimes = classifyScript(code).runtimes;
				if (runtimes.length) hits.push(`${item.fileName}: ${runtimes.map((r) => RUNTIME_NAMES[r]).join(' + ')}`);
			}
			if (hits.length) this.error(`another framework's runtime is in the build, and a Markless port ships none:\n${hits.join('\n')}`);
		},
	};
}
