import { computed, state } from '@markless/core';
import { cookieValue, fonts } from '../../lib/settings/data.ts';
import { revalidate, submitForm } from '../../lib/settings/validate.ts';
import { SettingsLayout } from '../../components/settings/settings-layout.tsrx';
import { setFont, setTheme } from '../../lib/settings/appearance.ts';
import { nextRadio } from '../../lib/settings/radio.ts';
import { DURATION, expired, message, type Toast } from '../../lib/parity/sonner/index.ts';
import { Toaster } from '../../lib/parity/sonner/toaster.tsrx';

export default function SettingsAppearance() @{
	// The server renders the providers' defaults for every visitor; the saved font and theme cookies are read in the
	// browser, as the old FontProvider and ThemeProvider did (onIdle on the form below: on Markless 0.7 an onVisible loses the handlers inside the shell's moved dialogs).
	let font = state('inter');
	let theme = state('system');
	let currentFont = state('inter');
	let currentTheme = state('system');
	let errors = state<Record<string, string>>({});
	let submittedOnce = state(false);
	let toasts = state<Toast[]>([]);
	const fontError = computed(() => errors.font ?? '');
	const fontInvalid = computed(() => (errors.font ? 'true' : 'false'));
	const fontDescribed = computed(() => (errors.font ? 'appearance-font-form-item-description appearance-font-form-item-message' : 'appearance-font-form-item-description'));
	const themeError = computed(() => errors.theme ?? '');
	const themeInvalid = computed(() => (errors.theme ? 'true' : 'false'));
	const lightChecked = computed(() => (theme === 'light' ? 'true' : 'false'));
	const lightState = computed(() => (theme === 'light' ? 'checked' : 'unchecked'));
	const lightTab = computed(() => (theme === 'light' ? '0' : '-1'));
	const lightOn = computed(() => theme === 'light');
	const lightDescribed = computed(() => (errors.theme ? 'appearance-light-form-item-description appearance-light-form-item-message' : 'appearance-light-form-item-description'));
	const darkChecked = computed(() => (theme === 'dark' ? 'true' : 'false'));
	const darkState = computed(() => (theme === 'dark' ? 'checked' : 'unchecked'));
	const darkTab = computed(() => (theme === 'dark' ? '0' : '-1'));
	const darkOn = computed(() => theme === 'dark');
	const darkDescribed = computed(() => (errors.theme ? 'appearance-dark-form-item-description appearance-dark-form-item-message' : 'appearance-dark-form-item-description'));

	<SettingsLayout active="/settings/appearance" title="Appearance" desc="Customize the appearance of the app. Automatically switch between day and night themes.">
		<form
			class="space-y-8"
			novalidate
			onIdle={() => {
				const savedFont = cookieValue(document.cookie, 'font') ?? '';
				const savedTheme = cookieValue(document.cookie, 'vite-ui-theme') || 'system';
				const loadedFont = (fonts as readonly string[]).includes(savedFont) ? savedFont : 'inter';
				if (font !== loadedFont) font = loadedFont;
				if (currentFont !== loadedFont) currentFont = loadedFont;
				if (theme !== savedTheme) theme = savedTheme;
				if (currentTheme !== savedTheme) currentTheme = savedTheme;
			}}
			onSubmit={async (event) => {
				event.preventDefault();
				submittedOnce = true;
				const { errors: found, json } = await submitForm('appearance', { theme, font });
				errors = found;
				if (Object.keys(found).length > 0) return;
				if (font !== currentFont) {
					setFont(font);
					currentFont = font;
				}
				if (theme !== currentTheme) {
					setTheme(theme);
					currentTheme = theme;
				}
				const id = `appearance-${Date.now()}`;
				toasts = message(toasts, id, 'You submitted the following values:', json);
				setTimeout(() => {
					toasts = expired(toasts, id);
				}, DURATION);
			}}
		>
			<div data-slot="form-item" class="grid gap-2">
				<label data-slot="form-label" class="flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50 data-[error=true]:text-destructive" data-error={fontInvalid} for="appearance-font-form-item">Font</label>
				<div class="relative w-max">
					<select class="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:border-input h-9 px-4 py-2 has-[>svg]:px-3 w-50 appearance-none font-normal capitalize dark:bg-background dark:hover:bg-background" name="font" data-slot="form-control" id="appearance-font-form-item" aria-describedby={fontDescribed} aria-invalid={fontInvalid} value={font} onChange={(event) => {
						font = (event.target as HTMLSelectElement).value;
						if (submittedOnce) revalidate('appearance', { theme, font }, errors, 'font').then((next) => {
							errors = next;
						});
					}}>
						<option value="inter" selected={font === 'inter'}>inter</option>
						<option value="manrope" selected={font === 'manrope'}>manrope</option>
						<option value="system" selected={font === 'system'}>system</option>
					</select>
					<svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg" class="absolute inset-e-3 top-2.5 h-4 w-4 opacity-50"><path d="M3.13523 6.15803C3.3241 5.95657 3.64052 5.94637 3.84197 6.13523L7.5 9.56464L11.158 6.13523C11.3595 5.94637 11.6759 5.95657 11.8648 6.15803C12.0536 6.35949 12.0434 6.67591 11.842 6.86477L7.84197 10.6148C7.64964 10.7951 7.35036 10.7951 7.15803 10.6148L3.15803 6.86477C2.95657 6.67591 2.94637 6.35949 3.13523 6.15803Z" fill="currentColor" fill-rule="evenodd" clip-rule="evenodd" /></svg>
				</div>
				<p data-slot="form-description" id="appearance-font-form-item-description" class="text-sm text-muted-foreground font-manrope">Set the font you want to use in the dashboard.</p>
				@if (fontError) {
					<p data-slot="form-message" id="appearance-font-form-item-message" class="text-sm text-destructive">{fontError}</p>
				}
			</div>
			<div data-slot="form-item" class="grid gap-2">
				<label data-slot="form-label" class="flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50 data-[error=true]:text-destructive" data-error={themeInvalid} for="appearance-theme-form-item">Theme</label>
				<p data-slot="form-description" id="appearance-theme-form-item-description" class="text-sm text-muted-foreground">Select the theme for the dashboard.</p>
				@if (themeError) {
					<p data-slot="form-message" id="appearance-theme-form-item-message" class="text-sm text-destructive">{themeError}</p>
				}
				<div role="radiogroup" aria-required="false" dir="ltr" data-slot="radio-group" class="grid max-w-md grid-cols-2 gap-8 pt-2" tabindex="0" style="outline: none;" onFocusin={(event) => {
					const group = event.target as HTMLElement;
					if (group.getAttribute('role') === 'radiogroup') (group.querySelector<HTMLElement>('[role=radio][tabindex="0"]') ?? group.querySelector<HTMLElement>('[role=radio]'))?.focus();
				}} onKeydown={(event) => {
					if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'ArrowLeft' || event.key === 'ArrowRight') event.preventDefault();
					const next = nextRadio(event.target, event.key);
					if (next) {
						theme = next.value;
						next.focus();
						if (submittedOnce) revalidate('appearance', { theme: next.value, font }, errors, 'theme').then((next) => {
							errors = next;
						});
					}
				}}>
					<div data-slot="form-item" class="grid gap-2">
					<label data-slot="form-label" class="flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50 data-[error=true]:text-destructive [&:has([data-state=checked])>div]:border-primary" data-error={themeInvalid} for="appearance-light-form-item">
					<button type="button" role="radio" aria-checked={lightChecked} data-state={lightState} value="light" data-slot="form-control" class="aspect-square size-4 shrink-0 rounded-full border border-input text-primary shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:bg-input/30 dark:aria-invalid:ring-destructive/40 sr-only" id="appearance-light-form-item" aria-describedby={lightDescribed} aria-invalid={themeInvalid} tabindex={lightTab} data-radix-collection-item="" onClick={() => {
					theme = 'light';
					if (submittedOnce) revalidate('appearance', { theme, font }, errors, 'theme').then((next) => {
						errors = next;
					});
					}}>
					@if (lightOn) {
					<span data-state="checked" data-slot="radio-group-indicator" class="relative flex items-center justify-center"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-circle absolute top-1/2 left-1/2 size-2 -translate-x-1/2 -translate-y-1/2 fill-primary" aria-hidden="true"><circle cx="12" cy="12" r="10" /></svg></span>
					}
					</button>
					<input aria-hidden="true" tabindex="-1" type="radio" value="light" checked={lightOn} style="transform: translateX(-100%); position: absolute; pointer-events: none; opacity: 0; margin: 0px; width: 16px; height: 16px;" />
					<div class="items-center rounded-md border-2 border-muted p-1 hover:border-accent">
					<div class="space-y-2 rounded-sm bg-[#ecedef] p-2">
					<div class="space-y-2 rounded-md bg-white p-2 shadow-xs">
					<div class="h-2 w-20 rounded-lg bg-[#ecedef]"></div>
					<div class="h-2 w-25 rounded-lg bg-[#ecedef]"></div>
					</div>
					<div class="flex items-center space-x-2 rounded-md bg-white p-2 shadow-xs">
					<div class="h-4 w-4 rounded-full bg-[#ecedef]"></div>
					<div class="h-2 w-25 rounded-lg bg-[#ecedef]"></div>
					</div>
					<div class="flex items-center space-x-2 rounded-md bg-white p-2 shadow-xs">
					<div class="h-4 w-4 rounded-full bg-[#ecedef]"></div>
					<div class="h-2 w-25 rounded-lg bg-[#ecedef]"></div>
					</div>
					</div>
					</div>
					<span class="block w-full p-2 text-center font-normal">Light</span>
					</label>
					</div>
					<div data-slot="form-item" class="grid gap-2">
					<label data-slot="form-label" class="flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50 data-[error=true]:text-destructive [&:has([data-state=checked])>div]:border-primary" data-error={themeInvalid} for="appearance-dark-form-item">
					<button type="button" role="radio" aria-checked={darkChecked} data-state={darkState} value="dark" data-slot="form-control" class="aspect-square size-4 shrink-0 rounded-full border border-input text-primary shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:bg-input/30 dark:aria-invalid:ring-destructive/40 sr-only" id="appearance-dark-form-item" aria-describedby={darkDescribed} aria-invalid={themeInvalid} tabindex={darkTab} data-radix-collection-item="" onClick={() => {
					theme = 'dark';
					if (submittedOnce) revalidate('appearance', { theme, font }, errors, 'theme').then((next) => {
						errors = next;
					});
					}}>
					@if (darkOn) {
					<span data-state="checked" data-slot="radio-group-indicator" class="relative flex items-center justify-center"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-circle absolute top-1/2 left-1/2 size-2 -translate-x-1/2 -translate-y-1/2 fill-primary" aria-hidden="true"><circle cx="12" cy="12" r="10" /></svg></span>
					}
					</button>
					<input aria-hidden="true" tabindex="-1" type="radio" value="dark" checked={darkOn} style="transform: translateX(-100%); position: absolute; pointer-events: none; opacity: 0; margin: 0px; width: 16px; height: 16px;" />
					<div class="items-center rounded-md border-2 border-muted bg-popover p-1 hover:bg-accent hover:text-accent-foreground">
					<div class="space-y-2 rounded-sm bg-slate-950 p-2">
					<div class="space-y-2 rounded-md bg-slate-800 p-2 shadow-xs">
					<div class="h-2 w-20 rounded-lg bg-slate-400"></div>
					<div class="h-2 w-25 rounded-lg bg-slate-400"></div>
					</div>
					<div class="flex items-center space-x-2 rounded-md bg-slate-800 p-2 shadow-xs">
					<div class="h-4 w-4 rounded-full bg-slate-400"></div>
					<div class="h-2 w-25 rounded-lg bg-slate-400"></div>
					</div>
					<div class="flex items-center space-x-2 rounded-md bg-slate-800 p-2 shadow-xs">
					<div class="h-4 w-4 rounded-full bg-slate-400"></div>
					<div class="h-2 w-25 rounded-lg bg-slate-400"></div>
					</div>
					</div>
					</div>
					<span class="block w-full p-2 text-center font-normal">Dark</span>
					</label>
					</div>

				</div>
			</div>
			<button data-slot="button" class="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive bg-primary text-primary-foreground shadow-xs hover:bg-primary/90 h-9 px-4 py-2 has-[>svg]:px-3" type="submit">Update preferences</button>
		</form>
		<Toaster toasts={toasts} extra={true} />
	</SettingsLayout>
}
