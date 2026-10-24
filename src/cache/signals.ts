import { readFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import type { SourceInventory } from '../plan/source.ts';
import { matchRoute, specificity } from '../source/index.ts';

/** A place in the source that bears on how a route may be cached. */
export interface Signal {
	readonly what: string;
	readonly file: string;
	readonly line: number;
}

/** What the source says about one route's caching. */
export interface RouteSignals {
	/** An auth guard covers the route. */
	readonly guard?: Signal;
	/** Reads of the request on the server: cookies, auth, headers. */
	readonly requestReads: readonly Signal[];
	/** Query keys the server reads; a cache must key on them. */
	readonly queryKeys: readonly string[];
	/** Per-visitor values on the server: personalisation, server-side flags. */
	readonly perVisitor: readonly Signal[];
	/** Data fetched on the server while rendering, and server clocks: content that changes between deploys. */
	readonly changing: readonly Signal[];
	/** Cookies the server sets while rendering. */
	readonly setsCookies: readonly Signal[];
}

export const NO_SIGNALS: RouteSignals = { requestReads: [], queryKeys: [], perVisitor: [], changing: [], setsCookies: [] };

interface Pattern {
	readonly re: RegExp;
	readonly what: string;
}

// Server-side reads of the request across the frameworks the source scan knows; Markless's http.request is the new side.
const REQUEST_READS: readonly Pattern[] = [
	{ re: /\bcookies\(\)/, what: 'cookies()' },
	{ re: /\bheaders\(\)/, what: 'headers()' },
	{ re: /\b(?:req|request|event\.req|event\.node\.req|ctx\.request)\.(?:cookies|headers)\b/, what: 'request cookies or headers' },
	{ re: /\bgetCookie\(|\bparseCookies\(|\bgetHeader\(|\bgetRequestHeader\(/, what: 'reads a request cookie or header' },
	{ re: /\b(?:getServerSession|getSession|auth|currentUser|getAuth|getUser)\(\s*(?:req|request|event|ctx|context)?/, what: 'reads the session' },
	{ re: /\bhttp\.request\.headers\b|\bhttp\.request\b[^;\n]*\bcookie/i, what: 'http.request headers' },
	{ re: /\bstorage\(\s*['"`]/, what: 'storage(): a cookie-backed value' },
	{ re: /\$_(?:COOKIE|SESSION|SERVER)\b|\bsession\[|\brequest\.(?:COOKIES|META|session)\b|\bcookies\[/, what: 'reads cookies or the session' },
];

const QUERY_READS: readonly RegExp[] = [/\bsearchParams\.get\(\s*['"`]([\w-]+)['"`]/g, /\bsearchParams\??\.([a-zA-Z_]\w*)/g, /\b(?:req|request)\.query\.([a-zA-Z_]\w*)/g, /\bgetQuery\([^)]*\)\.([a-zA-Z_]\w*)/g, /\$_GET\[\s*['"]([\w-]+)['"]/g, /\brequest\.GET\.get\(\s*['"]([\w-]+)['"]/g, /\bparams\[:([a-z_]\w*)\]/g];

const SETS_COOKIES: readonly Pattern[] = [
	{ re: /\bcookies\(\)\.set\(|\bsetCookie\(|\bres\.cookie\(|\bresponse\.set_cookie\(|\bsetcookie\(/, what: 'sets a cookie' },
	{ re: /['"`]set-cookie['"`]/i, what: 'writes a Set-Cookie header' },
];

const CLIENT_ONLY = /^\s*['"]use client['"]/m;

function lineOf(text: string, index: number): number {
	let line = 1;
	for (let i = 0; i < index && i < text.length; i++) if (text.charCodeAt(i) === 10) line++;
	return line;
}

function scan(text: string, file: string, patterns: readonly Pattern[]): Signal[] {
	const out: Signal[] = [];
	for (const p of patterns) {
		const m = p.re.exec(text);
		if (m) out.push({ what: p.what, file, line: lineOf(text, m.index) });
	}
	return out;
}

// URLSearchParams' own members: `searchParams.set(...)` writes a key, it does not read one named "set".
const URL_SEARCH_PARAMS_METHODS = new Set(['get', 'has', 'getAll', 'toString', 'entries', 'keys', 'values', 'forEach', 'set', 'append', 'delete', 'sort', 'size']);
function queryKeys(text: string): string[] {
	const keys = new Set<string>();
	for (const re of QUERY_READS) for (const m of text.matchAll(re)) if (!URL_SEARCH_PARAMS_METHODS.has(m[1]!)) keys.add(m[1]!);
	// A page that switches on its whole query string (`@switch (search) { @case "?page=2": ... }`) reads the keys its cases name.
	if (/\b(?:url|location)\.search\b/.test(text)) for (const m of text.matchAll(/@case\s+(["'])\?([^"']*)\1/g)) for (const key of new URLSearchParams(m[2]!).keys()) keys.add(key);
	return [...keys].sort();
}

/**
 * The text with what string literals and comments hold blanked (newlines kept, so lines still count): a generated data
 * module of copied page text that mentions `headers()` does not read the request. Template literals keep their
 * `${...}` expressions, which are code.
 */
export function codeOnly(text: string): string {
	const out = text.split('');
	const blank = (from: number, to: number) => {
		for (let k = from; k < to; k++) if (out[k] !== '\n') out[k] = ' ';
	};
	let i = 0;
	const depth: number[] = [];
	while (i < text.length) {
		const c = text[i]!;
		const next = text[i + 1];
		if (c === '/' && next === '/') {
			const end = text.indexOf('\n', i);
			const stop = end < 0 ? text.length : end;
			blank(i, stop);
			i = stop;
		} else if (c === '/' && next === '*') {
			const end = text.indexOf('*/', i + 2);
			const stop = end < 0 ? text.length : end + 2;
			blank(i, stop);
			i = stop;
		} else if (c === '"' || c === "'") {
			let j = i + 1;
			while (j < text.length && text[j] !== c && text[j] !== '\n') j += text[j] === '\\' ? 2 : 1;
			blank(i + 1, j);
			i = j + 1;
		} else if (c === '`' || (c === '}' && depth.length && depth[depth.length - 1] === 0)) {
			if (c === '}') depth.pop();
			let j = i + 1;
			while (j < text.length && text[j] !== '`' && !(text[j] === '$' && text[j + 1] === '{')) j += text[j] === '\\' ? 2 : 1;
			blank(i + 1, j);
			if (text[j] === '$') {
				depth.push(0);
				i = j + 2;
			} else i = j + 1;
		} else {
			if (depth.length && c === '{') depth[depth.length - 1]!++;
			else if (depth.length && c === '}') depth[depth.length - 1]!--;
			i++;
		}
	}
	return out.join('');
}
// A getCookie/setCookie helper over document.cookie runs in the browser; the same names on the server read and write the request.
const BROWSER_COOKIE_HELPER = /\bdocument\.cookie\b/;
const HELPER_NAMES = /^(reads a request cookie or header|sets a cookie)$/;

/** Signals in one file of server code. A client component's reads run in the browser and do not bear on caching. */
export function fileSignals(text: string, file: string): Omit<RouteSignals, 'guard' | 'perVisitor' | 'changing'> & { changing: Signal[] } {
	if (CLIENT_ONLY.test(text)) return { requestReads: [], queryKeys: [], setsCookies: [], changing: [] };
	const code = codeOnly(text);
	const browser = BROWSER_COOKIE_HELPER.test(text) ? (signals: Signal[]) => signals.filter((s) => !HELPER_NAMES.test(s.what) || !onlyHelperCalls(text, s.what)) : (signals: Signal[]) => signals;
	return { requestReads: browser(scan(code, file, REQUEST_READS)), queryKeys: queryKeys(text), setsCookies: browser([...scan(code, file, SETS_COOKIES.slice(0, 1)), ...scan(text, file, SETS_COOKIES.slice(1))]), changing: [] };
}

/** Every match of the helper's pattern is a call of getCookie/setCookie (nothing a server framework names the same way also appears). */
function onlyHelperCalls(text: string, what: string): boolean {
	if (what === 'sets a cookie') return !/\bcookies\(\)\.set\(|\bres\.cookie\(|\bresponse\.set_cookie\(|\bsetcookie\(/.test(text);
	return !/\bparseCookies\(|\bgetHeader\(|\bgetRequestHeader\(/.test(text);
}

const IMPORT = /\bimport\s+(?:[^'"]*?\sfrom\s+)?['"](\.{1,2}\/[^'"]+)['"]|\bimport\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*\)/g;
const EXTENSIONS = ['', '.ts', '.tsx', '.tsrx', '.js', '.mjs', '.jsx', '/index.ts', '/index.tsrx', '/index.js'];

async function readFirst(base: string): Promise<{ path: string; text: string } | undefined> {
	for (const ext of EXTENSIONS) {
		const path = base + ext;
		const text = await readFile(path, 'utf8').catch(() => undefined);
		if (text !== undefined) return { path, text };
	}
	return undefined;
}

/** A file and the relative modules it imports, transitively, up to `limit` files. */
export async function moduleGraph(root: string, entry: string, limit = 60): Promise<{ file: string; text: string }[]> {
	const out: { file: string; text: string }[] = [];
	const start = await readFirst(isAbsolute(entry) ? entry : join(root, entry));
	if (!start) return out;
	const queue = [start];
	const seen = new Set([start.path]);
	while (queue.length && out.length < limit) {
		const { path, text } = queue.shift()!;
		out.push({ file: path.startsWith(root) ? path.slice(root.length + 1) : path, text });
		for (const m of text.matchAll(IMPORT)) {
			const next = await readFirst(resolve(dirname(path), (m[1] ?? m[2])!.replace(/\.js$/, '')));
			if (next && !seen.has(next.path)) {
				seen.add(next.path);
				queue.push(next);
			}
		}
	}
	return out;
}

function merge(parts: readonly ReturnType<typeof fileSignals>[]): Omit<RouteSignals, 'guard' | 'perVisitor'> {
	return {
		requestReads: parts.flatMap((p) => p.requestReads),
		queryKeys: [...new Set(parts.flatMap((p) => p.queryKeys))].sort(),
		setsCookies: parts.flatMap((p) => p.setsCookies),
		changing: parts.flatMap((p) => p.changing),
	};
}

/** Signals for one page file and what it imports. */
export async function pageFileSignals(root: string, file: string): Promise<Omit<RouteSignals, 'guard' | 'perVisitor'>> {
	return merge((await moduleGraph(root, file)).map((m) => fileSignals(m.text, m.file)));
}

/** What the old source says about a concrete route: its guard, the server code of its route file, and the scan's per-file facts. */
export async function oldRouteSignals(source: SourceInventory, route: string): Promise<RouteSignals> {
	const path = route.split(/[?#]/)[0]!;
	const guard = source.authGuards.find((g) => g.routes.some((r) => matchRoute(r, path) || (r.endsWith('/**') && path.startsWith(r.slice(0, -3)))));
	const own = source.routes.filter((r) => r.kind === 'page' && matchRoute(r.path, path)).sort((a, b) => specificity(b.path) - specificity(a.path))[0];
	const files = own ? [own.file] : [];
	const code = own ? await pageFileSignals(source.path, own.file) : { requestReads: [], queryKeys: [], setsCookies: [], changing: [] };
	const inFiles = (file: string) => files.some((f) => file === f || file.endsWith(`/${f}`) || f.endsWith(`/${file}`));
	const perVisitor: Signal[] = source.nondeterminism.filter((n) => n.side !== 'client' && (n.kind === 'personalisation' || n.kind === 'flag') && inFiles(n.file)).map((n) => ({ what: `${n.kind}: ${n.what}`, file: n.file, line: n.line }));
	const changing: Signal[] = [
		...code.changing,
		...source.nondeterminism.filter((n) => n.side !== 'client' && n.kind === 'time' && inFiles(n.file)).map((n) => ({ what: `server clock: ${n.what}`, file: n.file, line: n.line })),
		...source.clients.filter((c) => inFiles(c.file)).map((c) => ({ what: `fetches data (${c.kind}${c.base ? ` ${c.base}` : ''})`, file: c.file, line: c.line })),
	];
	return {
		...(guard ? { guard: { what: `auth guard${guard.role ? ` (${guard.role})` : ''}: ${guard.how}`, file: guard.file, line: guard.line } } : {}),
		requestReads: code.requestReads,
		queryKeys: code.queryKeys,
		perVisitor,
		changing,
		setsCookies: code.setsCookies,
	};
}
