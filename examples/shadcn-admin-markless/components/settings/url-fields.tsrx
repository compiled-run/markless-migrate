// The profile form's URL field array (features/settings/profile/profile-form.tsx's useFieldArray). Markless 0.7 wakes
// every component of a page that holds a keyed @for when it loads (here the whole shell around the form), so the array
// is spelled out instead: as many fields as a visitor is likely to add, each one shown while the array reaches it.
import { computed } from '@markless/core';
import { revalidate } from '../../lib/settings/validate.ts';
import { shape, urlRowAt, withUrl } from '../../lib/settings/profile.ts';
import { focusSoon } from '../../lib/settings/focus.ts';
import { profileForm } from './profile-form.tsrx';

export function UrlFields() @{
	const f = profileForm();
	const row0 = computed(() => urlRowAt(f.values.urls, f.errors, 0));
	const shown0 = computed(() => f.values.urls.length > 0);
	const row1 = computed(() => urlRowAt(f.values.urls, f.errors, 1));
	const shown1 = computed(() => f.values.urls.length > 1);
	const row2 = computed(() => urlRowAt(f.values.urls, f.errors, 2));
	const shown2 = computed(() => f.values.urls.length > 2);
	const row3 = computed(() => urlRowAt(f.values.urls, f.errors, 3));
	const shown3 = computed(() => f.values.urls.length > 3);
	const row4 = computed(() => urlRowAt(f.values.urls, f.errors, 4));
	const shown4 = computed(() => f.values.urls.length > 4);
	const row5 = computed(() => urlRowAt(f.values.urls, f.errors, 5));
	const shown5 = computed(() => f.values.urls.length > 5);
	const row6 = computed(() => urlRowAt(f.values.urls, f.errors, 6));
	const shown6 = computed(() => f.values.urls.length > 6);
	const row7 = computed(() => urlRowAt(f.values.urls, f.errors, 7));
	const shown7 = computed(() => f.values.urls.length > 7);
	const row8 = computed(() => urlRowAt(f.values.urls, f.errors, 8));
	const shown8 = computed(() => f.values.urls.length > 8);
	const row9 = computed(() => urlRowAt(f.values.urls, f.errors, 9));
	const shown9 = computed(() => f.values.urls.length > 9);

	<div>
		@if (shown0) {
			<div data-slot="form-item" class="grid gap-2">
				<label data-slot="form-label" class={row0.labelClass} data-error={row0.invalid} for="_r_14_-form-item">URLs</label>
				<p data-slot="form-description" id="_r_14_-form-item-description" class={row0.descClass}>Add links to your website, blog, or social media profiles.</p>
				<input data-slot="form-control" class={row0.inputClass} id="_r_14_-form-item" aria-describedby={row0.describedBy} aria-invalid={row0.invalid} value={row0.value} name="urls.0.value" onInput={(event) => {
					const current = f.values;
					const next = { ...current, urls: withUrl(current.urls, 0, (event.target as HTMLInputElement).value) };
					f.values = next;
					const errors = f.errors;
					revalidate('profile', shape(next), errors, 'urls.0.value').then((found) => {
						f.errors = found;
					});
				}} />
				<p data-slot="form-message" id="_r_14_-form-item-message" class="text-sm text-destructive" hidden={row0.noError}>{row0.error}</p>
			</div>
		}
		@if (shown1) {
			<div data-slot="form-item" class="grid gap-2">
				<label data-slot="form-label" class={row1.labelClass} data-error={row1.invalid} for="_r_15_-form-item">URLs</label>
				<p data-slot="form-description" id="_r_15_-form-item-description" class={row1.descClass}>Add links to your website, blog, or social media profiles.</p>
				<input data-slot="form-control" class={row1.inputClass} id="_r_15_-form-item" aria-describedby={row1.describedBy} aria-invalid={row1.invalid} value={row1.value} name="urls.1.value" onInput={(event) => {
					const current = f.values;
					const next = { ...current, urls: withUrl(current.urls, 1, (event.target as HTMLInputElement).value) };
					f.values = next;
					const errors = f.errors;
					revalidate('profile', shape(next), errors, 'urls.1.value').then((found) => {
						f.errors = found;
					});
				}} />
				<p data-slot="form-message" id="_r_15_-form-item-message" class="text-sm text-destructive" hidden={row1.noError}>{row1.error}</p>
			</div>
		}
		@if (shown2) {
			<div data-slot="form-item" class="grid gap-2">
				<label data-slot="form-label" class={row2.labelClass} data-error={row2.invalid} for="profile-url-2-form-item">URLs</label>
				<p data-slot="form-description" id="profile-url-2-form-item-description" class={row2.descClass}>Add links to your website, blog, or social media profiles.</p>
				<input data-slot="form-control" class={row2.inputClass} id="profile-url-2-form-item" aria-describedby={row2.describedBy} aria-invalid={row2.invalid} value={row2.value} name="urls.2.value" onInput={(event) => {
					const current = f.values;
					const next = { ...current, urls: withUrl(current.urls, 2, (event.target as HTMLInputElement).value) };
					f.values = next;
					const errors = f.errors;
					revalidate('profile', shape(next), errors, 'urls.2.value').then((found) => {
						f.errors = found;
					});
				}} />
				<p data-slot="form-message" id="profile-url-2-form-item-message" class="text-sm text-destructive" hidden={row2.noError}>{row2.error}</p>
			</div>
		}
		@if (shown3) {
			<div data-slot="form-item" class="grid gap-2">
				<label data-slot="form-label" class={row3.labelClass} data-error={row3.invalid} for="profile-url-3-form-item">URLs</label>
				<p data-slot="form-description" id="profile-url-3-form-item-description" class={row3.descClass}>Add links to your website, blog, or social media profiles.</p>
				<input data-slot="form-control" class={row3.inputClass} id="profile-url-3-form-item" aria-describedby={row3.describedBy} aria-invalid={row3.invalid} value={row3.value} name="urls.3.value" onInput={(event) => {
					const current = f.values;
					const next = { ...current, urls: withUrl(current.urls, 3, (event.target as HTMLInputElement).value) };
					f.values = next;
					const errors = f.errors;
					revalidate('profile', shape(next), errors, 'urls.3.value').then((found) => {
						f.errors = found;
					});
				}} />
				<p data-slot="form-message" id="profile-url-3-form-item-message" class="text-sm text-destructive" hidden={row3.noError}>{row3.error}</p>
			</div>
		}
		@if (shown4) {
			<div data-slot="form-item" class="grid gap-2">
				<label data-slot="form-label" class={row4.labelClass} data-error={row4.invalid} for="profile-url-4-form-item">URLs</label>
				<p data-slot="form-description" id="profile-url-4-form-item-description" class={row4.descClass}>Add links to your website, blog, or social media profiles.</p>
				<input data-slot="form-control" class={row4.inputClass} id="profile-url-4-form-item" aria-describedby={row4.describedBy} aria-invalid={row4.invalid} value={row4.value} name="urls.4.value" onInput={(event) => {
					const current = f.values;
					const next = { ...current, urls: withUrl(current.urls, 4, (event.target as HTMLInputElement).value) };
					f.values = next;
					const errors = f.errors;
					revalidate('profile', shape(next), errors, 'urls.4.value').then((found) => {
						f.errors = found;
					});
				}} />
				<p data-slot="form-message" id="profile-url-4-form-item-message" class="text-sm text-destructive" hidden={row4.noError}>{row4.error}</p>
			</div>
		}
		@if (shown5) {
			<div data-slot="form-item" class="grid gap-2">
				<label data-slot="form-label" class={row5.labelClass} data-error={row5.invalid} for="profile-url-5-form-item">URLs</label>
				<p data-slot="form-description" id="profile-url-5-form-item-description" class={row5.descClass}>Add links to your website, blog, or social media profiles.</p>
				<input data-slot="form-control" class={row5.inputClass} id="profile-url-5-form-item" aria-describedby={row5.describedBy} aria-invalid={row5.invalid} value={row5.value} name="urls.5.value" onInput={(event) => {
					const current = f.values;
					const next = { ...current, urls: withUrl(current.urls, 5, (event.target as HTMLInputElement).value) };
					f.values = next;
					const errors = f.errors;
					revalidate('profile', shape(next), errors, 'urls.5.value').then((found) => {
						f.errors = found;
					});
				}} />
				<p data-slot="form-message" id="profile-url-5-form-item-message" class="text-sm text-destructive" hidden={row5.noError}>{row5.error}</p>
			</div>
		}
		@if (shown6) {
			<div data-slot="form-item" class="grid gap-2">
				<label data-slot="form-label" class={row6.labelClass} data-error={row6.invalid} for="profile-url-6-form-item">URLs</label>
				<p data-slot="form-description" id="profile-url-6-form-item-description" class={row6.descClass}>Add links to your website, blog, or social media profiles.</p>
				<input data-slot="form-control" class={row6.inputClass} id="profile-url-6-form-item" aria-describedby={row6.describedBy} aria-invalid={row6.invalid} value={row6.value} name="urls.6.value" onInput={(event) => {
					const current = f.values;
					const next = { ...current, urls: withUrl(current.urls, 6, (event.target as HTMLInputElement).value) };
					f.values = next;
					const errors = f.errors;
					revalidate('profile', shape(next), errors, 'urls.6.value').then((found) => {
						f.errors = found;
					});
				}} />
				<p data-slot="form-message" id="profile-url-6-form-item-message" class="text-sm text-destructive" hidden={row6.noError}>{row6.error}</p>
			</div>
		}
		@if (shown7) {
			<div data-slot="form-item" class="grid gap-2">
				<label data-slot="form-label" class={row7.labelClass} data-error={row7.invalid} for="profile-url-7-form-item">URLs</label>
				<p data-slot="form-description" id="profile-url-7-form-item-description" class={row7.descClass}>Add links to your website, blog, or social media profiles.</p>
				<input data-slot="form-control" class={row7.inputClass} id="profile-url-7-form-item" aria-describedby={row7.describedBy} aria-invalid={row7.invalid} value={row7.value} name="urls.7.value" onInput={(event) => {
					const current = f.values;
					const next = { ...current, urls: withUrl(current.urls, 7, (event.target as HTMLInputElement).value) };
					f.values = next;
					const errors = f.errors;
					revalidate('profile', shape(next), errors, 'urls.7.value').then((found) => {
						f.errors = found;
					});
				}} />
				<p data-slot="form-message" id="profile-url-7-form-item-message" class="text-sm text-destructive" hidden={row7.noError}>{row7.error}</p>
			</div>
		}
		@if (shown8) {
			<div data-slot="form-item" class="grid gap-2">
				<label data-slot="form-label" class={row8.labelClass} data-error={row8.invalid} for="profile-url-8-form-item">URLs</label>
				<p data-slot="form-description" id="profile-url-8-form-item-description" class={row8.descClass}>Add links to your website, blog, or social media profiles.</p>
				<input data-slot="form-control" class={row8.inputClass} id="profile-url-8-form-item" aria-describedby={row8.describedBy} aria-invalid={row8.invalid} value={row8.value} name="urls.8.value" onInput={(event) => {
					const current = f.values;
					const next = { ...current, urls: withUrl(current.urls, 8, (event.target as HTMLInputElement).value) };
					f.values = next;
					const errors = f.errors;
					revalidate('profile', shape(next), errors, 'urls.8.value').then((found) => {
						f.errors = found;
					});
				}} />
				<p data-slot="form-message" id="profile-url-8-form-item-message" class="text-sm text-destructive" hidden={row8.noError}>{row8.error}</p>
			</div>
		}
		@if (shown9) {
			<div data-slot="form-item" class="grid gap-2">
				<label data-slot="form-label" class={row9.labelClass} data-error={row9.invalid} for="profile-url-9-form-item">URLs</label>
				<p data-slot="form-description" id="profile-url-9-form-item-description" class={row9.descClass}>Add links to your website, blog, or social media profiles.</p>
				<input data-slot="form-control" class={row9.inputClass} id="profile-url-9-form-item" aria-describedby={row9.describedBy} aria-invalid={row9.invalid} value={row9.value} name="urls.9.value" onInput={(event) => {
					const current = f.values;
					const next = { ...current, urls: withUrl(current.urls, 9, (event.target as HTMLInputElement).value) };
					f.values = next;
					const errors = f.errors;
					revalidate('profile', shape(next), errors, 'urls.9.value').then((found) => {
						f.errors = found;
					});
				}} />
				<p data-slot="form-message" id="profile-url-9-form-item-message" class="text-sm text-destructive" hidden={row9.noError}>{row9.error}</p>
			</div>
		}
		<button data-slot="button" class="inline-flex items-center justify-center whitespace-nowrap text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50 h-8 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5 mt-2" type="button" onClick={() => {
			const current = f.values;
			const urls = [...current.urls, ''];
			f.values = { ...current, urls };
			focusSoon(`main form [name="urls.${urls.length - 1}.value"]`);
		}}>Add URL</button>
	</div>
}
