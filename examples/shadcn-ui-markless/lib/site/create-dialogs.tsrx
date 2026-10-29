import { computed, type Children } from '@markless/core';
import { hide } from '../parts/base-ui/dialog.ts';
import { roving } from '../parts/radix/roving.ts';
import { applyCommand, frameworkOf, initCommand, NO_MONOREPO_FRAMEWORKS, parsePresetInput, resetUpdate, templateValue, themeCss, type CreateParams, type PackageManager } from './create-params.ts';
import { choosePackageManager, commit, copyText } from './create-runtime.ts';
import { createState } from './create-state.tsrx';
import { START } from './create-runtime.ts';
import { PALETTE_ITEMS } from './create-items.ts';
import { ACTION_MENU, ALERT_ACTION, ALERT_CANCEL, ALERT_DESC, ALERT_FOOTER, ALERT_HEADER, ALERT_OVERLAY, ALERT_POPUP, ALERT_TITLE, APPLY_CONTENT, APPLY_FIELD, APPLY_FIELD_SET, APPLY_GRID, APPLY_LABEL, APPLY_LEGEND, APPLY_RADIO, APPLY_TITLE, BASE_CONTENT, BASE_GRID, BASE_LOGO, BASE_TITLE, BUTTON_OUTLINE, BUTTON_PRIMARY, CHOICE_FIELD, CHOICE_LABEL, CHOICE_TITLE, COMMAND_GROUP, COMMAND_ITEM, COPY_BACK, COPY_FRONT, DIALOG_DESCRIPTION, DIALOG_FOOTER, DIALOG_OVERLAY, DIALOG_POPUP_SM, DIALOG_TITLE, DIALOG_X, DRAWER_CANCEL, DRAWER_CONTENT, DRAWER_DESCRIPTION, DRAWER_FOOTER, DRAWER_HEADER, DRAWER_INPUT, DRAWER_OPEN, DRAWER_OVERLAY, DRAWER_POPUP, DRAWER_TITLE, DRAWER_VIEWPORT, FIELD_CONTENT, FIELD_DESCRIPTION, FIELD_H, FIELD_LABEL, FIELD_LABEL_SR, FIELD_SET, FIELD_V, FIELD_V2, FIELD_V3, GC_FIELD_GROUP, GC_FIELD_GROUP_THEME, GC_FOOTER, GC_HEADER, GC_INNER, GC_POPUP, GC_SCROLL, GC_SEPARATOR, GET_CODE, ICON_BUTTON, INPUT, INPUT_ADDON, INPUT_GROUP, LEGEND_SR, MONOREPO_LOGO, OPEN_PRESET, OPTION_LABEL, PALETTE_POPUP, RADIO_DOT, RADIO_INDICATOR, RADIO_ITEM_SR, RESET, SEPARATOR_LINE, SWITCH, SWITCH_THUMB, TAB, TABS, TABS_LIST, TEMPLATE_CONTENT, TEMPLATE_GRID, TEMPLATE_LOGO, THEME_FIELD_SET, TOGGLE_GROUP, TOGGLE_ITEM, TURBOREPO_PATH, WIDE_BUTTON, afterCopy } from './create-ui.ts';

const FOCUS_GUARD = 'clip-path: inset(50%); overflow: hidden; white-space: nowrap; border: 0px; padding: 0px; width: 1px; height: 1px; margin: -1px; position: fixed; top: 0px; left: 0px;';
const HIDDEN_OWNER = 'clip-path: inset(50%); position: fixed; top: 0px; left: 0px;';
const POSITIONER = 'position: absolute; left: 0px; top: 0px;';

// /create's dialogs: Open Preset (a drawer on phones), the reset alert, the Cmd+P palette and Get Code (ProjectForm), as
// create.tsrx's Layers renders them.


/** OpenPreset's dialog: a code, or `--preset CODE`; Open loads it. */
export function OpenPresetDialog() @{
	const t = createState();
	const next = computed(() => parsePresetInput(t.presetInput));
	const invalid = computed(() => t.presetInput.trim().length > 0 && parsePresetInput(t.presetInput) === null);
	const inputId = computed(() => (t.mobile ? undefined : 'preset-code'));

	<div id={`${OPEN_PRESET}-portal`} data-base-ui-portal="" data-slot="dialog-portal" hidden data-mm-layer={OPEN_PRESET}>
		<div role="presentation" data-base-ui-inert="" aria-hidden="true" style="position: fixed; inset: 0px; user-select: none;"></div>
		<div role="presentation" data-slot="dialog-overlay" class={DIALOG_OVERLAY} aria-hidden="true" data-base-ui-inert="" style="user-select: none;" data-closed=""></div>
		<span data-type="inside" aria-hidden="true" tabindex="0" data-base-ui-focus-guard="" data-base-ui-inert="" style={FOCUS_GUARD}></span>
		<div id={`${OPEN_PRESET}-popup`} role="dialog" tabindex="-1" data-base-ui-focusable="" data-slot="dialog-content" class={DIALOG_POPUP_SM} aria-labelledby={`${OPEN_PRESET}-title`} aria-describedby={`${OPEN_PRESET}-description`} style="--nested-dialogs: 0;" data-closed="" onMmclose={() => (t.presetInput = '')}>
			<form onSubmit={(event) => {
				event.preventDefault();
				const preset = parsePresetInput(t.presetInput);
				if (!preset) return;
				(t.view = commit({ preset }));
				hide(OPEN_PRESET);
				t.presetInput = '';
			}}>
				<div data-slot="dialog-header" class="flex flex-col gap-2">
					<h2 id={`${OPEN_PRESET}-title`} data-slot="dialog-title" class={DIALOG_TITLE}>Open Preset</h2>
					<p id={`${OPEN_PRESET}-description`} data-slot="dialog-description" class={DIALOG_DESCRIPTION}>Paste a preset code to load a saved configuration.</p>
				</div>
				<div class="py-4">
					<div role="group" data-slot="field" data-orientation="vertical" class={FIELD_V} data-invalid={invalid ? 'true' : undefined}>
						<label data-slot="field-label" class={FIELD_LABEL_SR} for={inputId}>Preset code</label>
						<div data-slot="field-content" class={FIELD_CONTENT}>
							<input id={inputId} data-slot="input" placeholder="b2D0wqNxT or --preset b2D0wqNxT" autocapitalize="none" autocorrect="off" spellcheck="false" aria-invalid={invalid ? 'true' : 'false'} class={INPUT} value={t.presetInput} onInput={(event) => (t.presetInput = (event.target as { value: string }).value)} />
						</div>
					</div>
				</div>
				<div data-slot="dialog-footer" class={DIALOG_FOOTER}>
					<button type="button" tabindex="0" data-slot="dialog-close" class={BUTTON_OUTLINE}>Cancel</button>
					<button type="submit" data-disabled={next ? undefined : ''} tabindex="0" disabled={next ? undefined : true} data-slot="button" class={BUTTON_PRIMARY}>Open</button>
				</div>
			</form>
			<button type="button" tabindex="0" data-slot="dialog-close" class={DIALOG_X}>
				<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-x"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg>
				<span class="sr-only">Close</span>
			</button>
		</div>
		<span data-type="inside" aria-hidden="true" tabindex="0" data-base-ui-focus-guard="" data-base-ui-inert="" style={FOCUS_GUARD}></span>
	</div>
}

/** OpenPreset on a phone: the same form in a drawer from the bottom. */
export function OpenPresetDrawer() @{
	const t = createState();
	const next = computed(() => parsePresetInput(t.presetInput));
	const invalid = computed(() => t.presetInput.trim().length > 0 && parsePresetInput(t.presetInput) === null);
	const inputId = computed(() => (t.mobile ? 'preset-code' : undefined));

	<div id={`${OPEN_PRESET}-drawer-portal`} data-base-ui-portal="" data-slot="drawer-portal" hidden data-mm-layer={OPEN_PRESET} data-mm-viewport="mobile">
		<div role="presentation" data-base-ui-inert="" aria-hidden="true" style="position: fixed; inset: 0px; user-select: none;"></div>
		<div role="presentation" data-slot="drawer-overlay" class={DRAWER_OVERLAY} aria-hidden="true" data-base-ui-inert="" style="user-select: none;" data-closed=""></div>
		<div role="presentation" data-slot="drawer-viewport" data-modal="true" class={DRAWER_VIEWPORT} data-closed="">
			<span data-type="inside" aria-hidden="true" tabindex="0" data-base-ui-focus-guard="" data-base-ui-inert="" style={FOCUS_GUARD}></span>
			<div data-swipe-direction="down" id={`${OPEN_PRESET}-drawer-popup`} role="dialog" tabindex="-1" data-base-ui-focusable="" data-slot="drawer-popup" data-swipe-axis="y" class={DRAWER_POPUP} aria-labelledby={`${OPEN_PRESET}-drawer-title`} aria-describedby={`${OPEN_PRESET}-drawer-description`} data-closed="" onMmclose={() => (t.presetInput = '')}>
				<div data-drawer-content="" data-slot="drawer-content" class={DRAWER_CONTENT}>
					<div data-slot="drawer-header" class={DRAWER_HEADER}>
						<h2 id={`${OPEN_PRESET}-drawer-title`} data-slot="drawer-title" class={DRAWER_TITLE}>Open Preset</h2>
						<p id={`${OPEN_PRESET}-drawer-description`} data-slot="drawer-description" class={DRAWER_DESCRIPTION}>Paste a preset code to load a saved configuration.</p>
					</div>
					<form onSubmit={(event) => {
						event.preventDefault();
						const preset = parsePresetInput(t.presetInput);
						if (!preset) return;
						(t.view = commit({ preset }));
						hide(OPEN_PRESET);
						t.presetInput = '';
					}}>
						<div class="px-4 py-2">
							<div role="group" data-slot="field" data-orientation="vertical" class={FIELD_V} data-invalid={invalid ? 'true' : undefined}>
								<label data-slot="field-label" class={FIELD_LABEL_SR} for={inputId}>Preset code</label>
								<div data-slot="field-content" class={FIELD_CONTENT}>
									<input id={inputId} data-slot="input" placeholder="b2D0wqNxT or --preset b2D0wqNxT" autocapitalize="none" autocorrect="off" spellcheck="false" aria-invalid={invalid ? 'true' : 'false'} class={DRAWER_INPUT} value={t.presetInput} onInput={(event) => (t.presetInput = (event.target as { value: string }).value)} />
								</div>
							</div>
						</div>
						<div data-slot="drawer-footer" class={DRAWER_FOOTER}>
							<button type="submit" data-disabled={next ? undefined : ''} tabindex="0" disabled={next ? undefined : true} data-slot="button" class={DRAWER_OPEN}>Open</button>
							<button type="button" tabindex="0" data-slot="drawer-close" class={DRAWER_CANCEL}>Cancel</button>
						</div>
					</form>
				</div>
			</div>
			<span data-type="inside" aria-hidden="true" tabindex="0" data-base-ui-focus-guard="" data-base-ui-inert="" style={FOCUS_GUARD}></span>
		</div>
	</div>
}

/** ResetDialog: an alert dialog the menu and Shift+R open. */
export function ResetDialog() @{
	const t = createState();

	<div id={`${RESET}-portal`} data-base-ui-portal="" data-slot="alert-dialog-portal" hidden data-mm-layer={RESET}>
		<div role="presentation" data-base-ui-inert="" aria-hidden="true" style="position: fixed; inset: 0px; user-select: none;"></div>
		<div role="presentation" data-slot="alert-dialog-overlay" class={ALERT_OVERLAY} aria-hidden="true" data-base-ui-inert="" style="user-select: none;" data-closed=""></div>
		<span data-type="inside" aria-hidden="true" tabindex="0" data-base-ui-focus-guard="" data-base-ui-inert="" style={FOCUS_GUARD}></span>
		<div id={`${RESET}-popup`} role="alertdialog" tabindex="-1" data-base-ui-focusable="" data-slot="alert-dialog-content" data-size="sm" class={ALERT_POPUP} aria-labelledby={`${RESET}-title`} aria-describedby={`${RESET}-description`} style="--nested-dialogs: 0;" data-closed="">
			<div data-slot="alert-dialog-header" class={ALERT_HEADER}>
				<h2 id={`${RESET}-title`} data-slot="alert-dialog-title" class={ALERT_TITLE}>Reset to defaults?</h2>
				<p id={`${RESET}-description`} data-slot="alert-dialog-description" class={ALERT_DESC}>This will reset all customization options to their default values.</p>
			</div>
			<div data-slot="alert-dialog-footer" class={ALERT_FOOTER}>
				<button type="button" tabindex="0" data-slot="alert-dialog-cancel" class={ALERT_CANCEL}>Cancel</button>
				<button type="button" tabindex="0" data-slot="alert-dialog-action" class={ALERT_ACTION} onClick={() => {
					(t.view = commit(resetUpdate(t.view.params)));
					hide(RESET);
				}}>Reset</button>
			</div>
		</div>
		<span data-type="inside" aria-hidden="true" tabindex="0" data-base-ui-focus-guard="" data-base-ui-inert="" style={FOCUS_GUARD}></span>
	</div>
}

/** ActionMenu: ⌘P's palette of the base's registry items; choosing one previews it. */
export function ActionMenu({ children }: { readonly children: Children }) @{
	const t = createState();

	<div id={`${ACTION_MENU}-portal`} data-base-ui-portal="" data-slot="dialog-portal" hidden data-mm-layer={ACTION_MENU}>
		<div role="presentation" data-base-ui-inert="" aria-hidden="true" style="position: fixed; inset: 0px; user-select: none;"></div>
		<div role="presentation" data-slot="dialog-overlay" class={DIALOG_OVERLAY} aria-hidden="true" data-base-ui-inert="" style="user-select: none;" data-closed=""></div>
		<span data-type="inside" aria-hidden="true" tabindex="0" data-base-ui-focus-guard="" data-base-ui-inert="" style={FOCUS_GUARD}></span>
		<div id={`${ACTION_MENU}-popup`} role="dialog" tabindex="-1" data-base-ui-focusable="" data-slot="dialog-content" class={PALETTE_POPUP} aria-labelledby={`${ACTION_MENU}-title`} aria-describedby={`${ACTION_MENU}-description`} style="--nested-dialogs: 0;" data-closed="" onCreatechoose={(event) => {
			(t.view = commit({ item: (event as CustomEvent<string>).detail }));
			hide(ACTION_MENU);
		}}>
			{children}
		</div>
		<span data-type="inside" aria-hidden="true" tabindex="0" data-base-ui-focus-guard="" data-base-ui-inert="" style={FOCUS_GUARD}></span>
	</div>
}

/** The palette's Command over a base's items: an item is checked while the preview shows it, and choosing it goes through cmdk's onSelect (beforeChoose). */
export function Palette({ base, away }: { readonly base: string; readonly away?: true }) @{
	const t = createState();
	const current = computed(() => t.view.params.item);
	const items = PALETTE_ITEMS[base] ?? [];

	<div hidden={away} tabindex="-1" data-slot="command" class="flex size-full flex-col overflow-hidden rounded-xl! bg-popover p-1 text-popover-foreground" cmdk-root="" data-create-palette={base}>
		<label cmdk-label="" for={`${ACTION_MENU}-${base}-input`} id={`${ACTION_MENU}-${base}-label`} style="position: absolute; width: 1px; height: 1px; padding: 0px; margin: -1px; overflow: hidden; clip: rect(0px, 0px, 0px, 0px); white-space: nowrap; border-width: 0px;"></label>
		<div data-slot="command-input-wrapper" class="p-1 pb-0">
			<div data-slot="input-group" role="group" class={INPUT_GROUP}>
				<input data-slot="command-input" class="w-full text-sm outline-hidden disabled:cursor-not-allowed disabled:opacity-50" placeholder="Search" cmdk-input="" autocomplete="off" autocorrect="off" spellcheck="false" aria-autocomplete="list" role="combobox" aria-expanded="true" aria-controls={`${ACTION_MENU}-${base}-list`} aria-labelledby={`${ACTION_MENU}-${base}-label`} id={`${ACTION_MENU}-${base}-input`} type="text" value="" />
				<div role="group" data-slot="input-group-addon" data-align="inline-start" class={INPUT_ADDON}>
					<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-search size-4 shrink-0 opacity-50"><circle cx="11" cy="11" r="8"></circle><path d="m21 21-4.3-4.3"></path></svg>
				</div>
			</div>
		</div>
		<div data-slot="command-list" class="no-scrollbar max-h-72 scroll-py-1 overflow-x-hidden overflow-y-auto outline-none" cmdk-list="" role="listbox" tabindex="-1" aria-label="Suggestions" id={`${ACTION_MENU}-${base}-list`}>
			<div cmdk-list-sizer="">
				<div data-slot="command-empty" class="py-6 text-center text-sm" cmdk-empty="" role="presentation" hidden>No items found.</div>
				<div data-slot="command-group" class={COMMAND_GROUP} cmdk-group="" role="presentation" data-value="undefined">
					<div cmdk-group-items="" role="group">
						@for (const item of items; key item.name) {
							<div data-slot="command-item" class={COMMAND_ITEM} data-checked={current === item.name ? 'true' : 'false'} id={`${ACTION_MENU}-${base}-${item.name}`} cmdk-item="" role="option" aria-disabled="false" aria-selected="false" data-disabled="false" data-selected="false" data-value={item.value} data-create-item={item.name}>
								{item.label}
								<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-check ml-auto opacity-0 group-has-data-[slot=command-shortcut]/command-item:hidden group-data-[checked=true]/command-item:opacity-100"><path d="M20 6 9 17l-5-5"></path></svg>
							</div>
						}
					</div>
				</div>
			</div>
		</div>
	</div>
}

const PACKAGE_MANAGER_LIST: readonly PackageManager[] = ['pnpm', 'npm', 'yarn', 'bun'];
const APP_URL: string = import.meta.env.VITE_APP_URL || 'http://localhost:4000';
const commandOptions = { version: '@latest', local: APP_URL.includes('localhost') };

/** ProjectForm: Get Code's dialog, its New Project, Existing Project and Theme tabs. */
export function GetCodeDialog() @{
	const t = createState();
	const onNew = computed(() => t.getCodeTab === 'new-project');
	const onExisting = computed(() => t.getCodeTab === 'existing-project');
	const onTheme = computed(() => t.getCodeTab === 'theme');

	<div id={`${GET_CODE}-portal`} data-base-ui-portal="" data-slot="dialog-portal" hidden data-mm-layer={GET_CODE}>
		<div role="presentation" data-base-ui-inert="" aria-hidden="true" style="position: fixed; inset: 0px; user-select: none;"></div>
		<div role="presentation" data-slot="dialog-overlay" class={DIALOG_OVERLAY} aria-hidden="true" data-base-ui-inert="" style="user-select: none;" data-closed=""></div>
		<span data-type="inside" aria-hidden="true" tabindex="0" data-base-ui-focus-guard="" data-base-ui-inert="" style={FOCUS_GUARD}></span>
		<div id={`${GET_CODE}-popup`} role="dialog" tabindex="-1" data-base-ui-focusable="" data-slot="dialog-content" class={GC_POPUP} style="--nested-dialogs: 0;" data-closed="">
			<div class={GC_INNER}>
				<div data-slot="dialog-header" class={GC_HEADER}>
					<div data-orientation="horizontal" role="group" data-slot="toggle-group" data-spacing="2" aria-label="Project type" class={TOGGLE_GROUP} style="--gap: 2;" onKeyDown={(event) => toggleRoving(event)}>
						<button type="button" data-pressed={onNew ? '' : undefined} aria-disabled="false" tabindex={onNew ? '0' : '-1'} aria-pressed={onNew ? 'true' : 'false'} data-slot="toggle-group-item" data-variant="default" data-size="default" data-spacing="2" class={TOGGLE_ITEM} onClick={() => (t.getCodeTab = t.getCodeTab === 'new-project' ? 'new-project' : 'new-project')}>New Project</button>
						<button type="button" data-pressed={onExisting ? '' : undefined} aria-disabled="false" tabindex={onExisting ? '0' : '-1'} aria-pressed={onExisting ? 'true' : 'false'} data-slot="toggle-group-item" data-variant="default" data-size="default" data-spacing="2" class={TOGGLE_ITEM} onClick={() => (t.getCodeTab = t.getCodeTab === 'existing-project' ? 'new-project' : 'existing-project')}>Existing Project</button>
						<button type="button" data-pressed={onTheme ? '' : undefined} aria-disabled="false" tabindex={onTheme ? '0' : '-1'} aria-pressed={onTheme ? 'true' : 'false'} data-slot="toggle-group-item" data-variant="default" data-size="default" data-spacing="2" class={TOGGLE_ITEM} onClick={() => (t.getCodeTab = t.getCodeTab === 'theme' ? 'new-project' : 'theme')}>Theme</button>
					</div>
				</div>
				<NewProject />
				<ExistingProject />
				<ThemeTokens />
			</div>
			<button type="button" tabindex="0" data-slot="dialog-close" class={DIALOG_X}>
				<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-x"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg>
				<span class="sr-only">Close</span>
			</button>
		</div>
		<span data-type="inside" aria-hidden="true" tabindex="0" data-base-ui-focus-guard="" data-base-ui-inert="" style={FOCUS_GUARD}></span>
	</div>
}

// Base UI ToggleGroup and RadioGroup (CompositeRoot): the arrows move focus between the enabled items, looping.
function moveFocus(event: KeyboardEvent, selector: string, horizontalOnly: boolean): HTMLElement | undefined {
	const group = event.currentTarget as HTMLElement;
	const items = [...group.querySelectorAll<HTMLElement>(selector)].filter((el) => el.getAttribute('aria-disabled') !== 'true' && !el.hasAttribute('data-disabled'));
	const at = items.indexOf(event.target as HTMLElement);
	if (at < 0) return undefined;
	const step = event.key === 'ArrowRight' || (!horizontalOnly && event.key === 'ArrowDown') ? 1 : event.key === 'ArrowLeft' || (!horizontalOnly && event.key === 'ArrowUp') ? -1 : 0;
	const to = step ? items[(at + step + items.length) % items.length] : event.key === 'Home' ? items[0] : event.key === 'End' ? items[items.length - 1] : undefined;
	if (!to) return undefined;
	event.preventDefault();
	to.focus();
	return to;
}
const toggleRoving = (event: KeyboardEvent) => void moveFocus(event, '[data-slot="toggle-group-item"]', true);

function NewProject() @{
	const t = createState();
	const framework = computed(() => frameworkOf(t.view.params.template));
	const monorepo = computed(() => t.view.params.template.endsWith('-monorepo'));
	const hasMonorepo = computed(() => !NO_MONOREPO_FRAMEWORKS.includes(frameworkOf(t.view.params.template)));
	const templateNext = computed(() => frameworkOf(t.view.params.template) === 'next');
	const templateVite = computed(() => frameworkOf(t.view.params.template) === 'vite');
	const templateStart = computed(() => frameworkOf(t.view.params.template) === 'start');
	const templateLaravel = computed(() => frameworkOf(t.view.params.template) === 'laravel');
	const templateReactRouter = computed(() => frameworkOf(t.view.params.template) === 'react-router');
	const templateAstro = computed(() => frameworkOf(t.view.params.template) === 'astro');
	const baseBaseChosen = computed(() => t.view.params.base === 'base');
	const baseAriaChosen = computed(() => t.view.params.base === 'aria');
	const baseRadixChosen = computed(() => t.view.params.base === 'radix');

	<div class={GC_SCROLL} hidden={t.getCodeTab !== 'new-project'}>
		<div data-slot="field-group" class={GC_FIELD_GROUP}>
			<div role="group" data-slot="field" data-orientation="vertical" class={FIELD_V3}>
				<label data-slot="field-label" class={FIELD_LABEL}>Template</label>
				<div role="radiogroup" data-slot="radio-group" class={TEMPLATE_GRID} onKeyDown={(event) => radioRoving(event)} onClick={(event) => {
					const value = chosen(event, 'template');
					if (value) (t.view = commit({ template: templateValue(value, t.view.params.template.endsWith('-monorepo')) }));
				}}>
					<label data-slot="field-label" class={CHOICE_LABEL} for="template-next" id="template-next-label">
						<div role="group" data-slot="field" data-orientation="horizontal" class={CHOICE_FIELD}>
							<div data-slot="field-content" class={TEMPLATE_CONTENT}>
								<div class={TEMPLATE_LOGO}><svg role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><title>Next.js</title><path d="M18.665 21.978C16.758 23.255 14.465 24 12 24 5.377 24 0 18.623 0 12S5.377 0 12 0s12 5.377 12 12c0 3.583-1.574 6.801-4.067 9.001L9.219 7.2H7.2v9.596h1.615V9.251l9.85 12.727Zm-3.332-8.533 1.6 2.061V7.2h-1.6v6.245Z" fill="currentColor"></path></svg></div>
								<div data-slot="field-label" class={CHOICE_TITLE}>Next.js</div>
							</div>
							<span data-checked={templateNext ? '' : undefined} data-unchecked={templateNext ? undefined : ''} role="radio" tabindex={templateNext ? '0' : '-1'} aria-checked={templateNext ? 'true' : 'false'} data-composite-item-active={templateNext ? '' : undefined} id="template-next-radio" data-slot="radio-group-item" class={RADIO_ITEM_SR} aria-labelledby="template-next-label">
								<span data-checked="" data-slot="radio-group-indicator" class={RADIO_INDICATOR} hidden={!templateNext}>
									<span class={RADIO_DOT}></span>
								</span>
							</span>
							<input id="template-next" tabindex="-1" aria-hidden="true" type="radio" value="next" checked={templateNext} style={FOCUS_GUARD} data-create-choice="template" />
						</div>
					</label>
					<label data-slot="field-label" class={CHOICE_LABEL} for="template-vite" id="template-vite-label">
						<div role="group" data-slot="field" data-orientation="horizontal" class={CHOICE_FIELD}>
							<div data-slot="field-content" class={TEMPLATE_CONTENT}>
								<div class={TEMPLATE_LOGO}><svg xmlns="http://www.w3.org/2000/svg" width="410" height="404" fill="none" viewBox="0 0 410 404"><path fill="var(--foreground)" d="m399.641 59.525-183.998 329.02c-3.799 6.793-13.559 6.833-17.415.073L10.582 59.556C6.38 52.19 12.68 43.266 21.028 44.76l184.195 32.923c1.175.21 2.378.208 3.553-.006l180.343-32.87c8.32-1.517 14.649 7.337 10.522 14.719"></path><path fill="var(--color-neutral-800)" d="M292.965 1.574 156.801 28.255a5 5 0 0 0-4.03 4.611l-8.376 141.464c-.197 3.332 2.863 5.918 6.115 5.168l37.91-8.749c3.547-.818 6.752 2.306 6.023 5.873l-11.263 55.153c-.758 3.712 2.727 6.886 6.352 5.785l23.415-7.114c3.63-1.102 7.118 2.081 6.35 5.796l-17.899 86.633c-1.12 5.419 6.088 8.374 9.094 3.728l2.008-3.103 110.954-221.428c1.858-3.707-1.346-7.935-5.418-7.15l-39.022 7.532c-3.667.707-6.787-2.708-5.752-6.296l25.469-88.291c1.036-3.594-2.095-7.012-5.766-6.293"></path></svg></div>
								<div data-slot="field-label" class={CHOICE_TITLE}>Vite</div>
							</div>
							<span data-checked={templateVite ? '' : undefined} data-unchecked={templateVite ? undefined : ''} role="radio" tabindex={templateVite ? '0' : '-1'} aria-checked={templateVite ? 'true' : 'false'} data-composite-item-active={templateVite ? '' : undefined} id="template-vite-radio" data-slot="radio-group-item" class={RADIO_ITEM_SR} aria-labelledby="template-vite-label">
								<span data-checked="" data-slot="radio-group-indicator" class={RADIO_INDICATOR} hidden={!templateVite}>
									<span class={RADIO_DOT}></span>
								</span>
							</span>
							<input id="template-vite" tabindex="-1" aria-hidden="true" type="radio" value="vite" checked={templateVite} style={FOCUS_GUARD} data-create-choice="template" />
						</div>
					</label>
					<label data-slot="field-label" class={CHOICE_LABEL} for="template-start" id="template-start-label">
						<div role="group" data-slot="field" data-orientation="horizontal" class={CHOICE_FIELD}>
							<div data-slot="field-content" class={TEMPLATE_CONTENT}>
								<div class={TEMPLATE_LOGO}><svg role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><title>TanStack</title><path d="M11.078.042c.316-.042.65-.014.97-.014 1.181 0 2.341.184 3.472.532a12.3 12.3 0 0 1 3.973 2.086 11.9 11.9 0 0 1 3.432 4.33c1.446 3.15 1.436 6.97-.046 10.107-.958 2.029-2.495 3.727-4.356 4.965-1.518 1.01-3.293 1.629-5.1 1.848-2.298.279-4.784-.129-6.85-1.188-3.88-1.99-6.518-5.994-6.57-10.382-.01-.846.003-1.697.17-2.534.273-1.365.748-2.683 1.463-3.88a12 12 0 0 1 2.966-3.36A12.3 12.3 0 0 1 9.357.3a12 12 0 0 1 1.255-.2l.133-.016zM7.064 19.99c-.535.057-1.098.154-1.557.454.103.025.222 0 .33 0 .258 0 .52-.01.778.002.647.028 1.32.131 1.945.303.8.22 1.505.65 2.275.942.813.307 1.622.402 2.484.402.435 0 .866-.001 1.287-.12-.22-.117-.534-.095-.778-.144a11 11 0 0 1-1.556-.416 12 12 0 0 1-1.093-.467l-.23-.108a15 15 0 0 0-1.012-.44c-.905-.343-1.908-.512-2.873-.408m.808-2.274c-1.059 0-2.13.187-3.083.667q-.346.177-.659.41c-.063.046-.175.106-.199.188s.061.151.11.204c.238-.127.464-.261.718-.357 1.64-.624 3.63-.493 5.268.078.817.285 1.569.712 2.365 1.046.89.374 1.798.616 2.753.74 1.127.147 2.412.028 3.442-.48.362-.179.865-.451 1.018-.847-.189.017-.36.098-.539.154a9 9 0 0 1-.868.222c-.994.2-2.052.24-3.053.06-.943-.17-1.82-.513-2.693-.873l-.111-.046-.223-.092-.112-.046a26 26 0 0 0-1.35-.527c-.89-.31-1.842-.5-2.784-.5M9.728 1.452c-1.27.28-2.407.826-3.502 1.514-.637.4-1.245.81-1.796 1.323-.82.765-1.447 1.695-1.993 2.666-.563 1-.924 2.166-1.098 3.297-.172 1.11-.2 2.277-.004 3.388.245 1.388.712 2.691 1.448 3.897.248-.116.424-.38.629-.557.414-.359.85-.691 1.317-.978a3.5 3.5 0 0 1 .539-.264c.07-.029.187-.055.22-.132.053-.124-.045-.34-.062-.468a7 7 0 0 1-.068-1.109 9.7 9.7 0 0 1 .61-3.177c.29-.76.73-1.45 1.254-2.069.177-.21.365-.405.56-.6.115-.114.258-.212.33-.359-.376 0-.751.108-1.108.218-.769.237-1.518.588-2.155 1.084-.291.226-.504.522-.779.76-.084.073-.235.17-.352.116-.176-.083-.149-.43-.169-.59-.078-.612.154-1.387.45-1.918.473-.852 1.348-1.58 2.376-1.555.444.011.833.166 1.257.266-.107-.153-.252-.264-.389-.39a5.4 5.4 0 0 0-1.107-.8c-.163-.085-.338-.136-.509-.2-.086-.03-.195-.074-.227-.17-.06-.177.26-.342.377-.417.453-.289 1.01-.527 1.556-.54.854-.021 1.688.452 2.04 1.258.123.284.16.583.184.885l.004.057.006.085.002.029.005.057.004.056c.268-.218.457-.54.718-.774.612-.547 1.45-.79 2.245-.544a2.97 2.97 0 0 1 1.71 1.378c.097.173.365.595.171.767-.152.134-.344.03-.504-.026a3 3 0 0 0-.372-.094l-.068-.014-.069-.013a3.9 3.9 0 0 0-1.377-.002c-.282.05-.557.15-.838.192v.06c.768.006 1.51.444 1.89 1.109.157.275.235.59.295.9.075.38.022.796-.082 1.168-.035.125-.098.336-.247.365-.106.02-.195-.085-.256-.155a4.6 4.6 0 0 0-.492-.522 20 20 0 0 0-1.467-1.14c-.267-.19-.56-.44-.868-.556.087.208.171.402.2.63.088.667-.192 1.296-.612 1.798a2.6 2.6 0 0 1-.426.427c-.067.05-.151.114-.24.1-.277-.044-.31-.463-.353-.677-.144-.726-.086-1.447.114-2.158-.178.09-.307.287-.418.45a5.3 5.3 0 0 0-.612 1.138c-.61 1.617-.604 3.51.186 5.066.088.174.221.15.395.15h.157a3 3 0 0 1 .472.018c.08.01.193 0 .257.06.077.072.036.194.018.282-.05.246-.066.469-.066.72.328-.051.419-.576.535-.84.131-.298.265-.597.387-.9.06-.148.14-.314.119-.479-.024-.185-.157-.381-.25-.54-.177-.298-.378-.606-.508-.929-.104-.258-.007-.58.286-.672.161-.05.334.049.439.166.22.244.363.609.523.896l1.249 2.248q.159.286.32.57c.043.074.086.188.173.219.077.028.182-.012.26-.027.198-.04.398-.083.598-.12.24-.043.605-.035.778-.222-.253-.08-.545-.075-.808-.057-.158.01-.333.067-.479-.025-.216-.137-.36-.455-.492-.667-.326-.525-.633-1.057-.945-1.59l-.05-.084-.1-.17q-.075-.126-.149-.255c-.037-.066-.092-.153-.039-.227.056-.076.179-.08.29-.081h.021q.066.001.117-.004a10 10 0 0 1 1.347-.107c-.035-.122-.135-.26-.103-.39.071-.292.49-.383.686-.174.131.14.207.334.292.504.113.223.24.44.361.66.211.383.441.757.658 1.138l.055.094.028.047c.093.156.187.314.238.489-.753-.035-1.318-.909-1.646-1.499-.027.095.016.179.05.27q.103.282.262.54c.152.244.326.495.556.673.408.315.945.317 1.436.283.315-.022.708-.165 1.018-.068s.434.438.25.7c-.138.196-.321.27-.55.3.162.346.373.667.527 1.02.064.146.13.37.283.448.102.051.248.003.358 0-.11-.292-.317-.54-.419-.839.31.015.61.176.898.28.567.202 1.128.424 1.687.648l.258.104c.23.092.462.183.689.283.083.037.198.123.29.07.074-.043.123-.146.169-.215a10.3 10.3 0 0 0 1.393-3.208c.75-2.989.106-6.287-1.695-8.783-.692-.96-1.562-1.789-2.522-2.476-2.401-1.718-5.551-2.407-8.44-1.768m4.908 14.904c-.636.166-1.292.317-1.945.401.086.293.296.577.45.84.059.101.122.237.24.281.132.05.292-.03.417-.072-.058-.158-.155-.3-.235-.45-.033-.06-.084-.133-.056-.206.05-.137.263-.13.381-.153.31-.063.617-.142.928-.204.114-.023.274-.085.389-.047.086.03.138.1.187.174l.022.033q.043.07.097.122c.125.113.313.13.472.162-.097-.219-.259-.41-.362-.63-.06-.127-.11-.315-.242-.388-.182-.102-.557.089-.743.137m-4.01-1.457c-.03.38-.147.689-.33 1.019.21.026.423.036.629.087.154.038.296.11.449.153-.082-.224-.233-.423-.35-.63-.12-.208-.226-.462-.398-.63" fill="currentColor"></path></svg></div>
								<div data-slot="field-label" class={CHOICE_TITLE}>TanStack Start</div>
							</div>
							<span data-checked={templateStart ? '' : undefined} data-unchecked={templateStart ? undefined : ''} role="radio" tabindex={templateStart ? '0' : '-1'} aria-checked={templateStart ? 'true' : 'false'} data-composite-item-active={templateStart ? '' : undefined} id="template-start-radio" data-slot="radio-group-item" class={RADIO_ITEM_SR} aria-labelledby="template-start-label">
								<span data-checked="" data-slot="radio-group-indicator" class={RADIO_INDICATOR} hidden={!templateStart}>
									<span class={RADIO_DOT}></span>
								</span>
							</span>
							<input id="template-start" tabindex="-1" aria-hidden="true" type="radio" value="start" checked={templateStart} style={FOCUS_GUARD} data-create-choice="template" />
						</div>
					</label>
					<label data-slot="field-label" class={CHOICE_LABEL} for="template-laravel" id="template-laravel-label">
						<div role="group" data-slot="field" data-orientation="horizontal" class={CHOICE_FIELD}>
							<div data-slot="field-content" class={TEMPLATE_CONTENT}>
								<div class={TEMPLATE_LOGO}><svg role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><title>Laravel</title><path d="M23.642 5.43a.364.364 0 0 1 .014.1v5.149c0 .135-.073.26-.189.326l-4.323 2.49v4.934a.378.378 0 0 1-.188.326L9.93 23.949a.316.316 0 0 1-.066.027c-.008.002-.016.008-.024.01a.348.348 0 0 1-.192 0c-.011-.002-.02-.008-.03-.012-.02-.008-.042-.014-.062-.025L.533 18.755a.376.376 0 0 1-.189-.326V2.974c0-.033.005-.066.014-.098.003-.012.01-.02.014-.032a.369.369 0 0 1 .023-.058c.004-.013.015-.022.023-.033l.033-.045c.012-.01.025-.018.037-.027.014-.012.027-.024.041-.034h.001L5.044.05a.375.375 0 0 1 .375 0L9.933 2.697h.002c.015.01.027.021.04.033l.038.027c.013.014.02.03.033.045.008.011.02.021.025.033.01.02.017.038.024.058.003.011.01.021.013.032.01.031.014.064.014.098v9.652l3.76-2.164V5.527c0-.033.004-.066.013-.098.003-.01.01-.02.013-.032a.487.487 0 0 1 .024-.059c.007-.012.018-.02.025-.033.012-.015.021-.03.033-.043.012-.012.025-.02.037-.028.014-.011.026-.023.041-.032h.001l4.513-2.647a.375.375 0 0 1 .375 0l4.513 2.647c.016.011.029.021.042.031.012.01.025.018.036.028.013.014.022.03.034.045.008.012.019.021.024.033a.3.3 0 0 1 .024.06c.006.01.012.021.015.032zm-.74 5.032V5.860l-1.578.908-2.182 1.256v4.603zm-4.514 7.75v-4.605l-2.148 1.227-6.876 3.93v4.649zm-17.642-15.3v15.15l8.25 4.757v-4.645L4.699 15.87l-.003-.002-.002-.001c-.014-.01-.025-.021-.04-.033-.012-.01-.026-.018-.036-.028l-.001-.002c-.013-.012-.021-.028-.032-.043-.01-.013-.022-.023-.03-.037v-.002c-.01-.014-.016-.032-.023-.048-.006-.012-.016-.023-.02-.035l-.002-.001c-.005-.018-.008-.037-.011-.057L4.5 15.58v-9.51l-2.182-1.256-1.578-.908zm4.322-2.474L1.313 2.974l3.756 2.163 3.755-2.163zm2.068 11.22 2.182-1.256V1.974L7.937 3.23 5.755 4.486v11.186zm10.895-7.583-3.755 2.163 3.755 2.164 3.755-2.164zm-.375 4.976-2.182-1.256-1.578-.908v4.603l2.182 1.256 1.578.908zm-8.438 6.186 5.494-3.14 2.944-1.682-3.755-2.163-4.323 2.489-4.136 2.384z" fill="currentColor"></path></svg></div>
								<div data-slot="field-label" class={CHOICE_TITLE}>Laravel</div>
							</div>
							<span data-checked={templateLaravel ? '' : undefined} data-unchecked={templateLaravel ? undefined : ''} role="radio" tabindex={templateLaravel ? '0' : '-1'} aria-checked={templateLaravel ? 'true' : 'false'} data-composite-item-active={templateLaravel ? '' : undefined} id="template-laravel-radio" data-slot="radio-group-item" class={RADIO_ITEM_SR} aria-labelledby="template-laravel-label">
								<span data-checked="" data-slot="radio-group-indicator" class={RADIO_INDICATOR} hidden={!templateLaravel}>
									<span class={RADIO_DOT}></span>
								</span>
							</span>
							<input id="template-laravel" tabindex="-1" aria-hidden="true" type="radio" value="laravel" checked={templateLaravel} style={FOCUS_GUARD} data-create-choice="template" />
						</div>
					</label>
					<label data-slot="field-label" class={CHOICE_LABEL} for="template-react-router" id="template-react-router-label">
						<div role="group" data-slot="field" data-orientation="horizontal" class={CHOICE_FIELD}>
							<div data-slot="field-content" class={TEMPLATE_CONTENT}>
								<div class={TEMPLATE_LOGO}><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M12.118 5.466a2.306 2.306 0 0 0-.623.08c-.278.067-.702.332-.953.583-.41.423-.49.609-.662 1.469-.08.423.41 1.43.847 1.734.45.317 1.085.502 2.065.608 1.429.16 1.84.636 1.84 2.197 0 1.377-.385 1.747-1.96 1.906-1.707.172-2.58.834-2.765 2.117-.106.781.41 1.76 1.125 2.091 1.627.768 3.15-.198 3.467-2.196.211-1.284.622-1.642 1.998-1.747 1.588-.133 2.409-.675 2.713-1.787.278-1.02-.304-2.157-1.297-2.554-.264-.106-.873-.238-1.35-.291-1.495-.16-1.879-.424-2.038-1.39-.225-1.337-.317-1.562-.794-2.09a2.174 2.174 0 0 0-1.613-.73zm-4.785 4.36a2.145 2.145 0 0 0-.497.048c-1.469.318-2.17 2.051-1.35 3.295 1.178 1.774 3.944.953 3.97-1.177.012-1.193-.98-2.143-2.123-2.166zM2.089 14.19a2.22 2.22 0 0 0-.427.052c-2.158.476-2.237 3.626-.106 4.182.53.145.582.145 1.111.013 1.191-.318 1.866-1.456 1.549-2.607-.278-1.02-1.144-1.664-2.127-1.64zm19.824.008c-.233.002-.477.058-.784.162-1.39.477-1.866 2.092-.98 3.336.557.794 1.96 1.058 2.82.516 1.416-.874 1.363-3.057-.093-3.746-.38-.186-.663-.271-.963-.268z" fill="currentColor"></path></svg></div>
								<div data-slot="field-label" class={CHOICE_TITLE}>React Router</div>
							</div>
							<span data-checked={templateReactRouter ? '' : undefined} data-unchecked={templateReactRouter ? undefined : ''} role="radio" tabindex={templateReactRouter ? '0' : '-1'} aria-checked={templateReactRouter ? 'true' : 'false'} data-composite-item-active={templateReactRouter ? '' : undefined} id="template-react-router-radio" data-slot="radio-group-item" class={RADIO_ITEM_SR} aria-labelledby="template-react-router-label">
								<span data-checked="" data-slot="radio-group-indicator" class={RADIO_INDICATOR} hidden={!templateReactRouter}>
									<span class={RADIO_DOT}></span>
								</span>
							</span>
							<input id="template-react-router" tabindex="-1" aria-hidden="true" type="radio" value="react-router" checked={templateReactRouter} style={FOCUS_GUARD} data-create-choice="template" />
						</div>
					</label>
					<label data-slot="field-label" class={CHOICE_LABEL} for="template-astro" id="template-astro-label">
						<div role="group" data-slot="field" data-orientation="horizontal" class={CHOICE_FIELD}>
							<div data-slot="field-content" class={TEMPLATE_CONTENT}>
								<div class={TEMPLATE_LOGO}><svg role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><title>Astro</title><path d="M16.074 16.86C15.354 17.476 13.917 17.895 12.262 17.895C10.23 17.895 8.527 17.263 8.075 16.412C7.914 16.9 7.877 17.458 7.877 17.814C7.877 17.814 7.771 19.564 8.988 20.782C8.988 20.15 9.501 19.637 10.133 19.637C11.216 19.637 11.215 20.582 11.214 21.349V21.418C11.214 22.582 11.925 23.579 12.937 24C12.7812 23.6794 12.7005 23.3275 12.701 22.971C12.701 21.861 13.353 21.448 14.111 20.968C14.713 20.585 15.383 20.161 15.844 19.308C16.0926 18.8493 16.2225 18.3357 16.222 17.814C16.2221 17.4903 16.1722 17.1685 16.074 16.86ZM15.551 0.6C15.747 0.844 15.847 1.172 16.047 1.829L20.415 16.176C18.7743 15.3246 17.0134 14.7284 15.193 14.408L12.35 4.8C12.3273 4.72337 12.2803 4.65616 12.2162 4.60844C12.152 4.56072 12.0742 4.53505 11.9943 4.53528C11.9143 4.5355 11.8366 4.56161 11.7727 4.60969C11.7089 4.65777 11.6623 4.72524 11.64 4.802L8.83 14.405C7.00149 14.724 5.23264 15.3213 3.585 16.176L7.974 1.827C8.174 1.171 8.274 0.843 8.471 0.6C8.64406 0.385433 8.86922 0.218799 9.125 0.116C9.415 0 9.757 0 10.443 0H13.578C14.264 0 14.608 0 14.898 0.117C15.1529 0.219851 15.3783 0.386105 15.551 0.6Z" fill="currentColor"></path></svg></div>
								<div data-slot="field-label" class={CHOICE_TITLE}>Astro</div>
							</div>
							<span data-checked={templateAstro ? '' : undefined} data-unchecked={templateAstro ? undefined : ''} role="radio" tabindex={templateAstro ? '0' : '-1'} aria-checked={templateAstro ? 'true' : 'false'} data-composite-item-active={templateAstro ? '' : undefined} id="template-astro-radio" data-slot="radio-group-item" class={RADIO_ITEM_SR} aria-labelledby="template-astro-label">
								<span data-checked="" data-slot="radio-group-indicator" class={RADIO_INDICATOR} hidden={!templateAstro}>
									<span class={RADIO_DOT}></span>
								</span>
							</span>
							<input id="template-astro" tabindex="-1" aria-hidden="true" type="radio" value="astro" checked={templateAstro} style={FOCUS_GUARD} data-create-choice="template" />
						</div>
					</label>
				</div>
			</div>
			<GcSeparator />
			<div role="group" data-slot="field" data-orientation="vertical" class={FIELD_V2}>
				<label data-slot="field-label" class={FIELD_LABEL}>Base</label>
				<div role="radiogroup" data-slot="radio-group" aria-label="Base" class={BASE_GRID} onKeyDown={(event) => radioRoving(event)} onClick={(event) => {
					const value = chosen(event, 'base');
					if (value) (t.view = commit({ base: value }));
				}}>
					<label data-slot="field-label" class={CHOICE_LABEL} for="base-base" id="base-base-label">
						<div role="group" data-slot="field" data-orientation="horizontal" class={CHOICE_FIELD}>
							<div data-slot="field-content" class={BASE_CONTENT}>
								<div class={BASE_LOGO}><svg width="17" height="24" viewBox="0 0 17 24"><path fill="currentColor" d="M9.5001 7.01537C9.2245 6.99837 9 7.22385 9 7.49999V23C13.4183 23 17 19.4183 17 15C17 10.7497 13.6854 7.27351 9.5001 7.01537Z"></path><path fill="currentColor" d="M8 9.8V12V23C3.58172 23 0 19.0601 0 14.2V12V1C4.41828 1 8 4.93989 8 9.8Z"></path></svg></div>
								<div data-slot="field-label" class={BASE_TITLE}>Base UI</div>
							</div>
							<span data-checked={baseBaseChosen ? '' : undefined} data-unchecked={baseBaseChosen ? undefined : ''} role="radio" tabindex={baseBaseChosen ? '0' : '-1'} aria-checked={baseBaseChosen ? 'true' : 'false'} data-composite-item-active={baseBaseChosen ? '' : undefined} id="base-base-radio" data-slot="radio-group-item" class={RADIO_ITEM_SR} aria-labelledby="base-base-label">
								<span data-checked="" data-slot="radio-group-indicator" class={RADIO_INDICATOR} hidden={!baseBaseChosen}>
									<span class={RADIO_DOT}></span>
								</span>
							</span>
							<input id="base-base" tabindex="-1" aria-hidden="true" type="radio" value="base" checked={baseBaseChosen} style={FOCUS_GUARD} data-create-choice="base" />
						</div>
					</label>
					<label data-slot="field-label" class={CHOICE_LABEL} for="base-aria" id="base-aria-label">
						<div role="group" data-slot="field" data-orientation="horizontal" class={CHOICE_FIELD}>
							<div data-slot="field-content" class={BASE_CONTENT}>
								<div class={BASE_LOGO}><svg xmlns="http://www.w3.org/2000/svg" viewBox="200 206 800 790" fill="none"><path d="M720.67 205.995C867.583 205.995 986.679 325.091 986.68 472.003C986.68 590.753 908.865 691.325 801.446 725.521L979.312 948.055C994.438 966.98 980.963 995 956.736 995H795.612C778.743 995 762.715 987.629 751.734 974.823L697.365 911.421L493.126 653.39C457.134 607.918 489.518 540.979 547.511 540.977L720.67 540.971C758.758 540.971 789.635 510.091 789.635 472.003C789.634 433.915 758.758 403.038 720.67 403.038H429.939C404.955 403.038 388.623 391.886 373.994 373.623L277.349 252.966C262.194 234.045 275.664 205.996 299.905 205.995H720.67Z M396.605 720.706C407.798 705.406 430.443 704.843 442.381 719.568L503.816 797.018H502.786L535.569 838.934C548.074 854.358 549.943 877.191 538.047 893.09L476.638 972.545C465.692 986.707 448.803 995 430.903 995H242.276C218.18 995 204.665 967.248 219.523 948.278L337.992 797.018H337.923L396.605 720.706Z" fill="currentColor"></path></svg></div>
								<div data-slot="field-label" class={BASE_TITLE}>React Aria</div>
							</div>
							<span data-checked={baseAriaChosen ? '' : undefined} data-unchecked={baseAriaChosen ? undefined : ''} role="radio" tabindex={baseAriaChosen ? '0' : '-1'} aria-checked={baseAriaChosen ? 'true' : 'false'} data-composite-item-active={baseAriaChosen ? '' : undefined} id="base-aria-radio" data-slot="radio-group-item" class={RADIO_ITEM_SR} aria-labelledby="base-aria-label">
								<span data-checked="" data-slot="radio-group-indicator" class={RADIO_INDICATOR} hidden={!baseAriaChosen}>
									<span class={RADIO_DOT}></span>
								</span>
							</span>
							<input id="base-aria" tabindex="-1" aria-hidden="true" type="radio" value="aria" checked={baseAriaChosen} style={FOCUS_GUARD} data-create-choice="base" />
						</div>
					</label>
					<label data-slot="field-label" class={CHOICE_LABEL} for="base-radix" id="base-radix-label">
						<div role="group" data-slot="field" data-orientation="horizontal" class={CHOICE_FIELD}>
							<div data-slot="field-content" class={BASE_CONTENT}>
								<div class={BASE_LOGO}><svg role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><title>Radix UI</title><path fill="currentColor" d="M11.52 24a7.68 7.68 0 0 1-7.68-7.68 7.68 7.68 0 0 1 7.68-7.68V24Zm0-24v7.68H3.84V0h7.68Zm4.8 7.68a3.84 3.84 0 1 1 0-7.68 3.84 3.84 0 0 1 0 7.68Z"></path></svg></div>
								<div data-slot="field-label" class={BASE_TITLE}>Radix UI</div>
							</div>
							<span data-checked={baseRadixChosen ? '' : undefined} data-unchecked={baseRadixChosen ? undefined : ''} role="radio" tabindex={baseRadixChosen ? '0' : '-1'} aria-checked={baseRadixChosen ? 'true' : 'false'} data-composite-item-active={baseRadixChosen ? '' : undefined} id="base-radix-radio" data-slot="radio-group-item" class={RADIO_ITEM_SR} aria-labelledby="base-radix-label">
								<span data-checked="" data-slot="radio-group-indicator" class={RADIO_INDICATOR} hidden={!baseRadixChosen}>
									<span class={RADIO_DOT}></span>
								</span>
							</span>
							<input id="base-radix" tabindex="-1" aria-hidden="true" type="radio" value="radix" checked={baseRadixChosen} style={FOCUS_GUARD} data-create-choice="base" />
						</div>
					</label>
				</div>
			</div>
			<GcSeparator />
			<fieldset data-slot="field-set" class={FIELD_SET}>
				<legend data-slot="field-legend" data-variant="label" class={LEGEND_SR}>Options</legend>
				<div role="group" data-slot="field" data-orientation="horizontal" class={FIELD_H} data-disabled={undefined}>
					<label data-slot="field-label" class={OPTION_LABEL} for="pointer" id="pointer-label"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" color="currentColor" class="size-4 -rotate-90"><path d="M13.485 10.7553L16.4892 10.7553M16.4892 10.7553H19.9954C20.8264 10.7553 21.5 10.083 21.5 9.25355C21.5 8.42415 20.8264 7.75178 19.9954 7.75178L14.531 7.75178M16.4892 10.7553L16.4624 11.8097C16.4443 12.5207 16.056 13.1373 15.4844 13.4776M14.531 7.75178L9.96807 7.75178M14.531 7.75178L11.7712 5.15834C9.90362 3.58588 8.54219 4.4122 7.78577 4.99245L5.34841 6.60732C3.28085 7.83214 2.5 9.2495 2.5 10.4418V15.3225C2.5 17.5886 4.88227 19.7016 7.06579 19.7016L12.2657 19.7497C13.2759 19.759 14.135 19.0163 14.27 18.017L14.4593 16.4766M13.4552 13.7589H14.4593C14.8335 13.7589 15.1842 13.6563 15.4844 13.4776M15.4844 13.4776L15.4297 14.8132C15.4021 15.8977 14.5134 16.7624 13.4266 16.7624H12.4226" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"></path></svg>{'Use pointer on buttons'}</label>
					<span data-checked={t.view.params.pointer ? '' : undefined} data-unchecked={t.view.params.pointer ? undefined : ''} data-disabled={undefined} role="switch" tabindex="0" id="pointer-switch" aria-checked={t.view.params.pointer ? 'true' : 'false'} aria-disabled={undefined} data-slot="switch" data-size="default" class={SWITCH} aria-labelledby="pointer-label" onClick={() => {
						(t.view = commit({ pointer: !t.view.params.pointer }));
					}} onKeyDown={(event) => {
						if (switchKey(event)) (t.view = commit({ pointer: !t.view.params.pointer }));
					}}>
						<span data-checked={t.view.params.pointer ? '' : undefined} data-unchecked={t.view.params.pointer ? undefined : ''} data-disabled={undefined} data-slot="switch-thumb" class={SWITCH_THUMB}></span>
					</span>
					<input id="pointer" tabindex="-1" aria-hidden="true" type="checkbox" checked={t.view.params.pointer} disabled={undefined} style={FOCUS_GUARD} onClick={(event) => {
						event.preventDefault();
						(t.view = commit({ pointer: !t.view.params.pointer }));
					}} />
				</div>
				<GcSeparator />
				<div role="group" data-slot="field" data-orientation="horizontal" class={FIELD_H} data-disabled={!hasMonorepo ? 'true' : undefined}>
					<label data-slot="field-label" class={OPTION_LABEL} for="monorepo" id="monorepo-label"><span class={MONOREPO_LOGO}><svg role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><title>Turborepo</title><path d={TURBOREPO_PATH}></path></svg></span>{'Create a monorepo'}</label>
					<span data-checked={monorepo ? '' : undefined} data-unchecked={monorepo ? undefined : ''} data-disabled={!hasMonorepo ? '' : undefined} role="switch" tabindex={!hasMonorepo ? '-1' : '0'} id="monorepo-switch" aria-checked={monorepo ? 'true' : 'false'} aria-disabled={!hasMonorepo ? 'true' : undefined} data-slot="switch" data-size="default" class={SWITCH} aria-labelledby="monorepo-label" onClick={() => {
						if (!!hasMonorepo) (t.view = commit({ template: templateValue(frameworkOf(t.view.params.template), !t.view.params.template.endsWith('-monorepo')) }));
					}} onKeyDown={(event) => {
						if (switchKey(event) && !!hasMonorepo) (t.view = commit({ template: templateValue(frameworkOf(t.view.params.template), !t.view.params.template.endsWith('-monorepo')) }));
					}}>
						<span data-checked={monorepo ? '' : undefined} data-unchecked={monorepo ? undefined : ''} data-disabled={!hasMonorepo ? '' : undefined} data-slot="switch-thumb" class={SWITCH_THUMB}></span>
					</span>
					<input id="monorepo" tabindex="-1" aria-hidden="true" type="checkbox" checked={monorepo} disabled={!hasMonorepo ? true : undefined} style={FOCUS_GUARD} onClick={(event) => {
						event.preventDefault();
						if (!!hasMonorepo) (t.view = commit({ template: templateValue(frameworkOf(t.view.params.template), !t.view.params.template.endsWith('-monorepo')) }));
					}} />
				</div>
				<GcSeparator />
				<div role="group" data-slot="field" data-orientation="horizontal" class={FIELD_H} data-disabled={undefined}>
					<label data-slot="field-label" class={OPTION_LABEL} for="rtl" id="rtl-label"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" color="currentColor" class="size-4"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="1.5"></circle><path d="M8 12C8 18 12 22 12 22C12 22 16 18 16 12C16 6 12 2 12 2C12 2 8 6 8 12Z" stroke="currentColor" stroke-linejoin="round" stroke-width="1.5"></path><path d="M21 15H3" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"></path><path d="M21 9H3" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"></path></svg>{'Enable RTL support'}</label>
					<span data-checked={t.view.params.rtl ? '' : undefined} data-unchecked={t.view.params.rtl ? undefined : ''} data-disabled={undefined} role="switch" tabindex="0" id="rtl-switch" aria-checked={t.view.params.rtl ? 'true' : 'false'} aria-disabled={undefined} data-slot="switch" data-size="default" class={SWITCH} aria-labelledby="rtl-label" onClick={() => {
						(t.view = commit({ rtl: !t.view.params.rtl }));
					}} onKeyDown={(event) => {
						if (switchKey(event)) (t.view = commit({ rtl: !t.view.params.rtl }));
					}}>
						<span data-checked={t.view.params.rtl ? '' : undefined} data-unchecked={t.view.params.rtl ? undefined : ''} data-disabled={undefined} data-slot="switch-thumb" class={SWITCH_THUMB}></span>
					</span>
					<input id="rtl" tabindex="-1" aria-hidden="true" type="checkbox" checked={t.view.params.rtl} disabled={undefined} style={FOCUS_GUARD} onClick={(event) => {
						event.preventDefault();
						(t.view = commit({ rtl: !t.view.params.rtl }));
					}} />
				</div>
			</fieldset>
		</div>
		<div data-slot="dialog-footer" class={GC_FOOTER}>
			<div class="flex w-full min-w-0 flex-col gap-3">
				<CommandTabs mode="init" />
				<button type="button" tabindex="0" data-slot="button" class={WIDE_BUTTON} onClick={() => {
					void copyText(commandOf(t.view.params, t.packageManager, t.applyMode, 'init'));
					t.copiedTarget = 'command';
					afterCopy(() => (t.copiedTarget = ''));
				}}>{t.copiedTarget === 'command' ? 'Copied' : 'Copy Command'}</button>
			</div>
		</div>
	</div>
}

function ExistingProject() @{
	const t = createState();
	const applyFull = computed(() => t.applyMode === 'full');
	const applyTheme = computed(() => t.applyMode === 'theme');
	const applyFont = computed(() => t.applyMode === 'font');

	<div class={GC_SCROLL} hidden={t.getCodeTab !== 'existing-project'}>
		<div data-slot="field-group" class={GC_FIELD_GROUP}>
			<fieldset data-slot="field-set" class={APPLY_FIELD_SET}>
				<legend data-slot="field-legend" data-variant="label" class={APPLY_LEGEND}>Apply Preset</legend>
				<p data-slot="field-description" class={FIELD_DESCRIPTION}>Pick which parts of the preset to apply.</p>
				<div role="radiogroup" data-slot="radio-group" aria-label="Apply" class={APPLY_GRID} onKeyDown={(event) => radioRoving(event)} onClick={(event) => {
					const value = chosen(event, 'apply');
					if (value) t.applyMode = value;
				}}>
					<label data-slot="field-label" class={APPLY_LABEL} for="apply-full" id="apply-full-label">
						<div role="group" data-slot="field" data-orientation="horizontal" class={APPLY_FIELD}>
							<span data-checked={applyFull ? '' : undefined} data-unchecked={applyFull ? undefined : ''} role="radio" tabindex={applyFull ? '0' : '-1'} aria-checked={applyFull ? 'true' : 'false'} data-composite-item-active={applyFull ? '' : undefined} id="apply-full-radio" data-slot="radio-group-item" class={APPLY_RADIO} aria-labelledby="apply-full-label">
								<span data-checked="" data-slot="radio-group-indicator" class={RADIO_INDICATOR} hidden={!applyFull}>
									<span class={RADIO_DOT}></span>
								</span>
							</span>
							<input id="apply-full" tabindex="-1" aria-hidden="true" type="radio" value="full" checked={applyFull} style={FOCUS_GUARD} data-create-choice="apply" />
							<div data-slot="field-content" class={APPLY_CONTENT}>
								<div data-slot="field-label" class={APPLY_TITLE}>Full preset</div>
								<p data-slot="field-description" class={FIELD_DESCRIPTION}>Everything from the preset, including components, theme, and fonts.</p>
							</div>
						</div>
					</label>
					<label data-slot="field-label" class={APPLY_LABEL} for="apply-theme" id="apply-theme-label">
						<div role="group" data-slot="field" data-orientation="horizontal" class={APPLY_FIELD}>
							<span data-checked={applyTheme ? '' : undefined} data-unchecked={applyTheme ? undefined : ''} role="radio" tabindex={applyTheme ? '0' : '-1'} aria-checked={applyTheme ? 'true' : 'false'} data-composite-item-active={applyTheme ? '' : undefined} id="apply-theme-radio" data-slot="radio-group-item" class={APPLY_RADIO} aria-labelledby="apply-theme-label">
								<span data-checked="" data-slot="radio-group-indicator" class={RADIO_INDICATOR} hidden={!applyTheme}>
									<span class={RADIO_DOT}></span>
								</span>
							</span>
							<input id="apply-theme" tabindex="-1" aria-hidden="true" type="radio" value="theme" checked={applyTheme} style={FOCUS_GUARD} data-create-choice="apply" />
							<div data-slot="field-content" class={APPLY_CONTENT}>
								<div data-slot="field-label" class={APPLY_TITLE}>Theme only</div>
								<p data-slot="field-description" class={FIELD_DESCRIPTION}>Theme tokens only, like colors, radii, and shadows. Components stay as they are.</p>
							</div>
						</div>
					</label>
					<label data-slot="field-label" class={APPLY_LABEL} for="apply-font" id="apply-font-label">
						<div role="group" data-slot="field" data-orientation="horizontal" class={APPLY_FIELD}>
							<span data-checked={applyFont ? '' : undefined} data-unchecked={applyFont ? undefined : ''} role="radio" tabindex={applyFont ? '0' : '-1'} aria-checked={applyFont ? 'true' : 'false'} data-composite-item-active={applyFont ? '' : undefined} id="apply-font-radio" data-slot="radio-group-item" class={APPLY_RADIO} aria-labelledby="apply-font-label">
								<span data-checked="" data-slot="radio-group-indicator" class={RADIO_INDICATOR} hidden={!applyFont}>
									<span class={RADIO_DOT}></span>
								</span>
							</span>
							<input id="apply-font" tabindex="-1" aria-hidden="true" type="radio" value="font" checked={applyFont} style={FOCUS_GUARD} data-create-choice="apply" />
							<div data-slot="field-content" class={APPLY_CONTENT}>
								<div data-slot="field-label" class={APPLY_TITLE}>Fonts only</div>
								<p data-slot="field-description" class={FIELD_DESCRIPTION}>Only preset fonts for body and headings. Components stay as they are.</p>
							</div>
						</div>
					</label>
				</div>
			</fieldset>
		</div>
		<div data-slot="dialog-footer" class={GC_FOOTER}>
			<div class="flex w-full min-w-0 flex-col gap-3">
				<CommandTabs mode="apply" />
				<button type="button" tabindex="0" data-slot="button" class={WIDE_BUTTON} onClick={() => {
					void copyText(commandOf(t.view.params, t.packageManager, t.applyMode, 'apply'));
					t.copiedTarget = 'apply';
					afterCopy(() => (t.copiedTarget = ''));
				}}>{t.copiedTarget === 'apply' ? 'Copied' : 'Copy Command'}</button>
			</div>
		</div>
	</div>
}

function ThemeTokens() @{
	const t = createState();
	const css = computed(() => themeCss(t.view.params));
	const themeFront = computed(() => (t.copiedTarget === 'theme' ? TICK : COPY_FRONT));
	const themeBack = computed(() => (t.copiedTarget === 'theme' ? true : undefined));

	<div class={GC_SCROLL} hidden={t.getCodeTab !== 'theme'}>
		<div data-slot="field-group" class={GC_FIELD_GROUP_THEME}>
			<fieldset data-slot="field-set" class={THEME_FIELD_SET}>
				<legend data-slot="field-legend" data-variant="label" class={APPLY_LEGEND}>Theme Tokens</legend>
				<p data-slot="field-description" class={FIELD_DESCRIPTION}>Copy the CSS variables for this preset.</p>
				<div class="w-full min-w-0 overflow-hidden rounded-xl border-0 ring-1 ring-border">
					<div class="flex items-center gap-2 py-1 pr-1.5 pl-3">
						<div class="min-w-0 truncate font-mono text-sm text-muted-foreground">globals.css</div>
						<button type="button" tabindex="0" data-slot="button" class={ICON_BUTTON} onClick={() => {
							void copyText(themeCss(t.view.params));
							t.copiedTarget = 'theme';
							afterCopy(() => (t.copiedTarget = ''));
						}}>
							<CopyIcon front={themeFront} back={themeBack} />
							<span class="sr-only">Copy theme</span>
						</button>
					</div>
					<div class="relative no-scrollbar max-h-[45svh] overflow-auto border-t bg-popover p-3">
						<pre class="min-w-max font-mono leading-normal whitespace-pre"><code>{css}</code></pre>
					</div>
				</div>
			</fieldset>
		</div>
		<div data-slot="dialog-footer" class={GC_FOOTER}>
			<button type="button" tabindex="0" data-slot="button" class={WIDE_BUTTON} onClick={() => {
							void copyText(themeCss(t.view.params));
							t.copiedTarget = 'theme';
							afterCopy(() => (t.copiedTarget = ''));
						}}>{t.copiedTarget === 'theme' ? 'Copied' : 'Copy Theme'}</button>
		</div>
	</div>
}

/** The command a ProjectForm tab shows and copies. */
const commandOf = (params: CreateParams, pm: string, applyMode: string, mode: string): string => (mode === 'init' ? initCommand(params, pm as PackageManager, commandOptions) : applyCommand(params, pm as PackageManager, applyMode, commandOptions));

function GcSeparator() @{
	<div data-slot="field-separator" data-content="false" class={GC_SEPARATOR}>
		<div data-orientation="horizontal" role="separator" aria-orientation="horizontal" data-slot="separator" class={SEPARATOR_LINE}></div>
	</div>
}

// RadioGroup's keys: Space checks the focused radio; an arrow focuses and checks the next (CompositeRoot's onNavigate).
function radioRoving(event: KeyboardEvent): void {
	const target = event.target as HTMLElement;
	if (event.key === ' ' && target.matches('[role="radio"]')) {
		event.preventDefault();
		target.closest('label')?.querySelector<HTMLInputElement>('input[type="radio"]')?.click();
		return;
	}
	const to = moveFocus(event, '[role="radio"]', false);
	to?.closest('label')?.querySelector<HTMLInputElement>('input[type="radio"]')?.click();
}

// A label's click reaches its radio's input: the value it checks in that group.
const chosen = (event: MouseEvent, group: string): string | undefined => {
	const input = event.target as HTMLInputElement;
	return input instanceof HTMLInputElement && input.dataset.createChoice === group ? input.value : undefined;
};

// Base UI Switch: Space and Enter toggle it.
function switchKey(event: KeyboardEvent): boolean {
	if (event.key !== ' ' && event.key !== 'Enter') return false;
	event.preventDefault();
	return true;
}

/** The package manager tabs over the command, its copy button beside them. */
function CommandTabs({ mode }: { readonly mode: string }) @{
	const t = createState();
	const pm = computed(() => t.packageManager);
	const index = computed(() => String(PACKAGE_MANAGER_LIST.indexOf(t.packageManager as PackageManager)));
	// The tab shown says which command: a prop read here would be the other instance's (the two sit in different tabs).
	const command = computed(() => commandOf(t.view.params, t.packageManager, t.applyMode, t.getCodeTab === 'existing-project' ? 'apply' : 'init'));
	const front = computed(() => (t.copiedTarget === (t.getCodeTab === 'existing-project' ? 'apply' : 'command') ? TICK : COPY_FRONT));
	const back = computed(() => (t.copiedTarget === (t.getCodeTab === 'existing-project' ? 'apply' : 'command') ? true : undefined));

	<div data-orientation="horizontal" data-activation-direction="none" data-slot="tabs" class={TABS}>
		<div class="flex items-center gap-2 py-1 pr-1.5 pl-1">
			<div data-orientation="horizontal" data-activation-direction="none" role="tablist" data-slot="tabs-list" data-variant="default" class={TABS_LIST}>
				<button type="button" data-active={pm === 'pnpm' ? '' : undefined} data-orientation="horizontal" data-activation-direction="none" aria-disabled="false" tabindex={pm === 'pnpm' ? '0' : '-1'} role="tab" aria-selected={pm === 'pnpm' ? 'true' : 'false'} id={`create-${mode}-pnpm`} data-composite-item-active={pm === 'pnpm' ? '' : undefined} data-slot="tabs-trigger" class={TAB} onClick={() => (t.packageManager = chooseManager('pnpm'))} onKeyDown={(event) => {
					if (activates(event)) t.packageManager = chooseManager('pnpm');
				}}>pnpm</button>
				<button type="button" data-active={pm === 'npm' ? '' : undefined} data-orientation="horizontal" data-activation-direction="none" aria-disabled="false" tabindex={pm === 'npm' ? '0' : '-1'} role="tab" aria-selected={pm === 'npm' ? 'true' : 'false'} id={`create-${mode}-npm`} data-composite-item-active={pm === 'npm' ? '' : undefined} data-slot="tabs-trigger" class={TAB} onClick={() => (t.packageManager = chooseManager('npm'))} onKeyDown={(event) => {
					if (activates(event)) t.packageManager = chooseManager('npm');
				}}>npm</button>
				<button type="button" data-active={pm === 'yarn' ? '' : undefined} data-orientation="horizontal" data-activation-direction="none" aria-disabled="false" tabindex={pm === 'yarn' ? '0' : '-1'} role="tab" aria-selected={pm === 'yarn' ? 'true' : 'false'} id={`create-${mode}-yarn`} data-composite-item-active={pm === 'yarn' ? '' : undefined} data-slot="tabs-trigger" class={TAB} onClick={() => (t.packageManager = chooseManager('yarn'))} onKeyDown={(event) => {
					if (activates(event)) t.packageManager = chooseManager('yarn');
				}}>yarn</button>
				<button type="button" data-active={pm === 'bun' ? '' : undefined} data-orientation="horizontal" data-activation-direction="none" aria-disabled="false" tabindex={pm === 'bun' ? '0' : '-1'} role="tab" aria-selected={pm === 'bun' ? 'true' : 'false'} id={`create-${mode}-bun`} data-composite-item-active={pm === 'bun' ? '' : undefined} data-slot="tabs-trigger" class={TAB} onClick={() => (t.packageManager = chooseManager('bun'))} onKeyDown={(event) => {
					if (activates(event)) t.packageManager = chooseManager('bun');
				}}>bun</button>
			</div>
			<button type="button" tabindex="0" data-slot="button" class={ICON_BUTTON} onClick={() => {
				const shown = t.getCodeTab === 'existing-project' ? 'apply' : 'init';
				void copyText(commandOf(t.view.params, t.packageManager, t.applyMode, shown));
				t.copiedTarget = shown === 'init' ? 'command' : 'apply';
				afterCopy(() => (t.copiedTarget = ''));
			}}>
				<CopyIcon front={front} back={back} />
				<span class="sr-only">Copy command</span>
			</button>
		</div>
		<div data-orientation="horizontal" data-activation-direction="none" id={`create-${mode}-panel`} role="tabpanel" tabindex="0" data-index={index} data-slot="tabs-content" class="flex-1 text-sm outline-none" aria-labelledby={`create-${mode}-${pm}`}>
			<div class="relative overflow-hidden border-t bg-popover p-3">
				<div class="no-scrollbar overflow-x-auto">
					<code class="font-mono text-sm whitespace-nowrap">{command}</code>
				</div>
			</div>
		</div>
	</div>
}

/** Tabs' onValueChange: use-config keeps the package manager. */
function chooseManager(pm: string): string {
	choosePackageManager(pm);
	return pm;
}
// Base UI Tabs (activateOnFocus off): Enter and Space activate the focused tab, the arrows only move focus.
function activates(event: KeyboardEvent): boolean {
	if (event.key === 'Enter' || event.key === ' ') {
		event.preventDefault();
		return true;
	}
	roving(event);
	return false;
}

/** HugeiconsIcon Copy01Icon, Tick02Icon while the copy is fresh. */
// Its props are used as they come: its instances sit in different components.
function CopyIcon({ front, back }: { readonly front: string; readonly back?: true }) @{
	<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" color="currentColor" class="">
		<path d={front} stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"></path>
		<path d={COPY_BACK} stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" hidden={back}></path>
	</svg>
}
const TICK = 'M5 14L8.5 17.5L19 6.5';
