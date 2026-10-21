// The old app's AuthenticatedLayout: sidebar (team switcher, nav groups, nav user), the header (sidebar
// trigger, top nav, search, theme switch, config drawer, profile menu), the config drawer and the menus they
// open. The markup is the old app's rendered DOM (deploy/shadcn-admin/scripts/gen-shell.py, extended by hand for
// every route's header and the drawer); the behaviour is ported here.
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
import { applyDir, applyTheme, exitDone, focusDialogOf, rememberCollapsible, rememberSidebar, rememberVariant, resetDir, resetTheme, signOut } from './shell-behaviour.ts';
import { shellPrefs, SkipToMain } from './shell-prefs.tsrx';
import { chosenCommand, filterCommands, moveSelection, resetPalette } from '../../lib/parity/cmdk/behaviour.ts';
import { hideScrollbar, placeScrollThumb, showScrollbar } from '../../lib/parity/radix-ui-react-scroll-area/hover-scrollbar.ts';
import { DialogClose, DialogContent, DialogDescription, DialogOverlay, DialogPortal, DialogRoot, DialogTitle, DialogTrigger } from '../../lib/ports/radix-ui-react-dialog/dialog.tsrx';
import { AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogOverlay, AlertDialogPortal, AlertDialogRoot, AlertDialogTitle } from '../../lib/ports/radix-ui-react-dialog/alert-dialog.tsrx';
import { focusGroup, radioFocused, radioKeys } from '../../lib/parity/radix-ui-react-radio-group/behaviour.ts';
import type { Toast } from '../../lib/parity/sonner/index.ts';
import { Toaster } from '../../lib/parity/sonner/toaster.tsrx';

export type ShellProps = {
	/** The route's pathname: its sidebar links show as active, and the collapsible holding it starts open. */
	readonly active: string;
	/** Which header the old page renders: the dashboard's top nav, the Search header, the Clerk key page's bar, or none. */
	readonly header: 'topnav' | 'search' | 'clerk' | 'none';
	/** The old <Header fixed>: it sticks to the top and takes a shadow once the page scrolls. */
	readonly fixed?: boolean;
	/** The old <Header className='border-b'>. */
	readonly border?: boolean;
	readonly children?: Children;
};

export function Shell({ active, header, fixed, border, children }: ShellProps) @{
	// The server renders the providers' defaults for every visitor; SkipToMain reads the saved cookies in the browser.
	const prefs = shellPrefs();
	let clerkOpen = state(active === '/clerk/sign-in' || active === '/clerk/sign-up' || active === '/clerk/user-management');
	let authOpen = state(active === '/sign-in' || active === '/sign-in-2' || active === '/sign-up' || active === '/forgot-password' || active === '/otp');
	let errorsOpen = state(active === '/errors/unauthorized' || active === '/errors/forbidden' || active === '/errors/not-found' || active === '/errors/internal-server-error' || active === '/errors/maintenance-error');
	let settingsOpen = state(active === '/settings' || active === '/settings/account' || active === '/settings/appearance' || active === '/settings/notifications' || active === '/settings/display');
	let team = state(0);
	let searchOpen = state(false);
	let drawerOpen = state(false);
	// Radix mounts the command palette and the theme drawer on their first opening; what they carry from then on stays.
	let searchSeen = state(false);
	let drawerSeen = state(false);
	let signOutOpen = state(false);
	let toasts = state<Toast[]>([]);
	const isTopNav = header === 'topnav';
	const isSearchBorder = header === 'search' && fixed === true && border === true;
	const isSearchFixed = header === 'search' && fixed === true && border !== true;
	const isSearch = header === 'search' && fixed !== true;
	const isClerk = header === 'clerk';

	const sidebarState = computed(() => (prefs.open ? 'expanded' : 'collapsed'));
	const sidebarCollapsible = computed(() => (prefs.open ? '' : prefs.collapsible));
	const inset = computed(() => prefs.variant === 'floating' || prefs.variant === 'inset');
	const gapClass = computed(() => `relative w-(--sidebar-width) bg-transparent transition-[width] duration-200 ease-linear group-data-[collapsible=offcanvas]:w-0 group-data-[side=right]:rotate-180 ${inset ? 'group-data-[collapsible=icon]:w-[calc(var(--sidebar-width-icon)+(--spacing(4)))]' : 'group-data-[collapsible=icon]:w-(--sidebar-width-icon)'}`);
	const containerClass = computed(() => `fixed inset-y-0 z-10 hidden h-svh w-(--sidebar-width) transition-[inset-inline,width] duration-200 ease-linear md:flex inset-s-0 group-data-[collapsible=offcanvas]:-inset-s-[calc(var(--sidebar-width))] ${inset ? 'p-2 group-data-[collapsible=icon]:w-[calc(var(--sidebar-width-icon)+(--spacing(4))+2px)]' : 'group-data-[collapsible=icon]:w-(--sidebar-width-icon) group-data-[side=left]:border-e group-data-[side=right]:border-s'}`);
	const clerkState = computed(() => (clerkOpen ? 'open' : 'closed'));
	const clerkExpanded = computed(() => (clerkOpen ? 'true' : 'false'));
	const authState = computed(() => (authOpen ? 'open' : 'closed'));
	const authExpanded = computed(() => (authOpen ? 'true' : 'false'));
	const errorsState = computed(() => (errorsOpen ? 'open' : 'closed'));
	const errorsExpanded = computed(() => (errorsOpen ? 'true' : 'false'));
	const settingsState = computed(() => (settingsOpen ? 'open' : 'closed'));
	const settingsExpanded = computed(() => (settingsOpen ? 'true' : 'false'));
	// Radix Collapsible holds back the open animation of content open on mount until it is first toggled, and hides closed content once its exit animation ends.
	// Content closed on mount is not measured, so it carries no size until it is first opened.
	let clerkToggled = state(false);
	let clerkClosed = state(!(active === '/clerk/sign-in' || active === '/clerk/sign-up' || active === '/clerk/user-management'));
	let authToggled = state(false);
	let authClosed = state(!(active === '/sign-in' || active === '/sign-in-2' || active === '/sign-up' || active === '/forgot-password' || active === '/otp'));
	let errorsToggled = state(false);
	let errorsClosed = state(!(active === '/errors/unauthorized' || active === '/errors/forbidden' || active === '/errors/not-found' || active === '/errors/internal-server-error' || active === '/errors/maintenance-error'));
	let settingsToggled = state(false);
	let settingsClosed = state(!(active === '/settings' || active === '/settings/account' || active === '/settings/appearance' || active === '/settings/notifications' || active === '/settings/display'));
	const clerkStyle = computed(() => (clerkOpen || clerkToggled ? `${clerkOpen && !clerkToggled ? 'transition-duration: 0s; animation-name: none; ' : ''}--radix-collapsible-content-height: 96px; --radix-collapsible-content-width: 224px;` : undefined));
	const authStyle = computed(() => (authOpen || authToggled ? `${authOpen && !authToggled ? 'transition-duration: 0s; animation-name: none; ' : ''}--radix-collapsible-content-height: 160px; --radix-collapsible-content-width: 224px;` : undefined));
	const errorsStyle = computed(() => (errorsOpen || errorsToggled ? `${errorsOpen && !errorsToggled ? 'transition-duration: 0s; animation-name: none; ' : ''}--radix-collapsible-content-height: 160px; --radix-collapsible-content-width: 224px;` : undefined));
	const settingsStyle = computed(() => (settingsOpen || settingsToggled ? `${settingsOpen && !settingsToggled ? 'transition-duration: 0s; animation-name: none; ' : ''}--radix-collapsible-content-height: 160px; --radix-collapsible-content-width: 224px;` : undefined));

	// A state value cannot index an array in a recipe (MARKLESS_SYMBOL_MODULE_UNRESOLVED_GRAPH_REFERENCE), so the three teams are spelled out.
	const teamName = computed(() => (team === 1 ? 'Acme Inc' : team === 2 ? 'Acme Corp.' : 'Shadcn Admin'));
	const teamPlan = computed(() => (team === 1 ? 'Enterprise' : team === 2 ? 'Startup' : 'Vite + ShadcnUI'));
	const lightCheck = computed(() => (prefs.theme === 'light' ? 'lucide lucide-check ms-auto' : 'lucide lucide-check ms-auto hidden'));
	const darkCheck = computed(() => (prefs.theme === 'dark' ? 'lucide lucide-check ms-auto' : 'lucide lucide-check ms-auto hidden'));
	const systemCheck = computed(() => (prefs.theme === 'system' ? 'lucide lucide-check ms-auto' : 'lucide lucide-check ms-auto hidden'));

	const layoutValue = computed(() => (prefs.open ? 'default' : prefs.collapsible));
	const themeSystem = computed(() => (prefs.theme === 'system' ? 'true' : 'false'));
	const themeSystemState = computed(() => (prefs.theme === 'system' ? 'checked' : 'unchecked'));
	const themeLight = computed(() => (prefs.theme === 'light' ? 'true' : 'false'));
	const themeLightState = computed(() => (prefs.theme === 'light' ? 'checked' : 'unchecked'));
	const themeDark = computed(() => (prefs.theme === 'dark' ? 'true' : 'false'));
	const themeDarkState = computed(() => (prefs.theme === 'dark' ? 'checked' : 'unchecked'));
	const variantInset = computed(() => (prefs.variant === 'inset' ? 'true' : 'false'));
	const variantInsetState = computed(() => (prefs.variant === 'inset' ? 'checked' : 'unchecked'));
	const variantFloating = computed(() => (prefs.variant === 'floating' ? 'true' : 'false'));
	const variantFloatingState = computed(() => (prefs.variant === 'floating' ? 'checked' : 'unchecked'));
	const variantSidebar = computed(() => (prefs.variant === 'sidebar' ? 'true' : 'false'));
	const variantSidebarState = computed(() => (prefs.variant === 'sidebar' ? 'checked' : 'unchecked'));
	const layoutDefault = computed(() => (layoutValue === 'default' ? 'true' : 'false'));
	const layoutDefaultState = computed(() => (layoutValue === 'default' ? 'checked' : 'unchecked'));
	const layoutIcon = computed(() => (layoutValue === 'icon' ? 'true' : 'false'));
	const layoutIconState = computed(() => (layoutValue === 'icon' ? 'checked' : 'unchecked'));
	const layoutOffcanvas = computed(() => (layoutValue === 'offcanvas' ? 'true' : 'false'));
	const layoutOffcanvasState = computed(() => (layoutValue === 'offcanvas' ? 'checked' : 'unchecked'));
	const dirLtr = computed(() => (prefs.dir === 'ltr' ? 'true' : 'false'));
	const dirLtrState = computed(() => (prefs.dir === 'ltr' ? 'checked' : 'unchecked'));
	const dirRtl = computed(() => (prefs.dir === 'rtl' ? 'true' : 'false'));
	const dirRtlState = computed(() => (prefs.dir === 'rtl' ? 'checked' : 'unchecked'));
	const themeDefault = computed(() => prefs.theme === 'system');
	const variantDefault = computed(() => prefs.variant === 'inset');
	const layoutIsDefault = computed(() => layoutValue === 'default');
	// Closed and never opened, the theme drawer and the command palette carry none of their inline styles.
	const drawerOutline = computed(() => (drawerSeen ? 'outline: none;' : undefined));
	const paletteLabelStyle = computed(() => (searchSeen ? 'position: absolute; width: 1px; height: 1px; padding: 0px; margin: -1px; overflow: hidden; clip: rect(0px, 0px, 0px, 0px); white-space: nowrap; border-width: 0px;' : undefined));
	const paletteListStyle = computed(() => (searchSeen ? '--cmdk-list-height: 288.0px;' : undefined));
	const paletteScrollStyle = computed(() => (searchSeen ? 'position: relative; --radix-scroll-area-corner-width: 0px; --radix-scroll-area-corner-height: 0px;' : undefined));
	const paletteViewportStyle = computed(() => (searchSeen ? 'overflow: hidden scroll;' : undefined));
	const paletteTableStyle = computed(() => (searchSeen ? 'min-width: 100%; display: table;' : undefined));
	const dirDefault = computed(() => prefs.dir === 'ltr');

	const toggleSidebar = () => {
		prefs.open = !prefs.open;
		rememberSidebar(prefs.open);
	};
	const openSearch = () => {
		resetPalette();
		searchOpen = true;
		searchSeen = true;
	};
	const searchKeys = (event: KeyboardEvent) => {
		if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Home' || event.key === 'End' || event.key === 'Enter') event.preventDefault();
		if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Home' || event.key === 'End') {
			moveSelection(event.key);
		} else if (event.key === 'Enter') {
			// Inline on purpose: a handler cannot call another function of the component (MARKLESS_EVENT_HANDLER_EMIT_UNSUPPORTED).
			const command = chosenCommand();
			if (command) {
				searchOpen = false;
				if (command.theme) {
					prefs.theme = command.theme;
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
		if (command.theme) {
			prefs.theme = command.theme;
			applyTheme(command.theme);
		}
		if (command.url) location.assign(command.url);
	};
	const openSignOut = () => {
		signOutOpen = true;
	};
	const radioKey = (event: KeyboardEvent) => {
		if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'ArrowLeft' || event.key === 'ArrowRight') event.preventDefault();
		radioKeys(event);
	};

	<div class="contents">
		<div data-slot="sidebar-wrapper" class="group/sidebar-wrapper flex min-h-svh w-full md:has-data-[variant=inset]:bg-sidebar" style="--sidebar-width: 16rem; --sidebar-width-icon: 3rem;">
			<SkipToMain />
			<div class="group peer hidden text-sidebar-foreground md:block" data-state={sidebarState} data-collapsible={sidebarCollapsible} data-variant={prefs.variant} data-side="left" data-slot="sidebar">
				<div data-slot="sidebar-gap" class={gapClass}></div>
				<div data-slot="sidebar-container" class={containerClass}>
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
										<a data-slot="sidebar-menu-button" data-sidebar="menu-button" data-size="default" data-active={active === '/' ? 'true' : 'false'} data-state="closed" href="/" class={active === '/' ? 'peer/menu-button flex w-full items-center gap-2 overflow-hidden rounded-md p-2 text-start outline-hidden ring-sidebar-ring transition-[width,height,padding] focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 group-has-data-[sidebar=menu-action]/menu-item:pe-8 aria-disabled:pointer-events-none aria-disabled:opacity-50 data-[active=true]:bg-sidebar-accent data-[active=true]:font-medium data-[active=true]:text-sidebar-accent-foreground data-[state=open]:hover:bg-sidebar-accent data-[state=open]:hover:text-sidebar-accent-foreground group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:p-2! [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground h-8 text-sm active' : 'peer/menu-button flex w-full items-center gap-2 overflow-hidden rounded-md p-2 text-start outline-hidden ring-sidebar-ring transition-[width,height,padding] focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 group-has-data-[sidebar=menu-action]/menu-item:pe-8 aria-disabled:pointer-events-none aria-disabled:opacity-50 data-[active=true]:bg-sidebar-accent data-[active=true]:font-medium data-[active=true]:text-sidebar-accent-foreground data-[state=open]:hover:bg-sidebar-accent data-[state=open]:hover:text-sidebar-accent-foreground group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:p-2! [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground h-8 text-sm'} data-status={active === '/' ? 'active' : undefined} aria-current={active === '/' ? 'page' : undefined}>
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
										<a data-slot="sidebar-menu-button" data-sidebar="menu-button" data-size="default" data-active={active === '/tasks' ? 'true' : 'false'} data-state="closed" href="/tasks" class={(active === '/tasks' || active.startsWith('/tasks/')) ? 'peer/menu-button flex w-full items-center gap-2 overflow-hidden rounded-md p-2 text-start outline-hidden ring-sidebar-ring transition-[width,height,padding] focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 group-has-data-[sidebar=menu-action]/menu-item:pe-8 aria-disabled:pointer-events-none aria-disabled:opacity-50 data-[active=true]:bg-sidebar-accent data-[active=true]:font-medium data-[active=true]:text-sidebar-accent-foreground data-[state=open]:hover:bg-sidebar-accent data-[state=open]:hover:text-sidebar-accent-foreground group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:p-2! [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground h-8 text-sm active' : 'peer/menu-button flex w-full items-center gap-2 overflow-hidden rounded-md p-2 text-start outline-hidden ring-sidebar-ring transition-[width,height,padding] focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 group-has-data-[sidebar=menu-action]/menu-item:pe-8 aria-disabled:pointer-events-none aria-disabled:opacity-50 data-[active=true]:bg-sidebar-accent data-[active=true]:font-medium data-[active=true]:text-sidebar-accent-foreground data-[state=open]:hover:bg-sidebar-accent data-[state=open]:hover:text-sidebar-accent-foreground group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:p-2! [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground h-8 text-sm'} data-status={(active === '/tasks' || active.startsWith('/tasks/')) ? 'active' : undefined} aria-current={(active === '/tasks' || active.startsWith('/tasks/')) ? 'page' : undefined}>
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
										<a data-slot="sidebar-menu-button" data-sidebar="menu-button" data-size="default" data-active={active === '/apps' ? 'true' : 'false'} data-state="closed" href="/apps" class={(active === '/apps' || active.startsWith('/apps/')) ? 'peer/menu-button flex w-full items-center gap-2 overflow-hidden rounded-md p-2 text-start outline-hidden ring-sidebar-ring transition-[width,height,padding] focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 group-has-data-[sidebar=menu-action]/menu-item:pe-8 aria-disabled:pointer-events-none aria-disabled:opacity-50 data-[active=true]:bg-sidebar-accent data-[active=true]:font-medium data-[active=true]:text-sidebar-accent-foreground data-[state=open]:hover:bg-sidebar-accent data-[state=open]:hover:text-sidebar-accent-foreground group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:p-2! [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground h-8 text-sm active' : 'peer/menu-button flex w-full items-center gap-2 overflow-hidden rounded-md p-2 text-start outline-hidden ring-sidebar-ring transition-[width,height,padding] focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 group-has-data-[sidebar=menu-action]/menu-item:pe-8 aria-disabled:pointer-events-none aria-disabled:opacity-50 data-[active=true]:bg-sidebar-accent data-[active=true]:font-medium data-[active=true]:text-sidebar-accent-foreground data-[state=open]:hover:bg-sidebar-accent data-[state=open]:hover:text-sidebar-accent-foreground group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:p-2! [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground h-8 text-sm'} data-status={(active === '/apps' || active.startsWith('/apps/')) ? 'active' : undefined} aria-current={(active === '/apps' || active.startsWith('/apps/')) ? 'page' : undefined}>
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
										<a data-slot="sidebar-menu-button" data-sidebar="menu-button" data-size="default" data-active={active === '/chats' ? 'true' : 'false'} data-state="closed" href="/chats" class={(active === '/chats' || active.startsWith('/chats/')) ? 'peer/menu-button flex w-full items-center gap-2 overflow-hidden rounded-md p-2 text-start outline-hidden ring-sidebar-ring transition-[width,height,padding] focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 group-has-data-[sidebar=menu-action]/menu-item:pe-8 aria-disabled:pointer-events-none aria-disabled:opacity-50 data-[active=true]:bg-sidebar-accent data-[active=true]:font-medium data-[active=true]:text-sidebar-accent-foreground data-[state=open]:hover:bg-sidebar-accent data-[state=open]:hover:text-sidebar-accent-foreground group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:p-2! [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground h-8 text-sm active' : 'peer/menu-button flex w-full items-center gap-2 overflow-hidden rounded-md p-2 text-start outline-hidden ring-sidebar-ring transition-[width,height,padding] focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 group-has-data-[sidebar=menu-action]/menu-item:pe-8 aria-disabled:pointer-events-none aria-disabled:opacity-50 data-[active=true]:bg-sidebar-accent data-[active=true]:font-medium data-[active=true]:text-sidebar-accent-foreground data-[state=open]:hover:bg-sidebar-accent data-[state=open]:hover:text-sidebar-accent-foreground group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:p-2! [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground h-8 text-sm'} data-status={(active === '/chats' || active.startsWith('/chats/')) ? 'active' : undefined} aria-current={(active === '/chats' || active.startsWith('/chats/')) ? 'page' : undefined}>
											<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-messages-square" aria-hidden="true">
												<path d="M16 10a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 14.286V4a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
												<path d="M20 9a2 2 0 0 1 2 2v10.286a.71.71 0 0 1-1.212.502l-2.202-2.202A2 2 0 0 0 17.172 19H10a2 2 0 0 1-2-2v-1" />
											</svg>
											<span>Chats</span>
											<span data-slot="badge" class="inline-flex items-center justify-center border font-medium w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1 [&>svg]:pointer-events-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive transition-[color,box-shadow] overflow-hidden border-transparent bg-primary text-primary-foreground [a&]:hover:bg-primary/90 rounded-full px-1 py-0 text-xs">3</span>
										</a>
									</li>
									<li data-slot="sidebar-menu-item" data-sidebar="menu-item" class="group/menu-item relative">
										<a data-slot="sidebar-menu-button" data-sidebar="menu-button" data-size="default" data-active={active === '/users' ? 'true' : 'false'} data-state="closed" href="/users" class={(active === '/users' || active.startsWith('/users/')) ? 'peer/menu-button flex w-full items-center gap-2 overflow-hidden rounded-md p-2 text-start outline-hidden ring-sidebar-ring transition-[width,height,padding] focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 group-has-data-[sidebar=menu-action]/menu-item:pe-8 aria-disabled:pointer-events-none aria-disabled:opacity-50 data-[active=true]:bg-sidebar-accent data-[active=true]:font-medium data-[active=true]:text-sidebar-accent-foreground data-[state=open]:hover:bg-sidebar-accent data-[state=open]:hover:text-sidebar-accent-foreground group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:p-2! [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground h-8 text-sm active' : 'peer/menu-button flex w-full items-center gap-2 overflow-hidden rounded-md p-2 text-start outline-hidden ring-sidebar-ring transition-[width,height,padding] focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 group-has-data-[sidebar=menu-action]/menu-item:pe-8 aria-disabled:pointer-events-none aria-disabled:opacity-50 data-[active=true]:bg-sidebar-accent data-[active=true]:font-medium data-[active=true]:text-sidebar-accent-foreground data-[state=open]:hover:bg-sidebar-accent data-[state=open]:hover:text-sidebar-accent-foreground group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:p-2! [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground h-8 text-sm'} data-status={(active === '/users' || active.startsWith('/users/')) ? 'active' : undefined} aria-current={(active === '/users' || active.startsWith('/users/')) ? 'page' : undefined}>
											<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-users" aria-hidden="true">
												<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
												<path d="M16 3.128a4 4 0 0 1 0 7.744" />
												<path d="M22 21v-2a4 4 0 0 0-3-3.87" />
												<circle cx="9" cy="7" r="4" />
											</svg>
											<span>Users</span>
										</a>
									</li>
									<li data-slot="collapsible" data-sidebar="menu-item" class="group/menu-item relative group/collapsible" hidden={!prefs.open} data-state={clerkState}>
										<button data-slot="collapsible-trigger" data-sidebar="menu-button" data-size="default" data-active="false" class="peer/menu-button flex w-full items-center gap-2 overflow-hidden rounded-md p-2 text-start outline-hidden ring-sidebar-ring transition-[width,height,padding] focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 group-has-data-[sidebar=menu-action]/menu-item:pe-8 aria-disabled:pointer-events-none aria-disabled:opacity-50 data-[active=true]:bg-sidebar-accent data-[active=true]:font-medium data-[active=true]:text-sidebar-accent-foreground data-[state=open]:hover:bg-sidebar-accent data-[state=open]:hover:text-sidebar-accent-foreground group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:p-2! [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground h-8 text-sm" type="button" aria-controls="radix-_r_7_" aria-expanded={clerkExpanded} data-state={clerkState} onClick={() => {
											clerkToggled = true;
											if (!clerkOpen) clerkClosed = false;
											else setTimeout(() => {
												if (exitDone('radix-_r_7_')) clerkClosed = true;
											});
											clerkOpen = !clerkOpen;
										}}>
											<svg role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" id="clerk" height="24" width="24" class="[&>path]:fill-foreground">
												<title>Clerk</title>
												<path d="m21.47 20.829 -2.881 -2.881a0.572 0.572 0 0 0 -0.7 -0.084 6.854 6.854 0 0 1 -7.081 0 0.576 0.576 0 0 0 -0.7 0.084l-2.881 2.881a0.576 0.576 0 0 0 -0.103 0.69 0.57 0.57 0 0 0 0.166 0.186 12 12 0 0 0 14.113 0 0.58 0.58 0 0 0 0.239 -0.423 0.576 0.576 0 0 0 -0.172 -0.453Zm0.002 -17.668 -2.88 2.88a0.569 0.569 0 0 1 -0.701 0.084A6.857 6.857 0 0 0 8.724 8.08a6.862 6.862 0 0 0 -1.222 3.692 6.86 6.86 0 0 0 0.978 3.764 0.573 0.573 0 0 1 -0.083 0.699l-2.881 2.88a0.567 0.567 0 0 1 -0.864 -0.063A11.993 11.993 0 0 1 6.771 2.7a11.99 11.99 0 0 1 14.637 -0.405 0.566 0.566 0 0 1 0.232 0.418 0.57 0.57 0 0 1 -0.168 0.448Zm-7.118 12.261a3.427 3.427 0 1 0 0 -6.854 3.427 3.427 0 0 0 0 6.854Z" stroke-width="1" />
											</svg>
											<span>Secured by Clerk</span>{' '}
											<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-chevron-right ms-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90 rtl:rotate-180" aria-hidden="true">
												<path d="m9 18 6-6-6-6" />
											</svg>
									{' '}	</button>
										<div data-state={clerkState} id="radix-_r_7_" hidden={clerkClosed} data-slot="collapsible-content" class="CollapsibleContent" style={clerkStyle} onAnimationend={() => {
											if (!clerkOpen) clerkClosed = true;
										}}>
											<ul data-slot="sidebar-menu-sub" data-sidebar="menu-sub" class="mx-3.5 flex min-w-0 translate-x-px flex-col gap-1 border-s border-sidebar-border px-2.5 py-0.5 group-data-[collapsible=icon]:hidden">
												<li data-slot="sidebar-menu-sub-item" data-sidebar="menu-sub-item" class="group/menu-sub-item relative">
													<a data-slot="sidebar-menu-sub-button" data-sidebar="menu-sub-button" data-size="md" data-active={active === '/clerk/sign-in' ? 'true' : 'false'} href="/clerk/sign-in" class={(active === '/clerk/sign-in' || active.startsWith('/clerk/sign-in/')) ? 'flex h-7 min-w-0 -translate-x-px items-center gap-2 overflow-hidden rounded-md px-2 text-sidebar-foreground ring-sidebar-ring outline-hidden hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-inherit data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground text-sm group-data-[collapsible=icon]:hidden active' : 'flex h-7 min-w-0 -translate-x-px items-center gap-2 overflow-hidden rounded-md px-2 text-sidebar-foreground ring-sidebar-ring outline-hidden hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-inherit data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground text-sm group-data-[collapsible=icon]:hidden'} data-status={(active === '/clerk/sign-in' || active.startsWith('/clerk/sign-in/')) ? 'active' : undefined} aria-current={(active === '/clerk/sign-in' || active.startsWith('/clerk/sign-in/')) ? 'page' : undefined}>
														<span>Sign In</span>
													</a>
												</li>
												<li data-slot="sidebar-menu-sub-item" data-sidebar="menu-sub-item" class="group/menu-sub-item relative">
													<a data-slot="sidebar-menu-sub-button" data-sidebar="menu-sub-button" data-size="md" data-active={active === '/clerk/sign-up' ? 'true' : 'false'} href="/clerk/sign-up" class={(active === '/clerk/sign-up' || active.startsWith('/clerk/sign-up/')) ? 'flex h-7 min-w-0 -translate-x-px items-center gap-2 overflow-hidden rounded-md px-2 text-sidebar-foreground ring-sidebar-ring outline-hidden hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-inherit data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground text-sm group-data-[collapsible=icon]:hidden active' : 'flex h-7 min-w-0 -translate-x-px items-center gap-2 overflow-hidden rounded-md px-2 text-sidebar-foreground ring-sidebar-ring outline-hidden hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-inherit data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground text-sm group-data-[collapsible=icon]:hidden'} data-status={(active === '/clerk/sign-up' || active.startsWith('/clerk/sign-up/')) ? 'active' : undefined} aria-current={(active === '/clerk/sign-up' || active.startsWith('/clerk/sign-up/')) ? 'page' : undefined}>
														<span>Sign Up</span>
													</a>
												</li>
												<li data-slot="sidebar-menu-sub-item" data-sidebar="menu-sub-item" class="group/menu-sub-item relative">
													<a data-slot="sidebar-menu-sub-button" data-sidebar="menu-sub-button" data-size="md" data-active={active === '/clerk/user-management' ? 'true' : 'false'} href="/clerk/user-management" class={(active === '/clerk/user-management' || active.startsWith('/clerk/user-management/')) ? 'flex h-7 min-w-0 -translate-x-px items-center gap-2 overflow-hidden rounded-md px-2 text-sidebar-foreground ring-sidebar-ring outline-hidden hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-inherit data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground text-sm group-data-[collapsible=icon]:hidden active' : 'flex h-7 min-w-0 -translate-x-px items-center gap-2 overflow-hidden rounded-md px-2 text-sidebar-foreground ring-sidebar-ring outline-hidden hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-inherit data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground text-sm group-data-[collapsible=icon]:hidden'} data-status={(active === '/clerk/user-management' || active.startsWith('/clerk/user-management/')) ? 'active' : undefined} aria-current={(active === '/clerk/user-management' || active.startsWith('/clerk/user-management/')) ? 'page' : undefined}>
														<span>User Management</span>
													</a>
												</li>
											</ul>
										</div>
									</li>
									<li data-slot="sidebar-menu-item" data-sidebar="menu-item" class="group/menu-item relative" hidden={prefs.open}>
										<DropdownMenuTrigger menu="nav-clerk" data-sidebar="menu-button" data-size="default" data-active={active === '/clerk/sign-in' || active === '/clerk/sign-up' || active === '/clerk/user-management' ? 'true' : 'false'} class="peer/menu-button flex w-full items-center gap-2 overflow-hidden rounded-md p-2 text-start outline-hidden ring-sidebar-ring transition-[width,height,padding] focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 group-has-data-[sidebar=menu-action]/menu-item:pe-8 aria-disabled:pointer-events-none aria-disabled:opacity-50 data-[active=true]:bg-sidebar-accent data-[active=true]:font-medium data-[active=true]:text-sidebar-accent-foreground data-[state=open]:hover:bg-sidebar-accent data-[state=open]:hover:text-sidebar-accent-foreground group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:p-2! [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground h-8 text-sm">
											<svg role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" id="clerk" height="24" width="24" class="[&>path]:fill-foreground">
												<title>Clerk</title>
												<path d="m21.47 20.829 -2.881 -2.881a0.572 0.572 0 0 0 -0.7 -0.084 6.854 6.854 0 0 1 -7.081 0 0.576 0.576 0 0 0 -0.7 0.084l-2.881 2.881a0.576 0.576 0 0 0 -0.103 0.69 0.57 0.57 0 0 0 0.166 0.186 12 12 0 0 0 14.113 0 0.58 0.58 0 0 0 0.239 -0.423 0.576 0.576 0 0 0 -0.172 -0.453Zm0.002 -17.668 -2.88 2.88a0.569 0.569 0 0 1 -0.701 0.084A6.857 6.857 0 0 0 8.724 8.08a6.862 6.862 0 0 0 -1.222 3.692 6.86 6.86 0 0 0 0.978 3.764 0.573 0.573 0 0 1 -0.083 0.699l-2.881 2.88a0.567 0.567 0 0 1 -0.864 -0.063A11.993 11.993 0 0 1 6.771 2.7a11.99 11.99 0 0 1 14.637 -0.405 0.566 0.566 0 0 1 0.232 0.418 0.57 0.57 0 0 1 -0.168 0.448Zm-7.118 12.261a3.427 3.427 0 1 0 0 -6.854 3.427 3.427 0 0 0 0 6.854Z" stroke-width="1" />
											</svg>
											<span>Secured by Clerk</span>{' '}
											<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-chevron-right ms-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" aria-hidden="true">
												<path d="m9 18 6-6-6-6" />
											</svg>
									{' '}	</DropdownMenuTrigger>
									</li>
								</ul>
							</div>
							<div data-slot="sidebar-group" data-sidebar="group" class="relative flex w-full min-w-0 flex-col p-2">
								<div data-slot="sidebar-group-label" data-sidebar="group-label" class="flex h-8 shrink-0 items-center rounded-md px-2 text-xs font-medium text-sidebar-foreground/70 ring-sidebar-ring outline-hidden transition-[margin,opacity] duration-200 ease-linear focus-visible:ring-2 [&>svg]:size-4 [&>svg]:shrink-0 group-data-[collapsible=icon]:-mt-8 group-data-[collapsible=icon]:opacity-0">Pages</div>
								<ul data-slot="sidebar-menu" data-sidebar="menu" class="flex w-full min-w-0 flex-col gap-1">
									<li data-slot="collapsible" data-sidebar="menu-item" class="group/menu-item relative group/collapsible" hidden={!prefs.open} data-state={authState}>
										<button data-slot="collapsible-trigger" data-sidebar="menu-button" data-size="default" data-active="false" class="peer/menu-button flex w-full items-center gap-2 overflow-hidden rounded-md p-2 text-start outline-hidden ring-sidebar-ring transition-[width,height,padding] focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 group-has-data-[sidebar=menu-action]/menu-item:pe-8 aria-disabled:pointer-events-none aria-disabled:opacity-50 data-[active=true]:bg-sidebar-accent data-[active=true]:font-medium data-[active=true]:text-sidebar-accent-foreground data-[state=open]:hover:bg-sidebar-accent data-[state=open]:hover:text-sidebar-accent-foreground group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:p-2! [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground h-8 text-sm" type="button" aria-controls="radix-_r_9_" aria-expanded={authExpanded} data-state={authState} onClick={() => {
											authToggled = true;
											if (!authOpen) authClosed = false;
											else setTimeout(() => {
												if (exitDone('radix-_r_9_')) authClosed = true;
											});
											authOpen = !authOpen;
										}}>
											<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-shield-check" aria-hidden="true">
												<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
												<path d="m9 12 2 2 4-4" />
											</svg>
											<span>Auth</span>{' '}
											<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-chevron-right ms-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90 rtl:rotate-180" aria-hidden="true">
												<path d="m9 18 6-6-6-6" />
											</svg>
									{' '}	</button>
										<div data-state={authState} id="radix-_r_9_" hidden={authClosed} data-slot="collapsible-content" class="CollapsibleContent" style={authStyle} onAnimationend={() => {
											if (!authOpen) authClosed = true;
										}}>
											<ul data-slot="sidebar-menu-sub" data-sidebar="menu-sub" class="mx-3.5 flex min-w-0 translate-x-px flex-col gap-1 border-s border-sidebar-border px-2.5 py-0.5 group-data-[collapsible=icon]:hidden">
												<li data-slot="sidebar-menu-sub-item" data-sidebar="menu-sub-item" class="group/menu-sub-item relative">
													<a data-slot="sidebar-menu-sub-button" data-sidebar="menu-sub-button" data-size="md" data-active={active === '/sign-in' ? 'true' : 'false'} href="/sign-in" class={(active === '/sign-in' || active.startsWith('/sign-in/')) ? 'flex h-7 min-w-0 -translate-x-px items-center gap-2 overflow-hidden rounded-md px-2 text-sidebar-foreground ring-sidebar-ring outline-hidden hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-inherit data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground text-sm group-data-[collapsible=icon]:hidden active' : 'flex h-7 min-w-0 -translate-x-px items-center gap-2 overflow-hidden rounded-md px-2 text-sidebar-foreground ring-sidebar-ring outline-hidden hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-inherit data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground text-sm group-data-[collapsible=icon]:hidden'} data-status={(active === '/sign-in' || active.startsWith('/sign-in/')) ? 'active' : undefined} aria-current={(active === '/sign-in' || active.startsWith('/sign-in/')) ? 'page' : undefined}>
														<span>Sign In</span>
													</a>
												</li>
												<li data-slot="sidebar-menu-sub-item" data-sidebar="menu-sub-item" class="group/menu-sub-item relative">
													<a data-slot="sidebar-menu-sub-button" data-sidebar="menu-sub-button" data-size="md" data-active={active === '/sign-in-2' ? 'true' : 'false'} href="/sign-in-2" class={(active === '/sign-in-2' || active.startsWith('/sign-in-2/')) ? 'flex h-7 min-w-0 -translate-x-px items-center gap-2 overflow-hidden rounded-md px-2 text-sidebar-foreground ring-sidebar-ring outline-hidden hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-inherit data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground text-sm group-data-[collapsible=icon]:hidden active' : 'flex h-7 min-w-0 -translate-x-px items-center gap-2 overflow-hidden rounded-md px-2 text-sidebar-foreground ring-sidebar-ring outline-hidden hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-inherit data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground text-sm group-data-[collapsible=icon]:hidden'} data-status={(active === '/sign-in-2' || active.startsWith('/sign-in-2/')) ? 'active' : undefined} aria-current={(active === '/sign-in-2' || active.startsWith('/sign-in-2/')) ? 'page' : undefined}>
														<span>Sign In (2 Col)</span>
													</a>
												</li>
												<li data-slot="sidebar-menu-sub-item" data-sidebar="menu-sub-item" class="group/menu-sub-item relative">
													<a data-slot="sidebar-menu-sub-button" data-sidebar="menu-sub-button" data-size="md" data-active={active === '/sign-up' ? 'true' : 'false'} href="/sign-up" class={(active === '/sign-up' || active.startsWith('/sign-up/')) ? 'flex h-7 min-w-0 -translate-x-px items-center gap-2 overflow-hidden rounded-md px-2 text-sidebar-foreground ring-sidebar-ring outline-hidden hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-inherit data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground text-sm group-data-[collapsible=icon]:hidden active' : 'flex h-7 min-w-0 -translate-x-px items-center gap-2 overflow-hidden rounded-md px-2 text-sidebar-foreground ring-sidebar-ring outline-hidden hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-inherit data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground text-sm group-data-[collapsible=icon]:hidden'} data-status={(active === '/sign-up' || active.startsWith('/sign-up/')) ? 'active' : undefined} aria-current={(active === '/sign-up' || active.startsWith('/sign-up/')) ? 'page' : undefined}>
														<span>Sign Up</span>
													</a>
												</li>
												<li data-slot="sidebar-menu-sub-item" data-sidebar="menu-sub-item" class="group/menu-sub-item relative">
													<a data-slot="sidebar-menu-sub-button" data-sidebar="menu-sub-button" data-size="md" data-active={active === '/forgot-password' ? 'true' : 'false'} href="/forgot-password" class={(active === '/forgot-password' || active.startsWith('/forgot-password/')) ? 'flex h-7 min-w-0 -translate-x-px items-center gap-2 overflow-hidden rounded-md px-2 text-sidebar-foreground ring-sidebar-ring outline-hidden hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-inherit data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground text-sm group-data-[collapsible=icon]:hidden active' : 'flex h-7 min-w-0 -translate-x-px items-center gap-2 overflow-hidden rounded-md px-2 text-sidebar-foreground ring-sidebar-ring outline-hidden hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-inherit data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground text-sm group-data-[collapsible=icon]:hidden'} data-status={(active === '/forgot-password' || active.startsWith('/forgot-password/')) ? 'active' : undefined} aria-current={(active === '/forgot-password' || active.startsWith('/forgot-password/')) ? 'page' : undefined}>
														<span>Forgot Password</span>
													</a>
												</li>
												<li data-slot="sidebar-menu-sub-item" data-sidebar="menu-sub-item" class="group/menu-sub-item relative">
													<a data-slot="sidebar-menu-sub-button" data-sidebar="menu-sub-button" data-size="md" data-active={active === '/otp' ? 'true' : 'false'} href="/otp" class={(active === '/otp' || active.startsWith('/otp/')) ? 'flex h-7 min-w-0 -translate-x-px items-center gap-2 overflow-hidden rounded-md px-2 text-sidebar-foreground ring-sidebar-ring outline-hidden hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-inherit data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground text-sm group-data-[collapsible=icon]:hidden active' : 'flex h-7 min-w-0 -translate-x-px items-center gap-2 overflow-hidden rounded-md px-2 text-sidebar-foreground ring-sidebar-ring outline-hidden hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-inherit data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground text-sm group-data-[collapsible=icon]:hidden'} data-status={(active === '/otp' || active.startsWith('/otp/')) ? 'active' : undefined} aria-current={(active === '/otp' || active.startsWith('/otp/')) ? 'page' : undefined}>
														<span>OTP</span>
													</a>
												</li>
											</ul>
										</div>
									</li>
									<li data-slot="sidebar-menu-item" data-sidebar="menu-item" class="group/menu-item relative" hidden={prefs.open}>
										<DropdownMenuTrigger menu="nav-auth" data-sidebar="menu-button" data-size="default" data-active={active === '/sign-in' || active === '/sign-in-2' || active === '/sign-up' || active === '/forgot-password' || active === '/otp' ? 'true' : 'false'} class="peer/menu-button flex w-full items-center gap-2 overflow-hidden rounded-md p-2 text-start outline-hidden ring-sidebar-ring transition-[width,height,padding] focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 group-has-data-[sidebar=menu-action]/menu-item:pe-8 aria-disabled:pointer-events-none aria-disabled:opacity-50 data-[active=true]:bg-sidebar-accent data-[active=true]:font-medium data-[active=true]:text-sidebar-accent-foreground data-[state=open]:hover:bg-sidebar-accent data-[state=open]:hover:text-sidebar-accent-foreground group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:p-2! [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground h-8 text-sm">
											<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-shield-check" aria-hidden="true">
												<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
												<path d="m9 12 2 2 4-4" />
											</svg>
											<span>Auth</span>{' '}
											<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-chevron-right ms-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" aria-hidden="true">
												<path d="m9 18 6-6-6-6" />
											</svg>
									{' '}	</DropdownMenuTrigger>
									</li>
									<li data-slot="collapsible" data-sidebar="menu-item" class="group/menu-item relative group/collapsible" hidden={!prefs.open} data-state={errorsState}>
										<button data-slot="collapsible-trigger" data-sidebar="menu-button" data-size="default" data-active="false" class="peer/menu-button flex w-full items-center gap-2 overflow-hidden rounded-md p-2 text-start outline-hidden ring-sidebar-ring transition-[width,height,padding] focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 group-has-data-[sidebar=menu-action]/menu-item:pe-8 aria-disabled:pointer-events-none aria-disabled:opacity-50 data-[active=true]:bg-sidebar-accent data-[active=true]:font-medium data-[active=true]:text-sidebar-accent-foreground data-[state=open]:hover:bg-sidebar-accent data-[state=open]:hover:text-sidebar-accent-foreground group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:p-2! [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground h-8 text-sm" type="button" aria-controls="radix-_r_b_" aria-expanded={errorsExpanded} data-state={errorsState} onClick={() => {
											errorsToggled = true;
											if (!errorsOpen) errorsClosed = false;
											else setTimeout(() => {
												if (exitDone('radix-_r_b_')) errorsClosed = true;
											});
											errorsOpen = !errorsOpen;
										}}>
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
											<span>Errors</span>{' '}
											<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-chevron-right ms-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90 rtl:rotate-180" aria-hidden="true">
												<path d="m9 18 6-6-6-6" />
											</svg>
									{' '}	</button>
										<div data-state={errorsState} id="radix-_r_b_" hidden={errorsClosed} data-slot="collapsible-content" class="CollapsibleContent" style={errorsStyle} onAnimationend={() => {
											if (!errorsOpen) errorsClosed = true;
										}}>
											<ul data-slot="sidebar-menu-sub" data-sidebar="menu-sub" class="mx-3.5 flex min-w-0 translate-x-px flex-col gap-1 border-s border-sidebar-border px-2.5 py-0.5 group-data-[collapsible=icon]:hidden">
												<li data-slot="sidebar-menu-sub-item" data-sidebar="menu-sub-item" class="group/menu-sub-item relative">
													<a data-slot="sidebar-menu-sub-button" data-sidebar="menu-sub-button" data-size="md" data-active={active === '/errors/unauthorized' ? 'true' : 'false'} href="/errors/unauthorized" class={(active === '/errors/unauthorized' || active.startsWith('/errors/unauthorized/')) ? 'flex h-7 min-w-0 -translate-x-px items-center gap-2 overflow-hidden rounded-md px-2 text-sidebar-foreground ring-sidebar-ring outline-hidden hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-inherit data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground text-sm group-data-[collapsible=icon]:hidden active' : 'flex h-7 min-w-0 -translate-x-px items-center gap-2 overflow-hidden rounded-md px-2 text-sidebar-foreground ring-sidebar-ring outline-hidden hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-inherit data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground text-sm group-data-[collapsible=icon]:hidden'} data-status={(active === '/errors/unauthorized' || active.startsWith('/errors/unauthorized/')) ? 'active' : undefined} aria-current={(active === '/errors/unauthorized' || active.startsWith('/errors/unauthorized/')) ? 'page' : undefined}>
														<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-lock" aria-hidden="true">
															<rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
															<path d="M7 11V7a5 5 0 0 1 10 0v4" />
														</svg>
														<span>Unauthorized</span>
													</a>
												</li>
												<li data-slot="sidebar-menu-sub-item" data-sidebar="menu-sub-item" class="group/menu-sub-item relative">
													<a data-slot="sidebar-menu-sub-button" data-sidebar="menu-sub-button" data-size="md" data-active={active === '/errors/forbidden' ? 'true' : 'false'} href="/errors/forbidden" class={(active === '/errors/forbidden' || active.startsWith('/errors/forbidden/')) ? 'flex h-7 min-w-0 -translate-x-px items-center gap-2 overflow-hidden rounded-md px-2 text-sidebar-foreground ring-sidebar-ring outline-hidden hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-inherit data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground text-sm group-data-[collapsible=icon]:hidden active' : 'flex h-7 min-w-0 -translate-x-px items-center gap-2 overflow-hidden rounded-md px-2 text-sidebar-foreground ring-sidebar-ring outline-hidden hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-inherit data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground text-sm group-data-[collapsible=icon]:hidden'} data-status={(active === '/errors/forbidden' || active.startsWith('/errors/forbidden/')) ? 'active' : undefined} aria-current={(active === '/errors/forbidden' || active.startsWith('/errors/forbidden/')) ? 'page' : undefined}>
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
													<a data-slot="sidebar-menu-sub-button" data-sidebar="menu-sub-button" data-size="md" data-active={active === '/errors/not-found' ? 'true' : 'false'} href="/errors/not-found" class={(active === '/errors/not-found' || active.startsWith('/errors/not-found/')) ? 'flex h-7 min-w-0 -translate-x-px items-center gap-2 overflow-hidden rounded-md px-2 text-sidebar-foreground ring-sidebar-ring outline-hidden hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-inherit data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground text-sm group-data-[collapsible=icon]:hidden active' : 'flex h-7 min-w-0 -translate-x-px items-center gap-2 overflow-hidden rounded-md px-2 text-sidebar-foreground ring-sidebar-ring outline-hidden hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-inherit data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground text-sm group-data-[collapsible=icon]:hidden'} data-status={(active === '/errors/not-found' || active.startsWith('/errors/not-found/')) ? 'active' : undefined} aria-current={(active === '/errors/not-found' || active.startsWith('/errors/not-found/')) ? 'page' : undefined}>
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
													<a data-slot="sidebar-menu-sub-button" data-sidebar="menu-sub-button" data-size="md" data-active={active === '/errors/internal-server-error' ? 'true' : 'false'} href="/errors/internal-server-error" class={(active === '/errors/internal-server-error' || active.startsWith('/errors/internal-server-error/')) ? 'flex h-7 min-w-0 -translate-x-px items-center gap-2 overflow-hidden rounded-md px-2 text-sidebar-foreground ring-sidebar-ring outline-hidden hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-inherit data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground text-sm group-data-[collapsible=icon]:hidden active' : 'flex h-7 min-w-0 -translate-x-px items-center gap-2 overflow-hidden rounded-md px-2 text-sidebar-foreground ring-sidebar-ring outline-hidden hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-inherit data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground text-sm group-data-[collapsible=icon]:hidden'} data-status={(active === '/errors/internal-server-error' || active.startsWith('/errors/internal-server-error/')) ? 'active' : undefined} aria-current={(active === '/errors/internal-server-error' || active.startsWith('/errors/internal-server-error/')) ? 'page' : undefined}>
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
													<a data-slot="sidebar-menu-sub-button" data-sidebar="menu-sub-button" data-size="md" data-active={active === '/errors/maintenance-error' ? 'true' : 'false'} href="/errors/maintenance-error" class={(active === '/errors/maintenance-error' || active.startsWith('/errors/maintenance-error/')) ? 'flex h-7 min-w-0 -translate-x-px items-center gap-2 overflow-hidden rounded-md px-2 text-sidebar-foreground ring-sidebar-ring outline-hidden hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-inherit data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground text-sm group-data-[collapsible=icon]:hidden active' : 'flex h-7 min-w-0 -translate-x-px items-center gap-2 overflow-hidden rounded-md px-2 text-sidebar-foreground ring-sidebar-ring outline-hidden hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-inherit data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground text-sm group-data-[collapsible=icon]:hidden'} data-status={(active === '/errors/maintenance-error' || active.startsWith('/errors/maintenance-error/')) ? 'active' : undefined} aria-current={(active === '/errors/maintenance-error' || active.startsWith('/errors/maintenance-error/')) ? 'page' : undefined}>
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
									<li data-slot="sidebar-menu-item" data-sidebar="menu-item" class="group/menu-item relative" hidden={prefs.open}>
										<DropdownMenuTrigger menu="nav-errors" data-sidebar="menu-button" data-size="default" data-active={active === '/errors/unauthorized' || active === '/errors/forbidden' || active === '/errors/not-found' || active === '/errors/internal-server-error' || active === '/errors/maintenance-error' ? 'true' : 'false'} class="peer/menu-button flex w-full items-center gap-2 overflow-hidden rounded-md p-2 text-start outline-hidden ring-sidebar-ring transition-[width,height,padding] focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 group-has-data-[sidebar=menu-action]/menu-item:pe-8 aria-disabled:pointer-events-none aria-disabled:opacity-50 data-[active=true]:bg-sidebar-accent data-[active=true]:font-medium data-[active=true]:text-sidebar-accent-foreground data-[state=open]:hover:bg-sidebar-accent data-[state=open]:hover:text-sidebar-accent-foreground group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:p-2! [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground h-8 text-sm">
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
											<span>Errors</span>{' '}
											<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-chevron-right ms-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" aria-hidden="true">
												<path d="m9 18 6-6-6-6" />
											</svg>
									{' '}	</DropdownMenuTrigger>
									</li>
								</ul>
							</div>
							<div data-slot="sidebar-group" data-sidebar="group" class="relative flex w-full min-w-0 flex-col p-2">
								<div data-slot="sidebar-group-label" data-sidebar="group-label" class="flex h-8 shrink-0 items-center rounded-md px-2 text-xs font-medium text-sidebar-foreground/70 ring-sidebar-ring outline-hidden transition-[margin,opacity] duration-200 ease-linear focus-visible:ring-2 [&>svg]:size-4 [&>svg]:shrink-0 group-data-[collapsible=icon]:-mt-8 group-data-[collapsible=icon]:opacity-0">Other</div>
								<ul data-slot="sidebar-menu" data-sidebar="menu" class="flex w-full min-w-0 flex-col gap-1">
									<li data-slot="collapsible" data-sidebar="menu-item" class="group/menu-item relative group/collapsible" hidden={!prefs.open} data-state={settingsState}>
										<button data-slot="collapsible-trigger" data-sidebar="menu-button" data-size="default" data-active="false" class="peer/menu-button flex w-full items-center gap-2 overflow-hidden rounded-md p-2 text-start outline-hidden ring-sidebar-ring transition-[width,height,padding] focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 group-has-data-[sidebar=menu-action]/menu-item:pe-8 aria-disabled:pointer-events-none aria-disabled:opacity-50 data-[active=true]:bg-sidebar-accent data-[active=true]:font-medium data-[active=true]:text-sidebar-accent-foreground data-[state=open]:hover:bg-sidebar-accent data-[state=open]:hover:text-sidebar-accent-foreground group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:p-2! [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground h-8 text-sm" type="button" aria-controls="radix-_r_d_" aria-expanded={settingsExpanded} data-state={settingsState} onClick={() => {
											settingsToggled = true;
											if (!settingsOpen) settingsClosed = false;
											else setTimeout(() => {
												if (exitDone('radix-_r_d_')) settingsClosed = true;
											});
											settingsOpen = !settingsOpen;
										}}>
											<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-settings" aria-hidden="true">
												<path d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915" />
												<circle cx="12" cy="12" r="3" />
											</svg>
											<span>Settings</span>{' '}
											<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-chevron-right ms-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90 rtl:rotate-180" aria-hidden="true">
												<path d="m9 18 6-6-6-6" />
											</svg>
									{' '}	</button>
										<div data-state={settingsState} id="radix-_r_d_" hidden={settingsClosed} data-slot="collapsible-content" class="CollapsibleContent" style={settingsStyle} onAnimationend={() => {
											if (!settingsOpen) settingsClosed = true;
										}}>
											<ul data-slot="sidebar-menu-sub" data-sidebar="menu-sub" class="mx-3.5 flex min-w-0 translate-x-px flex-col gap-1 border-s border-sidebar-border px-2.5 py-0.5 group-data-[collapsible=icon]:hidden">
												<li data-slot="sidebar-menu-sub-item" data-sidebar="menu-sub-item" class="group/menu-sub-item relative">
													<a data-slot="sidebar-menu-sub-button" data-sidebar="menu-sub-button" data-size="md" data-active={active === '/settings' ? 'true' : 'false'} href="/settings" class={(active === '/settings' || active.startsWith('/settings/')) ? 'flex h-7 min-w-0 -translate-x-px items-center gap-2 overflow-hidden rounded-md px-2 text-sidebar-foreground ring-sidebar-ring outline-hidden hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-inherit data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground text-sm group-data-[collapsible=icon]:hidden active' : 'flex h-7 min-w-0 -translate-x-px items-center gap-2 overflow-hidden rounded-md px-2 text-sidebar-foreground ring-sidebar-ring outline-hidden hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-inherit data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground text-sm group-data-[collapsible=icon]:hidden'} data-status={(active === '/settings' || active.startsWith('/settings/')) ? 'active' : undefined} aria-current={(active === '/settings' || active.startsWith('/settings/')) ? 'page' : undefined}>
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
													<a data-slot="sidebar-menu-sub-button" data-sidebar="menu-sub-button" data-size="md" data-active={active === '/settings/account' ? 'true' : 'false'} href="/settings/account" class={(active === '/settings/account' || active.startsWith('/settings/account/')) ? 'flex h-7 min-w-0 -translate-x-px items-center gap-2 overflow-hidden rounded-md px-2 text-sidebar-foreground ring-sidebar-ring outline-hidden hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-inherit data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground text-sm group-data-[collapsible=icon]:hidden active' : 'flex h-7 min-w-0 -translate-x-px items-center gap-2 overflow-hidden rounded-md px-2 text-sidebar-foreground ring-sidebar-ring outline-hidden hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-inherit data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground text-sm group-data-[collapsible=icon]:hidden'} data-status={(active === '/settings/account' || active.startsWith('/settings/account/')) ? 'active' : undefined} aria-current={(active === '/settings/account' || active.startsWith('/settings/account/')) ? 'page' : undefined}>
														<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-wrench" aria-hidden="true">
															<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.106-3.105c.32-.322.863-.22.983.218a6 6 0 0 1-8.259 7.057l-7.91 7.91a1 1 0 0 1-2.999-3l7.91-7.91a6 6 0 0 1 7.057-8.259c.438.12.54.662.219.984z" />
														</svg>
														<span>Account</span>
													</a>
												</li>
												<li data-slot="sidebar-menu-sub-item" data-sidebar="menu-sub-item" class="group/menu-sub-item relative">
													<a data-slot="sidebar-menu-sub-button" data-sidebar="menu-sub-button" data-size="md" data-active={active === '/settings/appearance' ? 'true' : 'false'} href="/settings/appearance" class={(active === '/settings/appearance' || active.startsWith('/settings/appearance/')) ? 'flex h-7 min-w-0 -translate-x-px items-center gap-2 overflow-hidden rounded-md px-2 text-sidebar-foreground ring-sidebar-ring outline-hidden hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-inherit data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground text-sm group-data-[collapsible=icon]:hidden active' : 'flex h-7 min-w-0 -translate-x-px items-center gap-2 overflow-hidden rounded-md px-2 text-sidebar-foreground ring-sidebar-ring outline-hidden hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-inherit data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground text-sm group-data-[collapsible=icon]:hidden'} data-status={(active === '/settings/appearance' || active.startsWith('/settings/appearance/')) ? 'active' : undefined} aria-current={(active === '/settings/appearance' || active.startsWith('/settings/appearance/')) ? 'page' : undefined}>
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
													<a data-slot="sidebar-menu-sub-button" data-sidebar="menu-sub-button" data-size="md" data-active={active === '/settings/notifications' ? 'true' : 'false'} href="/settings/notifications" class={(active === '/settings/notifications' || active.startsWith('/settings/notifications/')) ? 'flex h-7 min-w-0 -translate-x-px items-center gap-2 overflow-hidden rounded-md px-2 text-sidebar-foreground ring-sidebar-ring outline-hidden hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-inherit data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground text-sm group-data-[collapsible=icon]:hidden active' : 'flex h-7 min-w-0 -translate-x-px items-center gap-2 overflow-hidden rounded-md px-2 text-sidebar-foreground ring-sidebar-ring outline-hidden hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-inherit data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground text-sm group-data-[collapsible=icon]:hidden'} data-status={(active === '/settings/notifications' || active.startsWith('/settings/notifications/')) ? 'active' : undefined} aria-current={(active === '/settings/notifications' || active.startsWith('/settings/notifications/')) ? 'page' : undefined}>
														<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-bell" aria-hidden="true">
															<path d="M10.268 21a2 2 0 0 0 3.464 0" />
															<path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326" />
														</svg>
														<span>Notifications</span>
													</a>
												</li>
												<li data-slot="sidebar-menu-sub-item" data-sidebar="menu-sub-item" class="group/menu-sub-item relative">
													<a data-slot="sidebar-menu-sub-button" data-sidebar="menu-sub-button" data-size="md" data-active={active === '/settings/display' ? 'true' : 'false'} href="/settings/display" class={(active === '/settings/display' || active.startsWith('/settings/display/')) ? 'flex h-7 min-w-0 -translate-x-px items-center gap-2 overflow-hidden rounded-md px-2 text-sidebar-foreground ring-sidebar-ring outline-hidden hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-inherit data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground text-sm group-data-[collapsible=icon]:hidden active' : 'flex h-7 min-w-0 -translate-x-px items-center gap-2 overflow-hidden rounded-md px-2 text-sidebar-foreground ring-sidebar-ring outline-hidden hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-inherit data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground text-sm group-data-[collapsible=icon]:hidden'} data-status={(active === '/settings/display' || active.startsWith('/settings/display/')) ? 'active' : undefined} aria-current={(active === '/settings/display' || active.startsWith('/settings/display/')) ? 'page' : undefined}>
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
									<li data-slot="sidebar-menu-item" data-sidebar="menu-item" class="group/menu-item relative" hidden={prefs.open}>
										<DropdownMenuTrigger menu="nav-settings" data-sidebar="menu-button" data-size="default" data-active={active === '/settings' || active === '/settings/account' || active === '/settings/appearance' || active === '/settings/notifications' || active === '/settings/display' ? 'true' : 'false'} class="peer/menu-button flex w-full items-center gap-2 overflow-hidden rounded-md p-2 text-start outline-hidden ring-sidebar-ring transition-[width,height,padding] focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 group-has-data-[sidebar=menu-action]/menu-item:pe-8 aria-disabled:pointer-events-none aria-disabled:opacity-50 data-[active=true]:bg-sidebar-accent data-[active=true]:font-medium data-[active=true]:text-sidebar-accent-foreground data-[state=open]:hover:bg-sidebar-accent data-[state=open]:hover:text-sidebar-accent-foreground group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:p-2! [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground h-8 text-sm">
											<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-settings" aria-hidden="true">
												<path d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915" />
												<circle cx="12" cy="12" r="3" />
											</svg>
											<span>Settings</span>{' '}
											<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-chevron-right ms-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" aria-hidden="true">
												<path d="m9 18 6-6-6-6" />
											</svg>
									{' '}	</DropdownMenuTrigger>
									</li>
									<li data-slot="sidebar-menu-item" data-sidebar="menu-item" class="group/menu-item relative">
										<a data-slot="sidebar-menu-button" data-sidebar="menu-button" data-size="default" data-active={active === '/help-center' ? 'true' : 'false'} data-state="closed" href="/help-center" class={(active === '/help-center' || active.startsWith('/help-center/')) ? 'peer/menu-button flex w-full items-center gap-2 overflow-hidden rounded-md p-2 text-start outline-hidden ring-sidebar-ring transition-[width,height,padding] focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 group-has-data-[sidebar=menu-action]/menu-item:pe-8 aria-disabled:pointer-events-none aria-disabled:opacity-50 data-[active=true]:bg-sidebar-accent data-[active=true]:font-medium data-[active=true]:text-sidebar-accent-foreground data-[state=open]:hover:bg-sidebar-accent data-[state=open]:hover:text-sidebar-accent-foreground group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:p-2! [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground h-8 text-sm active' : 'peer/menu-button flex w-full items-center gap-2 overflow-hidden rounded-md p-2 text-start outline-hidden ring-sidebar-ring transition-[width,height,padding] focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 group-has-data-[sidebar=menu-action]/menu-item:pe-8 aria-disabled:pointer-events-none aria-disabled:opacity-50 data-[active=true]:bg-sidebar-accent data-[active=true]:font-medium data-[active=true]:text-sidebar-accent-foreground data-[state=open]:hover:bg-sidebar-accent data-[state=open]:hover:text-sidebar-accent-foreground group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:p-2! [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground h-8 text-sm'} data-status={(active === '/help-center' || active.startsWith('/help-center/')) ? 'active' : undefined} aria-current={(active === '/help-center' || active.startsWith('/help-center/')) ? 'page' : undefined}>
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
										<span data-slot="avatar" data-avatar-src="/avatars/shadcn.jpg" data-avatar-alt="satnaing" class="relative flex size-8 shrink-0 overflow-hidden h-8 w-8 rounded-lg">
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
				<DialogRoot open={drawerOpen} onOpenChange={(next: boolean) => { drawerOpen = next; if (next) drawerSeen = true; }}>
					@if (isTopNav) {
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
								<DialogTrigger data-slot="sheet-trigger" class="inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50 size-9 rounded-full" aria-label="Open theme settings">
									<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-settings" aria-hidden="true">
										<path d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915" />
										<circle cx="12" cy="12" r="3" />
									</svg>
								</DialogTrigger>
								<DropdownMenuTrigger menu="profile" class="inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50 px-4 py-2 has-[>svg]:px-3 relative h-8 w-8 rounded-full">
									<span data-slot="avatar" data-avatar-src="/avatars/01.png" data-avatar-alt="@shadcn" class="relative flex size-8 shrink-0 overflow-hidden rounded-full h-8 w-8">
										<span data-slot="avatar-fallback" class="flex size-full items-center justify-center rounded-full bg-muted">SN</span>
									</span>
								</DropdownMenuTrigger>
							</div>
						</header>
					}
					@if (isSearchBorder) {
						<header class="z-50 h-16 header-fixed peer/header sticky top-0 w-[inherit] shadow-none border-b">
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
								<DialogTrigger data-slot="sheet-trigger" class="inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50 size-9 rounded-full" aria-label="Open theme settings">
									<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-settings" aria-hidden="true">
										<path d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915" />
										<circle cx="12" cy="12" r="3" />
									</svg>
								</DialogTrigger>
								<DropdownMenuTrigger menu="profile" class="inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50 px-4 py-2 has-[>svg]:px-3 relative h-8 w-8 rounded-full">
									<span data-slot="avatar" data-avatar-src="/avatars/01.png" data-avatar-alt="@shadcn" class="relative flex size-8 shrink-0 overflow-hidden rounded-full h-8 w-8">
										<span data-slot="avatar-fallback" class="flex size-full items-center justify-center rounded-full bg-muted">SN</span>
									</span>
								</DropdownMenuTrigger>
							</div>
						</header>
					}
					@if (isSearchFixed) {
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
								<DialogTrigger data-slot="sheet-trigger" class="inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50 size-9 rounded-full" aria-label="Open theme settings">
									<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-settings" aria-hidden="true">
										<path d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915" />
										<circle cx="12" cy="12" r="3" />
									</svg>
								</DialogTrigger>
								<DropdownMenuTrigger menu="profile" class="inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50 px-4 py-2 has-[>svg]:px-3 relative h-8 w-8 rounded-full">
									<span data-slot="avatar" data-avatar-src="/avatars/01.png" data-avatar-alt="@shadcn" class="relative flex size-8 shrink-0 overflow-hidden rounded-full h-8 w-8">
										<span data-slot="avatar-fallback" class="flex size-full items-center justify-center rounded-full bg-muted">SN</span>
									</span>
								</DropdownMenuTrigger>
							</div>
						</header>
					}
					@if (isSearch) {
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
								<DialogTrigger data-slot="sheet-trigger" class="inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50 size-9 rounded-full" aria-label="Open theme settings">
									<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-settings" aria-hidden="true">
										<path d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915" />
										<circle cx="12" cy="12" r="3" />
									</svg>
								</DialogTrigger>
								<DropdownMenuTrigger menu="profile" class="inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50 px-4 py-2 has-[>svg]:px-3 relative h-8 w-8 rounded-full">
									<span data-slot="avatar" data-avatar-src="/avatars/01.png" data-avatar-alt="@shadcn" class="relative flex size-8 shrink-0 overflow-hidden rounded-full h-8 w-8">
										<span data-slot="avatar-fallback" class="flex size-full items-center justify-center rounded-full bg-muted">SN</span>
									</span>
								</DropdownMenuTrigger>
							</div>
						</header>
					}
					@if (isClerk) {
						<div class="bg-backgroundh-16 flex justify-between p-4">
							<button data-slot="sidebar-trigger" onClick={toggleSidebar} class="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50 size-7 scale-125 sm:scale-100" data-sidebar="trigger">
								<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-panel-left" aria-hidden="true">
									<rect width="18" height="18" x="3" y="3" rx="2" />
									<path d="M9 3v18" />
								</svg>
								<span class="sr-only">Toggle Sidebar</span>
							</button>
							<div class="space-x-4">
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
								<DialogTrigger data-slot="sheet-trigger" class="inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50 size-9 rounded-full" aria-label="Open theme settings">
									<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-settings" aria-hidden="true">
										<path d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915" />
										<circle cx="12" cy="12" r="3" />
									</svg>
								</DialogTrigger>
							</div>
						</div>
					}
				<DialogPortal data-slot="sheet-portal">
					<DialogOverlay data-slot="sheet-overlay" class="fixed inset-0 z-50 bg-black/50 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0"></DialogOverlay>
					<DialogContent data-slot="sheet-content" class="fixed z-50 gap-4 bg-background shadow-lg transition ease-in-out data-[state=closed]:animate-out data-[state=closed]:duration-300 data-[state=open]:animate-in data-[state=open]:duration-500 inset-y-0 inset-e-0 h-full w-3/4 border-s data-[state=closed]:slide-out-to-end data-[state=open]:slide-in-from-end sm:max-w-sm flex flex-col">
						<div data-slot="sheet-header" class="flex flex-col gap-1.5 p-4 pb-0 text-start">
							<DialogTitle data-slot="sheet-title" class="font-semibold text-foreground">Theme Settings</DialogTitle>
							<DialogDescription data-slot="sheet-description" class="text-sm text-muted-foreground">Adjust the appearance and layout to suit your preferences.</DialogDescription>
						</div>
						<div class="space-y-6 overflow-y-auto px-4">
							<div>
								<div class="mb-2 flex items-center gap-2 text-sm font-semibold text-muted-foreground">
									Theme
									<button data-slot="button" class="inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive bg-secondary text-secondary-foreground shadow-xs hover:bg-secondary/80 size-4 rounded-full" type="button" aria-label="Reset theme preference to default" hidden={themeDefault} onClick={(event) => {
										prefs.theme = 'system';
										applyTheme('system');
										focusDialogOf(event);
									}}><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-rotate-ccw size-3" aria-hidden="true"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /></svg></button>
								</div>
								<div role="radiogroup" aria-required="false" dir={prefs.dir} onFocus={focusGroup} onFocusin={radioFocused} onKeydown={radioKey} class="grid w-full max-w-md grid-cols-3 gap-4" aria-label="Select theme preference" aria-describedby="theme-description" tabindex="0" style={drawerOutline}>
									<button type="button" role="radio" aria-checked={themeSystem} data-state={themeSystemState} value="system" class="group outline-none transition duration-200 ease-in" aria-label="Select system" aria-describedby="system-description" tabindex="-1" data-radix-collection-item="" onClick={() => {
										// Radix RadioGroup calls onValueChange only when the value changes.
										if (prefs.theme !== 'system') {
											prefs.theme = 'system';
											applyTheme('system');
										}
									}}>
										<div class="relative rounded-[6px] ring-[1px] ring-border group-data-[state=checked]:shadow-2xl group-data-[state=checked]:ring-primary group-focus-visible:ring-2" role="img" aria-hidden="false" aria-label="System option preview">
											<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-circle-check size-6 fill-primary stroke-white group-data-[state=unchecked]:hidden absolute top-0 right-0 translate-x-1/2 -translate-y-1/2" aria-hidden="true">
												<circle cx="12" cy="12" r="10" />
												<path d="m9 12 2 2 4-4" />
											</svg>
											<svg data-name="icon-theme-system" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 79.86 51.14" class="overflow-hidden rounded-[6px] fill-primary stroke-primary group-data-[state=unchecked]:fill-muted-foreground group-data-[state=unchecked]:stroke-muted-foreground" aria-hidden="true">
												<path opacity="0.2" d="M0 0.03H22.88V51.17H0z" />
												<circle cx="6.7" cy="7.04" r="3.54" fill="#fff" opacity="0.8" stroke="#fff" stroke-linecap="round" stroke-miterlimit="10" />
												<path d="M18.12 6.39h-5.87c-.6 0-1.09-.45-1.09-1s.49-1 1.09-1h5.87c.6 0 1.09.45 1.09 1s-.49 1-1.09 1zM16.55 9.77h-4.24c-.55 0-1-.45-1-1s.45-1 1-1h4.24c.55 0 1 .45 1 1s-.45 1-1 1z" fill="#fff" stroke="none" opacity="0.75" />
												<path d="M18.32 17.37H4.59c-.69 0-1.25-.47-1.25-1.05s.56-1.05 1.25-1.05h13.73c.69 0 1.25.47 1.25 1.05s-.56 1.05-1.25 1.05z" fill="#fff" stroke="none" opacity="0.72" />
												<path d="M15.34 21.26h-11c-.55 0-1-.41-1-.91s.45-.91 1-.91h11c.55 0 1 .41 1 .91s-.45.91-1 .91z" fill="#fff" stroke="none" opacity="0.55" />
												<path d="M16.46 25.57H4.43c-.6 0-1.09-.44-1.09-.98s.49-.98 1.09-.98h12.03c.6 0 1.09.44 1.09.98s-.49.98-1.09.98z" fill="#fff" stroke="none" opacity="0.67" />
												<rect x="33.36" y="19.73" width="2.75" height="3.42" rx="0.33" ry="0.33" opacity="0.31" stroke="none" />
												<rect x="29.64" y="16.57" width="2.75" height="6.58" rx="0.33" ry="0.33" opacity="0.4" stroke="none" />
												<rect x="37.16" y="14.44" width="2.75" height="8.7" rx="0.33" ry="0.33" opacity="0.26" stroke="none" />
												<rect x="41.19" y="10.75" width="2.75" height="12.4" rx="0.33" ry="0.33" opacity="0.37" stroke="none" />
												<g>
													<circle cx="62.74" cy="16.32" r="8" opacity="0.25" />
													<path d="M62.74 16.32l4.1-6.87c1.19.71 2.18 1.72 2.86 2.92s1.04 2.57 1.04 3.95h-8z" opacity="0.45" />
												</g>
												<rect x="29.64" y="27.75" width="41.62" height="18.62" rx="1.69" ry="1.69" opacity="0.3" stroke="none" stroke-linecap="round" stroke-miterlimit="10" />
											</svg>
										</div>
										<div class="mt-1 text-xs" id="system-description" aria-live="polite">System</div>
									</button>
									<button type="button" role="radio" aria-checked={themeLight} data-state={themeLightState} value="light" class="group outline-none transition duration-200 ease-in" aria-label="Select light" aria-describedby="light-description" tabindex="-1" data-radix-collection-item="" onClick={() => {
										if (prefs.theme !== 'light') {
											prefs.theme = 'light';
											applyTheme('light');
										}
									}}>
										<div class="relative rounded-[6px] ring-[1px] ring-border group-data-[state=checked]:shadow-2xl group-data-[state=checked]:ring-primary group-focus-visible:ring-2" role="img" aria-hidden="false" aria-label="Light option preview">
											<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-circle-check size-6 fill-primary stroke-white group-data-[state=unchecked]:hidden absolute top-0 right-0 translate-x-1/2 -translate-y-1/2" aria-hidden="true">
												<circle cx="12" cy="12" r="10" />
												<path d="m9 12 2 2 4-4" />
											</svg>
											<svg data-name="icon-theme-light" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 79.86 51.14" class="" aria-hidden="true">
												<g fill="#d9d9d9">
													<rect x="0.53" y="0.5" width="78.83" height="50.14" rx="3.5" ry="3.5" />
													<path d="M75.86 1c1.65 0 3 1.35 3 3v43.14c0 1.65-1.35 3-3 3H4.03c-1.65 0-3-1.35-3-3V4c0-1.65 1.35-3 3-3h71.83m0-1H4.03c-2.21 0-4 1.79-4 4v43.14c0 2.21 1.79 4 4 4h71.83c2.21 0 4-1.79 4-4V4c0-2.21-1.79-4-4-4z" />
												</g>
												<path d="M22.88 0h52.97c2.21 0 4 1.79 4 4v43.14c0 2.21-1.79 4-4 4H22.88V0z" fill="#ecedef" />
												<circle cx="6.7" cy="7.04" r="3.54" fill="#fff" />
												<path d="M18.12 6.39h-5.87c-.6 0-1.09-.45-1.09-1s.49-1 1.09-1h5.87c.6 0 1.09.45 1.09 1s-.49 1-1.09 1zM16.55 9.77h-4.24c-.55 0-1-.45-1-1s.45-1 1-1h4.24c.55 0 1 .45 1 1s-.45 1-1 1zM18.32 17.37H4.59c-.69 0-1.25-.47-1.25-1.05s.56-1.05 1.25-1.05h13.73c.69 0 1.25.47 1.25 1.05s-.56 1.05-1.25 1.05zM15.34 21.26h-11c-.55 0-1-.41-1-.91s.45-.91 1-.91h11c.55 0 1 .41 1 .91s-.45.91-1 .91zM16.46 25.57H4.43c-.6 0-1.09-.44-1.09-.98s.49-.98 1.09-.98h12.03c.6 0 1.09.44 1.09.98s-.49.98-1.09.98z" fill="#fff" />
												<g fill="#c0c4c4">
													<rect x="33.36" y="19.73" width="2.75" height="3.42" rx="0.33" ry="0.33" opacity="0.32" />
													<rect x="29.64" y="16.57" width="2.75" height="6.58" rx="0.33" ry="0.33" opacity="0.44" />
													<rect x="37.16" y="14.44" width="2.75" height="8.7" rx="0.33" ry="0.33" opacity="0.53" />
													<rect x="41.19" y="10.75" width="2.75" height="12.4" rx="0.33" ry="0.33" opacity="0.53" />
												</g>
												<circle cx="62.74" cy="16.32" r="8" fill="#fff" />
												<g fill="#d9d9d9">
													<path d="M63.62 15.82L67 10.15c.93.64 1.7 1.48 2.26 2.47.56.98.89 2.08.96 3.21h-6.6z" />
													<path d="M67.14 10.88a6.977 6.977 0 012.52 4.44h-5.17l2.65-4.44m-.31-1.43l-4.1 6.87h8c0-1.39-.36-2.75-1.04-3.95s-1.67-2.21-2.86-2.92z" />
												</g>
												<rect x="29.64" y="27.75" width="41.62" height="18.62" rx="1.69" ry="1.69" fill="#fff" />
											</svg>
										</div>
										<div class="mt-1 text-xs" id="light-description" aria-live="polite">Light</div>
									</button>
									<button type="button" role="radio" aria-checked={themeDark} data-state={themeDarkState} value="dark" class="group outline-none transition duration-200 ease-in" aria-label="Select dark" aria-describedby="dark-description" tabindex="-1" data-radix-collection-item="" onClick={() => {
										if (prefs.theme !== 'dark') {
											prefs.theme = 'dark';
											applyTheme('dark');
										}
									}}>
										<div class="relative rounded-[6px] ring-[1px] ring-border group-data-[state=checked]:shadow-2xl group-data-[state=checked]:ring-primary group-focus-visible:ring-2" role="img" aria-hidden="false" aria-label="Dark option preview">
											<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-circle-check size-6 fill-primary stroke-white group-data-[state=unchecked]:hidden absolute top-0 right-0 translate-x-1/2 -translate-y-1/2" aria-hidden="true">
												<circle cx="12" cy="12" r="10" />
												<path d="m9 12 2 2 4-4" />
											</svg>
											<svg data-name="icon-theme-dark" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 79.86 51.14" class="" aria-hidden="true">
												<g fill="#1d2b3f">
													<rect x="0.53" y="0.5" width="78.83" height="50.14" rx="3.5" ry="3.5" />
													<path d="M75.86 1c1.65 0 3 1.35 3 3v43.14c0 1.65-1.35 3-3 3H4.03c-1.65 0-3-1.35-3-3V4c0-1.65 1.35-3 3-3h71.83m0-1H4.03c-2.21 0-4 1.79-4 4v43.14c0 2.21 1.79 4 4 4h71.83c2.21 0 4-1.79 4-4V4c0-2.21-1.79-4-4-4z" />
												</g>
												<path d="M22.88 0h52.97c2.21 0 4 1.79 4 4v43.14c0 2.21-1.79 4-4 4H22.88V0z" fill="#0d1628" />
												<circle cx="6.7" cy="7.04" r="3.54" fill="#426187" />
												<path d="M18.12 6.39h-5.87c-.6 0-1.09-.45-1.09-1s.49-1 1.09-1h5.87c.6 0 1.09.45 1.09 1s-.49 1-1.09 1zM16.55 9.77h-4.24c-.55 0-1-.45-1-1s.45-1 1-1h4.24c.55 0 1 .45 1 1s-.45 1-1 1zM18.32 17.37H4.59c-.69 0-1.25-.47-1.25-1.05s.56-1.05 1.25-1.05h13.73c.69 0 1.25.47 1.25 1.05s-.56 1.05-1.25 1.05zM15.34 21.26h-11c-.55 0-1-.41-1-.91s.45-.91 1-.91h11c.55 0 1 .41 1 .91s-.45.91-1 .91zM16.46 25.57H4.43c-.6 0-1.09-.44-1.09-.98s.49-.98 1.09-.98h12.03c.6 0 1.09.44 1.09.98s-.49.98-1.09.98z" fill="#426187" />
												<g fill="#2a62bc">
													<rect x="33.36" y="19.73" width="2.75" height="3.42" rx="0.33" ry="0.33" opacity="0.32" />
													<rect x="29.64" y="16.57" width="2.75" height="6.58" rx="0.33" ry="0.33" opacity="0.44" />
													<rect x="37.16" y="14.44" width="2.75" height="8.7" rx="0.33" ry="0.33" opacity="0.53" />
													<rect x="41.19" y="10.75" width="2.75" height="12.4" rx="0.33" ry="0.33" opacity="0.53" />
												</g>
												<circle cx="62.74" cy="16.32" r="8" fill="#2f5491" opacity="0.5" />
												<path d="M62.74 16.32l4.1-6.87c1.19.71 2.18 1.72 2.86 2.92s1.04 2.57 1.04 3.95h-8z" fill="#2f5491" opacity="0.74" />
												<rect x="29.64" y="27.75" width="41.62" height="18.62" rx="1.69" ry="1.69" fill="#17273f" />
											</svg>
										</div>
										<div class="mt-1 text-xs" id="dark-description" aria-live="polite">Dark</div>
									</button>
								</div>
								<div id="theme-description" class="sr-only">Choose between system preference, light mode, or dark mode</div>
							</div>
							<div class="max-md:hidden">
								<div class="mb-2 flex items-center gap-2 text-sm font-semibold text-muted-foreground">
									Sidebar
									<button data-slot="button" class="inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive bg-secondary text-secondary-foreground shadow-xs hover:bg-secondary/80 size-4 rounded-full" type="button" aria-label="Reset sidebar style to default" hidden={variantDefault} onClick={(event) => {
										prefs.variant = 'inset';
										rememberVariant('inset');
										focusDialogOf(event);
									}}><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-rotate-ccw size-3" aria-hidden="true"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /></svg></button>
								</div>
								<div role="radiogroup" aria-required="false" dir={prefs.dir} onFocus={focusGroup} onFocusin={radioFocused} onKeydown={radioKey} class="grid w-full max-w-md grid-cols-3 gap-4" aria-label="Select sidebar style" aria-describedby="sidebar-description" tabindex="0" style={drawerOutline}>
									<button type="button" role="radio" aria-checked={variantInset} data-state={variantInsetState} value="inset" class="group outline-none transition duration-200 ease-in" aria-label="Select inset" aria-describedby="inset-description" tabindex="-1" data-radix-collection-item="" onClick={() => {
										if (prefs.variant !== 'inset') {
											prefs.variant = 'inset';
											rememberVariant('inset');
										}
									}}>
										<div class="relative rounded-[6px] ring-[1px] ring-border group-data-[state=checked]:shadow-2xl group-data-[state=checked]:ring-primary group-focus-visible:ring-2" role="img" aria-hidden="false" aria-label="Inset option preview">
											<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-circle-check size-6 fill-primary stroke-white group-data-[state=unchecked]:hidden absolute top-0 right-0 translate-x-1/2 -translate-y-1/2" aria-hidden="true">
												<circle cx="12" cy="12" r="10" />
												<path d="m9 12 2 2 4-4" />
											</svg>
											<svg data-name="icon-sidebar-inset" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 79.86 51.14" class="fill-primary stroke-primary group-data-[state=unchecked]:fill-muted-foreground group-data-[state=unchecked]:stroke-muted-foreground" aria-hidden="true">
												<rect x="23.39" y="5.57" width="50.22" height="40" rx="2" ry="2" opacity="0.2" stroke-linecap="round" stroke-miterlimit="10" />
												<path fill="none" opacity="0.72" stroke-linecap="round" stroke-miterlimit="10" stroke-width="2px" d="M5.08 17.05L17.31 17.05" />
												<path fill="none" opacity="0.48" stroke-linecap="round" stroke-miterlimit="10" stroke-width="2px" d="M5.08 24.25L15.6 24.25" />
												<path fill="none" opacity="0.55" stroke-linecap="round" stroke-miterlimit="10" stroke-width="2px" d="M5.08 20.54L14.46 20.54" />
												<g stroke-linecap="round" stroke-miterlimit="10">
													<circle cx="7.04" cy="9.57" r="2.54" opacity="0.8" />
													<path fill="none" opacity="0.8" stroke-width="2px" d="M11.59 8.3L17.31 8.3" />
													<path fill="none" opacity="0.6" d="M11.38 10.95L16.44 10.95" />
												</g>
											</svg>
										</div>
										<div class="mt-1 text-xs" id="inset-description" aria-live="polite">Inset</div>
									</button>
									<button type="button" role="radio" aria-checked={variantFloating} data-state={variantFloatingState} value="floating" class="group outline-none transition duration-200 ease-in" aria-label="Select floating" aria-describedby="floating-description" tabindex="-1" data-radix-collection-item="" onClick={() => {
										if (prefs.variant !== 'floating') {
											prefs.variant = 'floating';
											rememberVariant('floating');
										}
									}}>
										<div class="relative rounded-[6px] ring-[1px] ring-border group-data-[state=checked]:shadow-2xl group-data-[state=checked]:ring-primary group-focus-visible:ring-2" role="img" aria-hidden="false" aria-label="Floating option preview">
											<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-circle-check size-6 fill-primary stroke-white group-data-[state=unchecked]:hidden absolute top-0 right-0 translate-x-1/2 -translate-y-1/2" aria-hidden="true">
												<circle cx="12" cy="12" r="10" />
												<path d="m9 12 2 2 4-4" />
											</svg>
											<svg data-name="icon-sidebar-floating" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 79.86 51.14" class="fill-primary stroke-primary group-data-[state=unchecked]:fill-muted-foreground group-data-[state=unchecked]:stroke-muted-foreground" aria-hidden="true">
												<rect x="5.89" y="5.15" width="19.74" height="40" rx="2" ry="2" opacity="0.8" stroke-linecap="round" stroke-miterlimit="10" />
												<g stroke="#fff" stroke-linecap="round" stroke-miterlimit="10">
													<path fill="none" opacity="0.72" stroke-width="2px" d="M9.81 18.36L22.04 18.36" />
													<path fill="none" opacity="0.48" stroke-width="2px" d="M9.81 25.57L20.33 25.57" />
													<path fill="none" opacity="0.55" stroke-width="2px" d="M9.81 21.85L19.18 21.85" />
													<circle cx="11.76" cy="10.88" r="2.54" fill="#fff" opacity="0.8" />
													<path fill="none" opacity="0.8" stroke-width="2px" d="M16.31 9.62L22.04 9.62" />
													<path fill="none" opacity="0.6" d="M16.1 12.27L21.16 12.27" />
												</g>
												<path fill="none" opacity="0.62" stroke-linecap="round" stroke-miterlimit="10" stroke-width="3px" d="M30.59 9.62L35.85 9.62" />
												<rect x="29.94" y="13.42" width="26.03" height="2.73" rx="0.64" ry="0.64" opacity="0.44" stroke-linecap="round" stroke-miterlimit="10" />
												<rect x="29.94" y="19.28" width="43.11" height="25.87" rx="2" ry="2" opacity="0.3" stroke-linecap="round" stroke-miterlimit="10" />
											</svg>
										</div>
										<div class="mt-1 text-xs" id="floating-description" aria-live="polite">Floating</div>
									</button>
									<button type="button" role="radio" aria-checked={variantSidebar} data-state={variantSidebarState} value="sidebar" class="group outline-none transition duration-200 ease-in" aria-label="Select sidebar" aria-describedby="sidebar-description" tabindex="-1" data-radix-collection-item="" onClick={() => {
										if (prefs.variant !== 'sidebar') {
											prefs.variant = 'sidebar';
											rememberVariant('sidebar');
										}
									}}>
										<div class="relative rounded-[6px] ring-[1px] ring-border group-data-[state=checked]:shadow-2xl group-data-[state=checked]:ring-primary group-focus-visible:ring-2" role="img" aria-hidden="false" aria-label="Sidebar option preview">
											<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-circle-check size-6 fill-primary stroke-white group-data-[state=unchecked]:hidden absolute top-0 right-0 translate-x-1/2 -translate-y-1/2" aria-hidden="true">
												<circle cx="12" cy="12" r="10" />
												<path d="m9 12 2 2 4-4" />
											</svg>
											<svg data-name="icon-sidebar-sidebar" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 79.86 51.14" class="fill-primary stroke-primary group-data-[state=unchecked]:fill-muted-foreground group-data-[state=unchecked]:stroke-muted-foreground" aria-hidden="true">
												<path d="M23.42.51h51.99c2.21 0 4 1.79 4 4v42.18c0 2.21-1.79 4-4 4H23.42s-.04-.02-.04-.04V.55s.02-.04.04-.04z" opacity="0.2" stroke-linecap="round" stroke-miterlimit="10" />
												<path fill="none" opacity="0.72" stroke-linecap="round" stroke-miterlimit="10" stroke-width="2px" d="M5.56 14.88L17.78 14.88" />
												<path fill="none" opacity="0.48" stroke-linecap="round" stroke-miterlimit="10" stroke-width="2px" d="M5.56 22.09L16.08 22.09" />
												<path fill="none" opacity="0.55" stroke-linecap="round" stroke-miterlimit="10" stroke-width="2px" d="M5.56 18.38L14.93 18.38" />
												<g stroke-linecap="round" stroke-miterlimit="10">
													<circle cx="7.51" cy="7.4" r="2.54" opacity="0.8" />
													<path fill="none" opacity="0.8" stroke-width="2px" d="M12.06 6.14L17.78 6.14" />
													<path fill="none" opacity="0.6" d="M11.85 8.79L16.91 8.79" />
												</g>
											</svg>
										</div>
										<div class="mt-1 text-xs" id="sidebar-description" aria-live="polite">Sidebar</div>
									</button>
								</div>
								<div id="sidebar-description" class="sr-only">Choose between inset, floating, or standard sidebar layout</div>
							</div>
							<div class="max-md:hidden">
								<div class="mb-2 flex items-center gap-2 text-sm font-semibold text-muted-foreground">
									Layout
									<button data-slot="button" class="inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive bg-secondary text-secondary-foreground shadow-xs hover:bg-secondary/80 size-4 rounded-full" type="button" aria-label="Reset layout options to default" hidden={layoutIsDefault} onClick={(event) => {
										prefs.open = true;
										rememberSidebar(true);
										prefs.collapsible = 'icon';
										rememberCollapsible('icon');
										focusDialogOf(event);
									}}><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-rotate-ccw size-3" aria-hidden="true"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /></svg></button>
								</div>
								<div role="radiogroup" aria-required="false" dir={prefs.dir} onFocus={focusGroup} onFocusin={radioFocused} onKeydown={radioKey} class="grid w-full max-w-md grid-cols-3 gap-4" aria-label="Select layout style" aria-describedby="layout-description" tabindex="0" style={drawerOutline}>
									<button type="button" role="radio" aria-checked={layoutDefault} data-state={layoutDefaultState} value="default" class="group outline-none transition duration-200 ease-in" aria-label="Select default" aria-describedby="default-description" tabindex="-1" data-radix-collection-item="" onClick={() => {
										if (!prefs.open) {
											prefs.open = true;
											rememberSidebar(true);
										}
									}}>
										<div class="relative rounded-[6px] ring-[1px] ring-border group-data-[state=checked]:shadow-2xl group-data-[state=checked]:ring-primary group-focus-visible:ring-2" role="img" aria-hidden="false" aria-label="Default option preview">
											<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-circle-check size-6 fill-primary stroke-white group-data-[state=unchecked]:hidden absolute top-0 right-0 translate-x-1/2 -translate-y-1/2" aria-hidden="true">
												<circle cx="12" cy="12" r="10" />
												<path d="m9 12 2 2 4-4" />
											</svg>
											<svg data-name="con-layout-default" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 79.86 51.14" class="fill-primary stroke-primary group-data-[state=unchecked]:fill-muted-foreground group-data-[state=unchecked]:stroke-muted-foreground" aria-hidden="true">
												<path d="M39.22 15.99h-8.16c-.79 0-1.43-.67-1.43-1.5s.64-1.5 1.43-1.5h8.16c.79 0 1.43.67 1.43 1.5s-.64 1.5-1.43 1.5z" opacity="0.75" />
												<rect x="29.63" y="18.39" width="16.72" height="2.73" rx="1.36" ry="1.36" opacity="0.5" />
												<path d="M75.1 6.68v1.45c0 .63-.49 1.14-1.09 1.14H30.72c-.6 0-1.09-.51-1.09-1.14V6.68c0-.62.49-1.14 1.09-1.14h43.29c.6 0 1.09.52 1.09 1.14z" opacity="0.9" />
												<rect x="29.63" y="24.22" width="21.8" height="19.95" rx="2.11" ry="2.11" opacity="0.4" />
												<g stroke-linecap="round" stroke-miterlimit="10">
													<rect x="61.06" y="38.15" width="2.01" height="3.42" rx="0.33" ry="0.33" opacity="0.32" />
													<rect x="56.78" y="34.99" width="2.01" height="6.58" rx="0.33" ry="0.33" opacity="0.44" />
													<rect x="65.17" y="32.86" width="2.01" height="8.7" rx="0.33" ry="0.33" opacity="0.53" />
													<rect x="69.55" y="29.17" width="2.01" height="12.4" rx="0.33" ry="0.33" opacity="0.66" />
												</g>
												<g opacity="0.5">
													<circle cx="63.17" cy="18.63" r="7.5" />
													<path d="M63.17 11.63c3.86 0 7 3.14 7 7s-3.14 7-7 7-7-3.14-7-7 3.14-7 7-7m0-1c-4.42 0-8 3.58-8 8s3.58 8 8 8 8-3.58 8-8-3.58-8-8-8z" />
												</g>
												<g opacity="0.74">
													<path d="M64.05 18.13l3.38-5.67c.93.64 1.7 1.48 2.26 2.47.56.98.89 2.08.96 3.21h-6.6z" />
													<path d="M67.57 13.19a6.977 6.977 0 012.52 4.44h-5.17l2.65-4.44m-.31-1.43l-4.1 6.87h8c0-1.39-.36-2.75-1.04-3.95a8.007 8.007 0 00-2.86-2.92z" />
												</g>
												<g stroke-linecap="round" stroke-miterlimit="10">
													<rect x="5.84" y="5.02" width="19.14" height="40" rx="2" ry="2" opacity="0.8" />
													<g stroke="#fff">
														<path fill="none" opacity="0.72" stroke-width="2px" d="M9.02 17.39L21.25 17.39" />
														<path fill="none" opacity="0.48" stroke-width="2px" d="M9.02 24.6L19.54 24.6" />
														<path fill="none" opacity="0.55" stroke-width="2px" d="M9.02 20.88L18.4 20.88" />
														<circle cx="10.98" cy="9.91" r="2.54" fill="#fff" opacity="0.8" />
														<path fill="none" opacity="0.8" stroke-width="2px" d="M15.53 8.65L21.25 8.65" />
														<path fill="none" opacity="0.6" d="M15.32 11.3L20.38 11.3" />
													</g>
												</g>
											</svg>
										</div>
										<div class="mt-1 text-xs" id="default-description" aria-live="polite">Default</div>
									</button>
									<button type="button" role="radio" aria-checked={layoutIcon} data-state={layoutIconState} value="icon" class="group outline-none transition duration-200 ease-in" aria-label="Select compact" aria-describedby="icon-description" tabindex="-1" data-radix-collection-item="" onClick={() => {
										if (prefs.open || prefs.collapsible !== 'icon') {
											prefs.open = false;
											rememberSidebar(false);
											prefs.collapsible = 'icon';
											rememberCollapsible('icon');
										}
									}}>
										<div class="relative rounded-[6px] ring-[1px] ring-border group-data-[state=checked]:shadow-2xl group-data-[state=checked]:ring-primary group-focus-visible:ring-2" role="img" aria-hidden="false" aria-label="Compact option preview">
											<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-circle-check size-6 fill-primary stroke-white group-data-[state=unchecked]:hidden absolute top-0 right-0 translate-x-1/2 -translate-y-1/2" aria-hidden="true">
												<circle cx="12" cy="12" r="10" />
												<path d="m9 12 2 2 4-4" />
											</svg>
											<svg data-name="icon-layout-compact" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 79.86 51.14" class="fill-primary stroke-primary group-data-[state=unchecked]:fill-muted-foreground group-data-[state=unchecked]:stroke-muted-foreground" aria-hidden="true">
												<rect x="5.84" y="5.2" width="4" height="40" rx="2" ry="2" stroke-linecap="round" stroke-miterlimit="10" />
												<g stroke="#fff" stroke-linecap="round" stroke-miterlimit="10">
													<path fill="none" opacity="0.66" stroke-width="2px" d="M7.26 11.56L8.37 11.56" />
													<path fill="none" opacity="0.51" stroke-width="2px" d="M7.26 14.49L8.37 14.49" />
													<path fill="none" opacity="0.52" stroke-width="2px" d="M7.26 17.39L8.37 17.39" />
													<circle cx="7.81" cy="7.25" r="1.16" fill="#fff" opacity="0.8" />
												</g>
												<path fill="none" opacity="0.75" stroke-linecap="round" stroke-miterlimit="10" stroke-width="3px" d="M15.81 14.49L22.89 14.49" />
												<rect x="14.93" y="18.39" width="22.19" height="2.73" rx="0.64" ry="0.64" opacity="0.5" stroke-linecap="round" stroke-miterlimit="10" />
												<rect x="14.93" y="5.89" width="59.16" height="2.73" rx="0.64" ry="0.64" opacity="0.9" stroke-linecap="round" stroke-miterlimit="10" />
												<rect x="14.93" y="24.22" width="32.68" height="19.95" rx="2.11" ry="2.11" opacity="0.4" stroke-linecap="round" stroke-miterlimit="10" />
												<g stroke-linecap="round" stroke-miterlimit="10">
													<rect x="59.05" y="38.15" width="2.01" height="3.42" rx="0.33" ry="0.33" opacity="0.32" />
													<rect x="54.78" y="34.99" width="2.01" height="6.58" rx="0.33" ry="0.33" opacity="0.44" />
													<rect x="63.17" y="32.86" width="2.01" height="8.7" rx="0.33" ry="0.33" opacity="0.53" />
													<rect x="67.54" y="29.17" width="2.01" height="12.4" rx="0.33" ry="0.33" opacity="0.66" />
												</g>
												<g opacity="0.5">
													<circle cx="62.16" cy="18.63" r="7.5" />
													<path d="M62.16 11.63c3.86 0 7 3.14 7 7s-3.14 7-7 7-7-3.14-7-7 3.14-7 7-7m0-1c-4.42 0-8 3.58-8 8s3.58 8 8 8 8-3.58 8-8-3.58-8-8-8z" />
												</g>
												<g opacity="0.74">
													<path d="M63.04 18.13l3.38-5.67c.93.64 1.7 1.48 2.26 2.47.56.98.89 2.08.96 3.21h-6.6z" />
													<path d="M66.57 13.19a6.977 6.977 0 012.52 4.44h-5.17l2.65-4.44m-.31-1.43l-4.1 6.87h8c0-1.39-.36-2.75-1.04-3.95a8.007 8.007 0 00-2.86-2.92z" />
												</g>
											</svg>
										</div>
										<div class="mt-1 text-xs" id="icon-description" aria-live="polite">Compact</div>
									</button>
									<button type="button" role="radio" aria-checked={layoutOffcanvas} data-state={layoutOffcanvasState} value="offcanvas" class="group outline-none transition duration-200 ease-in" aria-label="Select full layout" aria-describedby="offcanvas-description" tabindex="-1" data-radix-collection-item="" onClick={() => {
										if (prefs.open || prefs.collapsible !== 'offcanvas') {
											prefs.open = false;
											rememberSidebar(false);
											prefs.collapsible = 'offcanvas';
											rememberCollapsible('offcanvas');
										}
									}}>
										<div class="relative rounded-[6px] ring-[1px] ring-border group-data-[state=checked]:shadow-2xl group-data-[state=checked]:ring-primary group-focus-visible:ring-2" role="img" aria-hidden="false" aria-label="Full layout option preview">
											<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-circle-check size-6 fill-primary stroke-white group-data-[state=unchecked]:hidden absolute top-0 right-0 translate-x-1/2 -translate-y-1/2" aria-hidden="true">
												<circle cx="12" cy="12" r="10" />
												<path d="m9 12 2 2 4-4" />
											</svg>
											<svg data-name="icon-layout-full" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 79.86 51.14" class="fill-primary stroke-primary group-data-[state=unchecked]:fill-muted-foreground group-data-[state=unchecked]:stroke-muted-foreground" aria-hidden="true">
												<path fill="none" opacity="0.75" stroke-linecap="round" stroke-miterlimit="10" stroke-width="3px" d="M6.85 14.49L15.02 14.49" />
												<rect x="5.84" y="18.39" width="25.6" height="2.73" rx="0.64" ry="0.64" opacity="0.5" stroke-linecap="round" stroke-miterlimit="10" />
												<rect x="5.84" y="5.89" width="68.26" height="2.73" rx="0.64" ry="0.64" opacity="0.9" stroke-linecap="round" stroke-miterlimit="10" />
												<rect x="5.84" y="24.22" width="37.71" height="19.95" rx="2.11" ry="2.11" opacity="0.4" stroke-linecap="round" stroke-miterlimit="10" />
												<g stroke-linecap="round" stroke-miterlimit="10">
													<rect x="59.05" y="38.15" width="2.01" height="3.42" rx="0.33" ry="0.33" opacity="0.32" />
													<rect x="54.78" y="34.99" width="2.01" height="6.58" rx="0.33" ry="0.33" opacity="0.44" />
													<rect x="63.17" y="32.86" width="2.01" height="8.7" rx="0.33" ry="0.33" opacity="0.53" />
													<rect x="67.54" y="29.17" width="2.01" height="12.4" rx="0.33" ry="0.33" opacity="0.66" />
												</g>
												<g opacity="0.5">
													<circle cx="62.16" cy="18.63" r="7.5" />
													<path d="M62.16 11.63c3.86 0 7 3.14 7 7s-3.14 7-7 7-7-3.14-7-7 3.14-7 7-7m0-1c-4.42 0-8 3.58-8 8s3.58 8 8 8 8-3.58 8-8-3.58-8-8-8z" />
												</g>
												<g opacity="0.74">
													<path d="M63.04 18.13l3.38-5.67c.93.64 1.7 1.48 2.26 2.47.56.98.89 2.08.96 3.21h-6.6z" />
													<path d="M66.57 13.19a6.977 6.977 0 012.52 4.44h-5.17l2.65-4.44m-.31-1.43l-4.1 6.87h8c0-1.39-.36-2.75-1.04-3.95a8.007 8.007 0 00-2.86-2.92z" />
												</g>
											</svg>
										</div>
										<div class="mt-1 text-xs" id="offcanvas-description" aria-live="polite">Full layout</div>
									</button>
								</div>
								<div id="layout-description" class="sr-only">Choose between default expanded, compact icon-only, or full layout mode</div>
							</div>
							<div>
								<div class="mb-2 flex items-center gap-2 text-sm font-semibold text-muted-foreground">
									Direction
									<button data-slot="button" class="inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive bg-secondary text-secondary-foreground shadow-xs hover:bg-secondary/80 size-4 rounded-full" type="button" aria-label="Reset text direction to default" hidden={dirDefault} onClick={(event) => {
										prefs.dir = 'ltr';
										applyDir('ltr');
										focusDialogOf(event);
									}}><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-rotate-ccw size-3" aria-hidden="true"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /></svg></button>
								</div>
								<div role="radiogroup" aria-required="false" dir={prefs.dir} onFocus={focusGroup} onFocusin={radioFocused} onKeydown={radioKey} class="grid w-full max-w-md grid-cols-3 gap-4" aria-label="Select site direction" aria-describedby="direction-description" tabindex="0" style={drawerOutline}>
									<button type="button" role="radio" aria-checked={dirLtr} data-state={dirLtrState} value="ltr" class="group outline-none transition duration-200 ease-in" aria-label="Select left to right" aria-describedby="ltr-description" tabindex="-1" data-radix-collection-item="" onClick={() => {
										if (prefs.dir !== 'ltr') {
											prefs.dir = 'ltr';
											applyDir('ltr');
										}
									}}>
										<div class="relative rounded-[6px] ring-[1px] ring-border group-data-[state=checked]:shadow-2xl group-data-[state=checked]:ring-primary group-focus-visible:ring-2" role="img" aria-hidden="false" aria-label="Left to Right option preview">
											<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-circle-check size-6 fill-primary stroke-white group-data-[state=unchecked]:hidden absolute top-0 right-0 translate-x-1/2 -translate-y-1/2" aria-hidden="true">
												<circle cx="12" cy="12" r="10" />
												<path d="m9 12 2 2 4-4" />
											</svg>
											<svg data-name="icon-dir-ltr" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 79.86 51.14" class="fill-primary stroke-primary group-data-[state=unchecked]:fill-muted-foreground group-data-[state=unchecked]:stroke-muted-foreground" aria-hidden="true">
												<path d="M23.42.51h51.92c2.21 0 4 1.79 4 4v42.18c0 2.21-1.79 4-4 4H23.42s-.04-.02-.04-.04V.55s.02-.04.04-.04z" opacity="0.15" />
												<path fill="none" opacity="0.72" stroke-linecap="round" stroke-miterlimit="10" stroke-width="2px" d="M5.56 14.88L17.78 14.88" />
												<path fill="none" opacity="0.48" stroke-linecap="round" stroke-miterlimit="10" stroke-width="2px" d="M5.56 22.09L16.08 22.09" />
												<path fill="none" opacity="0.55" stroke-linecap="round" stroke-miterlimit="10" stroke-width="2px" d="M5.56 18.38L14.93 18.38" />
												<g stroke-linecap="round" stroke-miterlimit="10">
													<circle cx="7.51" cy="7.4" r="2.54" opacity="0.8" />
													<path fill="none" opacity="0.8" stroke-width="2px" d="M12.06 6.14L17.78 6.14" />
													<path fill="none" opacity="0.6" d="M11.85 8.79L16.91 8.79" />
												</g>
												<path fill="none" opacity="0.62" stroke-linecap="round" stroke-miterlimit="10" stroke-width="3px" d="M29.41 7.4L34.67 7.4" />
												<rect x="28.76" y="11.21" width="26.03" height="2.73" rx="0.64" ry="0.64" opacity="0.44" stroke-linecap="round" stroke-miterlimit="10" />
												<rect x="28.76" y="17.01" width="44.25" height="13.48" rx="0.64" ry="0.64" opacity="0.3" stroke-linecap="round" stroke-miterlimit="10" />
												<rect x="28.76" y="33.57" width="44.25" height="4.67" rx="0.64" ry="0.64" opacity="0.21" stroke-linecap="round" stroke-miterlimit="10" />
												<rect x="28.76" y="41.32" width="36.21" height="4.67" rx="0.64" ry="0.64" opacity="0.3" stroke-linecap="round" stroke-miterlimit="10" />
											</svg>
										</div>
										<div class="mt-1 text-xs" id="ltr-description" aria-live="polite">Left to Right</div>
									</button>
									<button type="button" role="radio" aria-checked={dirRtl} data-state={dirRtlState} value="rtl" class="group outline-none transition duration-200 ease-in" aria-label="Select right to left" aria-describedby="rtl-description" tabindex="-1" data-radix-collection-item="" onClick={() => {
										if (prefs.dir !== 'rtl') {
											prefs.dir = 'rtl';
											applyDir('rtl');
										}
									}}>
										<div class="relative rounded-[6px] ring-[1px] ring-border group-data-[state=checked]:shadow-2xl group-data-[state=checked]:ring-primary group-focus-visible:ring-2" role="img" aria-hidden="false" aria-label="Right to Left option preview">
											<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-circle-check size-6 fill-primary stroke-white group-data-[state=unchecked]:hidden absolute top-0 right-0 translate-x-1/2 -translate-y-1/2" aria-hidden="true">
												<circle cx="12" cy="12" r="10" />
												<path d="m9 12 2 2 4-4" />
											</svg>
											<svg data-name="icon-dir-rtl" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 79.86 51.14" class="rotate-y-180 fill-primary stroke-primary group-data-[state=unchecked]:fill-muted-foreground group-data-[state=unchecked]:stroke-muted-foreground" aria-hidden="true">
												<path d="M23.42.51h51.92c2.21 0 4 1.79 4 4v42.18c0 2.21-1.79 4-4 4H23.42s-.04-.02-.04-.04V.55s.02-.04.04-.04z" opacity="0.15" />
												<path fill="none" opacity="0.72" stroke-linecap="round" stroke-miterlimit="10" stroke-width="2px" d="M5.56 14.88L17.78 14.88" />
												<path fill="none" opacity="0.48" stroke-linecap="round" stroke-miterlimit="10" stroke-width="2px" d="M5.56 22.09L16.08 22.09" />
												<path fill="none" opacity="0.55" stroke-linecap="round" stroke-miterlimit="10" stroke-width="2px" d="M5.56 18.38L14.93 18.38" />
												<g stroke-linecap="round" stroke-miterlimit="10">
													<circle cx="7.51" cy="7.4" r="2.54" opacity="0.8" />
													<path fill="none" opacity="0.8" stroke-width="2px" d="M12.06 6.14L17.78 6.14" />
													<path fill="none" opacity="0.6" d="M11.85 8.79L16.91 8.79" />
												</g>
												<path fill="none" opacity="0.62" stroke-linecap="round" stroke-miterlimit="10" stroke-width="3px" d="M29.41 7.4L34.67 7.4" />
												<rect x="28.76" y="11.21" width="26.03" height="2.73" rx="0.64" ry="0.64" opacity="0.44" stroke-linecap="round" stroke-miterlimit="10" />
												<rect x="28.76" y="17.01" width="44.25" height="13.48" rx="0.64" ry="0.64" opacity="0.3" stroke-linecap="round" stroke-miterlimit="10" />
												<rect x="28.76" y="33.57" width="44.25" height="4.67" rx="0.64" ry="0.64" opacity="0.21" stroke-linecap="round" stroke-miterlimit="10" />
												<rect x="28.76" y="41.32" width="36.21" height="4.67" rx="0.64" ry="0.64" opacity="0.3" stroke-linecap="round" stroke-miterlimit="10" />
											</svg>
										</div>
										<div class="mt-1 text-xs" id="rtl-description" aria-live="polite">Right to Left</div>
									</button>
								</div>
								<div id="direction-description" class="sr-only">Choose between left-to-right or right-to-left site direction</div>
							</div>
						</div>
						<div data-slot="sheet-footer" class="mt-auto flex flex-col p-4 gap-2">
							<button data-slot="button" class="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive bg-destructive text-white shadow-xs hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60 h-9 px-4 py-2 has-[>svg]:px-3" aria-label="Reset all settings to default values" onClick={() => {
						prefs.open = true;
						rememberSidebar(true);
						prefs.dir = 'ltr';
						resetDir();
						prefs.theme = 'system';
						resetTheme();
						prefs.collapsible = 'icon';
						rememberCollapsible('icon');
						prefs.variant = 'inset';
						rememberVariant('inset');
					}}>Reset</button>
						</div>
						<DialogClose class="absolute inset-e-4 top-4 rounded-xs opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none data-[state=open]:bg-secondary">
							<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-x size-4" aria-hidden="true">
								<path d="M18 6 6 18" />
								<path d="m6 6 12 12" />
							</svg>
							<span class="sr-only">Close</span>
						</DialogClose>
					</DialogContent>
				</DialogPortal>
				</DialogRoot>
				{children}
			</div>
		</div>

		<DialogRoot open={searchOpen} onOpenChange={(next: boolean) => { searchOpen = next; if (next) searchSeen = true; }}>
			<div data-slot="dialog-header" class="flex flex-col gap-2 text-center sm:text-start sr-only">
				<DialogTitle data-slot="dialog-title" class="text-lg leading-none font-semibold">Command Palette</DialogTitle>
				<DialogDescription data-slot="dialog-description" class="text-sm text-muted-foreground">Search for a command to run...</DialogDescription>
			</div>

			<DialogPortal data-slot="dialog-portal">
			<DialogOverlay data-slot="dialog-overlay" class="fixed inset-0 z-50 bg-black/50 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0"></DialogOverlay>
			<DialogContent data-slot="dialog-content" class="fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border bg-background shadow-lg duration-200 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 sm:max-w-lg overflow-hidden p-0" onKeydown={searchKeys}>
				<div tabindex="-1" data-slot="command" class="flex h-full w-full flex-col overflow-hidden rounded-md bg-popover text-popover-foreground **:data-[slot=command-input-wrapper]:h-12 [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0 [&_[cmdk-input-wrapper]_svg]:h-5 [&_[cmdk-input-wrapper]_svg]:w-5 [&_[cmdk-item]_svg]:h-5 [&_[cmdk-item]_svg]:w-5 **:[[cmdk-group-heading]]:px-2 **:[[cmdk-group-heading]]:font-medium **:[[cmdk-group-heading]]:text-muted-foreground **:[[cmdk-group]]:px-2 **:[[cmdk-input]]:h-12 **:[[cmdk-item]]:px-2 **:[[cmdk-item]]:py-3" cmdk-root="">
					<label cmdk-label="" for="command-palette-input" id="command-palette-label" style={paletteLabelStyle}></label>
					<div data-slot="command-input-wrapper" class="flex h-9 items-center gap-2 border-b px-3">
						<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-search size-4 shrink-0 opacity-50" aria-hidden="true">
							<path d="m21 21-4.34-4.34" />
							<circle cx="11" cy="11" r="8" />
						</svg>
						<input data-slot="command-input" class="flex h-10 w-full rounded-md bg-transparent py-3 text-sm outline-hidden placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50" placeholder="Type a command or search..." cmdk-input="" autocomplete="off" autocorrect="off" spellcheck="false" aria-autocomplete="list" role="combobox" aria-expanded="true" aria-controls="command-palette-list" aria-labelledby="command-palette-label" id="command-palette-input" type="text" value="" onInput={(event) => filterCommands((event.target as HTMLInputElement).value)} />
					</div>
					<div data-slot="command-list" class="max-h-75 scroll-py-1 overflow-x-hidden overflow-y-auto" cmdk-list="" role="listbox" tabindex="-1" aria-label="Suggestions" id="command-palette-list" onClick={pickCommand} style={paletteListStyle}>
						<div cmdk-list-sizer="">
							<div dir="ltr" data-slot="scroll-area" class="relative h-72 pe-1" style={paletteScrollStyle} onPointerenter={(event) => showScrollbar(event.target as HTMLElement)} onPointerleave={(event) => hideScrollbar(event.target as HTMLElement)}>
								<div data-radix-scroll-area-viewport="" data-slot="scroll-area-viewport" class="size-full rounded-[inherit] transition-[color,box-shadow] outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1" style={paletteViewportStyle} onScroll={(event) => placeScrollThumb((event.target as HTMLElement).parentElement)}>
									<div style={paletteTableStyle}>
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
													Secured by Clerk{' '}
													<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-chevron-right" aria-hidden="true">
														<path d="m9 18 6-6-6-6" />
													</svg>
													{' '}Sign In
												</div>
												<div data-slot="command-item" class="relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground" id="command-palette-8" cmdk-item="" role="option" aria-disabled="false" aria-selected="false" data-disabled="false" data-selected="false" data-value="Secured by Clerk-/clerk/sign-up" data-url="/clerk/sign-up">
													<div class="flex size-4 items-center justify-center">
														<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-arrow-right size-2 text-muted-foreground/80" aria-hidden="true">
															<path d="M5 12h14" />
															<path d="m12 5 7 7-7 7" />
														</svg>
													</div>
													Secured by Clerk{' '}
													<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-chevron-right" aria-hidden="true">
														<path d="m9 18 6-6-6-6" />
													</svg>
													{' '}Sign Up
												</div>
												<div data-slot="command-item" class="relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground" id="command-palette-9" cmdk-item="" role="option" aria-disabled="false" aria-selected="false" data-disabled="false" data-selected="false" data-value="Secured by Clerk-/clerk/user-management" data-url="/clerk/user-management">
													<div class="flex size-4 items-center justify-center">
														<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-arrow-right size-2 text-muted-foreground/80" aria-hidden="true">
															<path d="M5 12h14" />
															<path d="m12 5 7 7-7 7" />
														</svg>
													</div>
													Secured by Clerk{' '}
													<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-chevron-right" aria-hidden="true">
														<path d="m9 18 6-6-6-6" />
													</svg>
													{' '}User Management
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
													Auth{' '}
													<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-chevron-right" aria-hidden="true">
														<path d="m9 18 6-6-6-6" />
													</svg>
													{' '}Sign In
												</div>
												<div data-slot="command-item" class="relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground" id="command-palette-12" cmdk-item="" role="option" aria-disabled="false" aria-selected="false" data-disabled="false" data-selected="false" data-value="Auth-/sign-in-2" data-url="/sign-in-2">
													<div class="flex size-4 items-center justify-center">
														<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-arrow-right size-2 text-muted-foreground/80" aria-hidden="true">
															<path d="M5 12h14" />
															<path d="m12 5 7 7-7 7" />
														</svg>
													</div>
													Auth{' '}
													<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-chevron-right" aria-hidden="true">
														<path d="m9 18 6-6-6-6" />
													</svg>
													{' '}Sign In (2 Col)
												</div>
												<div data-slot="command-item" class="relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground" id="command-palette-13" cmdk-item="" role="option" aria-disabled="false" aria-selected="false" data-disabled="false" data-selected="false" data-value="Auth-/sign-up" data-url="/sign-up">
													<div class="flex size-4 items-center justify-center">
														<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-arrow-right size-2 text-muted-foreground/80" aria-hidden="true">
															<path d="M5 12h14" />
															<path d="m12 5 7 7-7 7" />
														</svg>
													</div>
													Auth{' '}
													<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-chevron-right" aria-hidden="true">
														<path d="m9 18 6-6-6-6" />
													</svg>
													{' '}Sign Up
												</div>
												<div data-slot="command-item" class="relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground" id="command-palette-14" cmdk-item="" role="option" aria-disabled="false" aria-selected="false" data-disabled="false" data-selected="false" data-value="Auth-/forgot-password" data-url="/forgot-password">
													<div class="flex size-4 items-center justify-center">
														<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-arrow-right size-2 text-muted-foreground/80" aria-hidden="true">
															<path d="M5 12h14" />
															<path d="m12 5 7 7-7 7" />
														</svg>
													</div>
													Auth{' '}
													<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-chevron-right" aria-hidden="true">
														<path d="m9 18 6-6-6-6" />
													</svg>
													{' '}Forgot Password
												</div>
												<div data-slot="command-item" class="relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground" id="command-palette-15" cmdk-item="" role="option" aria-disabled="false" aria-selected="false" data-disabled="false" data-selected="false" data-value="Auth-/otp" data-url="/otp">
													<div class="flex size-4 items-center justify-center">
														<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-arrow-right size-2 text-muted-foreground/80" aria-hidden="true">
															<path d="M5 12h14" />
															<path d="m12 5 7 7-7 7" />
														</svg>
													</div>
													Auth{' '}
													<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-chevron-right" aria-hidden="true">
														<path d="m9 18 6-6-6-6" />
													</svg>
													{' '}OTP
												</div>
												<div data-slot="command-item" class="relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground" id="command-palette-16" cmdk-item="" role="option" aria-disabled="false" aria-selected="false" data-disabled="false" data-selected="false" data-value="Errors-/errors/unauthorized" data-url="/errors/unauthorized">
													<div class="flex size-4 items-center justify-center">
														<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-arrow-right size-2 text-muted-foreground/80" aria-hidden="true">
															<path d="M5 12h14" />
															<path d="m12 5 7 7-7 7" />
														</svg>
													</div>
													Errors{' '}
													<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-chevron-right" aria-hidden="true">
														<path d="m9 18 6-6-6-6" />
													</svg>
													{' '}Unauthorized
												</div>
												<div data-slot="command-item" class="relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground" id="command-palette-17" cmdk-item="" role="option" aria-disabled="false" aria-selected="false" data-disabled="false" data-selected="false" data-value="Errors-/errors/forbidden" data-url="/errors/forbidden">
													<div class="flex size-4 items-center justify-center">
														<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-arrow-right size-2 text-muted-foreground/80" aria-hidden="true">
															<path d="M5 12h14" />
															<path d="m12 5 7 7-7 7" />
														</svg>
													</div>
													Errors{' '}
													<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-chevron-right" aria-hidden="true">
														<path d="m9 18 6-6-6-6" />
													</svg>
													{' '}Forbidden
												</div>
												<div data-slot="command-item" class="relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground" id="command-palette-18" cmdk-item="" role="option" aria-disabled="false" aria-selected="false" data-disabled="false" data-selected="false" data-value="Errors-/errors/not-found" data-url="/errors/not-found">
													<div class="flex size-4 items-center justify-center">
														<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-arrow-right size-2 text-muted-foreground/80" aria-hidden="true">
															<path d="M5 12h14" />
															<path d="m12 5 7 7-7 7" />
														</svg>
													</div>
													Errors{' '}
													<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-chevron-right" aria-hidden="true">
														<path d="m9 18 6-6-6-6" />
													</svg>
													{' '}Not Found
												</div>
												<div data-slot="command-item" class="relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground" id="command-palette-19" cmdk-item="" role="option" aria-disabled="false" aria-selected="false" data-disabled="false" data-selected="false" data-value="Errors-/errors/internal-server-error" data-url="/errors/internal-server-error">
													<div class="flex size-4 items-center justify-center">
														<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-arrow-right size-2 text-muted-foreground/80" aria-hidden="true">
															<path d="M5 12h14" />
															<path d="m12 5 7 7-7 7" />
														</svg>
													</div>
													Errors{' '}
													<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-chevron-right" aria-hidden="true">
														<path d="m9 18 6-6-6-6" />
													</svg>
													{' '}Internal Server Error
												</div>
												<div data-slot="command-item" class="relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground" id="command-palette-20" cmdk-item="" role="option" aria-disabled="false" aria-selected="false" data-disabled="false" data-selected="false" data-value="Errors-/errors/maintenance-error" data-url="/errors/maintenance-error">
													<div class="flex size-4 items-center justify-center">
														<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-arrow-right size-2 text-muted-foreground/80" aria-hidden="true">
															<path d="M5 12h14" />
															<path d="m12 5 7 7-7 7" />
														</svg>
													</div>
													Errors{' '}
													<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-chevron-right" aria-hidden="true">
														<path d="m9 18 6-6-6-6" />
													</svg>
													{' '}Maintenance Error
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
													Settings{' '}
													<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-chevron-right" aria-hidden="true">
														<path d="m9 18 6-6-6-6" />
													</svg>
													{' '}Profile
												</div>
												<div data-slot="command-item" class="relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground" id="command-palette-23" cmdk-item="" role="option" aria-disabled="false" aria-selected="false" data-disabled="false" data-selected="false" data-value="Settings-/settings/account" data-url="/settings/account">
													<div class="flex size-4 items-center justify-center">
														<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-arrow-right size-2 text-muted-foreground/80" aria-hidden="true">
															<path d="M5 12h14" />
															<path d="m12 5 7 7-7 7" />
														</svg>
													</div>
													Settings{' '}
													<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-chevron-right" aria-hidden="true">
														<path d="m9 18 6-6-6-6" />
													</svg>
													{' '}Account
												</div>
												<div data-slot="command-item" class="relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground" id="command-palette-24" cmdk-item="" role="option" aria-disabled="false" aria-selected="false" data-disabled="false" data-selected="false" data-value="Settings-/settings/appearance" data-url="/settings/appearance">
													<div class="flex size-4 items-center justify-center">
														<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-arrow-right size-2 text-muted-foreground/80" aria-hidden="true">
															<path d="M5 12h14" />
															<path d="m12 5 7 7-7 7" />
														</svg>
													</div>
													Settings{' '}
													<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-chevron-right" aria-hidden="true">
														<path d="m9 18 6-6-6-6" />
													</svg>
													{' '}Appearance
												</div>
												<div data-slot="command-item" class="relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground" id="command-palette-25" cmdk-item="" role="option" aria-disabled="false" aria-selected="false" data-disabled="false" data-selected="false" data-value="Settings-/settings/notifications" data-url="/settings/notifications">
													<div class="flex size-4 items-center justify-center">
														<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-arrow-right size-2 text-muted-foreground/80" aria-hidden="true">
															<path d="M5 12h14" />
															<path d="m12 5 7 7-7 7" />
														</svg>
													</div>
													Settings{' '}
													<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-chevron-right" aria-hidden="true">
														<path d="m9 18 6-6-6-6" />
													</svg>
													{' '}Notifications
												</div>
												<div data-slot="command-item" class="relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground" id="command-palette-26" cmdk-item="" role="option" aria-disabled="false" aria-selected="false" data-disabled="false" data-selected="false" data-value="Settings-/settings/display" data-url="/settings/display">
													<div class="flex size-4 items-center justify-center">
														<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-arrow-right size-2 text-muted-foreground/80" aria-hidden="true">
															<path d="M5 12h14" />
															<path d="m12 5 7 7-7 7" />
														</svg>
													</div>
													Settings{' '}
													<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-chevron-right" aria-hidden="true">
														<path d="m9 18 6-6-6-6" />
													</svg>
													{' '}Display
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
				<DialogClose data-slot="dialog-close" class="absolute inset-e-4 top-4 rounded-xs opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4">
					<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-x" aria-hidden="true">
						<path d="M18 6 6 18" />
						<path d="m6 6 12 12" />
					</svg>
					<span class="sr-only">Close</span>
				</DialogClose>
			</DialogContent>
			</DialogPortal>
		</DialogRoot>

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
				<DropdownMenuLinkItem href="/settings/account" current={active === '/settings/account'}><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-badge-check" aria-hidden="true"><path d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z" /><path d="m9 12 2 2 4-4" /></svg>Account</DropdownMenuLinkItem>
				<DropdownMenuLinkItem href="/settings" current={active === '/settings'}><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-credit-card" aria-hidden="true"><rect width="20" height="14" x="2" y="5" rx="2" /><line x1="2" x2="22" y1="10" y2="10" /></svg>Billing</DropdownMenuLinkItem>
				<DropdownMenuLinkItem href="/settings/notifications" current={active === '/settings/notifications'}><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-bell" aria-hidden="true"><path d="M10.268 21a2 2 0 0 0 3.464 0" /><path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326" /></svg>Notifications</DropdownMenuLinkItem>
			</DropdownMenuGroup>
			<DropdownMenuSeparator />
			<DropdownMenuItem menu="user" variant="destructive" onSelect={openSignOut}><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-log-out" aria-hidden="true"><path d="m16 17 5-5-5-5" /><path d="M21 12H9" /><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /></svg>Sign out</DropdownMenuItem>
		</DropdownMenuContent>

		<DropdownMenuContent menu="theme" modal={false} align="end">
			<DropdownMenuItem menu="theme" onSelect={() => { prefs.theme = 'light'; applyTheme('light'); }}>
				Light
				<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class={lightCheck} aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>
			</DropdownMenuItem>
			<DropdownMenuItem menu="theme" onSelect={() => { prefs.theme = 'dark'; applyTheme('dark'); }}>
				Dark
				<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class={darkCheck} aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>
			</DropdownMenuItem>
			<DropdownMenuItem menu="theme" onSelect={() => { prefs.theme = 'system'; applyTheme('system'); }}>
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
				<DropdownMenuLinkItem href="/settings" current={active === '/settings'}>Profile<DropdownMenuShortcut>⇧⌘P</DropdownMenuShortcut></DropdownMenuLinkItem>
				<DropdownMenuLinkItem href="/settings" current={active === '/settings'}>Billing<DropdownMenuShortcut>⌘B</DropdownMenuShortcut></DropdownMenuLinkItem>
				<DropdownMenuLinkItem href="/settings" current={active === '/settings'}>Settings<DropdownMenuShortcut>⌘S</DropdownMenuShortcut></DropdownMenuLinkItem>
				<DropdownMenuItem menu="profile">New Team</DropdownMenuItem>
			</DropdownMenuGroup>
			<DropdownMenuSeparator />
			<DropdownMenuItem menu="profile" variant="destructive" onSelect={openSignOut}>Sign out<DropdownMenuShortcut class="text-current">⇧⌘Q</DropdownMenuShortcut></DropdownMenuItem>
		</DropdownMenuContent>

		<DropdownMenuContent menu="topnav" modal={false} side="bottom" align="start">
			<DropdownMenuLinkItem href="/dashboard/overview" current={active === '/dashboard/overview'}>Overview</DropdownMenuLinkItem>
			<DropdownMenuLinkItem class="text-muted-foreground" aria-disabled="true">Customers</DropdownMenuLinkItem>
			<DropdownMenuLinkItem class="text-muted-foreground" aria-disabled="true">Products</DropdownMenuLinkItem>
			<DropdownMenuLinkItem class="text-muted-foreground" aria-disabled="true">Settings</DropdownMenuLinkItem>
		</DropdownMenuContent>

		<AlertDialogRoot open={signOutOpen} onOpenChange={(next: boolean) => { signOutOpen = next; }}>
			<AlertDialogPortal>
				<AlertDialogOverlay data-slot="alert-dialog-overlay" class="fixed inset-0 z-50 bg-black/50 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0"></AlertDialogOverlay>
				<AlertDialogContent data-slot="alert-dialog-content" class="fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border bg-background p-6 shadow-lg duration-200 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 sm:max-w-sm">
					<div data-slot="alert-dialog-header" class="flex flex-col gap-2 sm:text-start text-start">
						<AlertDialogTitle data-slot="alert-dialog-title" class="text-lg font-semibold">Sign out</AlertDialogTitle>
						<AlertDialogDescription asChild data-slot="alert-dialog-description" class="text-sm text-muted-foreground">Are you sure you want to sign out? You will need to sign in again to access your account.</AlertDialogDescription>
					</div>
					<div data-slot="alert-dialog-footer" class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
						<AlertDialogCancel class="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50 h-9 px-4 py-2 has-[>svg]:px-3">Cancel</AlertDialogCancel>
						<button data-slot="button" onClick={() => signOut()} class="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive bg-destructive text-white shadow-xs hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60 h-9 px-4 py-2 has-[>svg]:px-3" type="button">Sign out</button>
					</div>
				</AlertDialogContent>
			</AlertDialogPortal>
		</AlertDialogRoot>

		<DropdownMenuContent menu="nav-clerk" side="right" align="start" sideOffset={4}>
			<DropdownMenuLabel>Secured by Clerk </DropdownMenuLabel>
			<DropdownMenuSeparator />
			<DropdownMenuLinkItem href="/clerk/sign-in" current={active === '/clerk/sign-in'} class={active === '/clerk/sign-in' ? 'bg-secondary' : ''}><span class="max-w-52 text-wrap">Sign In</span></DropdownMenuLinkItem>
			<DropdownMenuLinkItem href="/clerk/sign-up" current={active === '/clerk/sign-up'} class={active === '/clerk/sign-up' ? 'bg-secondary' : ''}><span class="max-w-52 text-wrap">Sign Up</span></DropdownMenuLinkItem>
			<DropdownMenuLinkItem href="/clerk/user-management" current={active === '/clerk/user-management'} class={active === '/clerk/user-management' ? 'bg-secondary' : ''}><span class="max-w-52 text-wrap">User Management</span></DropdownMenuLinkItem>
		</DropdownMenuContent>

		<DropdownMenuContent menu="nav-auth" side="right" align="start" sideOffset={4}>
			<DropdownMenuLabel>Auth </DropdownMenuLabel>
			<DropdownMenuSeparator />
			<DropdownMenuLinkItem href="/sign-in" current={active === '/sign-in'} class={active === '/sign-in' ? 'bg-secondary' : ''}><span class="max-w-52 text-wrap">Sign In</span></DropdownMenuLinkItem>
			<DropdownMenuLinkItem href="/sign-in-2" current={active === '/sign-in-2'} class={active === '/sign-in-2' ? 'bg-secondary' : ''}><span class="max-w-52 text-wrap">Sign In (2 Col)</span></DropdownMenuLinkItem>
			<DropdownMenuLinkItem href="/sign-up" current={active === '/sign-up'} class={active === '/sign-up' ? 'bg-secondary' : ''}><span class="max-w-52 text-wrap">Sign Up</span></DropdownMenuLinkItem>
			<DropdownMenuLinkItem href="/forgot-password" current={active === '/forgot-password'} class={active === '/forgot-password' ? 'bg-secondary' : ''}><span class="max-w-52 text-wrap">Forgot Password</span></DropdownMenuLinkItem>
			<DropdownMenuLinkItem href="/otp" current={active === '/otp'} class={active === '/otp' ? 'bg-secondary' : ''}><span class="max-w-52 text-wrap">OTP</span></DropdownMenuLinkItem>
		</DropdownMenuContent>

		<DropdownMenuContent menu="nav-errors" side="right" align="start" sideOffset={4}>
			<DropdownMenuLabel>Errors </DropdownMenuLabel>
			<DropdownMenuSeparator />
			<DropdownMenuLinkItem href="/errors/unauthorized" current={active === '/errors/unauthorized'} class={active === '/errors/unauthorized' ? 'bg-secondary' : ''}><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-lock" aria-hidden="true"><rect width="18" height="11" x="3" y="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg><span class="max-w-52 text-wrap">Unauthorized</span></DropdownMenuLinkItem>
			<DropdownMenuLinkItem href="/errors/forbidden" current={active === '/errors/forbidden'} class={active === '/errors/forbidden' ? 'bg-secondary' : ''}><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-user-x" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><line x1="17" x2="22" y1="8" y2="13" /><line x1="22" x2="17" y1="8" y2="13" /></svg><span class="max-w-52 text-wrap">Forbidden</span></DropdownMenuLinkItem>
			<DropdownMenuLinkItem href="/errors/not-found" current={active === '/errors/not-found'} class={active === '/errors/not-found' ? 'bg-secondary' : ''}><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-file-x" aria-hidden="true"><path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z" /><path d="M14 2v5a1 1 0 0 0 1 1h5" /><path d="m14.5 12.5-5 5" /><path d="m9.5 12.5 5 5" /></svg><span class="max-w-52 text-wrap">Not Found</span></DropdownMenuLinkItem>
			<DropdownMenuLinkItem href="/errors/internal-server-error" current={active === '/errors/internal-server-error'} class={active === '/errors/internal-server-error' ? 'bg-secondary' : ''}><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-server-off" aria-hidden="true"><path d="M7 2h13a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-5" /><path d="M10 10 2.5 2.5C2 2 2 2.5 2 5v3a2 2 0 0 0 2 2h6z" /><path d="M22 17v-1a2 2 0 0 0-2-2h-1" /><path d="M4 14a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2h16.5l1-.5.5.5-8-8H4z" /><path d="M6 18h.01" /><path d="m2 2 20 20" /></svg><span class="max-w-52 text-wrap">Internal Server Error</span></DropdownMenuLinkItem>
			<DropdownMenuLinkItem href="/errors/maintenance-error" current={active === '/errors/maintenance-error'} class={active === '/errors/maintenance-error' ? 'bg-secondary' : ''}><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-construction" aria-hidden="true"><rect x="2" y="6" width="20" height="8" rx="1" /><path d="M17 14v7" /><path d="M7 14v7" /><path d="M17 3v3" /><path d="M7 3v3" /><path d="M10 14 2.3 6.3" /><path d="m14 6 7.7 7.7" /><path d="m8 6 8 8" /></svg><span class="max-w-52 text-wrap">Maintenance Error</span></DropdownMenuLinkItem>
		</DropdownMenuContent>

		<DropdownMenuContent menu="nav-settings" side="right" align="start" sideOffset={4}>
			<DropdownMenuLabel>Settings </DropdownMenuLabel>
			<DropdownMenuSeparator />
			<DropdownMenuLinkItem href="/settings" current={active === '/settings'} class={active === '/settings' ? 'bg-secondary' : ''}><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-user-cog" aria-hidden="true"><path d="M10 15H6a4 4 0 0 0-4 4v2" /><path d="m14.305 16.53.923-.382" /><path d="m15.228 13.852-.923-.383" /><path d="m16.852 12.228-.383-.923" /><path d="m16.852 17.772-.383.924" /><path d="m19.148 12.228.383-.923" /><path d="m19.53 18.696-.382-.924" /><path d="m20.772 13.852.924-.383" /><path d="m20.772 16.148.924.383" /><circle cx="18" cy="15" r="3" /><circle cx="9" cy="7" r="4" /></svg><span class="max-w-52 text-wrap">Profile</span></DropdownMenuLinkItem>
			<DropdownMenuLinkItem href="/settings/account" current={active === '/settings/account'} class={active === '/settings/account' ? 'bg-secondary' : ''}><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-wrench" aria-hidden="true"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.106-3.105c.32-.322.863-.22.983.218a6 6 0 0 1-8.259 7.057l-7.91 7.91a1 1 0 0 1-2.999-3l7.91-7.91a6 6 0 0 1 7.057-8.259c.438.12.54.662.219.984z" /></svg><span class="max-w-52 text-wrap">Account</span></DropdownMenuLinkItem>
			<DropdownMenuLinkItem href="/settings/appearance" current={active === '/settings/appearance'} class={active === '/settings/appearance' ? 'bg-secondary' : ''}><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-palette" aria-hidden="true"><path d="M12 22a1 1 0 0 1 0-20 10 9 0 0 1 10 9 5 5 0 0 1-5 5h-2.25a1.75 1.75 0 0 0-1.4 2.8l.3.4a1.75 1.75 0 0 1-1.4 2.8z" /><circle cx="13.5" cy="6.5" r=".5" fill="currentColor" /><circle cx="17.5" cy="10.5" r=".5" fill="currentColor" /><circle cx="6.5" cy="12.5" r=".5" fill="currentColor" /><circle cx="8.5" cy="7.5" r=".5" fill="currentColor" /></svg><span class="max-w-52 text-wrap">Appearance</span></DropdownMenuLinkItem>
			<DropdownMenuLinkItem href="/settings/notifications" current={active === '/settings/notifications'} class={active === '/settings/notifications' ? 'bg-secondary' : ''}><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-bell" aria-hidden="true"><path d="M10.268 21a2 2 0 0 0 3.464 0" /><path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326" /></svg><span class="max-w-52 text-wrap">Notifications</span></DropdownMenuLinkItem>
			<DropdownMenuLinkItem href="/settings/display" current={active === '/settings/display'} class={active === '/settings/display' ? 'bg-secondary' : ''}><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-monitor" aria-hidden="true"><rect width="20" height="14" x="2" y="3" rx="2" /><line x1="8" x2="16" y1="21" y2="21" /><line x1="12" x2="12" y1="17" y2="21" /></svg><span class="max-w-52 text-wrap">Display</span></DropdownMenuLinkItem>
		</DropdownMenuContent>

		<Toaster toasts={toasts} />
	</div>
}
