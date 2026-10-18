// The old app's AuthenticatedLayout: sidebar (team switcher, nav groups, nav user), the header (sidebar
// trigger, top nav, search, theme switch, config drawer, profile menu) and the menus they open. The markup
// is the old app's rendered DOM (deploy/shadcn-admin/scripts/gen-shell.py); the behaviour is ported here.
import { computed, state } from '@markless/core';
import type { Children } from '@markless/core';
import {
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuLinkItem,
	DropdownMenuSeparator,
	DropdownMenuShortcut,
	DropdownMenuTrigger,
} from '../../lib/parity/radix-ui-react-dropdown-menu/menu.tsrx';
import { applyTheme, rememberSidebar } from './shell-behaviour.ts';
import { chosenCommand, closePalette, filterCommands, moveSelection, openPalette } from '../../lib/parity/cmdk/behaviour.ts';
import type { Toast } from '../../lib/parity/sonner/index.ts';
import { Toaster } from '../../lib/parity/sonner/toaster.tsrx';

export type ShellProps = {
	/** The route the page is: its sidebar link is the active one, and it picks the header. */
	readonly active: '/' | '/users';
	/** The dashboard's header: top nav links, and a header that scrolls away (the users page's stays fixed). */
	readonly topNav: boolean;
	readonly children?: Children;
};

export function Shell({ active, topNav, children }: ShellProps) @{
	let sidebarOpen = state(true);
	let clerkOpen = state(false);
	let authOpen = state(false);
	let errorsOpen = state(false);
	let settingsOpen = state(false);
	let team = state(0);
	let theme = state('system');
	let searchOpen = state(false);
	let drawerOpen = state(false);
	let toasts = state<Toast[]>([]);

	const sidebarState = computed(() => (sidebarOpen ? 'expanded' : 'collapsed'));
	const sidebarCollapsible = computed(() => (sidebarOpen ? '' : 'icon'));
	const clerkState = computed(() => (clerkOpen ? 'open' : 'closed'));
	const clerkExpanded = computed(() => (clerkOpen ? 'true' : 'false'));
	const clerkClosed = computed(() => !clerkOpen);
	const authState = computed(() => (authOpen ? 'open' : 'closed'));
	const authExpanded = computed(() => (authOpen ? 'true' : 'false'));
	const authClosed = computed(() => !authOpen);
	const errorsState = computed(() => (errorsOpen ? 'open' : 'closed'));
	const errorsExpanded = computed(() => (errorsOpen ? 'true' : 'false'));
	const errorsClosed = computed(() => !errorsOpen);
	const settingsState = computed(() => (settingsOpen ? 'open' : 'closed'));
	const settingsExpanded = computed(() => (settingsOpen ? 'true' : 'false'));
	const settingsClosed = computed(() => !settingsOpen);

	const dashboardActive = computed(() => (active === '/' ? 'true' : 'false'));
	const dashboardActiveClass = computed(() => (active === '/' ? ' active' : ''));
	const dashboardStatus = computed(() => (active === '/' ? 'active' : undefined));
	const dashboardCurrent = computed(() => (active === '/' ? 'page' : undefined));
	const usersActive = computed(() => (active === '/users' ? 'true' : 'false'));
	const usersActiveClass = computed(() => (active === '/users' ? ' active' : ''));
	const usersStatus = computed(() => (active === '/users' ? 'active' : undefined));
	const usersCurrent = computed(() => (active === '/users' ? 'page' : undefined));

	// A state value cannot index an array in a recipe (MARKLESS_SYMBOL_MODULE_UNRESOLVED_GRAPH_REFERENCE), so the three teams are spelled out.
	const teamName = computed(() => (team === 1 ? 'Acme Inc' : team === 2 ? 'Acme Corp.' : 'Shadcn Admin'));
	const teamPlan = computed(() => (team === 1 ? 'Enterprise' : team === 2 ? 'Startup' : 'Vite + ShadcnUI'));
	const lightCheck = computed(() => (theme === 'light' ? 'lucide lucide-check ms-auto' : 'lucide lucide-check ms-auto hidden'));
	const darkCheck = computed(() => (theme === 'dark' ? 'lucide lucide-check ms-auto' : 'lucide lucide-check ms-auto hidden'));
	const systemCheck = computed(() => (theme === 'system' ? 'lucide lucide-check ms-auto' : 'lucide lucide-check ms-auto hidden'));
	const searchClosed = computed(() => !searchOpen);
	const searchState = computed(() => (searchOpen ? 'open' : 'closed'));
	const drawerExpanded = computed(() => (drawerOpen ? 'true' : 'false'));
	const drawerState = computed(() => (drawerOpen ? 'open' : 'closed'));

	const toggleSidebar = () => {
		sidebarOpen = !sidebarOpen;
		rememberSidebar(sidebarOpen);
	};
	const openSearch = () => {
		searchOpen = true;
		openPalette();
	};
	const closeSearch = () => {
		searchOpen = false;
		closePalette();
	};
	const searchKeys = (event: KeyboardEvent) => {
		if (event.key === 'Escape' || event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Home' || event.key === 'End' || event.key === 'Enter') event.preventDefault();
		if (event.key === 'Escape') {
			searchOpen = false;
			closePalette();
		} else if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Home' || event.key === 'End') {
			moveSelection(event.key);
		} else if (event.key === 'Enter') {
			// Inline on purpose: a handler cannot call another function of the component (MARKLESS_EVENT_HANDLER_EMIT_UNSUPPORTED).
			const command = chosenCommand();
			if (command) {
				searchOpen = false;
				closePalette();
				if (command.theme) {
					theme = command.theme;
					applyTheme(command.theme);
				}
				if (command.url) location.assign(command.url);
			}
		}
	};
	const pickCommand = (event: MouseEvent) => {
		const command = chosenCommand(event.target);
		if (!command) return;
		searchOpen = false;
		closePalette();
		if (command.theme) {
			theme = command.theme;
			applyTheme(command.theme);
		}
		if (command.url) location.assign(command.url);
	};
	const openDrawer = () => {
		drawerOpen = true;
	};

	<div class="contents">
		<div data-slot="sidebar-wrapper" class="group/sidebar-wrapper flex min-h-svh w-full md:has-data-[variant=inset]:bg-sidebar" style="--sidebar-width: 16rem; --sidebar-width-icon: 3rem;">
			<a class="fixed inset-s-44 z-999 -translate-y-52 bg-primary px-4 py-2 text-sm font-medium whitespace-nowrap text-primary-foreground opacity-95 shadow-sm transition hover:bg-primary/90 focus:translate-y-3 focus:transform focus-visible:ring-1 focus-visible:ring-ring" href="#content">Skip to Main</a>
			<div class="group peer hidden text-sidebar-foreground md:block" data-state={sidebarState} data-collapsible={sidebarCollapsible} data-variant="inset" data-side="left" data-slot="sidebar">
				<div data-slot="sidebar-gap" class="relative w-(--sidebar-width) bg-transparent transition-[width] duration-200 ease-linear group-data-[collapsible=offcanvas]:w-0 group-data-[side=right]:rotate-180 group-data-[collapsible=icon]:w-[calc(var(--sidebar-width-icon)+(--spacing(4)))]"></div>
				<div data-slot="sidebar-container" class="fixed inset-y-0 z-10 hidden h-svh w-(--sidebar-width) transition-[inset-inline,width] duration-200 ease-linear md:flex inset-s-0 group-data-[collapsible=offcanvas]:-inset-s-[calc(var(--sidebar-width))] p-2 group-data-[collapsible=icon]:w-[calc(var(--sidebar-width-icon)+(--spacing(4))+2px)]">
					<div data-sidebar="sidebar" data-slot="sidebar-inner" class="flex h-full w-full flex-col bg-sidebar group-data-[variant=floating]:rounded-lg group-data-[variant=floating]:border group-data-[variant=floating]:border-sidebar-border group-data-[variant=floating]:shadow-sm">
						<div data-slot="sidebar-header" data-sidebar="header" class="flex flex-col gap-2 p-2">
							<ul data-slot="sidebar-menu" data-sidebar="menu" class="flex w-full min-w-0 flex-col gap-1">
								<li data-slot="sidebar-menu-item" data-sidebar="menu-item" class="group/menu-item relative">
									<DropdownMenuTrigger menu="team" data-sidebar="menu-button" data-size="lg" data-active="false" class="peer/menu-button flex w-full items-center gap-2 overflow-hidden rounded-md p-2 text-start outline-hidden ring-sidebar-ring transition-[width,height,padding] focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 group-has-data-[sidebar=menu-action]/menu-item:pe-8 aria-disabled:pointer-events-none aria-disabled:opacity-50 data-[active=true]:bg-sidebar-accent data-[active=true]:font-medium data-[active=true]:text-sidebar-accent-foreground data-[state=open]:hover:bg-sidebar-accent data-[state=open]:hover:text-sidebar-accent-foreground group-data-[collapsible=icon]:size-8! [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground h-12 text-sm group-data-[collapsible=icon]:p-0! data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground">
										<div class="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
											<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-command size-4" aria-hidden="true">
												<path d="M15 6v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3" />
											</svg>
										</div>
										<div class="grid flex-1 text-start text-sm leading-tight">
											<span class="truncate font-semibold">{teamName}</span>
											<span class="truncate text-xs">{teamPlan}</span>
										</div>
										<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-chevrons-up-down ms-auto" aria-hidden="true">
											<path d="m7 15 5 5 5-5" />
											<path d="m7 9 5-5 5 5" />
										</svg>
									</DropdownMenuTrigger>
								</li>
							</ul>
						</div>
						<div data-slot="sidebar-content" data-sidebar="content" class="flex min-h-0 flex-1 flex-col gap-2 overflow-auto group-data-[collapsible=icon]:overflow-hidden">
							<div data-slot="sidebar-group" data-sidebar="group" class="relative flex w-full min-w-0 flex-col p-2">
								<div data-slot="sidebar-group-label" data-sidebar="group-label" class="flex h-8 shrink-0 items-center rounded-md px-2 text-xs font-medium text-sidebar-foreground/70 ring-sidebar-ring outline-hidden transition-[margin,opacity] duration-200 ease-linear focus-visible:ring-2 [&>svg]:size-4 [&>svg]:shrink-0 group-data-[collapsible=icon]:-mt-8 group-data-[collapsible=icon]:opacity-0">General</div>
								<ul data-slot="sidebar-menu" data-sidebar="menu" class="flex w-full min-w-0 flex-col gap-1">
									<li data-slot="sidebar-menu-item" data-sidebar="menu-item" class="group/menu-item relative">
										<a data-slot="sidebar-menu-button" data-sidebar="menu-button" data-size="default" data-active={dashboardActive} data-state="closed" class={"peer/menu-button flex w-full items-center gap-2 overflow-hidden rounded-md p-2 text-start outline-hidden ring-sidebar-ring transition-[width,height,padding] focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 group-has-data-[sidebar=menu-action]/menu-item:pe-8 aria-disabled:pointer-events-none aria-disabled:opacity-50 data-[active=true]:bg-sidebar-accent data-[active=true]:font-medium data-[active=true]:text-sidebar-accent-foreground data-[state=open]:hover:bg-sidebar-accent data-[state=open]:hover:text-sidebar-accent-foreground group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:p-2! [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground h-8 text-sm" + dashboardActiveClass} href="/" data-status={dashboardStatus} aria-current={dashboardCurrent}>
											<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-layout-dashboard" aria-hidden="true">
												<rect width="7" height="9" x="3" y="3" rx="1" />
												<rect width="7" height="5" x="14" y="3" rx="1" />
												<rect width="7" height="9" x="14" y="12" rx="1" />
												<rect width="7" height="5" x="3" y="16" rx="1" />
											</svg>
											<span>Dashboard</span>
										</a>
									</li>
									<li data-slot="sidebar-menu-item" data-sidebar="menu-item" class="group/menu-item relative">
										<a data-slot="sidebar-menu-button" data-sidebar="menu-button" data-size="default" data-active="false" data-state="closed" href="/tasks" class="peer/menu-button flex w-full items-center gap-2 overflow-hidden rounded-md p-2 text-start outline-hidden ring-sidebar-ring transition-[width,height,padding] focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 group-has-data-[sidebar=menu-action]/menu-item:pe-8 aria-disabled:pointer-events-none aria-disabled:opacity-50 data-[active=true]:bg-sidebar-accent data-[active=true]:font-medium data-[active=true]:text-sidebar-accent-foreground data-[state=open]:hover:bg-sidebar-accent data-[state=open]:hover:text-sidebar-accent-foreground group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:p-2! [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground h-8 text-sm">
											<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-list-todo" aria-hidden="true">
												<path d="M13 5h8" />
												<path d="M13 12h8" />
												<path d="M13 19h8" />
												<path d="m3 17 2 2 4-4" />
												<rect x="3" y="4" width="6" height="6" rx="1" />
											</svg>
											<span>Tasks</span>
										</a>
									</li>
									<li data-slot="sidebar-menu-item" data-sidebar="menu-item" class="group/menu-item relative">
										<a data-slot="sidebar-menu-button" data-sidebar="menu-button" data-size="default" data-active="false" data-state="closed" href="/apps" class="peer/menu-button flex w-full items-center gap-2 overflow-hidden rounded-md p-2 text-start outline-hidden ring-sidebar-ring transition-[width,height,padding] focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 group-has-data-[sidebar=menu-action]/menu-item:pe-8 aria-disabled:pointer-events-none aria-disabled:opacity-50 data-[active=true]:bg-sidebar-accent data-[active=true]:font-medium data-[active=true]:text-sidebar-accent-foreground data-[state=open]:hover:bg-sidebar-accent data-[state=open]:hover:text-sidebar-accent-foreground group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:p-2! [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground h-8 text-sm">
											<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-package" aria-hidden="true">
												<path d="M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z" />
												<path d="M12 22V12" />
												<polyline points="3.29 7 12 12 20.71 7" />
												<path d="m7.5 4.27 9 5.15" />
											</svg>
											<span>Apps</span>
										</a>
									</li>
									<li data-slot="sidebar-menu-item" data-sidebar="menu-item" class="group/menu-item relative">
										<a data-slot="sidebar-menu-button" data-sidebar="menu-button" data-size="default" data-active="false" data-state="closed" href="/chats" class="peer/menu-button flex w-full items-center gap-2 overflow-hidden rounded-md p-2 text-start outline-hidden ring-sidebar-ring transition-[width,height,padding] focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 group-has-data-[sidebar=menu-action]/menu-item:pe-8 aria-disabled:pointer-events-none aria-disabled:opacity-50 data-[active=true]:bg-sidebar-accent data-[active=true]:font-medium data-[active=true]:text-sidebar-accent-foreground data-[state=open]:hover:bg-sidebar-accent data-[state=open]:hover:text-sidebar-accent-foreground group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:p-2! [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground h-8 text-sm">
											<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-messages-square" aria-hidden="true">
												<path d="M16 10a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 14.286V4a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
												<path d="M20 9a2 2 0 0 1 2 2v10.286a.71.71 0 0 1-1.212.502l-2.202-2.202A2 2 0 0 0 17.172 19H10a2 2 0 0 1-2-2v-1" />
											</svg>
											<span>Chats</span>
											<span data-slot="badge" class="inline-flex items-center justify-center border font-medium w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1 [&>svg]:pointer-events-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive transition-[color,box-shadow] overflow-hidden border-transparent bg-primary text-primary-foreground [a&]:hover:bg-primary/90 rounded-full px-1 py-0 text-xs">3</span>
										</a>
									</li>
									<li data-slot="sidebar-menu-item" data-sidebar="menu-item" class="group/menu-item relative">
										<a data-slot="sidebar-menu-button" data-sidebar="menu-button" data-size="default" data-active={usersActive} data-state="closed" href="/users" data-status={usersStatus} aria-current={usersCurrent} class={"peer/menu-button flex w-full items-center gap-2 overflow-hidden rounded-md p-2 text-start outline-hidden ring-sidebar-ring transition-[width,height,padding] focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 group-has-data-[sidebar=menu-action]/menu-item:pe-8 aria-disabled:pointer-events-none aria-disabled:opacity-50 data-[active=true]:bg-sidebar-accent data-[active=true]:font-medium data-[active=true]:text-sidebar-accent-foreground data-[state=open]:hover:bg-sidebar-accent data-[state=open]:hover:text-sidebar-accent-foreground group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:p-2! [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground h-8 text-sm" + usersActiveClass}>
											<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-users" aria-hidden="true">
												<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
												<path d="M16 3.128a4 4 0 0 1 0 7.744" />
												<path d="M22 21v-2a4 4 0 0 0-3-3.87" />
												<circle cx="9" cy="7" r="4" />
											</svg>
											<span>Users</span>
										</a>
									</li>
									<li data-slot="collapsible" data-sidebar="menu-item" class="group/menu-item relative group/collapsible" data-state={clerkState}>
										<button data-slot="collapsible-trigger" data-sidebar="menu-button" data-size="default" data-active="false" class="peer/menu-button flex w-full items-center gap-2 overflow-hidden rounded-md p-2 text-start outline-hidden ring-sidebar-ring transition-[width,height,padding] focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 group-has-data-[sidebar=menu-action]/menu-item:pe-8 aria-disabled:pointer-events-none aria-disabled:opacity-50 data-[active=true]:bg-sidebar-accent data-[active=true]:font-medium data-[active=true]:text-sidebar-accent-foreground data-[state=open]:hover:bg-sidebar-accent data-[state=open]:hover:text-sidebar-accent-foreground group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:p-2! [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground h-8 text-sm" type="button" aria-controls="radix-_r_7_" aria-expanded={clerkExpanded} data-state={clerkState} onClick={() => (clerkOpen = !clerkOpen)}>
											<svg role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" id="clerk" height="24" width="24" class="[&>path]:fill-foreground">
												<title>Clerk</title>
												<path d="m21.47 20.829 -2.881 -2.881a0.572 0.572 0 0 0 -0.7 -0.084 6.854 6.854 0 0 1 -7.081 0 0.576 0.576 0 0 0 -0.7 0.084l-2.881 2.881a0.576 0.576 0 0 0 -0.103 0.69 0.57 0.57 0 0 0 0.166 0.186 12 12 0 0 0 14.113 0 0.58 0.58 0 0 0 0.239 -0.423 0.576 0.576 0 0 0 -0.172 -0.453Zm0.002 -17.668 -2.88 2.88a0.569 0.569 0 0 1 -0.701 0.084A6.857 6.857 0 0 0 8.724 8.08a6.862 6.862 0 0 0 -1.222 3.692 6.86 6.86 0 0 0 0.978 3.764 0.573 0.573 0 0 1 -0.083 0.699l-2.881 2.88a0.567 0.567 0 0 1 -0.864 -0.063A11.993 11.993 0 0 1 6.771 2.7a11.99 11.99 0 0 1 14.637 -0.405 0.566 0.566 0 0 1 0.232 0.418 0.57 0.57 0 0 1 -0.168 0.448Zm-7.118 12.261a3.427 3.427 0 1 0 0 -6.854 3.427 3.427 0 0 0 0 6.854Z" stroke-width="1" />
											</svg>
											<span>Secured by Clerk</span>
											<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-chevron-right ms-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90 rtl:rotate-180" aria-hidden="true">
												<path d="m9 18 6-6-6-6" />
											</svg>
										</button>
										<div data-state={clerkState} id="radix-_r_7_" hidden={clerkClosed} data-slot="collapsible-content" class="CollapsibleContent" style="--radix-collapsible-content-height: 96px; --radix-collapsible-content-width: 224px;">
											<ul data-slot="sidebar-menu-sub" data-sidebar="menu-sub" class="mx-3.5 flex min-w-0 translate-x-px flex-col gap-1 border-s border-sidebar-border px-2.5 py-0.5 group-data-[collapsible=icon]:hidden">
												<li data-slot="sidebar-menu-sub-item" data-sidebar="menu-sub-item" class="group/menu-sub-item relative">
													<a data-slot="sidebar-menu-sub-button" data-sidebar="menu-sub-button" data-size="md" data-active="false" href="/clerk/sign-in" class="flex h-7 min-w-0 -translate-x-px items-center gap-2 overflow-hidden rounded-md px-2 text-sidebar-foreground ring-sidebar-ring outline-hidden hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-inherit data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground text-sm group-data-[collapsible=icon]:hidden">
														<span>Sign In</span>
													</a>
												</li>
												<li data-slot="sidebar-menu-sub-item" data-sidebar="menu-sub-item" class="group/menu-sub-item relative">
													<a data-slot="sidebar-menu-sub-button" data-sidebar="menu-sub-button" data-size="md" data-active="false" href="/clerk/sign-up" class="flex h-7 min-w-0 -translate-x-px items-center gap-2 overflow-hidden rounded-md px-2 text-sidebar-foreground ring-sidebar-ring outline-hidden hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-inherit data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground text-sm group-data-[collapsible=icon]:hidden">
														<span>Sign Up</span>
													</a>
												</li>
												<li data-slot="sidebar-menu-sub-item" data-sidebar="menu-sub-item" class="group/menu-sub-item relative">
													<a data-slot="sidebar-menu-sub-button" data-sidebar="menu-sub-button" data-size="md" data-active="false" href="/clerk/user-management" class="flex h-7 min-w-0 -translate-x-px items-center gap-2 overflow-hidden rounded-md px-2 text-sidebar-foreground ring-sidebar-ring outline-hidden hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-inherit data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground text-sm group-data-[collapsible=icon]:hidden">
														<span>User Management</span>
													</a>
												</li>
											</ul>
										</div>
									</li>
								</ul>
							</div>
							<div data-slot="sidebar-group" data-sidebar="group" class="relative flex w-full min-w-0 flex-col p-2">
								<div data-slot="sidebar-group-label" data-sidebar="group-label" class="flex h-8 shrink-0 items-center rounded-md px-2 text-xs font-medium text-sidebar-foreground/70 ring-sidebar-ring outline-hidden transition-[margin,opacity] duration-200 ease-linear focus-visible:ring-2 [&>svg]:size-4 [&>svg]:shrink-0 group-data-[collapsible=icon]:-mt-8 group-data-[collapsible=icon]:opacity-0">Pages</div>
								<ul data-slot="sidebar-menu" data-sidebar="menu" class="flex w-full min-w-0 flex-col gap-1">
									<li data-slot="collapsible" data-sidebar="menu-item" class="group/menu-item relative group/collapsible" data-state={authState}>
										<button data-slot="collapsible-trigger" data-sidebar="menu-button" data-size="default" data-active="false" class="peer/menu-button flex w-full items-center gap-2 overflow-hidden rounded-md p-2 text-start outline-hidden ring-sidebar-ring transition-[width,height,padding] focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 group-has-data-[sidebar=menu-action]/menu-item:pe-8 aria-disabled:pointer-events-none aria-disabled:opacity-50 data-[active=true]:bg-sidebar-accent data-[active=true]:font-medium data-[active=true]:text-sidebar-accent-foreground data-[state=open]:hover:bg-sidebar-accent data-[state=open]:hover:text-sidebar-accent-foreground group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:p-2! [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground h-8 text-sm" type="button" aria-controls="radix-_r_9_" aria-expanded={authExpanded} data-state={authState} onClick={() => (authOpen = !authOpen)}>
											<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-shield-check" aria-hidden="true">
												<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
												<path d="m9 12 2 2 4-4" />
											</svg>
											<span>Auth</span>
											<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-chevron-right ms-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90 rtl:rotate-180" aria-hidden="true">
												<path d="m9 18 6-6-6-6" />
											</svg>
										</button>
										<div data-state={authState} id="radix-_r_9_" hidden={authClosed} data-slot="collapsible-content" class="CollapsibleContent" style="--radix-collapsible-content-height: 160px; --radix-collapsible-content-width: 224px;">
											<ul data-slot="sidebar-menu-sub" data-sidebar="menu-sub" class="mx-3.5 flex min-w-0 translate-x-px flex-col gap-1 border-s border-sidebar-border px-2.5 py-0.5 group-data-[collapsible=icon]:hidden">
												<li data-slot="sidebar-menu-sub-item" data-sidebar="menu-sub-item" class="group/menu-sub-item relative">
													<a data-slot="sidebar-menu-sub-button" data-sidebar="menu-sub-button" data-size="md" data-active="false" href="/sign-in" class="flex h-7 min-w-0 -translate-x-px items-center gap-2 overflow-hidden rounded-md px-2 text-sidebar-foreground ring-sidebar-ring outline-hidden hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-inherit data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground text-sm group-data-[collapsible=icon]:hidden">
														<span>Sign In</span>
													</a>
												</li>
												<li data-slot="sidebar-menu-sub-item" data-sidebar="menu-sub-item" class="group/menu-sub-item relative">
													<a data-slot="sidebar-menu-sub-button" data-sidebar="menu-sub-button" data-size="md" data-active="false" href="/sign-in-2" class="flex h-7 min-w-0 -translate-x-px items-center gap-2 overflow-hidden rounded-md px-2 text-sidebar-foreground ring-sidebar-ring outline-hidden hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-inherit data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground text-sm group-data-[collapsible=icon]:hidden">
														<span>Sign In (2 Col)</span>
													</a>
												</li>
												<li data-slot="sidebar-menu-sub-item" data-sidebar="menu-sub-item" class="group/menu-sub-item relative">
													<a data-slot="sidebar-menu-sub-button" data-sidebar="menu-sub-button" data-size="md" data-active="false" href="/sign-up" class="flex h-7 min-w-0 -translate-x-px items-center gap-2 overflow-hidden rounded-md px-2 text-sidebar-foreground ring-sidebar-ring outline-hidden hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-inherit data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground text-sm group-data-[collapsible=icon]:hidden">
														<span>Sign Up</span>
													</a>
												</li>
												<li data-slot="sidebar-menu-sub-item" data-sidebar="menu-sub-item" class="group/menu-sub-item relative">
													<a data-slot="sidebar-menu-sub-button" data-sidebar="menu-sub-button" data-size="md" data-active="false" href="/forgot-password" class="flex h-7 min-w-0 -translate-x-px items-center gap-2 overflow-hidden rounded-md px-2 text-sidebar-foreground ring-sidebar-ring outline-hidden hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-inherit data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground text-sm group-data-[collapsible=icon]:hidden">
														<span>Forgot Password</span>
													</a>
												</li>
												<li data-slot="sidebar-menu-sub-item" data-sidebar="menu-sub-item" class="group/menu-sub-item relative">
													<a data-slot="sidebar-menu-sub-button" data-sidebar="menu-sub-button" data-size="md" data-active="false" href="/otp" class="flex h-7 min-w-0 -translate-x-px items-center gap-2 overflow-hidden rounded-md px-2 text-sidebar-foreground ring-sidebar-ring outline-hidden hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-inherit data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground text-sm group-data-[collapsible=icon]:hidden">
														<span>OTP</span>
													</a>
												</li>
											</ul>
										</div>
									</li>
									<li data-slot="collapsible" data-sidebar="menu-item" class="group/menu-item relative group/collapsible" data-state={errorsState}>
										<button data-slot="collapsible-trigger" data-sidebar="menu-button" data-size="default" data-active="false" class="peer/menu-button flex w-full items-center gap-2 overflow-hidden rounded-md p-2 text-start outline-hidden ring-sidebar-ring transition-[width,height,padding] focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 group-has-data-[sidebar=menu-action]/menu-item:pe-8 aria-disabled:pointer-events-none aria-disabled:opacity-50 data-[active=true]:bg-sidebar-accent data-[active=true]:font-medium data-[active=true]:text-sidebar-accent-foreground data-[state=open]:hover:bg-sidebar-accent data-[state=open]:hover:text-sidebar-accent-foreground group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:p-2! [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground h-8 text-sm" type="button" aria-controls="radix-_r_b_" aria-expanded={errorsExpanded} data-state={errorsState} onClick={() => (errorsOpen = !errorsOpen)}>
											<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-bug" aria-hidden="true">
												<path d="M12 20v-9" />
												<path d="M14 7a4 4 0 0 1 4 4v3a6 6 0 0 1-12 0v-3a4 4 0 0 1 4-4z" />
												<path d="M14.12 3.88 16 2" />
												<path d="M21 21a4 4 0 0 0-3.81-4" />
												<path d="M21 5a4 4 0 0 1-3.55 3.97" />
												<path d="M22 13h-4" />
												<path d="M3 21a4 4 0 0 1 3.81-4" />
												<path d="M3 5a4 4 0 0 0 3.55 3.97" />
												<path d="M6 13H2" />
												<path d="m8 2 1.88 1.88" />
												<path d="M9 7.13V6a3 3 0 1 1 6 0v1.13" />
											</svg>
											<span>Errors</span>
											<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-chevron-right ms-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90 rtl:rotate-180" aria-hidden="true">
												<path d="m9 18 6-6-6-6" />
											</svg>
										</button>
										<div data-state={errorsState} id="radix-_r_b_" hidden={errorsClosed} data-slot="collapsible-content" class="CollapsibleContent" style="--radix-collapsible-content-height: 160px; --radix-collapsible-content-width: 224px;">
											<ul data-slot="sidebar-menu-sub" data-sidebar="menu-sub" class="mx-3.5 flex min-w-0 translate-x-px flex-col gap-1 border-s border-sidebar-border px-2.5 py-0.5 group-data-[collapsible=icon]:hidden">
												<li data-slot="sidebar-menu-sub-item" data-sidebar="menu-sub-item" class="group/menu-sub-item relative">
													<a data-slot="sidebar-menu-sub-button" data-sidebar="menu-sub-button" data-size="md" data-active="false" href="/errors/unauthorized" class="flex h-7 min-w-0 -translate-x-px items-center gap-2 overflow-hidden rounded-md px-2 text-sidebar-foreground ring-sidebar-ring outline-hidden hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-inherit data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground text-sm group-data-[collapsible=icon]:hidden">
														<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-lock" aria-hidden="true">
															<rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
															<path d="M7 11V7a5 5 0 0 1 10 0v4" />
														</svg>
														<span>Unauthorized</span>
													</a>
												</li>
												<li data-slot="sidebar-menu-sub-item" data-sidebar="menu-sub-item" class="group/menu-sub-item relative">
													<a data-slot="sidebar-menu-sub-button" data-sidebar="menu-sub-button" data-size="md" data-active="false" href="/errors/forbidden" class="flex h-7 min-w-0 -translate-x-px items-center gap-2 overflow-hidden rounded-md px-2 text-sidebar-foreground ring-sidebar-ring outline-hidden hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-inherit data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground text-sm group-data-[collapsible=icon]:hidden">
														<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-user-x" aria-hidden="true">
															<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
															<circle cx="9" cy="7" r="4" />
															<line x1="17" x2="22" y1="8" y2="13" />
															<line x1="22" x2="17" y1="8" y2="13" />
														</svg>
														<span>Forbidden</span>
													</a>
												</li>
												<li data-slot="sidebar-menu-sub-item" data-sidebar="menu-sub-item" class="group/menu-sub-item relative">
													<a data-slot="sidebar-menu-sub-button" data-sidebar="menu-sub-button" data-size="md" data-active="false" href="/errors/not-found" class="flex h-7 min-w-0 -translate-x-px items-center gap-2 overflow-hidden rounded-md px-2 text-sidebar-foreground ring-sidebar-ring outline-hidden hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-inherit data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground text-sm group-data-[collapsible=icon]:hidden">
														<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-file-x" aria-hidden="true">
															<path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z" />
															<path d="M14 2v5a1 1 0 0 0 1 1h5" />
															<path d="m14.5 12.5-5 5" />
															<path d="m9.5 12.5 5 5" />
														</svg>
														<span>Not Found</span>
													</a>
												</li>
												<li data-slot="sidebar-menu-sub-item" data-sidebar="menu-sub-item" class="group/menu-sub-item relative">
													<a data-slot="sidebar-menu-sub-button" data-sidebar="menu-sub-button" data-size="md" data-active="false" href="/errors/internal-server-error" class="flex h-7 min-w-0 -translate-x-px items-center gap-2 overflow-hidden rounded-md px-2 text-sidebar-foreground ring-sidebar-ring outline-hidden hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-inherit data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground text-sm group-data-[collapsible=icon]:hidden">
														<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-server-off" aria-hidden="true">
															<path d="M7 2h13a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-5" />
															<path d="M10 10 2.5 2.5C2 2 2 2.5 2 5v3a2 2 0 0 0 2 2h6z" />
															<path d="M22 17v-1a2 2 0 0 0-2-2h-1" />
															<path d="M4 14a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2h16.5l1-.5.5.5-8-8H4z" />
															<path d="M6 18h.01" />
															<path d="m2 2 20 20" />
														</svg>
														<span>Internal Server Error</span>
													</a>
												</li>
												<li data-slot="sidebar-menu-sub-item" data-sidebar="menu-sub-item" class="group/menu-sub-item relative">
													<a data-slot="sidebar-menu-sub-button" data-sidebar="menu-sub-button" data-size="md" data-active="false" href="/errors/maintenance-error" class="flex h-7 min-w-0 -translate-x-px items-center gap-2 overflow-hidden rounded-md px-2 text-sidebar-foreground ring-sidebar-ring outline-hidden hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-inherit data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground text-sm group-data-[collapsible=icon]:hidden">
														<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-construction" aria-hidden="true">
															<rect x="2" y="6" width="20" height="8" rx="1" />
															<path d="M17 14v7" />
															<path d="M7 14v7" />
															<path d="M17 3v3" />
															<path d="M7 3v3" />
															<path d="M10 14 2.3 6.3" />
															<path d="m14 6 7.7 7.7" />
															<path d="m8 6 8 8" />
														</svg>
														<span>Maintenance Error</span>
													</a>
												</li>
											</ul>
										</div>
									</li>
								</ul>
							</div>
							<div data-slot="sidebar-group" data-sidebar="group" class="relative flex w-full min-w-0 flex-col p-2">
								<div data-slot="sidebar-group-label" data-sidebar="group-label" class="flex h-8 shrink-0 items-center rounded-md px-2 text-xs font-medium text-sidebar-foreground/70 ring-sidebar-ring outline-hidden transition-[margin,opacity] duration-200 ease-linear focus-visible:ring-2 [&>svg]:size-4 [&>svg]:shrink-0 group-data-[collapsible=icon]:-mt-8 group-data-[collapsible=icon]:opacity-0">Other</div>
								<ul data-slot="sidebar-menu" data-sidebar="menu" class="flex w-full min-w-0 flex-col gap-1">
									<li data-slot="collapsible" data-sidebar="menu-item" class="group/menu-item relative group/collapsible" data-state={settingsState}>
										<button data-slot="collapsible-trigger" data-sidebar="menu-button" data-size="default" data-active="false" class="peer/menu-button flex w-full items-center gap-2 overflow-hidden rounded-md p-2 text-start outline-hidden ring-sidebar-ring transition-[width,height,padding] focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 group-has-data-[sidebar=menu-action]/menu-item:pe-8 aria-disabled:pointer-events-none aria-disabled:opacity-50 data-[active=true]:bg-sidebar-accent data-[active=true]:font-medium data-[active=true]:text-sidebar-accent-foreground data-[state=open]:hover:bg-sidebar-accent data-[state=open]:hover:text-sidebar-accent-foreground group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:p-2! [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground h-8 text-sm" type="button" aria-controls="radix-_r_d_" aria-expanded={settingsExpanded} data-state={settingsState} onClick={() => (settingsOpen = !settingsOpen)}>
											<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-settings" aria-hidden="true">
												<path d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915" />
												<circle cx="12" cy="12" r="3" />
											</svg>
											<span>Settings</span>
											<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-chevron-right ms-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90 rtl:rotate-180" aria-hidden="true">
												<path d="m9 18 6-6-6-6" />
											</svg>
										</button>
										<div data-state={settingsState} id="radix-_r_d_" hidden={settingsClosed} data-slot="collapsible-content" class="CollapsibleContent" style="--radix-collapsible-content-height: 160px; --radix-collapsible-content-width: 224px;">
											<ul data-slot="sidebar-menu-sub" data-sidebar="menu-sub" class="mx-3.5 flex min-w-0 translate-x-px flex-col gap-1 border-s border-sidebar-border px-2.5 py-0.5 group-data-[collapsible=icon]:hidden">
												<li data-slot="sidebar-menu-sub-item" data-sidebar="menu-sub-item" class="group/menu-sub-item relative">
													<a data-slot="sidebar-menu-sub-button" data-sidebar="menu-sub-button" data-size="md" data-active="false" href="/settings" class="flex h-7 min-w-0 -translate-x-px items-center gap-2 overflow-hidden rounded-md px-2 text-sidebar-foreground ring-sidebar-ring outline-hidden hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-inherit data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground text-sm group-data-[collapsible=icon]:hidden">
														<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-user-cog" aria-hidden="true">
															<path d="M10 15H6a4 4 0 0 0-4 4v2" />
															<path d="m14.305 16.53.923-.382" />
															<path d="m15.228 13.852-.923-.383" />
															<path d="m16.852 12.228-.383-.923" />
															<path d="m16.852 17.772-.383.924" />
															<path d="m19.148 12.228.383-.923" />
															<path d="m19.53 18.696-.382-.924" />
															<path d="m20.772 13.852.924-.383" />
															<path d="m20.772 16.148.924.383" />
															<circle cx="18" cy="15" r="3" />
															<circle cx="9" cy="7" r="4" />
														</svg>
														<span>Profile</span>
													</a>
												</li>
												<li data-slot="sidebar-menu-sub-item" data-sidebar="menu-sub-item" class="group/menu-sub-item relative">
													<a data-slot="sidebar-menu-sub-button" data-sidebar="menu-sub-button" data-size="md" data-active="false" href="/settings/account" class="flex h-7 min-w-0 -translate-x-px items-center gap-2 overflow-hidden rounded-md px-2 text-sidebar-foreground ring-sidebar-ring outline-hidden hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-inherit data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground text-sm group-data-[collapsible=icon]:hidden">
														<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-wrench" aria-hidden="true">
															<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.106-3.105c.32-.322.863-.22.983.218a6 6 0 0 1-8.259 7.057l-7.91 7.91a1 1 0 0 1-2.999-3l7.91-7.91a6 6 0 0 1 7.057-8.259c.438.12.54.662.219.984z" />
														</svg>
														<span>Account</span>
													</a>
												</li>
												<li data-slot="sidebar-menu-sub-item" data-sidebar="menu-sub-item" class="group/menu-sub-item relative">
													<a data-slot="sidebar-menu-sub-button" data-sidebar="menu-sub-button" data-size="md" data-active="false" href="/settings/appearance" class="flex h-7 min-w-0 -translate-x-px items-center gap-2 overflow-hidden rounded-md px-2 text-sidebar-foreground ring-sidebar-ring outline-hidden hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-inherit data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground text-sm group-data-[collapsible=icon]:hidden">
														<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-palette" aria-hidden="true">
															<path d="M12 22a1 1 0 0 1 0-20 10 9 0 0 1 10 9 5 5 0 0 1-5 5h-2.25a1.75 1.75 0 0 0-1.4 2.8l.3.4a1.75 1.75 0 0 1-1.4 2.8z" />
															<circle cx="13.5" cy="6.5" r=".5" fill="currentColor" />
															<circle cx="17.5" cy="10.5" r=".5" fill="currentColor" />
															<circle cx="6.5" cy="12.5" r=".5" fill="currentColor" />
															<circle cx="8.5" cy="7.5" r=".5" fill="currentColor" />
														</svg>
														<span>Appearance</span>
													</a>
												</li>
												<li data-slot="sidebar-menu-sub-item" data-sidebar="menu-sub-item" class="group/menu-sub-item relative">
													<a data-slot="sidebar-menu-sub-button" data-sidebar="menu-sub-button" data-size="md" data-active="false" href="/settings/notifications" class="flex h-7 min-w-0 -translate-x-px items-center gap-2 overflow-hidden rounded-md px-2 text-sidebar-foreground ring-sidebar-ring outline-hidden hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-inherit data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground text-sm group-data-[collapsible=icon]:hidden">
														<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-bell" aria-hidden="true">
															<path d="M10.268 21a2 2 0 0 0 3.464 0" />
															<path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326" />
														</svg>
														<span>Notifications</span>
													</a>
												</li>
												<li data-slot="sidebar-menu-sub-item" data-sidebar="menu-sub-item" class="group/menu-sub-item relative">
													<a data-slot="sidebar-menu-sub-button" data-sidebar="menu-sub-button" data-size="md" data-active="false" href="/settings/display" class="flex h-7 min-w-0 -translate-x-px items-center gap-2 overflow-hidden rounded-md px-2 text-sidebar-foreground ring-sidebar-ring outline-hidden hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-inherit data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground text-sm group-data-[collapsible=icon]:hidden">
														<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-monitor" aria-hidden="true">
															<rect width="20" height="14" x="2" y="3" rx="2" />
															<line x1="8" x2="16" y1="21" y2="21" />
															<line x1="12" x2="12" y1="17" y2="21" />
														</svg>
														<span>Display</span>
													</a>
												</li>
											</ul>
										</div>
									</li>
									<li data-slot="sidebar-menu-item" data-sidebar="menu-item" class="group/menu-item relative">
										<a data-slot="sidebar-menu-button" data-sidebar="menu-button" data-size="default" data-active="false" data-state="closed" href="/help-center" class="peer/menu-button flex w-full items-center gap-2 overflow-hidden rounded-md p-2 text-start outline-hidden ring-sidebar-ring transition-[width,height,padding] focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 group-has-data-[sidebar=menu-action]/menu-item:pe-8 aria-disabled:pointer-events-none aria-disabled:opacity-50 data-[active=true]:bg-sidebar-accent data-[active=true]:font-medium data-[active=true]:text-sidebar-accent-foreground data-[state=open]:hover:bg-sidebar-accent data-[state=open]:hover:text-sidebar-accent-foreground group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:p-2! [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground h-8 text-sm">
											<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-circle-question-mark" aria-hidden="true">
												<circle cx="12" cy="12" r="10" />
												<path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
												<path d="M12 17h.01" />
											</svg>
											<span>Help Center</span>
										</a>
									</li>
								</ul>
							</div>
						</div>
						<div data-slot="sidebar-footer" data-sidebar="footer" class="flex flex-col gap-2 p-2">
							<ul data-slot="sidebar-menu" data-sidebar="menu" class="flex w-full min-w-0 flex-col gap-1">
								<li data-slot="sidebar-menu-item" data-sidebar="menu-item" class="group/menu-item relative">
									<DropdownMenuTrigger menu="user" data-sidebar="menu-button" data-size="lg" data-active="false" class="peer/menu-button flex w-full items-center gap-2 overflow-hidden rounded-md p-2 text-start outline-hidden ring-sidebar-ring transition-[width,height,padding] focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 group-has-data-[sidebar=menu-action]/menu-item:pe-8 aria-disabled:pointer-events-none aria-disabled:opacity-50 data-[active=true]:bg-sidebar-accent data-[active=true]:font-medium data-[active=true]:text-sidebar-accent-foreground data-[state=open]:hover:bg-sidebar-accent data-[state=open]:hover:text-sidebar-accent-foreground group-data-[collapsible=icon]:size-8! [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground h-12 text-sm group-data-[collapsible=icon]:p-0! data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground">
										<span data-slot="avatar" class="relative flex size-8 shrink-0 overflow-hidden h-8 w-8 rounded-lg">
											<span data-slot="avatar-fallback" class="flex size-full items-center justify-center bg-muted rounded-lg">SN</span>
										</span>
										<div class="grid flex-1 text-start text-sm leading-tight">
											<span class="truncate font-semibold">satnaing</span>
											<span class="truncate text-xs">{'satnaingdev@gmail.com'}</span>
										</div>
										<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-chevrons-up-down ms-auto size-4" aria-hidden="true">
											<path d="m7 15 5 5 5-5" />
											<path d="m7 9 5-5 5 5" />
										</svg>
									</DropdownMenuTrigger>
								</li>
							</ul>
						</div>
						<button data-sidebar="rail" data-slot="sidebar-rail" aria-label="Toggle Sidebar" tabindex="-1" title="Toggle Sidebar" onClick={toggleSidebar} class="absolute inset-y-0 z-20 hidden w-4 -translate-x-1/2 transition-all ease-linear group-data-[side=left]:-inset-e-4 group-data-[side=right]:inset-s-0 after:absolute after:inset-y-0 after:inset-s-1/2 after:w-0.5 hover:after:bg-sidebar-border sm:flex in-data-[side=left]:cursor-w-resize in-data-[side=right]:cursor-e-resize [[data-side=left][data-state=collapsed]_&]:cursor-e-resize [[data-side=right][data-state=collapsed]_&]:cursor-w-resize group-data-[collapsible=offcanvas]:translate-x-0 group-data-[collapsible=offcanvas]:after:start-full hover:group-data-[collapsible=offcanvas]:bg-sidebar [[data-side=left][data-collapsible=offcanvas]_&]:-inset-e-2 [[data-side=right][data-collapsible=offcanvas]_&]:-inset-s-2 rtl:translate-x-1/2 rtl:in-data-[side=left]:cursor-e-resize rtl:in-data-[side=right]:cursor-w-resize rtl:[[data-side=left][data-state=collapsed]_&]:cursor-w-resize rtl:[[data-side=right][data-state=collapsed]_&]:cursor-e-resize"></button>
					</div>
				</div>
			</div>
			<div data-slot="sidebar-inset" class="relative flex w-full flex-1 flex-col bg-background md:peer-data-[variant=inset]:m-2 md:peer-data-[variant=inset]:ms-0 md:peer-data-[variant=inset]:rounded-xl md:peer-data-[variant=inset]:shadow-sm md:peer-data-[variant=inset]:peer-data-[state=collapsed]:ms-2 @container/content has-data-[layout=fixed]:h-svh peer-data-[variant=inset]:has-data-[layout=fixed]:h-[calc(100svh-(var(--spacing)*4))]">
				@if (topNav) {
					<header class="z-50 h-16 shadow-none">
						<div class="relative flex h-full items-center gap-3 p-4 sm:gap-4">
							<button data-slot="sidebar-trigger" onClick={toggleSidebar} class="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50 size-7 max-md:scale-125" data-sidebar="trigger">
								<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-panel-left" aria-hidden="true">
									<rect width="18" height="18" x="3" y="3" rx="2" />
									<path d="M9 3v18" />
								</svg>
								<span class="sr-only">Toggle Sidebar</span>
							</button>
							<div data-orientation="vertical" role="none" data-slot="separator" class="shrink-0 bg-border data-[orientation=horizontal]:h-px data-[orientation=horizontal]:w-full data-[orientation=vertical]:w-px h-6"></div>
							<DropdownMenuTrigger menu="topnav" class="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50 size-9 md:size-7 lg:hidden me-auto">
								<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-menu" aria-hidden="true">
									<path d="M4 5h16" />
									<path d="M4 12h16" />
									<path d="M4 19h16" />
								</svg>
								<span class="sr-only">Toggle navigation menu</span>
							</DropdownMenuTrigger>
							<nav class="hidden items-center space-x-4 lg:flex lg:space-x-4 xl:space-x-6 me-auto">
								<a href="/dashboard/overview" class="text-sm font-medium transition-colors hover:text-primary ">Overview</a>
								<a class="text-sm font-medium transition-colors hover:text-primary text-muted-foreground" role="link" aria-disabled="true">Customers</a>
								<a class="text-sm font-medium transition-colors hover:text-primary text-muted-foreground" role="link" aria-disabled="true">Products</a>
								<a class="text-sm font-medium transition-colors hover:text-primary text-muted-foreground" role="link" aria-disabled="true">Settings</a>
							</nav>
							<button data-slot="button" onClick={openSearch} class="inline-flex items-center gap-2 whitespace-nowrap transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive border hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50 px-4 py-2 has-[>svg]:px-3 group relative h-8 w-full flex-1 justify-start rounded-md bg-muted/25 text-sm font-normal text-muted-foreground shadow-none hover:bg-accent sm:w-40 sm:pe-12 md:flex-none lg:w-52 xl:w-64" aria-keyshortcuts="Meta+K Control+K">
								<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-search absolute inset-s-1.5 top-1/2 -translate-y-1/2" aria-hidden="true">
									<path d="m21 21-4.34-4.34" />
									<circle cx="11" cy="11" r="8" />
								</svg>
								<span class="ms-4">Search</span>
								<kbd class="pointer-events-none absolute inset-e-[0.3rem] top-[0.3rem] hidden h-5 items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium opacity-100 select-none group-hover:bg-accent sm:flex">
									<span class="text-xs">⌘</span>
									K
								</kbd>
							</button>
							<DropdownMenuTrigger menu="theme" class="inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50 size-9 scale-95 rounded-full">
								<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-sun size-[1.2rem] scale-100 rotate-0 transition-all dark:scale-0 dark:-rotate-90" aria-hidden="true">
									<circle cx="12" cy="12" r="4" />
									<path d="M12 2v2" />
									<path d="M12 20v2" />
									<path d="m4.93 4.93 1.41 1.41" />
									<path d="m17.66 17.66 1.41 1.41" />
									<path d="M2 12h2" />
									<path d="M20 12h2" />
									<path d="m6.34 17.66-1.41 1.41" />
									<path d="m19.07 4.93-1.41 1.41" />
								</svg>
								<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-moon absolute size-[1.2rem] scale-0 rotate-90 transition-all dark:scale-100 dark:rotate-0" aria-hidden="true">
									<path d="M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401" />
								</svg>
								<span class="sr-only">Toggle theme</span>
							</DropdownMenuTrigger>
							<button data-slot="sheet-trigger" class="inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50 size-9 rounded-full" aria-label="Open theme settings" type="button" aria-haspopup="dialog" aria-expanded={drawerExpanded} aria-controls="config-drawer" data-state={drawerState} onClick={openDrawer}>
								<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-settings" aria-hidden="true">
									<path d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915" />
									<circle cx="12" cy="12" r="3" />
								</svg>
							</button>
							<DropdownMenuTrigger menu="profile" class="inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50 px-4 py-2 has-[>svg]:px-3 relative h-8 w-8 rounded-full">
								<span data-slot="avatar" class="relative flex size-8 shrink-0 overflow-hidden rounded-full h-8 w-8">
									<span data-slot="avatar-fallback" class="flex size-full items-center justify-center rounded-full bg-muted">SN</span>
								</span>
							</DropdownMenuTrigger>
						</div>
					</header>
				} @else {
					<header class="z-50 h-16 header-fixed peer/header sticky top-0 w-[inherit] shadow-none">
						<div class="relative flex h-full items-center gap-3 p-4 sm:gap-4">
							<button data-slot="sidebar-trigger" onClick={toggleSidebar} class="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50 size-7 max-md:scale-125" data-sidebar="trigger">
								<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-panel-left" aria-hidden="true">
									<rect width="18" height="18" x="3" y="3" rx="2" />
									<path d="M9 3v18" />
								</svg>
								<span class="sr-only">Toggle Sidebar</span>
							</button>
							<div data-orientation="vertical" role="none" data-slot="separator" class="shrink-0 bg-border data-[orientation=horizontal]:h-px data-[orientation=horizontal]:w-full data-[orientation=vertical]:w-px h-6"></div>
							<button data-slot="button" onClick={openSearch} class="inline-flex items-center gap-2 whitespace-nowrap transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive border hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50 px-4 py-2 has-[>svg]:px-3 group relative h-8 w-full flex-1 justify-start rounded-md bg-muted/25 text-sm font-normal text-muted-foreground shadow-none hover:bg-accent sm:w-40 sm:pe-12 md:flex-none lg:w-52 xl:w-64 me-auto" aria-keyshortcuts="Meta+K Control+K">
								<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-search absolute inset-s-1.5 top-1/2 -translate-y-1/2" aria-hidden="true">
									<path d="m21 21-4.34-4.34" />
									<circle cx="11" cy="11" r="8" />
								</svg>
								<span class="ms-4">Search</span>
								<kbd class="pointer-events-none absolute inset-e-[0.3rem] top-[0.3rem] hidden h-5 items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium opacity-100 select-none group-hover:bg-accent sm:flex">
									<span class="text-xs">⌘</span>
									K
								</kbd>
							</button>
							<DropdownMenuTrigger menu="theme" class="inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50 size-9 scale-95 rounded-full">
								<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-sun size-[1.2rem] scale-100 rotate-0 transition-all dark:scale-0 dark:-rotate-90" aria-hidden="true">
									<circle cx="12" cy="12" r="4" />
									<path d="M12 2v2" />
									<path d="M12 20v2" />
									<path d="m4.93 4.93 1.41 1.41" />
									<path d="m17.66 17.66 1.41 1.41" />
									<path d="M2 12h2" />
									<path d="M20 12h2" />
									<path d="m6.34 17.66-1.41 1.41" />
									<path d="m19.07 4.93-1.41 1.41" />
								</svg>
								<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-moon absolute size-[1.2rem] scale-0 rotate-90 transition-all dark:scale-100 dark:rotate-0" aria-hidden="true">
									<path d="M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401" />
								</svg>
								<span class="sr-only">Toggle theme</span>
							</DropdownMenuTrigger>
							<button data-slot="sheet-trigger" class="inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50 size-9 rounded-full" aria-label="Open theme settings" type="button" aria-haspopup="dialog" aria-expanded={drawerExpanded} aria-controls="config-drawer" data-state={drawerState} onClick={openDrawer}>
								<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-settings" aria-hidden="true">
									<path d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915" />
									<circle cx="12" cy="12" r="3" />
								</svg>
							</button>
							<DropdownMenuTrigger menu="profile" class="inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50 px-4 py-2 has-[>svg]:px-3 relative h-8 w-8 rounded-full">
								<span data-slot="avatar" class="relative flex size-8 shrink-0 overflow-hidden rounded-full h-8 w-8">
									<span data-slot="avatar-fallback" class="flex size-full items-center justify-center rounded-full bg-muted">SN</span>
								</span>
							</DropdownMenuTrigger>
						</div>
					</header>
				}
				{children}
			</div>
		</div>

		<div data-slot="dialog-header" class="flex flex-col gap-2 text-center sm:text-start sr-only">
			<h2 id="command-palette-title" data-slot="dialog-title" class="text-lg leading-none font-semibold">Command Palette</h2>
			<p id="command-palette-description" data-slot="dialog-description" class="text-sm text-muted-foreground">Search for a command to run...</p>
		</div>

		<div data-state={searchState} data-slot="dialog-overlay" class="fixed inset-0 z-50 bg-black/50 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0" style="pointer-events: auto;" hidden={searchClosed} onClick={closeSearch}></div>
		<div role="dialog" id="command-palette" aria-describedby="command-palette-description" aria-labelledby="command-palette-title" hidden={searchClosed} data-state={searchState} data-slot="dialog-content" class="fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border bg-background shadow-lg duration-200 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 sm:max-w-lg overflow-hidden p-0" tabindex="-1" style="pointer-events: auto;" onKeydown={searchKeys}>
			<div tabindex="-1" data-slot="command" class="flex h-full w-full flex-col overflow-hidden rounded-md bg-popover text-popover-foreground **:data-[slot=command-input-wrapper]:h-12 [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0 [&_[cmdk-input-wrapper]_svg]:h-5 [&_[cmdk-input-wrapper]_svg]:w-5 [&_[cmdk-item]_svg]:h-5 [&_[cmdk-item]_svg]:w-5 **:[[cmdk-group-heading]]:px-2 **:[[cmdk-group-heading]]:font-medium **:[[cmdk-group-heading]]:text-muted-foreground **:[[cmdk-group]]:px-2 **:[[cmdk-input]]:h-12 **:[[cmdk-item]]:px-2 **:[[cmdk-item]]:py-3" cmdk-root="">
				<label cmdk-label="" for="command-palette-input" id="command-palette-label" style="position: absolute; width: 1px; height: 1px; padding: 0px; margin: -1px; overflow: hidden; clip: rect(0px, 0px, 0px, 0px); white-space: nowrap; border-width: 0px;"></label>
				<div data-slot="command-input-wrapper" class="flex h-9 items-center gap-2 border-b px-3">
					<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-search size-4 shrink-0 opacity-50" aria-hidden="true">
						<path d="m21 21-4.34-4.34" />
						<circle cx="11" cy="11" r="8" />
					</svg>
					<input data-slot="command-input" class="flex h-10 w-full rounded-md bg-transparent py-3 text-sm outline-hidden placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50" placeholder="Type a command or search..." cmdk-input="" autocomplete="off" autocorrect="off" spellcheck="false" aria-autocomplete="list" role="combobox" aria-expanded="true" aria-controls="command-palette-list" aria-labelledby="command-palette-label" id="command-palette-input" type="text" value="" onInput={(event) => filterCommands((event.target as HTMLInputElement).value)} />
				</div>
				<div data-slot="command-list" class="max-h-75 scroll-py-1 overflow-x-hidden overflow-y-auto" cmdk-list="" role="listbox" tabindex="-1" aria-label="Suggestions" id="command-palette-list" onClick={pickCommand} style="--cmdk-list-height: 288.0px;">
					<div cmdk-list-sizer="">
						<div dir="ltr" data-slot="scroll-area" class="relative h-72 pe-1" style="position: relative; --radix-scroll-area-corner-width: 0px; --radix-scroll-area-corner-height: 0px;">
							<div data-radix-scroll-area-viewport="" data-slot="scroll-area-viewport" class="size-full rounded-[inherit] transition-[color,box-shadow] outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1" style="overflow: hidden scroll;">
								<div style="min-width: 100%; display: table;">
									<div data-slot="command-empty" class="py-6 text-center text-sm" cmdk-empty="" role="presentation" hidden>No results found.</div>
		<div data-slot="command-group" class="overflow-hidden p-1 text-foreground **:[[cmdk-group-heading]]:px-2 **:[[cmdk-group-heading]]:py-1.5 **:[[cmdk-group-heading]]:text-xs **:[[cmdk-group-heading]]:font-medium **:[[cmdk-group-heading]]:text-muted-foreground" cmdk-group="" role="presentation" data-value="General">
										<div cmdk-group-heading="" aria-hidden="true" id="command-palette-1">General</div>
										<div cmdk-group-items="" role="group" aria-labelledby="command-palette-1">
											<div data-slot="command-item" class="relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground" id="command-palette-2" cmdk-item="" role="option" aria-disabled="false" aria-selected="true" data-disabled="false" data-selected="true" data-value="Dashboard" data-url="/">
												<div class="flex size-4 items-center justify-center">
													<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-arrow-right size-2 text-muted-foreground/80" aria-hidden="true">
														<path d="M5 12h14" />
														<path d="m12 5 7 7-7 7" />
													</svg>
												</div>
												Dashboard
											</div>
											<div data-slot="command-item" class="relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground" id="command-palette-3" cmdk-item="" role="option" aria-disabled="false" aria-selected="false" data-disabled="false" data-selected="false" data-value="Tasks" data-url="/tasks">
												<div class="flex size-4 items-center justify-center">
													<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-arrow-right size-2 text-muted-foreground/80" aria-hidden="true">
														<path d="M5 12h14" />
														<path d="m12 5 7 7-7 7" />
													</svg>
												</div>
												Tasks
											</div>
											<div data-slot="command-item" class="relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground" id="command-palette-4" cmdk-item="" role="option" aria-disabled="false" aria-selected="false" data-disabled="false" data-selected="false" data-value="Apps" data-url="/apps">
												<div class="flex size-4 items-center justify-center">
													<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-arrow-right size-2 text-muted-foreground/80" aria-hidden="true">
														<path d="M5 12h14" />
														<path d="m12 5 7 7-7 7" />
													</svg>
												</div>
												Apps
											</div>
											<div data-slot="command-item" class="relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground" id="command-palette-5" cmdk-item="" role="option" aria-disabled="false" aria-selected="false" data-disabled="false" data-selected="false" data-value="Chats" data-url="/chats">
												<div class="flex size-4 items-center justify-center">
													<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-arrow-right size-2 text-muted-foreground/80" aria-hidden="true">
														<path d="M5 12h14" />
														<path d="m12 5 7 7-7 7" />
													</svg>
												</div>
												Chats
											</div>
											<div data-slot="command-item" class="relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground" id="command-palette-6" cmdk-item="" role="option" aria-disabled="false" aria-selected="false" data-disabled="false" data-selected="false" data-value="Users" data-url="/users">
												<div class="flex size-4 items-center justify-center">
													<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-arrow-right size-2 text-muted-foreground/80" aria-hidden="true">
														<path d="M5 12h14" />
														<path d="m12 5 7 7-7 7" />
													</svg>
												</div>
												Users
											</div>
											<div data-slot="command-item" class="relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground" id="command-palette-7" cmdk-item="" role="option" aria-disabled="false" aria-selected="false" data-disabled="false" data-selected="false" data-value="Secured by Clerk-/clerk/sign-in" data-url="/clerk/sign-in">
												<div class="flex size-4 items-center justify-center">
													<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-arrow-right size-2 text-muted-foreground/80" aria-hidden="true">
														<path d="M5 12h14" />
														<path d="m12 5 7 7-7 7" />
													</svg>
												</div>
												Secured by Clerk
												<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-chevron-right" aria-hidden="true">
													<path d="m9 18 6-6-6-6" />
												</svg>
												Sign In
											</div>
											<div data-slot="command-item" class="relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground" id="command-palette-8" cmdk-item="" role="option" aria-disabled="false" aria-selected="false" data-disabled="false" data-selected="false" data-value="Secured by Clerk-/clerk/sign-up" data-url="/clerk/sign-up">
												<div class="flex size-4 items-center justify-center">
													<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-arrow-right size-2 text-muted-foreground/80" aria-hidden="true">
														<path d="M5 12h14" />
														<path d="m12 5 7 7-7 7" />
													</svg>
												</div>
												Secured by Clerk
												<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-chevron-right" aria-hidden="true">
													<path d="m9 18 6-6-6-6" />
												</svg>
												Sign Up
											</div>
											<div data-slot="command-item" class="relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground" id="command-palette-9" cmdk-item="" role="option" aria-disabled="false" aria-selected="false" data-disabled="false" data-selected="false" data-value="Secured by Clerk-/clerk/user-management" data-url="/clerk/user-management">
												<div class="flex size-4 items-center justify-center">
													<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-arrow-right size-2 text-muted-foreground/80" aria-hidden="true">
														<path d="M5 12h14" />
														<path d="m12 5 7 7-7 7" />
													</svg>
												</div>
												Secured by Clerk
												<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-chevron-right" aria-hidden="true">
													<path d="m9 18 6-6-6-6" />
												</svg>
												User Management
											</div>
										</div>
									</div>
									<div data-slot="command-group" class="overflow-hidden p-1 text-foreground **:[[cmdk-group-heading]]:px-2 **:[[cmdk-group-heading]]:py-1.5 **:[[cmdk-group-heading]]:text-xs **:[[cmdk-group-heading]]:font-medium **:[[cmdk-group-heading]]:text-muted-foreground" cmdk-group="" role="presentation" data-value="Pages">
										<div cmdk-group-heading="" aria-hidden="true" id="command-palette-10">Pages</div>
										<div cmdk-group-items="" role="group" aria-labelledby="command-palette-10">
											<div data-slot="command-item" class="relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground" id="command-palette-11" cmdk-item="" role="option" aria-disabled="false" aria-selected="false" data-disabled="false" data-selected="false" data-value="Auth-/sign-in" data-url="/sign-in">
												<div class="flex size-4 items-center justify-center">
													<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-arrow-right size-2 text-muted-foreground/80" aria-hidden="true">
														<path d="M5 12h14" />
														<path d="m12 5 7 7-7 7" />
													</svg>
												</div>
												Auth
												<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-chevron-right" aria-hidden="true">
													<path d="m9 18 6-6-6-6" />
												</svg>
												Sign In
											</div>
											<div data-slot="command-item" class="relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground" id="command-palette-12" cmdk-item="" role="option" aria-disabled="false" aria-selected="false" data-disabled="false" data-selected="false" data-value="Auth-/sign-in-2" data-url="/sign-in-2">
												<div class="flex size-4 items-center justify-center">
													<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-arrow-right size-2 text-muted-foreground/80" aria-hidden="true">
														<path d="M5 12h14" />
														<path d="m12 5 7 7-7 7" />
													</svg>
												</div>
												Auth
												<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-chevron-right" aria-hidden="true">
													<path d="m9 18 6-6-6-6" />
												</svg>
												Sign In (2 Col)
											</div>
											<div data-slot="command-item" class="relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground" id="command-palette-13" cmdk-item="" role="option" aria-disabled="false" aria-selected="false" data-disabled="false" data-selected="false" data-value="Auth-/sign-up" data-url="/sign-up">
												<div class="flex size-4 items-center justify-center">
													<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-arrow-right size-2 text-muted-foreground/80" aria-hidden="true">
														<path d="M5 12h14" />
														<path d="m12 5 7 7-7 7" />
													</svg>
												</div>
												Auth
												<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-chevron-right" aria-hidden="true">
													<path d="m9 18 6-6-6-6" />
												</svg>
												Sign Up
											</div>
											<div data-slot="command-item" class="relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground" id="command-palette-14" cmdk-item="" role="option" aria-disabled="false" aria-selected="false" data-disabled="false" data-selected="false" data-value="Auth-/forgot-password" data-url="/forgot-password">
												<div class="flex size-4 items-center justify-center">
													<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-arrow-right size-2 text-muted-foreground/80" aria-hidden="true">
														<path d="M5 12h14" />
														<path d="m12 5 7 7-7 7" />
													</svg>
												</div>
												Auth
												<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-chevron-right" aria-hidden="true">
													<path d="m9 18 6-6-6-6" />
												</svg>
												Forgot Password
											</div>
											<div data-slot="command-item" class="relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground" id="command-palette-15" cmdk-item="" role="option" aria-disabled="false" aria-selected="false" data-disabled="false" data-selected="false" data-value="Auth-/otp" data-url="/otp">
												<div class="flex size-4 items-center justify-center">
													<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-arrow-right size-2 text-muted-foreground/80" aria-hidden="true">
														<path d="M5 12h14" />
														<path d="m12 5 7 7-7 7" />
													</svg>
												</div>
												Auth
												<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-chevron-right" aria-hidden="true">
													<path d="m9 18 6-6-6-6" />
												</svg>
												OTP
											</div>
											<div data-slot="command-item" class="relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground" id="command-palette-16" cmdk-item="" role="option" aria-disabled="false" aria-selected="false" data-disabled="false" data-selected="false" data-value="Errors-/errors/unauthorized" data-url="/errors/unauthorized">
												<div class="flex size-4 items-center justify-center">
													<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-arrow-right size-2 text-muted-foreground/80" aria-hidden="true">
														<path d="M5 12h14" />
														<path d="m12 5 7 7-7 7" />
													</svg>
												</div>
												Errors
												<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-chevron-right" aria-hidden="true">
													<path d="m9 18 6-6-6-6" />
												</svg>
												Unauthorized
											</div>
											<div data-slot="command-item" class="relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground" id="command-palette-17" cmdk-item="" role="option" aria-disabled="false" aria-selected="false" data-disabled="false" data-selected="false" data-value="Errors-/errors/forbidden" data-url="/errors/forbidden">
												<div class="flex size-4 items-center justify-center">
													<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-arrow-right size-2 text-muted-foreground/80" aria-hidden="true">
														<path d="M5 12h14" />
														<path d="m12 5 7 7-7 7" />
													</svg>
												</div>
												Errors
												<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-chevron-right" aria-hidden="true">
													<path d="m9 18 6-6-6-6" />
												</svg>
												Forbidden
											</div>
											<div data-slot="command-item" class="relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground" id="command-palette-18" cmdk-item="" role="option" aria-disabled="false" aria-selected="false" data-disabled="false" data-selected="false" data-value="Errors-/errors/not-found" data-url="/errors/not-found">
												<div class="flex size-4 items-center justify-center">
													<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-arrow-right size-2 text-muted-foreground/80" aria-hidden="true">
														<path d="M5 12h14" />
														<path d="m12 5 7 7-7 7" />
													</svg>
												</div>
												Errors
												<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-chevron-right" aria-hidden="true">
													<path d="m9 18 6-6-6-6" />
												</svg>
												Not Found
											</div>
											<div data-slot="command-item" class="relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground" id="command-palette-19" cmdk-item="" role="option" aria-disabled="false" aria-selected="false" data-disabled="false" data-selected="false" data-value="Errors-/errors/internal-server-error" data-url="/errors/internal-server-error">
												<div class="flex size-4 items-center justify-center">
													<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-arrow-right size-2 text-muted-foreground/80" aria-hidden="true">
														<path d="M5 12h14" />
														<path d="m12 5 7 7-7 7" />
													</svg>
												</div>
												Errors
												<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-chevron-right" aria-hidden="true">
													<path d="m9 18 6-6-6-6" />
												</svg>
												Internal Server Error
											</div>
											<div data-slot="command-item" class="relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground" id="command-palette-20" cmdk-item="" role="option" aria-disabled="false" aria-selected="false" data-disabled="false" data-selected="false" data-value="Errors-/errors/maintenance-error" data-url="/errors/maintenance-error">
												<div class="flex size-4 items-center justify-center">
													<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-arrow-right size-2 text-muted-foreground/80" aria-hidden="true">
														<path d="M5 12h14" />
														<path d="m12 5 7 7-7 7" />
													</svg>
												</div>
												Errors
												<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-chevron-right" aria-hidden="true">
													<path d="m9 18 6-6-6-6" />
												</svg>
												Maintenance Error
											</div>
										</div>
									</div>
									<div data-slot="command-group" class="overflow-hidden p-1 text-foreground **:[[cmdk-group-heading]]:px-2 **:[[cmdk-group-heading]]:py-1.5 **:[[cmdk-group-heading]]:text-xs **:[[cmdk-group-heading]]:font-medium **:[[cmdk-group-heading]]:text-muted-foreground" cmdk-group="" role="presentation" data-value="Other">
										<div cmdk-group-heading="" aria-hidden="true" id="command-palette-21">Other</div>
										<div cmdk-group-items="" role="group" aria-labelledby="command-palette-21">
											<div data-slot="command-item" class="relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground" id="command-palette-22" cmdk-item="" role="option" aria-disabled="false" aria-selected="false" data-disabled="false" data-selected="false" data-value="Settings-/settings" data-url="/settings">
												<div class="flex size-4 items-center justify-center">
													<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-arrow-right size-2 text-muted-foreground/80" aria-hidden="true">
														<path d="M5 12h14" />
														<path d="m12 5 7 7-7 7" />
													</svg>
												</div>
												Settings
												<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-chevron-right" aria-hidden="true">
													<path d="m9 18 6-6-6-6" />
												</svg>
												Profile
											</div>
											<div data-slot="command-item" class="relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground" id="command-palette-23" cmdk-item="" role="option" aria-disabled="false" aria-selected="false" data-disabled="false" data-selected="false" data-value="Settings-/settings/account" data-url="/settings/account">
												<div class="flex size-4 items-center justify-center">
													<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-arrow-right size-2 text-muted-foreground/80" aria-hidden="true">
														<path d="M5 12h14" />
														<path d="m12 5 7 7-7 7" />
													</svg>
												</div>
												Settings
												<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-chevron-right" aria-hidden="true">
													<path d="m9 18 6-6-6-6" />
												</svg>
												Account
											</div>
											<div data-slot="command-item" class="relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground" id="command-palette-24" cmdk-item="" role="option" aria-disabled="false" aria-selected="false" data-disabled="false" data-selected="false" data-value="Settings-/settings/appearance" data-url="/settings/appearance">
												<div class="flex size-4 items-center justify-center">
													<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-arrow-right size-2 text-muted-foreground/80" aria-hidden="true">
														<path d="M5 12h14" />
														<path d="m12 5 7 7-7 7" />
													</svg>
												</div>
												Settings
												<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-chevron-right" aria-hidden="true">
													<path d="m9 18 6-6-6-6" />
												</svg>
												Appearance
											</div>
											<div data-slot="command-item" class="relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground" id="command-palette-25" cmdk-item="" role="option" aria-disabled="false" aria-selected="false" data-disabled="false" data-selected="false" data-value="Settings-/settings/notifications" data-url="/settings/notifications">
												<div class="flex size-4 items-center justify-center">
													<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-arrow-right size-2 text-muted-foreground/80" aria-hidden="true">
														<path d="M5 12h14" />
														<path d="m12 5 7 7-7 7" />
													</svg>
												</div>
												Settings
												<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-chevron-right" aria-hidden="true">
													<path d="m9 18 6-6-6-6" />
												</svg>
												Notifications
											</div>
											<div data-slot="command-item" class="relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground" id="command-palette-26" cmdk-item="" role="option" aria-disabled="false" aria-selected="false" data-disabled="false" data-selected="false" data-value="Settings-/settings/display" data-url="/settings/display">
												<div class="flex size-4 items-center justify-center">
													<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-arrow-right size-2 text-muted-foreground/80" aria-hidden="true">
														<path d="M5 12h14" />
														<path d="m12 5 7 7-7 7" />
													</svg>
												</div>
												Settings
												<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-chevron-right" aria-hidden="true">
													<path d="m9 18 6-6-6-6" />
												</svg>
												Display
											</div>
											<div data-slot="command-item" class="relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground" id="command-palette-27" cmdk-item="" role="option" aria-disabled="false" aria-selected="false" data-disabled="false" data-selected="false" data-value="Help Center" data-url="/help-center">
												<div class="flex size-4 items-center justify-center">
													<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-arrow-right size-2 text-muted-foreground/80" aria-hidden="true">
														<path d="M5 12h14" />
														<path d="m12 5 7 7-7 7" />
													</svg>
												</div>
												Help Center
											</div>
										</div>
									</div>
									<div data-slot="command-separator" class="-mx-1 h-px bg-border" cmdk-separator="" role="separator"></div>
									<div data-slot="command-group" class="overflow-hidden p-1 text-foreground **:[[cmdk-group-heading]]:px-2 **:[[cmdk-group-heading]]:py-1.5 **:[[cmdk-group-heading]]:text-xs **:[[cmdk-group-heading]]:font-medium **:[[cmdk-group-heading]]:text-muted-foreground" cmdk-group="" role="presentation" data-value="Theme">
										<div cmdk-group-heading="" aria-hidden="true" id="command-palette-28">Theme</div>
										<div cmdk-group-items="" role="group" aria-labelledby="command-palette-28">
											<div data-slot="command-item" class="relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground" id="command-palette-29" cmdk-item="" role="option" aria-disabled="false" aria-selected="false" data-disabled="false" data-selected="false" data-value="Light" data-theme="light">
												<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-sun" aria-hidden="true">
													<circle cx="12" cy="12" r="4" />
													<path d="M12 2v2" />
													<path d="M12 20v2" />
													<path d="m4.93 4.93 1.41 1.41" />
													<path d="m17.66 17.66 1.41 1.41" />
													<path d="M2 12h2" />
													<path d="M20 12h2" />
													<path d="m6.34 17.66-1.41 1.41" />
													<path d="m19.07 4.93-1.41 1.41" />
												</svg>
												<span>Light</span>
											</div>
											<div data-slot="command-item" class="relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground" id="command-palette-30" cmdk-item="" role="option" aria-disabled="false" aria-selected="false" data-disabled="false" data-selected="false" data-value="Dark" data-theme="dark">
												<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-moon scale-90" aria-hidden="true">
													<path d="M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401" />
												</svg>
												<span>Dark</span>
											</div>
											<div data-slot="command-item" class="relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground" id="command-palette-31" cmdk-item="" role="option" aria-disabled="false" aria-selected="false" data-disabled="false" data-selected="false" data-value="System" data-theme="system">
												<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-laptop" aria-hidden="true">
													<path d="M18 5a2 2 0 0 1 2 2v8.526a2 2 0 0 0 .212.897l1.068 2.127a1 1 0 0 1-.9 1.45H3.62a1 1 0 0 1-.9-1.45l1.068-2.127A2 2 0 0 0 4 15.526V7a2 2 0 0 1 2-2z" />
													<path d="M20.054 15.987H3.946" />
												</svg>
												<span>System</span>
											</div>
										</div>
									</div>
								</div>
							</div>
						</div>
					</div>
				</div>
			</div>
			<button type="button" data-slot="dialog-close" onClick={closeSearch} class="absolute inset-e-4 top-4 rounded-xs opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4">
				<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-x" aria-hidden="true">
					<path d="M18 6 6 18" />
					<path d="m6 6 12 12" />
				</svg>
				<span class="sr-only">Close</span>
			</button>
		</div>

		<DropdownMenuContent menu="team" side="right" align="start" sideOffset={4} class="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg">
			<DropdownMenuLabel class="text-xs text-muted-foreground">Teams</DropdownMenuLabel>
			<DropdownMenuItem menu="team" class="gap-2 p-2" onSelect={() => (team = 0)}>
				<div class="flex size-6 items-center justify-center rounded-sm border"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-command size-4 shrink-0" aria-hidden="true"><path d="M15 6v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3" /></svg></div>
				Shadcn Admin
				<DropdownMenuShortcut>⌘1</DropdownMenuShortcut>
			</DropdownMenuItem>
			<DropdownMenuItem menu="team" class="gap-2 p-2" onSelect={() => (team = 1)}>
				<div class="flex size-6 items-center justify-center rounded-sm border"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-gallery-vertical-end size-4 shrink-0" aria-hidden="true"><path d="M7 2h10" /><path d="M5 6h14" /><rect width="18" height="12" x="3" y="10" rx="2" /></svg></div>
				Acme Inc
				<DropdownMenuShortcut>⌘2</DropdownMenuShortcut>
			</DropdownMenuItem>
			<DropdownMenuItem menu="team" class="gap-2 p-2" onSelect={() => (team = 2)}>
				<div class="flex size-6 items-center justify-center rounded-sm border"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-audio-waveform size-4 shrink-0" aria-hidden="true"><path d="M2 13a2 2 0 0 0 2-2V7a2 2 0 0 1 4 0v13a2 2 0 0 0 4 0V4a2 2 0 0 1 4 0v13a2 2 0 0 0 4 0v-4a2 2 0 0 1 2-2" /></svg></div>
				Acme Corp.
				<DropdownMenuShortcut>⌘3</DropdownMenuShortcut>
			</DropdownMenuItem>
			<DropdownMenuSeparator />
			<DropdownMenuItem menu="team" class="gap-2 p-2">
				<div class="flex size-6 items-center justify-center rounded-md border bg-background"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-plus size-4" aria-hidden="true"><path d="M5 12h14" /><path d="M12 5v14" /></svg></div>
				<div class="font-medium text-muted-foreground">Add team</div>
			</DropdownMenuItem>
		</DropdownMenuContent>

		<DropdownMenuContent menu="user" side="right" align="end" sideOffset={4} class="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg">
			<DropdownMenuLabel class="p-0 font-normal">
				<div class="flex items-center gap-2 px-1 py-1.5 text-start text-sm">
					<span data-slot="avatar" class="relative flex size-8 shrink-0 overflow-hidden h-8 w-8 rounded-lg"><span data-slot="avatar-fallback" class="flex size-full items-center justify-center bg-muted rounded-lg">SN</span></span>
					<div class="grid flex-1 text-start text-sm leading-tight">
						<span class="truncate font-semibold">satnaing</span>
						<span class="truncate text-xs">{'satnaingdev@gmail.com'}</span>
					</div>
				</div>
			</DropdownMenuLabel>
			<DropdownMenuSeparator />
			<DropdownMenuGroup>
				<DropdownMenuItem menu="user"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-sparkles" aria-hidden="true"><path d="M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z" /><path d="M20 2v4" /><path d="M22 4h-4" /><circle cx="4" cy="20" r="2" /></svg>Upgrade to Pro</DropdownMenuItem>
			</DropdownMenuGroup>
			<DropdownMenuSeparator />
			<DropdownMenuGroup>
				<DropdownMenuLinkItem href="/settings/account"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-badge-check" aria-hidden="true"><path d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z" /><path d="m9 12 2 2 4-4" /></svg>Account</DropdownMenuLinkItem>
				<DropdownMenuLinkItem href="/settings"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-credit-card" aria-hidden="true"><rect width="20" height="14" x="2" y="5" rx="2" /><line x1="2" x2="22" y1="10" y2="10" /></svg>Billing</DropdownMenuLinkItem>
				<DropdownMenuLinkItem href="/settings/notifications"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-bell" aria-hidden="true"><path d="M10.268 21a2 2 0 0 0 3.464 0" /><path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326" /></svg>Notifications</DropdownMenuLinkItem>
			</DropdownMenuGroup>
			<DropdownMenuSeparator />
			<DropdownMenuItem menu="user" variant="destructive"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-log-out" aria-hidden="true"><path d="m16 17 5-5-5-5" /><path d="M21 12H9" /><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /></svg>Sign out</DropdownMenuItem>
		</DropdownMenuContent>

		<DropdownMenuContent menu="theme" modal={false} align="end">
			<DropdownMenuItem menu="theme" onSelect={() => { theme = 'light'; applyTheme('light'); }}>
				Light
				<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class={lightCheck} aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>
			</DropdownMenuItem>
			<DropdownMenuItem menu="theme" onSelect={() => { theme = 'dark'; applyTheme('dark'); }}>
				Dark
				<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class={darkCheck} aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>
			</DropdownMenuItem>
			<DropdownMenuItem menu="theme" onSelect={() => { theme = 'system'; applyTheme('system'); }}>
				System
				<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class={systemCheck} aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>
			</DropdownMenuItem>
		</DropdownMenuContent>

		<DropdownMenuContent menu="profile" modal={false} align="end" class="w-56">
			<DropdownMenuLabel class="font-normal">
				<div class="flex flex-col gap-1.5">
					<p class="text-sm leading-none font-medium">satnaing</p>
					<p class="text-xs leading-none text-muted-foreground">{'satnaingdev@gmail.com'}</p>
				</div>
			</DropdownMenuLabel>
			<DropdownMenuSeparator />
			<DropdownMenuGroup>
				<DropdownMenuLinkItem href="/settings">Profile<DropdownMenuShortcut>⇧⌘P</DropdownMenuShortcut></DropdownMenuLinkItem>
				<DropdownMenuLinkItem href="/settings">Billing<DropdownMenuShortcut>⌘B</DropdownMenuShortcut></DropdownMenuLinkItem>
				<DropdownMenuLinkItem href="/settings">Settings<DropdownMenuShortcut>⌘S</DropdownMenuShortcut></DropdownMenuLinkItem>
				<DropdownMenuItem menu="profile">New Team</DropdownMenuItem>
			</DropdownMenuGroup>
			<DropdownMenuSeparator />
			<DropdownMenuItem menu="profile" variant="destructive">Sign out<DropdownMenuShortcut class="text-current">⇧⌘Q</DropdownMenuShortcut></DropdownMenuItem>
		</DropdownMenuContent>

		<DropdownMenuContent menu="topnav" modal={false} side="bottom" align="start">
			<DropdownMenuLinkItem href="/dashboard/overview">Overview</DropdownMenuLinkItem>
			<DropdownMenuLinkItem class="text-muted-foreground" aria-disabled="true">Customers</DropdownMenuLinkItem>
			<DropdownMenuLinkItem class="text-muted-foreground" aria-disabled="true">Products</DropdownMenuLinkItem>
			<DropdownMenuLinkItem class="text-muted-foreground" aria-disabled="true">Settings</DropdownMenuLinkItem>
		</DropdownMenuContent>

		<Toaster toasts={toasts} />
	</div>
}
