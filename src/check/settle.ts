// When a page has settled after a load or a use: from what the page itself reports (DOM changes, scrolls, the animations
// and short timers it started, the requests it sent), with the fixed wait it replaces as the cap.
import type { Page } from 'playwright';

interface RequestEvents {
	on(event: 'request' | 'requestfinished' | 'requestfailed', listener: (request: unknown) => void): unknown;
	off(event: 'request' | 'requestfinished' | 'requestfailed', listener: (request: unknown) => void): unknown;
}

export interface Requests {
	/** Resolves true once nothing has been in flight for `windowMs`, or false at `capMs`. */
	quiet(windowMs: number, capMs: number): Promise<boolean>;
	inflight(): number;
	dispose(): void;
}

/** Tracks the page's requests in flight from now on: attach before the navigation or use it waits on. */
export function trackRequests(page: RequestEvents): Requests {
	const open = new Set<unknown>();
	let lastChange = Date.now();
	const start = (r: unknown) => {
		open.add(r);
		lastChange = Date.now();
	};
	const end = (r: unknown) => {
		if (open.delete(r)) lastChange = Date.now();
	};
	page.on('request', start);
	page.on('requestfinished', end);
	page.on('requestfailed', end);
	return {
		inflight: () => open.size,
		quiet: (windowMs, capMs) =>
			new Promise((done) => {
				const t0 = Date.now();
				const tick = () => {
					const now = Date.now();
					if (open.size === 0 && now - Math.max(lastChange, t0) >= windowMs) return done(true);
					if (now - t0 >= capMs) return done(false);
					setTimeout(tick, Math.min(25, windowMs));
				};
				tick();
			}),
		dispose: () => {
			page.off('request', start);
			page.off('requestfinished', end);
			page.off('requestfailed', end);
		},
	};
}

interface SettleState {
	pending: Map<number, number>;
	mark: number;
	maxDelay: number;
	last: number;
	baseline: Set<Animation>;
	observer?: MutationObserver;
	scrolls?: boolean;
	/** The page's own setTimeout, for the settle's polling, which must not count as the use's. */
	timer: typeof setTimeout;
}

/** An init script (context.addInitScript): the page's setTimeout calls are counted while pending, so a debounced answer is waited for. */
export function trackTimers(): void {
	const w = globalThis as unknown as { __markless_migrate_settle__?: SettleState; setTimeout: typeof setTimeout; clearTimeout: typeof clearTimeout };
	if (w.__markless_migrate_settle__) return;
	const set = w.setTimeout, clear = w.clearTimeout;
	const st: SettleState = { pending: new Map(), mark: Infinity, maxDelay: 0, last: 0, baseline: new Set(), timer: set };
	w.__markless_migrate_settle__ = st;
	w.setTimeout = function (this: unknown, handler: TimerHandler, delay?: number, ...args: unknown[]) {
		const ms = Number(delay) || 0;
		const tracked = performance.now() >= st.mark && ms <= st.maxDelay;
		const run = typeof handler === 'function' ? handler : () => (0, eval)(String(handler));
		const id = (set as unknown as (...x: unknown[]) => number).call(this, function (this: unknown, ...a: unknown[]) {
			st.pending.delete(id);
			return (run as (...x: unknown[]) => unknown).apply(this, a);
		}, delay, ...args);
		if (tracked) st.pending.set(id, performance.now() + ms);
		return id;
	} as typeof setTimeout;
	w.clearTimeout = function (this: unknown, id?: number) {
		if (id !== undefined) st.pending.delete(id);
		return clear.call(this, id);
	} as typeof clearTimeout;
}

/** In the page: the start of a use; what already runs (an endless spinner, a pending timer) is the page's own, not the use's. */
export function markInPage(maxDelay: number): boolean {
	const st = (globalThis as unknown as { __markless_migrate_settle__?: SettleState }).__markless_migrate_settle__;
	if (!st) return false;
	st.observer?.disconnect();
	st.mark = performance.now();
	st.last = st.mark;
	st.maxDelay = maxDelay;
	st.pending.clear();
	st.baseline = new Set(document.getAnimations());
	st.observer = new MutationObserver(() => {
		st.last = performance.now();
	});
	st.observer.observe(document, { subtree: true, attributes: true, childList: true, characterData: true });
	if (!st.scrolls) {
		st.scrolls = true;
		document.addEventListener('scroll', () => (st.last = performance.now()), { capture: true, passive: true });
	}
	return true;
}

/** In the page: true once, since the mark, nothing changed or scrolled for `quietMs`, no animation the use started runs and no timer it set is pending; false at `timeoutMs`, undefined with no mark. */
export function quietInPage({ quietMs, timeoutMs }: { quietMs: number; timeoutMs: number }): Promise<boolean | undefined> {
	const st = (globalThis as unknown as { __markless_migrate_settle__?: SettleState }).__markless_migrate_settle__;
	if (!st || st.mark === Infinity) return Promise.resolve(undefined);
	const t0 = performance.now();
	const moving = () =>
		document.getAnimations().some((a) => {
			if (st.baseline.has(a) || (a.playState !== 'running' && !a.pending)) return false;
			const end = a.effect?.getComputedTiming().endTime;
			return typeof end === 'number' && Number.isFinite(end);
		});
	return new Promise((done) => {
		const tick = () => {
			const now = performance.now();
			if (now - st.last >= quietMs && st.pending.size === 0 && !moving()) return done(true);
			if (now - t0 >= timeoutMs) return done(false);
			st.timer.call(globalThis, tick, 16);
		};
		tick();
	});
}

/** In the page: two painted frames (at most 100 ms in a tab given none). */
export function framesInPage(): Promise<void> {
	const st = (globalThis as unknown as { __markless_migrate_settle__?: SettleState }).__markless_migrate_settle__;
	const later = st?.timer ?? setTimeout;
	return Promise.race([new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))), new Promise<void>((r) => later.call(globalThis, r, 100))]);
}

/** Marks the start of a use on the page (its timers and animations from here on are the use's). */
export async function markUse(page: Page, capMs = 1000): Promise<boolean> {
	return page.evaluate(markInPage, capMs).catch(() => false);
}

const QUIET_MS = 100;

/**
 * Waits until the page has settled after the use `markUse` marked: no DOM change or scroll for 100 ms, nothing the use
 * started still animating, no short timer it set pending, no request in flight, then two frames. Never longer than
 * `capMs`; a page with no mark (one the use navigated away from) waits out the cap, as the fixed wait did.
 */
export async function settle(page: Page, requests: Requests | undefined, capMs: number): Promise<void> {
	const t0 = Date.now();
	const left = () => capMs - (Date.now() - t0);
	for (;;) {
		if (left() <= 0) return;
		const quiet = await page.evaluate(quietInPage, { quietMs: QUIET_MS, timeoutMs: left() }).catch(() => undefined);
		if (quiet === undefined) {
			if (left() > 0) await page.waitForTimeout(left()).catch(() => {});
			return;
		}
		if (!quiet) return;
		if (!requests || requests.inflight() === 0) break;
		if (!(await requests.quiet(QUIET_MS, left()))) return;
	}
	await page.evaluate(framesInPage).catch(() => {});
}
