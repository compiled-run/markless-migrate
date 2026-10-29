import { randomUUID } from 'node:crypto';
import { trackEmbedSlots } from '../embed/page.ts';
import { trackCanvasDraws } from './embeds.ts';
import { SLOTS } from '../embed/providers.ts';
import { pinLiveCounts } from './live-counts.ts';
import { request as playwrightRequest, type APIRequestContext, type Browser, type BrowserContext, type BrowserContextOptions, type Frame, type Page, type Request, type Route } from 'playwright';
import { DEFAULT_FREEZE, freezePage, type FreezeOptions } from './freeze.ts';
import { bodyShape, MAX_BODY, sameApp, type NetworkRecord } from './network.ts';
import { at, writeHandler, type WriteFact } from './source-facts.ts';
import { detectChallenge } from './blocked.ts';
import { blocker } from './trackers.ts';
import { trackLoops } from './loops.ts';
import type { TimedNetwork } from './timing-network.ts';
import { registerStructure } from './structure.ts';
import type { Viewport } from './types.ts';
import { request } from './http.ts';
import type { Scope } from './infrastructure.ts';
import { FIREBASE_SOCKET, restAnswer, serveDatabases, type FakeDatabase, type LiveRecording, type SocketLog } from './live-data.ts';
import { setRouting, shellRoute, type OldRouting } from './hash-routes.ts';

/** How the checker treats one app: what it freezes and blocks, whether writes are sent, and which recorded data it serves. */
export interface SideEnv {
	readonly origin: string;
	readonly freeze: FreezeOptions | false;
	readonly block: (host: string) => boolean;
	readonly sendWrites: boolean;
	readonly writeFacts: readonly WriteFact[];
	/** Recorded responses to serve instead of the network, and the id the app's server knows them by. */
	readonly replay?: { readonly set: string; readonly responses: readonly NetworkRecord[]; readonly shared?: { readonly set: string; readonly responses: readonly NetworkRecord[] }; readonly live?: LiveRecording };
	/** Asks the server recorder to render each page on demand instead of from the server's page cache (data is being recorded or replayed). */
	readonly renderFresh?: boolean;
	/** Asks the server recorder to render each page load at the page's frozen time (`--server-clock`). */
	readonly serverClock?: boolean;
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
	/** The OS colour scheme the page sees (light unless set). */
	readonly colorScheme?: 'light' | 'dark';
	/** Hosts the old app's source reads its data from (its API clients): a journey's GETs there are answered from the run's one copy. */
	readonly dataHosts?: ReadonlySet<string>;
	/** A hash-routed old app: each route loads from the shell at `/` with the route moved into the hash, and the addresses its pages show are read as routes. */
	readonly routing?: OldRouting;
	/** The new side's: repository star counts the old pages showed live (live-counts.ts), shown in this app's links to them too. */
	readonly liveCounts?: Map<string, string>;
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

/** The header that tags a request with its page load, so the server recorder files what the server fetched under it and renders it at the page's frozen time. */
export function recorderTag(env: SideEnv, load: string): string {
	return `load=${load}${env.replay ? `; data=${[env.replay.set, env.replay.shared?.set].filter(Boolean).join(',')}` : ''}${env.renderFresh ? '; fresh=1' : ''}${env.serverClock && env.freeze ? `; time=${env.freeze.time}` : ''}`;
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
	/** The page's realtime database sockets, frame by frame. */
	readonly sockets: SocketLog[];
	/** While set, with writes held back, every page load and fetch to the app is held back too: a control that ends the session or deletes may do it with a GET. */
	holdAll?: boolean;
	/** While set, a page load stays on this app instead of going where the front door would send it: a load compared with what this app showed. */
	ownPages?: boolean;
	/** Waits for response bodies still being read. */
	settled(): Promise<void>;
	/** Stops recording: requests the checker itself makes from the page afterwards are not the page's. */
	stop(): void;
}

const CONTRACT_TYPES = new Set(['fetch', 'xhr', 'eventsource', 'ping']);
const textual = (type: string) => /json|text|xml|javascript|graphql/.test(type);
const mime = (value: string | undefined) => (value ?? '').split(';')[0]!.trim().toLowerCase();

// Markless's router fetches the next page's HTML for its client-side navigation and prefetch: with `x-markless-fragment: 1`
// up to 0.5, from `/_markless/fragment/<path>` (the router's FRAGMENT_PATH_PREFIX) from 0.7.
export function frameworkTransport(request: Pick<Request, 'headers' | 'method'>, url: URL): boolean {
	const headers = request.headers();
	// htmx's own fetches (hx-boost swapping a page in, its history restore) carry HX-Request: the mechanism, not what the page shows.
	return url.pathname.startsWith('/_next/') || url.pathname.startsWith('/_markless/fragment/') || url.searchParams.has('_rsc') || Boolean(headers.rsc || headers['next-router-state-tree'] || headers['next-action'] || headers['x-markless-fragment'] || (request.method() === 'GET' && headers['hx-request'] === 'true')) || (request.method() === 'GET' && url.searchParams.has('_data'));
}

/** Requests that make up the page's network contract: API calls anywhere, and documents from other origins. */
export function contractRequest(request: Request, origin: string): boolean {
	const url = new URL(request.url());
	if (!/^https?:$/.test(url.protocol)) return false;
	const same = sameApp(url, origin);
	if (same && frameworkTransport(request, url)) return false;
	const type = request.resourceType();
	// Another site's document in a child frame is an embed: the embed step compares it, and a component standing in for it rightly never requests it at load.
	return CONTRACT_TYPES.has(type) || (type === 'document' && !same && !childFrame(request));
}

function childFrame(request: Request): boolean {
	try {
		return Boolean(request.frame().parentFrame());
	} catch {
		return false;
	}
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

/** A data call a page makes itself: a journey answers it from what the page's load read, never from a new fetch. */
export function pageData(method: string, resourceType: string): boolean {
	return method === 'GET' && ['fetch', 'xhr'].includes(resourceType);
}

// Each other-origin asset is fetched once per run, in a request context of its own (one tied to a closed journey page never settles): journeys open many pages at once and must not burst a CDN.
const assets = new Map<string, Promise<{ status: number; headers: Record<string, string>; body: Buffer } | undefined>>();
let fetcher: Promise<APIRequestContext> | undefined;

type SharedAnswer = { status: number; headers: Record<string, string>; body: Buffer };

/** Forgets the shared answers at the start of a run: a long-lived process (the MCP server) does not give one run's third-party answers to the next. */
export function resetSharedAnswers(): void {
	assets.clear();
}

export interface StoredAnswer extends SharedAnswer {
	readonly url: string;
}

const MAX_STORED_BYTES = 512 * 1024;

/** The run's answers for these other-origin URLs, to keep with a cached old capture (a large file, a player's code, is left out). */
export async function storedAnswers(urls: readonly string[]): Promise<StoredAnswer[]> {
	const got = await Promise.all(urls.map(async (url) => ({ url, answer: await assets.get(url) })));
	return got.flatMap(({ url, answer }) => (answer && answer.body.length <= MAX_STORED_BYTES ? [{ url, ...answer }] : []));
}

/** Gives a cached old capture's third-party answers to the rest of the run; false, adopting none, when this run already got one of them differently. */
export async function adoptAnswers(answers: readonly StoredAnswer[]): Promise<boolean> {
	for (const a of answers) {
		const now = assets.get(a.url);
		if (!now) continue;
		const got = await now;
		if (!got || got.status !== a.status || !got.body.equals(Buffer.from(a.body))) return false;
	}
	for (const { url, ...answer } of answers) if (!assets.has(url)) assets.set(url, Promise.resolve({ ...answer, body: Buffer.from(answer.body) }));
	return true;
}

/** The run's one answer for a GET to another origin, fetched the first time anything asks for it (a page, or the cache checking whether the old page changed). */
export function sharedAnswer(url: string, headers: Record<string, string> = {}): Promise<SharedAnswer | undefined> {
	let hit = assets.get(url);
	if (!hit) {
		fetcher ??= playwrightRequest.newContext();
		hit = fetcher
			.then((api) => api.get(url, { headers, timeout: 15_000, failOnStatusCode: false }))
			.then(async (response) => {
				const kept = Object.fromEntries(Object.entries(response.headers()).filter(([name]) => !['content-encoding', 'content-length', 'transfer-encoding'].includes(name)));
				return { status: response.status(), headers: kept, body: await response.body() };
			})
			.catch(() => undefined);
		assets.set(url, hit);
	}
	return hit;
}

async function fulfillAsset(route: Route, live = false): Promise<void> {
	const url = route.request().url();
	const got = await sharedAnswer(url, route.request().headers());
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

/** A GET to another origin that every load of the run can share: a script, style, font, image or data, the page's own (a widget's script and the API it reads) or an embed's (the star count a widget's iframe reads), so both sides show the same third-party answer. */
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
	/** Track loops (live intervals, self-scheduling timeouts and animation frames) so a capture can hold them at their start; `known` are loops an earlier load of the page confirmed. */
	readonly loops?: boolean | { readonly known: readonly string[] };
	/** Answer the page's own GETs to other origins from one fetch per run, so every load of the run, old and new, gets the same third-party answer (a widget's API reply, rate limited or not). */
	readonly shareThirdParty?: boolean;
	/** Let an embed's own frame send its writes (a player asking for its stream by POST), as a visitor's browser does; the page's own writes are still held. */
	readonly embedWrites?: boolean;
	/** While timing: every answer reaches the page after the network's fixed latency, its GETs from one stored copy; `miss` is told when a copy had to be fetched during this load. */
	readonly timed?: { readonly network: TimedNetwork; readonly miss: () => void };
}

const STORED_TYPES = new Set(['document', 'script', 'stylesheet', 'font', 'image', 'fetch', 'xhr', 'manifest', 'other']);

export interface OpenPage {
	readonly context: BrowserContext;
	readonly page: Page;
	readonly log: PageLog;
	/** The app's own origins: its own, and the old app's when the front door sends a page there. */
	readonly own: (url: URL) => boolean;
}

// Runs in the page: counts the messages its realtime database sockets deliver, as a routed socket is never one of the page's websockets.
function countDatabaseFrames(pattern: string): void {
	const Socket = globalThis.WebSocket;
	const host = new RegExp(pattern);
	const w = globalThis as unknown as { __mmDatabaseFrames: number };
	w.__mmDatabaseFrames = 0;
	globalThis.WebSocket = class extends Socket {
		constructor(url: string | URL, protocols?: string | string[]) {
			super(url, protocols);
			if (host.test(String(url))) this.addEventListener('message', () => void w.__mmDatabaseFrames++);
		}
	};
}

/** How many frames the page has received on its replayed realtime database sockets. */
export function databaseFramesReceived(page: Page): Promise<number> {
	return page.evaluate(() => (globalThis as unknown as { __mmDatabaseFrames?: number }).__mmDatabaseFrames ?? 0).catch(() => 0);
}

// Every routed request is a round trip through Playwright's client, which captures a stack trace per call; static files pass straight through.
const STATIC_FILE = /\.(?:m?js|css|woff2?|ttf|otf|eot|png|jpe?g|gif|webp|avif|svg|ico|mp4|webm)$/;

/**
 * The requests the route handler must see. Under a plain page load (no extra headers, replay, timing, source write
 * facts or front door) the handler only continues a GET of the app's own static file unchanged, so those are left out.
 */
export function routedRequests(env: SideEnv, options: OpenOptions): string | RegExp {
	const origin = new URL(env.origin);
	if (env.headers || env.replay || env.writeFacts.length || env.frontDoor || options.timed || env.block(origin.hostname)) return '**/*';
	const own = origin.origin.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
	return new RegExp(`^(?!${own}/[^?#]*${STATIC_FILE.source.slice(0, -1)}(?:[?#]|$))`);
}

/** A fresh context with the clock and randomness frozen, trackers blocked, writes held back unless allowed, and recorded data served. */
export async function openPage(browser: Browser, env: SideEnv, viewport: Viewport, options: OpenOptions = {}): Promise<OpenPage> {
	await registerStructure();
	const storageState = env.frontDoor ? withOldSession(env.storageState, env.frontDoor.storageState) : env.storageState;
	// A visitor's browser lets a click write to the clipboard; headless Linux refuses unless asked, so both sides get the same grant.
	// WebKit and Firefox know no clipboard permissions and refuse a context that asks for them.
	const clipboard = browser.browserType().name() === 'chromium' ? ['clipboard-read', 'clipboard-write'] : [];
	const context = await browser.newContext({ ...contextOptions(viewport, env.freeze), permissions: clipboard, ...(env.reducedMotion ? { reducedMotion: env.reducedMotion } : {}), ...(env.colorScheme ? { colorScheme: env.colorScheme } : {}), ...(storageState ? { storageState } : {}), ...(env.userAgent ? { userAgent: env.userAgent } : {}) });
	env.scope?.track(context);
	if (env.cookies?.length) await context.addCookies(env.cookies.map((c) => ({ ...c, url: env.origin })));
	const extra = env.headers ?? {};
	if (env.freeze) await context.addInitScript(freezePage, { time: env.freeze.time, seed: env.freeze.seed, ...(env.freeze.clock ? { clock: env.freeze.clock } : {}) });
	if (options.loops) await context.addInitScript(trackLoops, options.loops === true ? [] : [...options.loops.known]);
	await context.addInitScript(trackEmbedSlots, SLOTS.map((s) => ({ ...s })));
	await context.addInitScript(trackCanvasDraws);
	if (env.liveCounts?.size) await context.addInitScript(pinLiveCounts, [...env.liveCounts]);
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
		sockets: [],
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
	const recorded = [...(env.replay?.responses ?? []), ...(env.replay?.shared?.responses ?? [])].filter((r) => r.side === 'browser');
	const databases: readonly FakeDatabase[] = env.replay?.live ? await serveDatabases(context, env.replay.live) : [];
	if (env.replay?.live) await context.addInitScript(countDatabaseFrames, FIREBASE_SOCKET.source);
	const door = env.frontDoor;
	const ownOrigin = (url: URL) => sameApp(url, env.origin) || (door !== undefined && sameApp(url, door.old));
	await context.route(routedRequests(env, options), async (route: Route) => {
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
			if (options.embedWrites) return route.continue();
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
		// The document must load at `/`, or the preload scanner fetches the shell's relative files under the route's path.
		if (same && topLevelLoad(request) && shellRoute(url.pathname, env.routing)) return route.fulfill({ status: 302, headers: { location: `/#${url.pathname}${url.search}` } });
		const door302 = door && !log.ownPages && topLevelLoad(request) ? frontDoorTarget(url, env.origin, door) : undefined;
		if (door302) return route.fulfill({ status: 302, headers: { location: door302 } });
		const timed = options.timed;
		if (!same) {
			const rest = request.method() === 'GET' ? restAnswer(databases, url.href) : undefined;
			if (rest) {
				handled.add(request);
				await timed?.network.delay();
				log.records.push({ side: 'browser', method: 'GET', url: url.href, requestType: '', status: rest.status, contentType: 'application/json', body: rest.body, replayed: true });
				return route.fulfill({ status: rest.status, headers: { 'content-type': rest.contentType, 'access-control-allow-origin': '*' }, body: rest.body });
			}
			const hit = findRecorded(recorded, 'browser', request.method(), url, body);
			if (hit) {
				handled.add(request);
				await timed?.network.delay();
				log.records.push({ ...hit, url: url.href, replayed: true, recordedUrl: hit.url });
				return route.fulfill({ status: hit.status, headers: { 'content-type': hit.contentType, 'access-control-allow-origin': '*' }, body: hit.body ?? '' });
			}
			if (!options.sameOriginOnly) return options.shareThirdParty && sharedThirdParty(request.method(), request.resourceType()) ? fulfillAsset(route, true) : route.continue();
			// The page's own data from another origin (a single-page app's API) answers it as it answers the page's load: from the run's one copy.
			if (pageData(request.method(), request.resourceType()) && (assets.has(url.href) || env.dataHosts?.has(url.host)) && !insideEmbed(request, ownOrigin)) {
				await timed?.network.delay();
				return fulfillAsset(route);
			}
			if (!pageAsset(request.method(), request.resourceType())) return route.abort();
			await timed?.network.delay();
			return fulfillAsset(route);
		}
		// The page load's id goes only on the page and its API calls: framework prefetches render other routes, whose fetches are not this page's.
		const own = request.isNavigationRequest() || (['fetch', 'xhr'].includes(request.resourceType()) && !frameworkTransport(request, url));
		if (timed) {
			const headers = { ...request.headers(), ...extra, ...(own ? { [RECORDER_HEADER]: tag } : {}) };
			const data = ['fetch', 'xhr'].includes(request.resourceType());
			if (!['GET', 'HEAD'].includes(request.method())) timed.network.wrote = true;
			else if (request.method() === 'GET' && STORED_TYPES.has(request.resourceType()) && !(data && timed.network.wrote)) return timed.network.answer(route, headers, timed.miss);
			await timed.network.delay();
			return route.continue({ headers });
		}
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
	page.on('websocket', (socket) => {
		if (!FIREBASE_SOCKET.test(socket.url())) return;
		if (stopped) return;
		const opened = Date.now();
		const frames: { sent: boolean; text: string; at: number }[] = [];
		log.sockets.push({ url: socket.url(), frames });
		socket.on('framesent', (frame) => frames.push({ sent: true, text: String(frame.payload), at: Date.now() - opened }));
		socket.on('framereceived', (frame) => frames.push({ sent: false, text: String(frame.payload), at: Date.now() - opened }));
	});
	setRouting(page, env.routing);
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
const pushedShared = new Set<string>();

export async function pushRecording(env: SideEnv): Promise<boolean> {
	if (!env.replay) return true;
	const headers = { ...appHeaders(env), ...tokenHeaders() };
	const put = async (set: string, responses: readonly NetworkRecord[]) => {
		const response = await request(new URL(`/__markless-migrate/data?set=${encodeURIComponent(set)}`, env.origin), {
			method: 'PUT',
			headers: { 'content-type': 'application/json', ...headers },
			body: JSON.stringify({ responses: responses.filter((r) => r.side === 'server') }),
		});
		await response.body?.cancel();
		return response.ok;
	};
	try {
		const hello = await request(new URL('/__markless-migrate/', env.origin), { headers });
		const recorder = hello.ok && (hello.headers.get('content-type') ?? '').includes('json') && ((await hello.json()) as { recorder?: number }).recorder === 1;
		if (!recorder) return false;
		const shared = env.replay.shared;
		// The shared set is every route's recording at once: sent to each server once per run.
		if (shared && !pushedShared.has(`${env.origin} ${shared.set}`)) {
			if (!(await put(shared.set, shared.responses))) return false;
			pushedShared.add(`${env.origin} ${shared.set}`);
		}
		return await put(env.replay.set, env.replay.responses);
	} catch {
		return false;
	}
}

/** How check launches Chromium: with scrollbars, as a visitor's browser shows them, so a page that mishandles their width (scroll-lock padding) is seen doing it. */
export const LAUNCH = { ignoreDefaultArgs: ['--hide-scrollbars'] } as const;
