import { tagHeaders, type SideEnv } from './browser.ts';
import { captureHttp, mime } from './capture.ts';
import { httpFailures, withFailures } from './compare.ts';
import { diffFields, diffLines, fieldTemplates, lineTemplates } from './noise.ts';
import type { Dimension, Failure, HttpCapture, RouteResult } from './types.ts';
import { bodyText, request } from './http.ts';

export type EndpointKind = 'robots' | 'sitemap' | 'feed' | 'json' | 'xml' | 'text';

export interface EndpointCapture {
	readonly http: HttpCapture;
	readonly kind: EndpointKind;
	readonly body: string;
}

const LIMIT = 20;

/** Non-page files many sites serve at fixed paths; each is checked when the OLD app answers it with something other than HTML. */
export const WELL_KNOWN = [
	'/robots.txt',
	'/sitemap.xml',
	'/sitemap_index.xml',
	'/manifest.json',
	'/manifest.webmanifest',
	'/site.webmanifest',
	'/feed.xml',
	'/rss.xml',
	'/atom.xml',
	'/feed',
	'/rss',
	'/index.xml',
	'/humans.txt',
	'/ads.txt',
	'/.well-known/security.txt',
	'/.well-known/assetlinks.json',
	'/.well-known/apple-app-site-association',
	'/.well-known/change-password',
];

export const isPage = (contentType: string) => contentType === '' || contentType === 'text/html' || contentType === 'application/xhtml+xml';

export function endpointKind(path: string, contentType: string, body: string): EndpointKind {
	if (/\/robots\.txt$/.test(path)) return 'robots';
	if (/json/.test(contentType) || /\.(json|webmanifest)$/.test(path) || /^\s*[[{]/.test(body)) {
		try {
			JSON.parse(body);
			return 'json';
		} catch {}
	}
	if (/<(urlset|sitemapindex)[\s>]/.test(body)) return 'sitemap';
	if (/<(rss|feed|rdf:RDF)[\s>]/.test(body)) return 'feed';
	if (/xml/.test(contentType) || /^\s*<\?xml/.test(body)) return 'xml';
	return 'text';
}

export async function captureEndpoint(env: SideEnv, path: string): Promise<EndpointCapture> {
	const http = await captureHttp(env.origin, path, tagHeaders(env));
	const url = new URL(http.chain.at(-1)!.url, env.origin);
	const response = await request(url, { headers: tagHeaders(env) });
	const raw = await bodyText(response, url);
	const host = new URL(env.origin).host;
	const body = raw.split(env.origin).join('{origin}').split(host).join('{host}');
	return { http, kind: endpointKind(path, mime(response.headers.get('content-type')), body), body };
}

interface XmlNode {
	readonly name: string;
	readonly attrs: Readonly<Record<string, string>>;
	readonly children: XmlNode[];
	text: string;
}

const decode = (value: string) =>
	value.replace(/&(#x?[\da-f]+|amp|lt|gt|quot|apos);/gi, (_, e: string) => {
		const named: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
		if (named[e.toLowerCase()]) return named[e.toLowerCase()]!;
		return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? Number.parseInt(e.slice(2), 16) : Number(e.slice(1)));
	});

/** A forgiving XML reader: elements, attributes, text and CDATA; enough for sitemaps and feeds. */
export function parseXml(text: string): XmlNode {
	const root: XmlNode = { name: '#document', attrs: {}, children: [], text: '' };
	const stack = [root];
	const token = /<!\[CDATA\[([\s\S]*?)\]\]>|<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!DOCTYPE[^>]*>|<\/\s*([^\s>]+)\s*>|<([^\s/>]+)((?:\s+[^\s=/>]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*(\/?)>|([^<]+)/gi;
	for (const m of text.matchAll(token)) {
		const top = stack.at(-1)!;
		if (m[1] !== undefined) top.text += m[1];
		else if (m[2]) {
			const at = stack.map((n) => n.name).lastIndexOf(m[2]);
			if (at > 0) stack.length = at;
		} else if (m[3]) {
			const attrs: Record<string, string> = {};
			for (const a of (m[4] ?? '').matchAll(/([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) attrs[a[1]!] = decode(a[2] ?? a[3] ?? a[4] ?? '');
			const node: XmlNode = { name: m[3], attrs, children: [], text: '' };
			top.children.push(node);
			if (!m[5]) stack.push(node);
		} else if (m[6]) top.text += decode(m[6]);
	}
	return root;
}

const clean = (value: string) => value.replace(/\s+/g, ' ').trim();
const local = (name: string) => name.replace(/^.*:/, '');

function flattenXml(node: XmlNode, prefix: string, out: Record<string, string>): Record<string, string> {
	for (const [k, v] of Object.entries(node.attrs)) if (!k.startsWith('xmlns')) out[`${prefix}@${k}`] = v;
	if (clean(node.text)) out[prefix || '.'] = clean(node.text);
	const counts = new Map<string, number>();
	for (const child of node.children) {
		const n = counts.get(child.name) ?? 0;
		counts.set(child.name, n + 1);
		flattenXml(child, `${prefix ? `${prefix}>` : ''}${child.name}${n ? `[${n + 1}]` : ''}`, out);
	}
	return out;
}

function find(node: XmlNode, name: string): XmlNode | undefined {
	if (local(node.name) === name) return node;
	for (const child of node.children) {
		const hit = find(child, name);
		if (hit) return hit;
	}
	return undefined;
}

export function flattenJson(value: unknown, prefix = '', out: Record<string, string> = {}): Record<string, string> {
	if (value !== null && typeof value === 'object') {
		const entries = Object.entries(value);
		if (!entries.length) out[prefix || '.'] = Array.isArray(value) ? '[]' : '{}';
		for (const [k, v] of entries) flattenJson(v, Array.isArray(value) ? `${prefix}[${k}]` : prefix ? `${prefix}.${k}` : k, out);
	} else out[prefix || '.'] = JSON.stringify(value);
	return out;
}

const ID_FIELDS = ['id', '_id', 'uuid', 'slug', 'key', 'href', 'url', 'src', 'path', 'guid', 'title', 'name'];

type Scalar = string | number;
const isItem = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);

/** The field that names each item of an array: present on every item, a string or number, different on each. */
export function identityField(items: readonly unknown[], prefer?: string): string | undefined {
	if (!items.length || !items.every(isItem)) return undefined;
	const ok = (f: string) => {
		const values = items.map((i) => (i as Record<string, unknown>)[f]);
		return values.every((v) => typeof v === 'string' || typeof v === 'number') && new Set(values as Scalar[]).size === values.length;
	};
	return prefer && ok(prefer) ? prefer : ID_FIELDS.find(ok);
}

/** Pairs each item of `next` with one of `ref` by longest common subsequence, then by position within each gap; unpaired ones get no partner. */
export function alignByLcs(ref: readonly unknown[], next: readonly unknown[]): (number | undefined)[] {
	const a = ref.map((v) => JSON.stringify(v));
	const b = next.map((v) => JSON.stringify(v));
	const table = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
	for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) table[i]![j] = a[i] === b[j] ? table[i + 1]![j + 1]! + 1 : Math.max(table[i + 1]![j]!, table[i]![j + 1]!);
	const out: (number | undefined)[] = new Array(b.length).fill(undefined);
	const gapsA: number[] = [];
	const gapsB: number[] = [];
	const flush = () => {
		// Within a gap, as many items as both sides have are the same items changed; the rest were added or removed.
		const n = Math.min(gapsA.length, gapsB.length);
		for (let k = 0; k < n; k++) out[gapsB[k]!] = gapsA[k];
		gapsA.length = 0;
		gapsB.length = 0;
	};
	let i = 0;
	let j = 0;
	while (i < a.length || j < b.length) {
		if (i < a.length && j < b.length && a[i] === b[j]) {
			flush();
			out[j++] = i++;
		} else if (j >= b.length || (i < a.length && table[i + 1]![j]! >= table[i]![j + 1]!)) gapsA.push(i++);
		else gapsB.push(j++);
	}
	flush();
	return out;
}

/** An array whose items are keyed by identity (`slug=two`) or by the index of the matching item in the reference (`#1`). */
class Keyed {
	readonly entries: readonly (readonly [string, unknown])[];
	constructor(entries: readonly (readonly [string, unknown])[]) {
		this.entries = entries;
	}
}

/** Rewrites arrays so that the same item has the same key in every document, aligned to `ref` (the first OLD load). */
export function keyJson(value: unknown, ref?: unknown): unknown {
	if (Array.isArray(value)) {
		const refItems = Array.isArray(ref) ? ref : undefined;
		const field = identityField(value, refItems ? identityField(refItems) : undefined);
		if (field && (!refItems || identityField(refItems) === field || !refItems.length)) {
			const byId = new Map((refItems ?? []).filter(isItem).map((r) => [String(r[field]), r]));
			return new Keyed(value.map((item) => {
				const id = String((item as Record<string, unknown>)[field]);
				return [`${field}=${id}`, keyJson(item, byId.get(id))] as const;
			}));
		}
		if (!refItems) return new Keyed(value.map((item, i) => [`#${i}`, keyJson(item)] as const));
		const pairs = alignByLcs(refItems, value);
		let extra = 0;
		return new Keyed(value.map((item, j) => (pairs[j] === undefined ? ([`+${extra++}`, keyJson(item)] as const) : ([`#${pairs[j]}`, keyJson(item, refItems[pairs[j]!])] as const))));
	}
	if (isItem(value)) return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, keyJson(v, isItem(ref) ? ref[k] : undefined)]));
	return value;
}

/** Fields of a keyed document by path, and each array item's path with a short label. */
export function flattenKeyed(value: unknown, prefix = '', out: { fields: Record<string, string>; items: Map<string, string> } = { fields: {}, items: new Map() }) {
	if (value instanceof Keyed) {
		if (!value.entries.length) out.fields[prefix || '.'] = '[]';
		for (const [key, item] of value.entries) {
			const path = `${prefix}[${key}]`;
			out.items.set(path, JSON.stringify(item instanceof Keyed ? '[...]' : item, (_, v) => (v instanceof Keyed ? '[...]' : v)));
			flattenKeyed(item, path, out);
		}
	} else if (value !== null && typeof value === 'object') {
		const entries = Object.entries(value);
		if (!entries.length) out.fields[prefix || '.'] = '{}';
		for (const [k, v] of entries) flattenKeyed(v, prefix ? `${prefix}.${k}` : k, out);
	} else out.fields[prefix || '.'] = JSON.stringify(value);
	return out;
}

// When the file was generated (RSS lastBuildDate, Atom's feed-level updated): any rebuild moves it, so both sides need a date there, not the same one.
const BUILD_DATES = new Set(['lastBuildDate', 'updated']);
const isDate = (value: unknown) => typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Date.parse(value));

interface Feed {
	readonly fields: Record<string, string>;
	readonly items: Map<string, { readonly label: string; readonly fields: Record<string, string> }>;
}

function readFeed(body: string): Feed {
	const doc = parseXml(body);
	const channel = find(doc, 'channel') ?? find(doc, 'feed') ?? doc;
	const fields: Record<string, string> = {};
	const items = new Map<string, { label: string; fields: Record<string, string> }>();
	for (const child of channel.children) {
		if (local(child.name) === 'item' || local(child.name) === 'entry') continue;
		flattenXml(child, child.name, fields);
	}
	const entries = [...channel.children, ...doc.children.flatMap((c) => c.children)].filter((c) => local(c.name) === 'item' || local(c.name) === 'entry');
	for (const entry of new Set(entries)) {
		const flat = flattenXml(entry, '', {});
		const title = flat.title ?? '';
		const key = flat.guid ?? flat.id ?? flat['link@href'] ?? flat.link ?? title;
		let unique = key;
		for (let i = 2; items.has(unique); i++) unique = `${key}#${i}`;
		items.set(unique, { label: title ? `"${title}"${key !== title ? ` (${key})` : ''}` : key, fields: flat });
	}
	return { fields, items };
}

const sitemapLines = (body: string) =>
	[...body.matchAll(/<(url|sitemap)>([\s\S]*?)<\/\1>/g)]
		.map((m) => {
			const flat = flattenXml(parseXml(m[2]!), '', {});
			return Object.entries(flat).sort(([a], [b]) => (a === 'loc' ? -1 : b === 'loc' ? 1 : a.localeCompare(b))).map(([k, v]) => `${k}: ${v}`).join(', ');
		})
		.sort();

const textLines = (body: string) => body.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

const HINTS = {
	robots: 'Serve the same robots.txt: crawlers read these rules (and the Sitemap line) to decide what to index.',
	sitemap: 'List the same URLs in the sitemap; search engines use it to find and recrawl pages.',
	feedItem: 'The feed must carry the same items: feed readers and aggregators subscribed to it would lose or duplicate entries.',
	feed: 'Keep the feed fields the same; readers show them and use guid/id to tell entries apart.',
	json: 'Return the same fields with the same names and values: other code (apps, integrations, scripts) reads this endpoint.',
	jsonItem: 'Return the same items: clients that list this endpoint would lose or gain an entry.',
	xml: 'Return the same XML document.',
	text: 'Return the same text.',
	status: 'Serve this file at the same URL with the same status code.',
	contentType: 'Serve the file with the same Content-Type, or clients that check it (feed readers, crawlers, browsers for the manifest) reject it.',
	kind: 'The old URL returned a different kind of document; serve the same format.',
} as const;

function dimensionOf(kind: EndpointKind): Dimension {
	return kind === 'robots' || kind === 'sitemap' ? 'seo' : 'data';
}

// Arrays of objects are compared per index; a renamed field shows up once per entry, so the report groups them by field.
function grouped(route: string, dimension: Dimension, label: string, diffs: readonly { key: string; expected: string | undefined; actual: string | undefined }[], hint: string): Failure[] {
	const groups = new Map<string, { expected: string[]; actual: string[] }>();
	for (const d of diffs) {
		const key = d.key.replace(/\[[^\]]*\]/g, '[]');
		const side = d.expected === undefined ? 'extra' : d.actual === undefined ? 'missing' : 'changed';
		const g = groups.get(`${side} ${key}`) ?? { expected: [], actual: [] };
		g.expected.push(d.expected ?? '(absent)');
		g.actual.push(d.actual ?? '(absent)');
		groups.set(`${side} ${key}`, g);
	}
	const summary = (values: string[]) => `${values[0]}${values.length > 1 ? ` (and ${values.length - 1} more entr${values.length === 2 ? 'y' : 'ies'})` : ''}`;
	return [...groups].slice(0, LIMIT).map(([k, g]) => {
		const [side, key] = [k.slice(0, k.indexOf(' ')), k.slice(k.indexOf(' ') + 1)];
		return { route, dimension, check: `${label} ${key}${side === 'missing' ? ' missing' : side === 'extra' ? ' not in the old response' : ''}`, expected: summary(g.expected), actual: summary(g.actual), hint };
	});
}

/** Compares a non-page endpoint as data: OLD loads form the noise baseline, as for pages. */
export function compareEndpoint(route: string, olds: readonly EndpointCapture[], next: EndpointCapture): Failure[] {
	const [a, ...rest] = olds as [EndpointCapture, ...EndpointCapture[]];
	const others = rest.length ? rest : [a];
	const failures: Failure[] = [];
	const status = (c: EndpointCapture) => `${c.http.chain.at(-1)!.status} ${c.http.chain.at(-1)!.url}`;
	if (others.every((o) => status(o) === status(a)) && status(a) !== status(next)) failures.push({ route, dimension: 'http', check: 'status', expected: status(a), actual: status(next), hint: HINTS.status });
	if (others.every((o) => o.http.contentType === a.http.contentType) && a.http.contentType !== next.http.contentType) failures.push({ route, dimension: 'http', check: 'content-type', expected: a.http.contentType, actual: next.http.contentType, hint: HINTS.contentType });
	// A role the endpoint sends to a page (a signed-in visitor redirected to the dashboard): the page has its own check.
	if (next.http.status >= 400 || (isPage(a.http.contentType) && isPage(next.http.contentType))) return failures;
	const dimension = dimensionOf(a.kind);
	if (a.kind !== next.kind) {
		failures.push({ route, dimension, check: 'format', expected: a.kind, actual: next.kind, hint: HINTS.kind });
		return failures;
	}
	const lines = (read: (body: string) => string[], check: string, hint: string) => {
		const diff = diffLines(lineTemplates(read(a.body), ...others.map((o) => read(o.body))), read(next.body));
		for (const c of diff.changed) failures.push({ route, dimension, check, expected: c.expected, actual: c.actual, hint });
		for (const line of diff.missing) failures.push({ route, dimension, check, expected: line, actual: '(absent)', hint });
		for (const line of diff.unexpected) failures.push({ route, dimension, check, expected: '(absent)', actual: line, hint });
	};
	switch (a.kind) {
		case 'robots':
			lines(textLines, 'robots.txt line', HINTS.robots);
			break;
		case 'sitemap':
			lines(sitemapLines, 'sitemap entry', HINTS.sitemap);
			break;
		case 'text':
			lines(textLines, 'line', HINTS.text);
			break;
		case 'json': {
			const ref = JSON.parse(a.body) as unknown;
			const read = (c: EndpointCapture) => flattenKeyed(keyJson(JSON.parse(c.body), ref));
			const [fa, fn, fo] = [read(a), read(next), others.map(read)];
			const gone = [...fa.items.keys()].filter((path) => !fn.items.has(path) && fo.every((o) => o.items.has(path)));
			const added = [...fn.items.keys()].filter((path) => !fa.items.has(path) && fo.every((o) => !o.items.has(path)));
			const outer = (paths: string[]) => paths.filter((p) => !paths.some((q) => q !== p && p.startsWith(q)));
			const [missing, extra] = [outer(gone), outer(added)];
			const under = (key: string) => [...missing, ...extra].some((p) => key === p || key.startsWith(`${p}.`) || key.startsWith(`${p}[`));
			for (const path of missing) failures.push({ route, dimension, check: `JSON item ${path} missing`, expected: fa.items.get(path)!, actual: '(absent)', hint: HINTS.jsonItem });
			for (const path of extra) failures.push({ route, dimension, check: `JSON item ${path} not in the old response`, expected: '(absent)', actual: fn.items.get(path)!, hint: HINTS.jsonItem });
			const diffs = diffFields(fieldTemplates(fa.fields, ...fo.map((o) => o.fields)), fn.fields).filter((d) => !under(d.key));
			failures.push(...grouped(route, dimension, 'JSON field', diffs, HINTS.json));
			break;
		}
		case 'xml': {
			const read = (c: EndpointCapture) => flattenXml(parseXml(c.body), '', {});
			failures.push(...grouped(route, dimension, 'XML', diffFields(fieldTemplates(read(a), ...others.map(read)), read(next)), HINTS.xml));
			break;
		}
		case 'feed': {
			const [fa, fn] = [readFeed(a.body), readFeed(next.body)];
			const fo = others.map((o) => readFeed(o.body));
			const feedDiffs = diffFields(fieldTemplates(fa.fields, ...fo.map((f) => f.fields)), fn.fields).filter((d) => !(BUILD_DATES.has(d.key) && isDate(d.expected) && isDate(d.actual)));
			failures.push(...grouped(route, dimension, 'feed field', feedDiffs, HINTS.feed));
			for (const [key, item] of fa.items) {
				if (fo.some((f) => !f.items.has(key))) continue;
				const now = fn.items.get(key);
				if (!now) {
					failures.push({ route, dimension, check: 'feed item missing', expected: item.label, actual: '(absent)', hint: HINTS.feedItem });
					continue;
				}
				const diffs = diffFields(fieldTemplates(item.fields, ...fo.map((f) => f.items.get(key)!.fields)), now.fields);
				failures.push(...grouped(route, dimension, `feed item ${item.label}`, diffs, HINTS.feed));
			}
			for (const [key, item] of fn.items) if (!fa.items.has(key) && fo.every((f) => !f.items.has(key))) failures.push({ route, dimension, check: 'feed item not in the old feed', expected: '(absent)', actual: item.label, hint: HINTS.feedItem });
			break;
		}
	}
	return failures.slice(0, LIMIT * 2);
}

export async function checkEndpoint(envs: { readonly old: SideEnv; readonly new: SideEnv }, route: string): Promise<RouteResult & { readonly endpoint: EndpointKind }> {
	const oldA = await captureEndpoint(envs.old, route);
	const [oldB, next] = await Promise.all([captureEndpoint(envs.old, route), captureEndpoint(envs.new, route)]);
	const olds = [oldA, oldB];
	if (oldA.body !== oldB.body) olds.push(await captureEndpoint(envs.old, route));
	const failures = compareEndpoint(route, olds, next);
	const zero = { downloaded: 0, source: 0, executed: 0 };
	return { ...withFailures({ route, ok: true, dimensions: {} as RouteResult['dimensions'], failures: [], weight: { old: zero, new: zero }, visualDiffs: [], shots: [] }, failures), endpoint: oldA.kind };
}

/** Where a browser load of a route on the old app ends, read only when its answer alone cannot say. */
export type Landing = (route: string) => Promise<string | undefined>;

/** The old app answered the route itself and the new one redirects: where the old page moves in the browser decides. */
export const answeredThenRedirected = (old: HttpCapture, next: HttpCapture): boolean => old.chain.length === 1 && old.status >= 200 && old.status < 300 && next.chain.length > 1;

/** A path the old app redirects (a config redirect, the other trailing-slash form): only where it sends a visitor is compared. */
export async function checkRedirect(envs: { readonly old: SideEnv; readonly new: SideEnv }, route: string, land?: Landing): Promise<RouteResult & { readonly endpoint: 'redirect' }> {
	const [a, b, next] = await Promise.all([captureHttp(envs.old.origin, route, tagHeaders(envs.old)), captureHttp(envs.old.origin, route, tagHeaders(envs.old)), captureHttp(envs.new.origin, route, tagHeaders(envs.new))]);
	const zero = { downloaded: 0, source: 0, executed: 0 };
	const landed = land && answeredThenRedirected(a, next) ? await land(route) : undefined;
	return { ...withFailures({ route, ok: true, dimensions: {} as RouteResult['dimensions'], failures: [], weight: { old: zero, new: zero }, visualDiffs: [], shots: [] }, httpFailures(route, [a, b], next, landed ? { olds: [landed] } : undefined)), endpoint: 'redirect' };
}

/** A path no app serves, so the not-found page and its status are checked too. */
export const UNKNOWN_PATH = '/markless-migrate-no-such-page';

/** Paths check --all adds for redirects: the config's own (static ones), and the other trailing-slash form of every page. */
export function redirectTargets(pages: readonly string[], declared: readonly { readonly from: string }[] = []): string[] {
	const known = new Set(pages);
	const out = new Set<string>();
	for (const r of declared) if (!/[:*(]/.test(r.from) && !known.has(r.from)) out.add(r.from);
	for (const page of pages) {
		if (page === '/' || page.includes('?') || page === UNKNOWN_PATH || /\.[a-z0-9]+$/i.test(page)) continue;
		const other = page.endsWith('/') ? page.replace(/\/+$/, '') : `${page}/`;
		if (!known.has(other)) out.add(other);
	}
	return [...out].sort();
}

/** Same-origin links a page head declares for feeds and the manifest. */
export function declaredEndpoints(html: string): string[] {
	const out: string[] = [];
	for (const m of html.matchAll(/<link\b[^>]*>/gi)) {
		const tag = m[0];
		const rel = /\brel\s*=\s*["']?([^"'>\s]+)/i.exec(tag)?.[1]?.toLowerCase() ?? '';
		const type = /\btype\s*=\s*["']?([^"'>\s]+)/i.exec(tag)?.[1]?.toLowerCase() ?? '';
		const href = /\bhref\s*=\s*["']?([^"'>\s]+)/i.exec(tag)?.[1];
		if (!href) continue;
		if (rel === 'manifest' || (rel === 'alternate' && /rss|atom|feed|json/.test(type))) out.push(decode(href));
	}
	return out;
}

/** Non-page endpoints the OLD app serves: well-known paths, its robots.txt sitemaps, feed and manifest links on its pages, and source endpoints. */
export async function discoverEndpoints(env: SideEnv, pages: readonly string[], fromSource: readonly string[] = []): Promise<string[]> {
	const origin = new URL(env.origin);
	const candidates = new Set<string>([...WELL_KNOWN, ...fromSource]);
	const add = (href: string) => {
		try {
			const url = new URL(href, env.origin);
			if (url.origin === origin.origin) candidates.add(url.pathname + url.search);
		} catch {}
	};
	const robots = await request(new URL('/robots.txt', env.origin), { headers: tagHeaders(env) }).then((r) => (r.ok ? r.text() : '')).catch(() => '');
	for (const m of robots.matchAll(/^\s*sitemap:\s*(\S+)/gim)) add(new URL(m[1]!, env.origin).pathname);
	for (const page of pages.slice(0, 20)) {
		const html = await request(new URL(page, env.origin), { headers: tagHeaders(env) }).then((r) => r.text()).catch(() => '');
		for (const href of declaredEndpoints(html)) add(href);
	}
	const found: string[] = [];
	for (const path of candidates) {
		const http = await captureHttp(env.origin, path, tagHeaders(env)).catch(() => undefined);
		if (http && http.status < 400 && !isPage(http.contentType)) found.push(path);
	}
	return found.sort();
}
