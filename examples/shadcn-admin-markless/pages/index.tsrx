// The dashboard (features/dashboard/index.tsx): cards, the overview and analytics charts, recent sales.
// Markup from the old app's rendered DOM (deploy/shadcn-admin/scripts/gen-dashboard.py); tabs on
// @markless/ui tabs; the charts drawn by the recharts port (public/parity/recharts.js).
import { tabs } from '@markless/ui';
import { Shell } from '../components/layout/shell.tsrx';
import { AnalyticsChart, OverviewChart } from '../lib/parity/recharts/charts.tsrx';

export default function Dashboard() @{
	<Shell active="/" topNav={true}>
		<main data-layout="auto" class="px-4 py-6 @7xl/content:mx-auto @7xl/content:w-full @7xl/content:max-w-7xl">
			<div class="mb-2 flex items-center justify-between space-y-2">
				<h1 class="text-2xl font-bold tracking-tight">Dashboard</h1>
				<div class="flex items-center space-x-2">
					<button data-slot="button" class="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive bg-primary text-primary-foreground shadow-xs hover:bg-primary/90 h-9 px-4 py-2 has-[>svg]:px-3">Download</button>
				</div>
			</div>
			<tabs.root value="overview" orientation="vertical" dir="ltr" data-orientation="vertical" data-slot="tabs" class="flex flex-col gap-2 space-y-4">
				<div class="w-full overflow-x-auto pb-2">
					<tabs.list data-slot="tabs-list" class="inline-flex h-9 w-fit items-center justify-center rounded-lg bg-muted p-0.75 text-muted-foreground" data-orientation="vertical" style="outline: none;">
						<tabs.trigger value="overview" data-slot="tabs-trigger" class="inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-2 py-1 text-sm font-medium whitespace-nowrap text-foreground transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 [&[ui-selected]]:bg-background [&[ui-selected]]:shadow-sm dark:text-muted-foreground dark:[&[ui-selected]]:border-input dark:[&[ui-selected]]:bg-input/30 dark:[&[ui-selected]]:text-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4" data-orientation="vertical">Overview</tabs.trigger>
						<tabs.trigger value="analytics" data-slot="tabs-trigger" class="inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-2 py-1 text-sm font-medium whitespace-nowrap text-foreground transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 [&[ui-selected]]:bg-background [&[ui-selected]]:shadow-sm dark:text-muted-foreground dark:[&[ui-selected]]:border-input dark:[&[ui-selected]]:bg-input/30 dark:[&[ui-selected]]:text-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4" data-orientation="vertical">Analytics</tabs.trigger>
						<tabs.trigger value="reports" disabled data-slot="tabs-trigger" class="inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-2 py-1 text-sm font-medium whitespace-nowrap text-foreground transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 [&[ui-selected]]:bg-background [&[ui-selected]]:shadow-sm dark:text-muted-foreground dark:[&[ui-selected]]:border-input dark:[&[ui-selected]]:bg-input/30 dark:[&[ui-selected]]:text-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4" data-orientation="vertical">Reports</tabs.trigger>
						<tabs.trigger value="notifications" disabled data-slot="tabs-trigger" class="inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-2 py-1 text-sm font-medium whitespace-nowrap text-foreground transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 [&[ui-selected]]:bg-background [&[ui-selected]]:shadow-sm dark:text-muted-foreground dark:[&[ui-selected]]:border-input dark:[&[ui-selected]]:bg-input/30 dark:[&[ui-selected]]:text-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4" data-orientation="vertical">Notifications</tabs.trigger>
					</tabs.list>
				</div>
				<tabs.content value="overview" aria-label="Overview" data-orientation="vertical" data-slot="tabs-content" class="flex-1 outline-none space-y-4">
					<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
						<div data-slot="card" class="flex flex-col gap-6 rounded-xl border bg-card py-6 text-card-foreground shadow-sm">
							<div data-slot="card-header" class="@container/card-header auto-rows-min grid-rows-[auto_auto] gap-1.5 px-6 has-data-[slot=card-action]:grid-cols-[1fr_auto] [.border-b]:pb-6 flex flex-row items-center justify-between space-y-0 pb-2">
								<div data-slot="card-title" class="text-sm font-medium">Total Revenue</div>
								<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" class="h-4 w-4 text-muted-foreground">
									<path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
								</svg>
							</div>
							<div data-slot="card-content" class="px-6">
								<div class="text-2xl font-bold">$45,231.89</div>
								<p class="text-xs text-muted-foreground">+20.1% from last month</p>
							</div>
						</div>
						<div data-slot="card" class="flex flex-col gap-6 rounded-xl border bg-card py-6 text-card-foreground shadow-sm">
							<div data-slot="card-header" class="@container/card-header auto-rows-min grid-rows-[auto_auto] gap-1.5 px-6 has-data-[slot=card-action]:grid-cols-[1fr_auto] [.border-b]:pb-6 flex flex-row items-center justify-between space-y-0 pb-2">
								<div data-slot="card-title" class="text-sm font-medium">Subscriptions</div>
								<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" class="h-4 w-4 text-muted-foreground">
									<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
									<circle cx="9" cy="7" r="4" />
									<path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
								</svg>
							</div>
							<div data-slot="card-content" class="px-6">
								<div class="text-2xl font-bold">+2350</div>
								<p class="text-xs text-muted-foreground">+180.1% from last month</p>
							</div>
						</div>
						<div data-slot="card" class="flex flex-col gap-6 rounded-xl border bg-card py-6 text-card-foreground shadow-sm">
							<div data-slot="card-header" class="@container/card-header auto-rows-min grid-rows-[auto_auto] gap-1.5 px-6 has-data-[slot=card-action]:grid-cols-[1fr_auto] [.border-b]:pb-6 flex flex-row items-center justify-between space-y-0 pb-2">
								<div data-slot="card-title" class="text-sm font-medium">Sales</div>
								<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" class="h-4 w-4 text-muted-foreground">
									<rect width="20" height="14" x="2" y="5" rx="2" />
									<path d="M2 10h20" />
								</svg>
							</div>
							<div data-slot="card-content" class="px-6">
								<div class="text-2xl font-bold">+12,234</div>
								<p class="text-xs text-muted-foreground">+19% from last month</p>
							</div>
						</div>
						<div data-slot="card" class="flex flex-col gap-6 rounded-xl border bg-card py-6 text-card-foreground shadow-sm">
							<div data-slot="card-header" class="@container/card-header auto-rows-min grid-rows-[auto_auto] gap-1.5 px-6 has-data-[slot=card-action]:grid-cols-[1fr_auto] [.border-b]:pb-6 flex flex-row items-center justify-between space-y-0 pb-2">
								<div data-slot="card-title" class="text-sm font-medium">Active Now</div>
								<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" class="h-4 w-4 text-muted-foreground">
									<path d="M22 12h-4l-3 9L9 3l-3 9H2" />
								</svg>
							</div>
							<div data-slot="card-content" class="px-6">
								<div class="text-2xl font-bold">+573</div>
								<p class="text-xs text-muted-foreground">+201 since last hour</p>
							</div>
						</div>
					</div>
					<div class="grid grid-cols-1 gap-4 lg:grid-cols-7">
						<div data-slot="card" class="flex flex-col gap-6 rounded-xl border bg-card py-6 text-card-foreground shadow-sm col-span-1 lg:col-span-4">
							<div data-slot="card-header" class="@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-1.5 px-6 has-data-[slot=card-action]:grid-cols-[1fr_auto] [.border-b]:pb-6">
								<div data-slot="card-title" class="leading-none font-semibold">Overview</div>
							</div>
							<div data-slot="card-content" class="px-6 ps-2">
								<OverviewChart />
							</div>
						</div>
						<div data-slot="card" class="flex flex-col gap-6 rounded-xl border bg-card py-6 text-card-foreground shadow-sm col-span-1 lg:col-span-3">
							<div data-slot="card-header" class="@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-1.5 px-6 has-data-[slot=card-action]:grid-cols-[1fr_auto] [.border-b]:pb-6">
								<div data-slot="card-title" class="leading-none font-semibold">Recent Sales</div>
								<div data-slot="card-description" class="text-sm text-muted-foreground">You made 265 sales this month.</div>
							</div>
							<div data-slot="card-content" class="px-6">
								<div class="space-y-8">
									<div class="flex items-center gap-4">
										<span data-slot="avatar" class="relative flex size-8 shrink-0 overflow-hidden rounded-full h-9 w-9">
											<span data-slot="avatar-fallback" class="flex size-full items-center justify-center rounded-full bg-muted">OM</span>
										</span>
										<div class="flex flex-1 flex-wrap items-center justify-between">
											<div class="space-y-1">
												<p class="text-sm leading-none font-medium">Olivia Martin</p>
												<p class="text-sm text-muted-foreground">{'olivia.martin@email.com'}</p>
											</div>
											<div class="font-medium">+$1,999.00</div>
										</div>
									</div>
									<div class="flex items-center gap-4">
										<span data-slot="avatar" class="relative size-8 shrink-0 overflow-hidden rounded-full flex h-9 w-9 items-center justify-center space-y-0 border">
											<span data-slot="avatar-fallback" class="flex size-full items-center justify-center rounded-full bg-muted">JL</span>
										</span>
										<div class="flex flex-1 flex-wrap items-center justify-between">
											<div class="space-y-1">
												<p class="text-sm leading-none font-medium">Jackson Lee</p>
												<p class="text-sm text-muted-foreground">{'jackson.lee@email.com'}</p>
											</div>
											<div class="font-medium">+$39.00</div>
										</div>
									</div>
									<div class="flex items-center gap-4">
										<span data-slot="avatar" class="relative flex size-8 shrink-0 overflow-hidden rounded-full h-9 w-9">
											<span data-slot="avatar-fallback" class="flex size-full items-center justify-center rounded-full bg-muted">IN</span>
										</span>
										<div class="flex flex-1 flex-wrap items-center justify-between">
											<div class="space-y-1">
												<p class="text-sm leading-none font-medium">Isabella Nguyen</p>
												<p class="text-sm text-muted-foreground">{'isabella.nguyen@email.com'}</p>
											</div>
											<div class="font-medium">+$299.00</div>
										</div>
									</div>
									<div class="flex items-center gap-4">
										<span data-slot="avatar" class="relative flex size-8 shrink-0 overflow-hidden rounded-full h-9 w-9">
											<span data-slot="avatar-fallback" class="flex size-full items-center justify-center rounded-full bg-muted">WK</span>
										</span>
										<div class="flex flex-1 flex-wrap items-center justify-between">
											<div class="space-y-1">
												<p class="text-sm leading-none font-medium">William Kim</p>
												<p class="text-sm text-muted-foreground">{'will@email.com'}</p>
											</div>
											<div class="font-medium">+$99.00</div>
										</div>
									</div>
									<div class="flex items-center gap-4">
										<span data-slot="avatar" class="relative flex size-8 shrink-0 overflow-hidden rounded-full h-9 w-9">
											<span data-slot="avatar-fallback" class="flex size-full items-center justify-center rounded-full bg-muted">SD</span>
										</span>
										<div class="flex flex-1 flex-wrap items-center justify-between">
											<div class="space-y-1">
												<p class="text-sm leading-none font-medium">Sofia Davis</p>
												<p class="text-sm text-muted-foreground">{'sofia.davis@email.com'}</p>
											</div>
											<div class="font-medium">+$39.00</div>
										</div>
									</div>
								</div>
							</div>
						</div>
					</div>
				</tabs.content>
				<tabs.content value="analytics" aria-label="Analytics" data-orientation="vertical" data-slot="tabs-content" class="flex-1 outline-none space-y-4">
						<div class="space-y-4">
							<div data-slot="card" class="flex flex-col gap-6 rounded-xl border bg-card py-6 text-card-foreground shadow-sm">
								<div data-slot="card-header" class="@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-1.5 px-6 has-data-[slot=card-action]:grid-cols-[1fr_auto] [.border-b]:pb-6">
									<div data-slot="card-title" class="leading-none font-semibold">Traffic Overview</div>
									<div data-slot="card-description" class="text-sm text-muted-foreground">Weekly clicks and unique visitors</div>
								</div>
								<div data-slot="card-content" class="px-6">
									<AnalyticsChart />
								</div>
							</div>
							<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
								<div data-slot="card" class="flex flex-col gap-6 rounded-xl border bg-card py-6 text-card-foreground shadow-sm">
									<div data-slot="card-header" class="@container/card-header auto-rows-min grid-rows-[auto_auto] gap-1.5 px-6 has-data-[slot=card-action]:grid-cols-[1fr_auto] [.border-b]:pb-6 flex flex-row items-center justify-between space-y-0 pb-2">
										<div data-slot="card-title" class="text-sm font-medium">Total Clicks</div>
										<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" class="h-4 w-4 text-muted-foreground">
											<path d="M3 3v18h18" />
											<path d="M7 15l4-4 4 4 4-6" />
										</svg>
									</div>
									<div data-slot="card-content" class="px-6">
										<div class="text-2xl font-bold">1,248</div>
										<p class="text-xs text-muted-foreground">+12.4% vs last week</p>
									</div>
								</div>
								<div data-slot="card" class="flex flex-col gap-6 rounded-xl border bg-card py-6 text-card-foreground shadow-sm">
									<div data-slot="card-header" class="@container/card-header auto-rows-min grid-rows-[auto_auto] gap-1.5 px-6 has-data-[slot=card-action]:grid-cols-[1fr_auto] [.border-b]:pb-6 flex flex-row items-center justify-between space-y-0 pb-2">
										<div data-slot="card-title" class="text-sm font-medium">Unique Visitors</div>
										<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" class="h-4 w-4 text-muted-foreground">
											<circle cx="12" cy="7" r="4" />
											<path d="M6 21v-2a6 6 0 0 1 12 0v2" />
										</svg>
									</div>
									<div data-slot="card-content" class="px-6">
										<div class="text-2xl font-bold">832</div>
										<p class="text-xs text-muted-foreground">+5.8% vs last week</p>
									</div>
								</div>
								<div data-slot="card" class="flex flex-col gap-6 rounded-xl border bg-card py-6 text-card-foreground shadow-sm">
									<div data-slot="card-header" class="@container/card-header auto-rows-min grid-rows-[auto_auto] gap-1.5 px-6 has-data-[slot=card-action]:grid-cols-[1fr_auto] [.border-b]:pb-6 flex flex-row items-center justify-between space-y-0 pb-2">
										<div data-slot="card-title" class="text-sm font-medium">Bounce Rate</div>
										<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" class="h-4 w-4 text-muted-foreground">
											<path d="M3 12h6l3 6 3-6h6" />
										</svg>
									</div>
									<div data-slot="card-content" class="px-6">
										<div class="text-2xl font-bold">42%</div>
										<p class="text-xs text-muted-foreground">-3.2% vs last week</p>
									</div>
								</div>
								<div data-slot="card" class="flex flex-col gap-6 rounded-xl border bg-card py-6 text-card-foreground shadow-sm">
									<div data-slot="card-header" class="@container/card-header auto-rows-min grid-rows-[auto_auto] gap-1.5 px-6 has-data-[slot=card-action]:grid-cols-[1fr_auto] [.border-b]:pb-6 flex flex-row items-center justify-between space-y-0 pb-2">
										<div data-slot="card-title" class="text-sm font-medium">Avg. Session</div>
										<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" class="h-4 w-4 text-muted-foreground">
											<circle cx="12" cy="12" r="10" />
											<path d="M12 6v6l4 2" />
										</svg>
									</div>
									<div data-slot="card-content" class="px-6">
										<div class="text-2xl font-bold">3m 24s</div>
										<p class="text-xs text-muted-foreground">+18s vs last week</p>
									</div>
								</div>
							</div>
							<div class="grid grid-cols-1 gap-4 lg:grid-cols-7">
								<div data-slot="card" class="flex flex-col gap-6 rounded-xl border bg-card py-6 text-card-foreground shadow-sm col-span-1 lg:col-span-4">
									<div data-slot="card-header" class="@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-1.5 px-6 has-data-[slot=card-action]:grid-cols-[1fr_auto] [.border-b]:pb-6">
										<div data-slot="card-title" class="leading-none font-semibold">Referrers</div>
										<div data-slot="card-description" class="text-sm text-muted-foreground">Top sources driving traffic</div>
									</div>
									<div data-slot="card-content" class="px-6">
										<ul class="space-y-3">
											<li class="flex items-center justify-between gap-3">
												<div class="min-w-0 flex-1">
													<div class="mb-1 truncate text-xs text-muted-foreground">Direct</div>
													<div class="h-2.5 w-full rounded-full bg-muted">
														<div class="h-2.5 rounded-full bg-primary" style="width: 100%;"></div>
													</div>
												</div>
												<div class="ps-2 text-xs font-medium tabular-nums">512</div>
											</li>
											<li class="flex items-center justify-between gap-3">
												<div class="min-w-0 flex-1">
													<div class="mb-1 truncate text-xs text-muted-foreground">Product Hunt</div>
													<div class="h-2.5 w-full rounded-full bg-muted">
														<div class="h-2.5 rounded-full bg-primary" style="width: 46%;"></div>
													</div>
												</div>
												<div class="ps-2 text-xs font-medium tabular-nums">238</div>
											</li>
											<li class="flex items-center justify-between gap-3">
												<div class="min-w-0 flex-1">
													<div class="mb-1 truncate text-xs text-muted-foreground">Twitter</div>
													<div class="h-2.5 w-full rounded-full bg-muted">
														<div class="h-2.5 rounded-full bg-primary" style="width: 34%;"></div>
													</div>
												</div>
												<div class="ps-2 text-xs font-medium tabular-nums">174</div>
											</li>
											<li class="flex items-center justify-between gap-3">
												<div class="min-w-0 flex-1">
													<div class="mb-1 truncate text-xs text-muted-foreground">Blog</div>
													<div class="h-2.5 w-full rounded-full bg-muted">
														<div class="h-2.5 rounded-full bg-primary" style="width: 20%;"></div>
													</div>
												</div>
												<div class="ps-2 text-xs font-medium tabular-nums">104</div>
											</li>
										</ul>
									</div>
								</div>
								<div data-slot="card" class="flex flex-col gap-6 rounded-xl border bg-card py-6 text-card-foreground shadow-sm col-span-1 lg:col-span-3">
									<div data-slot="card-header" class="@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-1.5 px-6 has-data-[slot=card-action]:grid-cols-[1fr_auto] [.border-b]:pb-6">
										<div data-slot="card-title" class="leading-none font-semibold">Devices</div>
										<div data-slot="card-description" class="text-sm text-muted-foreground">How users access your app</div>
									</div>
									<div data-slot="card-content" class="px-6">
										<ul class="space-y-3">
											<li class="flex items-center justify-between gap-3">
												<div class="min-w-0 flex-1">
													<div class="mb-1 truncate text-xs text-muted-foreground">Desktop</div>
													<div class="h-2.5 w-full rounded-full bg-muted">
														<div class="h-2.5 rounded-full bg-muted-foreground" style="width: 100%;"></div>
													</div>
												</div>
												<div class="ps-2 text-xs font-medium tabular-nums">74%</div>
											</li>
											<li class="flex items-center justify-between gap-3">
												<div class="min-w-0 flex-1">
													<div class="mb-1 truncate text-xs text-muted-foreground">Mobile</div>
													<div class="h-2.5 w-full rounded-full bg-muted">
														<div class="h-2.5 rounded-full bg-muted-foreground" style="width: 30%;"></div>
													</div>
												</div>
												<div class="ps-2 text-xs font-medium tabular-nums">22%</div>
											</li>
											<li class="flex items-center justify-between gap-3">
												<div class="min-w-0 flex-1">
													<div class="mb-1 truncate text-xs text-muted-foreground">Tablet</div>
													<div class="h-2.5 w-full rounded-full bg-muted">
														<div class="h-2.5 rounded-full bg-muted-foreground" style="width: 5%;"></div>
													</div>
												</div>
												<div class="ps-2 text-xs font-medium tabular-nums">4%</div>
											</li>
										</ul>
									</div>
								</div>
							</div>
						</div>
				</tabs.content>
			</tabs.root>
			<script src="/parity/recharts.js"></script>
		</main>
	</Shell>
}
