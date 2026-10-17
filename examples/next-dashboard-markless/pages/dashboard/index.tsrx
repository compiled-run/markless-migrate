import type { PageProps } from '@markless/router';
import DashboardLayout from '../../components/dashboard-layout.tsrx';
import { BanknotesIcon } from '../../components/icons/BanknotesIcon.tsrx';
import { ClockIcon } from '../../components/icons/ClockIcon.tsrx';
import { InboxIcon } from '../../components/icons/InboxIcon.tsrx';
import { UserGroupIcon } from '../../components/icons/UserGroupIcon.tsrx';
import { ArrowPathIcon } from '../../components/icons/ArrowPathIcon.tsrx';
import { CalendarIcon } from '../../components/icons/CalendarIcon.tsrx';
import snapshot from '../../server/overview.snapshot.json' with { type: 'json' };

export default function Page({ url }: PageProps) @{
	// Next prerenders this page at build time and never revalidates it; the overview is read once, at build (scripts/snapshot.ts).
	<DashboardLayout pathname={url.pathname}>
		<main>
			<h1 class="lusitana mb-4 text-xl md:text-2xl">Dashboard</h1>
			<div class="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
				<div class="rounded-xl bg-gray-50 p-2 shadow-sm">
					<div class="flex p-4">
						<BanknotesIcon iconClass="h-5 w-5 text-gray-700" />
						<h3 class="ml-2 text-sm font-medium">Collected</h3>
					</div>
					<p class="lusitana
          truncate rounded-xl bg-white px-4 py-8 text-center text-2xl">{snapshot.cards.totalPaidInvoices}</p>
				</div>
					<div class="rounded-xl bg-gray-50 p-2 shadow-sm">
					<div class="flex p-4">
						<ClockIcon iconClass="h-5 w-5 text-gray-700" />
						<h3 class="ml-2 text-sm font-medium">Pending</h3>
					</div>
					<p class="lusitana
          truncate rounded-xl bg-white px-4 py-8 text-center text-2xl">{snapshot.cards.totalPendingInvoices}</p>
				</div>
					<div class="rounded-xl bg-gray-50 p-2 shadow-sm">
					<div class="flex p-4">
						<InboxIcon iconClass="h-5 w-5 text-gray-700" />
						<h3 class="ml-2 text-sm font-medium">Total Invoices</h3>
					</div>
					<p class="lusitana
          truncate rounded-xl bg-white px-4 py-8 text-center text-2xl">{snapshot.cards.numberOfInvoices}</p>
				</div>
					<div class="rounded-xl bg-gray-50 p-2 shadow-sm">
					<div class="flex p-4">
						<UserGroupIcon iconClass="h-5 w-5 text-gray-700" />
						<h3 class="ml-2 text-sm font-medium">Total Customers</h3>
					</div>
					<p class="lusitana
          truncate rounded-xl bg-white px-4 py-8 text-center text-2xl">{snapshot.cards.numberOfCustomers}</p>
				</div>
			</div>
			<div class="mt-6 grid grid-cols-1 gap-6 md:grid-cols-4 lg:grid-cols-8">
					<div class="w-full md:col-span-4">
						<h2 class="lusitana mb-4 text-xl md:text-2xl">Recent Revenue</h2>
						<div class="rounded-xl bg-gray-50 p-4">
							<div class="sm:grid-cols-13 mt-0 grid grid-cols-12 items-end gap-2 rounded-md bg-white p-4 md:gap-4">
								<div class="mb-6 hidden flex-col justify-between text-sm text-gray-400 sm:flex" style="height:350px">
									@for (const label of snapshot.yAxisLabels; key label) {
										<p>{label}</p>
									}
								</div>
								@for (const month of snapshot.months; key month.month) {
									<div class="flex flex-col items-center gap-2">
										<div class="w-full rounded-md bg-blue-300" style={`height:${month.height}`}></div>
										<p class="-rotate-90 text-sm text-gray-400 sm:rotate-0">{month.month}</p>
									</div>
								}
							</div>
							<div class="flex items-center pb-2 pt-6">
								<CalendarIcon iconClass="h-5 w-5 text-gray-500" />
								<h3 class="ml-2 text-sm text-gray-500 ">Last 12 months</h3>
							</div>
						</div>
					</div>
					<div class="flex w-full flex-col md:col-span-4">
						<h2 class="lusitana mb-4 text-xl md:text-2xl">Latest Invoices</h2>
						<div class="flex grow flex-col justify-between rounded-xl bg-gray-50 p-4">
							<div class="bg-white px-6">
								@for (const invoice of snapshot.latest; key invoice.id) {
									<div class={invoice.rowClass}>
										<div class="flex items-center">
											<img alt={`${invoice.name}'s profile picture`} loading="lazy" width="32" height="32" decoding="async" class="mr-4 rounded-full" style="color:transparent" srcset={invoice.image.srcset} src={invoice.image.src} />
											<div class="min-w-0">
												<p class="truncate text-sm font-semibold md:text-base">{invoice.name}</p>
												<p class="hidden text-sm text-gray-500 sm:block">{invoice.email}</p>
											</div>
										</div>
										<p class="lusitana truncate text-sm font-medium md:text-base">{invoice.amount}</p>
									</div>
								}
							</div>
							<div class="flex items-center pb-2 pt-6">
								<ArrowPathIcon iconClass="h-5 w-5 text-gray-500" />
								<h3 class="ml-2 text-sm text-gray-500 ">Updated just now</h3>
							</div>
						</div>
					</div>
			</div>
		</main>
	</DashboardLayout>
}
