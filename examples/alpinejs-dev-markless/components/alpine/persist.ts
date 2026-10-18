// Alpine.js's Persist plugin, $persist (MIT, Caleb Porzio): the value lives in localStorage under _x_<name>.
export function persisted<T>(key: string, fallback: T): T {
	try {
		const raw = localStorage.getItem(key);
		if (raw !== null) return JSON.parse(raw) as T;
	} catch {}
	persist(key, fallback);
	return fallback;
}

export function persist(key: string, value: unknown): void {
	try {
		localStorage.setItem(key, JSON.stringify(value));
	} catch {}
}
