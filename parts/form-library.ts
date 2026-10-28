// react-hook-form 7, TanStack Form 1 and Formisch 0.4 as their forms run on the old site: when each validates (on submit,
// then on every change after a submit for react-hook-form and Formisch; TanStack Form's submit errors leave a field when
// it changes), which messages a field shows (react-hook-form's first, the others' every message), which field a failed
// submit focuses, and Reset. Validation is the site's own schema through Standard Schema (zod, valibot). The region's
// `mmform` handler (the converter's FormPlan) takes each field's shown errors and value.

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

export type FormLibrary = 'react-hook-form' | 'tanstack-form' | 'formisch';

export interface FieldSpec {
	/** The name the library registered the field under. */
	readonly name: string;
	/** Where its value sits in the form's values. */
	readonly path: readonly (string | number)[];
}

/**
 * A list of rows a visitor adds to and removes from (react-hook-form's useFieldArray, Formisch's FieldArray): a field per
 * row and sub-field, named `${name}.${row}.${sub}`.
 */
export interface ListSpec {
	readonly name: string;
	readonly path: readonly (string | number)[];
	/** Each row's fields, with the value an added row starts with. */
	readonly subs: readonly { readonly name: string; readonly path: readonly (string | number)[]; readonly item: Json }[];
	/** The rows it loads with. */
	readonly rows: number;
	/** An added row takes focus (react-hook-form's append). */
	readonly focusAppended?: boolean;
}

export interface FormSpec {
	readonly library: FormLibrary;
	readonly fields: readonly FieldSpec[];
	readonly lists?: readonly ListSpec[];
	readonly defaults: Readonly<Record<string, Json>>;
}

export interface FormState {
	/** Each field's value, by name. */
	readonly values: Readonly<Record<string, Json>>;
	/** Each field's errors as the library holds them, by name. */
	readonly errors: Readonly<Record<string, readonly string[]>>;
	readonly submitted: boolean;
	/** Each list's rows, by a key each keeps while it is in the list. */
	readonly rows?: Readonly<Record<string, readonly number[]>>;
}

export interface Issue {
	readonly message: string;
	readonly path?: readonly (PropertyKey | { readonly key: PropertyKey })[];
}

export type Validate = (values: Json) => readonly Issue[];

export type FormAction =
	| { readonly k: 'change'; readonly field: string; readonly value: Json }
	| { readonly k: 'blur'; readonly field: string }
	| { readonly k: 'append'; readonly list: string }
	| { readonly k: 'remove'; readonly list: string; readonly row: number }
	| { readonly k: 'submit' }
	| { readonly k: 'reset' };

export interface FormResult {
	readonly state: FormState;
	/** The field a failed submit focuses. */
	readonly focus?: string;
	/** The values a submit that passed handed the site's onSubmit. */
	readonly submit?: Json;
}

export const initialState = (spec: FormSpec): FormState => ({ values: { ...spec.defaults }, errors: {}, submitted: false, ...(spec.lists?.length ? { rows: Object.fromEntries(spec.lists.map((l) => [l.name, Array.from({ length: l.rows }, (_, i) => i)])) } : {}) });

const rowField = (list: ListSpec, row: number, sub: ListSpec['subs'][number]): FieldSpec => ({ name: `${list.name}.${row}.${sub.name}`, path: [...list.path, row, ...sub.path] });

/** The form's fields as they are: its own, then each list's, a field per row and sub-field. */
export function fieldsOf(spec: FormSpec, state: FormState): FieldSpec[] {
	return [...spec.fields, ...(spec.lists ?? []).flatMap((l) => (state.rows?.[l.name] ?? []).flatMap((_, row) => l.subs.map((sub) => rowField(l, row, sub))))];
}

/** The form's values as one object, each field's value at its path, and each list as many rows as it has. */
export function formValues(spec: FormSpec, values: Readonly<Record<string, Json>>, state?: FormState): Json {
	const out: Record<string, Json> = {};
	for (const l of spec.lists ?? []) {
		let at = out as Record<string | number, Json>;
		l.path.forEach((key, i) => (at = (i === l.path.length - 1 ? (at[key] = []) : (at[key] ??= {})) as Record<string | number, Json>));
	}
	for (const f of state ? fieldsOf(spec, state) : spec.fields) {
		let at: Record<string, Json> | Json[] = out;
		f.path.forEach((key, i) => {
			const last = i === f.path.length - 1;
			const container = at as Record<string | number, Json>;
			if (last) container[key] = values[f.name] ?? null;
			else {
				container[key] ??= typeof f.path[i + 1] === 'number' ? [] : {};
				at = container[key] as Record<string, Json>;
			}
		});
	}
	return out;
}

const keyOf = (k: PropertyKey | { readonly key: PropertyKey }) => (typeof k === 'object' && k !== null ? k.key : k);

/** Each field's messages from a validation, in issue order, by the field whose path the issue names. */
export function issuesByField(spec: FormSpec, issues: readonly Issue[], state?: FormState): Record<string, string[]> {
	const out: Record<string, string[]> = {};
	const fields = state ? fieldsOf(spec, state) : spec.fields;
	for (const issue of issues) {
		const path = (issue.path ?? []).map((k) => String(keyOf(k)));
		const field = fields.find((f) => f.path.length === path.length && f.path.every((k, i) => String(k) === path[i]));
		if (field) (out[field.name] ??= []).push(issue.message);
	}
	return out;
}

/** What a field shows: react-hook-form keeps a field's first message; TanStack Form and Formisch keep them all, and the field shows each once. */
export function shown(spec: FormSpec, errors: readonly string[] | undefined): string[] {
	const list = [...new Set(errors ?? [])];
	return spec.library === 'react-hook-form' ? list.slice(0, 1) : list;
}

/** Every field's errors from validating the values as they are. */
function validated(spec: FormSpec, state: FormState, validate: Validate): Record<string, string[]> {
	const found = issuesByField(spec, validate(formValues(spec, state.values, state)), state);
	return Object.fromEntries(fieldsOf(spec, state).map((f) => [f.name, shown(spec, found[f.name])]));
}

/** A list with a row added at its end or one taken out, the rows after it moving up with their values and errors. */
function listAct(spec: FormSpec, state: FormState, list: ListSpec, row: number | undefined, validate: Validate): FormState {
	const keys = [...(state.rows?.[list.name] ?? [])];
	const values: Record<string, Json> = { ...state.values };
	const errors: Record<string, readonly string[]> = { ...state.errors };
	if (row === undefined) {
		const at = keys.length;
		keys.push(Math.max(-1, ...Object.values(state.rows ?? {}).flat()) + 1);
		for (const sub of list.subs) {
			values[rowField(list, at, sub).name] = sub.item;
			delete errors[rowField(list, at, sub).name];
		}
	} else {
		keys.splice(row, 1);
		for (let r = row; r <= keys.length; r++)
			for (const sub of list.subs) {
				const from = rowField(list, r + 1, sub).name;
				const to = rowField(list, r, sub).name;
				if (r < keys.length) {
					values[to] = values[from] ?? sub.item;
					errors[to] = errors[from] ?? [];
				} else {
					delete values[to];
					delete errors[to];
				}
			}
	}
	const next = { ...state, values, errors, rows: { ...state.rows, [list.name]: keys } };
	// Formisch validates again whenever its input changes once submitted, a row added or taken out included.
	return spec.library === 'formisch' && state.submitted ? { ...next, errors: validated(spec, next, validate) } : next;
}

export function formAct(spec: FormSpec, state: FormState, action: FormAction, validate: Validate): FormResult {
	if (action.k === 'reset') return { state: initialState(spec) };
	if (action.k === 'append' || action.k === 'remove') {
		const list = spec.lists?.find((l) => l.name === action.list);
		if (!list) return { state };
		const next = listAct(spec, state, list, action.k === 'remove' ? action.row : undefined, validate);
		const at = (next.rows?.[list.name]?.length ?? 1) - 1;
		return { state: next, ...(action.k === 'append' && list.focusAppended ? { focus: rowField(list, at, list.subs[0]!).name } : {}) };
	}
	// A control whose blur the site's code hands the library (TanStack Form's handleBlur): its field's submit errors go.
	if (action.k === 'blur') return { state: { ...state, errors: { ...state.errors, [action.field]: [] } } };
	if (action.k === 'change') {
		const values = { ...state.values, [action.field]: action.value };
		if (spec.library === 'tanstack-form') return { state: { ...state, values, errors: { ...state.errors, [action.field]: [] } } };
		if (!state.submitted) return { state: { ...state, values } };
		const found = issuesByField(spec, validate(formValues(spec, values, state)), state);
		return { state: { ...state, values, errors: { ...state.errors, [action.field]: shown(spec, found[action.field]) } } };
	}
	const errors = validated(spec, state, validate);
	const first = fieldsOf(spec, state).find((f) => errors[f.name]!.length);
	const next: FormState = { ...state, errors, submitted: true };
	if (first) return { state: next, ...(spec.library === 'tanstack-form' ? {} : { focus: first.name }) };
	return { state: next, submit: formValues(spec, state.values, state) };
}

// --- On the page ------------------------------------------------------------------------------------------------------

/** What the converter writes for a form: its spec, and the site's schema loaded on first use. */
export interface FormEntry extends FormSpec {
	readonly schema: () => Promise<{ readonly '~standard': { readonly validate: (value: unknown) => unknown } }>;
}

const REGION = '[data-mm-fl]';
const FIELD = 'data-mm-fl-field';

let registry: Promise<Readonly<Record<string, FormEntry>>> | undefined;
const entries = () => (registry ??= import('./form-libraries.ts').then((m) => m.FORMS as Readonly<Record<string, FormEntry>>));

interface Live {
	readonly spec: FormEntry;
	state: FormState;
	validate?: Validate;
}
const live = new WeakMap<Element, Promise<Live | undefined>>();

function liveOf(region: Element): Promise<Live | undefined> {
	let found = live.get(region);
	if (!found) {
		found = entries().then(async (all) => {
			const spec = all[region.getAttribute('data-mm-fl') ?? ''];
			if (!spec) return undefined;
			const schema = await spec.schema();
			const validate: Validate = (values) => {
				const result = schema['~standard'].validate(values) as { issues?: readonly Issue[] } | Promise<unknown>;
				return result instanceof Promise ? [] : (result.issues ?? []);
			};
			return { spec, state: initialState(spec), validate };
		});
		live.set(region, found);
	}
	return found;
}

/** A list's rows as its region renders them: each row's key, index, and each sub-field's errors and first message. */
export function rowsOf(spec: FormSpec, state: FormState, list: ListSpec): Record<string, Json>[] {
	return (state.rows?.[list.name] ?? []).map((k, i) => {
		const row: Record<string, Json> = { k, i };
		list.subs.forEach((sub, n) => {
			const errors = [...(state.errors[`${list.name}.${i}.${sub.name}`] ?? [])];
			row[`e${n}`] = errors;
			row[`m${n}`] = errors[0] ?? '';
		});
		return row;
	});
}

function commit(region: Element, l: Live): void {
	const e: Record<string, string[]> = {};
	const v: Record<string, Json> = {};
	for (const f of l.spec.fields) {
		e[f.name] = [...(l.state.errors[f.name] ?? [])];
		v[f.name] = l.state.values[f.name] ?? null;
	}
	const rows = Object.fromEntries((l.spec.lists ?? []).map((list) => [list.name, rowsOf(l.spec, l.state, list)]));
	region.dispatchEvent(new CustomEvent('mmform', { detail: { e, v, rows } }));
}

// The element the library focuses for a field: the one the converter marked, or for a list row's field (the library's
// own field array registers each row's input) the row's control.
const focusField = (region: Element, spec: FormSpec, field: string) =>
	(region.querySelector<HTMLElement>(`[data-mm-fl-focus="${CSS.escape(field)}"]`) ?? (spec.lists?.some((l) => field.startsWith(`${l.name}.`)) ? region.querySelector<HTMLElement>(`[${FIELD}="${CSS.escape(field)}"]`) : null))?.focus();

/** A list's Add or a row's Remove: the rows change, and react-hook-form focuses the row it added once it is rendered. */
async function listUse(region: Element, action: FormAction): Promise<void> {
	const l = await liveOf(region);
	if (!l) return;
	const result = formAct(l.spec, l.state, action, l.validate!);
	l.state = result.state;
	commit(region, l);
	if (result.focus) setTimeout(() => focusField(region, l.spec, result.focus!));
}

const on = (el: Element) => el.getAttribute('aria-checked') === 'true' || el.getAttribute('data-state') === 'checked' || (el instanceof HTMLInputElement && el.checked);

/** A control's field and the value using it gave the field, read from what the control shows now. */
function valueOf(control: Element, current: Json): Json {
	const kind = control.getAttribute('data-mm-fl-kind');
	if (kind === 'text') return (control as HTMLInputElement).value;
	if (kind === 'select') {
		const items = JSON.parse(control.getAttribute('data-mm-fl-items') ?? '{}') as Record<string, Json>;
		const shown = (control.querySelector('[data-slot="select-value"]') ?? control).textContent?.trim() ?? '';
		return shown in items ? items[shown]! : current;
	}
	if (kind === 'bool') return on(control);
	const item = JSON.parse(control.getAttribute('data-mm-fl-item') ?? 'null') as Json;
	if (kind === 'choice') return on(control) ? item : current;
	const list = Array.isArray(current) ? current.filter((x) => JSON.stringify(x) !== JSON.stringify(item)) : [];
	return on(control) ? [...list, item] : list;
}

async function changed(control: Element): Promise<void> {
	const region = control.closest(REGION);
	const l = region && (await liveOf(region));
	if (!region || !l) return;
	const field = control.getAttribute(FIELD)!;
	const value = valueOf(control, l.state.values[field] ?? null);
	if (JSON.stringify(value) === JSON.stringify(l.state.values[field] ?? null)) return;
	l.state = formAct(l.spec, l.state, { k: 'change', field, value }, l.validate!).state;
	commit(region, l);
}

export function input(target: Element): boolean {
	if (target.closest(REGION) && target.getAttribute('data-mm-fl-kind') === 'text') void changed(target);
	return false;
}

// A checkbox, switch or radio shows its new state once its own part has run, and a select once the option chosen in its
// layer has: each is read after the press is handled.
function pressed(target: Element): void {
	const control = target.closest(`[${FIELD}]`);
	const regions = control?.closest(REGION) ? [control.closest(REGION)!] : [...document.querySelectorAll(`${REGION}:has([data-mm-fl-kind="select"])`)];
	if (!regions.length || control?.getAttribute('data-mm-fl-kind') === 'text') return;
	setTimeout(() => {
		for (const region of regions) for (const c of region.querySelectorAll(`[${FIELD}]:not([data-mm-fl-kind="text"])`)) void changed(c);
	});
}

export function click(target: Element): boolean {
	pressed(target);
	const reset = target.closest('[data-mm-fl-reset]');
	const region = reset?.closest(REGION);
	if (reset && region) void doReset(region);
	const append = target.closest('[data-mm-fl-append]');
	if (append && append.closest(REGION) && !(append as HTMLButtonElement).disabled) void listUse(append.closest(REGION)!, { k: 'append', list: append.getAttribute('data-mm-fl-append')! });
	const remove = target.closest('[data-mm-fl-remove]');
	const row = remove?.closest('[data-mm-fl-row]');
	if (remove && row && remove.closest(REGION)) void listUse(remove.closest(REGION)!, { k: 'remove', list: remove.getAttribute('data-mm-fl-remove')!, row: Number(row.getAttribute('data-mm-fl-row')) });
	return false;
}

export function focusout(target: Element): boolean {
	const region = target.closest(REGION);
	if (!region || !target.hasAttribute('data-mm-fl-blur')) return false;
	void liveOf(region).then((l) => {
		if (!l) return;
		l.state = formAct(l.spec, l.state, { k: 'blur', field: target.getAttribute(FIELD)! }, l.validate!).state;
		commit(region, l);
	});
	return false;
}

export function keydown(target: Element): boolean {
	pressed(target);
	return false;
}

async function doReset(region: Element): Promise<void> {
	const l = await liveOf(region);
	if (!l) return;
	l.state = formAct(l.spec, l.state, { k: 'reset' }, l.validate!).state;
	for (const control of region.querySelectorAll(`[${FIELD}]`)) {
		const field = control.getAttribute(FIELD)!;
		const kind = control.getAttribute('data-mm-fl-kind');
		const value = l.spec.defaults[field] ?? null;
		if (kind === 'text') (control as HTMLInputElement).value = typeof value === 'string' ? value : '';
		else if (kind === 'select') continue;
		else {
			const item = JSON.parse(control.getAttribute('data-mm-fl-item') ?? 'null') as Json;
			const want = kind === 'bool' ? value === true : kind === 'choice' ? JSON.stringify(value) === JSON.stringify(item) : Array.isArray(value) && value.some((x) => JSON.stringify(x) === JSON.stringify(item));
			if (want !== on(control)) control.dispatchEvent(new CustomEvent('mmset', { detail: want }));
		}
	}
	commit(region, l);
}

export function submit(target: Element, event: SubmitEvent): boolean {
	const region = target.closest(REGION);
	if (!region) return false;
	event.preventDefault();
	void liveOf(region).then((l) => {
		if (!l) return;
		const result = formAct(l.spec, l.state, { k: 'submit' }, l.validate!);
		l.state = result.state;
		commit(region, l);
		if (result.focus) focusField(region, l.spec, result.focus);
		if (result.submit !== undefined) region.dispatchEvent(new CustomEvent('mmformsubmit', { detail: result.submit, bubbles: true }));
	});
	return true;
}
