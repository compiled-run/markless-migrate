// Parity port of react-hook-form for the ported routes. Markless keeps state in the component that owns
// it (a hook cannot hand back live state), so what the routes use of useForm becomes plain functions over
// the page's own state: the same options (resolver, defaultValues), the same submit rule (validate every
// field, focus the first invalid one, call the handler only when valid) and re-validation on change after
// the first submit (reValidateMode: 'onChange').
import type { FieldErrors, Resolver } from '../hookform-resolvers/index.ts';

export type { FieldErrors, Resolver };

export interface UseFormOptions<T> {
	readonly resolver: Resolver<T>;
	readonly defaultValues: T;
}

/** The errors after a submit: every field validated at once. */
export function handleSubmit<T>(options: UseFormOptions<T>, values: T): { readonly valid: boolean; readonly errors: FieldErrors<T> } {
	const errors = options.resolver(structuredClone(values));
	return { valid: Object.keys(errors).length === 0, errors };
}

/** The first field, in the order the form renders them, that carries an error: react-hook-form focuses it after a failed submit. */
export function firstError<T>(order: readonly (keyof T & string)[], errors: FieldErrors<T>): (keyof T & string) | undefined {
	return order.find((name) => errors[name] !== undefined);
}

/** After the first submit react-hook-form validates again on every change. */
export function revalidate<T>(options: UseFormOptions<T>, submitted: boolean, values: T, errors: FieldErrors<T>): FieldErrors<T> {
	return submitted ? options.resolver(structuredClone(values)) : errors;
}
