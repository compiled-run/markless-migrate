// The settings layout (features/settings/index.tsx, content-section.tsx, sidebar-nav.tsx): heading, the section nav
// (links from md up, a Select below md) and the section's title, description and scrolling body.
import { computed } from '@markless/core';
import type { Children } from '@markless/core';
import { Shell } from '../layout/shell.tsrx';
import type { LayoutPrefs } from '../layout/prefs.ts';
import { DropdownMenuContent, DropdownMenuTrigger, SelectItem } from '../../lib/parity/radix-ui-react-dropdown-menu/menu.tsrx';

const BUTTON = "inline-flex items-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive hover:text-accent-foreground dark:hover:bg-accent/50 h-9 px-4 py-2 has-[>svg]:px-3";

export type SettingsLayoutProps = {
	readonly active: string;
	readonly prefs: LayoutPrefs;
	readonly title: string;
	readonly desc: string;
	readonly children?: Children;
};

export function SettingsLayout({ active, prefs, title, desc, children }: SettingsLayoutProps) @{
	const selected0 = computed(() => (active === '/settings' ? 'true' : 'false'));
	const selected1 = computed(() => (active === '/settings/account' ? 'true' : 'false'));
	const selected2 = computed(() => (active === '/settings/appearance' ? 'true' : 'false'));
	const selected3 = computed(() => (active === '/settings/notifications' ? 'true' : 'false'));
	const selected4 = computed(() => (active === '/settings/display' ? 'true' : 'false'));
	<Shell active={active} header="search" fixed={false} prefs={prefs}>
		<main data-layout="fixed" class="px-4 py-6 flex grow flex-col overflow-hidden @7xl/content:mx-auto @7xl/content:w-full @7xl/content:max-w-7xl">
			<div class="space-y-0.5">
				<h1 class="text-2xl font-bold tracking-tight md:text-3xl">Settings</h1>
				<p class="text-muted-foreground">Manage your account settings and set e-mail preferences.</p>
			</div>
			<div data-orientation="horizontal" role="none" data-slot="separator" class="shrink-0 bg-border data-[orientation=horizontal]:h-px data-[orientation=horizontal]:w-full data-[orientation=vertical]:w-px my-4 lg:my-6"></div>
			<div class="flex flex-1 flex-col space-y-2 overflow-hidden md:space-y-2 lg:flex-row lg:space-y-0 lg:space-x-12">
				<aside class="top-0 lg:sticky lg:w-1/5">
					<div class="p-1 md:hidden">
						<DropdownMenuTrigger menu="settings-nav" haspopup="listbox" slot="select-trigger" role="combobox" aria-autocomplete="none" dir="ltr" data-size="default" class="flex w-fit items-center justify-between gap-2 rounded-md border border-input bg-transparent px-3 py-2 text-sm whitespace-nowrap shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 data-placeholder:text-muted-foreground data-[size=default]:h-9 data-[size=sm]:h-8 *:data-[slot=select-value]:line-clamp-1 *:data-[slot=select-value]:flex *:data-[slot=select-value]:items-center *:data-[slot=select-value]:gap-2 dark:bg-input/30 dark:hover:bg-input/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground h-12 sm:w-48">
							<span data-slot="select-value" style="pointer-events: none;">
							@if (active === '/settings') {
								<div class="flex gap-x-4 px-2 py-1"><span class="scale-125"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-user-cog" aria-hidden="true"><path d="M10 15H6a4 4 0 0 0-4 4v2" /><path d="m14.305 16.53.923-.382" /><path d="m15.228 13.852-.923-.383" /><path d="m16.852 12.228-.383-.923" /><path d="m16.852 17.772-.383.924" /><path d="m19.148 12.228.383-.923" /><path d="m19.53 18.696-.382-.924" /><path d="m20.772 13.852.924-.383" /><path d="m20.772 16.148.924.383" /><circle cx="18" cy="15" r="3" /><circle cx="9" cy="7" r="4" /></svg></span><span class="text-md">Profile</span></div>
							}
							@if (active === '/settings/account') {
								<div class="flex gap-x-4 px-2 py-1"><span class="scale-125"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-wrench" aria-hidden="true"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.106-3.105c.32-.322.863-.22.983.218a6 6 0 0 1-8.259 7.057l-7.91 7.91a1 1 0 0 1-2.999-3l7.91-7.91a6 6 0 0 1 7.057-8.259c.438.12.54.662.219.984z" /></svg></span><span class="text-md">Account</span></div>
							}
							@if (active === '/settings/appearance') {
								<div class="flex gap-x-4 px-2 py-1"><span class="scale-125"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-palette" aria-hidden="true"><path d="M12 22a1 1 0 0 1 0-20 10 9 0 0 1 10 9 5 5 0 0 1-5 5h-2.25a1.75 1.75 0 0 0-1.4 2.8l.3.4a1.75 1.75 0 0 1-1.4 2.8z" /><circle cx="13.5" cy="6.5" r=".5" fill="currentColor" /><circle cx="17.5" cy="10.5" r=".5" fill="currentColor" /><circle cx="6.5" cy="12.5" r=".5" fill="currentColor" /><circle cx="8.5" cy="7.5" r=".5" fill="currentColor" /></svg></span><span class="text-md">Appearance</span></div>
							}
							@if (active === '/settings/notifications') {
								<div class="flex gap-x-4 px-2 py-1"><span class="scale-125"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-bell" aria-hidden="true"><path d="M10.268 21a2 2 0 0 0 3.464 0" /><path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326" /></svg></span><span class="text-md">Notifications</span></div>
							}
							@if (active === '/settings/display') {
								<div class="flex gap-x-4 px-2 py-1"><span class="scale-125"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-monitor" aria-hidden="true"><rect width="20" height="14" x="2" y="3" rx="2" /><line x1="8" x2="16" y1="21" y2="21" /><line x1="12" x2="12" y1="17" y2="21" /></svg></span><span class="text-md">Display</span></div>
							}
							</span>
							<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-chevron-down size-4 opacity-50" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
						</DropdownMenuTrigger>
					</div>
					<div dir="ltr" data-slot="scroll-area" class="relative hidden w-full min-w-40 bg-background px-1 py-2 md:block" style="position: relative; --radix-scroll-area-corner-width: 0px; --radix-scroll-area-corner-height: 0px;">
						<div data-radix-scroll-area-viewport="" data-slot="scroll-area-viewport" class="size-full rounded-[inherit] transition-[color,box-shadow] outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1 overflow-x-auto!" style="overflow: scroll hidden;">
							<div style="min-width: 100%; display: table;">
								<nav class="flex space-x-2 py-1 lg:flex-col lg:space-y-1 lg:space-x-0">
								<a href="/settings" class={BUTTON + (active === '/settings' ? ' bg-muted hover:bg-accent' : ' hover:bg-accent hover:underline') + ' justify-start' + (active === '/settings' || active.startsWith('/settings/') ? ' active' : '')} data-status={active === '/settings' || active.startsWith('/settings/') ? 'active' : undefined} aria-current={active === '/settings' || active.startsWith('/settings/') ? 'page' : undefined}>
									<span class="me-2"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-user-cog" aria-hidden="true"><path d="M10 15H6a4 4 0 0 0-4 4v2" /><path d="m14.305 16.53.923-.382" /><path d="m15.228 13.852-.923-.383" /><path d="m16.852 12.228-.383-.923" /><path d="m16.852 17.772-.383.924" /><path d="m19.148 12.228.383-.923" /><path d="m19.53 18.696-.382-.924" /><path d="m20.772 13.852.924-.383" /><path d="m20.772 16.148.924.383" /><circle cx="18" cy="15" r="3" /><circle cx="9" cy="7" r="4" /></svg></span>
									Profile
								</a>
								<a href="/settings/account" class={BUTTON + (active === '/settings/account' ? ' bg-muted hover:bg-accent' : ' hover:bg-accent hover:underline') + ' justify-start' + (active === '/settings/account' || active.startsWith('/settings/account/') ? ' active' : '')} data-status={active === '/settings/account' || active.startsWith('/settings/account/') ? 'active' : undefined} aria-current={active === '/settings/account' || active.startsWith('/settings/account/') ? 'page' : undefined}>
									<span class="me-2"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-wrench" aria-hidden="true"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.106-3.105c.32-.322.863-.22.983.218a6 6 0 0 1-8.259 7.057l-7.91 7.91a1 1 0 0 1-2.999-3l7.91-7.91a6 6 0 0 1 7.057-8.259c.438.12.54.662.219.984z" /></svg></span>
									Account
								</a>
								<a href="/settings/appearance" class={BUTTON + (active === '/settings/appearance' ? ' bg-muted hover:bg-accent' : ' hover:bg-accent hover:underline') + ' justify-start' + (active === '/settings/appearance' || active.startsWith('/settings/appearance/') ? ' active' : '')} data-status={active === '/settings/appearance' || active.startsWith('/settings/appearance/') ? 'active' : undefined} aria-current={active === '/settings/appearance' || active.startsWith('/settings/appearance/') ? 'page' : undefined}>
									<span class="me-2"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-palette" aria-hidden="true"><path d="M12 22a1 1 0 0 1 0-20 10 9 0 0 1 10 9 5 5 0 0 1-5 5h-2.25a1.75 1.75 0 0 0-1.4 2.8l.3.4a1.75 1.75 0 0 1-1.4 2.8z" /><circle cx="13.5" cy="6.5" r=".5" fill="currentColor" /><circle cx="17.5" cy="10.5" r=".5" fill="currentColor" /><circle cx="6.5" cy="12.5" r=".5" fill="currentColor" /><circle cx="8.5" cy="7.5" r=".5" fill="currentColor" /></svg></span>
									Appearance
								</a>
								<a href="/settings/notifications" class={BUTTON + (active === '/settings/notifications' ? ' bg-muted hover:bg-accent' : ' hover:bg-accent hover:underline') + ' justify-start' + (active === '/settings/notifications' || active.startsWith('/settings/notifications/') ? ' active' : '')} data-status={active === '/settings/notifications' || active.startsWith('/settings/notifications/') ? 'active' : undefined} aria-current={active === '/settings/notifications' || active.startsWith('/settings/notifications/') ? 'page' : undefined}>
									<span class="me-2"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-bell" aria-hidden="true"><path d="M10.268 21a2 2 0 0 0 3.464 0" /><path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326" /></svg></span>
									Notifications
								</a>
								<a href="/settings/display" class={BUTTON + (active === '/settings/display' ? ' bg-muted hover:bg-accent' : ' hover:bg-accent hover:underline') + ' justify-start' + (active === '/settings/display' || active.startsWith('/settings/display/') ? ' active' : '')} data-status={active === '/settings/display' || active.startsWith('/settings/display/') ? 'active' : undefined} aria-current={active === '/settings/display' || active.startsWith('/settings/display/') ? 'page' : undefined}>
									<span class="me-2"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-monitor" aria-hidden="true"><rect width="20" height="14" x="2" y="3" rx="2" /><line x1="8" x2="16" y1="21" y2="21" /><line x1="12" x2="12" y1="17" y2="21" /></svg></span>
									Display
								</a>
								</nav>
							</div>
						</div>
						<div data-orientation="horizontal" data-slot="scroll-area-scrollbar" class="flex touch-none p-px transition-colors select-none h-2.5 flex-col border-t border-t-transparent" style="position: absolute; bottom: 0px; left: 0px; right: var(--radix-scroll-area-corner-width);"></div>
					</div>
				</aside>
				<div class="flex w-full overflow-y-hidden p-1">
					<div class="flex flex-1 flex-col">
						<div class="flex-none">
							<h3 class="text-lg font-medium">{title}</h3>
							<p class="text-sm text-muted-foreground">{desc}</p>
						</div>
						<div data-orientation="horizontal" role="none" data-slot="separator" class="bg-border data-[orientation=horizontal]:h-px data-[orientation=horizontal]:w-full data-[orientation=vertical]:w-px my-4 flex-none"></div>
						<div class="faded-bottom h-full w-full overflow-y-auto scroll-smooth pe-4 pb-12">
							<div class="-mx-1 px-1.5 lg:max-w-xl">{children}</div>
						</div>
					</div>
				</div>
			</div>
		</main>
		<DropdownMenuContent menu="settings-nav" role="listbox" slot="select-content" side="bottom" align="start" sideOffset={0} class="relative z-50 max-h-(--radix-select-content-available-height) min-w-32 origin-(--radix-select-content-transform-origin) overflow-x-hidden overflow-y-auto rounded-md border bg-popover text-popover-foreground shadow-md data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1">
			<div data-radix-select-viewport="" role="presentation" class="p-1 h-(--radix-select-trigger-height) w-full min-w-(--radix-select-trigger-width) scroll-my-1" style="position: relative; flex: 1 1 0%; overflow: hidden auto;">
				<SelectItem menu="settings-nav" selected={selected0} onSelect={() => location.assign('/settings')}><div class="flex gap-x-4 px-2 py-1"><span class="scale-125"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-user-cog" aria-hidden="true"><path d="M10 15H6a4 4 0 0 0-4 4v2" /><path d="m14.305 16.53.923-.382" /><path d="m15.228 13.852-.923-.383" /><path d="m16.852 12.228-.383-.923" /><path d="m16.852 17.772-.383.924" /><path d="m19.148 12.228.383-.923" /><path d="m19.53 18.696-.382-.924" /><path d="m20.772 13.852.924-.383" /><path d="m20.772 16.148.924.383" /><circle cx="18" cy="15" r="3" /><circle cx="9" cy="7" r="4" /></svg></span><span class="text-md">Profile</span></div></SelectItem>
				<SelectItem menu="settings-nav" selected={selected1} onSelect={() => location.assign('/settings/account')}><div class="flex gap-x-4 px-2 py-1"><span class="scale-125"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-wrench" aria-hidden="true"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.106-3.105c.32-.322.863-.22.983.218a6 6 0 0 1-8.259 7.057l-7.91 7.91a1 1 0 0 1-2.999-3l7.91-7.91a6 6 0 0 1 7.057-8.259c.438.12.54.662.219.984z" /></svg></span><span class="text-md">Account</span></div></SelectItem>
				<SelectItem menu="settings-nav" selected={selected2} onSelect={() => location.assign('/settings/appearance')}><div class="flex gap-x-4 px-2 py-1"><span class="scale-125"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-palette" aria-hidden="true"><path d="M12 22a1 1 0 0 1 0-20 10 9 0 0 1 10 9 5 5 0 0 1-5 5h-2.25a1.75 1.75 0 0 0-1.4 2.8l.3.4a1.75 1.75 0 0 1-1.4 2.8z" /><circle cx="13.5" cy="6.5" r=".5" fill="currentColor" /><circle cx="17.5" cy="10.5" r=".5" fill="currentColor" /><circle cx="6.5" cy="12.5" r=".5" fill="currentColor" /><circle cx="8.5" cy="7.5" r=".5" fill="currentColor" /></svg></span><span class="text-md">Appearance</span></div></SelectItem>
				<SelectItem menu="settings-nav" selected={selected3} onSelect={() => location.assign('/settings/notifications')}><div class="flex gap-x-4 px-2 py-1"><span class="scale-125"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-bell" aria-hidden="true"><path d="M10.268 21a2 2 0 0 0 3.464 0" /><path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326" /></svg></span><span class="text-md">Notifications</span></div></SelectItem>
				<SelectItem menu="settings-nav" selected={selected4} onSelect={() => location.assign('/settings/display')}><div class="flex gap-x-4 px-2 py-1"><span class="scale-125"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-monitor" aria-hidden="true"><rect width="20" height="14" x="2" y="3" rx="2" /><line x1="8" x2="16" y1="21" y2="21" /><line x1="12" x2="12" y1="17" y2="21" /></svg></span><span class="text-md">Display</span></div></SelectItem>
			</div>
		</DropdownMenuContent>
	</Shell>
}
