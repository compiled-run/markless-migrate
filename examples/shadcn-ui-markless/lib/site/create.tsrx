import { computed, type Children } from '@markless/core';
import { hide, show, shown } from '../parts/base-ui/dialog.ts';
import { toggleTheme } from './theme.ts';
import { BASES, MENU_ACCENTS, RADII, STYLES, iconLibraries } from './create-registry.ts';
import { findFont, isTranslucentMenuColor, presetCode, resetUpdate, shuffled, shuffledByKey, type CreateParams, type CreateUpdate } from './create-params.ts';
import { commit, copyText, isDark, isMac, isMobile, hover, now, packageManager, redo, start, undo, unhover } from './create-runtime.ts';
import { createState } from './create-state.tsrx';
import { START } from './create-runtime.ts';
import { BasePicker, ColorPicker, FontPicker, IconLibraryPicker, MenuAccentPicker, MenuColorPicker, RadiusPicker, Separator, StylePicker } from './create-pickers.tsrx';
import { BaseColorRow, GatedRow, InheritRow, MainMenu, MenuColorRow, MenuShell, RadioRow } from './create-menus.tsrx';
import { ActionMenu, GetCodeDialog, OpenPresetDialog, OpenPresetDrawer, Palette, ResetDialog } from './create-dialogs.tsrx';
import { ACTION_MENU, CARD, CARD_CONTENT, CARD_HEADER, COPY_PRESET, DESIGNER, DIALOG_DESCRIPTION, FIELD_GROUP, FOOTER, FOOTER_CODE, GET_CODE, GET_CODE_TRIGGER, LABEL, MENU_TRIGGER, OPEN_PRESET, OPEN_PRESET_TRIGGER, PILL, PREVIEW_WRAP, RESET, SEPARATOR, SHUFFLE, SWITCHER, afterCopy } from './create-ui.ts';

const FOCUS_GUARD = 'clip-path: inset(50%); overflow: hidden; white-space: nowrap; border: 0px; padding: 0px; width: 1px; height: 1px; margin: -1px; position: fixed; top: 0px; left: 0px;';
const HIDDEN_OWNER = 'clip-path: inset(50%); position: fixed; top: 0px; left: 0px;';
const POSITIONER = 'position: absolute; left: 0px; top: 0px;';

// app/(app)/(create): /create's designer (Preview, Customizer and the dialogs it opens) on Markless state, and, in Layers,
// what its controls portal to the end of the body (the menus and the dialogs, create-dialogs.tsrx). The Base UI ports
// open, place and close those; these files hold the values.

export { createState };


/** The designer: preview and customizer, standing in for the old page's `[data-slot=designer]`. */
export default function Create() @{
	const t = createState();

	<div
		data-slot="designer"
		class={DESIGNER}
		attach={(el) => start(el)}
		onIdle={() => {}}
		onCreatecommand={(event) => {
			const command = (event as CustomEvent<string>).detail;
			if (command === 'load') {
				(t.view = now());
				t.ready = true;
				t.mobile = isMobile();
				t.mac = isMac();
				t.dark = isDark();
				t.packageManager = packageManager();
			} else if (command === 'theme') {
				t.dark = isDark();
			} else if (command === 'viewport') t.mobile = isMobile();
			else if (command === 'popstate') (t.view = now());
			else if (command === 'shuffle') {
				const update = shuffledByKey(t.view.params, t.locks);
				if (update) (t.view = commit(update));
			} else if (command === 'reset') {
				// use-reset's listener runs twice (MainMenu's and ResetDialog's), React flushing between them: the second
				// undoes what the first did to the dialog, so Shift+R resets at once and leaves the dialog as it was.
				(t.view = commit(resetUpdate(t.view.params)));
			} else if (command === 'reset-forwarded') {
				// Forwarded from the preview, both listeners read the dialog as it was: they open it, or both confirm it.
				if (shown(RESET)) {
					(t.view = commit(resetUpdate(t.view.params)));
					hide(RESET);
				} else show(RESET);
			}
			else if (command === 'undo') (t.view = undo());
			else if (command === 'redo') (t.view = redo());
			else if (command === 'open-preset') show(OPEN_PRESET);
			else if (command === 'toggle-action-menu') {
				if (!hide(ACTION_MENU)) show(ACTION_MENU);
			}
		}}
	>
		<Preview />
		<div data-slot="card" data-size="sm" id="create-customizer" class={CARD}>
			<div data-slot="card-header" class={CARD_HEADER}>
				<button type="button" tabindex="0" aria-haspopup="menu" id="create-menu" data-slot="dropdown-menu-trigger" class={MENU_TRIGGER} aria-expanded="false">
					<span class="font-medium">Menu</span>
					<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" color="currentColor" class="size-5" stroke-width="2" stroke="currentColor"><path d="M4 8.5L20 8.5" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"></path><path d="M4 15.5L20 15.5" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"></path></svg>
				</button>
				<span aria-owns="create-menu-popup" style={HIDDEN_OWNER} hidden data-mm-shown-with="create-menu"></span>
			</div>
			<div data-slot="card-content" class={CARD_CONTENT}>
				<div data-slot="field-group" class={FIELD_GROUP}>
					<StylePicker />
					<Separator />
					<ColorPicker param="baseColor" label="Base Color" />
					<ColorPicker param="theme" label="Theme" />
					<ColorPicker param="chartColor" label="Chart Color" />
					<Separator />
					<FontPicker param="fontHeading" label="Heading" />
					<FontPicker param="font" label="Font" />
					<Separator />
					<IconLibraryPicker />
					<RadiusPicker />
					<Separator />
					<MenuColorPicker />
					<MenuAccentPicker />
					<BasePicker />
				</div>
			</div>
			<div data-slot="card-footer" class={FOOTER}>
				<CopyPreset />
				<button type="button" tabindex="0" data-slot={t.mobile ? 'drawer-trigger' : 'dialog-trigger'} data-base-ui-click-trigger="" id={OPEN_PRESET} aria-haspopup="dialog" aria-expanded="false" class={OPEN_PRESET_TRIGGER}>{t.mobile ? 'Open' : 'Open Preset'}</button>
				<button type="button" tabindex="0" data-slot="button" class={SHUFFLE} onClick={() => {
					const update = shuffled(t.view.params, t.locks);
					if (update) (t.view = commit(update));
				}}>
					<span class="w-full truncate text-center font-medium">Shuffle</span>
				</button>
				<div data-slot="dialog-header" class="flex flex-col gap-2 sr-only">
					<h2 id={`${ACTION_MENU}-title`} data-slot="dialog-title" class="cn-font-heading text-base leading-none font-medium">Command Palette</h2>
					<p id={`${ACTION_MENU}-description`} data-slot="dialog-description" class={DIALOG_DESCRIPTION}>Search for a command to run...</p>
				</div>
			</div>
			<div data-slot="card-footer" class={FOOTER_CODE}>
				<button type="button" tabindex="0" data-slot="dialog-trigger" data-base-ui-click-trigger="" id={GET_CODE} aria-haspopup="dialog" aria-expanded="false" class={GET_CODE_TRIGGER}>Get Code</button>
			</div>
		</div>
	</div>
}

/** preview.tsx: the iframe (a new one for each base and item) and PreviewSwitcher. */
function Preview() @{
	const t = createState();
	const frames = computed(() => (t.ready ? [t.view.previewSrc] : []));
	const switcher = computed(() => t.view.params.item === 'preview' || t.view.params.item.startsWith('preview-0'));
	const on01 = computed(() => (t.view.params.item === 'preview-02' ? 'true' : 'false'));
	const on02 = computed(() => (t.view.params.item === 'preview' ? 'true' : 'false'));

	<div class={PREVIEW_WRAP}>
		<div class="relative z-0 mx-auto flex w-full flex-1 flex-col overflow-hidden">
			<div class="absolute inset-0 bg-muted dark:bg-muted/30"></div>
			@for (const src of frames; key src) {
				<iframe src={src} class="z-10 size-full flex-1" title="Preview"></iframe>
			}
		</div>
		<div class={SWITCHER} hidden={!switcher}>
			<button type="button" tabindex="0" data-slot="button" data-variant="ghost" data-size="sm" class={PILL} data-active={on01} onClick={() => (t.view = commit({ item: 'preview-02' }))}>01</button>
			<button type="button" tabindex="0" data-slot="button" data-variant="ghost" data-size="sm" class={PILL} data-active={on02} onClick={() => (t.view = commit({ item: 'preview' }))}>02</button>
		</div>
	</div>
}













/** CopyPreset: --preset CODE, Copied for two seconds once pressed. */
function CopyPreset() @{
	const t = createState();
	const label = computed(() => (t.copiedPreset ? 'Copied' : `--preset ${presetCode(t.view.params)}`));

	<button type="button" tabindex="0" data-slot="button" title={label} class={COPY_PRESET} onClick={() => {
		void copyText(`--preset ${presetCode(t.view.params)}`);
		t.copiedPreset = true;
		afterCopy(() => (t.copiedPreset = false));
	}}>
		<span class="block min-w-0 truncate">{label}</span>
	</button>
}

/** What the designer's controls portal to the end of the body, closed until a control opens it. */
export function Layers() @{
	const t = createState();
	const baseAway = computed(() => (t.view.params.base !== 'base' ? true : undefined));
	const ariaAway = computed(() => (t.view.params.base !== 'aria' ? true : undefined));
	const radixAway = computed(() => (t.view.params.base !== 'radix' ? true : undefined));

	<>
		<MainMenu />
		<MenuShell param="style" size="">
			<div role="group" data-slot="dropdown-menu-radio-group">
				<div role="group" data-slot="dropdown-menu-group">
					<RadioRow param='style' value='vega' label='Vega' />
					<RadioRow param='style' value='nova' label='Nova' />
					<RadioRow param='style' value='maia' label='Maia' />
					<RadioRow param='style' value='lyra' label='Lyra' />
					<RadioRow param='style' value='mira' label='Mira' />
					<RadioRow param='style' value='luma' label='Luma' />
					<RadioRow param='style' value='sera' label='Sera' />
					<RadioRow param='style' value='rhea' label='Rhea' />
				</div>
			</div>
		</MenuShell>
		<MenuShell param="baseColor" size="">
			<div role="group" data-slot="dropdown-menu-radio-group">
				<div role="group" data-slot="dropdown-menu-group">
					<RadioRow param='baseColor' value='neutral' label='Neutral' />
					<RadioRow param='baseColor' value='stone' label='Stone' />
					<RadioRow param='baseColor' value='zinc' label='Zinc' />
					<RadioRow param='baseColor' value='mauve' label='Mauve' />
					<RadioRow param='baseColor' value='olive' label='Olive' />
					<RadioRow param='baseColor' value='mist' label='Mist' />
					<RadioRow param='baseColor' value='taupe' label='Taupe' />
				</div>
			</div>
		</MenuShell>
		<MenuShell param='theme' size="max-h-92">
			<div role="group" data-slot="dropdown-menu-radio-group">
				<div role="group" data-slot="dropdown-menu-group">
					<BaseColorRow param='theme' value='neutral' label='Neutral' />
					<BaseColorRow param='theme' value='stone' label='Stone' />
					<BaseColorRow param='theme' value='zinc' label='Zinc' />
					<BaseColorRow param='theme' value='mauve' label='Mauve' />
					<BaseColorRow param='theme' value='olive' label='Olive' />
					<BaseColorRow param='theme' value='mist' label='Mist' />
					<BaseColorRow param='theme' value='taupe' label='Taupe' />
				</div>
				<div data-orientation="horizontal" role="separator" aria-orientation="horizontal" data-slot="dropdown-menu-separator" class={SEPARATOR}></div>
				<div role="group" data-slot="dropdown-menu-group">
					<RadioRow param='theme' value='amber' label='Amber' />
					<RadioRow param='theme' value='blue' label='Blue' />
					<RadioRow param='theme' value='cyan' label='Cyan' />
					<RadioRow param='theme' value='emerald' label='Emerald' />
					<RadioRow param='theme' value='fuchsia' label='Fuchsia' />
					<RadioRow param='theme' value='green' label='Green' />
					<RadioRow param='theme' value='indigo' label='Indigo' />
					<RadioRow param='theme' value='lime' label='Lime' />
					<RadioRow param='theme' value='orange' label='Orange' />
					<RadioRow param='theme' value='pink' label='Pink' />
					<RadioRow param='theme' value='purple' label='Purple' />
					<RadioRow param='theme' value='red' label='Red' />
					<RadioRow param='theme' value='rose' label='Rose' />
					<RadioRow param='theme' value='sky' label='Sky' />
					<RadioRow param='theme' value='teal' label='Teal' />
					<RadioRow param='theme' value='violet' label='Violet' />
					<RadioRow param='theme' value='yellow' label='Yellow' />
				</div>
			</div>
		</MenuShell>
		<MenuShell param='chartColor' size="max-h-92">
			<div role="group" data-slot="dropdown-menu-radio-group">
				<div role="group" data-slot="dropdown-menu-group">
					<BaseColorRow param='chartColor' value='neutral' label='Neutral' />
					<BaseColorRow param='chartColor' value='stone' label='Stone' />
					<BaseColorRow param='chartColor' value='zinc' label='Zinc' />
					<BaseColorRow param='chartColor' value='mauve' label='Mauve' />
					<BaseColorRow param='chartColor' value='olive' label='Olive' />
					<BaseColorRow param='chartColor' value='mist' label='Mist' />
					<BaseColorRow param='chartColor' value='taupe' label='Taupe' />
				</div>
				<div data-orientation="horizontal" role="separator" aria-orientation="horizontal" data-slot="dropdown-menu-separator" class={SEPARATOR}></div>
				<div role="group" data-slot="dropdown-menu-group">
					<RadioRow param='chartColor' value='amber' label='Amber' />
					<RadioRow param='chartColor' value='blue' label='Blue' />
					<RadioRow param='chartColor' value='cyan' label='Cyan' />
					<RadioRow param='chartColor' value='emerald' label='Emerald' />
					<RadioRow param='chartColor' value='fuchsia' label='Fuchsia' />
					<RadioRow param='chartColor' value='green' label='Green' />
					<RadioRow param='chartColor' value='indigo' label='Indigo' />
					<RadioRow param='chartColor' value='lime' label='Lime' />
					<RadioRow param='chartColor' value='orange' label='Orange' />
					<RadioRow param='chartColor' value='pink' label='Pink' />
					<RadioRow param='chartColor' value='purple' label='Purple' />
					<RadioRow param='chartColor' value='red' label='Red' />
					<RadioRow param='chartColor' value='rose' label='Rose' />
					<RadioRow param='chartColor' value='sky' label='Sky' />
					<RadioRow param='chartColor' value='teal' label='Teal' />
					<RadioRow param='chartColor' value='violet' label='Violet' />
					<RadioRow param='chartColor' value='yellow' label='Yellow' />
				</div>
			</div>
		</MenuShell>
		<MenuShell param='fontHeading' size="max-h-96">
			<div role="group" data-slot="dropdown-menu-radio-group">
				<div role="group" data-slot="dropdown-menu-group">
					<InheritRow param="fontHeading" value="inherit" />
				</div>
				<div data-orientation="horizontal" role="separator" aria-orientation="horizontal" data-slot="dropdown-menu-separator" class={SEPARATOR}></div>
				<div role="group" data-slot="dropdown-menu-group" aria-labelledby='create-fontHeading-sans'>
					<div id='create-fontHeading-sans' role="presentation" data-slot="dropdown-menu-label" class={LABEL}>Sans</div>
					<RadioRow param='fontHeading' value='geist' label='Geist' />
					<RadioRow param='fontHeading' value='inter' label='Inter' />
					<RadioRow param='fontHeading' value='noto-sans' label='Noto Sans' />
					<RadioRow param='fontHeading' value='nunito-sans' label='Nunito Sans' />
					<RadioRow param='fontHeading' value='figtree' label='Figtree' />
					<RadioRow param='fontHeading' value='roboto' label='Roboto' />
					<RadioRow param='fontHeading' value='raleway' label='Raleway' />
					<RadioRow param='fontHeading' value='dm-sans' label='DM Sans' />
					<RadioRow param='fontHeading' value='public-sans' label='Public Sans' />
					<RadioRow param='fontHeading' value='outfit' label='Outfit' />
					<RadioRow param='fontHeading' value='oxanium' label='Oxanium' />
					<RadioRow param='fontHeading' value='manrope' label='Manrope' />
					<RadioRow param='fontHeading' value='space-grotesk' label='Space Grotesk' />
					<RadioRow param='fontHeading' value='montserrat' label='Montserrat' />
					<RadioRow param='fontHeading' value='ibm-plex-sans' label='IBM Plex Sans' />
					<RadioRow param='fontHeading' value='source-sans-3' label='Source Sans 3' />
					<RadioRow param='fontHeading' value='instrument-sans' label='Instrument Sans' />
				</div>
				<div role="group" data-slot="dropdown-menu-group" aria-labelledby='create-fontHeading-mono'>
					<div id='create-fontHeading-mono' role="presentation" data-slot="dropdown-menu-label" class={LABEL}>Mono</div>
					<RadioRow param='fontHeading' value='geist-mono' label='Geist Mono' />
					<RadioRow param='fontHeading' value='jetbrains-mono' label='JetBrains Mono' />
				</div>
				<div role="group" data-slot="dropdown-menu-group" aria-labelledby='create-fontHeading-serif'>
					<div id='create-fontHeading-serif' role="presentation" data-slot="dropdown-menu-label" class={LABEL}>Serif</div>
					<RadioRow param='fontHeading' value='noto-serif' label='Noto Serif' />
					<RadioRow param='fontHeading' value='roboto-slab' label='Roboto Slab' />
					<RadioRow param='fontHeading' value='merriweather' label='Merriweather' />
					<RadioRow param='fontHeading' value='lora' label='Lora' />
					<RadioRow param='fontHeading' value='playfair-display' label='Playfair Display' />
					<RadioRow param='fontHeading' value='eb-garamond' label='EB Garamond' />
					<RadioRow param='fontHeading' value='instrument-serif' label='Instrument Serif' />
				</div>
			</div>
		</MenuShell>
		<MenuShell param='font' size="max-h-96">
			<div role="group" data-slot="dropdown-menu-radio-group">
				<div role="group" data-slot="dropdown-menu-group" aria-labelledby='create-font-sans'>
					<div id='create-font-sans' role="presentation" data-slot="dropdown-menu-label" class={LABEL}>Sans</div>
					<RadioRow param='font' value='geist' label='Geist' />
					<RadioRow param='font' value='inter' label='Inter' />
					<RadioRow param='font' value='noto-sans' label='Noto Sans' />
					<RadioRow param='font' value='nunito-sans' label='Nunito Sans' />
					<RadioRow param='font' value='figtree' label='Figtree' />
					<RadioRow param='font' value='roboto' label='Roboto' />
					<RadioRow param='font' value='raleway' label='Raleway' />
					<RadioRow param='font' value='dm-sans' label='DM Sans' />
					<RadioRow param='font' value='public-sans' label='Public Sans' />
					<RadioRow param='font' value='outfit' label='Outfit' />
					<RadioRow param='font' value='oxanium' label='Oxanium' />
					<RadioRow param='font' value='manrope' label='Manrope' />
					<RadioRow param='font' value='space-grotesk' label='Space Grotesk' />
					<RadioRow param='font' value='montserrat' label='Montserrat' />
					<RadioRow param='font' value='ibm-plex-sans' label='IBM Plex Sans' />
					<RadioRow param='font' value='source-sans-3' label='Source Sans 3' />
					<RadioRow param='font' value='instrument-sans' label='Instrument Sans' />
				</div>
				<div role="group" data-slot="dropdown-menu-group" aria-labelledby='create-font-mono'>
					<div id='create-font-mono' role="presentation" data-slot="dropdown-menu-label" class={LABEL}>Mono</div>
					<RadioRow param='font' value='geist-mono' label='Geist Mono' />
					<RadioRow param='font' value='jetbrains-mono' label='JetBrains Mono' />
				</div>
				<div role="group" data-slot="dropdown-menu-group" aria-labelledby='create-font-serif'>
					<div id='create-font-serif' role="presentation" data-slot="dropdown-menu-label" class={LABEL}>Serif</div>
					<RadioRow param='font' value='noto-serif' label='Noto Serif' />
					<RadioRow param='font' value='roboto-slab' label='Roboto Slab' />
					<RadioRow param='font' value='merriweather' label='Merriweather' />
					<RadioRow param='font' value='lora' label='Lora' />
					<RadioRow param='font' value='playfair-display' label='Playfair Display' />
					<RadioRow param='font' value='eb-garamond' label='EB Garamond' />
					<RadioRow param='font' value='instrument-serif' label='Instrument Serif' />
				</div>
			</div>
		</MenuShell>
		<MenuShell param="iconLibrary" size="">
			<div role="group" data-slot="dropdown-menu-radio-group">
				<div role="group" data-slot="dropdown-menu-group">
					<RadioRow param='iconLibrary' value='lucide' label='Lucide' />
					<RadioRow param='iconLibrary' value='tabler' label='Tabler Icons' />
					<RadioRow param='iconLibrary' value='hugeicons' label='HugeIcons' />
					<RadioRow param='iconLibrary' value='phosphor' label='Phosphor Icons' />
					<RadioRow param='iconLibrary' value='remixicon' label='Remix Icon' />
				</div>
			</div>
		</MenuShell>
		<MenuShell param="radius" size="">
			<div role="group" data-slot="dropdown-menu-radio-group">
				<div role="group" data-slot="dropdown-menu-group">
					<RadioRow param='radius' value='default' label='Default' />
				</div>
				<div data-orientation="horizontal" role="separator" aria-orientation="horizontal" data-slot="dropdown-menu-separator" class={SEPARATOR}></div>
				<div role="group" data-slot="dropdown-menu-group">
					<RadioRow param='radius' value='none' label='None' />
					<RadioRow param='radius' value='small' label='Small' />
					<RadioRow param='radius' value='medium' label='Medium' />
					<GatedRow param='radius' value='large' label='Large' />
				</div>
			</div>
		</MenuShell>
		<MenuShell param="menuColor" size="">
			<div role="group" data-slot="dropdown-menu-group" aria-labelledby="create-menuColor-color">
				<div id="create-menuColor-color" role="presentation" data-slot="dropdown-menu-label" class={LABEL}>Color</div>
				<div role="group" data-slot="dropdown-menu-radio-group">
					<MenuColorRow axis="color" value="default" label="Default" />
					<MenuColorRow axis="color" value="inverted" label="Inverted" />
				</div>
			</div>
			<div data-orientation="horizontal" role="separator" aria-orientation="horizontal" data-slot="dropdown-menu-separator" class={SEPARATOR}></div>
			<div role="group" data-slot="dropdown-menu-group" aria-labelledby="create-menuColor-appearance">
				<div id="create-menuColor-appearance" role="presentation" data-slot="dropdown-menu-label" class={LABEL}>Appearance</div>
				<div role="group" data-slot="dropdown-menu-radio-group">
					<MenuColorRow axis="surface" value="solid" label="Solid" />
					<MenuColorRow axis="surface" value="translucent" label="Translucent" />
				</div>
			</div>
		</MenuShell>
		<MenuShell param="menuAccent" size="">
			<div role="group" data-slot="dropdown-menu-radio-group">
				<div role="group" data-slot="dropdown-menu-group">
					<RadioRow param='menuAccent' value='subtle' label='Subtle' />
					<GatedRow param='menuAccent' value='bold' label='Bold' />
				</div>
			</div>
		</MenuShell>
		<MenuShell param="base" size="">
			<div role="group" data-slot="dropdown-menu-radio-group">
				<div role="group" data-slot="dropdown-menu-group">
					<RadioRow param='base' value='base' label='Base UI' />
					<RadioRow param='base' value='aria' label='React Aria' />
					<RadioRow param='base' value='radix' label='Radix UI' />
				</div>
			</div>
		</MenuShell>
		<OpenPresetDialog />
		<OpenPresetDrawer />
		<ResetDialog />
		<ActionMenu>
			<Palette base='base' away={baseAway} />
			<Palette base='aria' away={ariaAway} />
			<Palette base='radix' away={radixAway} />
		</ActionMenu>
		<GetCodeDialog />
	</>
}













