// Parity port of @hookform/resolvers for the ported routes: zodResolver, the only export they use.
import type { z } from 'zod';

export type FieldErrors<T> = Partial<Record<keyof T & string, string>>;

export type Resolver<T> = (values: T) => FieldErrors<T>;

/** Validates with the zod schema as react-hook-form's zodResolver does: the first issue's message for each field. */
export function zodResolver<S extends z.ZodType>(schema: S): Resolver<z.input<S>> {
	return (values) => {
		const result = schema.safeParse(values);
		const errors: Record<string, string> = {};
		if (result.success) return errors as FieldErrors<z.input<S>>;
		for (const issue of result.error.issues) {
			const key = String(issue.path[0] ?? '');
			if (key && !(key in errors)) errors[key] = issue.message;
		}
		return errors as FieldErrors<z.input<S>>;
	};
}
