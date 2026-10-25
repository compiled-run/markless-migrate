// TanStack Router's Link active rule (resolveIsActive with its defaults): the path matches by segments, or exactly, and the link's search is part of the current one.
import { parseSearch } from './search.ts';

const trim = (path: string) => (path !== '/' ? path.replace(/\/$/, '') : path);

function partialEqual(current: unknown, next: unknown): boolean {
	if (current === next) return true;
	if (!current || !next || typeof current !== 'object' || typeof next !== 'object') return false;
	return Object.keys(next).every(
		(k) =>
			(next as Record<string, unknown>)[k] === undefined ||
			partialEqual(
				(current as Record<string, unknown>)[k],
				(next as Record<string, unknown>)[k],
			),
	);
}

export function isActive(
	url: { readonly pathname: string; readonly search: string },
	href: string,
	exact = false,
): boolean {
	const next = new URL(href, 'http://x');
	const currentPath = trim(url.pathname);
	const nextPath = trim(next.pathname);
	const pathOk = exact
		? currentPath === nextPath
		: currentPath.startsWith(nextPath) &&
			(currentPath.length === nextPath.length || currentPath[nextPath.length] === '/');
	return pathOk && partialEqual(parseSearch(url.search), parseSearch(next.search));
}

/** What a TanStack `Link` with `activeProps={{ className: 'font-bold' }}` writes: the class added, and `data-status` and `aria-current` on the active one. */
export const linkClass = (base: string, active: boolean) => (active ? `${base} font-bold` : base);
