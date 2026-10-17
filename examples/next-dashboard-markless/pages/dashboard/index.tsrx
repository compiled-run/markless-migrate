import { computed } from '@markless/core';
import type { PageProps } from '@markless/router';
import DashboardLayout from '../../components/dashboard-layout.tsrx';
import { Card } from '../../components/cards.tsrx';
import { ArrowPathIcon } from '../../components/icons/ArrowPathIcon.tsrx';
import { CalendarIcon } from '../../components/icons/CalendarIcon.tsrx';
import { CardSkeleton } from '../../components/skeletons/CardSkeleton.tsrx';
import { LatestInvoicesSkeleton } from '../../components/skeletons/LatestInvoicesSkeleton.tsrx';
import { RevenueChartSkeleton } from '../../components/skeletons/RevenueChartSkeleton.tsrx';
import { loadOverview } from '../../lib/load.ts';

export default function Page({ url }: PageProps) @{
	const data = computed(async () => loadOverview());
	<DashboardLayout pathname={url.pathname}>
		<main>
			<h1 class="lusitana mb-4 text-xl md:text-2xl">Dashboard</h1>
			<div class="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
				@try {
					<>
					<Card title="Collected" value={data.cards.totalPaidInvoices} type="collected" />
					<Card title="Pending" value={data.cards.totalPendingInvoices} type="pending" />
					<Card title="Total Invoices" value={data.cards.numberOfInvoices} type="invoices" />
					<Card title="Total Customers" value={data.cards.numberOfCustomers} type="customers" />
					</>
				} @pending {
					<>
						<CardSkeleton />
						<CardSkeleton />
						<CardSkeleton />
						<CardSkeleton />
					</>
				} @catch {
					<p>Failed to fetch card data.</p>
				}
			</div>
			<div class="mt-6 grid grid-cols-1 gap-6 md:grid-cols-4 lg:grid-cols-8">
				@try {
					<>
					<div class="w-full md:col-span-4">
						<h2 class="lusitana mb-4 text-xl md:text-2xl">Recent Revenue</h2>
						<div class="rounded-xl bg-gray-50 p-4">
							<div class="sm:grid-cols-13 mt-0 grid grid-cols-12 items-end gap-2 rounded-md bg-white p-4 md:gap-4">
								<div class="mb-6 hidden flex-col justify-between text-sm text-gray-400 sm:flex" style="height:350px">
									@for (const label of data.yAxisLabels; key label) {
										<p>{label}</p>
									}
								</div>
								@for (const month of data.months; key month.month) {
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
								@for (const invoice of data.latest; key invoice.id) {
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
					</>
				} @pending {
					<>
					<RevenueChartSkeleton />
					<LatestInvoicesSkeleton />
					</>
				} @catch {
					<p>Failed to fetch revenue data.</p>
				}
			</div>
		</main>
	</DashboardLayout>
}
