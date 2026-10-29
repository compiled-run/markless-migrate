import { computed, type Children } from '@markless/core';
import { show } from '../parts/base-ui/dialog.ts';
import { toggleTheme } from './theme.ts';
import { BASES, MENU_ACCENTS, RADII, STYLES, iconLibraries } from './create-registry.ts';
import { findFont, isTranslucentMenuColor, shuffled, type CreateParams, type CreateUpdate } from './create-params.ts';
import { commit, hover, redo, undo, unhover } from './create-runtime.ts';
import { createState } from './create-state.tsrx';
import { START } from './create-runtime.ts';
import { ACTION_MENU, INDICATOR, MENU_ITEM, MENU_POPUP, OPEN_PRESET, RADIO_ITEM, RESET, SEPARATOR, SHORTCUT, checkedValue, menuColorUpdate, radiusLocked } from './create-ui.ts';

const FOCUS_GUARD = 'clip-path: inset(50%); overflow: hidden; white-space: nowrap; border: 0px; padding: 0px; width: 1px; height: 1px; margin: -1px; position: fixed; top: 0px; left: 0px;';
const HIDDEN_OWNER = 'clip-path: inset(50%); position: fixed; top: 0px; left: 0px;';
const POSITIONER = 'position: absolute; left: 0px; top: 0px;';

// /create's menus: the main menu and each picker's, their radio items as Base UI's Menu renders them.

export function MainMenu() @{
	const t = createState();

	<div id="create-menu-portal" data-base-ui-portal="" hidden data-mm-layer="create-menu" data-mm-side-offset="20" data-mm-align-offset="-8">
		<div role="presentation" data-base-ui-inert="" style="position: fixed; inset: 0px; user-select: none;"></div>
		<div data-side="right" data-align="start" role="presentation" class="isolate z-50 outline-none" style={POSITIONER} data-closed="">
			<span data-type="inside" aria-hidden="true" tabindex="0" data-base-ui-focus-guard="" style={FOCUS_GUARD}></span>
			<div data-side="right" data-align="start" tabindex="-1" data-base-ui-focusable="" id="create-menu-popup" role="menu" aria-labelledby="create-menu" aria-orientation="vertical" data-slot="dropdown-menu-content" class={MENU_POPUP} data-closed="">
				<div role="group" data-slot="dropdown-menu-group">
					<div role="menuitem" tabindex="-1" data-slot="dropdown-menu-item" data-variant="default" class={MENU_ITEM} onClick={() => show(ACTION_MENU)}>{'Navigate...'}<span data-slot="dropdown-menu-shortcut" class={SHORTCUT}>{t.mac ? '⌘P' : 'Ctrl+P'}</span></div>
					<div role="menuitem" tabindex="-1" data-slot="dropdown-menu-item" data-variant="default" class={MENU_ITEM} onClick={() => show(OPEN_PRESET)}>{'Open Preset... '}<span data-slot="dropdown-menu-shortcut" class={SHORTCUT}>O</span></div>
					<div role="menuitem" tabindex="-1" data-slot="dropdown-menu-item" data-variant="default" class={MENU_ITEM} onClick={() => {
						const update = shuffled(t.view.params, t.locks);
						if (update) (t.view = commit(update));
					}}>{'Shuffle '}<span data-slot="dropdown-menu-shortcut" class={SHORTCUT}>R</span></div>
					<div role="menuitem" tabindex="-1" data-slot="dropdown-menu-item" data-variant="default" class={MENU_ITEM} onClick={() => toggleTheme()}>{'Light/Dark '}<span data-slot="dropdown-menu-shortcut" class={SHORTCUT}>D</span></div>
				</div>
				<div data-orientation="horizontal" role="separator" aria-orientation="horizontal" data-slot="dropdown-menu-separator" class={SEPARATOR}></div>
				<div role="group" data-slot="dropdown-menu-group">
					<div data-disabled={t.view.canGoBack ? undefined : ''} role="menuitem" aria-disabled={t.view.canGoBack ? undefined : 'true'} tabindex="-1" data-slot="dropdown-menu-item" data-variant="default" class={MENU_ITEM} onClick={() => (t.view = undo())}>{'Undo '}<span data-slot="dropdown-menu-shortcut" class={SHORTCUT}>{t.mac ? '⌘Z' : 'Ctrl+Z'}</span></div>
					<div data-disabled={t.view.canGoForward ? undefined : ''} role="menuitem" aria-disabled={t.view.canGoForward ? undefined : 'true'} tabindex="-1" data-slot="dropdown-menu-item" data-variant="default" class={MENU_ITEM} onClick={() => (t.view = redo())}>{'Redo '}<span data-slot="dropdown-menu-shortcut" class={SHORTCUT}>{t.mac ? '⇧⌘Z' : 'Ctrl+Shift+Z'}</span></div>
					<div data-orientation="horizontal" role="separator" aria-orientation="horizontal" data-slot="dropdown-menu-separator" class={SEPARATOR}></div>
					<div role="menuitem" tabindex="-1" data-slot="dropdown-menu-item" data-variant="default" class={MENU_ITEM} onClick={() => show(RESET)}>{'Reset '}<span data-slot="dropdown-menu-shortcut" class={SHORTCUT}>⇧R</span></div>
				</div>
			</div>
			<span data-type="inside" aria-hidden="true" tabindex="0" data-base-ui-focus-guard="" style={FOCUS_GUARD}></span>
		</div>
		<div class="absolute inset-y-0 right-0 left-62 z-40 bg-transparent" data-base-ui-inert=""></div>
	</div>
}

/** A picker's menu: Base UI's portal, positioner and popup around its radio group; the menu part opens and places it. */
export function MenuShell({ param, size, children }: { readonly param: string; readonly size: string; readonly children: Children }) @{
	const t = createState();
	const side = computed(() => (t.mobile ? 'top' : 'right'));
	const align = computed(() => (t.mobile ? 'center' : 'start'));
	// On a phone the menus are placed against the customizer card (anchorRef), above it.
	const anchor = computed(() => (t.mobile ? 'create-customizer' : undefined));
	// PickerRadioItem's closeOnClick={isMobile}, for every item of the menu.
	const closes = computed(() => (t.mobile ? 'true' : undefined));

	<div id={`create-${param}-portal`} data-base-ui-portal="" hidden data-mm-layer={`create-${param}`} data-mm-side-offset="20" data-mm-align-offset="0" data-mm-anchor={anchor}>
		<div role="presentation" data-base-ui-inert="" style="position: fixed; inset: 0px; user-select: none;"></div>
		<div data-side={side} data-align={align} role="presentation" class="isolate z-50 outline-none" style={POSITIONER} data-closed="">
			<span data-type="inside" aria-hidden="true" tabindex="0" data-base-ui-focus-guard="" style={FOCUS_GUARD}></span>
			<div data-side={side} data-align={align} tabindex="-1" data-base-ui-focusable="" id={`create-${param}-popup`} role="menu" aria-labelledby={`create-${param}`} aria-orientation="vertical" data-slot="dropdown-menu-content" class={size ? `${MENU_POPUP} ${size}` : MENU_POPUP} data-closed="" data-mm-close-on-click={closes} onMouseLeave={() => unhover()}>
				{children}
			</div>
			<span data-type="inside" aria-hidden="true" tabindex="0" data-base-ui-focus-guard="" style={FOCUS_GUARD}></span>
		</div>
		<div class="absolute inset-y-0 right-0 left-62 z-40 bg-transparent" data-base-ui-inert=""></div>
	</div>
}

/**
 * IconPlaceholder's check (CheckIcon, IconCheck, Tick02Icon, CheckIcon, RiCheckLine) in the chosen icon library, in the
 * checked item only, as RadioItemIndicator renders it.
 */
function Check({ checked }: { readonly checked: boolean }) @{
	const t = createState();
	const libs = computed(() => (checked ? [t.view.params.iconLibrary] : []));

	<span class={INDICATOR} data-slot="dropdown-menu-radio-item-indicator">
		@for (const lib of libs; key lib) {
		<span data-checked="" aria-hidden="true">
			@if (lib === 'tabler') {
				<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="tabler-icon tabler-icon-check size-4 pointer-coarse:size-5" lucide="CheckIcon" tabler="IconCheck" hugeicons="Tick02Icon" phosphor="CheckIcon" remixicon="RiCheckLine"><path d="M5 12l5 5l10 -10"></path></svg>
			} @else if (lib === 'hugeicons') {
				<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" color="currentColor" class="size-4 pointer-coarse:size-5" stroke-width="2" stroke="currentColor" lucide="CheckIcon" tabler="IconCheck" hugeicons="Tick02Icon" phosphor="CheckIcon" remixicon="RiCheckLine"><path d="M5 14L8.5 17.5L19 6.5" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"></path></svg>
			} @else if (lib === 'phosphor') {
				<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" fill="currentColor" viewBox="0 0 256 256" lucide="CheckIcon" tabler="IconCheck" hugeicons="Tick02Icon" phosphor="CheckIcon" remixicon="RiCheckLine" class="size-4 pointer-coarse:size-5"><path d="M229.66,77.66l-128,128a8,8,0,0,1-11.32,0l-56-56a8,8,0,0,1,11.32-11.32L96,188.69,218.34,66.34a8,8,0,0,1,11.32,11.32Z"></path></svg>
			} @else if (lib === 'remixicon') {
				<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="currentColor" lucide="CheckIcon" tabler="IconCheck" hugeicons="Tick02Icon" phosphor="CheckIcon" remixicon="RiCheckLine" class="remixicon size-4 pointer-coarse:size-5"><path d="M9.9997 15.1709L19.1921 5.97852L20.6063 7.39273L9.9997 17.9993L3.63574 11.6354L5.04996 10.2212L9.9997 15.1709Z"></path></svg>
			} @else {
				<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-check size-4 pointer-coarse:size-5" lucide="CheckIcon" tabler="IconCheck" hugeicons="Tick02Icon" phosphor="CheckIcon" remixicon="RiCheckLine"><path d="M20 6 9 17l-5-5"></path></svg>
			}
		</span>
		}
	</span>
}

/** PickerRadioItem: checked when it is the param's value; hovered or focused, it previews in the iframe (onItemPreview). */
export function RadioRow({ param, value, label }: { readonly param: string; readonly value: string; readonly label: string }) @{
	const t = createState();
	const radioChecked = computed(() => checkedValue(t.view.params, param) === value);

	<div data-checked={radioChecked ? '' : undefined} data-unchecked={radioChecked ? undefined : ''} role="menuitemradio" tabindex="-1" aria-checked={radioChecked ? 'true' : 'false'} data-slot="dropdown-menu-radio-item" class={RADIO_ITEM} onClick={() => {
		if (!(param === 'radius' && radiusLocked(t.view.params.style))) (t.view = commit({ [param]: value }));
	}} onMouseMove={() => {
		if (!t.mobile && !(param === 'radius' && radiusLocked(t.view.params.style))) hover({ [param]: value });
	}} onFocusIn={() => {
		if (!t.mobile && !(param === 'radius' && radiusLocked(t.view.params.style))) hover({ [param]: value });
	}}>
		<Check checked={radioChecked} />
		{label}
	</div>
}

/** A radio item some params disable: Rhea's large radius, a bold accent on a translucent menu. */
export function GatedRow({ param, value, label }: { readonly param: string; readonly value: string; readonly label: string }) @{
	const t = createState();
	const gatedChecked = computed(() => checkedValue(t.view.params, param) === value);
	const off = computed(() => (param === 'radius' ? t.view.params.style === 'rhea' : isTranslucentMenuColor(t.view.params.menuColor)));

	<div data-checked={gatedChecked ? '' : undefined} data-unchecked={gatedChecked ? undefined : ''} data-disabled={off ? '' : undefined} aria-disabled={off ? 'true' : undefined} role="menuitemradio" tabindex="-1" aria-checked={gatedChecked ? 'true' : 'false'} data-slot="dropdown-menu-radio-item" class={RADIO_ITEM} onClick={() => {
		if (!off && !(param === 'radius' && radiusLocked(t.view.params.style))) (t.view = commit({ [param]: value }));
	}} onMouseMove={() => {
		if (!t.mobile && !(param === 'radius' && radiusLocked(t.view.params.style))) hover({ [param]: value });
	}} onFocusIn={() => {
		if (!t.mobile && !(param === 'radius' && radiusLocked(t.view.params.style))) hover({ [param]: value });
	}}>
		<Check checked={gatedChecked} />
		{label}
	</div>
}

/** A base color's own theme in the Theme and Chart Color menus: there only while that base color is picked. */
export function BaseColorRow({ param, value, label }: { readonly param: string; readonly value: string; readonly label: string }) @{
	const t = createState();
	const baseColorChecked = computed(() => checkedValue(t.view.params, param) === value);
	const away = computed(() => (t.view.params.baseColor === value ? undefined : true));

	<div data-checked={baseColorChecked ? '' : undefined} data-unchecked={baseColorChecked ? undefined : ''} hidden={away} role="menuitemradio" tabindex="-1" aria-checked={baseColorChecked ? 'true' : 'false'} data-slot="dropdown-menu-radio-item" class={RADIO_ITEM} onClick={() => {
		(t.view = commit({ [param]: value }));
	}} onMouseMove={() => {
		if (!t.mobile) hover({ [param]: value });
	}} onFocusIn={() => {
		if (!t.mobile) hover({ [param]: value });
	}}>
		<Check checked={baseColorChecked} />
		{label}
	</div>
}

/** The Heading menu's first item: inherit, named after the body font. */
export function InheritRow({ param, value }: { readonly param: string; readonly value: string }) @{
	const t = createState();
	const inheritChecked = computed(() => t.view.params.fontHeading === 'inherit');
	const name = computed(() => findFont(t.view.params.font)?.name ?? 'Body font');

	<div data-checked={inheritChecked ? '' : undefined} data-unchecked={inheritChecked ? undefined : ''} role="menuitemradio" tabindex="-1" aria-checked={inheritChecked ? 'true' : 'false'} data-slot="dropdown-menu-radio-item" class={RADIO_ITEM} onClick={() => {
		(t.view = commit({ [param]: value }));
	}} onMouseMove={() => {
		if (!t.mobile) hover({ [param]: value });
	}} onFocusIn={() => {
		if (!t.mobile) hover({ [param]: value });
	}}>
		<Check checked={inheritChecked} />
		{name}
	</div>
}

/** MenuColorPicker's two radio groups: Default or Inverted, Solid or Translucent, each moving the accent with it. */
export function MenuColorRow({ axis, value, label }: { readonly axis: string; readonly value: string; readonly label: string }) @{
	const t = createState();
	const color = computed(() => (t.view.params.menuColor === 'inverted' || t.view.params.menuColor === 'inverted-translucent' ? 'inverted' : 'default'));
	const translucent = computed(() => isTranslucentMenuColor(t.view.params.menuColor));
	const menuColorChecked = computed(() => (axis === 'color' ? color : translucent ? 'translucent' : 'solid') === value);
	const off = computed(() => axis === 'color' && value === 'inverted' && t.dark);

	<div
		data-checked={menuColorChecked ? '' : undefined}
		data-unchecked={menuColorChecked ? undefined : ''}
		data-disabled={off ? '' : undefined}
		role="menuitemradio"
		tabindex="-1"
		aria-checked={menuColorChecked ? 'true' : 'false'}
		aria-disabled={off ? 'true' : undefined}
		data-slot="dropdown-menu-radio-item"
		class={RADIO_ITEM}
		onClick={() => {
			if (!off) (t.view = commit(menuColorUpdate(t.view.params, t.view.solidAccent, axis, value)));
		}}
		onMouseMove={() => {
			if (!t.mobile) hover(menuColorUpdate(t.view.params, t.view.solidAccent, axis, value));
		}}
		onFocusIn={() => {
			if (!t.mobile) hover(menuColorUpdate(t.view.params, t.view.solidAccent, axis, value));
		}}
	>
		<Check checked={menuColorChecked} />
		{label}
	</div>
}
