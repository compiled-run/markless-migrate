// The settings forms' schemas (features/settings/*) and the field-level validation react-hook-form does with them.
import { z } from 'zod';
import { fonts } from './data.ts';

const profile = z.object({
	username: z.string('Please enter your username.').min(2, 'Username must be at least 2 characters.').max(30, 'Username must not be longer than 30 characters.'),
	email: z.email({ error: (iss) => (iss.input === undefined ? 'Please select an email to display.' : undefined) }),
	bio: z.string().max(160).min(4),
	urls: z.array(z.object({ value: z.url('Please enter a valid URL.') })).optional(),
});

const account = z.object({
	name: z.string().min(1, 'Please enter your name.').min(2, 'Name must be at least 2 characters.').max(30, 'Name must not be longer than 30 characters.'),
	dob: z.date('Please select your date of birth.'),
	language: z.string('Please select a language.'),
});

const appearance = z.object({
	theme: z.enum(['light', 'dark']),
	font: z.enum(fonts),
});

const display = z.object({
	items: z.array(z.string()).refine((value) => value.some((item) => item), { message: 'You have to select at least one item.' }),
});

const notifications = z.object({
	type: z.enum(['all', 'mentions', 'none'], { error: (iss) => (iss.input === undefined ? 'Please select a notification type.' : undefined) }),
	mobile: z.boolean().default(false).optional(),
	communication_emails: z.boolean().default(false).optional(),
	social_emails: z.boolean().default(false).optional(),
	marketing_emails: z.boolean().default(false).optional(),
	security_emails: z.boolean(),
});

export const schemas = { profile, account, appearance, display, notifications };
export type FormName = keyof typeof schemas;

/** Every error by its field path (`urls.1.value`), the first issue's message for each, as react-hook-form's zodResolver keeps them. */
export function issues(form: FormName, values: unknown): Record<string, string> {
	const result = schemas[form].safeParse(values);
	const errors: Record<string, string> = {};
	if (result.success) return errors;
	for (const issue of result.error.issues) {
		const key = issue.path.join('.');
		if (!(key in errors)) errors[key] = issue.message;
	}
	return errors;
}

/** Validation of one field (mode onChange, or reValidateMode onChange after a submit): that field's error replaced, the rest kept. */
export function validateField(form: FormName, values: unknown, errors: Record<string, string>, field: string): Record<string, string> {
	const all = issues(form, values);
	const next: Record<string, string> = {};
	for (const [key, message] of Object.entries(errors)) if (key !== field) next[key] = message;
	if (all[field]) next[field] = all[field];
	return next;
}

/** handleSubmit hands the resolver's output to the handler: the parsed data (defaults filled, keys in schema order), as showSubmittedData prints it. */
export function parsedJson(form: FormName, values: unknown): string {
	const result = schemas[form].safeParse(values);
	return JSON.stringify(result.success ? result.data : values, null, 2);
}
