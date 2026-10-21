// The schemas load on the first validation, not with the page: zod stays out of the code a page runs to wake up.
import type { FormName } from './forms.ts';

const forms = () => import('./forms.ts');

export interface Submitted {
	readonly errors: Record<string, string>;
	readonly json: string;
}

export async function submitForm(form: FormName, values: unknown): Promise<Submitted> {
	const f = await forms();
	const errors = f.issues(form, values);
	return { errors, json: Object.keys(errors).length > 0 ? '' : f.parsedJson(form, values) };
}

/** Loads the schemas and runs `form`'s once (zod compiles a schema on its first parse) when a field takes focus, so the first keystroke pays for neither. */
export function prepare(form: FormName, values: unknown): void {
	void forms().then((f) => f.issues(form, values));
}

export async function revalidate(form: FormName, values: unknown, errors: Record<string, string>, field: string): Promise<Record<string, string>> {
	return (await forms()).validateField(form, values, errors, field);
}
