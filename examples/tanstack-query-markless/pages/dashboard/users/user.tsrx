import { computed, state } from '@markless/core';
import type { PageProps } from '@markless/router';
import { Dashboard, usersSearch } from '../../../components/dashboard.tsrx';
import { ErrorComponent } from '../../../components/error.tsrx';
import { Shell } from '../../../components/shell.tsrx';
import { bindRequest } from '../../../lib/request.ts';
import { here, onServer, storedSandbox } from '../../../lib/where.ts';
import { Spinner } from '../../../components/spinner.tsrx';
import { linkClass } from '../../../lib/active.ts';
import { fetchUserById, fetchUsers } from '../../../lib/data.ts';
import { documentLoad, redirect } from '../../../lib/page.ts';
import { parseSearch, stringifySearch, usersView } from '../../../lib/search.ts';
import type { User, UsersSortBy, UsersView } from '../../../lib/types.ts';
import { viewJson, writeView } from '../../../lib/users-view.ts';

export default function UserPage({ url, http }: PageProps) @{
	const ctx = onServer ? bindRequest(http) : undefined;
	const sandbox = ctx ? ctx.sandbox : storedSandbox();
	const search = parseSearch(here(url).search);
	const shared = usersSearch();
	const initial = usersView(search);
	let sortBy = state<UsersSortBy>(initial?.sortBy ?? 'name');
	let filterDraft = state(initial?.filterBy ?? '');
	let view = state<UsersView>(initial ?? {});
	let viewText = state(viewJson(initial));
	const users = computed(async () => fetchUsers());
	const activeUser = here(url).pathname === '/dashboard/users/user' ? Number(search.userId) : undefined;
	const rows = computed(() => {
		// While the list is still on its way in the browser this reads undefined (repros/sync-from-pending-async.tsrx).
		const all: User[] = Array.isArray(users) ? users : [];
		const by = sortBy;
		const filter = filterDraft.toLowerCase();
		const sorted = [...all].sort((a, b) => (a[by] > b[by] ? 1 : -1));
		const found = (filter ? sorted.filter((u) => u.name.toLowerCase().includes(filter)) : sorted).map((u) => {
			const href = `/dashboard/users/user${stringifySearch({ userId: u.id, usersView: JSON.parse(viewText) })}`;
			return { id: u.id, name: u.name, href, active: u.id === activeUser, hidden: false };
		});
		// An empty list would show @pending for good (repros/pages/empty-derived-list-attribute-rows.tsrx): one hidden row stands in.
		return found.length ? found : [{ id: 0, name: '', href: '', active: false, hidden: true }];
	});
	const userId = Number(search.userId);
	// The old users route's mount effect navigates to its own path on a fresh load, so a document load of a user lands on the users list.
	if (documentLoad(http)) redirect(http, `/dashboard/users${stringifySearch({ ...search, usersView: search.usersView ?? {} })}`);
	// Both strings are made in the recipe: reading `user.name` beside the whole `user` in one @try renders the name empty (repros/async-whole-and-field.tsrx).
	const user = computed(async () => {
		const which = userId;
		const found = await fetchUserById(which);
		return { name: found?.name ?? '', json: JSON.stringify(found, null, 2) };
	});

	<Shell url={url} sandbox={sandbox}>
		<Dashboard url={url} />
		<div class="flex-1 flex">
			<div class="divide-y">
				<div class="py-2 px-3 flex gap-2 items-center bg-gray-100 dark:bg-gray-800">
					<div>Sort By:</div>
					<select
						class="flex-1 border p-1 px-2 rounded-sm"
						value={sortBy}
						onChange={(event) => {
							sortBy = (event.target as HTMLSelectElement).value as UsersSortBy;
							const { filterBy } = view;
							view = { sortBy, ...(filterBy !== undefined ? { filterBy } : {}) };
							viewText = writeView(view);
							shared.json = viewText;
						}}
					>
						<option value="name">name</option>
						<option value="id">id</option>
						<option value="email">email</option>
					</select>
				</div>
				<div class="py-2 px-3 flex gap-2 items-center bg-gray-100 dark:bg-gray-800">
					<div>Filter By:</div>
					<input
						placeholder="Search Names..."
						class="min-w-0 flex-1 border p-1 px-2 rounded-sm"
						value={filterDraft}
						onInput={(event) => {
							filterDraft = (event.target as HTMLInputElement).value;
							const { sortBy: by } = view;
							view = { ...(by !== undefined ? { sortBy: by } : {}), ...(filterDraft ? { filterBy: filterDraft } : {}) };
							viewText = writeView(view);
							shared.json = viewText;
						}}
					/>
				</div>
				@try {
					@for (const row of rows; key row.id) {
						<div hidden={row.hidden}>
							<a
								class={linkClass('block py-2 px-3 text-blue-700', row.active)}
								href={row.href}
								data-status={row.active ? 'active' : undefined}
								aria-current={row.active ? 'page' : undefined}
							>
								<pre class="text-sm">
									{`${row.name} `}
									<div class="inline-block animate-spin px-3 transition duration-500 opacity-0 delay-0">⍥</div>
								</pre>
							</a>
						</div>
					}
				} @pending {
					<div class="p-2 text-2xl">
						<Spinner />
					</div>
				} @catch (error) {
					<ErrorComponent error={error} />
				}
			</div>
			<div class="flex-initial border-l">
				@try {
					<>
						<h4 class="p-2 font-bold">{user.name}</h4>
						<pre class="text-sm whitespace-pre-wrap">{user.json}</pre>
					</>
				} @pending {
					<div class="p-2 text-2xl">
						<Spinner />
					</div>
				} @catch (error) {
					<ErrorComponent error={error} />
				}
			</div>
		</div>
	</Shell>
}
