import { computed, type Children } from '@markless/core';
import { show } from '../parts/base-ui/dialog.ts';
import { toggleTheme } from './theme.ts';
import { BASES, MENU_ACCENTS, RADII, STYLES, iconLibraries } from './create-registry.ts';
import { findFont, isTranslucentMenuColor, shuffled, type CreateParams, type CreateUpdate } from './create-params.ts';
import { commit, hover, redo, undo, unhover } from './create-runtime.ts';
import { createState } from './create-state.tsrx';
import { START } from './create-runtime.ts';
import { FIELD_SEPARATOR, LOCK, LOCK_BODY, LOCK_SHACKLE, PICKER_TRIGGER, SEPARATOR_LINE, UNLOCK_SHACKLE, dotOf, paramOf, radiusLocked, themeOf } from './create-ui.ts';

const FOCUS_GUARD = 'clip-path: inset(50%); overflow: hidden; white-space: nowrap; border: 0px; padding: 0px; width: 1px; height: 1px; margin: -1px; position: fixed; top: 0px; left: 0px;';
const HIDDEN_OWNER = 'clip-path: inset(50%); position: fixed; top: 0px; left: 0px;';
const POSITIONER = 'position: absolute; left: 0px; top: 0px;';

// /create's customizer pickers (style-picker.tsx to menu-picker.tsx): each trigger with its lock; their menus are in
// create-menus.tsrx.

export function Separator() @{
	<div data-slot="field-separator" data-content="false" class={FIELD_SEPARATOR}>
		<div data-orientation="horizontal" role="separator" aria-orientation="horizontal" data-slot="separator" class={SEPARATOR_LINE}></div>
	</div>
}

/** PickerTrigger with its label and value, the lock beside it, and the menu it owns. */
// Its props are used as they come (no expression over them): its instances sit in different components.
function Picker({ param, label, value, wrapper, wide, disabled, disabledMark, away, children }: { readonly param: string; readonly label: string; readonly value: string; readonly wrapper?: string; readonly wide?: boolean; readonly disabled?: true; readonly disabledMark?: string; readonly away?: true; readonly children: Children }) @{
	<div class={wrapper ?? 'group/picker relative'} hidden={away}>
		<button type="button" tabindex="0" aria-haspopup="menu" id={`create-${param}`} data-slot="dropdown-menu-trigger" data-create-picker="" class={PICKER_TRIGGER} aria-expanded="false" disabled={disabled} data-disabled={disabledMark}>
			<div class="flex flex-col justify-start text-left">
				<div class="text-xs text-muted-foreground">{label}</div>
				<div class={wide ? 'line-clamp-1 max-w-[80%] truncate text-sm font-medium text-foreground' : 'text-sm font-medium text-foreground'}>{value}</div>
			</div>
			{children}
		</button>
		<LockButton param={param} />
		<span aria-owns={`create-${param}-popup`} style={HIDDEN_OWNER} hidden data-mm-shown-with={`create-${param}`}></span>
	</div>
}

function LockButton({ param }: { readonly param: string }) @{
	const t = createState();
	const locked = computed(() => t.locks.includes(param));

	<button hidden={param === 'base' ? true : undefined} type="button" title={locked ? 'Unlock' : 'Lock'} aria-label={locked ? 'Unlock' : 'Lock'} data-locked={locked ? 'true' : 'false'} class={LOCK} onClick={() => (t.locks = t.locks.includes(param) ? t.locks.filter((p) => p !== param) : [...t.locks, param])}>
		<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" color="currentColor" class="size-5 text-foreground" stroke-width="2" stroke="currentColor">
			<path d={LOCK_BODY} stroke="currentColor" stroke-width="2"></path>
			<path d={locked ? LOCK_SHACKLE : UNLOCK_SHACKLE} stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"></path>
			<path d="M11.9961 15.5H12.0051" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"></path>
		</svg>
	</button>
}

export function StylePicker() @{
	const t = createState();
	const title = computed(() => STYLES.find((s) => s.name === t.view.params.style)?.title ?? '');

	<Picker param="style" label="Style" value={title}>
		<div class="pointer-events-none absolute top-1/2 right-4 flex size-4 -translate-y-1/2 items-center justify-center select-none md:right-2.5">
			<svg class="size-4" hidden={t.view.params.style !== 'vega'} xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 24 24" fill="none" role="img" color="currentColor"><path d="M2.5 12C2.5 7.52166 2.5 5.28249 3.89124 3.89124C5.28249 2.5 7.52166 2.5 12 2.5C16.4783 2.5 18.7175 2.5 20.1088 3.89124C21.5 5.28249 21.5 7.52166 21.5 12C21.5 16.4783 21.5 18.7175 20.1088 20.1088C18.7175 21.5 16.4783 21.5 12 21.5C7.52166 21.5 5.28249 21.5 3.89124 20.1088C2.5 18.7175 2.5 16.4783 2.5 12Z" stroke="currentColor" stroke-width="2"></path></svg>
			<svg class="size-4" hidden={t.view.params.style !== 'nova'} xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 24 24" fill="none" role="img" color="currentColor"><path d="M2 12C2 9.19974 2 7.79961 2.54497 6.73005C3.02433 5.78924 3.78924 5.02433 4.73005 4.54497C5.79961 4 7.19974 4 10 4H14C16.8003 4 18.2004 4 19.27 4.54497C20.2108 5.02433 20.9757 5.78924 21.455 6.73005C22 7.79961 22 9.19974 22 12C22 14.8003 22 16.2004 21.455 17.27C20.9757 18.2108 20.2108 18.9757 19.27 19.455C18.2004 20 16.8003 20 14 20H10C7.19974 20 5.79961 20 4.73005 19.455C3.78924 18.9757 3.02433 18.2108 2.54497 17.27C2 16.2004 2 14.8003 2 12Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"></path></svg>
			<svg class="size-4" hidden={t.view.params.style !== 'maia'} xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 24 24" fill="none" role="img" color="currentColor"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2" stroke-linejoin="round"></circle></svg>
			<svg class="size-4" hidden={t.view.params.style !== 'lyra'} xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 24 24" fill="none" role="img" color="currentColor"><path d="M7.84308 3.80211C9.8718 2.6007 10.8862 2 12 2C13.1138 2 14.1282 2.6007 16.1569 3.80211L16.8431 4.20846C18.8718 5.40987 19.8862 6.01057 20.4431 7C21 7.98943 21 9.19084 21 11.5937V12.4063C21 14.8092 21 16.0106 20.4431 17C19.8862 17.9894 18.8718 18.5901 16.8431 19.7915L16.1569 20.1979C14.1282 21.3993 13.1138 22 12 22C10.8862 22 9.8718 21.3993 7.84308 20.1979L7.15692 19.7915C5.1282 18.5901 4.11384 17.9894 3.55692 17C3 16.0106 3 14.8092 3 12.4063V11.5937C3 9.19084 3 7.98943 3.55692 7C4.11384 6.01057 5.1282 5.40987 7.15692 4.20846L7.84308 3.80211Z" stroke="currentColor" stroke-width="2"></path></svg>
			<svg class="size-4" hidden={t.view.params.style !== 'mira'} xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 24 24" fill="none" role="img" color="currentColor"><path d="M5.92089 5.92089C8.15836 3.68342 9.2771 2.56468 10.5857 2.19562C11.5105 1.93479 12.4895 1.93479 13.4143 2.19562C14.7229 2.56468 15.8416 3.68342 18.0791 5.92089C20.3166 8.15836 21.4353 9.2771 21.8044 10.5857C22.0652 11.5105 22.0652 12.4895 21.8044 13.4143C21.4353 14.7229 20.3166 15.8416 18.0791 18.0791C15.8416 20.3166 14.7229 21.4353 13.4143 21.8044C12.4895 22.0652 11.5105 22.0652 10.5857 21.8044C9.2771 21.4353 8.15836 20.3166 5.92089 18.0791C3.68342 15.8416 2.56468 14.7229 2.19562 13.4143C1.93479 12.4895 1.93479 11.5105 2.19562 10.5857C2.56468 9.2771 3.68342 8.15836 5.92089 5.92089Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"></path></svg>
			<svg class="size-4" hidden={t.view.params.style !== 'luma'} xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 24 24" fill="none" role="img" color="currentColor"><path d="M2 12C2 8.134 5.134 5 9 5H15C18.866 5 22 8.134 22 12C22 15.866 18.866 19 15 19H9C5.134 19 2 15.866 2 12Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"></path></svg>
			<svg class="size-4" hidden={t.view.params.style !== 'sera'} xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 24 24" fill="none" role="img" color="currentColor"><rect x="3" y="3" width="18" height="18" stroke="currentColor" stroke-width="2"></rect></svg>
			<svg class="size-4" hidden={t.view.params.style !== 'rhea'} xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 24 24" fill="none" role="img" color="currentColor"><path d="M3 12C3 9.79086 4.79086 8 7 8H17C19.2091 8 21 9.79086 21 12C21 14.2091 19.2091 16 17 16H7C4.79086 16 3 14.2091 3 12Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"></path></svg>
		</div>
	</Picker>
}

/** BaseColorPicker, ThemePicker and ChartColorPicker: a title and its color's dot. */
export function ColorPicker({ param, label }: { readonly param: string; readonly label: string }) @{
	const t = createState();
	const name = computed(() => paramOf(t.view.params, param));
	const title = computed(() => themeOf(paramOf(t.view.params, param))?.title ?? '');
	const dot = computed(() => dotOf(paramOf(t.view.params, param), param === 'baseColor'));

	<Picker param={param} label={label} value={title}>
		<div style={dot} data-color={name} class="pointer-events-none absolute top-1/2 right-4 size-4 -translate-y-1/2 rounded-full bg-(--color) select-none md:right-2.5"></div>
	</Picker>
}

export function FontPicker({ param, label }: { readonly param: string; readonly label: string }) @{
	const t = createState();
	const value = computed(() => (param === 'fontHeading' ? t.view.params.fontHeading : t.view.params.font));
	const body = computed(() => findFont(t.view.params.font));
	const name = computed(() => (param === 'fontHeading' && t.view.params.fontHeading === 'inherit' ? findFont(t.view.params.font)?.name : findFont(param === 'fontHeading' ? t.view.params.fontHeading : t.view.params.font)?.name) ?? '');
	const face = computed(() => `font-family: ${(findFont(param === 'fontHeading' ? t.view.params.fontHeading : t.view.params.font) ?? findFont(t.view.params.font))?.fontFamily ?? ''};`);

	<Picker param={param} label={label} value={name} wide={true}>
		<div class="pointer-events-none absolute top-1/2 right-4 flex size-4 -translate-y-1/2 items-center justify-center text-base text-foreground select-none md:right-2.5" style={face} data-value={value} data-body={body?.value}>Aa</div>
	</Picker>
}

export function IconLibraryPicker() @{
	const t = createState();
	const title = computed(() => iconLibraries[t.view.params.iconLibrary as keyof typeof iconLibraries]?.title ?? '');
	const lib = computed(() => t.view.params.iconLibrary);

	<Picker param="iconLibrary" label="Icon Library" value={title}>
		<div class="pointer-events-none absolute top-1/2 right-4 flex size-4 -translate-y-1/2 items-center justify-center text-base text-foreground select-none md:right-2.5 *:[svg]:text-foreground!">
			<svg hidden={lib !== 'lucide'} xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" viewBox="0 0 24 24"><path stroke="currentColor" d="M14 12a4 4 0 0 0-8 0 8 8 0 1 0 16 0 11.97 11.97 0 0 0-4-8.944"></path><path stroke="currentColor" d="M10 12a4 4 0 0 0 8 0 8 8 0 1 0-16 0 11.97 11.97 0 0 0 4.063 9"></path></svg>
			<svg hidden={lib !== 'tabler'} xmlns="http://www.w3.org/2000/svg" width="32" height="32" fill="none" viewBox="0 0 32 32"><path fill="currentColor" d="M31.288 7.107A8.83 8.83 0 0 0 24.893.712a55.9 55.9 0 0 0-17.786 0A8.83 8.83 0 0 0 .712 7.107a55.9 55.9 0 0 0 0 17.786 8.83 8.83 0 0 0 6.395 6.395c5.895.95 11.89.95 17.786 0a8.83 8.83 0 0 0 6.395-6.395c.95-5.895.95-11.89 0-17.786"></path><path fill="#fff" d="m17.884 9.076 1.5-2.488 6.97 6.977-2.492 1.494zm-7.96 3.127 7.814-.909 3.91 3.66-.974 7.287-9.582 2.159a3.06 3.06 0 0 1-2.17-.329l5.244-4.897c.91.407 2.003.142 2.587-.626.584-.77.488-1.818-.226-2.484s-1.84-.755-2.664-.21c-.823.543-1.107 1.562-.67 2.412l-5.245 4.89a2.53 2.53 0 0 1-.339-2.017z"></path></svg>
			<svg hidden={lib !== 'hugeicons'} xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><path d="M2 9.5H22" stroke="currentColor"></path><path d="M20.5 9.5H3.5L4.23353 15.3682C4.59849 18.2879 4.78097 19.7477 5.77343 20.6239C6.76589 21.5 8.23708 21.5 11.1795 21.5H12.8205C15.7629 21.5 17.2341 21.5 18.2266 20.6239C19.219 19.7477 19.4015 18.2879 19.7665 15.3682L20.5 9.5Z" stroke="currentColor"></path><path d="M5 9C5 5.41015 8.13401 2.5 12 2.5C15.866 2.5 19 5.41015 19 9" stroke="currentColor"></path></svg>
			<svg hidden={lib !== 'phosphor'} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32"><path fill="none" d="M0 0h32v32H0z"></path><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5h9v16H9zm9 16v9a9 9 0 0 1-9-9M9 5l9 16m0 0h1a8 8 0 0 0 0-16h-1"></path></svg>
			<svg hidden={lib !== 'remixicon'} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M12 2C17.5228 2 22 6.47715 22 12C22 15.3137 19.3137 18 16 18C12.6863 18 10 15.3137 10 12C10 11.4477 9.55228 11 9 11C8.44772 11 8 11.4477 8 12C8 16.4183 11.5817 20 16 20C16.8708 20 17.7084 19.8588 18.4932 19.6016C16.7458 21.0956 14.4792 22 12 22C6.6689 22 2.3127 17.8283 2.0166 12.5713C2.23647 9.45772 4.83048 7 8 7C11.3137 7 14 9.68629 14 13C14 13.5523 14.4477 14 15 14C15.5523 14 16 13.5523 16 13C16 8.58172 12.4183 5 8 5C6.50513 5 5.1062 5.41032 3.90918 6.12402C5.72712 3.62515 8.67334 2 12 2Z"></path></svg>
		</div>
	</Picker>
}

export function RadiusPicker() @{
	const t = createState();
	const locked = computed(() => (radiusLocked(t.view.params.style) ? true : undefined));
	const lockedMark = computed(() => (radiusLocked(t.view.params.style) ? '' : undefined));
	const label = computed(() => RADII.find((r) => r.name === (radiusLocked(t.view.params.style) ? 'none' : t.view.params.radius))?.label ?? '');

	<Picker param="radius" label="Radius" value={label} disabled={locked} disabledMark={lockedMark}>
		<div class="pointer-events-none absolute top-1/2 right-4 flex size-4 -translate-y-1/2 rotate-90 items-center justify-center text-base text-foreground select-none md:right-2.5">
			<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" class="text-foreground"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 20v-5C4 8.925 8.925 4 15 4h5"></path></svg>
		</div>
	</Picker>
}

const MENU_OPTIONS: Readonly<Record<string, string>> = { default: 'Default / Solid', 'default-translucent': 'Default / Translucent', inverted: 'Inverted / Solid', 'inverted-translucent': 'Inverted / Translucent' };

export function MenuColorPicker() @{
	const t = createState();
	const label = computed(() => MENU_OPTIONS[t.view.params.menuColor] ?? '');

	<Picker param="menuColor" label="Menu" value={label} wide={true}>
		<div class="pointer-events-none absolute top-1/2 right-4 flex size-4 -translate-y-1/2 items-center justify-center text-base text-foreground select-none md:right-2.5">
			<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" color="currentColor" class="size-4" stroke-width="2" stroke="currentColor"><path d="M4 5L16 5" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"></path><path d="M4 12L20 12" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"></path><path d="M4 19L12 19" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"></path></svg>
		</div>
	</Picker>
}

export function MenuAccentPicker() @{
	const t = createState();
	const label = computed(() => MENU_ACCENTS.find((a) => a.value === t.view.params.menuAccent)?.label ?? '');
	const accent = computed(() => t.view.params.menuAccent);

	<Picker param="menuAccent" label="Menu Accent" value={label} wrapper="group/picker relative pr-3 md:pr-0">
		<div class="pointer-events-none absolute top-1/2 right-4 flex size-4 -translate-y-1/2 items-center justify-center text-base text-foreground select-none md:right-2.5">
			<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 24 24" fill="none" class="size-4 text-foreground"><path d="M19 12.1294L12.9388 18.207C11.1557 19.9949 10.2641 20.8889 9.16993 20.9877C8.98904 21.0041 8.80705 21.0041 8.62616 20.9877C7.53195 20.8889 6.64039 19.9949 4.85726 18.207L2.83687 16.1811C1.72104 15.0622 1.72104 13.2482 2.83687 12.1294M19 12.1294L10.9184 4.02587M19 12.1294H2.83687M10.9184 4.02587L2.83687 12.1294M10.9184 4.02587L8.89805 2" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" data-accent={accent} class="fill-muted-foreground/30 data-[accent=bold]:fill-foreground"></path><path d="M22 20C22 21.1046 21.1046 22 20 22C18.8954 22 18 21.1046 18 20C18 18.8954 20 17 20 17C20 17 22 18.8954 22 20Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" data-accent={accent} class="fill-muted-foreground/30 data-[accent=bold]:fill-foreground"></path></svg>
		</div>
	</Picker>
}

/** BasePicker: on a phone only, the base its logo names. */
export function BasePicker() @{
	const t = createState();
	const title = computed(() => BASES.find((b) => b.name === t.view.params.base)?.title ?? '');
	const base = computed(() => t.view.params.base);
	const away = computed(() => (t.mobile ? undefined : true));

	<Picker param="base" label="Base" value={title} away={away}>
		<div class="pointer-events-none absolute top-1/2 right-4 size-4 -translate-y-1/2 text-foreground select-none md:right-2.5 *:[svg]:size-4 *:[svg]:text-foreground!">
				<svg hidden={base !== 'base'} width="17" height="24" viewBox="0 0 17 24"><path fill="currentColor" d="M9.5001 7.01537C9.2245 6.99837 9 7.22385 9 7.49999V23C13.4183 23 17 19.4183 17 15C17 10.7497 13.6854 7.27351 9.5001 7.01537Z"></path><path fill="currentColor"   d="M8 9.8V12V23C3.58172 23 0 19.0601 0 14.2V12V1C4.41828 1 8 4.93989 8 9.8Z"></path></svg>
				<svg hidden={base !== 'aria'} xmlns="http://www.w3.org/2000/svg" viewBox="200 206 800 790" fill="none"><path d="M720.67 205.995C867.583 205.995 986.679 325.091 986.68 472.003C986.68 590.753 908.865 691.325 801.446 725.521L979.312 948.055C994.438 966.98 980.963 995 956.736 995H795.612C778.743 995 762.715 987.629 751.734 974.823L697.365 911.421L493.126 653.39C457.134 607.918 489.518 540.979 547.511 540.977L720.67 540.971C758.758 540.971 789.635 510.091 789.635 472.003C789.634 433.915 758.758 403.038 720.67 403.038H429.939C404.955 403.038 388.623 391.886 373.994 373.623L277.349 252.966C262.194 234.045 275.664 205.996 299.905 205.995H720.67Z M396.605 720.706C407.798 705.406 430.443 704.843 442.381 719.568L503.816 797.018H502.786L535.569 838.934C548.074 854.358 549.943 877.191 538.047 893.09L476.638 972.545C465.692 986.707 448.803 995 430.903 995H242.276C218.18 995 204.665 967.248 219.523 948.278L337.992 797.018H337.923L396.605 720.706Z" fill="currentColor" /></svg>
				<svg hidden={base !== 'radix'} role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><title>Radix UI</title><path fill="currentColor" d="M11.52 24a7.68 7.68 0 0 1-7.68-7.68 7.68 7.68 0 0 1 7.68-7.68V24Zm0-24v7.68H3.84V0h7.68Zm4.8 7.68a3.84 3.84 0 1 1 0-7.68 3.84 3.84 0 0 1 0 7.68Z"/></svg>
		</div>
	</Picker>
}
