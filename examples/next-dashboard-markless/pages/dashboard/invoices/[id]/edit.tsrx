import { computed } from '@markless/core';
import type { PageProps } from '@markless/router';
import DashboardLayout from '../../../../components/dashboard-layout.tsrx';
import Breadcrumbs from '../../../../components/breadcrumbs.tsrx';
import InvoiceForm from '../../../../components/invoice-form.tsrx';
import InvoiceNotFound from '../../../../components/invoice-not-found.tsrx';
import InvoicesError from '../../../../components/invoices-error.tsrx';
import { loadEdit } from '../../../../lib/load.ts';

export default function Page({ url, params }: PageProps<{ id: string }>) @{
	const data = computed(async () => {
		const id = params.id;
		const found = await loadEdit(id);
		return { found: Boolean(found), customers: found?.customers ?? [], customerId: found?.invoice.customer_id ?? '', amount: found ? String(found.invoice.amount) : '', status: found?.invoice.status ?? '', href: `/dashboard/invoices/${id}/edit`, action: `/api/invoices/${id}` };
	});
	<DashboardLayout pathname={url.pathname}>
		@try {
			@if (data.found) {
				<main>
					<Breadcrumbs label="Edit Invoice" href={data.href} />
					<InvoiceForm action={data.action} customers={data.customers} customerId={data.customerId} amount={data.amount} status={data.status} submitLabel="Edit Invoice" edit={true} />
				</main>
			} @else {
				<InvoiceNotFound />
			}
		} @pending {
			<main></main>
		} @catch {
			<InvoicesError />
		}
	</DashboardLayout>
}
