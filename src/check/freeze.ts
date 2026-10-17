export interface FreezeOptions {
	/** The instant the page's clock starts at, in epoch milliseconds. */
	readonly time: number;
	/** Seed for Math.random, crypto.getRandomValues and crypto.randomUUID. */
	readonly seed: number;
	readonly timezone: string;
	readonly locale: string;
}

export const DEFAULT_FREEZE: FreezeOptions = { time: Date.UTC(2026, 0, 15, 12, 0, 0), seed: 20260115, timezone: 'UTC', locale: 'en-US' };

/** Init script, run in every document before its own scripts: must stay self-contained. */
export function freezePage({ time, seed }: { time: number; seed: number }): void {
	const RealDate = Date;
	// The clock only moves when a timer fires, to the time it was due, so the same program sees the same times.
	let elapsed = 0;
	let reads = 0;
	const now = () => {
		// A busy-wait on Date.now would never end on a still clock; after many reads in a row it creeps forward.
		if (++reads > 10_000) elapsed += 1;
		return time + elapsed;
	};
	const advance = (due: number) => {
		if (due > elapsed) elapsed = due;
		reads = 0;
	};
	const FrozenDate = function (this: unknown, ...args: unknown[]) {
		if (!new.target) return new RealDate(now()).toString();
		return Reflect.construct(RealDate, args.length ? args : [now()], new.target);
	} as unknown as DateConstructor;
	Object.defineProperties(FrozenDate, {
		prototype: { value: RealDate.prototype },
		now: { value: now, writable: true, configurable: true },
		parse: { value: RealDate.parse, writable: true, configurable: true },
		UTC: { value: RealDate.UTC, writable: true, configurable: true },
	});
	Object.defineProperty(RealDate.prototype, 'constructor', { value: FrozenDate, writable: true, configurable: true });
	globalThis.Date = FrozenDate;
	Object.defineProperty(performance, 'timeOrigin', { get: () => time, configurable: true });

	const realTimeout = globalThis.setTimeout;
	const realClear = globalThis.clearTimeout;
	const realInterval = globalThis.setInterval;
	// Timeouts of up to a second still to fire (a debounced search, a delayed toast): a journey step waits them out.
	const pending = new Set<unknown>();
	Object.defineProperty(globalThis, '__markless_migrate_pending_timers__', { value: () => pending.size });
	globalThis.setTimeout = function (handler: TimerHandler, ms?: number, ...rest: unknown[]) {
		if (typeof handler !== 'function') return realTimeout(handler, ms, ...rest);
		const due = elapsed + Math.max(0, Number(ms) || 0);
		const id = realTimeout(function (this: unknown) {
			pending.delete(id);
			advance(due);
			return (handler as (...a: unknown[]) => unknown).apply(this, rest);
		}, ms);
		if ((Number(ms) || 0) > 0 && (Number(ms) || 0) <= 1000) pending.add(id);
		return id;
	} as typeof setTimeout;
	globalThis.clearTimeout = function (id?: Parameters<typeof clearTimeout>[0]) {
		pending.delete(id);
		return realClear(id);
	} as typeof clearTimeout;
	globalThis.setInterval = function (handler: TimerHandler, ms?: number, ...rest: unknown[]) {
		if (typeof handler !== 'function') return realInterval(handler, ms, ...rest);
		const step = Math.max(0, Number(ms) || 0);
		let due = elapsed;
		return realInterval(function (this: unknown) {
			due += step;
			advance(due);
			return (handler as (...a: unknown[]) => unknown).apply(this, rest);
		}, ms);
	} as typeof setInterval;

	// mulberry32: a small seeded generator; each stream starts from its own seed so one does not shift another.
	const stream = (s: number) => {
		let a = s >>> 0;
		return () => {
			a = (a + 0x6d2b79f5) >>> 0;
			let t = a;
			t = Math.imul(t ^ (t >>> 15), t | 1);
			t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
			return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
		};
	};
	const random = stream(seed);
	const bytes = stream(seed ^ 0x9e3779b9);
	Math.random = random;
	const fill = <T extends ArrayBufferView | null>(array: T): T => {
		if (array) {
			const view = new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
			for (let i = 0; i < view.length; i++) view[i] = Math.floor(bytes() * 256);
		}
		return array;
	};
	const proto = Object.getPrototypeOf(crypto) as Crypto;
	Object.defineProperty(proto, 'getRandomValues', { value: fill, writable: true, configurable: true });
	// randomUUID exists only in secure contexts; adding it elsewhere would change what the page feature-detects.
	if (typeof proto.randomUUID === 'function') Object.defineProperty(proto, 'randomUUID', {
		value: () => {
			const b = fill(new Uint8Array(16));
			b[6] = (b[6]! & 0x0f) | 0x40;
			b[8] = (b[8]! & 0x3f) | 0x80;
			const hex = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
			return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
		},
		writable: true,
		configurable: true,
	});
}

/** What freezing pins, for the report. */
export function pinnedSummary(freeze: FreezeOptions | false): string[] {
	if (!freeze) return [];
	return [
		`clock: Date and Date.now start at ${new Date(freeze.time).toISOString()} and move only when a timer fires; performance.timeOrigin is the same instant`,
		`randomness: Math.random, crypto.getRandomValues and crypto.randomUUID seeded with ${freeze.seed}`,
		`timezone ${freeze.timezone} and locale ${freeze.locale}`,
		'CSS animations and transitions finished or cancelled for screenshots (not for the reduced-motion check)',
	];
}

/** Where a nondeterminism source the source scan found is pinned, by its kind and side. */
export function pinnedBy(kind: string, side: string | undefined, freeze: FreezeOptions | false): string {
	const k = kind.toLowerCase();
	if (/analytic|tracker|\bads?\b|advert|tag ?manager|gtag|pixel/.test(k)) return 'blocked: its hosts are on the tracker block list';
	if (side === 'server') return 'not pinned: runs on the server, left to the noise baseline (repeated OLD loads)';
	if (!freeze) return 'not pinned: freezing is off';
	const where = side === 'client' ? 'pinned in the browser' : 'pinned in the browser; on the server left to the noise baseline';
	if (/performance\.now|hrtime|requestanimationframe/.test(k)) return 'not pinned: relative timers run in real time';
	if (/random|uuid|crypto/.test(k)) return `${where} (seeded)`;
	if (/date|time|clock|now/.test(k)) return `${where} (fixed clock)`;
	if (/zone|locale|intl|language/.test(k)) return `${where} (emulated timezone and locale)`;
	return 'not pinned: left to the noise baseline';
}
