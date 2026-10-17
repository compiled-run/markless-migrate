import { computed, state } from '@markless/core';
import type { PageProps } from '@markless/router';
import DashboardLayout from '../../components/dashboard-layout.tsrx';
import { MagnifyingGlassIcon } from '../../components/icons/MagnifyingGlassIcon.tsrx';
import { debounce } from '../../lib/forms.ts';
import CustomersTable from '../../components/customers-table.tsrx';
import { loadCustomers, loadQuery } from '../../lib/load.ts';
import { nextSearch } from '../../lib/search.ts';

export default function Page({ url }: PageProps) @{
	let search = state('');
	const initial = computed(async () => loadQuery());
	const customers = computed(async () => {
		const s = search;
		return loadCustomers(s);
	});
	<DashboardLayout pathname={url.pathname}>
		<main>
			<div class="w-full">
				<h1 class="lusitana mb-8 text-xl md:text-2xl">Customers</h1>
				@try {
					<div class="relative flex flex-1 flex-shrink-0">
						<label for="search" class="sr-only">Search</label>
						<input
							class="peer block w-full rounded-md border border-gray-200 py-[9px] pl-10 text-sm outline-2 placeholder:text-gray-500"
							placeholder="Search customers..."
							value={initial.query}
							onInput={(event) => {
								const term = (event.target as HTMLInputElement).value;
								debounce(() => (search = nextSearch(term)), 300);
							}}
						/>
						<MagnifyingGlassIcon iconClass="absolute left-3 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-gray-500 peer-focus:text-gray-900" />
					</div>
				} @pending {
					<div class="relative flex flex-1 flex-shrink-0"></div>
				}
				@try {
					<CustomersTable customers={customers} />
				} @pending {
					<div></div>
				} @catch {
					<p>Failed to fetch customer table.</p>
				}
			</div>
		</main>
	</DashboardLayout>
}
