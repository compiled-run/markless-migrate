import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { parseModule, walk, type N } from '../source/js.ts';
import type { Redirect } from '../source/types.ts';

/** A non-page route of the old app (a Next.js route handler) and how the new app answers it. */
export interface EndpointPort {
	readonly route: string;
	readonly file: string;
	/** `handler`: its code and local imports run as server code; `build`: what the old build serves is served as it is. */
	readonly how: 'handler' | 'build' | 'missing';
	readonly reason: string;
}

// A route handler whose closure needs another framework's build-time content compiler is served from the old build: it
// is the old build's output for that path, not the framework's code.
const BUILD_ONLY = /^(fumadocs-mdx|@vercel\/og|next\/(?!server$).+)$/;
const PACKAGE = (spec: string) => spec.split('/').slice(0, spec.startsWith('@') ? 2 : 1).join('/');

interface Closure {
	readonly files: Set<string>;
	readonly packages: Set<string>;
}

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

async function closureOf(root: string, entry: string): Promise<Closure> {
	const files = new Set<string>();
	const packages = new Set<string>();
	const queue = [join(root, entry)];
	while (queue.length) {
		const file = queue.pop()!;
		if (files.has(file)) continue;
		files.add(file);
		if (file.endsWith('.json')) continue;
		const mod = parseModule(file, await readFile(file, 'utf8'));
		const specs = new Set([...[...mod.imports.values()].map((i) => i.source), ...[...mod.reexports.values()].map((r) => r.source), ...mod.starExports]);
		walk(mod.program, (n: N) => {
			if (n.type === 'ImportExpression' && n.source?.type === 'Literal') specs.add(String(n.source.value));
		});
		for (const spec of specs) {
			const local = resolveLocal(root, file, spec);
			if (local) queue.push(local);
			else if (!spec.startsWith('.') && !spec.startsWith('@/')) packages.add(spec.startsWith('node:') || spec.startsWith('next/') ? spec : PACKAGE(spec));
		}
	}
	return { files, packages };
}

/** The module with JSX expressions replaced by `undefined` (data icons a handler never reads), and `@/` imports made relative. */
function serverSource(root: string, file: string, out: string, text: string): string {
	const mod = parseModule(file, text);
	const edits: { start: number; end: number; text: string }[] = [];
	walk(mod.program, (n: N) => {
		if (n.type === 'JSXElement' || n.type === 'JSXFragment') {
			edits.push({ start: n.start, end: n.end, text: 'undefined' });
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
			} else if (spec === 'next/server') edits.push({ start: source.start, end: source.end, text: JSON.stringify(relative(dirname(join(out, relative(root, file))), join(out, '__next-server.ts')).replace(/^(?!\.)/, './')) });
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
`;

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
	readonly log?: (line: string) => void;
}

/**
 * Writes `server/routing.ts`, a Nitro middleware run before Markless's pages: the old config's redirects (308/307) and
 * rewrites, each old route handler ported as server code, and build-time outputs of the old app the new app serves
 * as they are; plus the packages the ported handlers import, at the old app's versions.
 */
export async function writeRouting(input: RoutingInput): Promise<{ ports: EndpointPort[]; packages: Record<string, string> }> {
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
	for (const endpoint of input.endpoints) {
		const closure = await closureOf(source, endpoint.file);
		const blocked = [...closure.packages].filter((p) => BUILD_ONLY.test(p));
		if (blocked.length) {
			ports.push({ route: endpoint.route, file: endpoint.file, how: 'build', reason: `its code needs ${blocked.join(', ')} at build time; the old build's output for each path is served` });
			continue;
		}
		for (const file of closure.files) {
			const target = join(out, relative(source, file)).replace(/\.tsx$/, '.ts');
			await mkdir(dirname(target), { recursive: true });
			await writeFile(target, file.endsWith('.json') ? await readFile(file, 'utf8') : serverSource(source, file, out, await readFile(file, 'utf8')));
		}
		for (const p of closure.packages) {
			if (p.startsWith('node:') || p.startsWith('next/') || ['next', 'fs', 'path', 'crypto', 'url', 'os'].includes(p)) continue;
			const version = versions[p];
			if (version && !version.startsWith('workspace:')) packages[p] = version;
		}
		handlers.push({ pattern: nextPattern(endpoint.file), module: `./handlers/${relative(source, endpoint.file).replace(/\.tsx$/, '.ts')}` });
		ports.push({ route: endpoint.route, file: endpoint.file, how: 'handler', reason: `${closure.files.size} files of the old app's server code` });
	}
	const built: Record<string, { file: string; type: string }> = {};
	const assets = join(app, 'server', 'built');
	await rm(assets, { recursive: true, force: true });
	await mkdir(assets, { recursive: true });
	let n = 0;
	for (const path of input.builtPaths) {
		const response = await fetch(new URL(path, input.old)).catch(() => undefined);
		if (!response?.ok) continue;
		const name = `${n++}`;
		await writeFile(join(assets, name), Buffer.from(await response.arrayBuffer()));
		built[path] = { file: name, type: response.headers.get('content-type') ?? 'application/octet-stream' };
	}
	input.log?.(`endpoints: ${handlers.length} handlers ported, ${Object.keys(built).length} build outputs served as built`);
	const redirects = input.redirects.filter((r) => r.kind !== 'rewrite');
	const rewrites = input.redirects.filter((r) => r.kind === 'rewrite');
	const routing = `// Generated by markless-migrate convert from the old app's config and route handlers; change the converter, not this file.
import { defineHandler } from 'nitro';
import { useStorage } from 'nitro/storage';
import { compile, match } from 'path-to-regexp';
import { nextRequest } from './handlers/__next-server.ts';
${handlers.map((h, i) => `import * as handler${i} from ${JSON.stringify(h.module)};`).join('\n')}

const REDIRECTS: readonly { from: string; to: string; permanent: boolean }[] = ${JSON.stringify(redirects.map((r) => ({ from: r.from, to: r.to, permanent: r.permanent ?? false })))};
const REWRITES: readonly { from: string; to: string }[] = ${JSON.stringify(rewrites.map((r) => ({ from: r.from, to: r.to })))};
const HANDLERS: readonly { pattern: string; module: Record<string, unknown> }[] = [${handlers.map((h, i) => `{ pattern: ${JSON.stringify(h.pattern)}, module: handler${i} }`).join(', ')}];
const BUILT: Readonly<Record<string, { file: string; type: string }>> = ${JSON.stringify(built)};

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
		return new Response(body as BodyInit, { headers: { 'content-type': built.type } });
	}
	for (const h of HANDLERS) {
		const m = matcher(h.pattern)(pathname);
		const run = m && (h.module[request.method] as ((request: Request, context: { params: Promise<object> }) => Promise<Response> | Response) | undefined);
		if (run) return run(nextRequest(request), { params: Promise.resolve(m.params) });
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
});
`;
	await writeFile(join(app, 'server', 'routing.ts'), routing);
	return { ports, packages };
}
