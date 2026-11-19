// In-page navigation timing, original against port: from the press on a link to the next page's content painted, per
// browser, network and pointer behaviour, first visits and revisits, with what was fetched before and after the press.
import { chromium, devices, firefox, webkit, type Browser, type BrowserContext, type BrowserType, type Page, type Request } from 'playwright';
import { closedOnExit } from './close-on-exit.ts';
import { browserInstalled, stallWatch, type NetworkBrowser } from './slow-network.ts';
import { NETWORK_PROFILES, startThrottle, type NetworkProfile, type Throttle } from './throttle.ts';
import { learnShapes, mayCarryPage, pageOf, targetOf, type PrefetchRequest } from '../prefetch/facts.ts';

/** About one round trip to a nearby CDN on a fast line: both sides get the same link, so a local and a deployed app compare as apps. */
const FAST: NetworkProfile = { name: 'fast', label: 'fast (50 Mbit/s, 40 ms RTT)', downBytesPerSecond: 50_000_000 / 8, upBytesPerSecond: 20_000_000 / 8, rttMs: 40, source: 'a nearby CDN on a fast line' };

export const NAV_PROFILES = {
	fast: { network: FAST, cpu: 1 },
	'cpu-4x': { network: FAST, cpu: 4 },
	'slow-4g': { network: NETWORK_PROFILES['slow-4g']!, cpu: 1 },
} as const;
export type NavProfile = keyof typeof NAV_PROFILES;

/**
 * How the press is made, alike on both sides. `instant` moves and presses in one instant (the worst case, what a script's
 * click does); `dwell-<ms>` arrives and rests that long before pressing, as a hand does (instant.page: half the links hovered for
 * 65 ms are clicked, and fetching from then leaves more than 300 ms before the click on average); `touch` puts a finger down 100 ms before lifting it where the
 * browser can hold a touch (Chromium), and taps where it cannot (WebKit).
 */
export const PRESS_MODES = ['instant', 'dwell-100', 'dwell-250', 'dwell-400', 'touch'] as const;
export type PressMode = (typeof PRESS_MODES)[number];
const TOUCH_HOLD_MS = 100;

export interface NavCellSpec {
	readonly browser: NetworkBrowser;
	readonly profile: NavProfile;
	readonly mode: PressMode;
}

/** Chromium every way on every network; Firefox and WebKit where their pointer and network can be emulated, WebKit on an iPhone for touch. */
export const DEFAULT_CELLS: readonly NavCellSpec[] = [
	...(['fast', 'slow-4g'] as const).flatMap((profile) => PRESS_MODES.map((mode) => ({ browser: 'chromium' as const, profile, mode }))),
	...(['instant', 'dwell-250', 'touch'] as const).map((mode) => ({ browser: 'chromium' as const, profile: 'cpu-4x' as const, mode })),
	...(['fast', 'slow-4g'] as const).flatMap((profile) => (['instant', 'dwell-250'] as const).map((mode) => ({ browser: 'firefox' as const, profile, mode }))),
	...(['fast', 'slow-4g'] as const).flatMap((profile) => (['dwell-250', 'touch'] as const).map((mode) => ({ browser: 'webkit' as const, profile, mode }))),
];
export const DEFAULT_NAV_RUNS = 4;
export const DEFAULT_NAV_LAYOUTS = 4;
const VIEWPORT = { width: 1280, height: 800 };
const PAINT_TIMEOUT_MS = 20_000;
const SETTLE_MS = 1000;

export type StepKind = 'first' | 'revisit';
export interface NavStep {
	readonly target: string;
	readonly region: string;
	readonly kind: StepKind;
}

/** What one press did. Times in ms from the press. */
export interface NavClick {
	readonly target: string;
	readonly kind: StepKind;
	/** The press to the frame after the new page's content showed. */
	readonly ms?: number;
	/** How the target's data stood when the press came: fetched ahead and arrived, still arriving, cancelled, or never asked for. */
	readonly ahead: 'arrived' | 'arriving' | 'cancelled' | 'none';
	/** The press fetched the target's data from the network itself. */
	readonly fetched: boolean;
	/** The press was answered from what was fetched ahead or kept from before, with no fetch of its own. */
	readonly served: boolean;
	/** Same-origin bytes fetched since the previous step settled, before the press; and from the press to the paint. */
	readonly bytesBefore: number;
	readonly bytesAfter: number;
	/** Of `bytesAfter`, the target's data. */
	readonly dataAfter: number;
	/** Long animation frames between the press and the paint (Chromium). */
	readonly mainThreadMs?: number;
	/** A new document was loaded. */
	readonly fullLoad: boolean;
	readonly error?: string;
}

export interface NavRun {
	readonly clicks: readonly NavClick[];
	/** The longest this process went without running a 100 ms timer: a stalled machine skews every time in the run. */
	readonly stalledMs?: number;
	readonly error?: string;
}

export interface NavCell extends NavCellSpec {
	/** The links followed, chosen on the old page as this cell's device shows it. */
	readonly steps: readonly NavStep[];
	readonly old: readonly NavRun[];
	readonly new: readonly NavRun[];
	readonly unavailable?: string;
}

export interface RouteNavTiming {
	readonly route: string;
	readonly cells: readonly NavCell[];
	readonly ms: number;
}

export interface NavTimingOptions {
	readonly cells?: readonly NavCellSpec[];
	/** Runs a side in each cell, old and new taken in turn; at least 4, so the old runs can be split to measure their own noise. */
	readonly runs?: number;
	/** At most this many routes (one per layout) are timed. */
	readonly layouts?: number;
	/** Host names the proxy connects elsewhere (tests). */
	readonly hosts?: Readonly<Record<string, string>>;
}

const TYPES: Readonly<Record<NetworkBrowser, BrowserType>> = { chromium, firefox, webkit };

async function launch(name: NetworkBrowser, throttle: Throttle): Promise<Browser> {
	const proxy = { server: throttle.proxy, bypass: '' };
	if (name === 'chromium') return closedOnExit(await chromium.launch({ proxy, args: ['--proxy-bypass-list=<-loopback>', '--disable-quic'] }));
	if (name === 'firefox') return closedOnExit(await firefox.launch({ proxy, firefoxUserPrefs: { 'network.proxy.allow_hijacking_localhost': true, 'network.http.http3.enable': false } }));
	return closedOnExit(await TYPES[name].launch({ proxy }));
}

// Set before the page's own scripts in every document: the press, the paint of the next page's content (kept in
// sessionStorage, so a new document reads what the old one saw) and long animation frames, all on the epoch clock.
function instrument(): void {
	const S = sessionStorage;
	const now = () => performance.timeOrigin + performance.now();
	const press = (e: Event) => {
		if (e.isTrusted && S.getItem('__mmNavArmed') === '1' && !S.getItem('__mmNavDown')) S.setItem('__mmNavDown', String(now()));
	};
	addEventListener('pointerdown', press, { capture: true });
	addEventListener('touchstart', press, { capture: true });
	const w = window as unknown as { __mmLoaf: [number, number][]; __mmNavWatch: () => void };
	w.__mmLoaf = [];
	try {
		new PerformanceObserver((list) => {
			for (const e of list.getEntries()) w.__mmLoaf.push([performance.timeOrigin + e.startTime, e.duration]);
		}).observe({ type: 'long-animation-frame', buffered: true });
	} catch {}
	const signature = () => (document.querySelector('h1')?.textContent ?? document.querySelector('main')?.textContent?.slice(0, 200) ?? '').trim();
	w.__mmNavWatch = () => {
		const want = S.getItem('__mmNavWant');
		if (!want) return;
		const before = JSON.parse(want) as { path: string; sig: string };
		const tick = () => {
			if (S.getItem('__mmNavPaint') || S.getItem('__mmNavWant') !== want) return;
			const sig = signature();
			if (S.getItem('__mmNavDown') && location.pathname !== before.path && sig && sig !== before.sig) {
				requestAnimationFrame(() => S.setItem('__mmNavPaint', String(now())));
				return;
			}
			requestAnimationFrame(tick);
		};
		requestAnimationFrame(tick);
	};
	if (document.readyState === 'loading') addEventListener('DOMContentLoaded', () => w.__mmNavWatch(), { once: true });
	else w.__mmNavWatch();
}

interface Logged extends PrefetchRequest {
	readonly at: number;
	endAt?: number;
}

function logRequests(page: Page, origin: string): { readonly all: Logged[]; inFlight: () => number; lastActivity: () => number } {
	const all: Logged[] = [];
	const open = new Map<Request, { -readonly [K in keyof Logged]: Logged[K] }>();
	let last = Date.now();
	page.on('request', (r) => {
		let url: URL;
		try {
			url = new URL(r.url());
		} catch {
			return;
		}
		if (url.origin !== origin) return;
		const entry = { path: url.pathname + url.search, type: r.resourceType(), phase: '', start: 0, outcome: 'pending' as PrefetchRequest['outcome'], at: Date.now() };
		open.set(r, entry);
		all.push(entry);
		last = Date.now();
	});
	const done = async (r: Request, outcome: PrefetchRequest['outcome']) => {
		const entry = open.get(r);
		if (!entry) return;
		open.delete(r);
		entry.outcome = outcome;
		entry.endAt = Date.now();
		last = Date.now();
		if (outcome !== 'completed') return;
		const sizes = await r.sizes().catch(() => undefined);
		if (sizes) entry.bytes = sizes.responseBodySize + sizes.responseHeadersSize;
	};
	page.on('requestfinished', (r) => void done(r, 'completed'));
	page.on('requestfailed', (r) => void done(r, /ERR_ABORTED|NS_BINDING_ABORTED|cancel/i.test(r.failure()?.errorText ?? '') ? 'cancelled' : 'failed'));
	return { all, inFlight: () => open.size, lastActivity: () => last };
}

async function quiet(page: Page, log: ReturnType<typeof logRequests>, ms: number, maxMs: number): Promise<void> {
	const until = Date.now() + maxMs;
	while (Date.now() < until && !(log.inFlight() === 0 && Date.now() - log.lastActivity() >= ms)) await page.waitForTimeout(50);
}

function selectorOf(target: string): string {
	const q = target.replace(/["\\]/g, '\\$&');
	return `a[href="${q}"], a[href="${q}/"]`;
}

async function linkPoint(page: Page, target: string): Promise<{ x: number; y: number } | undefined> {
	const link = page.locator(selectorOf(target)).filter({ visible: true }).first();
	if (!(await link.count().catch(() => 0))) return undefined;
	await link.evaluate((a) => a.scrollIntoView({ block: 'center', inline: 'nearest' }), undefined, { timeout: 2000 }).catch(() => {});
	const box = await link.boundingBox({ timeout: 1000 }).catch(() => null);
	if (!box) return undefined;
	const vp = page.viewportSize() ?? VIEWPORT;
	return box.y >= 0 && box.y + box.height <= vp.height ? { x: box.x + box.width / 2, y: box.y + box.height / 2 } : undefined;
}

async function park(page: Page, mode: PressMode): Promise<void> {
	if (mode === 'touch') return;
	const vp = page.viewportSize() ?? VIEWPORT;
	await page.mouse.move(vp.width - 2, vp.height - 2);
}

async function press(page: Page, context: BrowserContext, browser: NetworkBrowser, mode: PressMode, at: { x: number; y: number }): Promise<void> {
	if (mode === 'touch') {
		if (browser === 'chromium') {
			const cdp = await context.newCDPSession(page);
			await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: at.x, y: at.y }] });
			await page.waitForTimeout(TOUCH_HOLD_MS);
			await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
			await cdp.detach().catch(() => {});
		} else await page.touchscreen.tap(at.x, at.y);
		return;
	}
	const dwell = mode === 'instant' ? 0 : Number(mode.slice('dwell-'.length));
	if (dwell) {
		await page.mouse.move(at.x, at.y, { steps: 4 });
		await page.waitForTimeout(dwell);
	} else await page.mouse.move(at.x, at.y);
	await page.mouse.down();
	await page.mouse.up();
}

/** The links a sequence follows: two of each of the page's shared navigations (sidebar, nav, header) whose page both apps serve, each visited and the first visited again. */
export async function chooseSteps(page: Page, route: string, regions: readonly string[] = ['aside', 'nav', 'header']): Promise<NavStep[]> {
	const links = await page.evaluate(() => {
		const region = (el: Element): string => {
			for (let at: Element | null = el; at; at = at.parentElement) {
				const tag = at.tagName.toLowerCase();
				const role = at.getAttribute('role');
				if (tag === 'aside' || role === 'complementary' || at.getAttribute('data-slot') === 'sidebar') return 'aside';
				if (tag === 'header' || role === 'banner') return 'header';
				if (tag === 'nav' || role === 'navigation') return 'nav';
				if (tag === 'main' || role === 'main') return 'main';
			}
			return 'body';
		};
		return [...document.querySelectorAll<HTMLAnchorElement>('a[href]')]
			.filter((a) => a.origin === location.origin && !a.hash && !a.hasAttribute('download') && (!a.target || a.target === '_self') && a.checkVisibility?.() !== false && a.getBoundingClientRect().width > 0)
			.map((a) => ({ target: a.pathname + a.search, region: region(a), text: (a.textContent ?? '').trim() }));
	});
	const own = targetOf(route);
	const destructive = /\b(log ?out|sign ?out|delete|remove|destroy|unsubscribe|deactivate)\b/i;
	const steps: NavStep[] = [];
	const used = new Set<string>([own]);
	for (const region of regions) {
		const pool = [...new Map(links.filter((l) => l.region === region && !destructive.test(`${l.target} ${l.text}`)).map((l) => [targetOf(l.target), l] as const)).keys()].filter((t) => !used.has(t)).sort((a, b) => (hash(route + a) < hash(route + b) ? -1 : 1));
		if (pool.length < 2) continue;
		const [a, b] = pool as [string, string];
		used.add(a).add(b);
		steps.push({ target: a, region, kind: 'first' }, { target: b, region, kind: 'first' }, { target: a, region, kind: 'revisit' });
		if (steps.length >= 6) break;
	}
	return steps;
}

const phone = (spec: NavCellSpec) => spec.mode === 'touch' && spec.browser === 'webkit';
function contextOptions(spec: NavCellSpec) {
	return phone(spec) ? { ...devices['iPhone 15']!, serviceWorkers: 'block' as const } : { viewport: VIEWPORT, hasTouch: spec.mode === 'touch', serviceWorkers: 'block' as const };
}

function hash(text: string): number {
	let h = 2166136261;
	for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
	return h >>> 0;
}

/** One sequence on one side: a fresh visitor loads the route and follows each step's link by `mode`. */
export async function navRun(browser: Browser, name: NetworkBrowser, origin: string, route: string, steps: readonly NavStep[], spec: NavCellSpec): Promise<NavRun> {
	const context = await browser.newContext(contextOptions(spec));
	const watch = stallWatch();
	try {
		await context.addInitScript(instrument);
		const page = await context.newPage();
		if (spec.profile === 'cpu-4x' && name === 'chromium') await (await context.newCDPSession(page)).send('Emulation.setCPUThrottlingRate', { rate: NAV_PROFILES[spec.profile].cpu });
		const log = logRequests(page, origin);
		await page.goto(new URL(route, origin).href, { waitUntil: 'load', timeout: 120_000 });
		await quiet(page, log, 1500, 20_000);
		const targets = await page.evaluate(() => [...document.querySelectorAll<HTMLAnchorElement>('a[href]')].filter((a) => a.origin === location.origin).map((a) => a.pathname + a.search)).then((t) => [...new Set(t.map(targetOf))]);
		const clicks: NavClick[] = [];
		const raw: { step: NavStep; got: { down: number; paint: number; sameDoc: boolean; loaf: [number, number][] } | undefined; pressAt: number; paintAt: number; since: number }[] = [];
		let since = log.all.length;
		for (const step of steps) {
			await park(page, spec.mode);
			const at = await linkPoint(page, step.target);
			if (!at) {
				clicks.push({ target: step.target, kind: step.kind, ahead: 'none', fetched: false, served: false, bytesBefore: 0, bytesAfter: 0, dataAfter: 0, fullLoad: false, error: 'no link to it on the page' });
				continue;
			}
			// A visitor finds the link before pressing it: what its coming into view starts has a moment, as in nav.mjs.
			await page.waitForTimeout(300);
			const before = await page.evaluate(() => {
				sessionStorage.removeItem('__mmNavDown');
				sessionStorage.removeItem('__mmNavPaint');
				const sig = (document.querySelector('h1')?.textContent ?? document.querySelector('main')?.textContent?.slice(0, 200) ?? '').trim();
				const want = { path: location.pathname, sig };
				sessionStorage.setItem('__mmNavWant', JSON.stringify(want));
				sessionStorage.setItem('__mmNavArmed', '1');
				(window as unknown as { __mmNavDoc: number }).__mmNavDoc = 1;
				(window as unknown as { __mmNavWatch: () => void }).__mmNavWatch();
				return want;
			});
			await press(page, context, name, spec.mode, at);
			const read = () => page.evaluate(() => ({ down: Number(sessionStorage.getItem('__mmNavDown') ?? NaN), paint: Number(sessionStorage.getItem('__mmNavPaint') ?? NaN), sameDoc: (window as unknown as { __mmNavDoc?: number }).__mmNavDoc === 1, loaf: (window as unknown as { __mmLoaf: [number, number][] }).__mmLoaf }));
			const until = Date.now() + PAINT_TIMEOUT_MS;
			let got: Awaited<ReturnType<typeof read>> | undefined;
			while (Date.now() < until) {
				got = await read().catch(() => undefined);
				if (got && Number.isFinite(got.paint)) break;
				await page.waitForTimeout(50);
			}
			await page.evaluate(() => sessionStorage.removeItem('__mmNavArmed')).catch(() => {});
			const pressAt = Number.isFinite(got?.down) ? got!.down : Date.now();
			const paintAt = Number.isFinite(got?.paint) ? got!.paint : Date.now();
			for (const r of log.all.slice(since)) if (r.at >= pressAt && r.at <= paintAt) (r as { phase: string }).phase = `click ${step.target}`;
			raw.push({ step, got, pressAt, paintAt, since });
			await quiet(page, log, 500, SETTLE_MS * 4);
			await page.waitForTimeout(SETTLE_MS);
			since = log.all.length;
			if (before.path === new URL(page.url()).pathname) break;
		}
		// Which requests carry a page is learned from the whole run: a first click alone names one target, never a shape.
		const firsts = raw.filter((x) => x.step.kind === 'first').map((x) => ({ phase: `click ${x.step.target}`, target: x.step.target }));
		const shapes = learnShapes(log.all, targets, firsts);
		for (const { step, got, pressAt, paintAt, since: from } of raw) {
			// Since the step before settled, through the scroll to the link and the pointer resting on it, until the press.
			const beforeBytes = log.all.slice(from).filter((r) => r.at < pressAt).reduce((sum, r) => sum + (r.bytes ?? 0), 0);
			const bare = (path: string) => targetOf(path.split('?', 1)[0]!);
			const mine = (r: Logged) => mayCarryPage(r) && (pageOf(r, shapes, [step.target]) === step.target || (r.type === 'document' && bare(r.path) === bare(step.target)));
			const earlier = log.all.filter((r) => r.at < pressAt && mine(r));
			const own = log.all.filter((r) => r.at >= pressAt && r.at <= paintAt && mine(r));
			const after = log.all.filter((r) => r.at >= pressAt && r.at <= paintAt);
			const ahead: NavClick['ahead'] = earlier.some((r) => r.outcome === 'completed' && (r.endAt ?? Infinity) <= pressAt) ? 'arrived' : earlier.some((r) => r.outcome === 'completed' || r.outcome === 'pending') ? 'arriving' : earlier.some((r) => r.outcome === 'cancelled') ? 'cancelled' : 'none';
			const fetched = own.some((r) => (r.bytes ?? 1) > 0);
			const loaf = got?.sameDoc ? got.loaf.filter(([start]) => start >= pressAt - 1 && start <= paintAt).reduce((sum, [, d]) => sum + d, 0) : undefined;
			const timed = Number.isFinite(got?.down) && Number.isFinite(got?.paint);
			clicks.push({
				target: step.target,
				kind: step.kind,
				...(timed ? { ms: Math.round(got!.paint - got!.down) } : {}),
				ahead,
				fetched,
				served: !fetched,
				bytesBefore: beforeBytes,
				bytesAfter: after.reduce((sum, r) => sum + (r.bytes ?? 0), 0),
				dataAfter: own.reduce((sum, r) => sum + (r.bytes ?? 0), 0),
				...(name === 'chromium' && loaf !== undefined ? { mainThreadMs: Math.round(loaf) } : {}),
				fullLoad: got ? !got.sameDoc : false,
				...(!Number.isFinite(got?.down) ? { error: 'the press never reached the page' } : !Number.isFinite(got?.paint) ? { error: `no new content within ${PAINT_TIMEOUT_MS / 1000} s` } : {}),
			});
		}
		const stalledMs = watch.stop();
		return { clicks, ...(stalledMs ? { stalledMs } : {}) };
	} catch (error) {
		watch.stop();
		return { clicks: [], error: (error as Error).message.split('\n')[0]! };
	} finally {
		await context.close().catch(() => {});
	}
}

/** The routes timed: the representatives of the site's `layouts` largest template groups that this run measures, or its first pages when the site has no groups. */
export function navTimedRoutes(groups: readonly { readonly representative: string; readonly members: readonly string[] }[], measured: readonly string[], layouts: number): string[] {
	if (!groups.length) return measured.slice(0, layouts);
	const largest = [...groups].sort((a, b) => b.members.length - a.members.length || (a.representative < b.representative ? -1 : 1)).slice(0, layouts).map((g) => g.representative);
	return measured.filter((r) => largest.includes(r));
}

/** The route's sequence, old and new taken in turn, `runs` a side, in every cell; one unmeasured run a side first warms both servers and their caches. */
export async function measureNavTiming(origins: { readonly old: string; readonly new: string }, route: string, options: NavTimingOptions = {}): Promise<RouteNavTiming> {
	const started = Date.now();
	const runs = Math.max(4, options.runs ?? DEFAULT_NAV_RUNS);
	const specs = options.cells ?? DEFAULT_CELLS;
	const cells: NavCell[] = [];
	const groups = new Map<string, NavCellSpec[]>();
	for (const spec of specs) (groups.get(`${spec.browser} ${spec.profile}`) ?? groups.set(`${spec.browser} ${spec.profile}`, []).get(`${spec.browser} ${spec.profile}`)!).push(spec);
	const chosen = new Map<string, NavStep[]>();
	for (const group of groups.values()) {
		const { browser: name, profile } = group[0]!;
		if (!browserInstalled(name)) {
			for (const spec of group) cells.push({ ...spec, steps: [], old: [], new: [], unavailable: `${name} is not installed` });
			continue;
		}
		const throttle = await startThrottle(NAV_PROFILES[profile].network, options.hosts ? { hosts: options.hosts } : {});
		const browser = await launch(name, throttle);
		try {
			const stepsOf = async (spec: NavCellSpec): Promise<NavStep[]> => {
				const device = phone(spec) ? 'phone' : 'desktop';
				let steps = chosen.get(device);
				if (!steps) {
					const context = await browser.newContext(contextOptions(spec));
					const page = await context.newPage();
					await page.goto(new URL(route, origins.old).href, { waitUntil: 'load', timeout: 120_000 });
					steps = await chooseSteps(page, route, device === 'phone' ? ['nav', 'header', 'main'] : ['aside', 'nav', 'header']);
					await context.close();
					chosen.set(device, steps);
				}
				return steps;
			};
			// Unmeasured: wakes both servers and fills their caches, so a fresh deploy is not compared cold against a warm one.
			const first = await stepsOf(group[0]!);
			if (first.length) {
				await navRun(browser, name, origins.old, route, first, group[0]!);
				await navRun(browser, name, origins.new, route, first, group[0]!);
			}
			for (const spec of group) {
				const steps = await stepsOf(spec);
				if (!steps.length) {
					cells.push({ ...spec, steps, old: [], new: [], unavailable: 'no shared navigation with two links to follow on this page at this width' });
					continue;
				}
				const old: NavRun[] = [];
				const next: NavRun[] = [];
				for (let i = 0; i < runs; i++) {
					old.push(await navRun(browser, name, origins.old, route, steps, spec));
					next.push(await navRun(browser, name, origins.new, route, steps, spec));
				}
				cells.push({ ...spec, steps, old, new: next });
			}
		} finally {
			await browser.close().catch(() => {});
			await throttle.close();
		}
	}
	return { route, cells, ms: Date.now() - started };
}

