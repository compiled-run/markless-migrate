import type { BrowserContext, Page, Request } from 'playwright';

/** How long a page must have been still (no change to the document, no request ending, no scheduler slice) to be settled. */
export const STILL_MS = 100;
const POLL_MS = 20;

/**
 * Init script, run in every document before its own scripts (self-contained): counts what the page still has to run,
 * for settle. A callback that schedules itself again (a loop) does not count; what it changes in the document does.
 */
export function trackSettle(): void {
	const g = globalThis as typeof globalThis & { __mmSettle__?: (within: number) => { busy: number; still: number; later: number } };
	if (g.__mmSettle__) return;
	const clock = performance.now.bind(performance);
	const realSetTimeout = g.setTimeout;
	const realClearTimeout = g.clearTimeout;
	const realRaf = g.requestAnimationFrame?.bind(g);
	const realCancelRaf = g.cancelAnimationFrame?.bind(g);
	const keyOf = (fn: unknown, tail: string) => {
		try {
			return `${Function.prototype.toString.call(fn)}\u0000${tail}`;
		} catch {
			return `\u0000${Math.random()}`;
		}
	};
	let running: string | undefined;
	const rearms = new Map<string, number>();
	const loops = new Set<string>();
	const scheduled = (key: string) => {
		if (running !== key) return;
		const n = (rearms.get(key) ?? 0) + 1;
		rearms.set(key, n);
		if (n >= 2) loops.add(key);
	};
	const call = (key: string, fn: () => unknown) => {
		const outer = running;
		running = key;
		try {
			return fn();
		} finally {
			running = outer;
		}
	};
	const timers = new Map<unknown, { key: string; due: number }>();
	g.setTimeout = function (handler: TimerHandler, ms?: number, ...rest: unknown[]) {
		if (typeof handler !== 'function') return realSetTimeout(handler, ms, ...rest);
		const wait = Math.max(0, Number(ms) || 0);
		const key = keyOf(handler, `timeout ${wait}`);
		scheduled(key);
		const id: ReturnType<typeof setTimeout> = realSetTimeout(function (this: unknown) {
			timers.delete(id);
			return call(key, () => (handler as (...a: unknown[]) => unknown).apply(this, rest));
		}, ms);
		timers.set(id, { key, due: clock() + wait });
		return id;
	} as typeof setTimeout;
	g.clearTimeout = function (id?: Parameters<typeof clearTimeout>[0]) {
		timers.delete(id);
		return realClearTimeout(id);
	} as typeof clearTimeout;
	const frames = new Map<number, string>();
	if (realRaf && realCancelRaf) {
		g.requestAnimationFrame = function (callback: FrameRequestCallback) {
			const key = keyOf(callback, 'frame');
			scheduled(key);
			const id = realRaf((time: number) => {
				frames.delete(id);
				call(key, () => callback.call(g, time));
			});
			frames.set(id, key);
			return id;
		};
		g.cancelAnimationFrame = function (id: number) {
			frames.delete(id);
			return realCancelRaf(id);
		};
	}
	// A framework scheduler (React's) posts to a MessageChannel for each slice of work: a slice posted and not yet run is pending.
	let last = clock();
	let posted = 0;
	let delivered = 0;
	let lastPost = Number.NEGATIVE_INFINITY;
	if (typeof MessagePort === 'function') {
		const post = MessagePort.prototype.postMessage;
		MessagePort.prototype.postMessage = function (this: MessagePort, ...args: unknown[]) {
			posted++;
			last = lastPost = clock();
			return (post as (...a: unknown[]) => void).apply(this, args);
		} as MessagePort['postMessage'];
		const own = Object.getOwnPropertyDescriptor(MessagePort.prototype, 'onmessage');
		const handlers = new WeakMap<MessagePort, unknown>();
		if (own?.set && own.get)
			Object.defineProperty(MessagePort.prototype, 'onmessage', {
				configurable: true,
				enumerable: own.enumerable ?? true,
				get(this: MessagePort) {
					return handlers.has(this) ? handlers.get(this) : own.get!.call(this);
				},
				set(this: MessagePort, fn: unknown) {
					handlers.set(this, fn);
					own.set!.call(
						this,
						typeof fn === 'function'
							? function (this: MessagePort, event: MessageEvent) {
									delivered++;
									last = clock();
									return (fn as (e: MessageEvent) => unknown).call(this, event);
								}
							: fn,
					);
				},
			});
	}
	const watch = () => new MutationObserver(() => (last = clock())).observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
	if (document.documentElement) watch();
	else addEventListener('DOMContentLoaded', watch, { once: true });
	Object.defineProperty(g, '__mmSettle__', {
		value: (within: number) => {
			const now = clock();
			let busy = 0;
			for (const t of timers.values()) if (!loops.has(t.key) && t.due <= now + within) busy++;
			for (const key of frames.values()) if (!loops.has(key)) busy++;
			for (const a of document.getAnimations()) if (a.playState === 'running' && Number.isFinite(a.effect?.getComputedTiming().endTime ?? Number.POSITIVE_INFINITY)) busy++;
			// A message to a port nobody listens on through onmessage is never counted as run: it holds the wait up a second at most.
			if (posted > delivered && now - lastPost < 1000) busy++;
			let later = 0;
			for (const t of timers.values()) if (!loops.has(t.key) && t.due > now + within) later++;
			return { busy, still: now - last, later };
		},
	});
}

// Per page: the requests open, by when each started; when one last ended; when the last settle returned.
const network = new WeakMap<Page, { open: Map<Request, number>; ended: number; settled: number }>();

/** Has every page of `context` track what it still has to run, and its requests, for settle. */
export async function trackSettling(context: BrowserContext): Promise<void> {
	await context.addInitScript(trackSettle);
	const watch = (page: Page) => {
		const seen = { open: new Map<Request, number>(), ended: 0, settled: 0 };
		network.set(page, seen);
		page.on('request', (r) => void seen.open.set(r, Date.now()));
		const end = (r: Request) => {
			if (seen.open.delete(r)) seen.ended = Date.now();
		};
		page.on('requestfinished', end);
		page.on('requestfailed', end);
	};
	for (const page of context.pages()) watch(page);
	context.on('page', watch);
}

/**
 * Waits for what a step started, at most `capMs` (the fixed pause it replaces): until no timeout due within that time,
 * animation frame or finite animation is pending, no request the step made is open, and nothing changed the document, ran
 * a scheduler slice or ended a request for STILL_MS. A page without the tracker waits the whole `capMs`.
 */
export async function settle(page: Page, capMs: number): Promise<void> {
	const start = Date.now();
	const net = network.get(page);
	// A request still open from before the last settle (a stream, a beacon) is not this step's.
	const since = net?.settled ?? start;
	try {
		for (;;) {
			const left = capMs - (Date.now() - start);
			if (left <= 0) return;
			const seen = net && (await page.evaluate((within) => (globalThis as { __mmSettle__?: (within: number) => { busy: number; still: number; later: number } }).__mmSettle__?.(within), left).catch(() => undefined));
			// A timer due after the pause (a tooltip group's skip-delay window) makes what comes next depend on how long this step took: the whole pause, as before.
			if (!net || !seen || seen.later) return void (await page.waitForTimeout(Math.max(0, capMs - (Date.now() - start))));
			const requests = [...net.open.values()].filter((at) => at >= since).length;
			if (seen.busy === 0 && requests === 0 && Math.min(seen.still, Date.now() - start, Date.now() - net.ended) >= STILL_MS) return;
			await page.waitForTimeout(Math.min(POLL_MS, left));
		}
	} finally {
		if (net) net.settled = Date.now();
	}
}

/** Waits until no request is open on the page and none has ended for STILL_MS, at most `capMs`: what a load still fetches. */
export async function requestsDone(page: Page, capMs: number): Promise<void> {
	const net = network.get(page);
	if (!net) return void (await page.waitForLoadState('networkidle', { timeout: capMs }).catch(() => {}));
	const start = Date.now();
	while (Date.now() - start < capMs && (net.open.size || Date.now() - net.ended < STILL_MS)) await page.waitForTimeout(POLL_MS);
}

/** Whether the page has nothing due within STILL_MS (timer, frame, finite animation, scheduler slice) and its document was still for STILL_MS. */
export async function quiet(page: Page): Promise<boolean> {
	const seen = await page.evaluate((within) => (globalThis as { __mmSettle__?: (within: number) => { busy: number; still: number } }).__mmSettle__?.(within), STILL_MS).catch(() => undefined);
	return !seen || (seen.busy === 0 && seen.still >= STILL_MS);
}
