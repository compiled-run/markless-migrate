import { parseSearch, stringifySearch } from './search.ts';
import type { UsersView } from './types.ts';

export const viewJson = (view: UsersView | undefined) => JSON.stringify(view ?? {});

// navigate({ search, replace: true }) in the old app: the address follows the view, nothing is fetched.
export function writeView(next: UsersView): string {
	history.replaceState(
		history.state,
		'',
		`${location.pathname}${stringifySearch({ ...parseSearch(location.search), usersView: next })}`,
	);
	return viewJson(next);
}
