// TanStack Form's own core (@tanstack/form-core, what @tanstack/react-form runs) on a form's fields, as the old page's
// components mounted them: a field per control, a field per list with its rows, the form's validators the site's schema.
// What a field shows is the demos' own rule: its errors once it is touched and invalid.
import type { FormAction, FormResult, FormSpec, FormState, ListSpec } from './form-library.ts';
import { fieldsOf, initialState } from './form-library.ts';

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };
type Api = Record<string, any>;

export interface Engine {
	readonly state: FormState;
	act(action: FormAction): Promise<FormResult>;
}

export interface StandardSchema {
	readonly '~standard': { readonly validate: (value: unknown) => unknown };
}

/** A field's name as TanStack Form writes it: `emails[0].address`. */
export const tanstackName = (path: readonly (string | number)[]): string => path.map((k, i) => (typeof k === 'number' ? `[${k}]` : i ? `.${k}` : k)).join('');

export async function tanstackEngine(spec: FormSpec, schema: StandardSchema, validators: readonly string[]): Promise<Engine> {
	const { FormApi, FieldApi } = (await import('@tanstack/form-core')) as unknown as { FormApi: new (o: Api) => Api; FieldApi: new (o: Api) => Api };
	let submitted: Json | undefined;
	const form = new FormApi({
		defaultValues: spec.shape,
		validators: Object.fromEntries(validators.map((cause) => [cause, schema])),
		onSubmit: ({ value }: { value: Json }) => {
			submitted = value;
		},
	});
	form.mount();
	const fields = new Map<string, Api>();
	let state = initialState(spec);
	const pathOf = (name: string) => [...spec.fields, ...fieldsOf(spec, state)].find((f) => f.name === name)?.path ?? [name];
	const fieldOf = (name: string, mode?: 'array'): Api => {
		const key = mode ? `${name}[]` : name;
		let field = fields.get(key);
		if (!field) {
			field = new FieldApi({ form, name: mode ? name : tanstackName(pathOf(name)), ...(mode ? { mode } : {}) });
			field.mount();
			fields.set(key, field);
		}
		return field;
	};
	const listField = (list: ListSpec) => fieldOf(tanstackName(list.path), 'array');
	// Every field the page renders is mounted, as each of its components mounts one.
	const mountAll = () => {
		for (const l of spec.lists ?? []) listField(l);
		for (const f of fieldsOf(spec, state)) fieldOf(f.name);
	};
	const read = (): FormState => {
		const values: Record<string, Json> = {};
		const errors: Record<string, string[]> = {};
		for (const f of fieldsOf(spec, state)) {
			const meta = form.getFieldMeta(tanstackName(f.path)) as { isTouched?: boolean; isValid?: boolean; errors?: unknown[] } | undefined;
			values[f.name] = form.getFieldValue(tanstackName(f.path)) as Json;
			errors[f.name] = meta?.isTouched && meta.isValid === false ? [...new Set((meta.errors ?? []).map((e) => (typeof e === 'string' ? e : ((e as { message?: string })?.message ?? ''))).filter(Boolean))] : [];
		}
		return { ...state, values, errors };
	};
	mountAll();
	return {
		get state() {
			return state;
		},
		async act(action) {
			submitted = undefined;
			if (action.k === 'change') fieldOf(action.field).handleChange(action.value);
			else if (action.k === 'blur') fieldOf(action.field).handleBlur();
			else if (action.k === 'append' || action.k === 'remove') {
				const list = spec.lists?.find((l) => l.name === action.list);
				if (!list) return { state };
				const keys = [...(state.rows?.[list.name] ?? [])];
				if (action.k === 'append') {
					const item = list.subs.length === 1 && list.subs[0]!.path.length === 0 ? list.subs[0]!.item : Object.fromEntries(list.subs.map((s) => [s.path.join('.'), s.item]));
					keys.push(Math.max(-1, ...Object.values(state.rows ?? {}).flat()) + 1);
					await listField(list).pushValue(item);
				} else {
					keys.splice(action.row, 1);
					await listField(list).removeValue(action.row);
				}
				state = { ...state, rows: { ...state.rows, [list.name]: keys } };
				mountAll();
			} else if (action.k === 'reset') {
				form.reset();
				state = initialState(spec);
			} else await form.handleSubmit();
			state = read();
			return { state, ...(submitted !== undefined ? { submit: submitted } : {}) };
		},
	};
}
