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
import { closeMenu, focusItem, linkOf, menuOf, moveFocus, openMenu, pointerFocus, pointerLeave, selectAndClose, showOthers, toggleMenu } from './behaviour.ts';

export const CONTENT_CLASS =
	'z-50 max-h-(--radix-dropdown-menu-content-available-height) min-w-32 origin-(--radix-dropdown-menu-content-transform-origin) overflow-x-hidden overflow-y-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95';
export const ITEM_CLASS =
	"relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50 data-inset:ps-8 data-[variant=destructive]:text-destructive data-[variant=destructive]:focus:bg-destructive/10 data-[variant=destructive]:focus:text-destructive dark:data-[variant=destructive]:focus:bg-destructive/20 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground data-[variant=destructive]:*:[svg]:text-destructive!";

export const menus = shared(
	() => {
		const cells = state({ open: '', at: '' });
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
	/** `aria-haspopup`: `dialog` for a Radix Popover trigger, `listbox` for a Select trigger. */
	readonly haspopup?: 'menu' | 'dialog' | 'listbox';
	/** Tells apart triggers that share one menu, for their ids. */
	readonly instance?: string;
	/** shadcn's trigger data-slot: `popover-trigger` for a Popover's. */
	readonly slot?: string;
	readonly class?: string;
	readonly children?: Children;
};

export function DropdownMenuTrigger({ menu, haspopup, instance, slot, class: klass, children, ...rest }: DropdownMenuTriggerProps) @{
	const m = menus();
	// The menu's name as a cell: a comparison with a prop on one side stops refreshing after resume.
	let name = state(menu);
	let inst = state(instance ?? '');
	const triggerExpanded = computed(() => (m.open === name && m.at === inst ? 'true' : 'false'));
	const triggerState = computed(() => (m.open === name && m.at === inst ? 'open' : 'closed'));
	// Radix Select's trigger carries no id; a menu's and a popover's do.
	const triggerId = computed(() => (haspopup === 'listbox' ? undefined : `radix-menu-${name}${inst}-trigger`));
	const contentId = computed(() => `radix-menu-${name}-content`);
	const popupKind = computed(() => haspopup ?? 'menu');
	const triggerSlot = computed(() => slot ?? 'dropdown-menu-trigger');

	<button
		{...rest}
		el={m.triggers}
		type="button"
		data-slot={triggerSlot}
		class={klass}
		id={triggerId}
		aria-haspopup={popupKind}
		aria-expanded={triggerExpanded}
		aria-controls={contentId}
		data-state={triggerState}
		data-menu={name}
		onPointerdown={(event) => {
			if (event.button === 0) {
				event.preventDefault();
				m.open = m.open === name && m.at === inst ? '' : name;
				m.at = inst;
				toggleMenu(m.contents, m.triggers, name, m.open === '', event.target, (refocus) => {
					m.open = '';
					closeMenu(m.contents, m.triggers, name, refocus);
				});
			}
		}}
		onKeydown={(event) => {
			if (event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowDown') event.preventDefault();
			// Radix: Enter and Space toggle, ArrowDown only opens; an open menu keeps focus where it is.
			const open = m.open === name && m.at === inst;
			if (open && (event.key === 'Enter' || event.key === ' ')) {
				m.open = '';
				closeMenu(m.contents, m.triggers, name, true);
			} else if (!open && (event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowDown')) {
				m.open = name;
				m.at = inst;
				openMenu(m.contents, m.triggers, name, 'first', (refocus) => {
					m.open = '';
					closeMenu(m.contents, m.triggers, name, refocus);
				}, event.target);
			}
		}}
	>
		{children}
	</button>
}

export type DropdownMenuContentProps = PropsOf<'div'> & {
	readonly menu: string;
	/** `listbox` for a Select's content. */
	readonly role?: 'menu' | 'listbox';
	/** shadcn's content data-slot: `popover-content`, `select-content`. */
	readonly slot?: string;
	/** Radix's `modal`: a modal menu hides the rest of the page and returns focus to its trigger when a press outside closes it. */
	readonly modal?: boolean;
	readonly side?: MenuSide;
	readonly align?: MenuAlign;
	readonly sideOffset?: number;
	readonly class?: string;
	readonly children?: Children;
};

export function DropdownMenuContent({ menu, role, slot, modal, side, align, sideOffset, class: klass, children, ...rest }: DropdownMenuContentProps) @{
	const m = menus();
	let name = state(menu);
	const contentState = computed(() => (m.open === name ? 'open' : 'closed'));
	// A Select's content (shadcn's SelectContent) is given its whole class; a menu's adds to the menu's own.
	const contentClass = computed(() => (role === 'listbox' ? cn(klass) : cn(CONTENT_CLASS, klass)));
	const contentSide = computed(() => side ?? 'bottom');
	const contentAlign = computed(() => align ?? 'center');
	const contentOffset = computed(() => String(sideOffset ?? 4));
	const contentModal = computed(() => (modal === false ? 'false' : 'true'));
	const contentRole = computed(() => role ?? 'menu');
	const contentSlot = computed(() => slot ?? 'dropdown-menu-content');
	const labelledBy = computed(() => `radix-menu-${name}${m.at}-trigger`);
	const contentDomId = computed(() => `radix-menu-${name}-content`);

	<div data-radix-popper-content-wrapper="" dir="ltr" hidden data-menu-wrapper={name}>
		<div
			{...rest}
			el={m.contents}
			data-menu={name}
			data-side={contentSide}
			data-align={contentAlign}
			data-side-offset={contentOffset}
			data-modal={contentModal}
			role={contentRole}
			aria-orientation="vertical"
			data-state={contentState}
			data-radix-menu-content=""
			dir="ltr"
			id={contentDomId}
			aria-labelledby={labelledBy}
			data-slot={contentSlot}
			class={contentClass}
			tabindex="-1"
			data-orientation="vertical"
			onKeydown={(event) => {
				if (event.key === 'Escape' || event.key === 'Tab' || event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Home' || event.key === 'End' || event.key === 'Enter' || event.key === ' ') event.preventDefault();
				if (event.key === 'Escape' || event.key === 'Tab') {
					m.open = '';
					closeMenu(m.contents, m.triggers, name, true);
				}
				if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Home' || event.key === 'End') {
					moveFocus(m.contents, name, event.key);
				}
				if (event.key === 'Enter' || event.key === ' ') {
					focusItem(m.contents, name)?.click();
				}
			}}
			onPointermove={(event) => pointerFocus(event)}
			onPointerleave={(event) => pointerLeave(event)}
		>
			{children}
		</div>
	</div>
}

export type DropdownMenuItemProps = PropsOf<'div'> & {
	readonly menu: string;
	/** `option` for a Select's item. */
	readonly role?: 'menuitem' | 'option' | 'menuitemcheckbox';
	readonly variant?: 'default' | 'destructive';
	readonly class?: string;
	/** Runs when the item is chosen, by pointer or keyboard, before the menu closes. */
	readonly onSelect?: () => void;
	readonly children?: Children;
};

export function DropdownMenuItem({ menu, role, variant, class: klass, onSelect, children, ...rest }: DropdownMenuItemProps) @{
	const m = menus();
	let name = state(menu);
	const itemClass = computed(() => cn(ITEM_CLASS, klass));
	const itemVariant = computed(() => variant ?? 'default');
	const itemRole = computed(() => role ?? 'menuitem');

	<div
		{...rest}
		role={itemRole}
		data-slot="dropdown-menu-item"
		data-variant={itemVariant}
		class={itemClass}
		tabindex="-1"
		data-orientation="vertical"
		data-radix-collection-item=""
		onClick={() => {
			// Radix's hideOthers counts each layer: a dialog the item opens keeps the page hidden after the menu's marks
			// go. Lifting the menu's marks first lets the dialog lay its own over a page that has none.
			showOthers(name);
			onSelect?.();
			m.open = '';
			selectAndClose(m.contents, m.triggers, name);
		}}
	>
		{children}
	</div>
}

export type DropdownMenuLinkItemProps = PropsOf<'a'> & {
	readonly class?: string;
	/** The link names the page already shown. */
	readonly current?: boolean;
	readonly children?: Children;
};

/** An item rendered as a link (Radix `asChild` around a router Link): choosing it follows the link. */
export function DropdownMenuLinkItem({ class: klass, current, children, ...rest }: DropdownMenuLinkItemProps) @{
	const m = menus();
	const linkItemClass = computed(() => cn(ITEM_CLASS, klass));
	let here = state(current === true);
	// Choosing the item closes the menu; a link to the page already shown loads nothing in the old router, so focus goes back to the trigger.
	<a {...rest} role="menuitem" data-slot="dropdown-menu-item" data-variant="default" tabindex="-1" data-orientation="vertical" data-radix-collection-item="" class={linkItemClass} onClick={(event) => {
		if (here) event.preventDefault();
		const name = menuOf(linkOf(event.target));
		if (name) {
			m.open = '';
			closeMenu(m.contents, m.triggers, name, here);
		}
	}}>{children}</a>
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

export type DropdownMenuCheckboxItemProps = {
	readonly menu: string;
	/** `true` or `false`, from the page's own state. */
	readonly checked: string;
	readonly class?: string;
	readonly onSelect?: () => void;
	readonly children?: Children;
};

/** Radix's CheckboxItem as shadcn styles it: a menuitemcheckbox with its check indicator; choosing it toggles and closes the menu. */
export function DropdownMenuCheckboxItem({ menu, checked, class: klass, onSelect, children }: DropdownMenuCheckboxItemProps) @{
	const m = menus();
	let name = state(menu);
	const checkboxItemClass = computed(() => cn("relative flex cursor-default items-center gap-2 rounded-sm py-1.5 pe-2 ps-8 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4", klass));
	const checkboxItemState = computed(() => (checked === 'true' ? 'checked' : 'unchecked'));
	const indicatorHidden = computed(() => checked !== 'true');

	<div
		role="menuitemcheckbox"
		aria-checked={checked}
		data-state={checkboxItemState}
		data-slot="dropdown-menu-checkbox-item"
		class={checkboxItemClass}
		tabindex="-1"
		data-orientation="vertical"
		data-radix-collection-item=""
		onClick={() => {
			onSelect?.();
			m.open = '';
			selectAndClose(m.contents, m.triggers, name);
		}}
	>
		<span class="pointer-events-none absolute inset-s-2 flex size-3.5 items-center justify-center">
			<span data-state={checkboxItemState} hidden={indicatorHidden} style="pointer-events: none;"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-check size-4" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg></span>
		</span>
		{children}
	</div>
}

export type SelectItemProps = {
	readonly menu: string;
	/** `true` for the chosen option, from the page's own state. */
	readonly selected: string;
	readonly onSelect?: () => void;
	readonly children?: Children;
};

/** shadcn's SelectItem over Radix Select: an option with its check, on the same open/close cell as the menus. */
export function SelectItem({ menu, selected, onSelect, children }: SelectItemProps) @{
	const m = menus();
	let name = state(menu);
	const selectItemState = computed(() => (selected === 'true' ? 'checked' : 'unchecked'));
	const selectCheckHidden = computed(() => selected !== 'true');

	<div
		role="option"
		aria-selected={selected}
		data-state={selectItemState}
		tabindex="-1"
		data-slot="select-item"
		class="relative flex w-full cursor-default items-center gap-2 rounded-sm py-1.5 ps-2 pe-8 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground *:[span]:last:flex *:[span]:last:items-center *:[span]:last:gap-2"
		data-radix-collection-item=""
		onClick={() => {
			onSelect?.();
			m.open = '';
			selectAndClose(m.contents, m.triggers, name);
		}}
	>
		<span class="absolute inset-e-2 flex size-3.5 items-center justify-center">
			<span aria-hidden="true" hidden={selectCheckHidden}><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-check size-4" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg></span>
		</span>
		<span>{children}</span>
	</div>
}

export type PopoverContentProps = {
	readonly menu: string;
	readonly align?: MenuAlign;
	readonly side?: MenuSide;
	readonly sideOffset?: number;
	readonly class?: string;
	readonly children?: Children;
};

/** Radix Popover's content (shadcn's popover.tsx), on the same open/close cell as the menus: not modal, and its keys belong to what it holds; Escape closes it. */
export function PopoverContent({ menu, align, side, sideOffset, class: klass, children }: PopoverContentProps) @{
	const m = menus();
	let name = state(menu);
	const popoverState = computed(() => (m.open === name ? 'open' : 'closed'));
	const popoverSide = computed(() => side ?? 'bottom');
	const popoverAlign = computed(() => align ?? 'center');
	const popoverOffset = computed(() => String(sideOffset ?? 4));
	const popoverDomId = computed(() => `radix-menu-${name}-content`);

	<div data-radix-popper-content-wrapper="" hidden data-menu-wrapper={name}>
		<div
			el={m.contents}
			data-menu={name}
			data-side={popoverSide}
			data-align={popoverAlign}
			data-side-offset={popoverOffset}
			data-modal="false"
			data-state={popoverState}
			role="dialog"
			id={popoverDomId}
			data-slot="popover-content"
			class={klass}
			tabindex="-1"
			onKeydown={(event) => {
				if (event.key === 'Escape') {
					event.preventDefault();
					m.open = '';
					closeMenu(m.contents, m.triggers, name, true);
				}
			}}
		>
			{children}
		</div>
	</div>
}
