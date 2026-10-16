import { randomUUID } from 'node:crypto';
import type { Browser, BrowserContext, BrowserContextOptions, Page, Request, Route } from 'playwright';
import { DEFAULT_FREEZE, freezePage, type FreezeOptions } from './freeze.ts';
import { bodyShape, MAX_BODY, sameApp, type NetworkRecord } from './network.ts';
import { at, writeHandler, type WriteFact } from './source-facts.ts';
import { blocker } from './trackers.ts';
import type { Viewport } from './types.ts';

/** How the checker treats one app: what it freezes and blocks, whether writes are sent, and which recorded data it serves. */
export interface SideEnv {
	readonly origin: string;
	readonly freeze: FreezeOptions | false;
	readonly block: (host: string) => boolean;
	readonly sendWrites: boolean;
	readonly writeFacts: readonly WriteFact[];
	/** Recorded responses to serve instead of the network, and the id the app's server knows them by. */
	readonly replay?: { readonly set: string; readonly responses: readonly NetworkRecord[] };
	/** The signed-in role's cookies and storage, from its login script or storage state file. */
	readonly storageState?: StorageState;
	/** Sent only to this app's own origin, for example a bot-protection bypass token. */
	readonly headers?: Readonly<Record<string, string>>;
	readonly cookies?: readonly { readonly name: string; readonly value: string }[];
	readonly userAgent?: string;
}

export type StorageState = Exclude<BrowserContextOptions['storageState'], string | undefined>;

function cookieMatches(domain: string, host: string): boolean {
	const d = domain.replace(/^\./, '');
	return host === d || host.endsWith(`.${d}`);
}

/** Headers for the checker's own requests to the app: bypass headers, the role's cookies and --cookie values, the user agent. */
export function appHeaders(env: SideEnv | undefined): Record<string, string> {
	if (!env) return {};
	const host = new URL(env.origin).hostname;
	const cookies = [...(env.storageState?.cookies ?? []).filter((c) => cookieMatches(c.domain, host)), ...(env.cookies ?? [])].map((c) => `${c.name}=${c.value}`);
	return { ...env.headers, ...(cookies.length ? { cookie: cookies.join('; ') } : {}), ...(env.userAgent ? { 'user-agent': env.userAgent } : {}) };
}

export const RECORDER_HEADER = 'x-markless-migrate';
const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

export function isLoopback(origin: string): boolean {
	return LOOPBACK.has(new URL(origin).hostname);
}

export function defaultEnv(origin: string, over: Partial<SideEnv> = {}): SideEnv {
	return { origin, freeze: DEFAULT_FREEZE, block: blocker(), sendWrites: isLoopback(origin), writeFacts: [], ...over };
}

export function contextOptions(viewport: Viewport, freeze: FreezeOptions | false = DEFAULT_FREEZE): BrowserContextOptions {
	return {
		viewport: { width: viewport.width, height: viewport.height },
		isMobile: viewport.isMobile,
		hasTouch: viewport.isMobile,
		deviceScaleFactor: 1,
		reducedMotion: 'reduce',
		colorScheme: 'light',
		serviceWorkers: 'block',
		...(freeze ? { timezoneId: freeze.timezone, locale: freeze.locale } : {}),
	};
}

/** The header that tags a request with its page load, so the server recorder files what the server fetched under it. */
export function recorderTag(env: SideEnv, load: string): string {
	return `load=${load}${env.replay ? `; data=${env.replay.set}` : ''}`;
}

/** Headers for the checker's own requests to an app, so replayed data reaches those renders too. */
export function tagHeaders(env: SideEnv | undefined): Record<string, string> {
	return env ? { ...appHeaders(env), [RECORDER_HEADER]: recorderTag(env, randomUUID()) } : {};
}

/** Why a request is a write, or undefined for a read. */
export function writeReason(method: string, url: URL, origin: string, facts: readonly WriteFact[], headers: Readonly<Record<string, string>> = {}): string | undefined {
	const fact = sameApp(url, origin) ? writeHandler(facts, method, url.pathname) : undefined;
	if (fact) return `writes per the source: ${fact.via ?? 'handler'} at ${at(fact.handler)}${fact.touches?.length ? `, touches ${fact.touches.join(', ')}` : ''}`;
	if (['GET', 'HEAD', 'OPTIONS'].includes(method)) return undefined;
	if (headers['next-action']) return 'server action';
	return `${method} request`;
}

export function requestLine(method: string, url: URL, origin: string, body: string | null | undefined, contentType: string): string {
	const query = [...new Set(url.searchParams.keys())].sort();
	return `${method} ${sameApp(url, origin) ? url.pathname : `${url.origin}${url.pathname}`}${query.length ? `?${query.join('&')}` : ''}${bodyShape(body, contentType)}`;
}

export interface WriteRecord {
	readonly line: string;
	readonly reason: string;
	readonly sent: boolean;
	readonly request: Request;
}

export interface PageLog {
	readonly load: string;
	readonly records: NetworkRecord[];
	readonly writes: WriteRecord[];
	readonly blocked: Map<string, number>;
	/** Waits for response bodies still being read. */
	settled(): Promise<void>;
	/** Stops recording: requests the checker itself makes from the page afterwards are not the page's. */
	stop(): void;
}

const CONTRACT_TYPES = new Set(['fetch', 'xhr', 'eventsource', 'ping']);
const textual = (type: string) => /json|text|xml|javascript|graphql/.test(type);
const mime = (value: string | undefined) => (value ?? '').split(';')[0]!.trim().toLowerCase();

export function frameworkTransport(request: Request, url: URL): boolean {
	const headers = request.headers();
	return url.pathname.startsWith('/_next/') || url.searchParams.has('_rsc') || Boolean(headers.rsc || headers['next-router-state-tree'] || headers['next-action']);
}

/** Requests that make up the page's network contract: API calls anywhere, and documents from other origins. */
export function contractRequest(request: Request, origin: string): boolean {
	const url = new URL(request.url());
	if (!/^https?:$/.test(url.protocol)) return false;
	const same = sameApp(url, origin);
	if (same && frameworkTransport(request, url)) return false;
	const type = request.resourceType();
	return CONTRACT_TYPES.has(type) || (type === 'document' && !same);
}

function queryKey(url: URL): string {
	return `${url.pathname}?${[...url.searchParams].sort(([a, x], [b, y]) => (a === b ? x.localeCompare(y) : a.localeCompare(b))).map(([k, v]) => `${k}=${v}`).join('&')}`;
}

// Exact URL first; then the same path and query on any host, so an app pointed at another backend still gets the recording.
export function findRecorded(responses: readonly NetworkRecord[], side: 'browser' | 'server', method: string, url: URL, body: string | undefined): NetworkRecord | undefined {
	const same = (r: NetworkRecord) => r.side === side && r.method === method && (r.requestBody ?? '') === (body ?? '');
	return responses.find((r) => same(r) && r.url === url.href) ?? responses.find((r) => same(r) && queryKey(new URL(r.url)) === queryKey(url));
}

export interface OpenOptions {
	/** Abort requests to other origins (journeys keep third-party widgets out), except recorded and blocked ones. */
	readonly sameOriginOnly?: boolean;
}

export interface OpenPage {
	readonly context: BrowserContext;
	readonly page: Page;
	readonly log: PageLog;
}

/** A fresh context with the clock and randomness frozen, trackers blocked, writes held back unless allowed, and recorded data served. */
export async function openPage(browser: Browser, env: SideEnv, viewport: Viewport, options: OpenOptions = {}): Promise<OpenPage> {
	const context = await browser.newContext({ ...contextOptions(viewport, env.freeze), ...(env.storageState ? { storageState: env.storageState } : {}), ...(env.userAgent ? { userAgent: env.userAgent } : {}) });
	if (env.cookies?.length) await context.addCookies(env.cookies.map((c) => ({ ...c, url: env.origin })));
	const extra = env.headers ?? {};
	if (env.freeze) await context.addInitScript(freezePage, { time: env.freeze.time, seed: env.freeze.seed });
	const load = randomUUID();
	const tag = recorderTag(env, load);
	const pending = new Set<Promise<void>>();
	const handled = new WeakSet<Request>();
	let stopped = false;
	const log: PageLog = {
		load,
		records: [],
		writes: [],
		blocked: new Map(),
		settled: async () => {
			while (pending.size) await Promise.all([...pending]);
		},
		stop: () => {
			stopped = true;
		},
	};
	const recorded = env.replay?.responses.filter((r) => r.side === 'browser') ?? [];
	await context.route('**/*', async (route: Route) => {
		const request = route.request();
		const url = new URL(request.url());
		if (!/^https?:$/.test(url.protocol)) return route.continue();
		if (env.block(url.hostname)) {
			log.blocked.set(url.hostname, (log.blocked.get(url.hostname) ?? 0) + 1);
			return route.abort('blockedbyclient');
		}
		const same = sameApp(url, env.origin);
		const body = request.postData() ?? undefined;
		const type = mime(request.headers()['content-type']);
		const reason = writeReason(request.method(), url, env.origin, env.writeFacts, request.headers());
		if (reason) {
			const line = requestLine(request.method(), url, env.origin, body, type);
			log.writes.push({ line: env.sendWrites ? line : `would ${line}`, reason, sent: env.sendWrites, request });
			if (!env.sendWrites) {
				handled.add(request);
				log.records.push({ side: 'browser', method: request.method(), url: url.href, requestType: type, ...(body ? { requestBody: body } : {}), status: 0, contentType: '', intercepted: true });
				// A held-back form post still lands somewhere, so the step completes and its URL and request compare.
				if (request.isNavigationRequest()) return route.fulfill({ status: 200, contentType: 'text/html', body: `<!doctype html><title>Write held back</title><p>markless-migrate held back this write: ${line.replace(/[&<>]/g, '')}</p>` });
				return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*' } });
			}
		}
		if (!same) {
			const hit = findRecorded(recorded, 'browser', request.method(), url, body);
			if (hit) {
				handled.add(request);
				log.records.push({ ...hit, url: url.href, replayed: true, recordedUrl: hit.url });
				return route.fulfill({ status: hit.status, headers: { 'content-type': hit.contentType, 'access-control-allow-origin': '*' }, body: hit.body ?? '' });
			}
			return options.sameOriginOnly ? route.abort() : route.continue();
		}
		// The page load's id goes only on the page and its API calls: framework prefetches render other routes, whose fetches are not this page's.
		const own = request.isNavigationRequest() || (['fetch', 'xhr'].includes(request.resourceType()) && !frameworkTransport(request, url));
		if (own) return route.continue({ headers: { ...request.headers(), ...extra, [RECORDER_HEADER]: tag } });
		if (env.replay) return route.continue({ headers: { ...request.headers(), ...extra, [RECORDER_HEADER]: recorderTag(env, randomUUID()) } });
		return env.headers ? route.continue({ headers: { ...request.headers(), ...extra } }) : route.continue();
	});
	const finish = (request: Request) => {
		if (handled.has(request) || !contractRequest(request, env.origin)) return;
		const url = new URL(request.url());
		if (env.block(url.hostname)) return;
		const reading = (async () => {
			const response = await request.response().catch(() => null);
			const contentType = mime(response?.headers()['content-type']);
			const body = response && textual(contentType) ? (await response.text().catch(() => '')).slice(0, MAX_BODY) : undefined;
			const requestBody = request.postData() ?? undefined;
			log.records.push({ side: 'browser', method: request.method(), url: url.href, requestType: mime(request.headers()['content-type']), ...(requestBody ? { requestBody } : {}), status: response?.status() ?? 0, contentType, ...(body !== undefined ? { body } : {}) });
		})().finally(() => pending.delete(reading));
		pending.add(reading);
	};
	context.on('request', (request) => {
		if (stopped) handled.add(request);
	});
	context.on('requestfinished', finish);
	context.on('requestfailed', finish);
	const page = await context.newPage();
	return { context, page, log };
}

function tokenHeaders(): Record<string, string> {
	const token = process.env.MARKLESS_MIGRATE_TOKEN;
	return token ? { 'x-markless-migrate-token': token } : {};
}

/** What the server fetched while rendering this load, when it runs with the request recorder; undefined when it does not. */
export async function serverRecords(env: SideEnv, load: string): Promise<NetworkRecord[] | undefined> {
	try {
		const response = await fetch(new URL(`/__markless-migrate/requests?load=${encodeURIComponent(load)}`, env.origin), { headers: { ...appHeaders(env), ...tokenHeaders() } });
		if (!response.ok || !mime(response.headers.get('content-type') ?? '').includes('json')) {
			await response.body?.cancel();
			return undefined;
		}
		const json = (await response.json()) as { recorder?: number; records?: NetworkRecord[] };
		return json.recorder ? (json.records ?? []) : undefined;
	} catch {
		return undefined;
	}
}

/** Hands recorded server responses to the app's server recorder; false when the server does not run it. */
export async function pushRecording(env: SideEnv): Promise<boolean> {
	if (!env.replay) return true;
	const headers = { ...appHeaders(env), ...tokenHeaders() };
	try {
		const hello = await fetch(new URL('/__markless-migrate/', env.origin), { headers });
		const recorder = hello.ok && (hello.headers.get('content-type') ?? '').includes('json') && ((await hello.json()) as { recorder?: number }).recorder === 1;
		if (!recorder) return false;
		const response = await fetch(new URL(`/__markless-migrate/data?set=${encodeURIComponent(env.replay.set)}`, env.origin), {
			method: 'PUT',
			headers: { 'content-type': 'application/json', ...headers },
			body: JSON.stringify({ responses: env.replay.responses.filter((r) => r.side === 'server') }),
		});
		await response.body?.cancel();
		return response.ok;
	} catch {
		return false;
	}
}
