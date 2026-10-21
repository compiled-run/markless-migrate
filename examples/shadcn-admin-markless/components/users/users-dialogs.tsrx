// The users page's add/edit and invite dialogs (features/users/components/users-action-dialog.tsx, users-invite-dialog.tsx).
// Written by deploy/shadcn-admin/scripts/gen-users-dialogs.py from the old app's rendered DOM; the page opens them.
import { computed, shared, state } from '@markless/core';
import { DialogClose, DialogContent, DialogDescription, DialogOverlay, DialogPortal, DialogRoot, DialogTitle } from '../../lib/ports/radix-ui-react-dialog/dialog.tsrx';
import { closeMenu, openMenu, toggleMenu } from '../../lib/parity/radix-ui-react-dropdown-menu/behaviour.ts';
import { DropdownMenuContent, menus, SelectItem } from '../../lib/parity/radix-ui-react-dropdown-menu/menu.tsrx';
import { DURATION, expired, message, type Toast } from '../../lib/parity/sonner/index.ts';
import { errorOf, focusFirstError, focusOption, inviteFieldErrors, inviteForm, inviteFormErrors, roleLabel, submittedInvite, submittedUser, userFieldErrors, userForm, userFormErrors } from '../../lib/users-behaviour.ts';

const USER_FOCUS_ORDER = ['firstName', 'lastName', 'username', 'email', 'phoneNumber', 'password', 'confirmPassword'];
const INVITE_FOCUS_ORDER = ['email', 'desc'];

export const usersDialogs = shared(
	() => {
		const cells = state({ open: '', form: userForm(), submitted: false, errors: '{}', showPassword: false, showConfirm: false, invite: inviteForm(), inviteSubmitted: false, inviteErrors: '{}', toasts: [] as Toast[] });
		return { ...cells };
	},
	{ scope: 'page' },
);

export function UsersActionDialog() @{
	const d = usersDialogs();
	const m = menus();
	const userTitle = computed(() => (d.form.isEdit ? 'Edit User' : 'Add New User'));
	const userLead = computed(() => (d.form.isEdit ? 'Update the user here. ' : 'Create new user here. '));
	const userConfirmDisabled = computed(() => d.form.password === '');
	const userPasswordType = computed(() => (d.showPassword ? 'text' : 'password'));
	const userPasswordToggle = computed(() => (d.showPassword ? 'Hide password' : 'Show password'));
	const userConfirmPasswordType = computed(() => (d.showConfirm ? 'text' : 'password'));
	const userConfirmPasswordToggle = computed(() => (d.showConfirm ? 'Hide password' : 'Show password'));
	const userFirstNameError = computed(() => errorOf(d.errors, 'firstName'));
	const userFirstNameInvalid = computed(() => (errorOf(d.errors, 'firstName') ? 'true' : 'false'));
	const userFirstNameDescribedBy = computed(() => (errorOf(d.errors, 'firstName') ? 'user-form-firstName-description user-form-firstName-message' : 'user-form-firstName-description'));
	const userLastNameError = computed(() => errorOf(d.errors, 'lastName'));
	const userLastNameInvalid = computed(() => (errorOf(d.errors, 'lastName') ? 'true' : 'false'));
	const userLastNameDescribedBy = computed(() => (errorOf(d.errors, 'lastName') ? 'user-form-lastName-description user-form-lastName-message' : 'user-form-lastName-description'));
	const userUsernameError = computed(() => errorOf(d.errors, 'username'));
	const userUsernameInvalid = computed(() => (errorOf(d.errors, 'username') ? 'true' : 'false'));
	const userUsernameDescribedBy = computed(() => (errorOf(d.errors, 'username') ? 'user-form-username-description user-form-username-message' : 'user-form-username-description'));
	const userEmailError = computed(() => errorOf(d.errors, 'email'));
	const userEmailInvalid = computed(() => (errorOf(d.errors, 'email') ? 'true' : 'false'));
	const userEmailDescribedBy = computed(() => (errorOf(d.errors, 'email') ? 'user-form-email-description user-form-email-message' : 'user-form-email-description'));
	const userPhoneNumberError = computed(() => errorOf(d.errors, 'phoneNumber'));
	const userPhoneNumberInvalid = computed(() => (errorOf(d.errors, 'phoneNumber') ? 'true' : 'false'));
	const userPhoneNumberDescribedBy = computed(() => (errorOf(d.errors, 'phoneNumber') ? 'user-form-phoneNumber-description user-form-phoneNumber-message' : 'user-form-phoneNumber-description'));
	const userRoleError = computed(() => errorOf(d.errors, 'role'));
	const userRoleInvalid = computed(() => (errorOf(d.errors, 'role') ? 'true' : 'false'));
	const userRoleDescribedBy = computed(() => (errorOf(d.errors, 'role') ? 'user-form-role-description user-form-role-message' : 'user-form-role-description'));
	const userPasswordError = computed(() => errorOf(d.errors, 'password'));
	const userPasswordInvalid = computed(() => (errorOf(d.errors, 'password') ? 'true' : 'false'));
	const userPasswordDescribedBy = computed(() => (errorOf(d.errors, 'password') ? 'user-form-password-description user-form-password-message' : 'user-form-password-description'));
	const userConfirmPasswordError = computed(() => errorOf(d.errors, 'confirmPassword'));
	const userConfirmPasswordInvalid = computed(() => (errorOf(d.errors, 'confirmPassword') ? 'true' : 'false'));
	const userConfirmPasswordDescribedBy = computed(() => (errorOf(d.errors, 'confirmPassword') ? 'user-form-confirmPassword-description user-form-confirmPassword-message' : 'user-form-confirmPassword-description'));
	const userRoleLabel = computed(() => (d.form.role === '' ? 'Select a role' : roleLabel(d.form.role)));
	const userRolePlaceholder = computed(() => (d.form.role === '' ? '' : undefined));
	const userRoleExpanded = computed(() => (m.open === 'user-role' ? 'true' : 'false'));
	const userRoleMenuState = computed(() => (m.open === 'user-role' ? 'open' : 'closed'));
	const userRoleIsSuperadmin = computed(() => (d.form.role === 'superadmin' ? 'true' : 'false'));
	const userRoleIsAdmin = computed(() => (d.form.role === 'admin' ? 'true' : 'false'));
	const userRoleIsManager = computed(() => (d.form.role === 'manager' ? 'true' : 'false'));
	const userRoleIsCashier = computed(() => (d.form.role === 'cashier' ? 'true' : 'false'));

	<div class="contents">
		<DialogRoot open={d.open === 'add' || d.open === 'edit'} onOpenChange={(next: boolean) => { if (!next) d.open = ''; }}>
			<DialogPortal>
				<DialogOverlay data-slot="dialog-overlay" class="fixed inset-0 z-50 bg-black/50 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0"></DialogOverlay>
				<DialogContent data-slot="dialog-content" class="fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border bg-background p-6 shadow-lg duration-200 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 sm:max-w-lg">
					<div data-slot="dialog-header" class="flex flex-col gap-2 sm:text-start text-start">
						<DialogTitle data-slot="dialog-title" class="text-lg leading-none font-semibold">{userTitle}</DialogTitle>
						<DialogDescription data-slot="dialog-description" class="text-sm text-muted-foreground">{userLead}Click save when you're done.</DialogDescription>
					</div>
					<div class="h-105 w-[calc(100%+0.75rem)] overflow-y-auto py-1 pe-3">
						<form id="user-form" class="space-y-4 px-0.5" onSubmit={(event) => {
							event.preventDefault();
							const values = d.form;
							const errors = userFormErrors(values);
							d.submitted = true;
							d.errors = errors;
							if (errors !== '{}') {
								focusFirstError('user-form', errors, USER_FOCUS_ORDER);
								return;
							}
							const id = `user-${Date.now()}`;
							d.toasts = message(d.toasts, id, 'You submitted the following values:', submittedUser(values));
							d.open = '';
							setTimeout(() => {
								d.toasts = expired(d.toasts, id);
							}, DURATION);
						}}>
						<div data-slot="form-item" class="gap-2 grid grid-cols-6 items-center space-y-0 gap-x-4 gap-y-1">
							<label data-slot="form-label" class="flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50 data-[error=true]:text-destructive col-span-2 text-end" data-error={userFirstNameInvalid} for="user-form-firstName">First Name</label>
							<input data-slot="form-control" class="flex h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none selection:bg-primary selection:text-primary-foreground file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-input/30 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 col-span-4" placeholder="John" autocomplete="off" id="user-form-firstName" aria-describedby={userFirstNameDescribedBy} aria-invalid={userFirstNameInvalid} value={d.form.firstName} name="firstName" onInput={(event) => { const next = { ...d.form, firstName: (event.target as HTMLInputElement).value }; d.form = next; if (d.submitted) d.errors = userFieldErrors(d.errors, next, 'firstName'); }} />
							@if (userFirstNameError) {
								<p data-slot="form-message" id="user-form-firstName-message" class="text-sm text-destructive col-span-4 col-start-3">{userFirstNameError}</p>
							}
						</div>
						<div data-slot="form-item" class="gap-2 grid grid-cols-6 items-center space-y-0 gap-x-4 gap-y-1">
							<label data-slot="form-label" class="flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50 data-[error=true]:text-destructive col-span-2 text-end" data-error={userLastNameInvalid} for="user-form-lastName">Last Name</label>
							<input data-slot="form-control" class="flex h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none selection:bg-primary selection:text-primary-foreground file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-input/30 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 col-span-4" placeholder="Doe" autocomplete="off" id="user-form-lastName" aria-describedby={userLastNameDescribedBy} aria-invalid={userLastNameInvalid} value={d.form.lastName} name="lastName" onInput={(event) => { const next = { ...d.form, lastName: (event.target as HTMLInputElement).value }; d.form = next; if (d.submitted) d.errors = userFieldErrors(d.errors, next, 'lastName'); }} />
							@if (userLastNameError) {
								<p data-slot="form-message" id="user-form-lastName-message" class="text-sm text-destructive col-span-4 col-start-3">{userLastNameError}</p>
							}
						</div>
						<div data-slot="form-item" class="gap-2 grid grid-cols-6 items-center space-y-0 gap-x-4 gap-y-1">
							<label data-slot="form-label" class="flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50 data-[error=true]:text-destructive col-span-2 text-end" data-error={userUsernameInvalid} for="user-form-username">Username</label>
							<input data-slot="form-control" class="flex h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none selection:bg-primary selection:text-primary-foreground file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-input/30 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 col-span-4" placeholder="john_doe" id="user-form-username" aria-describedby={userUsernameDescribedBy} aria-invalid={userUsernameInvalid} value={d.form.username} name="username" onInput={(event) => { const next = { ...d.form, username: (event.target as HTMLInputElement).value }; d.form = next; if (d.submitted) d.errors = userFieldErrors(d.errors, next, 'username'); }} />
							@if (userUsernameError) {
								<p data-slot="form-message" id="user-form-username-message" class="text-sm text-destructive col-span-4 col-start-3">{userUsernameError}</p>
							}
						</div>
						<div data-slot="form-item" class="gap-2 grid grid-cols-6 items-center space-y-0 gap-x-4 gap-y-1">
							<label data-slot="form-label" class="flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50 data-[error=true]:text-destructive col-span-2 text-end" data-error={userEmailInvalid} for="user-form-email">Email</label>
							<input data-slot="form-control" class="flex h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none selection:bg-primary selection:text-primary-foreground file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-input/30 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 col-span-4" placeholder="john.doe@gmail.com" id="user-form-email" aria-describedby={userEmailDescribedBy} aria-invalid={userEmailInvalid} value={d.form.email} name="email" onInput={(event) => { const next = { ...d.form, email: (event.target as HTMLInputElement).value }; d.form = next; if (d.submitted) d.errors = userFieldErrors(d.errors, next, 'email'); }} />
							@if (userEmailError) {
								<p data-slot="form-message" id="user-form-email-message" class="text-sm text-destructive col-span-4 col-start-3">{userEmailError}</p>
							}
						</div>
						<div data-slot="form-item" class="gap-2 grid grid-cols-6 items-center space-y-0 gap-x-4 gap-y-1">
							<label data-slot="form-label" class="flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50 data-[error=true]:text-destructive col-span-2 text-end" data-error={userPhoneNumberInvalid} for="user-form-phoneNumber">Phone Number</label>
							<input data-slot="form-control" class="flex h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none selection:bg-primary selection:text-primary-foreground file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-input/30 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 col-span-4" placeholder="+123456789" id="user-form-phoneNumber" aria-describedby={userPhoneNumberDescribedBy} aria-invalid={userPhoneNumberInvalid} value={d.form.phoneNumber} name="phoneNumber" onInput={(event) => { const next = { ...d.form, phoneNumber: (event.target as HTMLInputElement).value }; d.form = next; if (d.submitted) d.errors = userFieldErrors(d.errors, next, 'phoneNumber'); }} />
							@if (userPhoneNumberError) {
								<p data-slot="form-message" id="user-form-phoneNumber-message" class="text-sm text-destructive col-span-4 col-start-3">{userPhoneNumberError}</p>
							}
						</div>
						<div data-slot="form-item" class="gap-2 grid grid-cols-6 items-center space-y-0 gap-x-4 gap-y-1">
							<label data-slot="form-label" class="flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50 data-[error=true]:text-destructive col-span-2 text-end" data-error={userRoleInvalid} for="radix-menu-user-role-trigger">Role</label>
							<button el={m.triggers} data-menu="user-role" type="button" role="combobox" aria-controls="radix-menu-user-role-content" aria-expanded={userRoleExpanded} aria-autocomplete="none" dir="ltr" data-state={userRoleMenuState} data-placeholder={userRolePlaceholder} data-slot="form-control" data-size="default" class="flex w-fit items-center justify-between gap-2 rounded-md border border-input bg-transparent px-3 py-2 text-sm whitespace-nowrap shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 data-placeholder:text-muted-foreground data-[size=default]:h-9 data-[size=sm]:h-8 *:data-[slot=select-value]:line-clamp-1 *:data-[slot=select-value]:flex *:data-[slot=select-value]:items-center *:data-[slot=select-value]:gap-2 dark:bg-input/30 dark:hover:bg-input/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground col-span-4" id="radix-menu-user-role-trigger" aria-describedby={userRoleDescribedBy} aria-invalid={userRoleInvalid}
								onPointerdown={(event) => {
									if (event.button === 0) {
										event.preventDefault();
										m.open = m.open === 'user-role' ? '' : 'user-role';
										m.at = '';
										toggleMenu(m.contents, m.triggers, 'user-role', m.open === '', event.target, (refocus) => { m.open = ''; closeMenu(m.contents, m.triggers, 'user-role', refocus); });
										focusOption('user-role');
									}
								}}
								onKeydown={(event) => {
									if (event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowDown') {
										event.preventDefault();
										m.open = 'user-role';
										m.at = '';
										openMenu(m.contents, m.triggers, 'user-role', 'first', (refocus) => { m.open = ''; closeMenu(m.contents, m.triggers, 'user-role', refocus); }, event.target);
										focusOption('user-role');
									}
								}}
							>
								<span data-slot="select-value" style="pointer-events: none;">{userRoleLabel}</span>
								<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-chevron-down size-4 opacity-50" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
							</button>
							<select aria-hidden="true" tabindex="-1" style="position: absolute; border: 0px; width: 1px; height: 1px; padding: 0px; margin: -1px; overflow: hidden; clip: rect(0px, 0px, 0px, 0px); white-space: nowrap; overflow-wrap: normal;">
								<option value="superadmin">Superadmin</option>
								<option value="admin">Admin</option>
								<option value="manager">Manager</option>
								<option value="cashier">Cashier</option>
							</select>
							@if (userRoleError) {
								<p data-slot="form-message" id="user-form-role-message" class="text-sm text-destructive col-span-4 col-start-3">{userRoleError}</p>
							}
						</div>
						<div data-slot="form-item" class="gap-2 grid grid-cols-6 items-center space-y-0 gap-x-4 gap-y-1">
							<label data-slot="form-label" class="flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50 data-[error=true]:text-destructive col-span-2 text-end" data-error={userPasswordInvalid} for="user-form-password">Password</label>
							<div class="relative rounded-md col-span-4">
								<input class="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-hidden disabled:cursor-not-allowed disabled:opacity-50" placeholder="e.g., S3cur3P@ssw0rd" data-slot="form-control" id="user-form-password" aria-describedby={userPasswordDescribedBy} aria-invalid={userPasswordInvalid} type={userPasswordType} value={d.form.password} name="password" onInput={(event) => { const next = { ...d.form, password: (event.target as HTMLInputElement).value }; d.form = next; if (d.submitted) d.errors = userFieldErrors(d.errors, next, 'password'); }} />
								<button data-slot="button" class="inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50 size-9 absolute inset-e-1 top-1/2 h-6 w-6 -translate-y-1/2 rounded-md text-muted-foreground" type="button" onClick={() => (d.showPassword = !d.showPassword)}>
									@if (d.showPassword) {
										<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-eye" aria-hidden="true"><path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" /><circle cx="12" cy="12" r="3" /></svg>
									} @else {
										<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-eye-off" aria-hidden="true"><path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49" /><path d="M14.084 14.158a3 3 0 0 1-4.242-4.242" /><path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143" /><path d="m2 2 20 20" /></svg>
									}
									<span class="sr-only">{userPasswordToggle}</span>
								</button>
							</div>
							@if (userPasswordError) {
								<p data-slot="form-message" id="user-form-password-message" class="text-sm text-destructive col-span-4 col-start-3">{userPasswordError}</p>
							}
						</div>
						<div data-slot="form-item" class="gap-2 grid grid-cols-6 items-center space-y-0 gap-x-4 gap-y-1">
							<label data-slot="form-label" class="flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50 data-[error=true]:text-destructive col-span-2 text-end" data-error={userConfirmPasswordInvalid} for="user-form-confirmPassword">Confirm Password</label>
							<div class="relative rounded-md col-span-4">
								<input class="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-hidden disabled:cursor-not-allowed disabled:opacity-50" disabled={userConfirmDisabled} placeholder="e.g., S3cur3P@ssw0rd" data-slot="form-control" id="user-form-confirmPassword" aria-describedby={userConfirmPasswordDescribedBy} aria-invalid={userConfirmPasswordInvalid} type={userConfirmPasswordType} value={d.form.confirmPassword} name="confirmPassword" onInput={(event) => { const next = { ...d.form, confirmPassword: (event.target as HTMLInputElement).value }; d.form = next; if (d.submitted) d.errors = userFieldErrors(d.errors, next, 'confirmPassword'); }} />
								<button data-slot="button" class="inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50 size-9 absolute inset-e-1 top-1/2 h-6 w-6 -translate-y-1/2 rounded-md text-muted-foreground" type="button" disabled={userConfirmDisabled} onClick={() => (d.showConfirm = !d.showConfirm)}>
									@if (d.showConfirm) {
										<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-eye" aria-hidden="true"><path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" /><circle cx="12" cy="12" r="3" /></svg>
									} @else {
										<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-eye-off" aria-hidden="true"><path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49" /><path d="M14.084 14.158a3 3 0 0 1-4.242-4.242" /><path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143" /><path d="m2 2 20 20" /></svg>
									}
									<span class="sr-only">{userConfirmPasswordToggle}</span>
								</button>
							</div>
							@if (userConfirmPasswordError) {
								<p data-slot="form-message" id="user-form-confirmPassword-message" class="text-sm text-destructive col-span-4 col-start-3">{userConfirmPasswordError}</p>
							}
						</div>
						</form>
					</div>
					<div data-slot="dialog-footer" class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
						<button data-slot="button" class="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive bg-primary text-primary-foreground shadow-xs hover:bg-primary/90 h-9 px-4 py-2 has-[>svg]:px-3" type="submit" form="user-form">Save changes</button>
					</div>
					<DialogClose data-slot="dialog-close" class="absolute inset-e-4 top-4 rounded-xs opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4">
						<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-x" aria-hidden="true"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
						<span class="sr-only">Close</span>
					</DialogClose>
				</DialogContent>
			</DialogPortal>
		</DialogRoot>
		<DropdownMenuContent menu="user-role" role="listbox" slot="select-content" align="start" class="relative z-50 max-h-(--radix-select-content-available-height) min-w-32 origin-(--radix-select-content-transform-origin) overflow-x-hidden overflow-y-auto rounded-md border bg-popover text-popover-foreground shadow-md data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1">
			<div data-radix-select-viewport="" role="presentation" class="p-1 h-(--radix-select-trigger-height) w-full min-w-(--radix-select-trigger-width) scroll-my-1">
				<SelectItem menu="user-role" selected={userRoleIsSuperadmin} onSelect={() => { const next = { ...d.form, role: 'superadmin' }; d.form = next; if (d.submitted) d.errors = userFieldErrors(d.errors, next, 'role'); }}>Superadmin</SelectItem>
				<SelectItem menu="user-role" selected={userRoleIsAdmin} onSelect={() => { const next = { ...d.form, role: 'admin' }; d.form = next; if (d.submitted) d.errors = userFieldErrors(d.errors, next, 'role'); }}>Admin</SelectItem>
				<SelectItem menu="user-role" selected={userRoleIsManager} onSelect={() => { const next = { ...d.form, role: 'manager' }; d.form = next; if (d.submitted) d.errors = userFieldErrors(d.errors, next, 'role'); }}>Manager</SelectItem>
				<SelectItem menu="user-role" selected={userRoleIsCashier} onSelect={() => { const next = { ...d.form, role: 'cashier' }; d.form = next; if (d.submitted) d.errors = userFieldErrors(d.errors, next, 'role'); }}>Cashier</SelectItem>
			</div>
		</DropdownMenuContent>
	</div>
}

export function UsersInviteDialog() @{
	const d = usersDialogs();
	const m = menus();
	const inviteEmailError = computed(() => errorOf(d.inviteErrors, 'email'));
	const inviteEmailInvalid = computed(() => (errorOf(d.inviteErrors, 'email') ? 'true' : 'false'));
	const inviteEmailDescribedBy = computed(() => (errorOf(d.inviteErrors, 'email') ? 'user-invite-form-email-description user-invite-form-email-message' : 'user-invite-form-email-description'));
	const inviteRoleError = computed(() => errorOf(d.inviteErrors, 'role'));
	const inviteRoleInvalid = computed(() => (errorOf(d.inviteErrors, 'role') ? 'true' : 'false'));
	const inviteRoleDescribedBy = computed(() => (errorOf(d.inviteErrors, 'role') ? 'user-invite-form-role-description user-invite-form-role-message' : 'user-invite-form-role-description'));
	const inviteDescError = computed(() => errorOf(d.inviteErrors, 'desc'));
	const inviteDescInvalid = computed(() => (errorOf(d.inviteErrors, 'desc') ? 'true' : 'false'));
	const inviteDescDescribedBy = computed(() => (errorOf(d.inviteErrors, 'desc') ? 'user-invite-form-desc-description user-invite-form-desc-message' : 'user-invite-form-desc-description'));
	const inviteRoleLabel = computed(() => (d.invite.role === '' ? 'Select a role' : roleLabel(d.invite.role)));
	const inviteRolePlaceholder = computed(() => (d.invite.role === '' ? '' : undefined));
	const inviteRoleExpanded = computed(() => (m.open === 'invite-role' ? 'true' : 'false'));
	const inviteRoleMenuState = computed(() => (m.open === 'invite-role' ? 'open' : 'closed'));
	const inviteRoleIsSuperadmin = computed(() => (d.invite.role === 'superadmin' ? 'true' : 'false'));
	const inviteRoleIsAdmin = computed(() => (d.invite.role === 'admin' ? 'true' : 'false'));
	const inviteRoleIsManager = computed(() => (d.invite.role === 'manager' ? 'true' : 'false'));
	const inviteRoleIsCashier = computed(() => (d.invite.role === 'cashier' ? 'true' : 'false'));

	<div class="contents">
		<DialogRoot open={d.open === 'invite'} onOpenChange={(next: boolean) => { if (!next) d.open = ''; }}>
			<DialogPortal>
				<DialogOverlay data-slot="dialog-overlay" class="fixed inset-0 z-50 bg-black/50 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0"></DialogOverlay>
				<DialogContent data-slot="dialog-content" class="fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border bg-background p-6 shadow-lg duration-200 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 sm:max-w-md">
					<div data-slot="dialog-header" class="flex flex-col gap-2 sm:text-start text-start">
						<DialogTitle data-slot="dialog-title" class="text-lg leading-none font-semibold flex items-center gap-2">
							<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-mail-plus" aria-hidden="true"><path d="M22 13V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v12c0 1.1.9 2 2 2h8" /><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" /><path d="M19 16v6" /><path d="M16 19h6" /></svg>
							{' '}Invite User
						</DialogTitle>
						<DialogDescription data-slot="dialog-description" class="text-sm text-muted-foreground">Invite new user to join your team by sending them an email invitation. Assign a role to define their access level.</DialogDescription>
					</div>
					<form id="user-invite-form" class="space-y-4" onSubmit={(event) => {
						event.preventDefault();
						const values = d.invite;
						const errors = inviteFormErrors(values);
						d.inviteSubmitted = true;
						d.inviteErrors = errors;
						if (errors !== '{}') {
							focusFirstError('user-invite-form', errors, INVITE_FOCUS_ORDER);
							return;
						}
						const id = `invite-${Date.now()}`;
						d.toasts = message(d.toasts, id, 'You submitted the following values:', submittedInvite(values));
						d.open = '';
						setTimeout(() => {
							d.toasts = expired(d.toasts, id);
						}, DURATION);
					}}>
					<div data-slot="form-item" class="grid gap-2">
						<label data-slot="form-label" class="flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50 data-[error=true]:text-destructive" data-error={inviteEmailInvalid} for="user-invite-form-email">Email</label>
						<input data-slot="form-control" class="flex h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none selection:bg-primary selection:text-primary-foreground file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-input/30 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40" type="email" placeholder="eg: john.doe@gmail.com" id="user-invite-form-email" aria-describedby={inviteEmailDescribedBy} aria-invalid={inviteEmailInvalid} value={d.invite.email} name="email" onInput={(event) => { const next = { ...d.invite, email: (event.target as HTMLInputElement).value }; d.invite = next; if (d.inviteSubmitted) d.inviteErrors = inviteFieldErrors(d.inviteErrors, next, 'email'); }} />
						@if (inviteEmailError) {
							<p data-slot="form-message" id="user-invite-form-email-message" class="text-sm text-destructive">{inviteEmailError}</p>
						}
					</div>
					<div data-slot="form-item" class="grid gap-2">
						<label data-slot="form-label" class="flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50 data-[error=true]:text-destructive" data-error={inviteRoleInvalid} for="radix-menu-invite-role-trigger">Role</label>
						<button el={m.triggers} data-menu="invite-role" type="button" role="combobox" aria-controls="radix-menu-invite-role-content" aria-expanded={inviteRoleExpanded} aria-autocomplete="none" dir="ltr" data-state={inviteRoleMenuState} data-placeholder={inviteRolePlaceholder} data-slot="form-control" data-size="default" class="flex w-fit items-center justify-between gap-2 rounded-md border border-input bg-transparent px-3 py-2 text-sm whitespace-nowrap shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 data-placeholder:text-muted-foreground data-[size=default]:h-9 data-[size=sm]:h-8 *:data-[slot=select-value]:line-clamp-1 *:data-[slot=select-value]:flex *:data-[slot=select-value]:items-center *:data-[slot=select-value]:gap-2 dark:bg-input/30 dark:hover:bg-input/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground" id="radix-menu-invite-role-trigger" aria-describedby={inviteRoleDescribedBy} aria-invalid={inviteRoleInvalid}
							onPointerdown={(event) => {
								if (event.button === 0) {
									event.preventDefault();
									m.open = m.open === 'invite-role' ? '' : 'invite-role';
									m.at = '';
									toggleMenu(m.contents, m.triggers, 'invite-role', m.open === '', event.target, (refocus) => { m.open = ''; closeMenu(m.contents, m.triggers, 'invite-role', refocus); });
									focusOption('invite-role');
								}
							}}
							onKeydown={(event) => {
								if (event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowDown') {
									event.preventDefault();
									m.open = 'invite-role';
									m.at = '';
									openMenu(m.contents, m.triggers, 'invite-role', 'first', (refocus) => { m.open = ''; closeMenu(m.contents, m.triggers, 'invite-role', refocus); }, event.target);
									focusOption('invite-role');
								}
							}}
						>
							<span data-slot="select-value" style="pointer-events: none;">{inviteRoleLabel}</span>
							<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-chevron-down size-4 opacity-50" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
						</button>
						<select aria-hidden="true" tabindex="-1" style="position: absolute; border: 0px; width: 1px; height: 1px; padding: 0px; margin: -1px; overflow: hidden; clip: rect(0px, 0px, 0px, 0px); white-space: nowrap; overflow-wrap: normal;">
							<option value="superadmin">Superadmin</option>
							<option value="admin">Admin</option>
							<option value="manager">Manager</option>
							<option value="cashier">Cashier</option>
						</select>
						@if (inviteRoleError) {
							<p data-slot="form-message" id="user-invite-form-role-message" class="text-sm text-destructive">{inviteRoleError}</p>
						}
					</div>
					<div data-slot="form-item" class="grid gap-2">
						<label data-slot="form-label" class="flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50 data-[error=true]:text-destructive" data-error={inviteDescInvalid} for="user-invite-form-desc">Description (optional)</label>
						<textarea data-slot="form-control" class="flex field-sizing-content min-h-16 w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-xs transition-[color,box-shadow] outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:aria-invalid:ring-destructive/40 resize-none" placeholder="Add a personal note to your invitation (optional)" name="desc" id="user-invite-form-desc" aria-describedby={inviteDescDescribedBy} aria-invalid={inviteDescInvalid} value={d.invite.desc} onInput={(event) => { const next = { ...d.invite, desc: (event.target as HTMLTextAreaElement).value }; d.invite = next; if (d.inviteSubmitted) d.inviteErrors = inviteFieldErrors(d.inviteErrors, next, 'desc'); }}></textarea>
						@if (inviteDescError) {
							<p data-slot="form-message" id="user-invite-form-desc-message" class="text-sm text-destructive">{inviteDescError}</p>
						}
					</div>
					</form>
					<div data-slot="dialog-footer" class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end gap-y-2">
						<DialogClose data-slot="dialog-close" class="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50 h-9 px-4 py-2 has-[>svg]:px-3">Cancel</DialogClose>
						<button data-slot="button" class="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive bg-primary text-primary-foreground shadow-xs hover:bg-primary/90 h-9 px-4 py-2 has-[>svg]:px-3" type="submit" form="user-invite-form">
							Invite{' '}
							<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-send" aria-hidden="true"><path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z" /><path d="m21.854 2.147-10.94 10.939" /></svg>
						</button>
					</div>
					<DialogClose data-slot="dialog-close" class="absolute inset-e-4 top-4 rounded-xs opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4">
						<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-x" aria-hidden="true"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
						<span class="sr-only">Close</span>
					</DialogClose>
				</DialogContent>
			</DialogPortal>
		</DialogRoot>
		<DropdownMenuContent menu="invite-role" role="listbox" slot="select-content" align="start" class="relative z-50 max-h-(--radix-select-content-available-height) min-w-32 origin-(--radix-select-content-transform-origin) overflow-x-hidden overflow-y-auto rounded-md border bg-popover text-popover-foreground shadow-md data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1">
			<div data-radix-select-viewport="" role="presentation" class="p-1 h-(--radix-select-trigger-height) w-full min-w-(--radix-select-trigger-width) scroll-my-1">
				<SelectItem menu="invite-role" selected={inviteRoleIsSuperadmin} onSelect={() => { const next = { ...d.invite, role: 'superadmin' }; d.invite = next; if (d.inviteSubmitted) d.inviteErrors = inviteFieldErrors(d.inviteErrors, next, 'role'); }}>Superadmin</SelectItem>
				<SelectItem menu="invite-role" selected={inviteRoleIsAdmin} onSelect={() => { const next = { ...d.invite, role: 'admin' }; d.invite = next; if (d.inviteSubmitted) d.inviteErrors = inviteFieldErrors(d.inviteErrors, next, 'role'); }}>Admin</SelectItem>
				<SelectItem menu="invite-role" selected={inviteRoleIsManager} onSelect={() => { const next = { ...d.invite, role: 'manager' }; d.invite = next; if (d.inviteSubmitted) d.inviteErrors = inviteFieldErrors(d.inviteErrors, next, 'role'); }}>Manager</SelectItem>
				<SelectItem menu="invite-role" selected={inviteRoleIsCashier} onSelect={() => { const next = { ...d.invite, role: 'cashier' }; d.invite = next; if (d.inviteSubmitted) d.inviteErrors = inviteFieldErrors(d.inviteErrors, next, 'role'); }}>Cashier</SelectItem>
			</div>
		</DropdownMenuContent>
	</div>
}
