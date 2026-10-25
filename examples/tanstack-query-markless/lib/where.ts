// The browser can evaluate a page body again with its props missing (repros/state-from-prop-recipe.tsrx), so page-prop reads that may run there fall back to the browser's own copy.
import { cookies, SANDBOX_DEFAULTS, SANDBOX_KEYS, type SandboxKey } from './context.ts';

export const onServer = typeof window === 'undefined';

type Url = { readonly pathname: string; readonly search: string };

export const here = (url: Url): Url =>
	onServer ? url : { pathname: location.pathname, search: location.search };

export function storedSandbox(): Record<SandboxKey, number> {
	const jar = cookies(document.cookie);
	return Object.fromEntries(
		SANDBOX_KEYS.map((k) => [
			k,
			Number(sessionStorage.getItem(k) ?? jar.get(k) ?? SANDBOX_DEFAULTS[k]),
		]),
	) as Record<SandboxKey, number>;
}
