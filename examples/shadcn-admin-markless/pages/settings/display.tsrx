import { computed, state } from '@markless/core';
import type { PageProps } from '@markless/router';
import { revalidate, submitForm } from '../../lib/settings/validate.ts';
import { SettingsLayout } from '../../components/settings/settings-layout.tsrx';
import { layoutPrefs } from '../../components/layout/prefs.ts';
import { toggled } from '../../lib/settings/data.ts';
import { DURATION, expired, message, type Toast } from '../../lib/parity/sonner/index.ts';
import { Toaster } from '../../lib/parity/sonner/toaster.tsrx';

const LABEL = 'flex items-center gap-2 text-sm leading-none select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50 data-[error=true]:text-destructive font-normal';
const CHECKBOX = 'peer size-4 shrink-0 rounded-lg border border-input shadow-xs transition-shadow outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground dark:bg-input/30 dark:aria-invalid:ring-destructive/40 dark:data-[state=checked]:bg-primary';

export default function SettingsDisplay({ http }: PageProps) @{
	const prefs = layoutPrefs(http.request.headers.get('cookie'));
	let items = state<string[]>(['recents', 'home']);
	let errors = state<Record<string, string>>({});
	let submittedOnce = state(false);
	let toasts = state<Toast[]>([]);
	const on0 = computed(() => items.includes('recents'));
	const checked0 = computed(() => (items.includes('recents') ? 'true' : 'false'));
	const state0 = computed(() => (items.includes('recents') ? 'checked' : 'unchecked'));
	const described0 = computed(() => (errors.items ? 'display-recents-form-item-description display-recents-form-item-message' : 'display-recents-form-item-description'));
	const on1 = computed(() => items.includes('home'));
	const checked1 = computed(() => (items.includes('home') ? 'true' : 'false'));
	const state1 = computed(() => (items.includes('home') ? 'checked' : 'unchecked'));
	const described1 = computed(() => (errors.items ? 'display-home-form-item-description display-home-form-item-message' : 'display-home-form-item-description'));
	const on2 = computed(() => items.includes('applications'));
	const checked2 = computed(() => (items.includes('applications') ? 'true' : 'false'));
	const state2 = computed(() => (items.includes('applications') ? 'checked' : 'unchecked'));
	const described2 = computed(() => (errors.items ? 'display-applications-form-item-description display-applications-form-item-message' : 'display-applications-form-item-description'));
	const on3 = computed(() => items.includes('desktop'));
	const checked3 = computed(() => (items.includes('desktop') ? 'true' : 'false'));
	const state3 = computed(() => (items.includes('desktop') ? 'checked' : 'unchecked'));
	const described3 = computed(() => (errors.items ? 'display-desktop-form-item-description display-desktop-form-item-message' : 'display-desktop-form-item-description'));
	const on4 = computed(() => items.includes('downloads'));
	const checked4 = computed(() => (items.includes('downloads') ? 'true' : 'false'));
	const state4 = computed(() => (items.includes('downloads') ? 'checked' : 'unchecked'));
	const described4 = computed(() => (errors.items ? 'display-downloads-form-item-description display-downloads-form-item-message' : 'display-downloads-form-item-description'));
	const on5 = computed(() => items.includes('documents'));
	const checked5 = computed(() => (items.includes('documents') ? 'true' : 'false'));
	const state5 = computed(() => (items.includes('documents') ? 'checked' : 'unchecked'));
	const described5 = computed(() => (errors.items ? 'display-documents-form-item-description display-documents-form-item-message' : 'display-documents-form-item-description'));
	const itemsError = computed(() => errors.items ?? '');
	const invalid = computed(() => (errors.items ? 'true' : 'false'));

	<SettingsLayout active="/settings/display" prefs={prefs} title="Display" desc="Turn items on or off to control what's displayed in the app.">
		<form
			class="space-y-8"
			novalidate
			onSubmit={async (event) => {
				event.preventDefault();
				submittedOnce = true;
				const { errors: found, json } = await submitForm('display', { items });
				errors = found;
				if (Object.keys(found).length > 0) return;
				const id = `display-${Date.now()}`;
				toasts = message(toasts, id, 'You submitted the following values:', json);
				setTimeout(() => {
					toasts = expired(toasts, id);
				}, DURATION);
			}}
		>
			<div data-slot="form-item" class="grid gap-2">
				<div class="mb-4">
					<label data-slot="form-label" class="flex items-center gap-2 font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50 data-[error=true]:text-destructive text-base" data-error={invalid} for="display-items-form-item">Sidebar</label>
					<p data-slot="form-description" id="display-items-form-item-description" class="text-sm text-muted-foreground">Select the items you want to display in the sidebar.</p>
				</div>
				<div data-slot="form-item" class="gap-2 flex flex-row items-start">
						<button
							type="button"
							role="checkbox"
							aria-checked={checked0}
							data-state={state0}
							value="on"
							data-slot="form-control"
							class={CHECKBOX}
							id="display-recents-form-item"
							aria-describedby={described0}
							aria-invalid={invalid}
							onClick={() => {
								items = toggled(items, 'recents');
								if (submittedOnce) revalidate('display', { items }, errors, 'items').then((next) => {
									errors = next;
								});
							}}
						>
							@if (on0) {
								<span data-state="checked" data-slot="checkbox-indicator" class="flex items-center justify-center text-current transition-none" style="pointer-events: none;"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-check size-3.5" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg></span>
							}
						</button>
						<input aria-hidden="true" tabindex="-1" type="checkbox" value="on" checked={on0} style="position: absolute; pointer-events: none; opacity: 0; margin: 0px; transform: translateX(-100%); width: 16px; height: 16px;" />
						<label data-slot="form-label" class={LABEL} data-error={invalid} for="display-recents-form-item">Recents</label>
					</div>
				<div data-slot="form-item" class="gap-2 flex flex-row items-start">
						<button
							type="button"
							role="checkbox"
							aria-checked={checked1}
							data-state={state1}
							value="on"
							data-slot="form-control"
							class={CHECKBOX}
							id="display-home-form-item"
							aria-describedby={described1}
							aria-invalid={invalid}
							onClick={() => {
								items = toggled(items, 'home');
								if (submittedOnce) revalidate('display', { items }, errors, 'items').then((next) => {
									errors = next;
								});
							}}
						>
							@if (on1) {
								<span data-state="checked" data-slot="checkbox-indicator" class="flex items-center justify-center text-current transition-none" style="pointer-events: none;"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-check size-3.5" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg></span>
							}
						</button>
						<input aria-hidden="true" tabindex="-1" type="checkbox" value="on" checked={on1} style="position: absolute; pointer-events: none; opacity: 0; margin: 0px; transform: translateX(-100%); width: 16px; height: 16px;" />
						<label data-slot="form-label" class={LABEL} data-error={invalid} for="display-home-form-item">Home</label>
					</div>
				<div data-slot="form-item" class="gap-2 flex flex-row items-start">
						<button
							type="button"
							role="checkbox"
							aria-checked={checked2}
							data-state={state2}
							value="on"
							data-slot="form-control"
							class={CHECKBOX}
							id="display-applications-form-item"
							aria-describedby={described2}
							aria-invalid={invalid}
							onClick={() => {
								items = toggled(items, 'applications');
								if (submittedOnce) revalidate('display', { items }, errors, 'items').then((next) => {
									errors = next;
								});
							}}
						>
							@if (on2) {
								<span data-state="checked" data-slot="checkbox-indicator" class="flex items-center justify-center text-current transition-none" style="pointer-events: none;"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-check size-3.5" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg></span>
							}
						</button>
						<input aria-hidden="true" tabindex="-1" type="checkbox" value="on" checked={on2} style="position: absolute; pointer-events: none; opacity: 0; margin: 0px; transform: translateX(-100%); width: 16px; height: 16px;" />
						<label data-slot="form-label" class={LABEL} data-error={invalid} for="display-applications-form-item">Applications</label>
					</div>
				<div data-slot="form-item" class="gap-2 flex flex-row items-start">
						<button
							type="button"
							role="checkbox"
							aria-checked={checked3}
							data-state={state3}
							value="on"
							data-slot="form-control"
							class={CHECKBOX}
							id="display-desktop-form-item"
							aria-describedby={described3}
							aria-invalid={invalid}
							onClick={() => {
								items = toggled(items, 'desktop');
								if (submittedOnce) revalidate('display', { items }, errors, 'items').then((next) => {
									errors = next;
								});
							}}
						>
							@if (on3) {
								<span data-state="checked" data-slot="checkbox-indicator" class="flex items-center justify-center text-current transition-none" style="pointer-events: none;"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-check size-3.5" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg></span>
							}
						</button>
						<input aria-hidden="true" tabindex="-1" type="checkbox" value="on" checked={on3} style="position: absolute; pointer-events: none; opacity: 0; margin: 0px; transform: translateX(-100%); width: 16px; height: 16px;" />
						<label data-slot="form-label" class={LABEL} data-error={invalid} for="display-desktop-form-item">Desktop</label>
					</div>
				<div data-slot="form-item" class="gap-2 flex flex-row items-start">
						<button
							type="button"
							role="checkbox"
							aria-checked={checked4}
							data-state={state4}
							value="on"
							data-slot="form-control"
							class={CHECKBOX}
							id="display-downloads-form-item"
							aria-describedby={described4}
							aria-invalid={invalid}
							onClick={() => {
								items = toggled(items, 'downloads');
								if (submittedOnce) revalidate('display', { items }, errors, 'items').then((next) => {
									errors = next;
								});
							}}
						>
							@if (on4) {
								<span data-state="checked" data-slot="checkbox-indicator" class="flex items-center justify-center text-current transition-none" style="pointer-events: none;"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-check size-3.5" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg></span>
							}
						</button>
						<input aria-hidden="true" tabindex="-1" type="checkbox" value="on" checked={on4} style="position: absolute; pointer-events: none; opacity: 0; margin: 0px; transform: translateX(-100%); width: 16px; height: 16px;" />
						<label data-slot="form-label" class={LABEL} data-error={invalid} for="display-downloads-form-item">Downloads</label>
					</div>
				<div data-slot="form-item" class="gap-2 flex flex-row items-start">
						<button
							type="button"
							role="checkbox"
							aria-checked={checked5}
							data-state={state5}
							value="on"
							data-slot="form-control"
							class={CHECKBOX}
							id="display-documents-form-item"
							aria-describedby={described5}
							aria-invalid={invalid}
							onClick={() => {
								items = toggled(items, 'documents');
								if (submittedOnce) revalidate('display', { items }, errors, 'items').then((next) => {
									errors = next;
								});
							}}
						>
							@if (on5) {
								<span data-state="checked" data-slot="checkbox-indicator" class="flex items-center justify-center text-current transition-none" style="pointer-events: none;"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-check size-3.5" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg></span>
							}
						</button>
						<input aria-hidden="true" tabindex="-1" type="checkbox" value="on" checked={on5} style="position: absolute; pointer-events: none; opacity: 0; margin: 0px; transform: translateX(-100%); width: 16px; height: 16px;" />
						<label data-slot="form-label" class={LABEL} data-error={invalid} for="display-documents-form-item">Documents</label>
					</div>
				@if (itemsError) {
					<p data-slot="form-message" id="display-items-form-item-message" class="text-sm text-destructive">{itemsError}</p>
				}
			</div>
			<button data-slot="button" class="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive bg-primary text-primary-foreground shadow-xs hover:bg-primary/90 h-9 px-4 py-2 has-[>svg]:px-3" type="submit">Update display</button>
		</form>
		<Toaster toasts={toasts} extra={true} />
	</SettingsLayout>
}
