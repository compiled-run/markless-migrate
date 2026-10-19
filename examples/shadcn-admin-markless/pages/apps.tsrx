import { computed, state } from '@markless/core';
import type { PageProps } from '@markless/router';
import { Shell } from '../components/layout/shell.tsrx';
import { layoutPrefs } from '../components/layout/prefs.ts';
import { AppLogo } from '../components/apps/app-logo.tsrx';
import { DropdownMenuContent, DropdownMenuTrigger, SelectItem } from '../lib/parity/radix-ui-react-dropdown-menu/menu.tsrx';
import { connectClass, filteredApps, initialSearch, navigateSearch } from '../lib/apps.ts';

export default function Apps({ http, url }: PageProps) @{
	const prefs = layoutPrefs(http.request.headers.get('cookie'));
	const initial = initialSearch(url.search);
	let filter = state(initial.filter);
	let type = state<string>(initial.type);
	let sort = state<string>(initial.sort);
	const apps = computed(() => filteredApps(filter, type, sort));
	const typeLabel = computed(() => (type === 'connected' ? 'Connected' : type === 'notConnected' ? 'Not Connected' : 'All Apps'));
	const typeAll = computed(() => (type === 'all' ? 'true' : 'false'));
	const typeConnected = computed(() => (type === 'connected' ? 'true' : 'false'));
	const typeNotConnected = computed(() => (type === 'notConnected' ? 'true' : 'false'));
	const sortAsc = computed(() => (sort === 'asc' ? 'true' : 'false'));
	const sortDesc = computed(() => (sort === 'desc' ? 'true' : 'false'));

	<Shell active="/apps" header="search" fixed={false} prefs={prefs}>
		<main data-layout="fixed" class="px-4 py-6 flex grow flex-col overflow-hidden @7xl/content:mx-auto @7xl/content:w-full @7xl/content:max-w-7xl">
			<div>
				<h1 class="text-2xl font-bold tracking-tight">App Integrations</h1>
				<p class="text-muted-foreground">{"Here's a list of your apps for the integration!"}</p>
			</div>
			<div class="my-4 flex items-end justify-between sm:my-0 sm:items-center">
				<div class="flex flex-col gap-4 sm:my-4 sm:flex-row">
					<input data-slot="input" class="flex min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none selection:bg-primary selection:text-primary-foreground file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-input/30 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 h-9 w-40 lg:w-62.5" placeholder="Filter apps..." value={filter} onInput={(event) => {
						filter = (event.target as HTMLInputElement).value;
						navigateSearch('filter', filter || undefined);
					}} />
					<DropdownMenuTrigger menu="apps-type" haspopup="listbox" slot="select-trigger" role="combobox" aria-autocomplete="none" dir="ltr" data-size="default" class="flex items-center justify-between gap-2 rounded-md border border-input bg-transparent px-3 py-2 text-sm whitespace-nowrap shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 data-placeholder:text-muted-foreground data-[size=default]:h-9 data-[size=sm]:h-8 *:data-[slot=select-value]:line-clamp-1 *:data-[slot=select-value]:flex *:data-[slot=select-value]:items-center *:data-[slot=select-value]:gap-2 dark:bg-input/30 dark:hover:bg-input/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground w-36">
						<span data-slot="select-value" style="pointer-events: none;">{typeLabel}</span>
						<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-chevron-down size-4 opacity-50" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
					</DropdownMenuTrigger>
				</div>
				<DropdownMenuTrigger menu="apps-sort" haspopup="listbox" slot="select-trigger" role="combobox" aria-autocomplete="none" dir="ltr" data-size="default" class="flex items-center justify-between gap-2 rounded-md border border-input bg-transparent px-3 py-2 text-sm whitespace-nowrap shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 data-placeholder:text-muted-foreground data-[size=default]:h-9 data-[size=sm]:h-8 *:data-[slot=select-value]:line-clamp-1 *:data-[slot=select-value]:flex *:data-[slot=select-value]:items-center *:data-[slot=select-value]:gap-2 dark:bg-input/30 dark:hover:bg-input/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground w-16">
					<span data-slot="select-value" style="pointer-events: none;">
						<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-sliders-horizontal" aria-hidden="true"><path d="M10 5H3" /><path d="M12 19H3" /><path d="M14 3v4" /><path d="M16 17v4" /><path d="M21 12h-9" /><path d="M21 19h-5" /><path d="M21 5h-7" /><path d="M8 10v4" /><path d="M8 12H3" /></svg>
					</span>
					<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-chevron-down size-4 opacity-50" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
				</DropdownMenuTrigger>
			</div>
			<div data-orientation="horizontal" role="none" data-slot="separator" class="shrink-0 bg-border data-[orientation=horizontal]:h-px data-[orientation=horizontal]:w-full data-[orientation=vertical]:w-px shadow-sm"></div>
			<ul class="faded-bottom no-scrollbar grid gap-4 overflow-auto pt-4 pb-16 md:grid-cols-2 lg:grid-cols-3">
				@for (const app of apps; key app.name) {
					<li class="rounded-lg border p-4 hover:shadow-md">
						<div class="mb-8 flex items-center justify-between">
							<div class="flex size-10 items-center justify-center rounded-lg bg-muted p-2">
								<AppLogo name={app.name} />
							</div>
							<button data-slot="button" class={connectClass(app.connected)}>{app.connected ? 'Connected' : 'Connect'}</button>
						</div>
						<div>
							<h2 class="mb-1 font-semibold">{app.name}</h2>
							<p class="line-clamp-2 text-gray-500">{app.desc}</p>
						</div>
					</li>
				}
			</ul>
		</main>
		<DropdownMenuContent menu="apps-type" role="listbox" slot="select-content" side="bottom" align="start" class="relative z-50 max-h-(--radix-select-content-available-height) min-w-32 origin-(--radix-select-content-transform-origin) overflow-x-hidden overflow-y-auto rounded-md border bg-popover text-popover-foreground shadow-md data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1 p-0">
			<div data-radix-select-viewport="" role="presentation" class="p-1 h-(--radix-select-trigger-height) w-full min-w-(--radix-select-trigger-width) scroll-my-1" style="position: relative; flex: 1 1 0%; overflow: hidden auto;">
				<SelectItem menu="apps-type" selected={typeAll} onSelect={() => {
					if (type !== 'all') {
						type = 'all';
						navigateSearch('type', undefined);
					}
				}}>All Apps</SelectItem>
				<SelectItem menu="apps-type" selected={typeConnected} onSelect={() => {
					if (type !== 'connected') {
						type = 'connected';
						navigateSearch('type', 'connected');
					}
				}}>Connected</SelectItem>
				<SelectItem menu="apps-type" selected={typeNotConnected} onSelect={() => {
					if (type !== 'notConnected') {
						type = 'notConnected';
						navigateSearch('type', 'notConnected');
					}
				}}>Not Connected</SelectItem>
			</div>
		</DropdownMenuContent>
		<DropdownMenuContent menu="apps-sort" role="listbox" slot="select-content" side="bottom" align="end" class="relative z-50 max-h-(--radix-select-content-available-height) min-w-32 origin-(--radix-select-content-transform-origin) overflow-x-hidden overflow-y-auto rounded-md border bg-popover text-popover-foreground shadow-md data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1 p-0">
			<div data-radix-select-viewport="" role="presentation" class="p-1 h-(--radix-select-trigger-height) w-full min-w-(--radix-select-trigger-width) scroll-my-1" style="position: relative; flex: 1 1 0%; overflow: hidden auto;">
				<SelectItem menu="apps-sort" selected={sortAsc} onSelect={() => {
					if (sort !== 'asc') {
						sort = 'asc';
						navigateSearch('sort', 'asc');
					}
				}}>
					<div class="flex items-center gap-4">
						<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-arrow-up-az lucide-arrow-up-a-z" aria-hidden="true"><path d="m3 8 4-4 4 4" /><path d="M7 4v16" /><path d="M20 8h-5" /><path d="M15 10V6.5a2.5 2.5 0 0 1 5 0V10" /><path d="M15 14h5l-5 6h5" /></svg>
						<span>Ascending</span>
					</div>
				</SelectItem>
				<SelectItem menu="apps-sort" selected={sortDesc} onSelect={() => {
					if (sort !== 'desc') {
						sort = 'desc';
						navigateSearch('sort', 'desc');
					}
				}}>
					<div class="flex items-center gap-4">
						<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-arrow-down-az lucide-arrow-down-a-z" aria-hidden="true"><path d="m3 16 4 4 4-4" /><path d="M7 20V4" /><path d="M20 8h-5" /><path d="M15 10V6.5a2.5 2.5 0 0 1 5 0V10" /><path d="M15 14h5l-5 6h5" /></svg>
						<span>Descending</span>
					</div>
				</SelectItem>
			</div>
		</DropdownMenuContent>
	</Shell>
}
