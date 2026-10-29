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
	/** How long nothing has been in flight, or -1 while something is. */
	idleFor(): number;
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
		idleFor: () => (open.size ? -1 : Date.now() - lastChange),
		quiet: (windowMs, capMs) =>
			new Promise((done) => {
				const t0 = Date.now();
				const tick = () => {
					const now = Date.now();
					if (open.size === 0 && now - lastChange >= windowMs) return done(true);
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
	/** Frames painted since the mark, and the frame of the last change. */
	frames: number;
	lastFrame: number;
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
	const st: SettleState = { pending: new Map(), mark: Infinity, maxDelay: 0, last: 0, baseline: new Set(), frames: 0, lastFrame: 0, timer: set };
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
	// A copy button answers when the clipboard does, which can take longer than the quiet window and shows as nothing else.
	let calls = 0;
	const clipboard = (navigator as unknown as { clipboard?: Record<string, unknown> }).clipboard;
	for (const name of ['writeText', 'write', 'readText', 'read']) {
		const call = clipboard?.[name];
		if (typeof call !== 'function') continue;
		clipboard![name] = function (this: unknown, ...args: unknown[]) {
			const key = -++calls;
			if (performance.now() >= st.mark) st.pending.set(key, performance.now());
			const done = () => st.pending.delete(key);
			const result = (call as (...a: unknown[]) => Promise<unknown>).apply(this, args);
			void Promise.resolve(result).then(done, done);
			return result;
		};
	}
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
	st.frames = 0;
	st.lastFrame = 0;
	const markedAt = st.mark;
	const frame = () => {
		if (st.mark !== markedAt) return;
		st.frames++;
		requestAnimationFrame(frame);
	};
	requestAnimationFrame(frame);
	st.observer = new MutationObserver(() => {
		st.last = performance.now();
		st.lastFrame = st.frames;
	});
	st.observer.observe(document, { subtree: true, attributes: true, childList: true, characterData: true });
	if (!st.scrolls) {
		st.scrolls = true;
		document.addEventListener('scroll', () => {
			st.last = performance.now();
			st.lastFrame = st.frames;
		}, { capture: true, passive: true });
	}
	return true;
}

/** In the page: true once, since the mark, nothing changed or scrolled for `quietMs`, no animation the use started runs and no timer it set is pending; false at `timeoutMs`, undefined with no mark. */
export function quietInPage({ quietMs, quietFrames, timeoutMs }: { quietMs: number; quietFrames: number; timeoutMs: number }): Promise<boolean | undefined> {
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
			// Counted in painted frames as well as time: a renderer starved of CPU paints less often, so the window grows with it.
			// A page painting no frames at all is held to the time alone.
			const framesQuiet = st.frames - st.lastFrame >= quietFrames || (st.frames === 0 && now - st.mark > 500);
			if (now - st.last >= quietMs && framesQuiet && st.pending.size === 0 && !moving()) return done(true);
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
const QUIET_FRAMES = 6;

/** How long a settle took, and what held it to its cap: the page (DOM changes, animations, timers), a request, or no mark (a page the use left). */
export interface Settled {
	readonly ms: number;
	readonly capped: false | 'page' | 'requests' | 'unmarked';
}

/**
 * Waits until the page has settled after the use `markUse` marked: no DOM change or scroll for 100 ms and 6 frames,
 * nothing the use started still animating, no short timer or clipboard call it made pending, no request for 100 ms, then
 * two frames. Never longer than `capMs`; a page with no mark (one the use navigated away from) waits out the cap, as the
 * fixed wait did.
 */
export async function settle(page: Page, requests: Requests | undefined, capMs: number): Promise<Settled> {
	const t0 = Date.now();
	const left = () => capMs - (Date.now() - t0);
	const done = (capped: Settled['capped']): Settled => ({ ms: Date.now() - t0, capped });
	for (;;) {
		if (left() <= 0) return done('page');
		const quiet = await page.evaluate(quietInPage, { quietMs: QUIET_MS, quietFrames: QUIET_FRAMES, timeoutMs: left() }).catch(() => undefined);
		if (quiet === undefined) {
			if (left() > 0) await page.waitForTimeout(left()).catch(() => {});
			return done('unmarked');
		}
		if (!quiet) return done('page');
		// A request that only just answered may not have reached the page's script yet: the page is looked at again once the network has rested too.
		if (!requests || requests.idleFor() >= QUIET_MS) break;
		if (!(await requests.quiet(QUIET_MS, left()))) return done('requests');
	}
	await page.evaluate(framesInPage).catch(() => {});
	return done(false);
}
