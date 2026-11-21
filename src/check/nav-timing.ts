// In-page navigation timing, original against port: from the press on a link to the next page's content painted, per
// browser, network and pointer behaviour, first visits and revisits, with what was fetched before and after the press.
import { chromium, devices, firefox, webkit, type Browser, type BrowserContext, type BrowserType, type Page, type Request } from 'playwright';
import { closedOnExit } from './close-on-exit.ts';
import { browserInstalled, stallWatch, type NetworkBrowser } from './slow-network.ts';
import { NETWORK_PROFILES, startThrottle, type NetworkProfile, type Throttle } from './throttle.ts';
import { learnShapes, mayCarryPage, pageOf, targetOf, type PrefetchRequest } from '../prefetch/facts.ts';
import { linkTo } from '../prefetch/record.ts';
import { DESTRUCTIVE } from './destructive.ts';

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

/** Every cell: Chromium every way on every network; Firefox and WebKit where their pointer and network can be emulated, WebKit on an iPhone for touch. A deliberate deep run (`--nav-timing-cells full`), about four times the default's cost. */
export const FULL_CELLS: readonly NavCellSpec[] = [
	...(['fast', 'slow-4g'] as const).flatMap((profile) => PRESS_MODES.map((mode) => ({ browser: 'chromium' as const, profile, mode }))),
	...(['instant', 'dwell-250', 'touch'] as const).map((mode) => ({ browser: 'chromium' as const, profile: 'cpu-4x' as const, mode })),
	...(['fast', 'slow-4g'] as const).flatMap((profile) => (['instant', 'dwell-250'] as const).map((mode) => ({ browser: 'firefox' as const, profile, mode }))),
	...(['fast', 'slow-4g'] as const).flatMap((profile) => (['dwell-250', 'touch'] as const).map((mode) => ({ browser: 'webkit' as const, profile, mode }))),
];
/**
 * Runs a side per cell. Runs are compared by their medians, and the check's 5% is shared by the routes it times and then
 * by each route's rows (nav-timing-verdicts.ts): fewer than 7 runs a side can never tell a row apart. In a simulation
 * with run-to-run machine noise shared by a run's presses and 3 timed routes, 8 runs with the default cells went red on
 * identical sites in 2.5 to 3.9% of checks and caught 100 ms added to one cell on 96 to 97% of routes (every cell: 2.5 to
 * 3.5%, 88 to 91%); see `test/nav-timing-verdicts.test.ts`.
 */
export const DEFAULT_NAV_RUNS = 8;

/**
 * What every check runs: does it feel as fast as the original. A hand resting 250 ms in Chromium on a fast line and on
 * slow 4G, the instant press on a fast line, a finger on an iPhone (WebKit) on both, and Firefox resting on a fast line.
 */
export const DEFAULT_CELLS: readonly NavCellSpec[] = [
	{ browser: 'chromium', profile: 'fast', mode: 'dwell-250' },
	{ browser: 'chromium', profile: 'slow-4g', mode: 'dwell-250' },
	{ browser: 'chromium', profile: 'fast', mode: 'instant' },
	{ browser: 'webkit', profile: 'fast', mode: 'touch' },
	{ browser: 'webkit', profile: 'slow-4g', mode: 'touch' },
	{ browser: 'firefox', profile: 'fast', mode: 'dwell-250' },
];
export type NavCellSet = 'default' | 'full' | 'named';
/** The most runs a side: the noise band splits the original's runs every way into halves, C(16, 8) = 12,870 splits at most. */
export const MAX_NAV_RUNS = 16;
/** A route's navigation timing stops here and reports what it has: cells not reached are not checked, never green. */
export const NAV_DEADLINE_MS = 3 * 60 * 60_000;
/** A cell stops early once the port has shown no next page in this many runs: its row is red whatever the rest would do. */
const GIVE_UP_RUNS = 2;
/** A run during which this process stalled this long is taken again, at most twice. */
const STALL_LIMIT_MS = 1000;
/** Measured on ui.shadcn.com (original against candidate 11 on Cloudflare, Mac mini): 43 min a layout with the default cells and 8 runs, so 3 layouts is about 2.2 runner-hours a check. */
export const DEFAULT_NAV_LAYOUTS = 3;
/** The fixed amount of navigation timing the check budget (scripts/check-budget.ts) measures on its page: one cell, the fewest runs that can go red. */
export const BUDGET_NAV_WORK = ['--nav-timing-cell', 'chromium/fast/dwell-250', '--nav-timing-runs', '7'] as const;

/** A `--nav-timing-cell` value, `<browser>/<profile>/<press>`, or why it is not one. */
export function parseNavCell(text: string): NavCellSpec | string {
	const [browser, profile, mode] = text.split('/');
	if (!['chromium', 'firefox', 'webkit'].includes(browser ?? '')) return `${text}: the browser is chromium, firefox or webkit`;
	if (!(profile && profile in NAV_PROFILES)) return `${text}: the network is ${Object.keys(NAV_PROFILES).join(', ')}`;
	if (!(PRESS_MODES as readonly string[]).includes(mode ?? '')) return `${text}: the press is ${PRESS_MODES.join(', ')}`;
	if (profile === 'cpu-4x' && browser !== 'chromium') return `${text}: only Chromium can slow its CPU`;
	return { browser: browser as NetworkBrowser, profile: profile as NavProfile, mode: mode as PressMode };
}
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
	/** Page data (requests matched to a link's page, and documents) fetched since the previous step settled, before the press; and every same-origin byte from the press to the paint. */
	readonly bytesBefore: number;
	readonly bytesAfter: number;
	/** Of `bytesAfter`, the target's data. */
	readonly dataAfter: number;
	/** Long animation frames between the press and the paint (Chromium). */
	readonly mainThreadMs?: number;
	/** A new document was loaded. */
	readonly fullLoad: boolean;
	/** Hosts other than the app's own the press fetched from before the paint: not matched to a page on either side. */
	readonly otherHosts?: readonly string[];
	/** The router marked the page shown as having spent its budget for fetching ahead before the press. */
	readonly budgetSpent?: true;
	/** The router marked fetching ahead as ruled out on the page shown, and why (`save-data`, `hidden`, `network`). */
	readonly ruledOut?: string;
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
	/** Not measured, and nothing to hold against the port: a browser not installed, no shared navigation at this width. */
	readonly unavailable?: string;
	/** Not measured where it should have been (out of time, the machine stalled through every retake): the route is never green. */
	readonly notChecked?: string;
}

export interface RouteNavTiming {
	readonly route: string;
	/** The router's prefetch mark names read; absent when the installed router names none, so budget and ruled-out causes cannot be told. */
	readonly marks?: readonly string[];
	/** Which cells ran: the default six, every cell, or ones named with --nav-timing-cell. */
	readonly set?: NavCellSet;
	/** How many routes the check times: each shares the check's significance (nav-timing-verdicts.ts). */
	readonly layouts?: number;
	readonly cells: readonly NavCell[];
	readonly ms: number;
}

export interface NavTimingOptions {
	readonly cells?: readonly NavCellSpec[];
	/** Every cell instead of the default six (ignored when `cells` names some). */
	readonly full?: boolean;
	/** Runs a side in each cell, old and new taken in turn; at least 4, so the old runs can be split to measure their own noise. */
	readonly runs?: number;
	/** At most this many routes (one per layout) are timed. */
	readonly layouts?: number;
	/** Host names the proxy connects elsewhere (tests). */
	readonly hosts?: Readonly<Record<string, string>>;
	/** Defaults to `NAV_DEADLINE_MS`. */
	readonly deadlineMs?: number;
	/** The router's prefetch mark names; defaults to `PREFETCH_MARKS` from the installed `@markless/router/vite`. */
	readonly marks?: readonly string[];
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
function instrument(markNames: readonly string[]): void {
	const S = sessionStorage;
	// The router's own marks for the page shown: its budget spent ({ page, bytes }), or guessing ruled out ({ page, reason }).
	const marks: { page: string; bytes?: number; reason?: string }[] = [];
	(window as unknown as { __mmMarks: typeof marks }).__mmMarks = marks;
	try {
		new PerformanceObserver((list) => {
			for (const e of list.getEntries()) {
				const detail = (e as PerformanceMark).detail as { page?: unknown; bytes?: unknown; reason?: unknown } | null;
				if (!markNames.includes(e.name) || typeof detail?.page !== 'string') continue;
				marks.push({ page: detail.page, ...(typeof detail.bytes === 'number' ? { bytes: detail.bytes } : {}), ...(typeof detail.reason === 'string' ? { reason: detail.reason } : {}) });
			}
		}).observe({ type: 'mark', buffered: true });
	} catch {}
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
	// The page's own content: its main landmark, else the body without the header, navigation, sidebar and footer every
	// page shares. The same reading on both sides, whatever the heading says.
	const signature = () => {
		const main = document.querySelector('main, [role="main"]');
		if (main) return (main.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 4000);
		const out: string[] = [];
		const walk = (el: Element) => {
			for (const child of el.children) {
				if (child.matches('header, nav, aside, footer, script, style, template, [role="banner"], [role="navigation"], [role="complementary"], [role="contentinfo"]')) continue;
				if (!child.children.length) out.push(child.textContent ?? '');
				else walk(child);
			}
		};
		if (document.body) walk(document.body);
		return out.join(' ').replace(/\s+/g, ' ').trim().slice(0, 4000);
	};
	(window as unknown as { __mmNavSig: () => string }).__mmNavSig = signature;
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
	/** Another origin's host: what it answered is not matched to a page. */
	readonly host?: string;
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
		const entry = { path: url.pathname + url.search, type: r.resourceType(), phase: '', start: 0, outcome: 'pending' as PrefetchRequest['outcome'], at: Date.now(), ...(url.origin !== origin ? { host: url.host } : {}) };
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
		if (outcome !== 'completed' || entry.host) return;
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

async function linkPoint(page: Page, target: string): Promise<{ x: number; y: number } | undefined> {
	const link = await linkTo(page, target, true);
	if (!link) return undefined;
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

/** The same-origin links of one navigation region on the page, by their resolved address, that a press could follow. */
async function regionLinks(page: Page, region: string): Promise<string[]> {
	const links = await page
		.evaluate(() => {
			const regionOf = (el: Element): string => {
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
				.map((a) => ({ target: a.pathname + a.search, region: regionOf(a), text: (a.textContent ?? '').trim() }));
		})
		.catch(() => []);
	return [...new Set(links.filter((l) => l.region === region && !DESTRUCTIVE.test(`${l.target} ${l.text}`)).map((l) => targetOf(l.target)))];
}

/** Presses the link as the cell's device does and waits for the address to become its target. */
async function walkTo(page: Page, spec: NavCellSpec, target: string): Promise<boolean> {
	const at = await linkPoint(page, target);
	if (!at) return false;
	if (phone(spec)) await page.touchscreen.tap(at.x, at.y);
	else await page.mouse.click(at.x, at.y);
	const bare = targetOf(target.split('?', 1)[0]!);
	return page
		.waitForURL((u) => targetOf(u.pathname) === bare, { timeout: 15_000 })
		.then(() => page.waitForLoadState('load').catch(() => {}))
		.then(() => true, () => false);
}

/**
 * The links a sequence follows, found by walking them on the old app as the cell's device would: for each shared
 * navigation (sidebar, nav, header; at phone width a nav, the header and the content), a link A on the page the walk is
 * on, a link B on A's page in the same region, and a link back to A on B's page. Only a walk the old app completes is
 * kept, so every step can be pressed there; the next region starts from A.
 */
export async function chooseSteps(browser: Browser, origin: string, route: string, spec: NavCellSpec): Promise<NavStep[]> {
	const regions = phone(spec) ? ['nav', 'header', 'main'] : ['aside', 'nav', 'header'];
	const context = await browser.newContext(contextOptions(spec));
	const steps: NavStep[] = [];
	try {
		const page = await context.newPage();
		let here = route;
		const goHere = () => page.goto(new URL(here, origin).href, { waitUntil: 'load', timeout: 120_000 });
		await goHere();
		const order = (list: string[], salt: string) => list.sort((a, b) => (hash(salt + a) < hash(salt + b) ? -1 : 1));
		for (const region of regions) {
			if (steps.length >= 6) break;
			const used = new Set([targetOf(here), ...steps.map((s) => s.target)]);
			let found = false;
			for (const a of order((await regionLinks(page, region)).filter((t) => !used.has(t)), route + region).slice(0, 4)) {
				if (!(await walkTo(page, spec, a))) {
					await goHere();
					continue;
				}
				for (const b of order((await regionLinks(page, region)).filter((t) => !used.has(t) && t !== a), route + a).slice(0, 4)) {
					if (!(await walkTo(page, spec, b))) break;
					if (await walkTo(page, spec, a)) {
						steps.push({ target: a, region, kind: 'first' }, { target: b, region, kind: 'first' }, { target: a, region, kind: 'revisit' });
						here = a;
						found = true;
						break;
					}
					await page.goto(new URL(a, origin).href, { waitUntil: 'load', timeout: 120_000 });
				}
				if (found) break;
				await goHere();
			}
		}
	} finally {
		await context.close().catch(() => {});
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
export async function navRun(browser: Browser, name: NetworkBrowser, origin: string, route: string, steps: readonly NavStep[], spec: NavCellSpec, markNames: readonly string[] = []): Promise<NavRun> {
	const context = await browser.newContext(contextOptions(spec));
	const watch = stallWatch();
	try {
		await context.addInitScript(instrument, [...markNames]);
		const page = await context.newPage();
		if (spec.profile === 'cpu-4x' && name === 'chromium') await (await context.newCDPSession(page)).send('Emulation.setCPUThrottlingRate', { rate: NAV_PROFILES[spec.profile].cpu });
		const log = logRequests(page, origin);
		await page.goto(new URL(route, origin).href, { waitUntil: 'load', timeout: 120_000 });
		await quiet(page, log, 1500, 20_000);
		const targets = await page.evaluate(() => [...document.querySelectorAll<HTMLAnchorElement>('a[href]')].filter((a) => a.origin === location.origin).map((a) => a.pathname + a.search)).then((t) => [...new Set(t.map(targetOf))]);
		const clicks: NavClick[] = [];
		const notMade: NavClick[] = [];
		const raw: { step: NavStep; got: { down: number; paint: number; sameDoc: boolean; loaf: [number, number][]; path: string; sig: string } | undefined; pressAt: number; paintAt: number; since: number; spent: boolean; ruledOut?: string; why?: string }[] = [];
		let since = log.all.length;
		for (const step of steps) {
			await park(page, spec.mode);
			const at = await linkPoint(page, step.target);
			if (!at) {
				clicks.push({ target: step.target, kind: step.kind, ahead: 'none', fetched: false, served: false, bytesBefore: 0, bytesAfter: 0, dataAfter: 0, fullLoad: false, error: `no link to ${step.target} on ${new URL(page.url()).pathname}` });
				continue;
			}
			// A visitor finds the link before pressing it: what its coming into view starts has a moment, as in nav.mjs.
			await page.waitForTimeout(300);
			const before = await page.evaluate(() => {
				sessionStorage.removeItem('__mmNavDown');
				sessionStorage.removeItem('__mmNavPaint');
				const sig = (window as unknown as { __mmNavSig: () => string }).__mmNavSig();
				const want = { path: location.pathname, sig };
				sessionStorage.setItem('__mmNavWant', JSON.stringify(want));
				sessionStorage.setItem('__mmNavArmed', '1');
				(window as unknown as { __mmNavDoc: number }).__mmNavDoc = 1;
				(window as unknown as { __mmNavWatch: () => void }).__mmNavWatch();
				const shown = (window as unknown as { __mmMarks?: { page: string; bytes?: number; reason?: string }[] }).__mmMarks?.filter((m) => m.page === location.pathname) ?? [];
				return { ...want, spent: shown.some((m) => m.bytes !== undefined), ruledOut: shown.find((m) => m.reason !== undefined)?.reason };
			});
			await press(page, context, name, spec.mode, at);
			const read = () => page.evaluate(() => ({ down: Number(sessionStorage.getItem('__mmNavDown') ?? NaN), paint: Number(sessionStorage.getItem('__mmNavPaint') ?? NaN), sameDoc: (window as unknown as { __mmNavDoc?: number }).__mmNavDoc === 1, loaf: (window as unknown as { __mmLoaf: [number, number][] }).__mmLoaf, path: location.pathname, sig: (window as unknown as { __mmNavSig?: () => string }).__mmNavSig?.() ?? '' }));
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
			// When the next page never showed, say which half of the evidence was missing: the address, or the content.
			const why = !got || !Number.isFinite(got.down) ? 'the press never reached the page' : Number.isFinite(got.paint) ? undefined : got.path === before.path ? `the address stayed ${before.path} for ${PAINT_TIMEOUT_MS / 1000} s` : got.sig === before.sig ? `the address changed to ${got.path} but the page's content did not, in ${PAINT_TIMEOUT_MS / 1000} s` : `no new content painted within ${PAINT_TIMEOUT_MS / 1000} s`;
			raw.push({ step, got, pressAt, paintAt, since, spent: before.spent, ...(before.ruledOut ? { ruledOut: before.ruledOut } : {}), ...(why ? { why } : {}) });
			await quiet(page, log, 500, SETTLE_MS * 4);
			await page.waitForTimeout(SETTLE_MS);
			since = log.all.length;
			// Off the path the steps assume: the rest cannot be pressed as planned, and each counts as not made.
			if (why) {
				for (const rest of steps.slice(steps.indexOf(step) + 1)) notMade.push({ target: rest.target, kind: rest.kind, ahead: 'none', fetched: false, served: false, bytesBefore: 0, bytesAfter: 0, dataAfter: 0, fullLoad: false, error: `not made: the press on ${step.target} before it did not arrive` });
				break;
			}
		}
		// Which requests carry a page is learned from the whole run: a first click alone names one target, never a shape.
		const firsts = raw.filter((x) => x.step.kind === 'first').map((x) => ({ phase: `click ${x.step.target}`, target: x.step.target }));
		const own = log.all.filter((r) => !r.host);
		const shapes = learnShapes(own, targets, firsts);
		const pageData = (r: Logged) => mayCarryPage(r) && (pageOf(r, shapes, targets) !== undefined || r.type === 'document');
		for (const { step, got, pressAt, paintAt, since: from, why, spent, ruledOut } of raw) {
			// Page data fetched since the step before settled, through the scroll to the link and the pointer resting on it, until the press.
			const beforeBytes = log.all.slice(from).filter((r) => !r.host && r.at < pressAt && pageData(r)).reduce((sum, r) => sum + (r.bytes ?? 0), 0);
			const bare = (path: string) => targetOf(path.split('?', 1)[0]!);
			const mine = (r: Logged) => mayCarryPage(r) && (pageOf(r, shapes, [step.target]) === step.target || (r.type === 'document' && bare(r.path) === bare(step.target)));
			const earlier = own.filter((r) => r.at < pressAt && mine(r));
			const fetchedNow = own.filter((r) => r.at >= pressAt && r.at <= paintAt && mine(r));
			const after = own.filter((r) => r.at >= pressAt && r.at <= paintAt);
			const otherHosts = [...new Set(log.all.filter((r) => r.host && r.at >= pressAt && r.at <= paintAt && mayCarryPage(r)).map((r) => r.host!))].sort();
			const ahead: NavClick['ahead'] = earlier.some((r) => r.outcome === 'completed' && (r.endAt ?? Infinity) <= pressAt) ? 'arrived' : earlier.some((r) => r.outcome === 'completed' || r.outcome === 'pending') ? 'arriving' : earlier.some((r) => r.outcome === 'cancelled') ? 'cancelled' : 'none';
			const fetched = fetchedNow.some((r) => (r.bytes ?? 1) > 0);
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
				dataAfter: fetchedNow.reduce((sum, r) => sum + (r.bytes ?? 0), 0),
				...(name === 'chromium' && loaf !== undefined ? { mainThreadMs: Math.round(loaf) } : {}),
				fullLoad: got ? !got.sameDoc : false,
				...(otherHosts.length ? { otherHosts } : {}),
				...(spent ? { budgetSpent: true } : {}),
				...(ruledOut ? { ruledOut } : {}),
				...(why ? { error: why } : {}),
			});
		}
		clicks.push(...notMade);
		const stalledMs = watch.stop();
		return { clicks, ...(stalledMs ? { stalledMs } : {}) };
	} catch (error) {
		watch.stop();
		return { clicks: [], error: (error as Error).message.split('\n')[0]! };
	} finally {
		await context.close().catch(() => {});
	}
}

/** `PREFETCH_MARKS` from the installed `@markless/router/vite`, or undefined for a router that names none. */
export async function routerMarkNames(load: () => Promise<unknown> = () => import('@markless/router/vite')): Promise<readonly string[] | undefined> {
	const loaded: unknown = await load().catch(() => undefined);
	const names = typeof loaded === 'object' && loaded !== null && 'PREFETCH_MARKS' in loaded ? loaded.PREFETCH_MARKS : undefined;
	return Array.isArray(names) && names.every((n) => typeof n === 'string') ? names : undefined;
}

/** The routes timed: the representatives of the site's `layouts` largest template groups that this run measures, or its first pages when the site has no groups. */
export function navTimedRoutes(groups: readonly { readonly representative: string; readonly members: readonly string[] }[], measured: readonly string[], layouts: number): string[] {
	if (!groups.length) return measured.slice(0, layouts);
	const largest = [...groups].sort((a, b) => b.members.length - a.members.length || (a.representative < b.representative ? -1 : 1)).slice(0, layouts).map((g) => g.representative);
	return measured.filter((r) => largest.includes(r));
}

/**
 * The route's sequence, old and new taken in turn, `runs` a side, in every cell; one unmeasured run a side first warms
 * both servers and their caches. A run the machine stalled in is taken again (twice at most). The whole route stops at
 * its deadline with what it has: cells not reached are not checked. A cell whose port shows no next page in its first
 * runs stops there, red already.
 */
export async function measureNavTiming(origins: { readonly old: string; readonly new: string }, route: string, options: NavTimingOptions = {}): Promise<RouteNavTiming> {
	const started = Date.now();
	const marks = options.marks ?? (await routerMarkNames());
	const deadline = started + (options.deadlineMs ?? NAV_DEADLINE_MS);
	const runs = Math.min(MAX_NAV_RUNS, Math.max(4, options.runs ?? DEFAULT_NAV_RUNS));
	const specs = options.cells ?? (options.full ? FULL_CELLS : DEFAULT_CELLS);
	const set: NavCellSet = options.cells ? 'named' : options.full ? 'full' : 'default';
	const cells: NavCell[] = [];
	const groups = new Map<string, NavCellSpec[]>();
	for (const spec of specs) (groups.get(`${spec.browser} ${spec.profile}`) ?? groups.set(`${spec.browser} ${spec.profile}`, []).get(`${spec.browser} ${spec.profile}`)!).push(spec);
	const chosen = new Map<string, NavStep[]>();
	const late = () => Date.now() > deadline;
	const outOfTime = (spec: NavCellSpec, steps: readonly NavStep[] = []) => cells.push({ ...spec, steps, old: [], new: [], unavailable: 'ran out of time', notChecked: `the route's navigation timing passed its ${Math.round((options.deadlineMs ?? NAV_DEADLINE_MS) / 60_000)} min deadline before this cell` });
	for (const group of groups.values()) {
		const { browser: name, profile } = group[0]!;
		if (!browserInstalled(name)) {
			for (const spec of group) cells.push({ ...spec, steps: [], old: [], new: [], unavailable: `${name} is not installed` });
			continue;
		}
		if (late()) {
			for (const spec of group) outOfTime(spec);
			continue;
		}
		const throttle = await startThrottle(NAV_PROFILES[profile].network, options.hosts ? { hosts: options.hosts } : {});
		const browser = await launch(name, throttle);
		try {
			const stepsOf = async (spec: NavCellSpec): Promise<NavStep[]> => {
				const device = phone(spec) ? 'phone' : 'desktop';
				let steps = chosen.get(device);
				if (!steps) {
					steps = await chooseSteps(browser, origins.old, route, spec);
					chosen.set(device, steps);
				}
				return steps;
			};
			const steady = async (origin: string, steps: readonly NavStep[], spec: NavCellSpec): Promise<NavRun> => {
				let run = await navRun(browser, name, origin, route, steps, spec, marks ?? []);
				for (let retake = 0; retake < 2 && (run.stalledMs ?? 0) >= STALL_LIMIT_MS; retake++) run = await navRun(browser, name, origin, route, steps, spec, marks ?? []);
				return run;
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
				if (late()) {
					outOfTime(spec, steps);
					continue;
				}
				const old: NavRun[] = [];
				const next: NavRun[] = [];
				const nothing = (r: NavRun) => Boolean(r.error) || r.clicks.every((c) => c.error);
				let stalled: string | undefined;
				for (let i = 0; i < runs && !late(); i++) {
					old.push(await steady(origins.old, steps, spec));
					next.push(await steady(origins.new, steps, spec));
					if (next.length >= GIVE_UP_RUNS && (next.every(nothing) || old.every(nothing))) break;
				}
				const still = [...old, ...next].find((r) => (r.stalledMs ?? 0) >= STALL_LIMIT_MS);
				if (still) stalled = `the machine stalled the measurement for ${still.stalledMs} ms in a run taken three times`;
				// Stopped early because one side showed nothing: the port's row is red, the original's not checked, both by their runs.
				const gaveUp = next.length < runs && (next.every(nothing) || old.every(nothing));
				const cut = !gaveUp && next.length < runs;
				cells.push({ ...spec, steps, old, new: next, ...(cut ? { notChecked: `the route's navigation timing passed its deadline after ${next.length} of ${runs} runs` } : stalled ? { notChecked: stalled } : {}) });
			}
		} finally {
			await browser.close().catch(() => {});
			await throttle.close();
		}
	}
	return { route, set, cells, ms: Date.now() - started, ...(options.layouts ? { layouts: options.layouts } : {}), ...(marks ? { marks } : {}) };
}
