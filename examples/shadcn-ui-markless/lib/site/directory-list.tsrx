import { computed, element, state } from '@markless/core';
import { closeRendered, openRendered } from '../parts/base-ui/dialog.ts';
import { hideRendered, showRendered } from '../parts/base-ui/tooltip.ts';
import { COMMANDS, MANAGERS, loadView, readAddress, storeManager, storedManager, writePage, writeQuery, type Manager } from './directory.ts';

// components/directory-list.tsx with directory-search.tsx and directory-add-button.tsx: the registry directory's search
// (?q=, the address following 250 ms after typing stops), its count and Clear, ten registries a page (?page=) and the
// Add dialog (a drawer under 768 px) with its package manager tabs and Copy. The registries load at idle, so typing
// never waits for them; each logo is its own file, drawn through <use> so the page's colours still reach it.
export default function DirectoryList() @{
	let query = state('');
	let page = state(1);
	let health = state<{ readonly payload: unknown; readonly at: number } | undefined>(undefined);
	let adding = state('');
	let manager = state<Manager>('pnpm');
	let copied = state(false);
	const view = computed(async () => {
		const q = query;
		const p = page;
		const h = health;
		return loadView('/docs/directory', q, p, h);
	});
	const counted = computed(async () => {
		const q = query;
		const h = health;
		const v = await loadView('/docs/directory', q, 1, h);
		return { text: `${v.count} ${v.countLabel}` };
	});
	const tabsView = computed(() => MANAGERS.map((m) => ({ manager: m, active: m === manager, id: `directory-add-tab-${m}` })));
	const managerIndex = computed(() => String(MANAGERS.indexOf(manager)));
	const activeTabId = computed(() => `directory-add-tab-${manager}`);
	const command = computed(() => (adding ? COMMANDS(adding)[manager] : ''));
	const dialog = element<HTMLElement>();
	const drawer = element<HTMLElement>();
	const tipPortal = element<HTMLElement>();
	const choose = (m: Manager) => {
		manager = m;
		storeManager(m);
	};
	const roveTabs = (event: KeyboardEvent, list: HTMLElement) => {
		const tabs = [...list.querySelectorAll<HTMLElement>('[role="tab"]')];
		const at = tabs.indexOf(document.activeElement as HTMLElement);
		const to = event.key === 'ArrowRight' ? (at + 1) % tabs.length : event.key === 'ArrowLeft' ? (at - 1 + tabs.length) % tabs.length : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : -1;
		if (to < 0 || at < 0) return;
		event.preventDefault();
		for (const [i, tab] of tabs.entries()) tab.tabIndex = i === to ? 0 : -1;
		tabs[to]!.focus();
	};
	const copy = (button: HTMLElement) => {
		void navigator.clipboard?.writeText(command).catch(() => {});
		copied = true;
		hideRendered(button);
		setTimeout(() => (copied = false), 2000);
	};
	const tip = (button: HTMLElement, on: boolean, portal: HTMLElement | undefined) => {
		if (!portal) return;
		if (on) showRendered(button, portal);
		else hideRendered(button);
	};
	const add = (trigger: HTMLElement, name: string, desktop: HTMLElement | undefined, mobile: HTMLElement | undefined) => {
		adding = name;
		manager = storedManager();
		const portal = matchMedia('(max-width: 767px)').matches ? mobile : desktop;
		if (portal) openRendered(trigger, portal);
	};
	const go = (event: MouseEvent, to: number, disabled: boolean) => {
		if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
		event.preventDefault();
		if (disabled || to === page) return;
		page = to;
		writePage(query, to);
	};
	const fromAddress = () => {
		const at = readAddress();
		query = at.query;
		page = at.page;
	};

	<div
		data-not-typeset="true"
		class="mt-6"
		onIdle={async () => {
			fromAddress();
			addEventListener('popstate', () => fromAddress());
			manager = storedManager();
			await import('./directory-data.ts');
			const response = await fetch('/r/registries.json', { signal: AbortSignal.timeout(5000) }).catch(() => undefined);
			if (response?.ok) health = { payload: await response.json(), at: Date.now() };
		}}
	>
		<div role="group" data-slot="field" data-orientation="vertical" class="group/field flex w-full gap-2 data-[invalid=true]:text-destructive flex-col *:w-full [&>.sr-only]:w-auto">
			<div data-slot="input-group" role="group" class="group/input-group relative flex h-8 w-full min-w-0 items-center rounded-lg border border-input transition-colors outline-none in-data-[slot=combobox-content]:focus-within:border-inherit in-data-[slot=combobox-content]:focus-within:ring-0 has-disabled:bg-input/50 has-disabled:opacity-50 has-[[data-slot=input-group-control]:focus-visible]:border-ring has-[[data-slot=input-group-control]:focus-visible]:ring-3 has-[[data-slot=input-group-control]:focus-visible]:ring-ring/50 has-[[data-slot][aria-invalid=true]]:border-destructive has-[[data-slot][aria-invalid=true]]:ring-3 has-[[data-slot][aria-invalid=true]]:ring-destructive/20 has-[>[data-align=block-end]]:h-auto has-[>[data-align=block-end]]:flex-col has-[>[data-align=block-start]]:h-auto has-[>[data-align=block-start]]:flex-col has-[>textarea]:h-auto dark:bg-input/30 dark:has-disabled:bg-input/80 dark:has-[[data-slot][aria-invalid=true]]:ring-destructive/40 has-[>[data-align=block-end]]:[&>input]:pt-3 has-[>[data-align=block-start]]:[&>input]:pb-3 has-[>[data-align=inline-end]]:[&>input]:pr-1.5 has-[>[data-align=inline-start]]:[&>input]:pl-1.5">
				<div role="group" data-slot="input-group-addon" data-align="inline-start" class="flex h-auto cursor-text items-center justify-center gap-2 py-1.5 text-sm font-medium text-muted-foreground select-none group-data-[disabled=true]/input-group:opacity-50 [&>kbd]:rounded-[calc(var(--radius)-5px)] [&>svg:not([class*='size-'])]:size-4 order-first pl-2 has-[>button]:ml-[-0.3rem] has-[>kbd]:ml-[-0.15rem]"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-search"><circle cx="11" cy="11" r="8"></circle><path d="m21 21-4.3-4.3"></path></svg></div>
				<input
					data-slot="input-group-control"
					placeholder="Search"
					class="w-full min-w-0 border-input px-2.5 py-1 text-base transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 md:text-sm dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 flex-1 rounded-none border-0 bg-transparent shadow-none ring-0 focus-visible:ring-0 disabled:bg-transparent aria-invalid:ring-0 dark:bg-transparent dark:disabled:bg-transparent h-full"
					value={query}
					onInput={(event) => {
						const value = (event.target as HTMLInputElement).value;
						query = value;
						page = 1;
						writeQuery(value);
					}}
				/>
				<div role="group" data-slot="input-group-addon" data-align="inline-end" class="flex h-auto cursor-text items-center justify-center gap-2 py-1.5 text-sm font-medium text-muted-foreground select-none group-data-[disabled=true]/input-group:opacity-50 [&>kbd]:rounded-[calc(var(--radius)-5px)] [&>svg:not([class*='size-'])]:size-4 order-last pr-2 has-[>button]:mr-[-0.3rem] has-[>kbd]:mr-[-0.15rem]">
					@try {
						<span class="text-muted-foreground tabular-nums sm:text-xs">{counted.text}</span>
					} @catch {
					}
				</div>
				<div role="group" data-slot="input-group-addon" data-align="inline-end" class="flex h-auto cursor-text items-center justify-center gap-2 py-1.5 text-sm font-medium text-muted-foreground select-none group-data-[disabled=true]/input-group:opacity-50 [&>kbd]:rounded-[calc(var(--radius)-5px)] [&>svg:not([class*='size-'])]:size-4 order-last pr-2 has-[>button]:mr-[-0.3rem] has-[>kbd]:mr-[-0.15rem] data-[disabled=true]:hidden" data-disabled={query.length ? 'false' : 'true'}>
					<button
						type="button"
						tabindex="0"
						data-slot="button"
						data-size="icon-xs"
						aria-label="Clear"
						title="Clear"
						class="group/button shrink-0 justify-center border border-transparent bg-clip-padding font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:hover:bg-muted/50 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 flex items-center gap-2 text-sm shadow-none size-6 rounded-[calc(var(--radius)-3px)] p-0 has-[>svg]:p-0"
						onClick={() => {
							query = '';
							page = 1;
							writeQuery('');
						}}
					>
						<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-x"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg>
					</button>
				</div>
			</div>
		</div>
		@try {
			<>
			<div role="list" data-slot="item-group" class="group/item-group flex w-full flex-col gap-4 has-data-[size=sm]:gap-2.5 has-data-[size=xs]:gap-2 my-8">
				@for (const row of view.rows; key row.name) {
					<>
					<div data-slot="item" data-variant="default" data-size="default" class="group/item flex w-full flex-wrap items-center rounded-lg border text-sm transition-colors duration-100 outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 [a]:transition-colors [a]:hover:bg-muted border-transparent py-2.5 group/item relative gap-6 px-0">
						<div data-slot="item-media" data-variant="image" class="flex shrink-0 items-center justify-center gap-2 group-has-data-[slot=item-description]/item:translate-y-0.5 group-has-data-[slot=item-description]/item:self-start [&_svg]:pointer-events-none size-10 overflow-hidden rounded-sm group-data-[size=sm]/item:size-8 group-data-[size=xs]/item:size-6 [&_img]:size-full [&_img]:object-cover grayscale *:[svg]:size-8 *:[svg]:fill-foreground">
							<svg xmlns="http://www.w3.org/2000/svg" viewBox={row.viewBox} hidden={row.noLogo}>
								<use href={row.logo} />
							</svg>
						</div>
						<div data-slot="item-content" class="flex flex-1 flex-col gap-1 group-data-[size=xs]/item:gap-0 [&+[data-slot=item-content]]:flex-none">
							<div data-slot="item-title" class="line-clamp-1 flex w-fit items-center gap-2 text-sm leading-snug font-medium underline-offset-4">
								<a href={row.href} target="_blank" rel="noopener noreferrer external" class="group flex items-center gap-1">
									{row.name} <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="tabler-icon tabler-icon-arrow-up-right size-4 opacity-0 group-hover:opacity-100"><path d="M17 7l-10 10"></path><path d="M8 7l9 0l0 9"></path></svg>
								</a>
							</div>
							<p data-slot="item-description" class="line-clamp-2 text-left text-sm leading-normal font-normal text-muted-foreground group-data-[size=xs]/item:text-xs [&>a]:underline [&>a]:underline-offset-4 [&>a:hover]:text-primary text-pretty">{row.description}</p>
						</div>
						<div data-slot="item-actions" class="items-center gap-2 relative z-10 hidden self-start sm:flex">
							<button type="button" tabindex="0" data-slot="button" class="group/button inline-flex shrink-0 items-center justify-center border bg-clip-padding font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 border-border bg-background hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50 h-7 gap-1 rounded-[min(var(--radius-md),12px)] px-2.5 text-[0.8rem] in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5 relative z-10" onClick={(event) => {
								const trigger = (event.target as Element).closest('button')!;
								const desktop = dialog;
								const mobile = drawer;
								add(trigger, row.name, desktop, mobile);
							}}>
								Add <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="tabler-icon tabler-icon-plus "><path d="M12 5l0 14"></path><path d="M5 12l14 0"></path></svg>
							</button>
						</div>
						<div data-slot="item-footer" class="flex basis-full items-center gap-2 justify-start pl-16 sm:hidden [&_button]:min-h-11">
							<button type="button" tabindex="0" data-slot="button" class="group/button inline-flex shrink-0 items-center justify-center border bg-clip-padding font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 border-border bg-background hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50 h-7 gap-1 rounded-[min(var(--radius-md),12px)] px-2.5 text-[0.8rem] in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5">
								View <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="tabler-icon tabler-icon-arrow-up-right "><path d="M17 7l-10 10"></path><path d="M8 7l9 0l0 9"></path></svg>
							</button>
							<button type="button" tabindex="0" data-slot="button" class="group/button inline-flex shrink-0 items-center justify-center border bg-clip-padding font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 border-border bg-background hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50 h-7 gap-1 rounded-[min(var(--radius-md),12px)] px-2.5 text-[0.8rem] in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5 relative z-10" onClick={(event) => {
								const trigger = (event.target as Element).closest('button')!;
								const desktop = dialog;
								const mobile = drawer;
								add(trigger, row.name, desktop, mobile);
							}}>
								Add <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="tabler-icon tabler-icon-plus "><path d="M12 5l0 14"></path><path d="M5 12l14 0"></path></svg>
							</button>
						</div>
					</div>
					<div data-orientation="horizontal" role="separator" aria-orientation="horizontal" data-slot="item-separator" class="shrink-0 bg-border data-horizontal:h-px data-horizontal:w-full data-vertical:w-px data-vertical:self-stretch my-1" hidden={row.last}></div>
					</>
				}
			</div>
			<nav role="navigation" aria-label="pagination" data-slot="pagination" class="mx-auto flex w-full justify-center" hidden={view.navHidden}>
				<ul data-slot="pagination-content" class="flex items-center gap-0.5">
					<li data-slot="pagination-item">
						<a
							data-slot="pagination-link"
							class={view.previous.class}
							aria-label="Go to previous page"
							href={view.previous.href}
							aria-disabled={view.previous.disabled}
							tabindex={view.previous.tabindex}
							onClick={(event) => { const disabled = (event.target as Element).closest('a')?.getAttribute('aria-disabled') === 'true'; go(event, page - 1, disabled); }}
						>
							<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="tabler-icon tabler-icon-chevron-left cn-rtl-flip size-4"><path d="M15 6l-6 6l6 6"></path></svg>
							<span class="hidden sm:block">Previous</span>
						</a>
					</li>
					@for (const link of view.links; key link.key) {
						<li data-slot="pagination-item">
							<span hidden={link.number} aria-hidden="true" data-slot="pagination-ellipsis" class="flex size-8 items-center justify-center [&_svg:not([class*='size-'])]:size-4"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-ellipsis"><circle cx="12" cy="12" r="1"></circle><circle cx="19" cy="12" r="1"></circle><circle cx="5" cy="12" r="1"></circle></svg><span class="sr-only">More pages</span></span>
							<a hidden={link.ellipsis} aria-current={link.current} data-slot="pagination-link" data-active={link.active} class={link.class} href={link.href} onClick={(event) => go(event, link.page, false)}>
								{link.page}
							</a>
						</li>
					}
					<li data-slot="pagination-item">
						<a
							data-slot="pagination-link"
							class={view.next.class}
							aria-label="Go to next page"
							href={view.next.href}
							aria-disabled={view.next.disabled}
							tabindex={view.next.tabindex}
							onClick={(event) => { const disabled = (event.target as Element).closest('a')?.getAttribute('aria-disabled') === 'true'; go(event, page + 1, disabled); }}
						>
							<span class="hidden sm:block">Next</span>
							<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="tabler-icon tabler-icon-chevron-right cn-rtl-flip size-4"><path d="M9 6l6 6l-6 6"></path></svg>
						</a>
					</li>
				</ul>
			</nav>
			</>
		} @catch {
		}
		<div id="directory-add-dialog" data-base-ui-portal="" data-slot="dialog-portal" hidden el={dialog}>
			<div role="presentation" data-base-ui-inert="" aria-hidden="true" style="position: fixed; inset: 0px; user-select: none;"></div>
			<div data-open="" role="presentation" data-slot="dialog-overlay" class="fixed inset-0 isolate z-50 bg-black/10 duration-100 supports-backdrop-filter:backdrop-blur-xs data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" aria-hidden="true" data-base-ui-inert="" style="user-select: none;"></div>
			<span data-type="inside" aria-hidden="true" tabindex="0" data-base-ui-focus-guard="" data-base-ui-inert="" style="clip-path: inset(50%); overflow: hidden; white-space: nowrap; border: 0px; padding: 0px; width: 1px; height: 1px; margin: -1px; position: fixed; top: 0px; left: 0px;"></span>
			<div data-open="" role="dialog" tabindex="-1" data-base-ui-focusable="" data-slot="dialog-content" class="fixed top-1/2 left-1/2 z-50 grid w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-4 rounded-xl bg-popover p-4 text-sm text-popover-foreground ring-1 ring-foreground/10 duration-100 outline-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 animate-none! sm:max-w-md" aria-labelledby="directory-add-dialog-title" aria-describedby="directory-add-dialog-description" style="--nested-dialogs: 0;">
				<div data-slot="dialog-header" class="flex flex-col gap-2">
					<h2 id="directory-add-dialog-title" data-slot="dialog-title" class="cn-font-heading text-base leading-none font-medium">Add Registry</h2>
					<p id="directory-add-dialog-description" data-slot="dialog-description" class="text-sm text-muted-foreground *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground">Run this command to add {adding} to your project.</p>
				</div>
				<div data-orientation="horizontal" data-activation-direction="none" data-slot="tabs" class="group/tabs flex data-horizontal:flex-col gap-0 overflow-hidden rounded-xl border">
						<div class="flex items-center gap-2 border-b p-1.5">
							<div data-orientation="horizontal" data-activation-direction="none" role="tablist" data-slot="tabs-list" data-variant="default" class="group/tabs-list inline-flex w-fit items-center justify-center rounded-lg p-[3px] text-muted-foreground group-data-horizontal/tabs:h-8 group-data-vertical/tabs:h-fit group-data-vertical/tabs:flex-col data-[variant=line]:rounded-none bg-muted h-auto *:data-[slot=tabs-trigger]:pt-0" onKeyDown={(event) => roveTabs(event, (event.target as Element).closest<HTMLElement>('[role="tablist"]')!)}>
								@for (const tab of tabsView; key tab.manager) {
									<button type="button" data-active={tab.active ? '' : undefined} data-orientation="horizontal" data-activation-direction="none" aria-disabled="false" tabindex={tab.active ? '0' : '-1'} role="tab" aria-selected={tab.active ? 'true' : 'false'} id={tab.id} data-composite-item-active={tab.active ? '' : undefined} data-slot="tabs-trigger" class="relative inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-1.5 py-0.5 text-sm font-medium whitespace-nowrap text-foreground/60 transition-all group-data-vertical/tabs:w-full group-data-vertical/tabs:justify-start hover:text-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 has-data-[icon=inline-end]:pr-1 has-data-[icon=inline-start]:pl-1 aria-disabled:pointer-events-none aria-disabled:opacity-50 dark:text-muted-foreground dark:hover:text-foreground group-data-[variant=default]/tabs-list:data-active:shadow-sm group-data-[variant=line]/tabs-list:data-active:shadow-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 group-data-[variant=line]/tabs-list:bg-transparent group-data-[variant=line]/tabs-list:data-active:bg-transparent dark:group-data-[variant=line]/tabs-list:data-active:border-transparent dark:group-data-[variant=line]/tabs-list:data-active:bg-transparent data-active:bg-background data-active:text-foreground dark:data-active:border-input dark:data-active:bg-input/30 dark:data-active:text-foreground after:absolute after:bg-foreground after:opacity-0 after:transition-opacity group-data-horizontal/tabs:after:inset-x-0 group-data-horizontal/tabs:after:bottom-[-5px] group-data-horizontal/tabs:after:h-0.5 group-data-vertical/tabs:after:inset-y-0 group-data-vertical/tabs:after:-right-1 group-data-vertical/tabs:after:w-0.5 group-data-[variant=line]/tabs-list:data-active:after:opacity-100" aria-controls={tab.active ? 'd-directory-add-panel' : undefined} onClick={() => choose(tab.manager)}>{tab.manager}</button>
								}
							</div>
							<button type="button" tabindex="0" data-slot="tooltip-trigger" id="d-directory-add-copy" data-base-ui-tooltip-trigger="" class="group/button inline-flex shrink-0 items-center justify-center border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:hover:bg-muted/50 size-7 rounded-[min(var(--radius-md),12px)] in-data-[slot=button-group]:rounded-lg ml-auto" onClick={(event) => { const button = (event.target as Element).closest('button')!; copy(button); }} onPointerEnter={(event) => { const button = (event.target as Element).closest('button')!; const portal = tipPortal; tip(button, true, portal); }} onPointerLeave={(event) => { const button = (event.target as Element).closest('button')!; const portal = tipPortal; tip(button, false, portal); }} onFocus={(event) => { const button = (event.target as Element).closest('button')!; const visible = button.matches(':focus-visible'); const portal = tipPortal; if (visible) tip(button, true, portal); }} onBlur={(event) => { const button = (event.target as Element).closest('button')!; const portal = tipPortal; tip(button, false, portal); }}>
								@if (copied) {
									<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="tabler-icon tabler-icon-check "><path d="M5 12l5 5l10 -10"></path></svg>
								} @else {
									<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="tabler-icon tabler-icon-copy "><path d="M7 7m0 2.667a2.667 2.667 0 0 1 2.667 -2.667h8.666a2.667 2.667 0 0 1 2.667 2.667v8.666a2.667 2.667 0 0 1 -2.667 2.667h-8.666a2.667 2.667 0 0 1 -2.667 -2.667z"></path><path d="M4.012 16.737a2.005 2.005 0 0 1 -1.012 -1.737v-10c0 -1.1 .9 -2 2 -2h10c.75 0 1.158 .385 1.5 1"></path></svg>
								}
								<span class="sr-only">Copy command</span>
							</button>
						</div>
						<div data-orientation="horizontal" data-activation-direction="none" id="d-directory-add-panel" role="tabpanel" tabindex="0" data-index={managerIndex} data-slot="tabs-content" class="flex-1 text-sm outline-none mt-0" aria-labelledby={activeTabId}>
							<div class="bg-surface px-3 py-3 text-surface-foreground">
								<div class="no-scrollbar overflow-x-auto">
									<code class="font-mono text-sm whitespace-nowrap">{command}</code>
								</div>
							</div>
						</div>
					</div>
				<div data-slot="dialog-footer" class="-mx-4 -mb-4 flex flex-col-reverse gap-2 rounded-b-xl border-t bg-muted/50 p-4 sm:flex-row sm:justify-end">
					<button type="button" tabindex="0" data-slot="dialog-close" class="group/button inline-flex shrink-0 items-center justify-center border bg-clip-padding font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 border-border bg-background hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50 h-7 gap-1 rounded-[min(var(--radius-md),12px)] px-2.5 text-[0.8rem] in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5" onClick={() => {
						const desktop = dialog;
						const mobile = drawer;
						if (desktop) closeRendered(desktop);
						if (mobile) closeRendered(mobile);
					}}>Done</button>
				</div>
				<button type="button" tabindex="0" data-slot="dialog-close" class="group/button inline-flex shrink-0 items-center justify-center border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:hover:bg-muted/50 size-7 rounded-[min(var(--radius-md),12px)] in-data-[slot=button-group]:rounded-lg absolute top-2 right-2" onClick={() => {
						const desktop = dialog;
						const mobile = drawer;
						if (desktop) closeRendered(desktop);
						if (mobile) closeRendered(mobile);
					}}>
					<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-x"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg>
					<span class="sr-only">Close</span>
				</button>
			</div>
			<span data-type="inside" aria-hidden="true" tabindex="0" data-base-ui-focus-guard="" data-base-ui-inert="" style="clip-path: inset(50%); overflow: hidden; white-space: nowrap; border: 0px; padding: 0px; width: 1px; height: 1px; margin: -1px; position: fixed; top: 0px; left: 0px;"></span>
		</div>
		<div id="directory-add-drawer" data-base-ui-portal="" data-slot="drawer-portal" hidden el={drawer}>
			<div role="presentation" data-base-ui-inert="" aria-hidden="true" style="position: fixed; inset: 0px; user-select: none;"></div>
			<div data-open="" role="presentation" data-slot="drawer-overlay" class="fixed inset-0 z-50 min-h-dvh bg-black/10 opacity-[max(var(--drawer-overlay-min-opacity,0),calc(1-var(--drawer-swipe-progress)))] transition-opacity duration-450 ease-[cubic-bezier(0.32,0.72,0,1)] select-none data-ending-style:pointer-events-none data-ending-style:opacity-0 data-ending-style:duration-[calc(var(--drawer-swipe-strength)*400ms)] data-snap-points:[--drawer-overlay-min-opacity:0.5] data-starting-style:opacity-0 data-swiping:duration-0 supports-backdrop-filter:backdrop-blur-xs supports-[-webkit-touch-callout:none]:absolute" aria-hidden="true" data-base-ui-inert="" style="user-select: none; --drawer-swipe-progress: 0; --drawer-swipe-strength: 1;"></div>
			<div data-open="" role="presentation" data-slot="drawer-viewport" data-modal="true" class="pointer-events-none fixed inset-0 z-50 select-none data-[modal=true]:pointer-events-auto">
				<span data-type="inside" aria-hidden="true" tabindex="0" data-base-ui-focus-guard="" data-base-ui-inert="" style="clip-path: inset(50%); overflow: hidden; white-space: nowrap; border: 0px; padding: 0px; width: 1px; height: 1px; margin: -1px; position: fixed; top: 0px; left: 0px;"></span>
				<div data-open="" data-swipe-direction="down" role="dialog" tabindex="-1" data-base-ui-focusable="" data-slot="drawer-popup" data-swipe-axis="y" class="group/drawer-popup pointer-events-auto fixed z-50 m-(--drawer-inset,0px) flex h-(--drawer-content-height) max-h-(--drawer-content-max-height,none) min-h-0 w-(--drawer-content-width,auto) transform-[translate3d(var(--translate-x,0px),var(--translate-y,0px),0)_scale(var(--stack-scale))] flex-col bg-popover text-sm text-popover-foreground transition-[transform,height,opacity,filter] duration-450 ease-[cubic-bezier(0.22,1,0.36,1)] will-change-transform outline-none select-none [interpolate-size:allow-keywords] data-[swipe-direction=down]:rounded-t-xl data-[swipe-direction=down]:border-t data-[swipe-direction=left]:rounded-r-xl data-[swipe-direction=left]:border-r data-[swipe-direction=right]:rounded-l-xl data-[swipe-direction=right]:border-l data-[swipe-direction=up]:rounded-b-xl data-[swipe-direction=up]:border-b data-nested-drawer-open:overflow-hidden data-nested-drawer-open:brightness-95 after:pointer-events-none after:absolute after:bg-(--drawer-bleed-background,var(--color-popover)) data-[swipe-axis=x]:after:inset-y-0 data-[swipe-axis=x]:after:w-(--bleed) data-[swipe-axis=y]:after:inset-x-0 data-[swipe-axis=y]:after:h-(--bleed) data-[swipe-direction=down]:after:top-full data-[swipe-direction=left]:after:right-full data-[swipe-direction=right]:after:left-full data-[swipe-direction=up]:after:bottom-full [--drawer-content-height:var(--drawer-height,auto)] data-[swipe-axis=x]:[--drawer-content-width:75%] data-[swipe-axis=y]:[--drawer-content-max-height:calc(100dvh-6rem)] data-[swipe-axis=y]:data-snap-points:[--drawer-content-height:100dvh] data-[swipe-axis=x]:sm:[--drawer-content-width:24rem] [--bleed:3rem] [--peek:1rem] [--stack-height:var(--drawer-frontmost-height,var(--drawer-height,0px))] [--stack-peek-offset:max(0px,calc((var(--nested-drawers)-var(--stack-progress))*var(--peek)))] [--stack-progress:clamp(0,var(--drawer-swipe-progress),1)] [--stack-scale-base:max(0,calc(1-(var(--nested-drawers)*var(--stack-step))))] [--stack-scale:clamp(0,calc(var(--stack-scale-base)+(var(--stack-step)*var(--stack-progress))),1)] [--stack-shrink:calc(1-var(--stack-scale))] [--stack-step:0.05] data-ending-style:transform-(--closed-transform) data-ending-style:opacity-[0.9999] data-ending-style:duration-[calc(var(--drawer-swipe-strength)*400ms)] data-nested-drawer-swiping:duration-0 data-ending-style:data-nested-drawer-swiping:duration-[calc(var(--drawer-swipe-strength)*400ms)] data-starting-style:transform-(--closed-transform) data-swiping:duration-0 data-ending-style:data-swiping:duration-[calc(var(--drawer-swipe-strength)*400ms)] data-[swipe-axis=y]:inset-x-0 data-[swipe-axis=y]:data-nested-drawer-open:h-(--stack-height) data-[swipe-axis=x]:inset-y-0 data-[swipe-axis=x]:flex-row data-[swipe-direction=down]:bottom-0 data-[swipe-direction=down]:origin-bottom data-[swipe-direction=down]:[--closed-transform:translate3d(0,calc(100%+var(--drawer-inset,0px)+2px),0)] data-[swipe-direction=down]:[--translate-y:calc(var(--drawer-snap-point-offset,0px)+var(--drawer-swipe-movement-y)-var(--stack-peek-offset)-(var(--stack-shrink)*var(--stack-height)))] data-[swipe-direction=up]:top-0 data-[swipe-direction=up]:origin-top data-[swipe-direction=up]:[--closed-transform:translate3d(0,calc(-100%-var(--drawer-inset,0px)-2px),0)] data-[swipe-direction=up]:[--translate-y:calc(var(--drawer-snap-point-offset,0px)+var(--drawer-swipe-movement-y)+var(--stack-peek-offset)+(var(--stack-shrink)*var(--stack-height)))] data-[swipe-direction=left]:left-0 data-[swipe-direction=left]:origin-left data-[swipe-direction=left]:[--closed-transform:translate3d(calc(-100%-var(--drawer-inset,0px)-2px),0,0)] data-[swipe-direction=left]:[--translate-x:calc(var(--drawer-swipe-movement-x)+var(--stack-peek-offset)+(var(--stack-shrink)*100%))] data-[swipe-direction=right]:right-0 data-[swipe-direction=right]:origin-right data-[swipe-direction=right]:[--closed-transform:translate3d(calc(100%+var(--drawer-inset,0px)+2px),0,0)] data-[swipe-direction=right]:[--translate-x:calc(var(--drawer-swipe-movement-x)-var(--stack-peek-offset)-(var(--stack-shrink)*100%))]" aria-labelledby="directory-add-drawer-title" aria-describedby="directory-add-drawer-description" style="--drawer-swipe-movement-x: 0px; --drawer-swipe-movement-y: 0px; --drawer-swipe-progress: 0; --nested-drawers: 0; --drawer-snap-point-offset: 0px; --drawer-swipe-strength: 1;">
					<div data-drawer-content="" data-slot="drawer-content" class="flex min-h-0 flex-1 flex-col overflow-hidden overscroll-contain rounded-[inherit] transition-opacity duration-300 ease-[cubic-bezier(0.45,1.005,0,1.005)] select-text group-data-nested-drawer-open/drawer-popup:opacity-0 group-data-nested-drawer-swiping/drawer-popup:opacity-100 group-data-swiping/drawer-popup:select-none">
						<div data-slot="drawer-header" class="flex shrink-0 flex-col gap-0.5 p-4 pb-0 group-data-[swipe-axis=y]/drawer-popup:text-center md:gap-0.5 md:text-left">
							<h2 id="directory-add-drawer-title" data-slot="drawer-title" class="cn-font-heading text-base font-medium text-foreground">Add Registry</h2>
							<p id="directory-add-drawer-description" data-slot="drawer-description" class="text-sm text-balance text-muted-foreground">Run this command to add {adding} to your project.</p>
						</div>
						<div class="px-4">
							<div data-orientation="horizontal" data-activation-direction="none" data-slot="tabs" class="group/tabs flex data-horizontal:flex-col gap-0 overflow-hidden rounded-xl border">
						<div class="flex items-center gap-2 border-b p-1.5">
							<div data-orientation="horizontal" data-activation-direction="none" role="tablist" data-slot="tabs-list" data-variant="default" class="group/tabs-list inline-flex w-fit items-center justify-center rounded-lg p-[3px] text-muted-foreground group-data-horizontal/tabs:h-8 group-data-vertical/tabs:h-fit group-data-vertical/tabs:flex-col data-[variant=line]:rounded-none bg-muted h-auto *:data-[slot=tabs-trigger]:pt-0" onKeyDown={(event) => roveTabs(event, (event.target as Element).closest<HTMLElement>('[role="tablist"]')!)}>
								@for (const tab of tabsView; key tab.manager) {
									<button type="button" data-active={tab.active ? '' : undefined} data-orientation="horizontal" data-activation-direction="none" aria-disabled="false" tabindex={tab.active ? '0' : '-1'} role="tab" aria-selected={tab.active ? 'true' : 'false'} id={tab.id} data-composite-item-active={tab.active ? '' : undefined} data-slot="tabs-trigger" class="relative inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-1.5 py-0.5 text-sm font-medium whitespace-nowrap text-foreground/60 transition-all group-data-vertical/tabs:w-full group-data-vertical/tabs:justify-start hover:text-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 has-data-[icon=inline-end]:pr-1 has-data-[icon=inline-start]:pl-1 aria-disabled:pointer-events-none aria-disabled:opacity-50 dark:text-muted-foreground dark:hover:text-foreground group-data-[variant=default]/tabs-list:data-active:shadow-sm group-data-[variant=line]/tabs-list:data-active:shadow-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 group-data-[variant=line]/tabs-list:bg-transparent group-data-[variant=line]/tabs-list:data-active:bg-transparent dark:group-data-[variant=line]/tabs-list:data-active:border-transparent dark:group-data-[variant=line]/tabs-list:data-active:bg-transparent data-active:bg-background data-active:text-foreground dark:data-active:border-input dark:data-active:bg-input/30 dark:data-active:text-foreground after:absolute after:bg-foreground after:opacity-0 after:transition-opacity group-data-horizontal/tabs:after:inset-x-0 group-data-horizontal/tabs:after:bottom-[-5px] group-data-horizontal/tabs:after:h-0.5 group-data-vertical/tabs:after:inset-y-0 group-data-vertical/tabs:after:-right-1 group-data-vertical/tabs:after:w-0.5 group-data-[variant=line]/tabs-list:data-active:after:opacity-100" aria-controls={tab.active ? 'm-directory-add-panel' : undefined} onClick={() => choose(tab.manager)}>{tab.manager}</button>
								}
							</div>
							<button type="button" tabindex="0" data-slot="tooltip-trigger" id="m-directory-add-copy" data-base-ui-tooltip-trigger="" class="group/button inline-flex shrink-0 items-center justify-center border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:hover:bg-muted/50 size-7 rounded-[min(var(--radius-md),12px)] in-data-[slot=button-group]:rounded-lg ml-auto" onClick={(event) => { const button = (event.target as Element).closest('button')!; copy(button); }} onPointerEnter={(event) => { const button = (event.target as Element).closest('button')!; const portal = tipPortal; tip(button, true, portal); }} onPointerLeave={(event) => { const button = (event.target as Element).closest('button')!; const portal = tipPortal; tip(button, false, portal); }} onFocus={(event) => { const button = (event.target as Element).closest('button')!; const visible = button.matches(':focus-visible'); const portal = tipPortal; if (visible) tip(button, true, portal); }} onBlur={(event) => { const button = (event.target as Element).closest('button')!; const portal = tipPortal; tip(button, false, portal); }}>
								@if (copied) {
									<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="tabler-icon tabler-icon-check "><path d="M5 12l5 5l10 -10"></path></svg>
								} @else {
									<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="tabler-icon tabler-icon-copy "><path d="M7 7m0 2.667a2.667 2.667 0 0 1 2.667 -2.667h8.666a2.667 2.667 0 0 1 2.667 2.667v8.666a2.667 2.667 0 0 1 -2.667 2.667h-8.666a2.667 2.667 0 0 1 -2.667 -2.667z"></path><path d="M4.012 16.737a2.005 2.005 0 0 1 -1.012 -1.737v-10c0 -1.1 .9 -2 2 -2h10c.75 0 1.158 .385 1.5 1"></path></svg>
								}
								<span class="sr-only">Copy command</span>
							</button>
						</div>
						<div data-orientation="horizontal" data-activation-direction="none" id="m-directory-add-panel" role="tabpanel" tabindex="0" data-index={managerIndex} data-slot="tabs-content" class="flex-1 text-sm outline-none mt-0" aria-labelledby={activeTabId}>
							<div class="bg-surface px-3 py-3 text-surface-foreground">
								<div class="no-scrollbar overflow-x-auto">
									<code class="font-mono text-sm whitespace-nowrap">{command}</code>
								</div>
							</div>
						</div>
					</div>
						</div>
						<div data-slot="drawer-footer" class="mt-auto flex shrink-0 flex-col gap-2 p-4 pt-0">
							<button type="button" tabindex="0" data-slot="drawer-close" class="group/button inline-flex shrink-0 items-center justify-center border border-transparent bg-clip-padding font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 bg-primary text-primary-foreground hover:bg-primary/80 h-7 gap-1 rounded-[min(var(--radius-md),12px)] px-2.5 text-[0.8rem] in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5" onClick={() => {
						const desktop = dialog;
						const mobile = drawer;
						if (desktop) closeRendered(desktop);
						if (mobile) closeRendered(mobile);
					}}>Done</button>
						</div>
					</div>
				</div>
				<span data-type="inside" aria-hidden="true" tabindex="0" data-base-ui-focus-guard="" data-base-ui-inert="" style="clip-path: inset(50%); overflow: hidden; white-space: nowrap; border: 0px; padding: 0px; width: 1px; height: 1px; margin: -1px; position: fixed; top: 0px; left: 0px;"></span>
			</div>
		</div>
		<div id="directory-add-tip" data-base-ui-portal="" hidden el={tipPortal}>
			<div data-side="top" data-align="center" role="presentation" class="isolate z-50" style="position: absolute; left: 0px; top: 0px;">
				<div data-side="top" data-align="center" tabindex="-1" data-base-ui-focusable="" data-slot="tooltip-content" class="z-50 inline-flex w-fit max-w-xs origin-(--transform-origin) items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-xs text-background has-data-[slot=kbd]:pr-1.5 data-[side=bottom]:slide-in-from-top-2 data-[side=inline-end]:slide-in-from-left-2 data-[side=inline-start]:slide-in-from-right-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 **:data-[slot=kbd]:relative **:data-[slot=kbd]:isolate **:data-[slot=kbd]:z-50 **:data-[slot=kbd]:rounded-sm data-[state=delayed-open]:animate-in data-[state=delayed-open]:fade-in-0 data-[state=delayed-open]:zoom-in-95 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95">
					{copied ? 'Copied!' : 'Copy command'}
					<div data-side="top" data-align="center" aria-hidden="true" class="z-50 size-2.5 translate-y-[calc(-50%-2px)] rotate-45 rounded-[2px] bg-foreground fill-foreground data-[side=bottom]:top-1 data-[side=inline-end]:top-1/2! data-[side=inline-end]:-left-1 data-[side=inline-end]:-translate-y-1/2 data-[side=inline-start]:top-1/2! data-[side=inline-start]:-right-1 data-[side=inline-start]:-translate-y-1/2 data-[side=left]:top-1/2! data-[side=left]:-right-1 data-[side=left]:-translate-y-1/2 data-[side=right]:top-1/2! data-[side=right]:-left-1 data-[side=right]:-translate-y-1/2 data-[side=top]:-bottom-2.5" style="position: absolute; left: 50%;"></div>
				</div>
			</div>
		</div>
	</div>
}
