import { parse, visit } from 'graphql';
import { HINTS } from './hints.ts';
import { at, type ClientFact } from './source-facts.ts';
import type { Failure } from './types.ts';

export type Side = 'browser' | 'server';

/** One request a page load made, in the browser or while the server rendered it. */
export interface NetworkRecord {
	readonly side: Side;
	readonly method: string;
	readonly url: string;
	readonly requestType?: string;
	readonly requestBody?: string;
	readonly status: number;
	readonly contentType: string;
	/** Response body when it is text (JSON, HTML, plain), cut at 256 kB. */
	readonly body?: string;
	/** Served from the recording rather than the network. */
	readonly replayed?: boolean;
	/** The URL of the recorded request that answered it, which may be on another host. */
	readonly recordedUrl?: string;
	/** A write that was intercepted and never sent. */
	readonly intercepted?: boolean;
}

export interface NetworkCapture {
	readonly records: readonly NetworkRecord[];
	/** Whether the server ran with the request recorder, so its requests are known. */
	readonly server: boolean;
	/** The page's text and attribute values after load, to tell which response fields it shows. */
	readonly shown: string;
}

export const MAX_BODY = 256 * 1024;
const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);
const CACHE_BUSTERS = new Set(['_', '_t', 't', 'ts', 'cb', 'cachebust', 'cache_bust', 'cachebuster', 'nocache', 'nonce', 'timestamp', 'rnd', 'rand', 'random', '_rsc']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function sameApp(url: URL, origin: string): boolean {
	const o = new URL(origin);
	return url.origin === o.origin || (LOOPBACK.has(url.hostname) && LOOPBACK.has(o.hostname) && url.port === o.port);
}

function idLike(value: string): string | undefined {
	if (UUID.test(value)) return '{uuid}';
	if (/^\d{10}(\d{3})?$/.test(value)) return '{time}';
	if (/^[0-9a-f]{16,}$/i.test(value) || (value.length >= 20 && /\d/.test(value) && /^[\w-]+$/.test(value) && !/^[a-z-]+$/i.test(value))) return '{hash}';
	return undefined;
}

// Hosts one service answers from interchangeably, its client choosing whichever answers first: Iconify's API and its documented fallbacks.
const MIRRORS: Readonly<Record<string, string>> = { 'api.simplesvg.com': 'api.iconify.design', 'api.unisvg.com': 'api.iconify.design' };
export const serviceHost = (host: string) => MIRRORS[host] ?? host;

/** Host, path and query with ids, timestamps and cache-busters replaced, and the app's own origin as {self}. */
export function normalizeUrl(raw: string, origin: string): string {
	const url = new URL(raw);
	const host = sameApp(url, origin) ? '{self}' : serviceHost(url.host);
	const path = url.pathname
		.split('/')
		.map((segment) => (/^\d+$/.test(segment) ? '{id}' : (idLike(segment) ?? segment)))
		.join('/');
	const query = [...url.searchParams]
		.map(([key, value]) => [key, CACHE_BUSTERS.has(key.toLowerCase()) ? '{bust}' : (idLike(value) ?? value)] as const)
		.sort(([a, x], [b, y]) => (a === b ? x.localeCompare(y) : a.localeCompare(b)))
		.map(([key, value]) => `${key}=${value}`);
	return `${host}${path}${query.length ? `?${query.join('&')}` : ''}`;
}

const kind = (value: string) => (/^-?\d+(\.\d+)?$/.test(value) ? 'number' : value === '' ? 'empty' : 'string');

function jsonShape(value: unknown): unknown {
	if (Array.isArray(value)) return [value.length ? jsonShape(value[0]) : 'empty'];
	if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, jsonShape(v)]));
	return typeof value;
}

// Apollo Client adds __typename to every selection set below the root (addTypename); a port's own client does not.
function graphqlText(query: string): string {
	const cuts: [number, number][] = [];
	try {
		visit(parse(query), {
			FragmentDefinition(fragment) {
				visit(fragment.selectionSet, {
					Field(field) {
						if (field.name.value === '__typename' && !field.alias && field.loc) cuts.push([field.loc.start, field.loc.end]);
					},
				});
				return false;
			},
			OperationDefinition(op) {
				for (const top of op.selectionSet.selections) {
					if (!('selectionSet' in top) || !top.selectionSet) continue;
					visit(top.selectionSet, {
						Field(field) {
							if (field.name.value === '__typename' && !field.alias && field.loc) cuts.push([field.loc.start, field.loc.end]);
						},
					});
				}
			},
		});
	} catch {
		cuts.length = 0;
	}
	let text = query;
	for (const [start, end] of cuts.sort((x, y) => y[0] - x[0])) text = text.slice(0, start) + text.slice(end);
	return text.replace(/\s+/g, ' ').trim();
}

/** The body's field names and value types; a GraphQL query is kept as its text, whitespace collapsed and Apollo's __typename left out. */
export function bodyShape(body: string | null | undefined, contentType: string): string {
	if (!body) return '';
	if (contentType.includes('application/x-www-form-urlencoded')) {
		return ` {${[...new URLSearchParams(body)].map(([k, v]) => `${k}: ${kind(v)}`).sort().join(', ')}}`;
	}
	if (contentType.includes('multipart/form-data')) return ` {${[...body.matchAll(/name="([^"]+)"/g)].map((m) => m[1]).sort().join(', ')}}`;
	try {
		const parsed = JSON.parse(body) as unknown;
		if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && typeof (parsed as { query?: unknown }).query === 'string') {
			const { query, ...rest } = parsed as { query: string };
			return ` ${JSON.stringify({ query: graphqlText(query), ...(jsonShape(rest) as object) })}`;
		}
		return ` ${JSON.stringify(jsonShape(parsed))}`;
	} catch {
		return ` (${body.length} bytes)`;
	}
}

/** The contract line of a request: side, method, normalised URL and body shape. */
export function contractKey(record: NetworkRecord, origin: string): string {
	return `${record.side} ${record.method} ${normalizeUrl(record.recordedUrl ?? record.url, origin)}${bodyShape(record.requestBody, record.requestType ?? '')}`;
}

/** Leaf paths of a JSON body with their text values, arrays as []. */
export function leaves(value: unknown, prefix = ''): [string, string][] {
	if (Array.isArray(value)) return value.flatMap((item) => leaves(item, `${prefix}[]`));
	if (value && typeof value === 'object') return Object.entries(value).flatMap(([k, v]) => leaves(v, prefix ? `${prefix}.${k}` : k));
	if (typeof value === 'string' || typeof value === 'number') return [[prefix || '(value)', String(value)]];
	return [];
}

/** Response fields whose values the page shows, in text or attributes. Short values and plain numbers are too likely to match by chance. */
export function usedFields(record: NetworkRecord, shown: string): Set<string> {
	const used = new Set<string>();
	if (!record.body || !/json/.test(record.contentType)) return used;
	let parsed: unknown;
	try {
		parsed = JSON.parse(record.body);
	} catch {
		return used;
	}
	const haystack = shown.replace(/\s+/g, ' ');
	for (const [path, value] of leaves(parsed)) {
		const needle = value.replace(/\s+/g, ' ').trim();
		if (needle.length < 4 || /^-?\d+(\.\d+)?$/.test(needle)) continue;
		if (haystack.includes(needle)) used.add(path);
	}
	return used;
}

interface Contract {
	readonly counts: Map<string, number>;
	readonly fields: Map<string, Set<string>>;
	readonly hosts: Map<string, string>;
}

function contract(capture: NetworkCapture, origin: string, sides: ReadonlySet<Side>): Contract {
	const counts = new Map<string, number>();
	const fields = new Map<string, Set<string>>();
	const hosts = new Map<string, string>();
	for (const record of capture.records) {
		if (!sides.has(record.side)) continue;
		const key = contractKey(record, origin);
		counts.set(key, (counts.get(key) ?? 0) + 1);
		const set = fields.get(key) ?? new Set<string>();
		for (const f of usedFields(record, capture.shown)) set.add(f);
		fields.set(key, set);
		const url = new URL(record.recordedUrl ?? record.url);
		hosts.set(key, `${record.side} ${record.method} ${sameApp(url, origin) ? '' : serviceHost(url.host)}`);
	}
	return { counts, fields, hosts };
}

/** Contract lines of one capture, for the report: `2x browser GET host/path`. */
export function contractLines(capture: NetworkCapture, origin: string): string[] {
	const { counts } = contract(capture, origin, new Set<Side>(['browser', 'server']));
	return [...counts].map(([key, n]) => `${n > 1 ? `${n}x ` : ''}${key}`).sort();
}

const pathOf = (key: string) => key.split(' ')[2]!.split('?')[0]!;

function clientHint(key: string, clients: readonly ClientFact[]): string {
	const path = pathOf(key).replace(/^[^/]*/, '');
	const sites = clients.filter((c) => c.queries?.some((q) => path && (q.includes(path) || path.includes(q.split('?')[0]!.replace(/^https?:\/\/[^/]+/, '') || '\u0000'))));
	return sites.length ? ` Old source sends it from ${sites.slice(0, 3).map((c) => `${at(c)} (${c.kind})`).join(', ')}.` : '';
}

export function compareNetwork(route: string, olds: readonly (NetworkCapture | undefined)[], next: NetworkCapture | undefined, oldOrigin: string, newOrigin: string, clients: readonly ClientFact[] = []): Failure[] {
	if (!next || olds.some((o) => !o)) return [];
	const oldCaptures = olds as NetworkCapture[];
	const failures: Failure[] = [];
	const sides = new Set<Side>(['browser']);
	if (oldCaptures.every((o) => o.server) && next.server) sides.add('server');
	else if (oldCaptures.every((o) => o.server) && oldCaptures.some((o) => o.records.some((r) => r.side === 'server'))) {
		failures.push({ route, dimension: 'network', check: 'server-side requests', expected: 'recorded (the old server runs with the request recorder)', actual: 'not recorded: the new server does not run with the request recorder', hint: HINTS.networkRecorder });
	}
	const contracts = oldCaptures.map((o) => contract(o, oldOrigin, sides));
	const actual = contract(next, newOrigin, sides);
	const keys = new Set(contracts.flatMap((c) => [...c.counts.keys()]));
	const missing: { key: string; expected: number; got: number }[] = [];
	const unexpected: { key: string; got: number }[] = [];
	for (const key of keys) {
		const counts = contracts.map((c) => c.counts.get(key) ?? 0);
		const min = Math.min(...counts);
		const max = Math.max(...counts);
		const got = actual.counts.get(key) ?? 0;
		if (got === 0 && min > 0) missing.push({ key, expected: min, got });
		else if (got > 0 && (got < min || got > max)) {
			failures.push({ route, dimension: 'network', check: `${key.split(' ')[0]} request ${key.split(' ').slice(1, 3).join(' ')}`, expected: `${min === max ? min : `${min} to ${max}`} time${max === 1 ? '' : 's'}: ${key}`, actual: `${got} time${got === 1 ? '' : 's'}`, hint: HINTS.networkCount + clientHint(key, clients) });
		}
		if (got > 0) {
			const always = contracts.map((c) => c.fields.get(key) ?? new Set<string>()).reduce((a, b) => new Set([...a].filter((f) => b.has(f))));
			const shown = actual.fields.get(key) ?? new Set<string>();
			const lost = [...always].filter((f) => !shown.has(f)).sort();
			if (lost.length) {
				failures.push({ route, dimension: 'network', check: `response fields the page shows from ${key}`, expected: [...always].sort().join(', '), actual: `${[...shown].sort().join(', ') || '(none)'}; no longer shown: ${lost.join(', ')}`, hint: HINTS.networkFields + clientHint(key, clients) });
			}
		}
	}
	for (const [key, got] of actual.counts) if (!keys.has(key)) unexpected.push({ key, got });
	const oldHosts = new Map(contracts.flatMap((c) => [...c.hosts]));
	for (const m of missing) {
		const at = unexpected.findIndex((u) => actual.hosts.get(u.key) === oldHosts.get(m.key));
		const side = m.key.split(' ')[0]!;
		if (at >= 0) {
			const [u] = unexpected.splice(at, 1);
			const samePath = pathOf(u!.key) === pathOf(m.key);
			failures.push({ route, dimension: 'network', check: `${side} request ${samePath ? 'changed' : 'to a different endpoint'}`, expected: m.key, actual: u!.key, hint: (samePath ? HINTS.networkChanged : HINTS.networkEndpoint) + clientHint(m.key, clients) });
		} else {
			failures.push({ route, dimension: 'network', check: `${side} request missing`, expected: m.key, actual: '(not requested)', hint: (side === 'server' ? HINTS.networkServerMissing : HINTS.networkMissing) + clientHint(m.key, clients) });
		}
	}
	for (const u of unexpected) failures.push({ route, dimension: 'network', check: `${u.key.split(' ')[0]} request the old page does not make`, expected: '(not requested)', actual: `${u.got > 1 ? `${u.got}x ` : ''}${u.key}`, hint: HINTS.networkExtra });
	return failures;
}
