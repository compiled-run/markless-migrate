// The users page's DOM work (bulk toolbar keys) and its dialogs' form rules.
import { z } from 'zod';
import { zodResolver } from './parity/hookform-resolvers/index.ts';

/** DataTableBulkActions' handleKeyDown: the arrows, Home and End move between the toolbar's buttons, wrapping. */
export function moveToolbarFocus(toolbar: HTMLElement, key: string): void {
	const buttons = [...toolbar.querySelectorAll<HTMLButtonElement>('button')];
	if (!buttons.length) return;
	const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
	const next = key === 'Home' ? 0 : key === 'End' ? buttons.length - 1 : key === 'ArrowRight' ? (at + 1) % buttons.length : at <= 0 ? buttons.length - 1 : at - 1;
	buttons[next]?.focus();
}

/** Escape on the toolbar clears the selection unless it was meant for one of its menus. */
export function escapeClears(event: KeyboardEvent): boolean {
	const target = event.target as HTMLElement | null;
	return !target?.closest('[data-slot=dropdown-menu-trigger], [data-slot=dropdown-menu-content]');
}

// The add/edit, invite and multi-delete dialogs' rules (users-action-dialog.tsx, users-invite-dialog.tsx), as pure functions over the page's values.
export const userFormSchema = z
	.object({
		firstName: z.string().min(1, 'First Name is required.'),
		lastName: z.string().min(1, 'Last Name is required.'),
		username: z.string().min(1, 'Username is required.'),
		phoneNumber: z.string().min(1, 'Phone number is required.'),
		email: z.email({ error: (iss) => (iss.input === '' ? 'Email is required.' : undefined) }),
		password: z.string().transform((pwd) => pwd.trim()),
		role: z.string().min(1, 'Role is required.'),
		confirmPassword: z.string().transform((pwd) => pwd.trim()),
		isEdit: z.boolean(),
	})
	.refine((data) => (data.isEdit && !data.password ? true : data.password.length > 0), { message: 'Password is required.', path: ['password'] })
	.refine(({ isEdit, password }) => (isEdit && !password ? true : password.length >= 8), { message: 'Password must be at least 8 characters long.', path: ['password'] })
	.refine(({ isEdit, password }) => (isEdit && !password ? true : /[a-z]/.test(password)), { message: 'Password must contain at least one lowercase letter.', path: ['password'] })
	.refine(({ isEdit, password }) => (isEdit && !password ? true : /\d/.test(password)), { message: 'Password must contain at least one number.', path: ['password'] })
	.refine(({ isEdit, password, confirmPassword }) => (isEdit && !password ? true : password === confirmPassword), { message: "Passwords don't match.", path: ['confirmPassword'] });

export type UserFormValues = z.input<typeof userFormSchema>;

export const inviteFormSchema = z.object({
	email: z.email({ error: (iss) => (iss.input === '' ? 'Please enter an email to invite.' : undefined) }),
	role: z.string().min(1, 'Role is required.'),
	desc: z.string().optional(),
});

export type InviteFormValues = z.input<typeof inviteFormSchema>;

const userResolver = zodResolver(userFormSchema);
const inviteResolver = zodResolver(inviteFormSchema);

export const ROLE_LABELS: Readonly<Record<string, string>> = { superadmin: 'Superadmin', admin: 'Admin', manager: 'Manager', cashier: 'Cashier' };

/** The add form's empty values, or the edit form's values from the row (useForm's defaultValues). */
export function userForm(user?: { readonly firstName: string; readonly lastName: string; readonly username: string; readonly email: string; readonly phoneNumber: string; readonly role: string }): UserFormValues {
	return user
		? { firstName: user.firstName, lastName: user.lastName, username: user.username, phoneNumber: user.phoneNumber, email: user.email, password: '', role: user.role, confirmPassword: '', isEdit: true }
		: { firstName: '', lastName: '', username: '', phoneNumber: '', email: '', password: '', role: '', confirmPassword: '', isEdit: false };
}

export function inviteForm(): InviteFormValues {
	return { email: '', role: '', desc: '' };
}

/** The form's errors, one message per field, as JSON ('{}' when valid). */
export function userFormErrors(values: UserFormValues): string {
	return JSON.stringify(userResolver(values));
}

export function inviteFormErrors(values: InviteFormValues): string {
	return JSON.stringify(inviteResolver(values));
}

/** After the first submit react-hook-form validates again on every change, but only replaces the changed field's error. */
export function userFieldErrors(errors: string, values: UserFormValues, name: string): string {
	return withFieldError(errors, userResolver(values) as Record<string, string>, name);
}

export function inviteFieldErrors(errors: string, values: InviteFormValues, name: string): string {
	return withFieldError(errors, inviteResolver(values) as Record<string, string>, name);
}

function withFieldError(errors: string, next: Record<string, string>, name: string): string {
	const all = { ...(JSON.parse(errors || '{}') as Record<string, string>) };
	if (next[name] === undefined) delete all[name];
	else all[name] = next[name];
	return JSON.stringify(all);
}

export function errorOf(errors: string, name: string): string {
	return (JSON.parse(errors || '{}') as Record<string, string>)[name] ?? '';
}

/** react-hook-form focuses the first invalid field that took a ref: the role select's trigger never does. */
export function focusFirstError(formId: string, errors: string, order: readonly string[]): void {
	const parsed = JSON.parse(errors || '{}') as Record<string, string>;
	const name = order.find((n) => parsed[n] !== undefined);
	if (name) document.querySelector<HTMLElement>(`#${formId} [name="${name}"]`)?.focus();
}

/** showSubmittedData's text: the values zod parsed, as indented JSON. */
export function submittedUser(values: UserFormValues): string {
	return JSON.stringify(userFormSchema.parse(values), null, 2);
}

export function submittedInvite(values: InviteFormValues): string {
	return JSON.stringify(inviteFormSchema.parse(values), null, 2);
}

export function roleLabel(value: string): string {
	return ROLE_LABELS[value] ?? '';
}

/** Radix Select focuses its chosen option on open, or else its first. */
export function focusOption(menu: string): void {
	const content = document.getElementById(`radix-menu-${menu}-content`);
	if (!content || content.closest('[hidden]')) return;
	(content.querySelector<HTMLElement>('[role=option][aria-selected="true"]') ?? content.querySelector<HTMLElement>('[role=option]'))?.focus();
}
