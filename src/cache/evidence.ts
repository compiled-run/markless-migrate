import { createHash } from 'node:crypto';
import { routeFile } from '../check/capture.ts';
import { request } from '../check/http.ts';
import { cdnFacts, parseVary, setCookieNames, type CdnFacts } from './headers.ts';

/** One answer to a GET, as far as caching goes. */
export interface ResponseFacts {
	readonly status: number;
	readonly contentType: string;
	readonly cacheControl?: string;
	readonly etag?: string;
	readonly lastModified?: string;
	readonly vary: readonly string[];
	/** Names of the cookies the response sets. */
	readonly setCookies: readonly string[];
	readonly age?: number;
	readonly cdn?: CdnFacts;
	/** Vercel's request id: `pop::region::id` when a function region answered, `pop::id` from the edge alone. */
	readonly vercelId?: string;
	readonly bodyHash: string;
	/** Request start to response headers, in ms. */
	readonly ttfbMs: number;
	readonly location?: string;
	/** Markless's page-file marker, when the page carries one. */
	readonly routeFile?: string;
	/** The body ends as a Markless fragment response does; set when the router's fragment markers are known. */
	readonly fragmentBody?: boolean;
}

/** Two GETs of one route, the second after the first was answered: the second shows whether a shared cache kept it. */
export interface RouteEvidence {
	readonly route: string;
	readonly first: ResponseFacts;
	readonly second: ResponseFacts;
	/** A GET carrying a cookie, when one was sent: a page that changes for it reads the cookie. */
	readonly withCookie?: ResponseFacts;
}

export interface ProbeOptions {
	readonly headers?: Readonly<Record<string, string>>;
	/** Time between the two GETs (default 1500 ms, long enough for a CDN to have stored the first). */
	readonly gapMs?: number;
	/** Send a third GET with a made-up cookie: a page whose body changes for it reads cookies. */
	readonly cookieProbe?: boolean;
}

// Values that change on every render of an otherwise unchanged page: CSRF tokens, CSP nonces, request ids.
const PER_RENDER = /\b(nonce|csrf[-_]?token|authenticity_token|_token|request[-_]?id)\b\s*[=:]\s*["'][^"']*["']|\bnonce="[^"]*"/gi;

/** The caching facts of a response already read. */
export function factsOf(response: Response, body: string, ttfbMs: number): ResponseFacts {
	const h = response.headers;
	const age = h.get('age');
	const cdn = cdnFacts(h);
	const marker = routeFile(body).routeFile;
	return {
		status: response.status,
		contentType: (h.get('content-type') ?? '').split(';')[0]!.trim().toLowerCase(),
		...(h.get('cache-control') ? { cacheControl: h.get('cache-control')! } : {}),
		...(h.get('etag') ? { etag: h.get('etag')! } : {}),
		...(h.get('last-modified') ? { lastModified: h.get('last-modified')! } : {}),
		vary: parseVary(h.get('vary')),
		setCookies: setCookieNames(h),
		...(age !== null && Number.isFinite(Number(age)) ? { age: Number(age) } : {}),
		...(cdn ? { cdn } : {}),
		...(h.get('x-vercel-id') ? { vercelId: h.get('x-vercel-id')! } : {}),
		bodyHash: createHash('sha256').update(body.replace(PER_RENDER, '')).digest('hex').slice(0, 16),
		ttfbMs: Math.round(ttfbMs),
		...(h.get('location') ? { location: h.get('location')! } : {}),
		...(marker ? { routeFile: marker } : {}),
	};
}

export async function fetchPage(url: string, headers: Readonly<Record<string, string>> = {}): Promise<{ facts: ResponseFacts; body: string }> {
	const start = performance.now();
	const response = await request(url, { redirect: 'manual', headers: { 'accept-encoding': 'gzip, br', ...headers } });
	const ttfbMs = performance.now() - start;
	const body = await response.text().catch(() => '');
	return { facts: factsOf(response, body, ttfbMs), body };
}

export const fetchFacts = async (url: string, headers: Readonly<Record<string, string>> = {}): Promise<ResponseFacts> => (await fetchPage(url, headers)).facts;

export async function probeRoute(origin: string, route: string, options: ProbeOptions = {}): Promise<RouteEvidence> {
	const url = new URL(route, origin).href;
	const first = await fetchFacts(url, options.headers);
	await new Promise((r) => setTimeout(r, options.gapMs ?? 1500));
	const second = await fetchFacts(url, options.headers);
	const withCookie = options.cookieProbe ? await fetchFacts(url, { ...options.headers, cookie: 'markless_migrate_probe=1' }) : undefined;
	return { route, first, second, ...(withCookie ? { withCookie } : {}) };
}

/** Probes routes a few at a time. */
export async function probeRoutes(origin: string, routes: readonly string[], options: ProbeOptions & { readonly concurrency?: number } = {}): Promise<RouteEvidence[]> {
	const out: RouteEvidence[] = new Array(routes.length);
	let next = 0;
	const worker = async () => {
		while (next < routes.length) {
			const i = next++;
			out[i] = await probeRoute(origin, routes[i]!, options);
		}
	};
	await Promise.all(Array.from({ length: Math.min(options.concurrency ?? 6, routes.length) }, worker));
	return out;
}
