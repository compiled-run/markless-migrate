// The schemas load on the first validation, not with the page: zod stays out of the code a page runs to wake up.
// Each function works on a copy of the page's values: Markless refuses handing live state to code it cannot follow.
import type { FormName } from './forms.ts';

const forms = () => import('./forms.ts');

export interface Submitted {
	readonly errors: Record<string, string>;
	readonly json: string;
}

export async function submitForm(form: FormName, values: unknown): Promise<Submitted> {
	const own = structuredClone(values);
	const f = await forms();
	const errors = f.issues(form, own);
	return { errors, json: Object.keys(errors).length > 0 ? '' : f.parsedJson(form, own) };
}

/** Loads the schemas and runs `form`'s once (zod compiles a schema on its first parse) when a field takes focus, so the first keystroke pays for neither. */
export function prepare(form: FormName, values: unknown): void {
	const own = structuredClone(values);
	void forms().then((f) => f.issues(form, own));
}

export async function revalidate(form: FormName, values: unknown, errors: Record<string, string>, field: string): Promise<Record<string, string>> {
	const own = structuredClone(values);
	const had = structuredClone(errors);
	return (await forms()).validateField(form, own, had, field);
}
