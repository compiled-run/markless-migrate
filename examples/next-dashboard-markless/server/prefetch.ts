// Page data read before the page renders, keyed by the request: a loader that finds it answers at once, so the page is
// sent whole instead of as a skeleton the browser must fill (Markless streams anything slower than 10 ms).
// Nitro bundles middleware and the page renderer separately, so the map lives on globalThis to be one map.
const store = globalThis as { __dashboardPrefetch?: WeakMap<Request, Map<string, unknown>> };
const ready = (store.__dashboardPrefetch ??= new WeakMap());

export function remember(request: Request, key: string, value: unknown) {
	const map = ready.get(request) ?? new Map<string, unknown>();
	map.set(key, value);
	ready.set(request, map);
}

export function recall<T>(request: Request, key: string): T | undefined {
	return ready.get(request)?.get(key) as T | undefined;
}
