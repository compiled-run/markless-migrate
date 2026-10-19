import { randomUUID } from 'node:crypto';
import { request as playwrightRequest, type APIRequestContext, type Browser, type BrowserContext, type BrowserContextOptions, type Frame, type Page, type Request, type Route } from 'playwright';
import { DEFAULT_FREEZE, freezePage, type FreezeOptions } from './freeze.ts';
import { bodyShape, MAX_BODY, sameApp, type NetworkRecord } from './network.ts';
import { at, writeHandler, type WriteFact } from './source-facts.ts';
import { detectChallenge } from './blocked.ts';
import { blocker } from './trackers.ts';
import { trackLoops } from './loops.ts';
import { registerStructure } from './structure.ts';
import type { Viewport } from './types.ts';
import { request } from './http.ts';
import type { Scope } from './infrastructure.ts';

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
	/** Bot walls that answered any of this app's own requests during one route's check: pages, assets, journeys and states. */
	readonly walls?: WallHit[];
	/** As the front door routes it: a page this app does not serve yet loads from the old app's own origin, exactly as there, with the old side's sign-in. */
	readonly frontDoor?: { readonly old: string; readonly serves: (path: string) => boolean; readonly storageState?: StorageState; readonly signIn?: () => Promise<StorageState> };
	/** The route check this load belongs to, closed when the check passes its deadline. */
	readonly scope?: Scope;
	/** Signs the role in afresh from its login steps, for a journey that ends the session. */
	readonly signIn?: () => Promise<StorageState>;
	/** What the visitor's prefers-reduced-motion says; `reduce` unless motion is being recorded. */
	readonly reducedMotion?: 'reduce' | 'no-preference';
}

// On an asset or a fetch only a challenge header proves a wall; a CDN's server header on an ordinary 403 does not.
export const DEFINITE = /^header (cf-mitigated|x-vercel-mitigated|x-amzn-waf-action):|^header server: Vercel, plain 403/i;

export interface WallHit {
	readonly status: number;
	readonly vendor: string;
	readonly evidence: string;
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
	// Remix v2 names the route module that answers a fetch with ?_data=: framework transport, not part of the app's own URL.
	const query = [...new Set(url.searchParams.keys())].filter((key) => !(key === '_data' && sameApp(url, origin))).sort();
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
	/** While set, with writes held back, every page load and fetch to the app is held back too: a control that ends the session or deletes may do it with a GET. */
	holdAll?: boolean;
	/** Waits for response bodies still being read. */
	settled(): Promise<void>;
	/** Stops recording: requests the checker itself makes from the page afterwards are not the page's. */
	stop(): void;
}

const CONTRACT_TYPES = new Set(['fetch', 'xhr', 'eventsource', 'ping']);
const textual = (type: string) => /json|text|xml|javascript|graphql/.test(type);
const mime = (value: string | undefined) => (value ?? '').split(';')[0]!.trim().toLowerCase();

// Markless's router fetches the next page's HTML with `x-markless-fragment: 1` (its client-side navigation and prefetch).
export function frameworkTransport(request: Pick<Request, 'headers' | 'method'>, url: URL): boolean {
	const headers = request.headers();
	return url.pathname.startsWith('/_next/') || url.searchParams.has('_rsc') || Boolean(headers.rsc || headers['next-router-state-tree'] || headers['next-action'] || headers['x-markless-fragment']) || (request.method() === 'GET' && url.searchParams.has('_data'));
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

// A page's own scripts, styles, fonts and images from a CDN still load in journeys (sites load their framework that way); widget frames and data calls do not.
export function pageAsset(method: string, resourceType: string): boolean {
	return method === 'GET' && ['script', 'stylesheet', 'font', 'image'].includes(resourceType);
}

// Each other-origin asset is fetched once per run, in a request context of its own (one tied to a closed journey page never settles): journeys open many pages at once and must not burst a CDN.
const assets = new Map<string, Promise<{ status: number; headers: Record<string, string>; body: Buffer } | undefined>>();
let fetcher: Promise<APIRequestContext> | undefined;

async function fulfillAsset(route: Route, live = false): Promise<void> {
	const url = route.request().url();
	let hit = assets.get(url);
	if (!hit) {
		fetcher ??= playwrightRequest.newContext();
		hit = fetcher
			.then((api) => api.get(url, { headers: route.request().headers(), timeout: 15_000, failOnStatusCode: false }))
			.then(async (response) => {
				const headers = Object.fromEntries(Object.entries(response.headers()).filter(([name]) => !['content-encoding', 'content-length', 'transfer-encoding'].includes(name)));
				return { status: response.status(), headers, body: await response.body() };
			})
			.catch(() => undefined);
		assets.set(url, hit);
	}
	const got = await hit;
	if (!got && live) assets.delete(url);
	// One fetch answers pages on both apps: a CORS answer naming the first page's origin is given to each page for its own.
	const origin = route.request().headers().origin;
	const allowed = got?.headers['access-control-allow-origin'];
	const answer = got && allowed && allowed !== '*' && origin ? { ...got, headers: { ...got.headers, 'access-control-allow-origin': origin } } : got;
	await (answer ? route.fulfill(answer) : live ? route.continue() : route.abort()).catch(() => {});
}

/** Answers recorded by an earlier load (an old capture from the cache) for the page's own data requests to other origins, given to every later load of this run, so a new capture reads what that old capture read. */
export function shareAnswers(records: readonly NetworkRecord[], origin: string): void {
	for (const r of records) {
		if (r.side !== 'browser' || r.method !== 'GET' || r.body === undefined || r.intercepted || r.replayed || !r.status || sameApp(new URL(r.url), origin) || assets.has(r.url)) continue;
		assets.set(r.url, Promise.resolve({ status: r.status, headers: { 'content-type': r.contentType, 'access-control-allow-origin': '*' }, body: Buffer.from(r.body) }));
	}
}

/** A request a page's own code makes to another origin that every load of the run can share: a GET for a script, style, font, image or data (a widget's script and the API it reads), outside any embed. */
export function sharedThirdParty(method: string, resourceType: string): boolean {
	return method === 'GET' && ['script', 'stylesheet', 'font', 'image', 'fetch', 'xhr'].includes(resourceType);
}

/** Made by the content of a third-party embed (an iframe on another origin, or a frame inside one): the embed's own business. The embed's own document load is the page's. */
export function insideEmbed(request: Pick<Request, 'frame' | 'isNavigationRequest'>, own: (url: URL) => boolean): boolean {
	let frame: Frame | null;
	try {
		frame = request.frame();
	} catch {
		return false;
	}
	if (request.isNavigationRequest()) frame = frame.parentFrame();
	for (; frame?.parentFrame(); frame = frame.parentFrame()) {
		const url = URL.parse(frame.url());
		if (url && /^https?:$/.test(url.protocol) && !own(url)) return true;
	}
	return false;
}

function topLevelLoad(request: Request): boolean {
	try {
		return request.isNavigationRequest() && !request.frame().parentFrame() && request.method() === 'GET';
	} catch {
		return false;
	}
}

/** Where the front door sends a page load: a path the new app does not serve yet to the old app's own origin, a switched one back to the new app. */
export function frontDoorTarget(url: URL, origin: string, door: NonNullable<SideEnv['frontDoor']>): string | undefined {
	if (sameApp(url, origin) && !door.serves(url.pathname)) return new URL(url.pathname + url.search + url.hash, door.old).href;
	if (sameApp(url, door.old) && !sameApp(url, origin) && door.serves(url.pathname)) return new URL(url.pathname + url.search + url.hash, origin).href;
	return undefined;
}

/** The new side's storage state with the old side's sign-in added for the old origin, so a page the front door sends there is signed in as on its own host. */
export function withOldSession(state: StorageState | undefined, old: StorageState | undefined): StorageState | undefined {
	if (!old) return state;
	const key = (c: StorageState['cookies'][number]) => `${c.name}|${c.domain}|${c.path}`;
	const mine = new Set((state?.cookies ?? []).map(key));
	return { cookies: [...(state?.cookies ?? []), ...old.cookies.filter((c) => !mine.has(key(c)))], origins: [...(state?.origins ?? []), ...(old.origins ?? []).filter((o) => !(state?.origins ?? []).some((n) => n.origin === o.origin))] };
}

export interface OpenOptions {
	/** Abort requests to other origins (journeys keep third-party widgets out), except page assets and recorded and blocked ones. */
	readonly sameOriginOnly?: boolean;
	/** Track loops (live intervals, self-scheduling timeouts and animation frames) so a capture can hold them at their start. */
	readonly loops?: boolean;
	/** Answer the page's own GETs to other origins from one fetch per run, so every load of the run, old and new, gets the same third-party answer (a widget's API reply, rate limited or not). */
	readonly shareThirdParty?: boolean;
}

export interface OpenPage {
	readonly context: BrowserContext;
	readonly page: Page;
	readonly log: PageLog;
	/** The app's own origins: its own, and the old app's when the front door sends a page there. */
	readonly own: (url: URL) => boolean;
}

/** A fresh context with the clock and randomness frozen, trackers blocked, writes held back unless allowed, and recorded data served. */
export async function openPage(browser: Browser, env: SideEnv, viewport: Viewport, options: OpenOptions = {}): Promise<OpenPage> {
	await registerStructure();
	const storageState = env.frontDoor ? withOldSession(env.storageState, env.frontDoor.storageState) : env.storageState;
	const context = await browser.newContext({ ...contextOptions(viewport, env.freeze), ...(env.reducedMotion ? { reducedMotion: env.reducedMotion } : {}), ...(storageState ? { storageState } : {}), ...(env.userAgent ? { userAgent: env.userAgent } : {}) });
	env.scope?.track(context);
	if (env.cookies?.length) await context.addCookies(env.cookies.map((c) => ({ ...c, url: env.origin })));
	const extra = env.headers ?? {};
	if (env.freeze) await context.addInitScript(freezePage, { time: env.freeze.time, seed: env.freeze.seed, ...(env.freeze.clock ? { clock: env.freeze.clock } : {}) });
	if (options.loops) await context.addInitScript(trackLoops);
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
	if (env.walls) {
		const walls = env.walls;
		context.on('response', (response) => {
			if (!sameApp(new URL(response.url()), env.origin)) return;
			const status = response.status();
			const document = response.request().resourceType() === 'document';
			const look = (body: string) => {
				const found = detectChallenge({ status, headers: response.headers(), body });
				if (found && (document || DEFINITE.test(found.evidence))) walls.push({ status, ...found });
			};
			if (status >= 400 && document) response.text().then(look, () => look(''));
			else look('');
		});
	}
	const recorded = env.replay?.responses.filter((r) => r.side === 'browser') ?? [];
	const door = env.frontDoor;
	const ownOrigin = (url: URL) => sameApp(url, env.origin) || (door !== undefined && sameApp(url, door.old));
	await context.route('**/*', async (route: Route) => {
		const request = route.request();
		const url = new URL(request.url());
		if (!/^https?:$/.test(url.protocol)) return route.continue();
		if (env.block(url.hostname)) {
			log.blocked.set(url.hostname, (log.blocked.get(url.hostname) ?? 0) + 1);
			return route.abort('blockedbyclient');
		}
		const home = door && sameApp(url, door.old) && !sameApp(url, env.origin) ? door.old : env.origin;
		const same = sameApp(url, home);
		const body = request.postData() ?? undefined;
		const type = mime(request.headers()['content-type']);
		const reason = writeReason(request.method(), url, home, env.writeFacts, request.headers()) ?? (log.holdAll && same && !env.sendWrites && (request.isNavigationRequest() || ['fetch', 'xhr'].includes(request.resourceType())) ? 'a request of a control that ends the session or deletes' : undefined);
		// An embed's own writes (its analytics, its player state) are held back too, and are the embed's, not the page's.
		if (reason && insideEmbed(request, ownOrigin)) {
			handled.add(request);
			return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*' } });
		}
		if (reason) {
			const line = requestLine(request.method(), url, home, body, type);
			log.writes.push({ line: env.sendWrites ? line : `would ${line}`, reason, sent: env.sendWrites, request });
			if (!env.sendWrites) {
				handled.add(request);
				log.records.push({ side: 'browser', method: request.method(), url: url.href, requestType: type, ...(body ? { requestBody: body } : {}), status: 0, contentType: '', intercepted: true });
				// A held-back form post still lands somewhere, so the step completes and its URL and request compare.
				if (request.isNavigationRequest()) return route.fulfill({ status: 200, contentType: 'text/html', body: `<!doctype html><title>Write held back</title><p>markless-migrate held back this write: ${line.replace(/[&<>]/g, '')}</p>` });
				return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*' } });
			}
		}
		const door302 = door && topLevelLoad(request) ? frontDoorTarget(url, env.origin, door) : undefined;
		if (door302) return route.fulfill({ status: 302, headers: { location: door302 } });
		if (!same) {
			const hit = findRecorded(recorded, 'browser', request.method(), url, body);
			if (hit) {
				handled.add(request);
				log.records.push({ ...hit, url: url.href, replayed: true, recordedUrl: hit.url });
				return route.fulfill({ status: hit.status, headers: { 'content-type': hit.contentType, 'access-control-allow-origin': '*' }, body: hit.body ?? '' });
			}
			if (!options.sameOriginOnly) return options.shareThirdParty && sharedThirdParty(request.method(), request.resourceType()) && !insideEmbed(request, ownOrigin) ? fulfillAsset(route, true) : route.continue();
			return pageAsset(request.method(), request.resourceType()) ? fulfillAsset(route) : route.abort();
		}
		// The page load's id goes only on the page and its API calls: framework prefetches render other routes, whose fetches are not this page's.
		const own = request.isNavigationRequest() || (['fetch', 'xhr'].includes(request.resourceType()) && !frameworkTransport(request, url));
		if (own) return route.continue({ headers: { ...request.headers(), ...extra, [RECORDER_HEADER]: tag } });
		if (env.replay) return route.continue({ headers: { ...request.headers(), ...extra, [RECORDER_HEADER]: recorderTag(env, randomUUID()) } });
		return env.headers ? route.continue({ headers: { ...request.headers(), ...extra } }) : route.continue();
	});
	const finish = (request: Request) => {
		if (handled.has(request) || !contractRequest(request, env.origin) || insideEmbed(request, ownOrigin)) return;
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
	return { context, page, log, own: ownOrigin };
}

function tokenHeaders(): Record<string, string> {
	const token = process.env.MARKLESS_MIGRATE_TOKEN;
	return token ? { 'x-markless-migrate-token': token } : {};
}

// Asked once per origin: a server without the recorder is not sent one request per page load (a mirror forwards each to production).
const recorders = new Map<string, Promise<boolean | undefined>>();
function runsRecorder(env: SideEnv): Promise<boolean | undefined> {
	const key = `${new URL(env.origin).origin}|${process.env.MARKLESS_MIGRATE_TOKEN ? 'token' : ''}`;
	let known = recorders.get(key);
	if (!known) {
		known = request(new URL('/__markless-migrate/', env.origin), { headers: { ...appHeaders(env), ...tokenHeaders() } })
			.then(async (hello) => hello.ok && mime(hello.headers.get('content-type') ?? '').includes('json') && ((await hello.json()) as { recorder?: number }).recorder === 1)
			.catch(() => undefined);
		recorders.set(key, known);
		known.then((answer) => answer === undefined && recorders.delete(key));
	}
	return known;
}

/** What the server fetched while rendering this load, when it runs with the request recorder; undefined when it does not. */
export async function serverRecords(env: SideEnv, load: string): Promise<NetworkRecord[] | undefined> {
	if ((await runsRecorder(env)) === false) return undefined;
	try {
		const response = await request(new URL(`/__markless-migrate/requests?load=${encodeURIComponent(load)}`, env.origin), { headers: { ...appHeaders(env), ...tokenHeaders() } });
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
		const hello = await request(new URL('/__markless-migrate/', env.origin), { headers });
		const recorder = hello.ok && (hello.headers.get('content-type') ?? '').includes('json') && ((await hello.json()) as { recorder?: number }).recorder === 1;
		if (!recorder) return false;
		const response = await request(new URL(`/__markless-migrate/data?set=${encodeURIComponent(env.replay.set)}`, env.origin), {
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
