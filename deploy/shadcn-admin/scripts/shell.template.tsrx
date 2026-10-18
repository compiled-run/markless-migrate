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
			%%SIDEBAR%%
			<div data-slot="sidebar-inset" class="relative flex w-full flex-1 flex-col bg-background md:peer-data-[variant=inset]:m-2 md:peer-data-[variant=inset]:ms-0 md:peer-data-[variant=inset]:rounded-xl md:peer-data-[variant=inset]:shadow-sm md:peer-data-[variant=inset]:peer-data-[state=collapsed]:ms-2 @container/content has-data-[layout=fixed]:h-svh peer-data-[variant=inset]:has-data-[layout=fixed]:h-[calc(100svh-(var(--spacing)*4))]">
				@if (topNav) {
					%%HEADER_DASHBOARD%%
				} @else {
					%%HEADER_USERS%%
				}
				{children}
			</div>
		</div>

		<div data-slot="dialog-header" class="flex flex-col gap-2 text-center sm:text-start sr-only">
			<h2 id="command-palette-title" data-slot="dialog-title" class="text-lg leading-none font-semibold">Command Palette</h2>
			<p id="command-palette-description" data-slot="dialog-description" class="text-sm text-muted-foreground">Search for a command to run...</p>
		</div>

		%%SEARCH%%

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
