import { execFile } from 'node:child_process';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { isFunction, keyName, parseModule, patternNames, walk, type N } from '../source/js.ts';
import type { Redirect } from '../source/types.ts';
import { fumadocsCollection } from './fumadocs/index.ts';
import { match } from 'path-to-regexp';

/** A non-page route of the old app (a Next.js route handler) and how the new app answers it. */
export interface EndpointPort {
	readonly route: string;
	readonly file: string;
	/**
	 * `handler`: its code and local imports run as server code; `prerendered`: a handler that reads no request ran at
	 * convert time for each path, as Next.js's build runs a static route; `build`: what the old build serves is served
	 * as it is.
	 */
	readonly how: 'handler' | 'prerendered' | 'build' | 'missing';
	readonly reason: string;
}

// A route handler whose closure needs another framework (React, Next's own modules, fumadocs-mdx's compiled content) is
// served from the old build: the new app carries that build's output for the path, never the framework's code.
const BUILD_ONLY = /^(fumadocs-mdx|react|react-dom|next\/(?!(?:server|navigation|og)$).+)$/;
const run = promisify(execFile);
const PACKAGE = (spec: string) => spec.split('/').slice(0, spec.startsWith('@') ? 2 : 1).join('/');

function resolveLocal(root: string, from: string, spec: string): string | undefined {
	let base: string;
	if (spec.startsWith('@/')) base = join(root, spec.slice(2));
	else if (spec.startsWith('.')) base = join(dirname(from), spec);
	else return undefined;
	for (const ext of ['', '.ts', '.tsx', '.mts', '.js', '.mjs', '.json', '/index.ts', '/index.tsx', '/index.js']) {
		const path = base + ext;
		if ((ext || /\.[a-z]+$/.test(base)) && existsSync(path)) return path;
	}
	return undefined;
}

interface Closure {
	readonly files: Set<string>;
	readonly packages: Set<string>;
	/** Dynamic `import()` expressions, by file and start offset, inside code the handler never reaches. */
	readonly dead: Map<string, Set<number>>;
}

interface Shape {
	/** Static imports and re-exports: every one is evaluated with the module, by the names taken from it (`*`: all). */
	readonly statics: { readonly spec: string; readonly names: ReadonlySet<string> }[];
	/** Re-exported name to the source and the name taken there. */
	readonly reexports: ReadonlyMap<string, { readonly spec: string; readonly imported: string }>;
	readonly stars: readonly string[];
	/** Exported name to the top-level declaration name it is. */
	readonly exported: ReadonlyMap<string, string>;
	/** Each top-level declaration's identifiers and dynamic imports. */
	readonly decls: ReadonlyMap<string, { readonly refs: ReadonlySet<string>; readonly dynamic: readonly { spec: string; start: number }[] }>;
	/** What the module's other top-level code references and imports dynamically: always run. */
	readonly top: { readonly refs: ReadonlySet<string>; readonly dynamic: readonly { spec: string; start: number }[] };
}

function shapeOf(file: string, text: string): Shape {
	const mod = parseModule(file, text);
	const statics: { spec: string; names: Set<string> }[] = [];
	const bySpec = new Map<string, Set<string>>();
	const take = (spec: string, name: string | undefined) => {
		let names = bySpec.get(spec);
		if (!names) {
			names = new Set();
			bySpec.set(spec, names);
			statics.push({ spec, names });
		}
		if (name) names.add(name);
	};
	const exported = new Map<string, string>();
	const decls = new Map<string, { refs: Set<string>; dynamic: { spec: string; start: number }[] }>();
	const top = { refs: new Set<string>(), dynamic: [] as { spec: string; start: number }[] };
	const scanInto = (node: N, into: { refs: Set<string>; dynamic: { spec: string; start: number }[] }) =>
		walk(node, (n: N) => {
			if (n.type === 'Identifier') into.refs.add(n.name);
			if (n.type === 'ImportExpression' && n.source?.type === 'Literal') into.dynamic.push({ spec: String(n.source.value), start: n.start });
		});
	const declared = (decl: N): string[] => (decl.type === 'VariableDeclaration' ? (decl.declarations as N[]).flatMap((d) => patternNames(d.id)) : decl.id?.name ? [decl.id.name] : []);
	const declare = (decl: N) => {
		const names = declared(decl);
		if (!names.length || !['VariableDeclaration', 'FunctionDeclaration', 'ClassDeclaration', 'TSEnumDeclaration'].includes(decl.type)) return false;
		const into = { refs: new Set<string>(), dynamic: [] as { spec: string; start: number }[] };
		scanInto(decl, into);
		for (const name of names) decls.set(name, into);
		return names;
	};
	for (const stmt of mod.program.body as N[]) {
		if (stmt.type === 'ImportDeclaration') {
			if (stmt.importKind === 'type') continue;
			const spec = String(stmt.source.value);
			take(spec, undefined);
			for (const sp of stmt.specifiers as N[]) {
				if (sp.importKind === 'type') continue;
				take(spec, sp.type === 'ImportDefaultSpecifier' ? 'default' : sp.type === 'ImportNamespaceSpecifier' ? '*' : (keyName(sp.imported) ?? ''));
			}
		} else if (stmt.type === 'ExportNamedDeclaration' && stmt.source) {
			if (stmt.exportKind === 'type') continue;
			take(String(stmt.source.value), undefined);
		} else if (stmt.type === 'ExportAllDeclaration') {
			if (stmt.exportKind === 'type') continue;
			take(String(stmt.source.value), undefined);
		} else if (stmt.type === 'ExportNamedDeclaration' && stmt.declaration) {
			for (const name of declare(stmt.declaration) || []) exported.set(name, name);
		} else if (stmt.type === 'ExportNamedDeclaration') {
			for (const sp of (stmt.specifiers ?? []) as N[]) exported.set(keyName(sp.exported) ?? '', keyName(sp.local) ?? '');
		} else if (stmt.type === 'ExportDefaultDeclaration') {
			const d = stmt.declaration as N;
			if (d.type === 'Identifier') exported.set('default', d.name);
			else if ((d.type === 'FunctionDeclaration' || d.type === 'ClassDeclaration') && d.id) {
				declare(d);
				exported.set('default', d.id.name);
			} else {
				const into = { refs: new Set<string>(), dynamic: [] as { spec: string; start: number }[] };
				scanInto(d, into);
				decls.set('default', into);
				exported.set('default', 'default');
			}
		} else if (!declare(stmt)) scanInto(stmt, top);
	}
	const reexports = new Map<string, { spec: string; imported: string }>();
	for (const [name, r] of mod.reexports) reexports.set(name, { spec: r.source, imported: r.imported });
	return { statics, reexports, stars: mod.starExports, exported, decls, top };
}

/**
 * The files and packages a route handler's code reaches. Static imports are all evaluated with their module; a dynamic
 * `import()` counts only inside code the handler reaches: the module's top-level code, or a declaration that a reached
 * export or reached code names. `getBaseComponent`'s import of the registry's React components is in the closure only
 * when some reached code calls it.
 */
export async function closureOf(root: string, entry: string, generated: ReadonlySet<string> = new Set()): Promise<Closure> {
	const files = new Set<string>();
	const packages = new Set<string>();
	const shapes = new Map<string, Shape | undefined>();
	const wanted = new Map<string, Set<string>>();
	const liveDynamic = new Map<string, Set<number>>();
	const queue: [string, readonly string[]][] = [[join(root, entry), ['*']]];
	const shape = async (file: string) => {
		if (!shapes.has(file)) shapes.set(file, file.endsWith('.json') || generated.has(file) ? undefined : shapeOf(file, await readFile(file, 'utf8')));
		return shapes.get(file);
	};
	const follow = (from: string, spec: string, names: readonly string[]) => {
		const local = resolveLocal(root, from, spec);
		if (local) queue.push([local, names]);
		else if (!spec.startsWith('.') && !spec.startsWith('@/')) packages.add(spec.startsWith('node:') || spec.startsWith('next/') ? spec : PACKAGE(spec));
	};
	while (queue.length) {
		const [file, names] = queue.pop()!;
		const first = !files.has(file);
		files.add(file);
		const want = wanted.get(file) ?? new Set<string>();
		wanted.set(file, want);
		const fresh = names.filter((n) => !want.has(n));
		if (!first && !fresh.length) continue;
		for (const n of fresh) want.add(n);
		// A file the converter writes itself (the content collection as data): its own imports are not the handler's.
		const sh = await shape(file);
		if (!sh) continue;
		if (first) for (const st of sh.statics) follow(file, st.spec, [...st.names]);
		const all = want.has('*');
		for (const n of all ? [...sh.reexports.keys()] : fresh) {
			const r = sh.reexports.get(n);
			if (r) follow(file, r.spec, [r.imported]);
		}
		for (const star of sh.stars) follow(file, star, all ? ['*'] : fresh.filter((n) => !sh.exported.has(n) && !sh.reexports.has(n)));
		const live = new Set<string>();
		const pending = [...sh.top.refs, ...(all ? [...sh.decls.keys()] : [...want].map((n) => sh.exported.get(n) ?? n))];
		while (pending.length) {
			const name = pending.pop()!;
			if (live.has(name) || !sh.decls.has(name)) continue;
			live.add(name);
			pending.push(...sh.decls.get(name)!.refs);
		}
		const dynamic = [...sh.top.dynamic, ...[...live].flatMap((n) => sh.decls.get(n)!.dynamic)];
		const seen = liveDynamic.get(file) ?? new Set<number>();
		liveDynamic.set(file, seen);
		for (const d of dynamic) {
			if (seen.has(d.start)) continue;
			seen.add(d.start);
			follow(file, d.spec, ['*']);
		}
	}
	const dead = new Map<string, Set<number>>();
	for (const [file, sh] of shapes) {
		if (!sh) continue;
		const live = liveDynamic.get(file) ?? new Set<number>();
		const unreached = [...sh.top.dynamic, ...[...sh.decls.values()].flatMap((d) => d.dynamic)].filter((d) => !live.has(d.start)).map((d) => d.start);
		if (unreached.length) dead.set(file, new Set(unreached));
	}
	return { files, packages, dead };
}

/** The module with JSX expressions replaced by `undefined` (data icons a handler never reads), and `@/` imports made relative. */
function serverSource(root: string, file: string, out: string, text: string, dead: ReadonlySet<number> = new Set()): string {
	const mod = parseModule(file, text);
	// JSX handed to next/og's ImageResponse is its input: satori reads elements as plain { type, props } objects.
	const elements = [...mod.imports.values()].some((i) => i.source === 'next/og');
	const edits: { start: number; end: number; text: string }[] = [];
	walk(mod.program, (n: N) => {
		if (n.type === 'ImportExpression' && dead.has(n.start)) {
			edits.push({ start: n.start, end: n.end, text: `Promise.reject(new Error(${JSON.stringify(`not ported: ${String(n.source?.value)} is imported only by code no ported route handler reaches`)}))` });
			return false;
		}
		if (n.type === 'JSXElement' || n.type === 'JSXFragment') {
			edits.push({ start: n.start, end: n.end, text: elements ? jsxObject(n, text) : 'undefined' });
			return false;
		}
		const source = n.type === 'ImportDeclaration' || n.type === 'ExportNamedDeclaration' || n.type === 'ExportAllDeclaration' || n.type === 'ImportExpression' ? n.source : undefined;
		if (source?.type === 'Literal' && typeof source.value === 'string') {
			const spec = source.value;
			if (spec.startsWith('@/')) {
				const target = resolveLocal(root, file, spec);
				if (target) {
					let rel = relative(dirname(join(out, relative(root, file))), join(out, relative(root, target))).replace(/\.tsx$/, '.ts');
					if (!rel.startsWith('.')) rel = `./${rel}`;
					edits.push({ start: source.start, end: source.end, text: JSON.stringify(rel) });
				}
			} else if (NEXT_SHIMS[spec]) edits.push({ start: source.start, end: source.end, text: JSON.stringify(relative(dirname(join(out, relative(root, file))), join(out, NEXT_SHIMS[spec])).replace(/^(?!\.)/, './')) });
			else if (/\.tsx$/.test(spec)) edits.push({ start: source.start, end: source.end, text: JSON.stringify(spec.replace(/\.tsx$/, '.ts')) });
		}
	});
	edits.sort((a, b) => b.start - a.start);
	let result = mod.ok ? text : text;
	for (const e of edits) result = result.slice(0, e.start) + e.text + result.slice(e.end);
	return result;
}

// What the handlers use of next/server, on the Fetch API.
const NEXT_SERVER = `// next/server's NextResponse and NextRequest, as the old route handlers use them, on the Fetch API.
export class NextResponse extends Response {
	static json(body: unknown, init?: ResponseInit): Response {
		return Response.json(body, init);
	}
	static redirect(url: string | URL, status = 307): Response {
		return Response.redirect(url, status);
	}
}
export type NextRequest = Request & { readonly nextUrl: URL };
export function nextRequest(request: Request): NextRequest {
	return Object.assign(request, { nextUrl: new URL(request.url) }) as NextRequest;
}
// after(): the callback runs once the response is handed back.
export function after(callback: () => unknown): void {
	setTimeout(() => void Promise.resolve().then(callback).catch(() => {}), 0);
}
`;

// next/navigation's notFound() and redirect() in a route handler: thrown, and answered by the routing middleware.
const NEXT_NAVIGATION = `// next/navigation's notFound() and redirect(), as the old route handlers call them.
export class NavigationThrow extends Error {
	constructor(readonly status: number, readonly location?: string) {
		super(location ? \`redirect \${location}\` : 'not found');
	}
}
export function notFound(): never {
	throw new NavigationThrow(404);
}
export function redirect(url: string): never {
	throw new NavigationThrow(307, url);
}
export function permanentRedirect(url: string): never {
	throw new NavigationThrow(308, url);
}
`;

// next/og is @vercel/og, which Next.js compiles in: the same library at the version Next.js carries.
const NEXT_OG = `export { ImageResponse } from '@vercel/og';
`;

const NEXT_SHIMS: Readonly<Record<string, string>> = { 'next/server': '__next-server.ts', 'next/navigation': '__next-navigation.ts', 'next/og': '__next-og.ts' };

/** JSX as the element objects satori reads (`{ type, props: { ...attributes, children } }`), React's text rules kept. */
export function jsxObject(n: N, text: string): string {
	const code = (x: N) => text.slice(x.start, x.end);
	const child = (c: N): string | undefined => {
		if (c.type === 'JSXText') {
			const lines = String(c.value).split(/\r\n|\n|\r/);
			const kept = lines
				.map((line, i) => {
					let t = line.replace(/\t/g, ' ');
					if (i > 0) t = t.replace(/^[ ]+/, '');
					if (i < lines.length - 1) t = t.replace(/[ ]+$/, '');
					return t;
				})
				.filter((t, i) => t || (lines.length === 1 && i === 0));
			const joined = kept.join(' ');
			return joined ? JSON.stringify(joined) : undefined;
		}
		if (c.type === 'JSXExpressionContainer') return c.expression.type === 'JSXEmptyExpression' ? undefined : child(c.expression) ?? code(c.expression);
		if (c.type === 'JSXElement' || c.type === 'JSXFragment') return jsxObject(c, text);
		if (c.type === 'JSXSpreadChild') return `...${code(c.expression)}`;
		return undefined;
	};
	const children = (list: readonly N[]) => list.map(child).filter((c): c is string => c !== undefined);
	if (n.type === 'JSXFragment') {
		const kids = children(n.children);
		return kids.length === 1 && !kids[0]!.startsWith('...') ? kids[0]! : `[${kids.join(', ')}]`;
	}
	const name = (x: N): string => (x.type === 'JSXIdentifier' ? x.name : x.type === 'JSXMemberExpression' ? `${name(x.object)}.${x.property.name}` : `${x.namespace.name}:${x.name.name}`);
	const tag = name(n.openingElement.name);
	const type = /^[a-z]/.test(tag) || tag.includes(':') ? JSON.stringify(tag) : tag;
	const props: string[] = [];
	for (const a of n.openingElement.attributes as N[]) {
		if (a.type === 'JSXSpreadAttribute') {
			props.push(`...${code(a.argument)}`);
			continue;
		}
		const key = JSON.stringify(name(a.name));
		const v = a.value;
		props.push(`${key}: ${!v ? 'true' : v.type === 'Literal' ? JSON.stringify(v.value) : v.type === 'JSXExpressionContainer' ? code(v.expression) : jsxObject(v, text)}`);
	}
	const kids = children(n.children);
	if (kids.length) props.push(`children: ${kids.length === 1 && !kids[0]!.startsWith('...') ? kids[0] : `[${kids.join(', ')}]`}`);
	return `{ type: ${type}, key: null, props: { ${props.join(', ')} } }`;
}

/** Next.js's dynamic segments as path-to-regexp patterns: `[x]` is `:x`, `[...x]` is `:x+`, `[[...x]]` is `:x*`. */
export function nextPattern(file: string): string {
	const dir = dirname(file).replace(/^app/, '');
	const segments = dir
		.split('/')
		.filter((s) => s && !/^\(.*\)$/.test(s))
		.map((s) => s.replace(/^\[\[\.\.\.(\w+)\]\]$/, ':$1*').replace(/^\[\.\.\.(\w+)\]$/, ':$1+').replace(/^\[(\w+)\]$/, ':$1'));
	return `/${segments.join('/')}`;
}

export interface RoutingInput {
	readonly app: string;
	readonly source: string;
	readonly old: string;
	readonly endpoints: readonly { readonly file: string; readonly route: string }[];
	readonly redirects: readonly Redirect[];
	/** Paths whose body the old build serves (endpoint outputs to keep), with their content type. */
	readonly builtPaths: readonly string[];
	/** The pages this app renders, so a preview can send every other path to the old deployment. */
	readonly pages: readonly string[];
	/** The old deployment every other page is answered from, in a preview of some converted pages. */
	readonly fallthrough?: string;
	readonly log?: (line: string) => void;
}

/**
 * The old install's peer resolutions npm would refuse: pnpm gives a package's peer the version its parent has, with a
 * warning when the peer range excludes it (fumadocs-core takes the app's zod 3 for its optional zod 4 peer), while npm
 * stops the install. Each peer the old install resolved to the app's own copy becomes an npm override to that copy.
 */
export function peerOverrides(source: string, packages: Record<string, string>): Record<string, Record<string, string>> {
	const out: Record<string, Record<string, string>> = {};
	const dirOf = (modules: string, name: string) => {
		const dir = join(modules, name);
		return existsSync(join(dir, 'package.json')) ? realpathSync(dir) : undefined;
	};
	for (const name of Object.keys(packages)) {
		const dir = dirOf(join(source, 'node_modules'), name);
		if (!dir) continue;
		const peers = (JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as { peerDependencies?: Record<string, string> }).peerDependencies ?? {};
		for (const peer of Object.keys(peers)) {
			if (!packages[peer]) continue;
			const own = dirOf(join(source, 'node_modules'), peer);
			const theirs = dirOf(join(dir, ...name.split('/').map(() => '..')), peer);
			if (own && theirs === own) (out[name] ??= {})[peer] = `$${peer}`;
		}
	}
	return out;
}

export interface SitemapEntry {
	readonly url: string;
	readonly lastModified?: string;
	readonly changeFrequency?: string;
	readonly priority?: number;
}

/** A sitemap's entries as the XML Next.js writes for app/sitemap.ts (the fields beyond these are not written yet). */
export function sitemapXml(entries: readonly SitemapEntry[]): string {
	const unsupported = entries.flatMap((e) => Object.keys(e).filter((k) => !['url', 'lastModified', 'changeFrequency', 'priority'].includes(k)));
	if (unsupported.length) throw new Error(`sitemap fields not written yet: ${[...new Set(unsupported)].join(', ')}`);
	let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';
	for (const e of entries) {
		xml += `<url>\n<loc>${e.url}</loc>\n`;
		if (e.lastModified) xml += `<lastmod>${e.lastModified}</lastmod>\n`;
		if (e.changeFrequency) xml += `<changefreq>${e.changeFrequency}</changefreq>\n`;
		if (typeof e.priority === 'number') xml += `<priority>${e.priority}</priority>\n`;
		xml += '</url>\n';
	}
	return `${xml}</urlset>\n`;
}

export interface RobotsData {
	readonly rules: RobotsRule | readonly RobotsRule[];
	readonly sitemap?: string | readonly string[];
	readonly host?: string;
}
interface RobotsRule {
	readonly userAgent?: string | readonly string[];
	readonly allow?: string | readonly string[];
	readonly disallow?: string | readonly string[];
	readonly crawlDelay?: number;
}

/** robots.txt as Next.js writes it for app/robots.ts. */
export function robotsTxt(data: RobotsData): string {
	const list = <T>(v: T | readonly T[] | undefined): readonly T[] => (v === undefined ? [] : Array.isArray(v) ? v : [v as T]);
	let text = '';
	for (const rule of list(data.rules)) {
		for (const agent of rule.userAgent === undefined ? ['*'] : list(rule.userAgent)) text += `User-Agent: ${agent}\n`;
		for (const a of list(rule.allow)) text += `Allow: ${a}\n`;
		for (const d of list(rule.disallow)) text += `Disallow: ${d}\n`;
		if (rule.crawlDelay) text += `Crawl-delay: ${rule.crawlDelay}\n`;
		text += '\n';
	}
	if (data.host) text += `Host: ${data.host}\n`;
	for (const m of list(data.sitemap)) text += `Sitemap: ${m}\n`;
	return text;
}

const PRERENDER = fileURLToPath(new URL('./prerender/run.mjs', import.meta.url));

interface Prerendered {
	readonly path: string;
	readonly status?: number;
	readonly headers?: [string, string][];
	readonly body?: string;
	readonly value?: unknown;
	readonly error?: string;
}

/** The old app's environment as its build saw it: .env, .env.production and .env.local, in Next.js's order. */
async function buildEnv(source: string): Promise<Record<string, string>> {
	const env: Record<string, string> = {};
	for (const name of ['.env', '.env.production', '.env.local', '.env.production.local']) {
		const text = await readFile(join(source, name), 'utf8').catch(() => '');
		for (const line of text.split('\n')) {
			const m = /^\s*([A-Za-z_][\w]*)\s*=\s*(.*?)\s*$/.exec(line);
			if (m) env[m[1]!] = m[2]!.replace(/^(['"])(.*)\1$/, '$2');
		}
	}
	return { ...env, NODE_ENV: 'production' };
}

/** Runs the ported handler modules in Node from the old app's directory, once per path. */
async function prerender(source: string, old: string, dir: string, jobs: readonly { module: string; kind: string; paths: readonly { path: string; params: object }[] }[]): Promise<Map<string, Prerendered>> {
	const jobsFile = join(dir, 'jobs.json');
	const outFile = join(dir, 'results.json');
	await writeFile(jobsFile, JSON.stringify({ oldApp: source, origin: old, env: await buildEnv(source), jobs }));
	await run(process.execPath, ['--experimental-transform-types', '--no-warnings', PRERENDER, jobsFile, outFile], { cwd: source, maxBuffer: 64 * 1024 * 1024 }).catch((error: Error & { stderr?: string }) => {
		throw new Error(`prerendering the route handlers failed: ${error.stderr?.slice(-2000) ?? error.message}`);
	});
	const results = JSON.parse(await readFile(outFile, 'utf8')) as Prerendered[];
	return new Map(results.map((r) => [r.path, r]));
}

/** Whether a route handler's GET reads no request: it takes none, or never uses the one it is given (`_req`). */
export function readsNoRequest(file: string, text: string): boolean {
	const mod = parseModule(file, text);
	const get = mod.exports.get('GET');
	if (!get || !isFunction(get)) return false;
	const first = (get.params as N[])[0];
	if (!first) return true;
	if (first.type !== 'Identifier') return false;
	let used = false;
	walk(get.body, (n: N) => {
		if (n.type === 'Identifier' && n.name === first.name) used = true;
	});
	return !used;
}

/**
 * Writes `server/routing.ts`, a Nitro middleware run before Markless's pages: the old config's redirects (308/307) and
 * rewrites, each old route handler ported as server code, and build-time outputs of the old app the new app serves
 * as they are; plus the packages the ported handlers import, at the old app's versions.
 */
export async function writeRouting(input: RoutingInput): Promise<{ ports: EndpointPort[]; packages: Record<string, string>; overrides: Record<string, Record<string, string>> }> {
	const { app, source } = input;
	const out = join(app, 'server', 'handlers');
	await rm(out, { recursive: true, force: true });
	await mkdir(out, { recursive: true });
	await writeFile(join(out, '__next-server.ts'), NEXT_SERVER);
	const manifest = JSON.parse(await readFile(join(source, 'package.json'), 'utf8')) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
	const versions = { ...manifest.devDependencies, ...manifest.dependencies };
	const packages: Record<string, string> = { 'path-to-regexp': '6.3.0' };
	const ports: EndpointPort[] = [];
	const handlers: { pattern: string; module: string }[] = [];
	const collection = await fumadocsCollection(source);
	const generated = new Set(collection ? [join(source, collection.file)] : []);
	if (collection) input.log?.(`content collection ${collection.file}: ${collection.entries} entries read as data by fumadocs-mdx's own loader`);
	// Next.js's metadata routes: app/sitemap.ts and app/robots.ts, whose default export's value Next.js writes as a file.
	const metadata = [
		{ route: '/sitemap.xml', names: ['app/sitemap.ts', 'app/sitemap.js'] },
		{ route: '/robots.txt', names: ['app/robots.ts', 'app/robots.js'] },
	].flatMap((m) => m.names.filter((f) => existsSync(join(source, f))).slice(0, 1).map((file) => ({ route: m.route, file, metadata: true })));
	const ported = handlers.map((h) => match(h.pattern, { decode: decodeURIComponent }));
	const runtime = new Map<string, Set<number> | undefined>();
	const prerendered = new Map<string, Set<number> | undefined>();
	const jobs: { module: string; kind: 'handler' | 'metadata'; route: string; file: string; paths: { path: string; params: object }[] }[] = [];
	const mergeDead = (into: Map<string, Set<number> | undefined>, closure: Closure) => {
		for (const file of closure.files) {
			const dead = closure.dead.get(file);
			if (!into.has(file)) into.set(file, dead && new Set(dead));
			else {
				const was = into.get(file);
				into.set(file, was && dead ? new Set([...was].filter((d) => dead.has(d))) : undefined);
			}
		}
	};
	for (const endpoint of [...input.endpoints.map((e) => ({ ...e, metadata: false })), ...metadata]) {
		const closure = await closureOf(source, endpoint.file, generated);
		const blocked = [...closure.packages].filter((p) => BUILD_ONLY.test(p));
		const cwd: string[] = [];
		for (const file of closure.files) if (!file.endsWith('.json') && /process\.cwd\(\)/.test(await readFile(file, 'utf8'))) cwd.push(relative(source, file));
		const entryText = await readFile(join(source, endpoint.file), 'utf8');
		const pattern = endpoint.metadata ? endpoint.route : nextPattern(endpoint.file);
		const fixed = !/:/.test(pattern);
		const isStatic = endpoint.metadata || readsNoRequest(endpoint.file, entryText);
		const paths = isStatic ? (fixed ? [{ path: pattern, params: {} }] : input.builtPaths.flatMap((path) => {
			const m = match(pattern, { decode: decodeURIComponent })(path);
			return m ? [{ path, params: m.params }] : [];
		})) : [];
		if (blocked.length || (cwd.length && !isStatic)) {
			const needs = [...blocked, ...cwd.map((f) => `its own files from process.cwd() (${f})`)];
			ports.push({ route: endpoint.route, file: endpoint.file, how: 'build', reason: `its code needs ${needs.join(', ')} at build time; the old build's output for each path is served` });
			continue;
		}
		if (isStatic) {
			mergeDead(prerendered, closure);
			jobs.push({ module: endpoint.file.replace(/\.tsx$/, '.ts'), kind: endpoint.metadata ? 'metadata' : 'handler', route: endpoint.route, file: endpoint.file, paths });
			// Files it reads from the old app's directory exist only at convert time: what it answered is all it can answer.
			if (cwd.length || endpoint.metadata) continue;
		}
		mergeDead(runtime, closure);
		for (const p of closure.packages) {
			if (p.startsWith('node:') || p.startsWith('next/') || ['next', 'fs', 'path', 'crypto', 'url', 'os'].includes(p)) continue;
			const version = versions[p];
			if (version && !version.startsWith('workspace:')) packages[p] = version;
		}
		if (closure.packages.has('next/og')) {
			const og = JSON.parse(await readFile(createRequire(join(source, 'package.json')).resolve('next/dist/compiled/@vercel/og/package.json'), 'utf8')) as { version: string };
			packages['@vercel/og'] = og.version;
		}
		handlers.push({ pattern, module: `./handlers/${endpoint.file.replace(/\.tsx$/, '.ts')}` });
		ports.push({ route: endpoint.route, file: endpoint.file, how: 'handler', reason: `${closure.files.size} files of the old app's server code${isStatic ? `; also run at convert time for ${paths.length} path${paths.length === 1 ? '' : 's'}` : ''}` });
		ported.push(match(pattern, { decode: decodeURIComponent }));
	}
	const writeClosure = async (dir: string, files: ReadonlyMap<string, Set<number> | undefined>) => {
		await mkdir(dir, { recursive: true });
		await writeFile(join(dir, '__next-server.ts'), NEXT_SERVER);
		await writeFile(join(dir, '__next-navigation.ts'), NEXT_NAVIGATION);
		await writeFile(join(dir, '__next-og.ts'), NEXT_OG);
		for (const [file, dead] of files) {
			const target = join(dir, relative(source, file)).replace(/\.tsx$/, '.ts');
			await mkdir(dirname(target), { recursive: true });
			if (collection && generated.has(file)) {
				await writeFile(target, collection.source);
				await writeFile(join(dirname(target), 'collection.json'), collection.data);
				await collection.copyRuntime(dirname(target));
				continue;
			}
			await writeFile(target, file.endsWith('.json') ? await readFile(file, 'utf8') : serverSource(source, file, dir, await readFile(file, 'utf8'), dead));
		}
	};
	await writeClosure(out, runtime);
	const built: Record<string, { file: string; type: string; headers?: Record<string, string> }> = {};
	const assets = join(app, 'server', 'built');
	await rm(assets, { recursive: true, force: true });
	await mkdir(assets, { recursive: true });
	let n = 0;
	if (jobs.length) {
		const dir = join(app, '.migrate', 'convert', 'prerender');
		await rm(dir, { recursive: true, force: true });
		await writeClosure(join(dir, 'handlers'), prerendered);
		const results = await prerender(source, input.old, dir, jobs.map((j) => ({ ...j, module: join(dir, 'handlers', j.module) })));
		for (const job of jobs) {
			let answered = 0;
			const failures: string[] = [];
			for (const p of job.paths) {
				const r = results.get(p.path);
				if (!r || r.error || (job.kind === 'metadata' ? r.value === undefined : (r.status ?? 500) >= 400)) {
					failures.push(`${p.path}: ${r?.error?.split('\n')[0] ?? `status ${r?.status}`}`);
					continue;
				}
				const name = `${n++}`;
				let body: Buffer;
				let headers: Record<string, string>;
				if (job.kind === 'metadata') {
					const text = job.route === '/sitemap.xml' ? sitemapXml(r.value as SitemapEntry[]) : robotsTxt(r.value as RobotsData);
					body = Buffer.from(text);
					headers = { 'content-type': job.route === '/sitemap.xml' ? 'application/xml' : 'text/plain' };
				} else {
					body = Buffer.from(r.body ?? '', 'base64');
					headers = Object.fromEntries(r.headers ?? []);
				}
				await writeFile(join(assets, name), body);
				const { 'content-type': type = 'application/octet-stream', ...rest } = headers;
				built[p.path] = { file: name, type, ...(Object.keys(rest).length ? { headers: rest } : {}) };
				answered++;
			}
			if (failures.length) input.log?.(`  ${job.route}: ${failures.length} paths not answered at convert time: ${failures.slice(0, 3).join('; ')}`);
			if (!answered) {
				ports.push({ route: job.route, file: job.file, how: 'build', reason: `running its code at convert time answered no path (${failures[0] ?? 'no paths'}); the old build's output is served` });
				continue;
			}
			if (!ports.some((x) => x.route === job.route)) ports.push({ route: job.route, file: job.file, how: 'prerendered', reason: `the old app's code ran at convert time for ${answered} of ${job.paths.length} paths, as Next.js's build runs a static route` });
			ported.push(match(job.route === '/sitemap.xml' || job.route === '/robots.txt' ? job.route : nextPattern(job.file), { decode: decodeURIComponent }));
		}
	}
	for (const path of input.builtPaths) {
		// A path a ported handler answers is the handler's.
		if (built[path] || ported.some((m) => m(path))) continue;
		const response = await fetch(new URL(path, input.old)).catch(() => undefined);
		if (!response?.ok) continue;
		const name = `${n++}`;
		await writeFile(join(assets, name), Buffer.from(await response.arrayBuffer()));
		built[path] = { file: name, type: response.headers.get('content-type') ?? 'application/octet-stream' };
	}
	input.log?.(`endpoints: ${handlers.length} handlers ported, ${jobs.length} run at convert time; ${Object.keys(built).length} outputs served as files`);
	const redirects = input.redirects.filter((r) => r.kind !== 'rewrite');
	const rewrites = input.redirects.filter((r) => r.kind === 'rewrite');
	const routing = `// Generated by markless-migrate convert from the old app's config and route handlers; change the converter, not this file.
import { defineHandler } from 'nitro';
import { useStorage } from 'nitro/storage';
import { compile, match } from 'path-to-regexp';
import { nextRequest } from './handlers/__next-server.ts';
import { NavigationThrow } from './handlers/__next-navigation.ts';
${handlers.map((h, i) => `import * as handler${i} from ${JSON.stringify(h.module)};`).join('\n')}

const REDIRECTS: readonly { from: string; to: string; permanent: boolean }[] = ${JSON.stringify(redirects.map((r) => ({ from: r.from, to: r.to, permanent: r.permanent ?? false })))};
const REWRITES: readonly { from: string; to: string }[] = ${JSON.stringify(rewrites.map((r) => ({ from: r.from, to: r.to })))};
const HANDLERS: readonly { pattern: string; module: Record<string, unknown> }[] = [${handlers.map((h, i) => `{ pattern: ${JSON.stringify(h.pattern)}, module: handler${i} }`).join(', ')}];
const BUILT: Readonly<Record<string, { file: string; type: string; headers?: Record<string, string> }>> = ${JSON.stringify(built)};
const PAGES = new Set<string>(${JSON.stringify(input.pages)});
// A preview with only some pages converted (MIGRATE_FALLTHROUGH set to the old deployment) answers every other page
// from there, marked as the old app's.
const FALLTHROUGH: string | undefined = process.env.MIGRATE_FALLTHROUGH${input.fallthrough ? ` ?? ${JSON.stringify(input.fallthrough)}` : ''};
const OWN = /^\\/(build|_markless|_converted|assets|_next\\/static)\\//;

const matchers = new Map<string, ReturnType<typeof match>>();
const matcher = (pattern: string) => matchers.get(pattern) ?? matchers.set(pattern, match(pattern, { decode: decodeURIComponent })).get(pattern)!;

// Next.js destinations: :param substituted, the query kept.
function destination(to: string, params: object, search: string): string {
	const external = /^https?:\\/\\//.test(to);
	const url = external ? new URL(to) : new URL(to, 'http://x');
	const path = compile(url.pathname, { encode: encodeURIComponent, validate: false })(params as Record<string, string>);
	const query = [url.search.slice(1), search.slice(1)].filter(Boolean).join('&');
	return \`\${external ? url.origin : ''}\${path}\${query ? \`?\${query}\` : ''}\`;
}

async function answer(request: Request, pathname: string, search: string): Promise<Response | undefined> {
	// The old build's output for a path is one answer; one that varies by query is not the old app's.
	const built = search ? undefined : BUILT[pathname];
	if (built) {
		const body = await useStorage('assets:built').getItemRaw(built.file);
		return new Response(body as BodyInit, { headers: { ...built.headers, 'content-type': built.type } });
	}
	for (const h of HANDLERS) {
		const m = matcher(h.pattern)(pathname);
		const run = m && (h.module[request.method] as ((request: Request, context: { params: Promise<object> }) => Promise<Response> | Response) | undefined);
		if (!run) continue;
		try {
			return await run(nextRequest(request), { params: Promise.resolve(m.params) });
		} catch (error) {
			if (!(error instanceof NavigationThrow)) throw error;
			return error.location ? new Response(null, { status: error.status, headers: { location: error.location } }) : new Response('Not Found', { status: 404 });
		}
	}
	return undefined;
}

export default defineHandler(async (event) => {
	const request = event.req as Request;
	const url = new URL(request.url);
	for (const r of REDIRECTS) {
		const m = matcher(r.from)(url.pathname);
		if (m) return new Response(null, { status: r.permanent ? 308 : 307, headers: { location: destination(r.to, m.params, url.search) } });
	}
	const own = await answer(request, url.pathname, url.search);
	if (own) return own;
	for (const r of REWRITES) {
		const m = matcher(r.from)(url.pathname);
		if (!m) continue;
		const to = destination(r.to, m.params, url.search);
		if (/^https?:/.test(to)) return fetch(to, { method: request.method, headers: request.headers, body: ['GET', 'HEAD'].includes(request.method) ? undefined : await request.arrayBuffer() });
		const rewritten = await answer(request, new URL(to, url).pathname, new URL(to, url).search);
		if (rewritten) return rewritten;
	}
	if (FALLTHROUGH && !PAGES.has(url.pathname.replace(/\\/$/, '') || '/') && !OWN.test(url.pathname)) {
		const upstream = await fetch(new URL(url.pathname + url.search, FALLTHROUGH), { method: request.method, headers: { accept: request.headers.get('accept') ?? '*/*', 'accept-language': request.headers.get('accept-language') ?? '' }, redirect: 'manual' });
		const headers = new Headers(upstream.headers);
		headers.delete('content-encoding');
		headers.delete('content-length');
		headers.set('x-markless-migrate-side', 'old');
		return new Response(upstream.body, { status: upstream.status, headers });
	}
});
`;
	await writeFile(join(app, 'server', 'routing.ts'), routing);
	return { ports, packages, overrides: peerOverrides(source, packages) };
}
