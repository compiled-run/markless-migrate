// Records how the original fetches pages ahead of a click, by experiment on one of its pages: what it fetches at load,
// as each link scrolls into view, on hover, on focus and on a press that is not a click, whether a click and a revisit
// fetch again, and on a template group's first page whether each of those still happens under other network conditions.
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium, type Browser, type BrowserContext, type Page, type Request } from 'playwright';
import { closedOnExit } from '../check/close-on-exit.ts';
import { NETWORK_PROFILES, startThrottle } from '../check/throttle.ts';
import { CONDITIONS, learnShapes, maxInFlight, median, mayCarryPage, pageOf, shapeOf, targetOf, type Condition, type ConditionResult, type PrefetchFacts, type PrefetchLink, type PrefetchRequest, type Trigger, type TriggerEvidence } from './facts.ts';

const VIEWPORT = { width: 1280, height: 800 };
const QUIET_MS = 800;
const QUIET_MAX_MS = 10_000;
/** How long after an action its fetches may start and still be its own. */
const SETTLE_MS = 500;
/** Links probed per trigger: a template group's first page, every other page. */
const PROBES = { full: { viewport: 4, intent: 2 }, light: { viewport: 2, intent: 1 } } as const;
/** The page left is come back to after about this long: inside every client cache's lifetime we know of (Next's 30 s, Markless's ttl). */
export const REVISIT_AFTER_MS = 2000;

export interface RecordOptions {
	/** A template group's first page: more links probed, the clicks and the revisit, and the core experiments again under every network condition. */
	readonly full?: boolean;
	/** The conditions a full recording repeats the experiments under: every one unless named. */
	readonly conditions?: readonly Condition[];
	/** The old page's key (key.ts): a recording made from another page is recorded again. */
	readonly page?: string;
	readonly headers?: Readonly<Record<string, string>>;
}

interface Log {
	readonly requests: Map<Request, { -readonly [K in keyof PrefetchRequest]: PrefetchRequest[K] }>;
	phase: string;
	readonly t0: number;
	inFlight: number;
	lastActivity: number;
}

const DESTRUCTIVE = /\b(log ?out|sign ?out|delete|remove|destroy|unsubscribe|deactivate|close (my|your) account)\b/i;
const CANCELLED = /ERR_ABORTED|NS_BINDING_ABORTED|cancelled|canceled/i;

function watch(page: Page, origin: string): Log {
	const log: Log = { requests: new Map(), phase: 'load', t0: Date.now(), inFlight: 0, lastActivity: Date.now() };
	const own = (r: Request) => {
		try {
			return new URL(r.url()).origin === origin;
		} catch {
			return false;
		}
	};
	page.on('request', (r) => {
		if (!own(r)) return;
		const url = new URL(r.url());
		const headers = r.headers();
		const purpose = headers['sec-purpose'] ?? headers['purpose'];
		// A new document unloads the old one: what the old one still had open will never finish.
		if (!purpose && r.isNavigationRequest() && r.frame() === page.mainFrame())
			for (const [other, entry] of log.requests)
				if (entry.outcome === 'pending' && other !== r && other.frame() === page.mainFrame()) {
					entry.outcome = 'cancelled';
					entry.end = Date.now() - log.t0;
					log.inFlight--;
				}
		log.inFlight++;
		log.lastActivity = Date.now();
		log.requests.set(r, { path: url.pathname + url.search, type: r.resourceType(), ...(purpose ? { purpose } : {}), phase: log.phase, start: Date.now() - log.t0, outcome: 'pending' });
	});
	const settle = async (r: Request, outcome: PrefetchRequest['outcome']) => {
		const entry = log.requests.get(r);
		if (!entry || entry.outcome !== 'pending') return;
		entry.outcome = outcome;
		entry.end = Date.now() - log.t0;
		log.inFlight--;
		log.lastActivity = Date.now();
		if (outcome !== 'completed') return;
		entry.status = (await r.response().catch(() => null))?.status();
		const sizes = await r.sizes().catch(() => undefined);
		if (sizes) entry.bytes = sizes.responseBodySize + sizes.responseHeadersSize;
	};
	page.on('requestfinished', (r) => void settle(r, 'completed'));
	page.on('requestfailed', (r) => void settle(r, CANCELLED.test(r.failure()?.errorText ?? '') ? 'cancelled' : 'failed'));
	return log;
}

async function quiet(page: Page, log: Log, minMs = QUIET_MS): Promise<void> {
	const until = Date.now() + QUIET_MAX_MS;
	const started = Date.now();
	while (Date.now() < until) {
		if (log.inFlight <= 0 && Date.now() - log.lastActivity >= minMs && Date.now() - started >= minMs) return;
		await page.waitForTimeout(100);
	}
}

/** Same-origin links in the page, each with its landmark and whether it is on screen. */
function readLinks(): { target: string; region: string; visible: boolean; text: string }[] {
	const out: { target: string; region: string; visible: boolean; text: string }[] = [];
	const landmark = (el: Element): string => {
		for (let at: Element | null = el; at; at = at.parentElement) {
			const tag = at.tagName.toLowerCase();
			const role = at.getAttribute('role');
			if (tag === 'header' || role === 'banner') return 'header';
			if (tag === 'aside' || role === 'complementary' || at.getAttribute('data-slot') === 'sidebar') return 'aside';
			if (tag === 'nav' || role === 'navigation') return 'nav';
			if (tag === 'main' || role === 'main') return 'main';
			if (tag === 'footer' || role === 'contentinfo') return 'footer';
		}
		return 'body';
	};
	for (const a of document.querySelectorAll<HTMLAnchorElement>('a[href]')) {
		if (a.origin !== location.origin || a.hasAttribute('download') || (a.target && a.target !== '_self')) continue;
		if (a.pathname === location.pathname && a.search === location.search) continue;
		const box = a.getBoundingClientRect();
		const shown = box.width > 0 && box.height > 0 && (a.checkVisibility?.({ visibilityProperty: true, opacityProperty: true }) ?? true);
		const visible = shown && box.bottom > 0 && box.right > 0 && box.top < innerHeight && box.left < innerWidth;
		out.push({ target: a.pathname + a.search, region: landmark(a), visible, text: (a.textContent ?? '').trim().slice(0, 80) });
	}
	return out;
}

function readHints(): { links: { rel: string; href: string }[]; speculationRules: unknown[] } {
	const links = [...document.querySelectorAll<HTMLLinkElement>('link[rel]')].filter((l) => l.relList.contains('prefetch') || l.relList.contains('prerender') || l.relList.contains('modulepreload')).map((l) => ({ rel: l.rel, href: new URL(l.href, document.baseURI).pathname }));
	const speculationRules: unknown[] = [];
	for (const s of document.querySelectorAll('script[type="speculationrules"]')) {
		try {
			speculationRules.push(JSON.parse(s.textContent ?? ''));
		} catch {
			speculationRules.push({ unreadable: true });
		}
	}
	return { links, speculationRules };
}

/** Resource Timing: paths whose answer moved no byte (the browser's cache), for requests the page itself made. */
async function cachedPaths(page: Page): Promise<Set<string>> {
	const paths = await page.evaluate(() => (performance.getEntriesByType('resource') as PerformanceResourceTiming[]).filter((e) => e.transferSize === 0 && e.decodedBodySize > 0).map((e) => new URL(e.name).pathname + new URL(e.name).search)).catch((): string[] => []);
	return new Set(paths);
}

function linkSelector(target: string): string {
	return `a[href="${target.replace(/["\\]/g, '\\$&')}"], a[href="${target.replace(/["\\]/g, '\\$&')}/"]`;
}

function hashOf(text: string): string {
	return createHash('sha256').update(text).digest('hex');
}

/** Distinct targets, in an order that does not depend on the page's markup order. */
function sample<T extends { target: string }>(items: readonly T[], n: number, salt: string): T[] {
	const seen = new Set<string>();
	return [...items].sort((a, b) => (hashOf(salt + a.target) < hashOf(salt + b.target) ? -1 : 1)).filter((x) => !seen.has(x.target) && Boolean(seen.add(x.target))).slice(0, n);
}

/** A point on the page that is no link, for the pointer to leave to. */
async function parkPointer(page: Page): Promise<void> {
	const spot = await page.evaluate(() => {
		for (let y = innerHeight - 4; y > 4; y -= 40)
			for (const x of [innerWidth - 4, innerWidth >> 1, 4]) {
				const el = document.elementFromPoint(x, y);
				if (el && !el.closest('a, button, [role], input, select, textarea, label')) return { x, y };
			}
		return { x: innerWidth - 4, y: innerHeight - 4 };
	});
	await page.mouse.move(spot.x, spot.y);
}

async function newContext(browser: Browser, condition: Condition | undefined, headers: Readonly<Record<string, string>> = {}): Promise<BrowserContext> {
	const saveData = condition === 'save-data';
	const context = await browser.newContext({ viewport: VIEWPORT, serviceWorkers: 'block', extraHTTPHeaders: { ...headers, ...(saveData ? { 'Save-Data': 'on' } : {}) } });
	const info: Record<string, { effectiveType: string; rtt: number; downlink: number; saveData: boolean } | null> = {
		'no-info': null,
		'4g': { effectiveType: '4g', rtt: 50, downlink: 10, saveData: false },
		'3g': { effectiveType: '3g', rtt: 300, downlink: 0.7, saveData: false },
		'2g': { effectiveType: '2g', rtt: 1500, downlink: 0.25, saveData: false },
		'slow-2g': { effectiveType: 'slow-2g', rtt: 2100, downlink: 0.05, saveData: false },
		'save-data': { effectiveType: '4g', rtt: 50, downlink: 10, saveData: true },
	};
	if (condition && condition !== 'slow-link')
		await context.addInitScript((c) => {
			const value = c ? Object.assign(new EventTarget(), c, { onchange: null }) : undefined;
			Object.defineProperty(Navigator.prototype, 'connection', { get: () => value, configurable: true });
		}, info[condition] ?? null);
	return context;
}

interface Run {
	readonly page: Page;
	readonly log: Log;
	readonly links: PrefetchLink[];
	readonly close: () => Promise<void>;
}

async function open(browser: Browser, origin: string, route: string, condition: Condition | undefined, headers?: Readonly<Record<string, string>>): Promise<Run> {
	const context = await newContext(browser, condition, headers);
	const page = await context.newPage();
	const log = watch(page, origin);
	await page.goto(new URL(route, origin).href, { waitUntil: 'load', timeout: 60_000 });
	await quiet(page, log, 1500);
	// A link that ends the session or deletes is never followed, pressed or hovered: the same words the journeys hold back.
	const links = (await page.evaluate(readLinks)).filter((l) => !DESTRUCTIVE.test(`${l.target} ${l.text}`)).map((l) => ({ target: targetOf(l.target), region: l.region, visibleAtLoad: l.visible }));
	return { page, log, links, close: () => context.close().catch(() => {}) };
}

/** Scrolls the link into view without moving the pointer. */
async function reveal(page: Page, target: string): Promise<boolean> {
	return page
		.locator(linkSelector(target))
		.first()
		.evaluate(
			(a) => {
				a.scrollIntoView({ block: 'center', inline: 'nearest' });
				return true;
			},
			undefined,
			{ timeout: 2000 },
		)
		.catch(() => false);
}

/** The link's target as the page now shows it (visible, on screen), or undefined. */
async function boxOf(page: Page, target: string): Promise<{ x: number; y: number } | undefined> {
	const link = page.locator(linkSelector(target)).filter({ visible: true }).first();
	const box = await link.boundingBox({ timeout: 1000 }).catch(() => null);
	return box && box.y >= 0 && box.y + box.height <= VIEWPORT.height ? { x: box.x + box.width / 2, y: box.y + box.height / 2 } : undefined;
}

/** Runs one action in its own phase and waits for what it starts. */
async function phase(run: Run, name: string, action: () => Promise<unknown>): Promise<void> {
	await quiet(run.page, run.log, 300);
	run.log.phase = name;
	await action();
	await run.page.waitForTimeout(SETTLE_MS);
	await quiet(run.page, run.log, 300);
	run.log.phase = 'between';
}

const sameDoc = (page: Page) => page.evaluate(() => (window as unknown as { __mmPfDoc?: number }).__mmPfDoc === 1).catch(() => false);

/** Clicks the link and waits for the page it goes to. Returns false when no such link could be clicked. */
async function follow(run: Run, target: string): Promise<boolean> {
	const revealed = await reveal(run.page, target);
	const box = revealed ? await boxOf(run.page, target) : undefined;
	if (!box) return false;
	await run.page.evaluate(() => ((window as unknown as { __mmPfDoc?: number }).__mmPfDoc = 1)).catch(() => {});
	const before = new URL(run.page.url()).pathname;
	await run.page.mouse.click(box.x, box.y);
	await run.page.waitForURL((u) => u.pathname !== before, { timeout: 15_000 }).catch(() => {});
	await run.page.waitForLoadState('load').catch(() => {});
	await quiet(run.page, run.log, 600);
	return targetOf(new URL(run.page.url()).pathname) === targetOf(target.split('?', 1)[0]!);
}

/** The core experiments on one load: load, viewport, hover, focus, press, then a click, a click on a target fetched ahead, and a revisit. */
async function experiment(browser: Browser, origin: string, route: string, full: boolean, headers?: Readonly<Record<string, string>>): Promise<Omit<PrefetchFacts, 'route' | 'browser' | 'conditions'>> {
	const run = await open(browser, origin, route, undefined, headers);
	const { page, log, links } = run;
	try {
		const hints = await page.evaluate(readHints).catch(() => ({ links: [], speculationRules: [] }));
		const own = targetOf(route.split('?', 1)[0]!);
		const others = links.filter((l) => l.target !== own);
		const targets = [...new Set(others.map((l) => l.target))];
		const salt = route;
		const probes = PROBES[full ? 'full' : 'light'];
		const asks = (target: string, among: Iterable<PrefetchRequest> = log.requests.values()) => [...among].some((r) => mayCarryPage(r) && shapeOf(r.path, target) !== undefined);
		const actions: { phase: string; target: string; trigger: Trigger; at: number }[] = [];

		// Viewport: links off screen at load, scrolled into view one by one, the pointer never moved.
		for (const link of sample(others.filter((l) => !l.visibleAtLoad && !asks(l.target)), probes.viewport, salt + 'v')) {
			const name = `viewport ${link.target}`;
			let at = 0;
			await phase(run, name, async () => {
				at = Date.now() - log.t0;
				await reveal(page, link.target);
			});
			actions.push({ phase: name, target: link.target, trigger: 'viewport', at });
		}

		// Intent: on screen, each link gets one trigger in turn, hover first; a target already fetched cannot tell.
		await parkPointer(page);
		const done = new Map<Trigger, number>([['hover', 0], ['focus', 0], ['pointerdown', 0]]);
		// A link scrolled to that the page then fetches tells nothing about intent: a few such tries are enough to say so.
		let tries = 0;
		for (const link of sample(others, 30, salt + 'i')) {
			const trigger = [...done].sort((a, b) => a[1] - b[1])[0];
			if (!trigger || trigger[1] >= probes.intent || tries >= probes.intent * 3 + 3) break;
			if (asks(link.target)) continue;
			tries++;
			if (!(await reveal(page, link.target))) continue;
			await quiet(page, log, 300);
			if (asks(link.target)) continue;
			const box = await boxOf(page, link.target);
			if (!box) continue;
			if (trigger[0] === 'pointerdown') {
				// The pointer has to arrive before it presses: what arriving fetches is hover's, and leaves the press nothing to tell.
				await phase(run, `approach ${link.target}`, () => page.mouse.move(box.x, box.y));
				if (asks(link.target)) {
					await parkPointer(page);
					done.delete('pointerdown');
					continue;
				}
			}
			done.set(trigger[0], trigger[1] + 1);
			const name = `${trigger[0]} ${link.target}`;
			let at = 0;
			await phase(run, name, async () => {
				at = Date.now() - log.t0;
				if (trigger[0] === 'hover') await page.mouse.move(box.x, box.y);
				else if (trigger[0] === 'focus') await page.locator(linkSelector(link.target)).filter({ visible: true }).first().focus();
				else {
					// Pressed and released elsewhere: a press that never becomes a click.
					await page.mouse.down();
					await page.waitForTimeout(300);
					await parkPointer(page);
					await page.mouse.up();
				}
			});
			actions.push({ phase: name, target: link.target, trigger: trigger[0], at });
			if (trigger[0] === 'focus') await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.());
			await parkPointer(page);
		}
		const beforeClick = [...log.requests.values()];

		// Clicks: one to a target nothing fetched yet (which shows how this app fetches a page), one to a target fetched
		// ahead (does the click fetch it again), then back to the first by its link.
		const clicked: { phase: string; target: string }[] = [];
		const named = (t: string) => asks(t, beforeClick);
		// Siblings in the shared navigation first (`/docs/a` from `/docs/b`): their pages most likely link back.
		const shared = (t: string) => {
			const a = t.split('/');
			const b = own.split('/');
			let n = 0;
			while (n < a.length && n < b.length && a[n] === b[n]) n++;
			return n;
		};
		const nav = (l: PrefetchLink) => (l.region === 'aside' || l.region === 'nav' ? 1 : 0);
		const pool = sample(others, others.length, salt + 'c').sort((x, y) => nav(y) - nav(x) || shared(y.target) - shared(x.target));
		const fresh = pool.find((l) => l.target !== '/' && !named(l.target));
		let fullLoads = false;
		let prefetchedClick: PrefetchFacts['prefetchedClick'];
		let revisit: PrefetchFacts['revisit'];
		const shapesSoFar = () => learnShapes([...log.requests.values()], targets, clicked.slice(0, 1), own);
		if (fresh && full) {
			const name = `click ${fresh.target}`;
			log.phase = name;
			if (await follow(run, fresh.target)) {
				clicked.push({ phase: name, target: fresh.target });
				fullLoads = !(await sameDoc(page));
			}
			log.phase = 'between';
			const shapes = shapesSoFar();
			// A sidebar or nav target first: the page it opens most likely links back.
			const fetchedAhead = new Set(beforeClick.map((r) => pageOf(r, shapes, targets)));
			const here = new Set((await page.evaluate(readLinks).catch(() => [])).map((l) => targetOf(l.target)));
			const ahead = pool.map((l) => l.target).find((t) => here.has(t) && fetchedAhead.has(t) && t !== fresh.target && t !== own);
			if (ahead && clicked.length) {
				const name2 = `click-prefetched ${ahead}`;
				log.phase = name2;
				const cachedBefore = await cachedPaths(page);
				if (await follow(run, ahead)) {
					clicked.push({ phase: name2, target: ahead });
					const mine = [...log.requests.values()].filter((r) => r.phase === name2 && pageOf(r, shapesSoFar(), targets) === ahead);
					const cached = await cachedPaths(page);
					prefetchedClick = { target: ahead, refetched: mine.some((r) => !cached.has(r.path) || cachedBefore.has(r.path)), fromCache: mine.length > 0 && mine.every((r) => cached.has(r.path) && !cachedBefore.has(r.path)) };
				}
				log.phase = 'between';
			}
			if (clicked.length) {
				// Back to the page before this one: the first click's page from the second's, else the route itself.
				const back = clicked.length > 1 ? clicked[0]!.target : own;
				await page.waitForTimeout(REVISIT_AFTER_MS);
				const name3 = `revisit ${back}`;
				log.phase = name3;
				const cachedBefore = await cachedPaths(page);
				const started = Date.now();
				let by: 'link' | 'back' = 'link';
				if (!(await follow(run, back))) {
					by = 'back';
					await page.goBack({ waitUntil: 'commit', timeout: 10_000 }).catch(() => {});
					await quiet(page, log, 600);
				}
				const mine = [...log.requests.values()].filter((r) => r.phase === name3 && pageOf(r, shapesSoFar(), [back]) === back);
				const cached = await cachedPaths(page);
				revisit = { target: back, by, refetched: mine.length > 0, fromCache: mine.length > 0 && mine.every((r) => cached.has(r.path) && !cachedBefore.has(r.path)), afterMs: Date.now() - started + REVISIT_AFTER_MS };
				log.phase = 'between';
			}
		}

		const requests = [...log.requests.values()];
		const shapes = learnShapes(requests, targets, clicked.slice(0, 1), own);
		const cached = await cachedPaths(page);
		for (const r of requests) if (r.outcome === 'completed' && cached.has(r.path)) r.cached = true;
		const navigational = beforeClick.filter((r) => pageOf(r, shapes, targets) !== undefined);
		const triggers: Partial<Record<Trigger, TriggerEvidence>> = {};
		const evidence = (tested: number, phases: (r: PrefetchRequest) => boolean, wanted: (t: string) => boolean, delays: number[], atLoadOnly = false): TriggerEvidence => {
			const mine = navigational.filter((r) => phases(r) && wanted(pageOf(r, shapes, targets)!));
			const fired = new Set(mine.map((r) => pageOf(r, shapes, targets)!));
			// The load phase holds the page's own files: only what it fetched ahead is the trigger's.
			const phaseBytes = (atLoadOnly ? mine : beforeClick.filter(phases)).reduce((s, r) => s + (r.bytes ?? 0), 0);
			const delayMs = median(delays);
			return { tested, fired: fired.size, targets: [...fired].sort(), ...(delayMs !== undefined ? { delayMs: Math.round(delayMs) } : {}), bytes: phaseBytes, cancelled: mine.filter((r) => r.outcome === 'cancelled').length };
		};
		const atLoad = (r: PrefetchRequest) => r.phase === 'load';
		const offscreen = new Set(others.filter((l) => !l.visibleAtLoad).map((l) => l.target));
		const onscreen = new Set(others.filter((l) => l.visibleAtLoad).map((l) => l.target));
		const loadFired = navigational.filter(atLoad).map((r) => pageOf(r, shapes, targets)!);
		if (offscreen.size) triggers.load = evidence(offscreen.size, atLoad, (t) => offscreen.has(t), [], true);
		if (onscreen.size && !loadFired.some((t) => offscreen.has(t))) triggers.visible = evidence(onscreen.size, atLoad, (t) => onscreen.has(t), [], true);
		for (const trigger of ['viewport', 'hover', 'focus', 'pointerdown'] as const) {
			const mine = actions.filter((a) => a.trigger === trigger);
			if (!mine.length) continue;
			const delays = mine.flatMap((a) => {
				const first = navigational.filter((r) => r.phase === a.phase && pageOf(r, shapes, targets) === a.target).map((r) => r.start - a.at).sort((x, y) => x - y)[0];
				return first === undefined ? [] : [first];
			});
			const wanted = new Map(mine.map((a) => [a.phase, a.target]));
			// A viewport scroll brings neighbours into view too: any target first fetched in that phase counts.
			triggers[trigger] = evidence(mine.length, (r) => wanted.has(r.phase), (t) => trigger === 'viewport' || [...wanted.values()].includes(t), delays);
		}
		const ahead = new Set(navigational);
		const bytesBeforeClick = beforeClick.filter((r) => ahead.has(r) || r.phase !== 'load').reduce((s, r) => s + (r.bytes ?? 0), 0);
		return { shapes, fullLoads, links: links.length, triggers, concurrency: maxInFlight(navigational), bytesBeforeClick, ...(prefetchedClick ? { prefetchedClick } : {}), ...(revisit ? { revisit } : {}), hints, requests };
	} finally {
		await run.close();
	}
}

/** Load, one viewport probe and one hover probe under a condition: whether each still fetches ahead. */
async function underCondition(browser: Browser, origin: string, route: string, condition: Condition, shapes: readonly string[], headers?: Readonly<Record<string, string>>): Promise<ConditionResult> {
	const run = await open(browser, origin, route, condition, headers);
	try {
		const own = targetOf(route.split('?', 1)[0]!);
		const others = run.links.filter((l) => l.target !== own);
		const targets = [...new Set(others.map((l) => l.target))];
		const pages = (phase: string) => new Set([...run.log.requests.values()].filter((r) => r.phase === phase).map((r) => pageOf(r, shapes, targets)).filter((t): t is string => t !== undefined));
		const atLoad = pages('load');
		const offscreen = others.filter((l) => !l.visibleAtLoad);
		const out: { -readonly [K in keyof ConditionResult]: ConditionResult[K] } = {};
		if (offscreen.length) out.load = offscreen.some((l) => atLoad.has(l.target));
		if (others.some((l) => l.visibleAtLoad)) out.visible = others.some((l) => l.visibleAtLoad && atLoad.has(l.target));
		const scroll = sample(offscreen.filter((l) => !atLoad.has(l.target)), 1, route + 'v')[0];
		if (scroll) {
			await phase(run, 'viewport', () => reveal(run.page, scroll.target));
			out.viewport = pages('viewport').size > 0;
		}
		await parkPointer(run.page);
		const asked = () => [...pages('load'), ...pages('viewport')];
		for (const link of sample(others, 12, route + 'i')) {
			if (asked().includes(link.target) || !(await reveal(run.page, link.target))) continue;
			await quiet(run.page, run.log, 400);
			const box = await boxOf(run.page, link.target);
			if (!box) continue;
			await phase(run, 'hover', () => run.page.mouse.move(box.x, box.y));
			out.hover = pages('hover').has(link.target);
			break;
		}
		return out;
	} catch (error) {
		return { error: (error as Error).message.split('\n')[0]! };
	} finally {
		await run.close();
	}
}

async function slowLinkBrowser(): Promise<{ browser: Browser; close: () => Promise<void> }> {
	const throttle = await startThrottle(NETWORK_PROFILES['slow-4g']!);
	const browser = closedOnExit(await chromium.launch({ proxy: { server: throttle.proxy, bypass: '' }, args: ['--proxy-bypass-list=<-loopback>', '--disable-quic'] }));
	return { browser, close: async () => (await browser.close().catch(() => {}), await throttle.close()) };
}

function fileOf(dir: string, route: string): string {
	return join(dir, `${createHash('sha256').update(route).digest('hex').slice(0, 24)}.json`);
}

/**
 * The route's prefetch facts: read back from `dir` (one per version of this recorder) when recorded there from the same
 * old page (`options.page`, its key), else recorded now and kept there.
 */
export async function recordPrefetch(browser: Browser, origin: string, route: string, dir: string, options: RecordOptions = {}): Promise<PrefetchFacts> {
	const file = fileOf(dir, route);
	const kept = await readFile(file, 'utf8').then((t) => JSON.parse(t) as PrefetchFacts & { page?: string }, () => undefined);
	if (kept && kept.route === route && kept.page === options.page && Boolean(kept.conditions) === Boolean(options.full)) {
		const { page: _, ...facts } = kept;
		return facts;
	}
	const base = await experiment(browser, origin, route, Boolean(options.full), options.headers);
	let conditions: Partial<Record<Condition, ConditionResult>> | undefined;
	if (options.full) {
		conditions = {};
		for (const condition of options.conditions ?? CONDITIONS) {
			if (condition === 'slow-link') {
				const slow = await slowLinkBrowser().catch(() => undefined);
				conditions[condition] = slow ? await underCondition(slow.browser, origin, route, condition, base.shapes, options.headers).finally(() => slow.close()) : { error: 'could not start the throttled browser' };
			} else conditions[condition] = await underCondition(browser, origin, route, condition, base.shapes, options.headers);
		}
	}
	// The load's own scripts and styles are the page's, not fetched ahead: left out of what is kept.
	const facts: PrefetchFacts = { route, browser: `chromium ${browser.version()}`, ...base, requests: base.requests.filter((r) => r.phase !== 'load' || mayCarryPage(r)), ...(conditions ? { conditions } : {}) };
	await mkdir(dir, { recursive: true });
	await writeFile(file, JSON.stringify({ ...facts, ...(options.page ? { page: options.page } : {}) }));
	return facts;
}

