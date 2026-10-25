import { computed, state } from '@markless/core';
import type { PageProps } from '@markless/router';
import { Dashboard } from '../../components/dashboard.tsrx';
import { Shell } from '../../components/shell.tsrx';
import { bindRequest } from '../../lib/request.ts';
import { here, onServer, storedSandbox } from '../../lib/where.ts';
import { Spinner } from '../../components/spinner.tsrx';
import { fetchInvoices } from '../../lib/data.ts';

export default function DashboardIndex({ url, http }: PageProps) @{
	const ctx = onServer ? bindRequest(http) : undefined;
	const sandbox = ctx ? ctx.sandbox : storedSandbox();
	const invoices = computed(async () => fetchInvoices());

	<Shell url={url} sandbox={sandbox}>
		<Dashboard url={url} />
		@try {
			<div class="p-2">
				<div class="p-2">
					{'Welcome to the dashboard! You have '}
					<strong>{`${invoices.length} total invoices`}</strong>
					{'.'}
				</div>
			</div>
		} @pending {
			<div class="p-2 text-2xl">
				<Spinner />
			</div>
		}
	</Shell>
}
