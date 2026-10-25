import { computed, shared, state } from '@markless/core';
import { isActive, linkClass } from '../lib/active.ts';
import { parseSearch, stringifySearch, usersView } from '../lib/search.ts';
import { viewJson } from '../lib/users-view.ts';
import { here } from '../lib/where.ts';

type Url = { readonly pathname: string; readonly search: string };

// The users route's usersView, which TanStack's retainSearchParams carries into every link under /dashboard/users.
export const usersSearch = shared(
	() => {
		const view = state({ json: '' });
		return { ...view };
	},
	{ scope: 'page' },
);

export function Dashboard({ url }: { url: Url }) @{
	const search = usersSearch();
	const at = here(url);
	const onUsers = at.pathname.startsWith('/dashboard/users');
	const landed = onUsers ? viewJson(usersView(parseSearch(at.search))) : '';
	const usersHref = computed(() => {
		const json = search.json || landed;
		// The old users route writes usersView into the address as it mounts, which needs code at load: the link carries it instead.
		return `/dashboard/users${stringifySearch({ usersView: JSON.parse(json || '{}') })}`;
	});
	const summary = isActive(at, '/dashboard', true);
	const invoices = isActive(at, '/dashboard/invoices');

	<>
		<div class="flex items-center border-b">
			<h2 class="text-xl p-2">Dashboard</h2>
		</div>
		<div class="flex flex-wrap divide-x">
			<a class={linkClass('p-2', summary)} href="/dashboard" data-status={summary ? 'active' : undefined} aria-current={summary ? 'page' : undefined}>
				Summary
			</a>
			<a class={linkClass('p-2', invoices)} href="/dashboard/invoices" data-status={invoices ? 'active' : undefined} aria-current={invoices ? 'page' : undefined}>
				Invoices
			</a>
			<a class={linkClass('p-2', onUsers)} href={usersHref} data-status={onUsers ? 'active' : undefined} aria-current={onUsers ? 'page' : undefined}>
				Users
			</a>
		</div>
		<hr />
	</>
}
