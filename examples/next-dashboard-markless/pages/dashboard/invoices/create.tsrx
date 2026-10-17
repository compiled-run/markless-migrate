import { computed } from '@markless/core';
import type { PageProps } from '@markless/router';
import DashboardLayout from '../../../components/dashboard-layout.tsrx';
import Breadcrumbs from '../../../components/breadcrumbs.tsrx';
import InvoiceForm from '../../../components/invoice-form.tsrx';
import InvoicesError from '../../../components/invoices-error.tsrx';
import { loadCreate } from '../../../lib/load.ts';

export default function Page({ url }: PageProps) @{
	const customers = computed(async () => loadCreate());
	<DashboardLayout pathname={url.pathname}>
		@try {
			<main>
				<Breadcrumbs label="Create Invoice" href="/dashboard/invoices/create" />
				<InvoiceForm action="/api/invoices" customers={customers} customerId="" amount="" status="" submitLabel="Create Invoice" edit={false} />
			</main>
		} @pending {
			<main></main>
		} @catch {
			<InvoicesError />
		}
	</DashboardLayout>
}
