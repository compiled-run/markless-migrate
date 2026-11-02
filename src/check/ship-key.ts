// A route's check is reused only while what it ships is unchanged: its served HTML (pack file names aside), the code hash
// of every module it can run (the build's interaction closures, before packing), the bytes of every other file its HTML
// names, the responses it fetched at load, OLD's HTML, and the checker's and Markless's versions. Pack hashes are left out
// on purpose: a shared pack changes whenever any member does.
import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { closureOf, keyOf, ROOT, usedBy, type Closure } from '../code-closure.ts';
import type { N } from '../source/js.ts';
import { partSelectors } from './probe-parts.ts';
import type { RouteResult } from './types.ts';

export interface Closures {
	readonly routes: ReadonlyMap<string, { readonly fallback?: string; readonly modules: ReadonlyMap<string, string> }>;
}

/** The Markless build's interaction-closures asset: per route page, each module any of its consumers can run, with its code hash ('' when the build had none). */
export function readClosures(source: string): Closures {
	const parsed = JSON.parse(source) as {
		readonly modules: readonly string[];
		readonly moduleHashes?: readonly string[];
		readonly closures: readonly (readonly number[])[];
		readonly routes: readonly { readonly route: string; readonly fallback?: string; readonly consumers: readonly { readonly closure: number }[] }[];
	};
	const routes = new Map<string, { fallback?: string; modules: Map<string, string> }>();
	for (const route of parsed.routes) {
		const modules = new Map<string, string>();
		for (const consumer of route.consumers) for (const index of parsed.closures[consumer.closure] ?? []) modules.set(parsed.modules[index]!, parsed.moduleHashes?.[index] ?? '');
		routes.set(route.route, { ...(route.fallback ? { fallback: route.fallback } : {}), modules });
	}
	return { routes };
}

const ROUTE_SCRIPT = /<script type="@markless\/core\/route">([^<]*)<\/script>/;
// Content-hashed file names of packs and of the router's link table: what they hold is keyed by module instead.
const PACK_NAMES = /(\/build\/chunk-)[\w-]+(\.js)|(\/_markless\/links\/)[\w-]+(\.js)/g;

/** The served HTML with pack file names taken out. */
export function shippedHtml(html: string): string {
	return html.replace(PACK_NAMES, (_, a, b, c, d) => (a ? `${a}#${b}` : `${c}#${d}`));
}

export function shipKey(route: string, html: string, closures: Closures | undefined, versions: Readonly<Record<string, string>>): { readonly key?: string; readonly why?: string } {
	if (!closures) return { why: 'the build has no closures file' };
	const script = ROUTE_SCRIPT.exec(html)?.[1];
	let file: string | undefined;
	try {
		file = script ? (JSON.parse(script) as { file?: string }).file : undefined;
	} catch {}
	if (!file) return { why: `${route} names no Markless route in its HTML` };
	const entry = closures.routes.get(file);
	if (!entry) return { why: `${file} is not in the build's closures` };
	if (entry.fallback) return { why: `${file} has no bounded closures (fallback: ${entry.fallback})` };
	const unhashed = [...entry.modules].find(([, hash]) => !hash);
	if (unhashed) return { why: `${unhashed[0]} has no code hash in the build's closures` };
	const modules = [...entry.modules].sort(([a], [b]) => (a < b ? -1 : 1)).map(([id, code]) => `module ${id} ${code}\n`);
	return { key: reuseKey(versions, [`route ${route}\n`, ...modules, shippedHtml(html)]) };
}

/** The one key scheme of every reuse entry (check's routes, the probe's old side): the versions it depends on, then its parts. */
export function reuseKey(versions: Readonly<Record<string, string>>, parts: readonly string[]): string {
	const hash = createHash('sha256');
	for (const [name, value] of Object.entries(versions).sort(([a], [b]) => (a < b ? -1 : 1))) hash.update(`version ${name} ${value}\n`);
	for (const part of parts) hash.update(part);
	return hash.digest('base64url');
}

export type Reused = RouteResult & { readonly reused: { readonly key: string; readonly checkedAt: string }; readonly loads?: Record<string, string> };

/** A kept result only when it compared the whole route: never one cut short by the network, a bot wall or `--only`. */
export async function writeReusable(dir: string, key: string, result: RouteResult & { readonly loads?: Record<string, string> }, checkedAt: string): Promise<void> {
	if (result.infrastructure || result.blocked || result.only || result.reused) return;
	await mkdir(dir, { recursive: true });
	const path = join(dir, `${key}.json`);
	await writeFile(`${path}.tmp`, JSON.stringify({ checkedAt, result }));
	await rename(`${path}.tmp`, path);
}

export async function readReusable(dir: string, key: string): Promise<Reused | undefined> {
	try {
		const { checkedAt, result } = JSON.parse(await readFile(join(dir, `${key}.json`), 'utf8')) as { checkedAt: string; result: RouteResult & { loads?: Record<string, string> } };
		return { ...result, reused: { key, checkedAt } };
	} catch {
		return undefined;
	}
}

const CLI = join(ROOT, 'src/cli.ts');
// What the checker reads of the repository as data: the parts' selectors, and the code it keys (which is in the key already).
const CHECKER_DIRS = [
	{ dir: ROOT, by: 'src/check/probe-parts.ts', read: async () => JSON.stringify(await partSelectors(ROOT)) },
	{ dir: ROOT, by: 'src/code-closure.ts', read: async () => '' },
];

/**
 * The checker's version: the check command's branch of src/cli.ts and what it reaches there, the module graph of every
 * import it uses, and of parts/ only the selectors the widget probes read (probe-parts.ts). Unique when a load is unresolved.
 */
export async function checkerClosure(): Promise<{ readonly closure: Closure; readonly text: string }> {
	const used = await usedBy(CLI, (program) => {
		const main = program.body.find((s: N) => s.type === 'FunctionDeclaration' && s.id?.name === 'main') as N | undefined;
		if (!main) return { nodes: [program] };
		return { within: main, nodes: [...main.params, ...main.body.body.flatMap((s: N) => (s.type !== 'SwitchStatement' ? [s] : [s.discriminant, ...s.cases.filter((c: N) => c.test?.value === 'check')]))] };
	});
	const closure = await closureOf([], { edges: used.edges, dirs: CHECKER_DIRS });
	return { closure: { ...closure, unresolved: [...closure.unresolved, ...used.unresolved] }, text: used.text };
}

export async function checkerVersion(): Promise<string> {
	const { closure, text } = await checkerClosure();
	return keyOf(closure, { 'check command': text });
}

/** What decides a key besides the route itself: the checker's version, and the Markless packages the port names (undefined when it names none, so nothing is reused). */
export async function shipVersions(appDir: string): Promise<Record<string, string> | undefined> {
	let pkg: { dependencies?: Record<string, string>; devDependencies?: Record<string, string>; pnpm?: { overrides?: Record<string, string> } };
	try {
		pkg = JSON.parse(await readFile(join(appDir, 'package.json'), 'utf8'));
	} catch {
		return undefined;
	}
	const markless = Object.entries({ ...pkg.dependencies, ...pkg.devDependencies, ...pkg.pnpm?.overrides })
		.filter(([name]) => name.startsWith('@markless/'))
		.sort(([a], [b]) => (a < b ? -1 : 1))
		.map(([name, spec]) => `${name}@${spec}`)
		.join(' ');
	if (!markless) return undefined;
	return { checker: await checkerVersion(), markless };
}

export interface ReuseSelection {
	readonly check: string[];
	readonly reused: Reused[];
	/** Per route checked this run: its key and the extra inputs it was made from. */
	readonly keys: ReadonlyMap<string, string>;
	/** Routes with no key, and why. */
	readonly unkeyed: ReadonlyMap<string, string>;
}

const sha = (bytes: string | Uint8Array) => createHash('sha256').update(bytes).digest('base64url');

// Files the HTML loads itself, outside the packs the closures stand for: stylesheets, other scripts, preloads.
const REFERENCED = /<(?:link\b[^>]*\bhref|script\b[^>]*\bsrc)="([^"]+)"/g;

/** Every same-origin file the HTML names that is not a pack, by URL. */
export function referencedFiles(html: string, origin: string): string[] {
	const out = new Set<string>();
	for (const [, raw] of html.matchAll(REFERENCED)) {
		let url: URL;
		try {
			url = new URL(raw!.replace(/&amp;/g, '&'), origin);
		} catch {
			continue;
		}
		// /_vercel/ (Web Analytics, Speed Insights) is served by the platform, never by the build: off Vercel it is not there at all.
		if (url.origin !== new URL(origin).origin || /^\/build\/chunk-[\w-]+\.js$|^\/_markless\/links\/|^\/_vercel\//.test(url.pathname)) continue;
		out.add(url.href);
	}
	return [...out].sort();
}

async function fetchHash(url: string, headers: Record<string, string>): Promise<string | undefined> {
	try {
		const res = await fetch(url, { headers, redirect: 'manual' });
		return res.status === 200 ? `${res.headers.get('content-type') ?? ''} ${sha(new Uint8Array(await res.arrayBuffer()))}` : undefined;
	} catch {
		return undefined;
	}
}

// A browser GET of the port's own origin with nothing in it a check templated: it can be fetched again as it was.
const PLAIN_LOAD = /^(?:\d+x )?browser GET \{self\}(\/[^\s{}]*)$/;

/**
 * The responses a checked page fetched at load, fetched again now: undefined when any cannot be, a request that was not
 * a plain same-origin GET included, so a result with one is never reused.
 */
export async function loadHashes(network: readonly string[] | undefined, newOrigin: string, headers: Record<string, string>): Promise<Record<string, string> | undefined> {
	const out: Record<string, string> = {};
	for (const line of network ?? []) {
		if (/^(?:\d+x )?server /.test(line)) continue;
		const path = PLAIN_LOAD.exec(line)?.[1];
		if (!path) return undefined;
		const hash = await fetchHash(new URL(path, newOrigin).href, headers);
		if (!hash) return undefined;
		out[path] = hash;
	}
	return out;
}

/**
 * Each route's key from what NEW and OLD serve now: NEW's HTML and closures, every file NEW's HTML names outside the packs,
 * and OLD's HTML. A route whose key has a kept result, and whose load-time responses fetch as they did, is not checked again.
 */
export async function selectReusable(input: { readonly routes: readonly string[]; readonly newOrigin: string; readonly oldOrigin: string; readonly headers?: Record<string, string>; readonly closures: Closures | undefined; readonly versions: Readonly<Record<string, string>>; readonly dir: string }): Promise<ReuseSelection> {
	const headers = input.headers ?? {};
	const check: string[] = [];
	const reused: Reused[] = [];
	const keys = new Map<string, string>();
	const unkeyed = new Map<string, string>();
	const files = new Map<string, Promise<string | undefined>>();
	const fileHash = (url: string) => files.get(url) ?? files.set(url, fetchHash(url, headers)).get(url)!;
	const page = async (origin: string, route: string, sendHeaders: boolean) => {
		const res = await fetch(new URL(route, origin), { headers: sendHeaders ? headers : {}, redirect: 'manual' });
		return { status: res.status, type: res.headers.get('content-type') ?? '', text: await res.text() };
	};
	for (const route of input.routes) {
		const fail = (why: string) => {
			unkeyed.set(route, why);
			check.push(route);
		};
		let now: { status: number; type: string; text: string }, was: { status: number; type: string; text: string };
		try {
			[now, was] = await Promise.all([page(input.newOrigin, route, true), page(input.oldOrigin, route, false)]);
		} catch (error) {
			fail(`a side did not answer: ${(error as Error).message}`);
			continue;
		}
		if (now.status !== 200 || !/html/.test(now.type)) {
			fail(`NEW answered ${now.status} ${now.type}`.trim());
			continue;
		}
		const named = referencedFiles(now.text, input.newOrigin);
		const hashes = await Promise.all(named.map(fileHash));
		const missing = named.find((_, i) => !hashes[i]);
		if (missing) {
			fail(`${missing} did not load`);
			continue;
		}
		const extra = { old: `${was.status} ${sha(was.text)}`, files: named.map((url, i) => `${url} ${hashes[i]}`).join('\n') };
		const { key, why } = shipKey(route, now.text, input.closures, { ...input.versions, ...extra });
		if (!key) {
			fail(why!);
			continue;
		}
		keys.set(route, key);
		const kept = await readReusable(input.dir, key);
		const loads = kept ? await loadHashes(kept.network?.new, input.newOrigin, headers) : undefined;
		if (kept && kept.route === route && !kept.role && loads && kept.loads && JSON.stringify(loads) === JSON.stringify(kept.loads)) reused.push(kept);
		else check.push(route);
	}
	return { check, reused, keys, unkeyed };
}

/** Keeps every route this run checked under its key, for the next run, with the responses it fetched at load as they are now. */
export async function keepChecked(dir: string, routes: readonly RouteResult[], keys: ReadonlyMap<string, string>, checkedAt: string, input: { readonly newOrigin: string; readonly headers?: Record<string, string> }): Promise<number> {
	let kept = 0;
	for (const result of routes) {
		const key = !result.role || result.role === 'anonymous' ? keys.get(result.route) : undefined;
		if (!key || result.reused) continue;
		const loads = await loadHashes(result.network?.new, input.newOrigin, input.headers ?? {});
		if (!loads) continue;
		await writeReusable(dir, key, { ...result, loads }, checkedAt);
		kept++;
	}
	return kept;
}
