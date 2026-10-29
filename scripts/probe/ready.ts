// A page's network at rest: no request in flight for a short window, in place of Playwright's networkidle (500 ms).

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

/** Tracks the page's requests in flight from now on: attach before the navigation it waits on. */
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
