import { computed, state } from '@markless/core';
import { prepare, revalidate, submitForm } from '../../lib/settings/validate.ts';
import { SettingsLayout } from '../../components/settings/settings-layout.tsrx';
import { errorOf, firstInvalid, shape } from '../../lib/settings/profile.ts';
import { profileForm } from '../../components/settings/profile-form.tsrx';
import { UrlFields } from '../../components/settings/url-fields.tsrx';
import { DropdownMenuContent, menus, SelectItem } from '../../lib/parity/radix-ui-react-dropdown-menu/menu.tsrx';
import { closeMenu, openMenu, toggleMenu } from '../../lib/parity/radix-ui-react-dropdown-menu/behaviour.ts';
import { DURATION, expired, message, type Toast } from '../../lib/parity/sonner/index.ts';
import { Toaster } from '../../lib/parity/sonner/toaster.tsrx';

export default function SettingsProfile() @{
	const m = menus();
	const f = profileForm();
	let toasts = state<Toast[]>([]);
	const usernameError = computed(() => errorOf(f.errors, 'username'));
	const usernameInvalid = computed(() => (errorOf(f.errors, 'username') ? 'true' : 'false'));
	const usernameDescribed = computed(() => (errorOf(f.errors, 'username') ? '_r_10_-form-item-description _r_10_-form-item-message' : '_r_10_-form-item-description'));
	const emailError = computed(() => errorOf(f.errors, 'email'));
	const emailInvalid = computed(() => (errorOf(f.errors, 'email') ? 'true' : 'false'));
	const emailDescribed = computed(() => (errorOf(f.errors, 'email') ? '_r_11_-form-item-description _r_11_-form-item-message' : '_r_11_-form-item-description'));
	const bioError = computed(() => errorOf(f.errors, 'bio'));
	const bioInvalid = computed(() => (errorOf(f.errors, 'bio') ? 'true' : 'false'));
	const bioDescribed = computed(() => (errorOf(f.errors, 'bio') ? '_r_13_-form-item-description _r_13_-form-item-message' : '_r_13_-form-item-description'));
	const email0Selected = computed(() => (f.values.email === 'm@example.com' ? 'true' : 'false'));
	const email1Selected = computed(() => (f.values.email === 'm@google.com' ? 'true' : 'false'));
	const email2Selected = computed(() => (f.values.email === 'm@support.com' ? 'true' : 'false'));
	const emailLabel = computed(() => f.values.email ?? 'Select a verified email to display');
	const emailPlaceholder = computed(() => (f.values.email ? undefined : ''));
	const emailSelectValue = computed(() => f.values.email ?? '');
	const emailExpanded = computed(() => (m.open === 'profile-email' ? 'true' : 'false'));
	const emailState = computed(() => (m.open === 'profile-email' ? 'open' : 'closed'));

	<SettingsLayout active="/settings" title="Profile" desc="This is how others will see you on the site.">
		<form
			class="space-y-8"
			novalidate
			onFocusin={() => prepare('profile', shape(f.values))}
			onSubmit={async (event) => {
				event.preventDefault();
				const values = f.values;
				const { errors: found, json } = await submitForm('profile', shape(values));
				f.errors = found;
				if (Object.keys(found).length > 0) {
					const first = firstInvalid(found, values.urls.length);
					if (first) document.querySelector<HTMLElement>(`main form [name="${first}"]`)?.focus();
					return;
				}
				const id = `profile-${Date.now()}`;
				toasts = message(toasts, id, 'You submitted the following values:', json);
				setTimeout(() => {
					toasts = expired(toasts, id);
				}, DURATION);
			}}
		>
			<div data-slot="form-item" class="grid gap-2">
				<label data-slot="form-label" class="flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50 data-[error=true]:text-destructive" data-error={usernameInvalid} for="_r_10_-form-item">Username</label>
				<input data-slot="form-control" class="flex h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none selection:bg-primary selection:text-primary-foreground file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-input/30 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40" placeholder="shadcn" name="username" id="_r_10_-form-item" aria-describedby={usernameDescribed} aria-invalid={usernameInvalid} onInput={(event) => {
					const next = { ...f.values, username: (event.target as HTMLInputElement).value };
					f.values = next;
					const errors = f.errors;
					revalidate('profile', shape(next), errors, 'username').then((found) => {
						f.errors = found;
					});
				}} />
				<p data-slot="form-description" id="_r_10_-form-item-description" class="text-sm text-muted-foreground">This is your public display name. It can be your real name or a pseudonym. You can only change this once every 30 days.</p>
				@if (usernameError) {
					<p data-slot="form-message" id="_r_10_-form-item-message" class="text-sm text-destructive">{usernameError}</p>
				}
			</div>
			<div data-slot="form-item" class="grid gap-2">
				<label data-slot="form-label" class="flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50 data-[error=true]:text-destructive" data-error={emailInvalid} for="_r_11_-form-item">Email</label>
				<button
					el={m.triggers}
					type="button"
					role="combobox"
					aria-controls="radix-menu-profile-email-content"
					aria-expanded={emailExpanded}
					aria-autocomplete="none"
					dir="ltr"
					data-state={emailState}
					data-placeholder={emailPlaceholder}
					data-slot="form-control"
					data-size="default"
					data-menu="profile-email"
					class="flex w-fit items-center justify-between gap-2 rounded-md border border-input bg-transparent px-3 py-2 text-sm whitespace-nowrap shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 data-placeholder:text-muted-foreground data-[size=default]:h-9 data-[size=sm]:h-8 *:data-[slot=select-value]:line-clamp-1 *:data-[slot=select-value]:flex *:data-[slot=select-value]:items-center *:data-[slot=select-value]:gap-2 dark:bg-input/30 dark:hover:bg-input/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground"
					id="_r_11_-form-item"
					aria-describedby={emailDescribed}
					aria-invalid={emailInvalid}
					onPointerdown={(event) => {
						if (event.button === 0) {
							event.preventDefault();
							m.open = m.open === 'profile-email' ? '' : 'profile-email';
							m.at = '';
							toggleMenu(m.contents, m.triggers, 'profile-email', m.open === '', event.target, (refocus) => {
								m.open = '';
								closeMenu(m.contents, m.triggers, 'profile-email', refocus);
							});
							if (m.open === 'profile-email' && !f.values.email) document.querySelector<HTMLElement>('#radix-menu-profile-email-content [role=option]')?.focus();
						}
					}}
					onKeydown={(event) => {
						if (event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowDown' || event.key === 'ArrowUp') {
							event.preventDefault();
							m.open = 'profile-email';
							m.at = '';
							openMenu(m.contents, m.triggers, 'profile-email', 'first', (refocus) => {
								m.open = '';
								closeMenu(m.contents, m.triggers, 'profile-email', refocus);
							}, event.target);
							if (!f.values.email) document.querySelector<HTMLElement>('#radix-menu-profile-email-content [role=option]')?.focus();
						}
					}}
				>
					<span data-slot="select-value" style="pointer-events: none;">{emailLabel}</span>
					<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-chevron-down size-4 opacity-50" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
				</button>
				<select aria-hidden="true" tabindex="-1" value={emailSelectValue} style="position: absolute; border: 0px; width: 1px; height: 1px; padding: 0px; margin: -1px; overflow: hidden; clip: rect(0px, 0px, 0px, 0px); white-space: nowrap; overflow-wrap: normal;">
					<option value=""></option>
					<option value="m@example.com">{'m@example.com'}</option>
					<option value="m@google.com">{'m@google.com'}</option>
					<option value="m@support.com">{'m@support.com'}</option>
				</select>
				<p data-slot="form-description" id="_r_11_-form-item-description" class="text-sm text-muted-foreground">You can manage verified email addresses in your <a href="/">email settings</a>.</p>
				@if (emailError) {
					<p data-slot="form-message" id="_r_11_-form-item-message" class="text-sm text-destructive">{emailError}</p>
				}
			</div>
			<div data-slot="form-item" class="grid gap-2">
				<label data-slot="form-label" class="flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50 data-[error=true]:text-destructive" data-error={bioInvalid} for="_r_13_-form-item">Bio</label>
				<textarea data-slot="form-control" class="flex field-sizing-content min-h-16 w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-xs transition-[color,box-shadow] outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:aria-invalid:ring-destructive/40 resize-none" placeholder="Tell us a little bit about yourself" name="bio" id="_r_13_-form-item" aria-describedby={bioDescribed} aria-invalid={bioInvalid} onInput={(event) => {
					const next = { ...f.values, bio: (event.target as HTMLTextAreaElement).value };
					f.values = next;
					const errors = f.errors;
					revalidate('profile', shape(next), errors, 'bio').then((found) => {
						f.errors = found;
					});
				}}>I own a computer.</textarea>
				<p data-slot="form-description" id="_r_13_-form-item-description" class="text-sm text-muted-foreground">You can <span>{'@mention'}</span> other users and organizations to link to them.</p>
				@if (bioError) {
					<p data-slot="form-message" id="_r_13_-form-item-message" class="text-sm text-destructive">{bioError}</p>
				}
			</div>
			<UrlFields />
			<button data-slot="button" class="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive bg-primary text-primary-foreground shadow-xs hover:bg-primary/90 h-9 px-4 py-2 has-[>svg]:px-3" type="submit">Update profile</button>
		</form>
		<DropdownMenuContent menu="profile-email" role="listbox" slot="select-content" side="bottom" align="start" sideOffset={0} class="relative z-50 max-h-(--radix-select-content-available-height) min-w-32 origin-(--radix-select-content-transform-origin) overflow-x-hidden overflow-y-auto rounded-md border bg-popover text-popover-foreground shadow-md data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1">
			<div data-radix-select-viewport="" role="presentation" class="p-1 h-(--radix-select-trigger-height) w-full min-w-(--radix-select-trigger-width) scroll-my-1" style="position: relative; flex: 1 1 0%; overflow: hidden auto;">
				<SelectItem menu="profile-email" selected={email0Selected} onSelect={() => {
					const next = { ...f.values, email: 'm@example.com' };
					f.values = next;
					const errors = f.errors;
					revalidate('profile', shape(next), errors, 'email').then((found) => {
						f.errors = found;
					});
				}}>{'m@example.com'}</SelectItem>
				<SelectItem menu="profile-email" selected={email1Selected} onSelect={() => {
					const next = { ...f.values, email: 'm@google.com' };
					f.values = next;
					const errors = f.errors;
					revalidate('profile', shape(next), errors, 'email').then((found) => {
						f.errors = found;
					});
				}}>{'m@google.com'}</SelectItem>
				<SelectItem menu="profile-email" selected={email2Selected} onSelect={() => {
					const next = { ...f.values, email: 'm@support.com' };
					f.values = next;
					const errors = f.errors;
					revalidate('profile', shape(next), errors, 'email').then((found) => {
						f.errors = found;
					});
				}}>{'m@support.com'}</SelectItem>
			</div>
		</DropdownMenuContent>
		<Toaster toasts={toasts} extra={true} />
	</SettingsLayout>
}
