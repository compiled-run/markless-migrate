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

export interface FormSpec {
	readonly library: FormLibrary;
	readonly fields: readonly FieldSpec[];
	readonly defaults: Readonly<Record<string, Json>>;
}

export interface FormState {
	/** Each field's value, by name. */
	readonly values: Readonly<Record<string, Json>>;
	/** Each field's errors as the library holds them, by name. */
	readonly errors: Readonly<Record<string, readonly string[]>>;
	readonly submitted: boolean;
}

export interface Issue {
	readonly message: string;
	readonly path?: readonly (PropertyKey | { readonly key: PropertyKey })[];
}

export type Validate = (values: Json) => readonly Issue[];

export type FormAction = { readonly k: 'change'; readonly field: string; readonly value: Json } | { readonly k: 'submit' } | { readonly k: 'reset' };

export interface FormResult {
	readonly state: FormState;
	/** The field a failed submit focuses. */
	readonly focus?: string;
	/** The values a submit that passed handed the site's onSubmit. */
	readonly submit?: Json;
}

export const initialState = (spec: FormSpec): FormState => ({ values: { ...spec.defaults }, errors: {}, submitted: false });

/** The form's values as one object, each field's value at its path. */
export function formValues(spec: FormSpec, values: Readonly<Record<string, Json>>): Json {
	const out: Record<string, Json> = {};
	for (const f of spec.fields) {
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
export function issuesByField(spec: FormSpec, issues: readonly Issue[]): Record<string, string[]> {
	const out: Record<string, string[]> = {};
	for (const issue of issues) {
		const path = (issue.path ?? []).map((k) => String(keyOf(k)));
		const field = spec.fields.find((f) => f.path.length === path.length && f.path.every((k, i) => String(k) === path[i]));
		if (field) (out[field.name] ??= []).push(issue.message);
	}
	return out;
}

/** What a field shows: react-hook-form keeps a field's first message; TanStack Form and Formisch keep them all, and the field shows each once. */
export function shown(spec: FormSpec, errors: readonly string[] | undefined): string[] {
	const list = [...new Set(errors ?? [])];
	return spec.library === 'react-hook-form' ? list.slice(0, 1) : list;
}

export function formAct(spec: FormSpec, state: FormState, action: FormAction, validate: Validate): FormResult {
	if (action.k === 'reset') return { state: initialState(spec) };
	if (action.k === 'change') {
		const values = { ...state.values, [action.field]: action.value };
		if (spec.library === 'tanstack-form') return { state: { ...state, values, errors: { ...state.errors, [action.field]: [] } } };
		if (!state.submitted) return { state: { ...state, values } };
		const found = issuesByField(spec, validate(formValues(spec, values)));
		return { state: { ...state, values, errors: { ...state.errors, [action.field]: shown(spec, found[action.field]) } } };
	}
	const found = issuesByField(spec, validate(formValues(spec, state.values)));
	const errors = Object.fromEntries(spec.fields.map((f) => [f.name, shown(spec, found[f.name])]));
	const first = spec.fields.find((f) => errors[f.name]!.length);
	const next: FormState = { ...state, errors, submitted: true };
	if (first) return { state: next, ...(spec.library === 'tanstack-form' ? {} : { focus: first.name }) };
	return { state: next, submit: formValues(spec, state.values) };
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

function commit(region: Element, l: Live): void {
	const e: Record<string, string[]> = {};
	const v: Record<string, Json> = {};
	for (const f of l.spec.fields) {
		e[f.name] = [...(l.state.errors[f.name] ?? [])];
		v[f.name] = l.state.values[f.name] ?? null;
	}
	region.dispatchEvent(new CustomEvent('mmform', { detail: { e, v } }));
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
		if (result.focus) (region.querySelector<HTMLElement>(`[data-mm-fl-focus="${CSS.escape(result.focus)}"]`) ?? null)?.focus();
		if (result.submit !== undefined) region.dispatchEvent(new CustomEvent('mmformsubmit', { detail: result.submit, bubbles: true }));
	});
	return true;
}
