// TanStack Router's default search format (router-core searchParams.ts and qss.ts), so every address reads and writes as the old app's did.
import type { UsersSortBy, UsersView } from './types.ts';

const jsonStart = /^(?:\s|["[{\d-]|fa|nu|tr)/;

function toValue(str: string): unknown {
	if (!str) return '';
	if (str === 'false') return false;
	if (str === 'true') return true;
	return +str * 0 === 0 && +str + '' === str ? +str : str;
}

export function parseSearch(search: string): Record<string, unknown> {
	const query: Record<string, unknown> = Object.create(null);
	for (const [key, raw] of new URLSearchParams(search.replace(/^\?/, ''))) {
		const prev = query[key];
		const value = toValue(raw);
		query[key] = prev == null ? value : Array.isArray(prev) ? [...prev, value] : [prev, value];
	}
	for (const key in query) {
		const value = query[key];
		if (typeof value !== 'string' || !jsonStart.test(value)) continue;
		try {
			query[key] = JSON.parse(value);
		} catch {}
	}
	return query;
}

function stringifyValue(val: unknown): string {
	if (val && typeof val === 'object') return JSON.stringify(val);
	if (typeof val === 'string' && jsonStart.test(val)) {
		try {
			JSON.parse(val);
			return JSON.stringify(val);
		} catch {}
	}
	return String(val);
}

export function stringifySearch(search: Record<string, unknown>): string {
	const params = new URLSearchParams();
	for (const key in search)
		if (search[key] !== undefined) params.set(key, stringifyValue(search[key]));
	const out = params.toString();
	return out ? `?${out}` : '';
}

const SORTS: readonly UsersSortBy[] = ['name', 'id', 'email'];

/** The users route's validateSearch: `usersView` with `sortBy` from the three columns and a string `filterBy`, keys in the schema's order. */
export function usersView(search: Record<string, unknown>): UsersView | undefined {
	const raw = search.usersView;
	if (raw === undefined) return undefined;
	if (!raw || typeof raw !== 'object') throw new Error('Invalid usersView');
	const { sortBy, filterBy } = raw as Record<string, unknown>;
	if (sortBy !== undefined && !SORTS.includes(sortBy as UsersSortBy))
		throw new Error('Invalid sortBy');
	if (filterBy !== undefined && typeof filterBy !== 'string') throw new Error('Invalid filterBy');
	return {
		...(sortBy !== undefined ? { sortBy: sortBy as UsersSortBy } : {}),
		...(filterBy !== undefined ? { filterBy } : {}),
	};
}
