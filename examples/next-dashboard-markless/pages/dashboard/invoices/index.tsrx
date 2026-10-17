import { computed, state } from '@markless/core';
import type { PageProps } from '@markless/router';
import DashboardLayout from '../../../components/dashboard-layout.tsrx';
import { MagnifyingGlassIcon } from '../../../components/icons/MagnifyingGlassIcon.tsrx';
import { debounce } from '../../../lib/forms.ts';
import InvoicesTable from '../../../components/invoices-table.tsrx';
import Pagination from '../../../components/pagination.tsrx';
import InvoicesError from '../../../components/invoices-error.tsrx';
import { CreateInvoice } from '../../../components/invoice-buttons.tsrx';
import { InvoicesTableSkeleton } from '../../../components/skeletons/InvoicesTableSkeleton.tsrx';
import { loadInvoices, loadQuery } from '../../../lib/load.ts';
import { nextSearch } from '../../../lib/search.ts';

export default function Page({ url }: PageProps) @{
	let search = state('');
	let version = state(0);
	const initial = computed(async () => loadQuery());
	const data = computed(async () => {
		const s = search;
		const v = version;
		return loadInvoices(s, v);
	});
	<DashboardLayout pathname={url.pathname}>
		<div class="w-full">
			<div class="flex w-full items-center justify-between">
				<h1 class="lusitana text-2xl">Invoices</h1>
			</div>
			<div class="mt-4 flex items-center justify-between gap-2 md:mt-8">
				@try {
					<div class="relative flex flex-1 flex-shrink-0">
						<label for="search" class="sr-only">Search</label>
						<input
							class="peer block w-full rounded-md border border-gray-200 py-[9px] pl-10 text-sm outline-2 placeholder:text-gray-500"
							placeholder="Search invoices..."
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
				<CreateInvoice />
			</div>
			@try {
				<InvoicesTable invoices={data.invoices} onDeleted={() => version++} />
			} @pending {
				<InvoicesTableSkeleton />
			} @catch {
				<InvoicesError />
			}
			<div class="mt-5 flex w-full justify-center">
				@try {
					<Pagination items={data.items} left={data.left} right={data.right} />
				} @pending {
					<></>
				}
			</div>
		</div>
	</DashboardLayout>
}
