import { computed, shared, state, type Children } from '@markless/core';
import { roving } from '../parts/radix/roving.ts';
import { followStoredTheme, toggleTheme } from './theme.ts';
import { commit, copyText, type TypesetView, choosePackageManager, hover, isMac, isMobile, now, packageManager, redo, start, typesetCss, undo, unhover } from './typeset-runtime.ts';
import { commandFor, type TypesetParams, DEFAULTS, findFont, FONTS, FRAMEWORKS, serializeParams, shuffled, TYPESET_FLOWS, TYPESET_LEADINGS, TYPESET_MEASURES, TYPESET_SIZES, typesetDocs } from './typeset-params.ts';

// app/(app)/(typeset): the designer of /typeset (TypesetDocsPanel, TypesetPreview and TypesetCustomizer) on Markless
// state, and, in Layers, what its controls portal to the end of the body (the menus, the framework selects, the
// specimen tooltips and the Get Code drawer). The Base UI ports open, place and close those; this file holds the values.

const APP_URL: string = import.meta.env.VITE_APP_URL ?? '';
const START: TypesetView = { params: DEFAULTS, canGoBack: false, canGoForward: false, previewSrc: serializeParams(`/preview/typeset/${DEFAULTS.item}`, DEFAULTS) };

export const typesetState = shared(
	() => {
		const t = state({
			params: DEFAULTS as TypesetParams,
			locks: [] as readonly string[],
			canGoBack: false,
			canGoForward: false,
			previewSrc: START.previewSrc,
			// The old page rendered the designer in the browser only: the preview's iframe gets its URL once the URL's params are read.
			ready: false,
			mobile: false,
			mac: false,
			packageManager: 'pnpm',
			panelFramework: 'next',
			drawerFramework: 'next',
			css: false,
		});
		return {
			...t,
			// What the runtime says the params, history and preview now are.
			show(view = START) {
				t.params = view.params;
				t.canGoBack = view.canGoBack;
				t.canGoForward = view.canGoForward;
				t.previewSrc = view.previewSrc;
			},
		};
	},
	{ scope: 'page' },
);

const PICKER_TRIGGER = 'relative w-36 shrink-0 touch-manipulation rounded-xl p-3 ring-1 ring-foreground/10 select-none hover:bg-muted focus-visible:ring-foreground/50 focus-visible:outline-none disabled:opacity-50 data-popup-open:bg-muted md:w-full md:rounded-lg md:px-2.5 md:py-2';
const LOCK = 'flex size-4 cursor-pointer items-center justify-center rounded opacity-0 ring-foreground/60 transition-opacity outline-none group-focus-within/picker:opacity-100 group-hover/picker:opacity-100 focus:opacity-100 focus-visible:ring-1 data-[locked=true]:opacity-100 max-md:hidden pointer-coarse:hidden absolute top-1/2 right-8 -translate-y-1/2';
const LOCK_BODY = 'M4.26781 18.8447C4.49269 20.515 5.87613 21.8235 7.55966 21.9009C8.97627 21.966 10.4153 22 12 22C13.5847 22 15.0237 21.966 16.4403 21.9009C18.1239 21.8235 19.5073 20.515 19.7322 18.8447C19.879 17.7547 20 16.6376 20 15.5C20 14.3624 19.879 13.2453 19.7322 12.1553C19.5073 10.485 18.1239 9.17649 16.4403 9.09909C15.0237 9.03397 13.5847 9 12 9C10.4153 9 8.97627 9.03397 7.55966 9.09909C5.87613 9.17649 4.49269 10.485 4.26781 12.1553C4.12104 13.2453 4 14.3624 4 15.5C4 16.6376 4.12104 17.7547 4.26781 18.8447Z';
const LOCK_SHACKLE = 'M7.5 9V6.5C7.5 4.01472 9.51472 2 12 2C14.4853 2 16.5 4.01472 16.5 6.5V9';
const UNLOCK_SHACKLE = 'M7.5 9V6.5C7.5 4.01472 9.51472 2 12 2C13.9593 2 15.5 3.5 16 5';
const MENU_POPUP = 'cn-menu-target z-50 no-scrollbar max-h-(--available-height) w-[calc(var(--available-width)-(--spacing(6)))] min-w-32 origin-(--transform-origin) translate-y-2 overflow-x-hidden overflow-y-auto rounded-xl border-0 bg-neutral-950/80 p-1.5 text-neutral-100 ring-1 ring-neutral-950/80 backdrop-blur-xl outline-none md:w-52 dark:bg-neutral-800/90 dark:ring-neutral-700/50 data-closed:overflow-hidden';
const MENU_ITEM = "group/dropdown-menu-item relative flex cursor-default items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-medium outline-hidden select-none **:text-neutral-100 focus:bg-neutral-600 focus:text-neutral-100 focus:**:text-neutral-100 data-inset:pl-8 dark:focus:bg-neutral-700/80 pointer-coarse:gap-3 pointer-coarse:py-2.5 pointer-coarse:pl-3 pointer-coarse:text-base data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4";
const RADIO_ITEM = "relative flex cursor-default items-center gap-2 rounded-lg py-1.5 pr-8 pl-2 text-sm font-medium outline-hidden select-none **:text-neutral-100 focus:bg-neutral-600 focus:text-neutral-100 focus:**:text-neutral-100 data-inset:pl-8 dark:focus:bg-neutral-700/80 pointer-coarse:gap-3 pointer-coarse:py-2.5 pointer-coarse:pl-3 pointer-coarse:text-base data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4";
const SHORTCUT = 'ml-auto text-xs tracking-widest text-neutral-400! group-focus/dropdown-menu-item:text-neutral-100';
const SEPARATOR = '-mx-1.5 my-1.5 h-px bg-neutral-600 dark:bg-neutral-700';
const FOCUS_GUARD = 'clip-path: inset(50%); overflow: hidden; white-space: nowrap; border: 0px; padding: 0px; width: 1px; height: 1px; margin: -1px; position: fixed; top: 0px; left: 0px;';
const HIDDEN_OWNER = 'clip-path: inset(50%); position: fixed; top: 0px; left: 0px;';
const POSITIONER = 'position: absolute; left: 0px; top: 0px;';
const CODE = 'scrollbar-none overflow-x-auto p-3 font-mono text-sm leading-relaxed';
const OUTLINE_BUTTON = "group/button inline-flex shrink-0 items-center justify-center border bg-clip-padding font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 border-border bg-background hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50 h-7 gap-1 rounded-[min(var(--radius-md),12px)] px-2.5 text-[0.8rem] in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5 w-fit";
const TAB = "relative inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-1.5 py-0.5 text-sm font-medium whitespace-nowrap text-foreground/60 transition-all group-data-vertical/tabs:w-full group-data-vertical/tabs:justify-start hover:text-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 has-data-[icon=inline-end]:pr-1 has-data-[icon=inline-start]:pl-1 aria-disabled:pointer-events-none aria-disabled:opacity-50 dark:text-muted-foreground dark:hover:text-foreground group-data-[variant=default]/tabs-list:data-active:shadow-sm group-data-[variant=line]/tabs-list:data-active:shadow-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 group-data-[variant=line]/tabs-list:bg-transparent group-data-[variant=line]/tabs-list:data-active:bg-transparent dark:group-data-[variant=line]/tabs-list:data-active:border-transparent dark:group-data-[variant=line]/tabs-list:data-active:bg-transparent data-active:bg-background data-active:text-foreground dark:data-active:border-input dark:data-active:bg-input/30 dark:data-active:text-foreground after:absolute after:bg-foreground after:opacity-0 after:transition-opacity group-data-horizontal/tabs:after:inset-x-0 group-data-horizontal/tabs:after:bottom-[-5px] group-data-horizontal/tabs:after:h-0.5 group-data-vertical/tabs:after:inset-y-0 group-data-vertical/tabs:after:-right-1 group-data-vertical/tabs:after:w-0.5 group-data-[variant=line]/tabs-list:data-active:after:opacity-100";
const SELECT_TRIGGER = "flex w-fit items-center justify-between gap-1.5 rounded-lg border border-input bg-transparent py-2 pr-2 pl-2.5 text-sm whitespace-nowrap transition-colors outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 data-placeholder:text-muted-foreground data-[size=default]:h-8 data-[size=sm]:h-7 data-[size=sm]:rounded-[min(var(--radius-md),10px)] *:data-[slot=select-value]:line-clamp-1 *:data-[slot=select-value]:flex *:data-[slot=select-value]:items-center *:data-[slot=select-value]:gap-1.5 dark:bg-input/30 dark:hover:bg-input/50 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4";
const SELECT_ITEM = "relative flex w-full cursor-default items-center gap-1.5 rounded-md py-1 pr-8 pl-1.5 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground not-data-[variant=destructive]:focus:**:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 *:[span]:last:flex *:[span]:last:items-center *:[span]:last:gap-2";
const SELECT_POPUP = 'cn-menu-target cn-menu-translucent relative isolate z-50 max-h-(--available-height) w-(--anchor-width) min-w-36 origin-(--transform-origin) overflow-x-hidden overflow-y-auto rounded-lg bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10 duration-100 data-[align-trigger=true]:animate-none data-[side=bottom]:slide-in-from-top-2 data-[side=inline-end]:slide-in-from-left-2 data-[side=inline-start]:slide-in-from-right-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95';
const PILL = "inline-flex shrink-0 items-center justify-center whitespace-nowrap outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 hover:bg-accent dark:hover:bg-accent/50 gap-1.5 has-[>svg]:px-2.5 h-7 min-w-7 cursor-pointer rounded-lg px-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground data-[active=true]:bg-accent data-[active=true]:text-accent-foreground";
const TOOLTIP = 'z-50 inline-flex w-fit max-w-xs origin-(--transform-origin) items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-xs text-background has-data-[slot=kbd]:pr-1.5 data-[side=bottom]:slide-in-from-top-2 data-[side=inline-end]:slide-in-from-left-2 data-[side=inline-start]:slide-in-from-right-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 **:data-[slot=kbd]:relative **:data-[slot=kbd]:isolate **:data-[slot=kbd]:z-50 **:data-[slot=kbd]:rounded-sm data-[state=delayed-open]:animate-in data-[state=delayed-open]:fade-in-0 data-[state=delayed-open]:zoom-in-95 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95';
const TOOLTIP_ARROW = 'z-50 size-2.5 translate-y-[calc(-50%-2px)] rotate-45 rounded-[2px] bg-foreground fill-foreground data-[side=bottom]:top-1 data-[side=inline-end]:top-1/2! data-[side=inline-end]:-left-1 data-[side=inline-end]:-translate-y-1/2 data-[side=inline-start]:top-1/2! data-[side=inline-start]:-right-1 data-[side=inline-start]:-translate-y-1/2 data-[side=left]:top-1/2! data-[side=left]:-right-1 data-[side=left]:-translate-y-1/2 data-[side=right]:top-1/2! data-[side=right]:-left-1 data-[side=right]:-translate-y-1/2 data-[side=top]:-bottom-2.5';

const OPTIONS_OF: Readonly<Record<string, readonly { readonly value: string; readonly label: string }[]>> = { measure: TYPESET_MEASURES, scale: TYPESET_SIZES, leading: TYPESET_LEADINGS, flow: TYPESET_FLOWS };

const valueOf = (params: TypesetParams, param: string): string => params[param as keyof TypesetParams];
const labelOf = (options: readonly { readonly value: string; readonly label: string }[], value: string) => options.find((o) => o.value === value)?.label ?? '';
const bodyFontOf = (body: string) => findFont(body) ?? FONTS[0]!;
const fontOf = (params: TypesetParams, param: string) => {
	const value = valueOf(params, param);
	return param === 'heading' && value === 'inherit' ? bodyFontOf(params.body) : (findFont(value) ?? bodyFontOf(params.body));
};

/** The designer: docs panel, preview and customizer, standing in for the old page's `[data-slot=designer]`. */
export default function Typeset() @{
	const t = typesetState();
	const openHref = computed(() => serializeParams(`/preview/typeset/${t.params.item}`, t.params));

	<div
		data-slot="designer"
		class="flex min-h-0 flex-1 flex-col items-start gap-(--gap) p-(--gap) pt-[calc(var(--gap)*0.25)] md:flex-row-reverse"
		attach={(el) => start(el)}
		onIdle={() => {}}
		onTypesetcommand={(event) => {
			const command = (event as CustomEvent<string>).detail;
			if (command === 'load') {
				t.show(now());
				t.ready = true;
				t.mobile = isMobile();
				t.mac = isMac();
				t.packageManager = packageManager();
				// The docs panel fetches the stylesheet as it mounts; Copy typeset.css waits for it.
				void typesetCss().then(() => (t.css = true));
			} else if (command === 'viewport') t.mobile = isMobile();
			else if (command === 'shuffle') t.show(commit(shuffled(t.locks as never)));
			else if (command === 'reset') t.show(commit(null));
			else if (command === 'undo') t.show(undo());
			else if (command === 'redo') t.show(redo());
			else if (command === 'toggle-theme') followStoredTheme();
		}}
	>
		<div class="hidden w-88 flex-col items-start gap-3 xl:flex 2xl:w-104">
			<div class="isolate flex max-h-[calc(100vh-16rem)] w-full flex-col overflow-hidden rounded-2xl bg-background ring-1 ring-foreground/10">
				<TypesetDocs where="panel" />
			</div>
			<a role="button" tabindex="0" data-slot="button" class="group/button inline-flex shrink-0 items-center justify-center border border-transparent bg-clip-padding font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 underline-offset-4 hover:underline h-7 gap-1 rounded-[min(var(--radius-md),12px)] px-2.5 text-[0.8rem] in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5 text-muted-foreground" href="/docs/typeset">Read the docs</a>
		</div>
		<div class="relative isolate flex size-full min-h-0 flex-1 overflow-hidden rounded-2xl bg-background ring-1 ring-foreground/10">
			<iframe src={t.ready ? t.previewSrc : undefined} title="typeset preview" class="size-full"></iframe>
			<div class="absolute bottom-3 left-1/2 z-20 flex -translate-x-1/2 items-center justify-center gap-1.5">
				<div class="dark flex items-center gap-1 rounded-xl bg-card/90 p-1 shadow-xl backdrop-blur-xl">
					<ItemPill item="docs" number="01" />
					<ItemPill item="chat" number="02" />
					<ItemPill item="article" number="03" />
					<ItemPill item="changelog" number="04" />
					<ItemPill item="notes" number="05" />
				</div>
				<div class="dark flex items-center gap-1 rounded-xl bg-card/90 p-1 shadow-xl backdrop-blur-xl">
					<a href={openHref} target="_blank" rel="noreferrer" data-slot="button" data-variant="ghost" data-size="sm" class="inline-flex shrink-0 items-center justify-center whitespace-nowrap outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 hover:bg-accent dark:hover:bg-accent/50 gap-1.5 has-[>svg]:px-2.5 h-7 cursor-pointer rounded-lg px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground">
						<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" color="currentColor" class="size-3.5 md:hidden" stroke-width="2" stroke="currentColor"><path d="M11.0991 3.00012C7.45013 3.00669 5.53932 3.09629 4.31817 4.31764C3.00034 5.63568 3.00034 7.75704 3.00034 11.9997C3.00034 16.2424 3.00034 18.3638 4.31817 19.6818C5.63599 20.9999 7.75701 20.9999 11.9991 20.9999C16.241 20.9999 18.3621 20.9999 19.6799 19.6818C20.901 18.4605 20.9906 16.5493 20.9972 12.8998" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"></path><path d="M20.556 3.49612L11.0487 13.0586M20.556 3.49612C20.062 3.00151 16.7343 3.04761 16.0308 3.05762M20.556 3.49612C21.05 3.99074 21.0039 7.32273 20.9939 8.02714" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"></path></svg>
						<span class="max-md:sr-only">Open in New Tab</span>
					</a>
				</div>
			</div>
		</div>
		<div id="typeset-customizer" data-slot="card" data-size="sm" class="group/card flex flex-col gap-(--card-spacing) overflow-hidden py-(--card-spacing) text-sm text-card-foreground ring-1 ring-foreground/10 [--card-spacing:--spacing(4)] has-data-[slot=card-footer]:pb-0 has-[>img:first-child]:pt-0 data-[size=sm]:[--card-spacing:--spacing(3)] data-[size=sm]:has-data-[slot=card-footer]:pb-0 *:[img:first-child]:rounded-t-xl *:[img:last-child]:rounded-b-xl dark isolate z-10 max-h-full min-h-0 w-full self-start rounded-2xl bg-card/90 backdrop-blur-xl md:w-(--customizer-width)">
			<div data-slot="card-header" class="group/card-header @container/card-header auto-rows-min rounded-t-xl px-(--card-spacing) has-data-[slot=card-action]:grid-cols-[1fr_auto] has-data-[slot=card-description]:grid-rows-[auto_auto] [.border-b]:pb-(--card-spacing) hidden items-center justify-between gap-2 border-b md:flex">
				<button type="button" tabindex="0" aria-haspopup="menu" id="typeset-menu" data-slot="dropdown-menu-trigger" class="relative w-36 shrink-0 touch-manipulation p-3 select-none hover:bg-muted focus-visible:ring-foreground/50 focus-visible:outline-none disabled:opacity-50 data-popup-open:bg-muted md:w-full md:rounded-lg md:px-2.5 md:py-2 flex items-center justify-between gap-2 rounded-lg px-1.75 ring-1 ring-foreground/10 focus-visible:ring-1" aria-expanded="false">
					<span class="font-medium">Menu</span>
					<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" color="currentColor" class="size-5" stroke-width="2" stroke="currentColor"><path d="M4 8.5L20 8.5" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"></path><path d="M4 15.5L20 15.5" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"></path></svg>
				</button>
				<span aria-owns="typeset-menu-popup" style={HIDDEN_OWNER} hidden data-mm-shown-with="typeset-menu"></span>
			</div>
			<div data-slot="card-content" class="px-(--card-spacing) no-scrollbar min-h-0 flex-1 overflow-x-auto overflow-y-hidden max-md:px-0 md:overflow-y-auto">
				<div data-slot="field-group" class="group/field-group @container/field-group flex w-full data-[slot=checkbox-group]:gap-3 *:data-[slot=field-group]:gap-4 flex-row gap-2.5 py-px **:data-[slot=field-separator]:-mx-4 **:data-[slot=field-separator]:w-auto max-md:px-3 md:flex-col md:gap-3.25">
					<OptionPicker param="measure" label="Measure" wrapper="group/picker relative max-[28rem]:hidden" icon="measure" />
					<Separator />
					<FontPicker param="heading" label="Heading" />
					<FontPicker param="body" label="Body" />
					<FontPicker param="mono" label="Mono" />
					<Separator />
					<OptionPicker param="scale" label="Size" wrapper="group/picker relative" icon="scale" />
					<OptionPicker param="leading" label="Leading" wrapper="group/picker relative" icon="leading" />
					<OptionPicker param="flow" label="Flow" wrapper="group/picker relative" icon="flow" />
					<div aria-hidden="true" class="w-0.5 shrink-0 md:hidden"></div>
				</div>
			</div>
			<div data-slot="card-footer" class="items-center rounded-b-xl bg-muted/50 p-(--card-spacing) flex min-w-0 flex-row-reverse gap-2 border-t md:flex-col md:**:[button]:w-full">
				<button type="button" tabindex="0" data-slot="button" class="group/button inline-flex items-center justify-center rounded-lg border bg-clip-padding text-sm font-medium whitespace-nowrap outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 border-border bg-background hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50 h-8 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 touch-manipulation bg-transparent! px-2! py-0! text-sm! transition-none select-none hover:bg-muted! pointer-coarse:h-10! min-w-0 flex-1 md:flex-none" onClick={() => t.show(commit(shuffled(t.locks as never)))}>
					<span class="w-full truncate text-center font-medium">Shuffle</span>
				</button>
				<button type="button" tabindex="0" data-slot="drawer-trigger" data-base-ui-click-trigger="" id="typeset-get-code" aria-haspopup="dialog" aria-expanded="false" class="group/button inline-flex items-center justify-center rounded-lg border bg-clip-padding text-sm font-medium whitespace-nowrap outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 border-border bg-background hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50 h-8 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 min-w-0 flex-1 touch-manipulation bg-transparent! px-2! py-0! text-sm! transition-none select-none hover:bg-muted! md:flex-none xl:hidden pointer-coarse:h-10!" data-mm-disable-pointer-dismissal="false">Get Code</button>
			</div>
		</div>
	</div>
}

/** ItemPill: a specimen's number, active while the preview shows it. */
function ItemPill({ item, number }: { readonly item: string; readonly number: string }) @{
	const t = typesetState();
	const active = computed(() => t.params.item === item);

	<button data-slot="tooltip-trigger" data-variant="ghost" data-size="sm" class={PILL} data-active={active ? 'true' : 'false'} id={`typeset-item-${item}`} data-base-ui-tooltip-trigger="" onClick={() => t.show(commit({ item }))}>{number}</button>
}

/** DocsCommand's package manager tabs (use-config): the command reads as the chosen one writes it. */
function PackageManagerButton({ pm }: { readonly pm: string }) @{
	const t = typesetState();
	const active = computed(() => t.packageManager === pm);

	<button type="button" data-active={active ? 'true' : 'false'} class="font-mono text-xs text-muted-foreground transition-colors hover:text-foreground data-[active=true]:text-foreground" onClick={(event) => {
		// The button's own text: a prop read here takes the last instance's value (two docs panels of four buttons each).
		const chosen = (event.target as Element).closest('button')?.textContent ?? pm;
		choosePackageManager(chosen);
		t.packageManager = chosen;
	}}>{pm}</button>
}

function Separator() @{
	<div data-slot="field-separator" data-content="false" class="relative -my-2 h-5 text-sm group-data-[variant=outline]/field-group:-mb-2 hidden md:block">
		<div data-orientation="horizontal" role="separator" aria-orientation="horizontal" data-slot="separator" class="shrink-0 bg-border data-horizontal:h-px data-horizontal:w-full data-vertical:w-px data-vertical:self-stretch absolute inset-0 top-1/2"></div>
	</div>
}

function OptionPicker({ param, label, wrapper, icon }: { readonly param: string; readonly label: string; readonly wrapper: string; readonly icon: string }) @{
	const t = typesetState();
	const current = computed(() => labelOf(OPTIONS_OF[param] ?? [], valueOf(t.params, param)));

	<div class={wrapper}>
		<button type="button" tabindex="0" aria-haspopup="menu" id={`typeset-${param}`} data-slot="dropdown-menu-trigger" data-typeset-picker="" class={PICKER_TRIGGER} aria-expanded="false">
			<div class="flex min-w-0 flex-col justify-start pr-8 text-left">
				<div class="text-xs text-muted-foreground">{label}</div>
				<div class="line-clamp-1 text-sm font-medium text-foreground">{current}</div>
			</div>
			<div class="pointer-events-none absolute top-1/2 right-4 flex size-4 -translate-y-1/2 items-center justify-center text-foreground select-none md:right-2.5">
				<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" color="currentColor" class="size-4.5" stroke-width="2" stroke="currentColor" hidden={icon !== 'measure'}><path d="M5 9C4.39316 9.58984 2 11.1597 2 12C2 12.8403 4.39316 14.4102 5 15" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"></path><path d="M19 9C19.6068 9.58984 22 11.1597 22 12C22 12.8403 19.6068 14.4102 19 15" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"></path><path d="M2.42285 11.9795H21.868" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"></path></svg>
				<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" color="currentColor" class="size-4.5" stroke-width="2" stroke="currentColor" hidden={icon !== 'scale'}><path d="M10.5714 18H5.42857M8 3V18M8 3C6.81082 3 5.28326 3.12265 4.06709 3.24346C3.55271 3.29456 3.29552 3.32011 3.06788 3.41021C2.59438 3.59763 2.21271 4.00855 2.06906 4.48556C2 4.71489 2 4.97659 2 5.5M8 3C9.18918 3 10.7167 3.12265 11.9329 3.24346C12.4473 3.29456 12.7045 3.32011 12.9321 3.41021C13.4056 3.59763 13.7873 4.00855 13.9309 4.48556C14 4.71489 14 4.97659 14 5.5" stroke="currentColor" stroke-linecap="round" stroke-width="2"></path><path d="M19.7143 21H16.2857M18 12V21M18 12C17.2072 12 16.1888 12.0818 15.3781 12.1623C15.0351 12.1964 14.8637 12.2134 14.7119 12.2735C14.3963 12.3984 14.1418 12.6724 14.046 12.9904C14 13.1433 14 13.3177 14 13.6667M18 12C18.7928 12 19.8112 12.0818 20.6219 12.1623C20.9649 12.1964 21.1363 12.2134 21.2881 12.2735C21.6037 12.3984 21.8582 12.6724 21.954 12.9904C22 13.1433 22 13.3177 22 13.6667" stroke="currentColor" stroke-linecap="round" stroke-width="2"></path></svg>
				<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" color="currentColor" class="size-4.5" stroke-width="2" stroke="currentColor" hidden={icon !== 'leading'}><path d="M4.5 3.5H19.5" stroke="currentColor" stroke-linecap="round" stroke-width="2"></path><path d="M4.5 20.5H19.5" stroke="currentColor" stroke-linecap="round" stroke-width="2"></path><path d="M17 17L14.8905 11.4741C13.9109 8.90801 13.4211 7.625 12.625 7.625C11.8289 7.625 11.3391 8.90801 10.3595 11.4741L8.25 17" stroke="currentColor" stroke-linecap="round" stroke-width="2"></path><path d="M9.5 13H15.75" stroke="currentColor" stroke-linecap="round" stroke-width="2"></path></svg>
				<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" color="currentColor" class="size-4.5" stroke-width="2" stroke="currentColor" hidden={icon !== 'flow'}><path d="M3 2H21" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"></path><path d="M3 22H21" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"></path><path d="M9.47266 8.50877L11.2737 6.37445C11.6424 5.93292 12.2676 5.92911 12.6732 6.37445L14.4529 8.50877M11.9734 7.08442V11.4079L11.9719 16.9993M14.4727 15.575L12.6716 17.7093C12.3029 18.1508 11.6777 18.1546 11.2721 17.7093L9.4924 15.575" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"></path></svg>
			</div>
		</button>
		<LockButton param={param} />
		<span aria-owns={`typeset-${param}-popup`} style={HIDDEN_OWNER} hidden data-mm-shown-with={`typeset-${param}`}></span>
	</div>
}

function FontPicker({ param, label }: { readonly param: string; readonly label: string }) @{
	const t = typesetState();
	const name = computed(() => fontOf(t.params, param).label);
	const face = computed(() => `font-family: ${fontOf(t.params, param).value};`);

	<div class="group/picker relative">
		<button type="button" tabindex="0" aria-haspopup="menu" id={`typeset-${param}`} data-slot="dropdown-menu-trigger" data-typeset-picker="" class={PICKER_TRIGGER} aria-expanded="false">
			<div class="flex flex-col justify-start text-left">
				<div class="text-xs text-muted-foreground">{label}</div>
				<div class="line-clamp-1 max-w-[80%] truncate text-sm font-medium text-foreground">{name}</div>
			</div>
			<div class="pointer-events-none absolute top-1/2 right-4 flex size-4 -translate-y-1/2 items-center justify-center text-base text-foreground select-none md:right-2.5" style={face}>Aa</div>
		</button>
		<LockButton param={param} />
		<span aria-owns={`typeset-${param}-popup`} style={HIDDEN_OWNER} hidden data-mm-shown-with={`typeset-${param}`}></span>
	</div>
}

function LockButton({ param }: { readonly param: string }) @{
	const t = typesetState();
	const locked = computed(() => t.locks.includes(param));

	<button type="button" title={locked ? 'Unlock' : 'Lock'} aria-label={locked ? 'Unlock' : 'Lock'} data-locked={locked ? 'true' : 'false'} class={LOCK} onClick={() => (t.locks = t.locks.includes(param) ? t.locks.filter((p) => p !== param) : [...t.locks, param])}>
		<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" color="currentColor" class="size-5 text-foreground" stroke-width="2" stroke="currentColor">
			<path d={LOCK_BODY} stroke="currentColor" stroke-width="2"></path>
			<path d={locked ? LOCK_SHACKLE : UNLOCK_SHACKLE} stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"></path>
			<path d="M11.9961 15.5H12.0051" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"></path>
		</svg>
	</button>
}

/** docs-panel.tsx's TypesetDocsContent: the Docs and Prompt tabs, for the panel or the Get Code drawer. */
function TypesetDocs({ where }: { readonly where: string }) @{
	const t = typesetState();
	let tab = state(0);
	let direction = state('none');
	let copiedCss = state(false);
	let copiedPrompt = state(false);
	const framework = computed(() => (where === 'drawer' ? t.drawerFramework : t.panelFramework));
	const frameworkLabel = computed(() => labelOf(FRAMEWORKS, where === 'drawer' ? t.drawerFramework : t.panelFramework));
	const docs = computed(() => typesetDocs(t.params, where === 'drawer' ? t.drawerFramework : t.panelFramework, APP_URL));
	const nextFontCode = computed(() => docs.nextFontCode);
	const fontsourceCss = computed(() => docs.fontsourceCss);
	const command = computed(() => commandFor(t.packageManager as never, docs.fontsourceCommand));
	const preset = computed(() => docs.preset);
	const usage = computed(() => docs.usage);
	const prompt = computed(() => docs.prompt);

	<div data-orientation="horizontal" data-activation-direction={direction} data-slot="tabs" class="group/tabs data-horizontal:flex-col flex min-h-0 flex-1 flex-col gap-0">
		<div class="flex items-center justify-between gap-2 border-b px-4 py-3">
			<div data-orientation="horizontal" role="tablist" data-slot="tabs-list" data-variant="default" class="group/tabs-list inline-flex w-fit items-center justify-center rounded-lg p-[3px] text-muted-foreground group-data-horizontal/tabs:h-8 group-data-vertical/tabs:h-fit group-data-vertical/tabs:flex-col data-[variant=line]:rounded-none bg-muted" data-activation-direction={direction}>
				<button type="button" data-orientation="horizontal" aria-disabled="false" role="tab" id={`typeset-${where}-docs-tab`} data-slot="tabs-trigger" class={TAB} aria-controls={`typeset-${where}-docs`} aria-selected={tab === 0 ? 'true' : 'false'} tabindex={tab === 0 ? '0' : '-1'} data-active={tab === 0 ? '' : undefined} data-composite-item-active={tab === 0 ? '' : undefined} data-activation-direction={direction} onClick={() => {
					direction = 0 > tab ? 'right' : 0 < tab ? 'left' : direction;
					tab = 0;
				}} onKeyDown={(event) => {
					if (event.key === 'Enter' || event.key === ' ') {
						event.preventDefault();
						direction = 0 > tab ? 'right' : 0 < tab ? 'left' : direction;
						tab = 0;
					} else roving(event);
				}}>Docs</button>
				<button type="button" data-orientation="horizontal" aria-disabled="false" role="tab" id={`typeset-${where}-prompt-tab`} data-slot="tabs-trigger" class={TAB} aria-controls={`typeset-${where}-prompt`} aria-selected={tab === 1 ? 'true' : 'false'} tabindex={tab === 1 ? '0' : '-1'} data-active={tab === 1 ? '' : undefined} data-composite-item-active={tab === 1 ? '' : undefined} data-activation-direction={direction} onClick={() => {
					direction = 1 > tab ? 'right' : 1 < tab ? 'left' : direction;
					tab = 1;
				}} onKeyDown={(event) => {
					if (event.key === 'Enter' || event.key === ' ') {
						event.preventDefault();
						direction = 1 > tab ? 'right' : 1 < tab ? 'left' : direction;
						tab = 1;
					} else roving(event);
				}}>Prompt</button>
			</div>
			<button type="button" tabindex="0" id={`typeset-${where}-framework`} role="combobox" aria-expanded="false" aria-haspopup="listbox" data-slot="select-trigger" data-size="sm" class={SELECT_TRIGGER} onMmchoose={(event) => {
				const value = FRAMEWORKS.find((f) => f.label === (event as CustomEvent<string>).detail)?.value ?? 'next';
				if (where === 'drawer') t.drawerFramework = value;
				else t.panelFramework = value;
			}}>
				<span data-slot="select-value" class="flex flex-1 text-left">{frameworkLabel}</span>
				<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-chevron-down pointer-events-none size-4 text-muted-foreground" aria-hidden="true"><path d="m6 9 6 6 6-6"></path></svg>
			</button>
			<input tabindex="-1" aria-hidden="true" value={framework} style="clip-path: inset(50%); overflow: hidden; white-space: nowrap; border: 0px; padding: 0px; width: 1px; height: 1px; margin: -1px; position: fixed; top: 0px; left: 0px;" />
			<span aria-owns={`typeset-${where}-framework-popup`} style={HIDDEN_OWNER} hidden data-mm-shown-with={`typeset-${where}-framework`}></span>
		</div>
		<div class="min-h-0 flex-1 scroll-fade scrollbar-none overflow-y-auto p-4 md:p-6">
			<div data-orientation="horizontal" data-activation-direction={direction} id={`typeset-${where}-docs`} role="tabpanel" tabindex="0" data-index="0" data-slot="tabs-content" class="flex-1 text-sm outline-none flex flex-col gap-6" aria-labelledby={`typeset-${where}-docs-tab`} hidden={tab !== 0}>
				<section class="flex flex-col gap-2.5">
					<h3 class="text-sm font-medium">1. Create typeset.css</h3>
					<p class="text-sm leading-relaxed text-muted-foreground">{'Copy the stylesheet into a '}<code class="font-mono">typeset.css</code>{' file next to your main CSS file, then import it:'}</p>
					<button type="button" tabindex="0" data-slot="button" class={OUTLINE_BUTTON} disabled={!t.css} onClick={() => {
						void copyText(typesetCss()).then(() => {
							copiedCss = true;
							setTimeout(() => (copiedCss = false), 2000);
						});
					}}>
						<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-check" data-icon="inline-start" hidden={!copiedCss}><path d="M20 6 9 17l-5-5"></path></svg>
						<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-copy" data-icon="inline-start" hidden={copiedCss}><rect width="14" height="14" x="8" y="8" rx="2" ry="2"></rect><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"></path></svg>
						Copy typeset.css
					</button>
					<div class="relative rounded-lg bg-muted/60">
						<pre class={CODE}>{'@import "tailwindcss";\n@import "./typeset.css";'}</pre>
					</div>
				</section>
				<section class="flex flex-col gap-2.5">
					<h3 class="text-sm font-medium">2. Add the fonts</h3>
					<p class="text-sm leading-relaxed text-muted-foreground" hidden={framework !== 'next'}>{'Load the fonts with '}<code class="font-mono">next/font</code>{' in your root layout:'}</p>
					<div class="relative rounded-lg bg-muted/60" hidden={framework !== 'next'}>
						<pre class={CODE}>{nextFontCode}</pre>
					</div>
					<div class="rounded-lg bg-muted/60" hidden={framework === 'next'}>
						<div class="flex items-center gap-3 px-3 pt-2">
							<PackageManagerButton pm="pnpm" />
							<PackageManagerButton pm="npm" />
							<PackageManagerButton pm="yarn" />
							<PackageManagerButton pm="bun" />
						</div>
						<pre class="scrollbar-none overflow-x-auto p-3 font-mono text-xs leading-relaxed">{command}</pre>
					</div>
					<p class="text-sm leading-relaxed text-muted-foreground" hidden={framework === 'next'}>Then import them in your CSS file:</p>
					<div class="relative rounded-lg bg-muted/60" hidden={framework === 'next'}>
						<pre class={CODE}>{fontsourceCss}</pre>
					</div>
				</section>
				<section class="flex flex-col gap-2.5">
					<h3 class="text-sm font-medium">3. Create your custom typeset</h3>
					<div class="relative rounded-lg bg-muted/60">
						<pre class={CODE}>{preset}</pre>
					</div>
				</section>
				<section class="flex flex-col gap-2.5">
					<h3 class="text-sm font-medium">4. Wrap your content</h3>
					<div class="relative rounded-lg bg-muted/60">
						<pre class={CODE}>{usage}</pre>
					</div>
				</section>
			</div>
			<div data-orientation="horizontal" data-activation-direction={direction} id={`typeset-${where}-prompt`} role="tabpanel" tabindex="0" data-index="1" data-slot="tabs-content" class="flex-1 text-sm outline-none flex flex-col gap-2.5" aria-labelledby={`typeset-${where}-prompt-tab`} hidden={tab !== 1}>
				<p class="text-sm leading-relaxed text-muted-foreground">One prompt with your picks baked in. Copy it and paste it into your coding agent.</p>
				<div class="relative rounded-lg bg-muted/60">
					<pre class="scrollbar-none overflow-x-auto p-3 font-mono text-sm leading-relaxed max-h-102 scroll-fade overflow-y-auto whitespace-pre-wrap">{prompt}</pre>
				</div>
				<button type="button" tabindex="0" data-slot="button" class={OUTLINE_BUTTON} onClick={() => {
					void copyText(typesetDocs(t.params, where === 'drawer' ? t.drawerFramework : t.panelFramework, APP_URL).prompt).then(() => {
						copiedPrompt = true;
						setTimeout(() => (copiedPrompt = false), 2000);
					});
				}}>
					<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-check" data-icon="inline-start" hidden={!copiedPrompt}><path d="M20 6 9 17l-5-5"></path></svg>
					<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-copy" data-icon="inline-start" hidden={copiedPrompt}><rect width="14" height="14" x="8" y="8" rx="2" ry="2"></rect><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"></path></svg>
					Copy Prompt
				</button>
			</div>
		</div>
	</div>
}

/** What the designer's controls portal to the end of the body, as the old page's portals did. */
export function Layers() @{
	<>
		<MainMenu />
		<MenuShell param="measure" tall={false}>
			<RadioRow param="measure" value="60" label="60ch" />
			<RadioRow param="measure" value="70" label="70ch" />
			<RadioRow param="measure" value="80" label="80ch" />
			<RadioRow param="measure" value="90" label="90ch" />
		</MenuShell>
		<MenuShell param="heading" tall={true}>
			<div role="group" data-slot="dropdown-menu-group">
				<RadioRow param="heading" value="inherit" label="" />
			</div>
			<div data-orientation="horizontal" role="separator" aria-orientation="horizontal" data-slot="dropdown-menu-separator" class={SEPARATOR}></div>
			<div role="group" data-slot="dropdown-menu-group" aria-labelledby="typeset-heading-Sans">
				<div id="typeset-heading-Sans" role="presentation" data-slot="dropdown-menu-label" class="px-2 py-1.5 text-xs font-medium text-neutral-400 data-inset:pl-8">Sans</div>
				<RadioRow param="heading" value="geist" label="Geist" />
				<RadioRow param="heading" value="inter" label="Inter" />
				<RadioRow param="heading" value="noto-sans" label="Noto Sans" />
				<RadioRow param="heading" value="nunito-sans" label="Nunito Sans" />
				<RadioRow param="heading" value="figtree" label="Figtree" />
				<RadioRow param="heading" value="roboto" label="Roboto" />
				<RadioRow param="heading" value="raleway" label="Raleway" />
				<RadioRow param="heading" value="dm-sans" label="DM Sans" />
				<RadioRow param="heading" value="public-sans" label="Public Sans" />
				<RadioRow param="heading" value="outfit" label="Outfit" />
				<RadioRow param="heading" value="oxanium" label="Oxanium" />
				<RadioRow param="heading" value="manrope" label="Manrope" />
				<RadioRow param="heading" value="space-grotesk" label="Space Grotesk" />
				<RadioRow param="heading" value="montserrat" label="Montserrat" />
				<RadioRow param="heading" value="ibm-plex-sans" label="IBM Plex Sans" />
				<RadioRow param="heading" value="source-sans-3" label="Source Sans 3" />
				<RadioRow param="heading" value="instrument-sans" label="Instrument Sans" />
			</div>
			<div role="group" data-slot="dropdown-menu-group" aria-labelledby="typeset-heading-Serif">
				<div id="typeset-heading-Serif" role="presentation" data-slot="dropdown-menu-label" class="px-2 py-1.5 text-xs font-medium text-neutral-400 data-inset:pl-8">Serif</div>
				<RadioRow param="heading" value="noto-serif" label="Noto Serif" />
				<RadioRow param="heading" value="roboto-slab" label="Roboto Slab" />
				<RadioRow param="heading" value="merriweather" label="Merriweather" />
				<RadioRow param="heading" value="lora" label="Lora" />
			</div>
			<div role="group" data-slot="dropdown-menu-group" aria-labelledby="typeset-heading-Mono">
				<div id="typeset-heading-Mono" role="presentation" data-slot="dropdown-menu-label" class="px-2 py-1.5 text-xs font-medium text-neutral-400 data-inset:pl-8">Mono</div>
				<RadioRow param="heading" value="jetbrains-mono" label="JetBrains Mono" />
				<RadioRow param="heading" value="geist-mono" label="Geist Mono" />
			</div>
		</MenuShell>
		<MenuShell param="body" tall={true}>
			<div role="group" data-slot="dropdown-menu-group" aria-labelledby="typeset-body-Sans">
				<div id="typeset-body-Sans" role="presentation" data-slot="dropdown-menu-label" class="px-2 py-1.5 text-xs font-medium text-neutral-400 data-inset:pl-8">Sans</div>
				<RadioRow param="body" value="geist" label="Geist" />
				<RadioRow param="body" value="inter" label="Inter" />
				<RadioRow param="body" value="noto-sans" label="Noto Sans" />
				<RadioRow param="body" value="nunito-sans" label="Nunito Sans" />
				<RadioRow param="body" value="figtree" label="Figtree" />
				<RadioRow param="body" value="roboto" label="Roboto" />
				<RadioRow param="body" value="raleway" label="Raleway" />
				<RadioRow param="body" value="dm-sans" label="DM Sans" />
				<RadioRow param="body" value="public-sans" label="Public Sans" />
				<RadioRow param="body" value="outfit" label="Outfit" />
				<RadioRow param="body" value="oxanium" label="Oxanium" />
				<RadioRow param="body" value="manrope" label="Manrope" />
				<RadioRow param="body" value="space-grotesk" label="Space Grotesk" />
				<RadioRow param="body" value="montserrat" label="Montserrat" />
				<RadioRow param="body" value="ibm-plex-sans" label="IBM Plex Sans" />
				<RadioRow param="body" value="source-sans-3" label="Source Sans 3" />
				<RadioRow param="body" value="instrument-sans" label="Instrument Sans" />
			</div>
			<div role="group" data-slot="dropdown-menu-group" aria-labelledby="typeset-body-Serif">
				<div id="typeset-body-Serif" role="presentation" data-slot="dropdown-menu-label" class="px-2 py-1.5 text-xs font-medium text-neutral-400 data-inset:pl-8">Serif</div>
				<RadioRow param="body" value="noto-serif" label="Noto Serif" />
				<RadioRow param="body" value="roboto-slab" label="Roboto Slab" />
				<RadioRow param="body" value="merriweather" label="Merriweather" />
				<RadioRow param="body" value="lora" label="Lora" />
			</div>
			<div role="group" data-slot="dropdown-menu-group" aria-labelledby="typeset-body-Mono">
				<div id="typeset-body-Mono" role="presentation" data-slot="dropdown-menu-label" class="px-2 py-1.5 text-xs font-medium text-neutral-400 data-inset:pl-8">Mono</div>
				<RadioRow param="body" value="jetbrains-mono" label="JetBrains Mono" />
				<RadioRow param="body" value="geist-mono" label="Geist Mono" />
			</div>
		</MenuShell>
		<MenuShell param="mono" tall={true}>
			<div role="group" data-slot="dropdown-menu-group" aria-labelledby="typeset-mono-Sans">
				<div id="typeset-mono-Sans" role="presentation" data-slot="dropdown-menu-label" class="px-2 py-1.5 text-xs font-medium text-neutral-400 data-inset:pl-8">Sans</div>
				<RadioRow param="mono" value="geist" label="Geist" />
				<RadioRow param="mono" value="inter" label="Inter" />
				<RadioRow param="mono" value="noto-sans" label="Noto Sans" />
				<RadioRow param="mono" value="nunito-sans" label="Nunito Sans" />
				<RadioRow param="mono" value="figtree" label="Figtree" />
				<RadioRow param="mono" value="roboto" label="Roboto" />
				<RadioRow param="mono" value="raleway" label="Raleway" />
				<RadioRow param="mono" value="dm-sans" label="DM Sans" />
				<RadioRow param="mono" value="public-sans" label="Public Sans" />
				<RadioRow param="mono" value="outfit" label="Outfit" />
				<RadioRow param="mono" value="oxanium" label="Oxanium" />
				<RadioRow param="mono" value="manrope" label="Manrope" />
				<RadioRow param="mono" value="space-grotesk" label="Space Grotesk" />
				<RadioRow param="mono" value="montserrat" label="Montserrat" />
				<RadioRow param="mono" value="ibm-plex-sans" label="IBM Plex Sans" />
				<RadioRow param="mono" value="source-sans-3" label="Source Sans 3" />
				<RadioRow param="mono" value="instrument-sans" label="Instrument Sans" />
			</div>
			<div role="group" data-slot="dropdown-menu-group" aria-labelledby="typeset-mono-Serif">
				<div id="typeset-mono-Serif" role="presentation" data-slot="dropdown-menu-label" class="px-2 py-1.5 text-xs font-medium text-neutral-400 data-inset:pl-8">Serif</div>
				<RadioRow param="mono" value="noto-serif" label="Noto Serif" />
				<RadioRow param="mono" value="roboto-slab" label="Roboto Slab" />
				<RadioRow param="mono" value="merriweather" label="Merriweather" />
				<RadioRow param="mono" value="lora" label="Lora" />
			</div>
			<div role="group" data-slot="dropdown-menu-group" aria-labelledby="typeset-mono-Mono">
				<div id="typeset-mono-Mono" role="presentation" data-slot="dropdown-menu-label" class="px-2 py-1.5 text-xs font-medium text-neutral-400 data-inset:pl-8">Mono</div>
				<RadioRow param="mono" value="jetbrains-mono" label="JetBrains Mono" />
				<RadioRow param="mono" value="geist-mono" label="Geist Mono" />
			</div>
		</MenuShell>
		<MenuShell param="scale" tall={false}>
			<RadioRow param="scale" value="14" label="14px" />
			<RadioRow param="scale" value="15" label="15px" />
			<RadioRow param="scale" value="16" label="16px" />
			<RadioRow param="scale" value="18" label="18px" />
		</MenuShell>
		<MenuShell param="leading" tall={false}>
			<RadioRow param="leading" value="1.6" label="Tight (1.6)" />
			<RadioRow param="leading" value="1.75" label="Regular (1.75)" />
			<RadioRow param="leading" value="1.9" label="Loose (1.9)" />
		</MenuShell>
		<MenuShell param="flow" tall={false}>
			<RadioRow param="flow" value="1em" label="Compact (1em)" />
			<RadioRow param="flow" value="1.25em" label="Regular (1.25em)" />
			<RadioRow param="flow" value="2em" label="Airy (2em)" />
		</MenuShell>
		<FrameworkSelect where="panel" />
		<ItemTooltip item="docs" label="Docs" />
		<ItemTooltip item="chat" label="Chat" />
		<ItemTooltip item="article" label="Article" />
		<ItemTooltip item="changelog" label="Changelog" />
		<ItemTooltip item="notes" label="Notes" />
		<GetCodeDrawer />
		<FrameworkSelect where="drawer" />
	</>
}

function MainMenu() @{
	const t = typesetState();

	<div id="typeset-menu-portal" data-base-ui-portal="" hidden data-mm-layer="typeset-menu" data-mm-side-offset="20" data-mm-align-offset="-8">
		<div role="presentation" data-base-ui-inert="" style="position: fixed; inset: 0px; user-select: none;"></div>
		<div data-side="right" data-align="start" role="presentation" class="isolate z-50 outline-none" style={POSITIONER} data-closed="">
			<span data-type="inside" aria-hidden="true" tabindex="0" data-base-ui-focus-guard="" style={FOCUS_GUARD}></span>
			<div data-side="right" data-align="start" tabindex="-1" data-base-ui-focusable="" id="typeset-menu-popup" role="menu" aria-labelledby="typeset-menu" aria-orientation="vertical" data-slot="dropdown-menu-content" class={MENU_POPUP} data-closed="">
				<div role="group" data-slot="dropdown-menu-group">
					<div role="menuitem" tabindex="-1" data-slot="dropdown-menu-item" data-variant="default" class={MENU_ITEM} onClick={() => t.show(commit(shuffled(t.locks as never)))}>{'Shuffle '}<span data-slot="dropdown-menu-shortcut" class={SHORTCUT}>R</span></div>
					<div role="menuitem" tabindex="-1" data-slot="dropdown-menu-item" data-variant="default" class={MENU_ITEM} onClick={() => toggleTheme()}>{'Light/Dark '}<span data-slot="dropdown-menu-shortcut" class={SHORTCUT}>D</span></div>
				</div>
				<div data-orientation="horizontal" role="separator" aria-orientation="horizontal" data-slot="dropdown-menu-separator" class={SEPARATOR}></div>
				<div role="group" data-slot="dropdown-menu-group">
					<div data-disabled={t.canGoBack ? undefined : ''} role="menuitem" aria-disabled={t.canGoBack ? undefined : 'true'} tabindex="-1" data-slot="dropdown-menu-item" data-variant="default" class={MENU_ITEM} onClick={() => t.show(undo())}>{'Undo '}<span data-slot="dropdown-menu-shortcut" class={SHORTCUT}>{t.mac ? '⌘Z' : 'Ctrl+Z'}</span></div>
					<div data-disabled={t.canGoForward ? undefined : ''} role="menuitem" aria-disabled={t.canGoForward ? undefined : 'true'} tabindex="-1" data-slot="dropdown-menu-item" data-variant="default" class={MENU_ITEM} onClick={() => t.show(redo())}>{'Redo '}<span data-slot="dropdown-menu-shortcut" class={SHORTCUT}>{t.mac ? '⇧⌘Z' : 'Ctrl+Shift+Z'}</span></div>
					<div data-orientation="horizontal" role="separator" aria-orientation="horizontal" data-slot="dropdown-menu-separator" class={SEPARATOR}></div>
					<div role="menuitem" tabindex="-1" data-slot="dropdown-menu-item" data-variant="default" class={MENU_ITEM} onClick={() => t.show(commit(null))}>{'Reset '}<span data-slot="dropdown-menu-shortcut" class={SHORTCUT}>⇧R</span></div>
				</div>
			</div>
			<span data-type="inside" aria-hidden="true" tabindex="0" data-base-ui-focus-guard="" style={FOCUS_GUARD}></span>
		</div>
		<div class="absolute inset-y-0 right-0 left-54 z-40 bg-transparent" data-base-ui-inert=""></div>
	</div>
}

/** A picker's menu: Base UI's portal, positioner and popup around its radio group; the menu part opens and places it. */
function MenuShell({ param, tall, children }: { readonly param: string; readonly tall: boolean; readonly children: Children }) @{
	const t = typesetState();
	const side = computed(() => (t.mobile ? 'top' : 'right'));
	const align = computed(() => (t.mobile ? 'center' : 'start'));
	// On a phone the menus are placed against the customizer card (anchorRef), above it.
	const anchor = computed(() => (t.mobile ? 'typeset-customizer' : undefined));

	<div id={`typeset-${param}-portal`} data-base-ui-portal="" hidden data-mm-layer={`typeset-${param}`} data-mm-side-offset="20" data-mm-align-offset="0" data-mm-anchor={anchor}>
		<div role="presentation" data-base-ui-inert="" style="position: fixed; inset: 0px; user-select: none;"></div>
		<div data-side={side} data-align={align} role="presentation" class="isolate z-50 outline-none" style={POSITIONER} data-closed="">
			<span data-type="inside" aria-hidden="true" tabindex="0" data-base-ui-focus-guard="" style={FOCUS_GUARD}></span>
			<div data-side={side} data-align={align} tabindex="-1" data-base-ui-focusable="" id={`typeset-${param}-popup`} role="menu" aria-labelledby={`typeset-${param}`} aria-orientation="vertical" data-slot="dropdown-menu-content" class={tall ? `${MENU_POPUP} max-h-96` : MENU_POPUP} data-closed="" onMouseLeave={() => unhover()}>
				<div role="group" data-slot="dropdown-menu-radio-group">{children}</div>
			</div>
			<span data-type="inside" aria-hidden="true" tabindex="0" data-base-ui-focus-guard="" style={FOCUS_GUARD}></span>
		</div>
		<div class="absolute inset-y-0 right-0 left-54 z-40 bg-transparent" data-base-ui-inert=""></div>
	</div>
}

/** PickerRadioItem: checked when it is the param's value; hovered or focused, it previews in the iframe (onItemPreview). */
function RadioRow({ param, value, label }: { readonly param: string; readonly value: string; readonly label: string }) @{
	const t = typesetState();
	const checked = computed(() => valueOf(t.params, param) === value);
	const text = computed(() => (value === 'inherit' ? bodyFontOf(t.params.body).label : label));

	<div
		data-checked={checked ? '' : undefined}
		data-unchecked={checked ? undefined : ''}
		role="menuitemradio"
		tabindex="-1"
		aria-checked={checked ? 'true' : 'false'}
		data-slot="dropdown-menu-radio-item"
		class={RADIO_ITEM}
		onClick={() => t.show(commit({ [param]: value }))}
		onMouseMove={() => {
			if (!t.mobile) hover({ [param]: value });
		}}
		onFocusIn={() => {
			if (!t.mobile) hover({ [param]: value });
		}}
	>
		<span class="pointer-events-none absolute right-2 flex items-center justify-center" data-slot="dropdown-menu-radio-item-indicator">
			<span data-checked="" aria-hidden="true" hidden={!checked}>
				<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-check size-4 pointer-coarse:size-5"><path d="M20 6 9 17l-5-5"></path></svg>
			</span>
		</span>
		{text}
	</div>
}

function ItemTooltip({ item, label }: { readonly item: string; readonly label: string }) @{
	<div id={`typeset-item-${item}-portal`} data-base-ui-portal="" hidden data-mm-layer={`typeset-item-${item}`} data-mm-side-offset="10" data-mm-align-offset="0">
		<div data-side="top" data-align="center" role="presentation" class="isolate z-50" data-instant="focus" style={POSITIONER} data-closed="">
			<div data-side="top" data-align="center" tabindex="-1" data-base-ui-focusable="" data-slot="tooltip-content" class={TOOLTIP} data-instant="focus" data-closed="">
				{label}
				<div data-side="top" data-align="center" aria-hidden="true" class={TOOLTIP_ARROW} data-instant="focus" style="position: absolute;" data-closed=""></div>
			</div>
		</div>
	</div>
}

function FrameworkSelect({ where }: { readonly where: string }) @{
	const t = typesetState();
	const current = computed(() => (where === 'drawer' ? t.drawerFramework : t.panelFramework));

	<div id={`typeset-${where}-framework-portal`} data-base-ui-portal="" hidden data-mm-layer={`typeset-${where}-framework`} data-mm-side-offset="4" data-mm-align-offset="0">
		<div role="presentation" data-base-ui-inert="" style="position: fixed; inset: 0px; user-select: none;"></div>
		<div data-side="bottom" data-align="end" role="presentation" class="isolate z-50" style={POSITIONER} data-closed="">
			<span data-type="inside" aria-hidden="true" tabindex="0" data-base-ui-focus-guard="" style={FOCUS_GUARD}></span>
			<div data-side="bottom" data-align="end" tabindex="-1" data-base-ui-focusable="" role="presentation" class={SELECT_POPUP} data-slot="select-content" data-align-trigger="false" data-closed="">
				<div id={`typeset-${where}-framework-popup`} role="listbox" class="base-ui-disable-scrollbar">
					<div role="group" data-slot="select-group" class="scroll-my-1 p-1">
						@for (const option of FRAMEWORKS; key option.value) {
							<div data-selected={current === option.value ? '' : undefined} role="option" aria-selected={current === option.value ? 'true' : 'false'} tabindex={current === option.value ? '0' : '-1'} data-slot="select-item" class={SELECT_ITEM} data-mm-value={option.value}>
								<div class="flex flex-1 shrink-0 gap-2 whitespace-nowrap">{option.label}</div>
								<span class="pointer-events-none absolute right-2 flex size-4 items-center justify-center" data-selected="" aria-hidden="true" hidden={current !== option.value}>
									<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-check pointer-events-none"><path d="M20 6 9 17l-5-5"></path></svg>
								</span>
							</div>
						}
					</div>
				</div>
			</div>
			<span data-type="inside" aria-hidden="true" tabindex="0" data-base-ui-focus-guard="" style={FOCUS_GUARD}></span>
		</div>
	</div>
}

function GetCodeDrawer() @{
	const t = typesetState();

	<div id="typeset-get-code-portal" data-base-ui-portal="" data-slot="drawer-portal" hidden data-mm-layer="typeset-get-code">
		<div role="presentation" data-base-ui-inert="" aria-hidden="true" style="position: fixed; inset: 0px; user-select: none;"></div>
		<div role="presentation" data-slot="drawer-overlay" class="fixed inset-0 z-50 min-h-dvh bg-black/10 opacity-[max(var(--drawer-overlay-min-opacity,0),calc(1-var(--drawer-swipe-progress)))] transition-opacity duration-450 ease-[cubic-bezier(0.32,0.72,0,1)] select-none data-ending-style:pointer-events-none data-ending-style:opacity-0 data-ending-style:duration-[calc(var(--drawer-swipe-strength)*400ms)] data-snap-points:[--drawer-overlay-min-opacity:0.5] data-starting-style:opacity-0 data-swiping:duration-0 supports-backdrop-filter:backdrop-blur-xs supports-[-webkit-touch-callout:none]:absolute" aria-hidden="true" data-base-ui-inert="" style="user-select: none; --drawer-swipe-progress: 0; --drawer-swipe-strength: 1;" data-closed=""></div>
		<div role="presentation" data-slot="drawer-viewport" data-modal="true" class="pointer-events-none fixed inset-0 z-50 select-none data-[modal=true]:pointer-events-auto" data-closed="">
			<span data-type="inside" aria-hidden="true" tabindex="0" data-base-ui-focus-guard="" data-base-ui-inert="" style={FOCUS_GUARD}></span>
			<div data-swipe-direction={t.mobile ? 'down' : 'right'} id="typeset-get-code-popup" role="dialog" tabindex="-1" data-base-ui-focusable="" data-slot="drawer-popup" data-swipe-axis={t.mobile ? 'y' : 'x'} data-mobile={t.mobile ? 'true' : 'false'} class="group/drawer-popup pointer-events-auto fixed z-50 m-(--drawer-inset,0px) flex h-(--drawer-content-height) max-h-(--drawer-content-max-height,none) min-h-0 w-(--drawer-content-width,auto) transform-[translate3d(var(--translate-x,0px),var(--translate-y,0px),0)_scale(var(--stack-scale))] flex-col bg-popover text-sm text-popover-foreground transition-[transform,height,opacity,filter] duration-450 ease-[cubic-bezier(0.22,1,0.36,1)] will-change-transform outline-none select-none [interpolate-size:allow-keywords] data-[swipe-direction=down]:rounded-t-xl data-[swipe-direction=down]:border-t data-[swipe-direction=left]:rounded-r-xl data-[swipe-direction=left]:border-r data-[swipe-direction=right]:rounded-l-xl data-[swipe-direction=right]:border-l data-[swipe-direction=up]:rounded-b-xl data-[swipe-direction=up]:border-b data-nested-drawer-open:overflow-hidden data-nested-drawer-open:brightness-95 after:pointer-events-none after:absolute after:bg-(--drawer-bleed-background,var(--color-popover)) data-[swipe-axis=x]:after:inset-y-0 data-[swipe-axis=x]:after:w-(--bleed) data-[swipe-axis=y]:after:inset-x-0 data-[swipe-axis=y]:after:h-(--bleed) data-[swipe-direction=down]:after:top-full data-[swipe-direction=left]:after:right-full data-[swipe-direction=right]:after:left-full data-[swipe-direction=up]:after:bottom-full [--drawer-content-height:var(--drawer-height,auto)] data-[swipe-axis=x]:[--drawer-content-width:75%] data-[swipe-axis=y]:[--drawer-content-max-height:calc(100dvh-6rem)] data-[swipe-axis=y]:data-snap-points:[--drawer-content-height:100dvh] data-[swipe-axis=x]:sm:[--drawer-content-width:24rem] [--bleed:3rem] [--peek:1rem] [--stack-height:var(--drawer-frontmost-height,var(--drawer-height,0px))] [--stack-peek-offset:max(0px,calc((var(--nested-drawers)-var(--stack-progress))*var(--peek)))] [--stack-progress:clamp(0,var(--drawer-swipe-progress),1)] [--stack-scale-base:max(0,calc(1-(var(--nested-drawers)*var(--stack-step))))] [--stack-scale:clamp(0,calc(var(--stack-scale-base)+(var(--stack-step)*var(--stack-progress))),1)] [--stack-shrink:calc(1-var(--stack-scale))] [--stack-step:0.05] data-ending-style:transform-(--closed-transform) data-ending-style:opacity-[0.9999] data-ending-style:duration-[calc(var(--drawer-swipe-strength)*400ms)] data-nested-drawer-swiping:duration-0 data-ending-style:data-nested-drawer-swiping:duration-[calc(var(--drawer-swipe-strength)*400ms)] data-starting-style:transform-(--closed-transform) data-swiping:duration-0 data-ending-style:data-swiping:duration-[calc(var(--drawer-swipe-strength)*400ms)] data-[swipe-axis=y]:inset-x-0 data-[swipe-axis=y]:data-nested-drawer-open:h-(--stack-height) data-[swipe-axis=x]:inset-y-0 data-[swipe-axis=x]:flex-row data-[swipe-direction=down]:bottom-0 data-[swipe-direction=down]:origin-bottom data-[swipe-direction=down]:[--closed-transform:translate3d(0,calc(100%+var(--drawer-inset,0px)+2px),0)] data-[swipe-direction=down]:[--translate-y:calc(var(--drawer-snap-point-offset,0px)+var(--drawer-swipe-movement-y)-var(--stack-peek-offset)-(var(--stack-shrink)*var(--stack-height)))] data-[swipe-direction=up]:top-0 data-[swipe-direction=up]:origin-top data-[swipe-direction=up]:[--closed-transform:translate3d(0,calc(-100%-var(--drawer-inset,0px)-2px),0)] data-[swipe-direction=up]:[--translate-y:calc(var(--drawer-snap-point-offset,0px)+var(--drawer-swipe-movement-y)+var(--stack-peek-offset)+(var(--stack-shrink)*var(--stack-height)))] data-[swipe-direction=left]:left-0 data-[swipe-direction=left]:origin-left data-[swipe-direction=left]:[--closed-transform:translate3d(calc(-100%-var(--drawer-inset,0px)-2px),0,0)] data-[swipe-direction=left]:[--translate-x:calc(var(--drawer-swipe-movement-x)+var(--stack-peek-offset)+(var(--stack-shrink)*100%))] data-[swipe-direction=right]:right-0 data-[swipe-direction=right]:origin-right data-[swipe-direction=right]:[--closed-transform:translate3d(calc(100%+var(--drawer-inset,0px)+2px),0,0)] data-[swipe-direction=right]:[--translate-x:calc(var(--drawer-swipe-movement-x)-var(--stack-peek-offset)-(var(--stack-shrink)*100%))] data-[mobile=true]:max-h-[85svh]" aria-labelledby="typeset-get-code-title" aria-describedby="typeset-get-code-description" style="--drawer-swipe-movement-x: 0px; --drawer-swipe-movement-y: 0px; --drawer-swipe-progress: 0; --nested-drawers: 0; --drawer-snap-point-offset: 0px; --drawer-swipe-strength: 1;" data-closed="">
				<div data-drawer-content="" data-slot="drawer-content" class="flex min-h-0 flex-1 flex-col overflow-hidden overscroll-contain rounded-[inherit] transition-opacity duration-300 ease-[cubic-bezier(0.45,1.005,0,1.005)] select-text group-data-nested-drawer-open/drawer-popup:opacity-0 group-data-nested-drawer-swiping/drawer-popup:opacity-100 group-data-swiping/drawer-popup:select-none">
					<div data-slot="drawer-header" class="flex shrink-0 flex-col gap-0.5 p-4 pb-0 group-data-[swipe-axis=y]/drawer-popup:text-center md:gap-0.5 md:text-left">
						<h2 id="typeset-get-code-title" data-slot="drawer-title" class="cn-font-heading text-base font-medium text-foreground">Get Code</h2>
						<p id="typeset-get-code-description" data-slot="drawer-description" class="text-sm text-balance text-muted-foreground">Install typeset with the values you picked.</p>
					</div>
					<TypesetDocs where="drawer" />
					<div data-slot="drawer-footer" class="mt-auto flex shrink-0 flex-col gap-2 p-4 pt-0">
						<button type="button" tabindex="0" data-slot="drawer-close" class="group/button inline-flex shrink-0 items-center justify-center rounded-lg border bg-clip-padding text-sm font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 border-border bg-background hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50 h-8 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2">Done</button>
					</div>
				</div>
			</div>
			<span data-type="inside" aria-hidden="true" tabindex="0" data-base-ui-focus-guard="" data-base-ui-inert="" style={FOCUS_GUARD}></span>
		</div>
	</div>
}
