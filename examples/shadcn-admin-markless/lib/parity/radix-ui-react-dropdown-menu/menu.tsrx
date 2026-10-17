// Parity port of @radix-ui/react-dropdown-menu (through shadcn/ui's dropdown-menu.tsx) for the ported routes:
// @markless/ui 0.4.0 has no menu family. Every menu on a page shares one page-scoped cell naming the open
// menu; contents are rendered once, where the page puts them, and shown or hidden (Markless 0.4.0 cannot
// rebuild a branch that holds bindings). What Radix does that the routes rely on: a modal menu hides the rest
// of the page from assistive technology, a pointer open focuses the menu and a keyboard open its first item,
// the arrow keys, Home and End move between items, Escape and a press outside close it and return focus to
// the trigger, and choosing an item runs its handler and closes it.
import { computed, element, shared, state } from '@markless/core';
import type { Children, PropsOf } from '@markless/core';
import { cn } from '../../utils.ts';
import { closeMenu, focusItem, moveFocus, openMenu, selectAndClose } from './behaviour.ts';

export const CONTENT_CLASS =
	'z-50 max-h-(--radix-dropdown-menu-content-available-height) min-w-32 origin-(--radix-dropdown-menu-content-transform-origin) overflow-x-hidden overflow-y-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95';
export const ITEM_CLASS =
	"relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50 data-inset:ps-8 data-[variant=destructive]:text-destructive data-[variant=destructive]:focus:bg-destructive/10 data-[variant=destructive]:focus:text-destructive dark:data-[variant=destructive]:focus:bg-destructive/20 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground data-[variant=destructive]:*:[svg]:text-destructive!";

export const menus = shared(
	() => {
		const cells = state({ open: '' });
		const triggers = element<HTMLButtonElement[]>();
		const contents = element<HTMLDivElement[]>();
		return { ...cells, triggers, contents };
	},
	{ scope: 'page' },
);

export type MenuSide = 'top' | 'right' | 'bottom' | 'left';
export type MenuAlign = 'start' | 'center' | 'end';

export type DropdownMenuTriggerProps = PropsOf<'button'> & {
	/** Names the menu this trigger opens; the content with the same `menu` is the one it shows. */
	readonly menu: string;
	readonly class?: string;
	readonly children?: Children;
};

export function DropdownMenuTrigger({ menu, class: klass, children, ...rest }: DropdownMenuTriggerProps) @{
	const m = menus();
	// The menu's name as a cell: a comparison with a prop on one side stops refreshing after resume.
	let name = state(menu);
	const triggerExpanded = computed(() => (m.open === name ? 'true' : 'false'));
	const triggerState = computed(() => (m.open === name ? 'open' : 'closed'));
	const triggerId = computed(() => `radix-menu-${name}-trigger`);
	const contentId = computed(() => `radix-menu-${name}-content`);

	<button
		{...rest}
		el={m.triggers}
		type="button"
		data-slot="dropdown-menu-trigger"
		class={klass}
		id={triggerId}
		aria-haspopup="menu"
		aria-expanded={triggerExpanded}
		aria-controls={contentId}
		data-state={triggerState}
		data-menu={name}
		onPointerdown={(event) => {
			if (event.button !== 0 || event.ctrlKey) return;
			event.preventDefault();
			if (m.open === name) {
				m.open = '';
				closeMenu(m.contents, m.triggers, name, true);
			} else {
				m.open = name;
				openMenu(m.contents, m.triggers, name, 'content', (refocus) => {
					m.open = '';
					closeMenu(m.contents, m.triggers, name, refocus);
				});
			}
		}}
		onKeydown={(event) => {
			// The guard wraps preventDefault: after an early return, Markless 0.4.0 prevents every key (Tab included).
			if (event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowDown') {
				event.preventDefault();
				m.open = name;
				openMenu(m.contents, m.triggers, name, 'first', (refocus) => {
					m.open = '';
					closeMenu(m.contents, m.triggers, name, refocus);
				});
			}
		}}
	>
		{children}
	</button>
}

export type DropdownMenuContentProps = PropsOf<'div'> & {
	readonly menu: string;
	/** Radix's `modal`: a modal menu hides the rest of the page and returns focus to its trigger when a press outside closes it. */
	readonly modal?: boolean;
	readonly side?: MenuSide;
	readonly align?: MenuAlign;
	readonly sideOffset?: number;
	readonly class?: string;
	readonly children?: Children;
};

export function DropdownMenuContent({ menu, modal, side, align, sideOffset, class: klass, children, ...rest }: DropdownMenuContentProps) @{
	const m = menus();
	let name = state(menu);
	const contentClosed = computed(() => m.open !== name);
	const contentState = computed(() => (m.open === name ? 'open' : 'closed'));
	const contentClass = computed(() => cn(CONTENT_CLASS, klass));
	const contentSide = computed(() => side ?? 'bottom');
	const contentAlign = computed(() => align ?? 'center');
	const contentOffset = computed(() => String(sideOffset ?? 4));
	const contentModal = computed(() => (modal === false ? 'false' : 'true'));
	const labelledBy = computed(() => `radix-menu-${name}-trigger`);
	const contentDomId = computed(() => `radix-menu-${name}-content`);

	<div data-radix-popper-content-wrapper="" dir="ltr" hidden={contentClosed} data-menu-wrapper={name} style="position: fixed; left: 0px; top: 0px; min-width: max-content; z-index: 50;">
		<div
			{...rest}
			el={m.contents}
			data-menu={name}
			data-side={contentSide}
			data-align={contentAlign}
			data-side-offset={contentOffset}
			data-modal={contentModal}
			role="menu"
			aria-orientation="vertical"
			data-state={contentState}
			data-radix-menu-content=""
			dir="ltr"
			id={contentDomId}
			aria-labelledby={labelledBy}
			data-slot="dropdown-menu-content"
			class={contentClass}
			tabindex="-1"
			data-orientation="vertical"
			onKeydown={(event) => {
				if (event.key === 'Escape' || event.key === 'Tab') {
					event.preventDefault();
					m.open = '';
					closeMenu(m.contents, m.triggers, name, true);
				}
				if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Home' || event.key === 'End') {
					event.preventDefault();
					moveFocus(m.contents, name, event.key);
				}
				if (event.key === 'Enter' || event.key === ' ') {
					event.preventDefault();
					focusItem(m.contents, name)?.click();
				}
			}}
		>
			{children}
		</div>
	</div>
}

export type DropdownMenuItemProps = PropsOf<'div'> & {
	readonly menu: string;
	readonly variant?: 'default' | 'destructive';
	readonly class?: string;
	/** Runs when the item is chosen, by pointer or keyboard, before the menu closes. */
	readonly onSelect?: () => void;
	readonly children?: Children;
};

export function DropdownMenuItem({ menu, variant, class: klass, onSelect, children, ...rest }: DropdownMenuItemProps) @{
	const m = menus();
	let name = state(menu);
	const itemClass = computed(() => cn(ITEM_CLASS, klass));
	const itemVariant = computed(() => variant ?? 'default');

	<div
		{...rest}
		role="menuitem"
		data-slot="dropdown-menu-item"
		data-variant={itemVariant}
		class={itemClass}
		tabindex="-1"
		data-orientation="vertical"
		data-radix-collection-item=""
		onClick={() => {
			onSelect?.();
			m.open = '';
			selectAndClose(m.contents, m.triggers, name);
		}}
	>
		{children}
	</div>
}

export type DropdownMenuLinkItemProps = PropsOf<'a'> & { readonly class?: string; readonly children?: Children };

/** An item rendered as a link (Radix `asChild` around a router Link): choosing it follows the link. */
export function DropdownMenuLinkItem({ class: klass, children, ...rest }: DropdownMenuLinkItemProps) @{
	const linkItemClass = computed(() => cn(ITEM_CLASS, klass));
	<a {...rest} role="menuitem" data-slot="dropdown-menu-item" data-variant="default" tabindex="-1" data-orientation="vertical" data-radix-collection-item="" class={linkItemClass}>{children}</a>
}

export function DropdownMenuLabel({ class: klass, children }: { readonly class?: string; readonly children?: Children }) @{
	const labelClass = computed(() => cn('px-2 py-1.5 text-sm font-medium data-inset:ps-8', klass));
	<div data-slot="dropdown-menu-label" class={labelClass}>{children}</div>
}

export function DropdownMenuSeparator({ class: klass }: { readonly class?: string }) @{
	const separatorClass = computed(() => cn('-mx-1 my-1 h-px bg-border', klass));
	<div role="separator" aria-orientation="horizontal" data-slot="dropdown-menu-separator" class={separatorClass}></div>
}

export function DropdownMenuGroup({ children }: { readonly children?: Children }) @{
	<div role="group" data-slot="dropdown-menu-group">{children}</div>
}

export function DropdownMenuShortcut({ class: klass, children }: { readonly class?: string; readonly children?: Children }) @{
	const shortcutClass = computed(() => cn('ms-auto text-xs tracking-widest text-muted-foreground', klass));
	<span data-slot="dropdown-menu-shortcut" class={shortcutClass}>{children}</span>
}
