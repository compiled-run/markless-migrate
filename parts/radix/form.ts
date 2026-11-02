// Radix Form (@radix-ui/react-form 0.1.8, radix-ui 1.4.3) as its FormControl and FormMessage run: a control is
// validated on its invalid event and native change and reset on input and form reset; each Form.Message convert left as
// a <template data-mm-rf-message> renders before its template while its match holds.

type Validity = Readonly<Record<string, boolean>>;
type Matcher = (value: string, formData: FormData) => boolean | Promise<boolean>;

interface FormState {
	readonly validity: Record<string, Validity | undefined>;
	/** Each custom matcher's last result, by field and matcher index. */
	readonly custom: Record<string, Record<string, boolean>>;
	matchers?: readonly Matcher[];
}

const FORM = 'data-mm-rf';
const MESSAGE = 'data-mm-rf-message';
export const DEFAULT_INVALID_MESSAGE = 'This value is not valid';
/** What a Form.Message with no children shows for each built-in match (DEFAULT_BUILT_IN_MESSAGES). */
export const BUILT_IN_MESSAGES: Readonly<Record<string, string | undefined>> = {
	badInput: DEFAULT_INVALID_MESSAGE,
	patternMismatch: 'This value does not match the required pattern',
	rangeOverflow: 'This value is too large',
	rangeUnderflow: 'This value is too small',
	stepMismatch: 'This value does not match the required step',
	tooLong: 'This value is too long',
	tooShort: 'This value is too short',
	typeMismatch: 'This value does not match the required type',
	valid: undefined,
	valueMissing: 'This value is missing',
};

const forms = new WeakMap<HTMLFormElement, FormState>();
const rendered = new WeakMap<HTMLTemplateElement, HTMLElement>();
let ids = 0;

let registry: Promise<Readonly<Record<string, () => Promise<readonly Matcher[]>>>> | undefined;
const matchersOf = (key: string): Promise<readonly Matcher[]> => (registry ??= import('../radix-forms.ts').then((m) => m.MATCHERS as Readonly<Record<string, () => Promise<readonly Matcher[]>>>)).then((all) => all[key]?.() ?? []);

const hasBuiltInError = (validity: Validity) => Object.entries(validity).some(([key, on]) => key !== 'valid' && key !== 'customError' && on);

function validityObject(validity: ValidityState): Validity {
	const out: Record<string, boolean> = {};
	for (const key in validity) out[key] = validity[key as keyof ValidityState] as boolean;
	return out;
}

const templatesOf = (form: HTMLFormElement) => [...form.querySelectorAll<HTMLTemplateElement>(`template[${MESSAGE}]`)];
const controlsOf = (form: HTMLFormElement, name: string) => [...form.querySelectorAll<HTMLInputElement>('[data-mm-rf-control]')].filter((c) => c.name === name);
const isInvalid = (el: Element) => 'validity' in el && ((el as HTMLInputElement).validity.valid === false || el.getAttribute('aria-invalid') === 'true');

function matches(state: FormState, template: HTMLTemplateElement): boolean {
	if (template.hasAttribute('data-mm-rf-force')) return true;
	const name = template.getAttribute(MESSAGE) ?? '';
	const validity = state.validity[name];
	const builtIn = template.getAttribute('data-mm-rf-match');
	if (builtIn) return validity?.[builtIn] === true;
	const matcher = template.getAttribute('data-mm-rf-matcher') ?? '';
	return !!validity && !hasBuiltInError(validity) && state.custom[name]?.[matcher] === true;
}

const setFlag = (el: Element, name: string, on: boolean) => (on ? el.setAttribute(name, 'true') : el.removeAttribute(name));

/** What React renders from the form's validity: each message shown or not, each field's flags and its control's description. */
function render(form: HTMLFormElement, state: FormState): void {
	const removed = new Map<string, Set<string>>();
	const added = new Map<string, string[]>();
	for (const template of templatesOf(form)) {
		const name = template.getAttribute(MESSAGE) ?? '';
		const shown = rendered.get(template);
		const on = matches(state, template);
		if (on && !shown) {
			const el = template.content.firstElementChild?.cloneNode(true) as HTMLElement | undefined;
			if (!el) continue;
			if (!el.id) el.id = `radix-mm-${++ids}`;
			template.before(el);
			rendered.set(template, el);
			(added.get(name) ?? added.set(name, []).get(name)!).push(el.id);
		} else if (!on && shown) {
			shown.remove();
			rendered.delete(template);
			(removed.get(name) ?? removed.set(name, new Set()).get(name)!).add(shown.id);
		}
	}
	const names = new Set([...form.querySelectorAll('[data-mm-rf-field]')].map((f) => f.getAttribute('data-mm-rf-field')!));
	for (const t of templatesOf(form)) names.add(t.getAttribute(MESSAGE)!);
	for (const name of names) {
		const validity = state.validity[name];
		const targets = [...form.querySelectorAll(`[data-mm-rf-field="${CSS.escape(name)}"], [data-mm-rf-label="${CSS.escape(name)}"]`), ...controlsOf(form, name)];
		for (const el of targets) {
			setFlag(el, 'data-valid', validity?.valid === true);
			setFlag(el, 'data-invalid', validity?.valid === false);
		}
		// The ids in the order their messages mounted, as Radix's set of message ids per field keeps them.
		const gone = removed.get(name);
		const fresh = added.get(name) ?? [];
		if (!gone && !fresh.length) continue;
		for (const control of controlsOf(form, name)) {
			const kept = (control.getAttribute('aria-describedby') ?? '').split(/\s+/).filter((id) => id && !gone?.has(id));
			const all = [...kept, ...fresh.filter((id) => !kept.includes(id))];
			if (all.length) control.setAttribute('aria-describedby', all.join(' '));
			else control.removeAttribute('aria-describedby');
		}
	}
}

/** FormControl's updateControlValidity: the built-in validity, else the sync matchers, else the async ones once they settle. */
async function update(form: HTMLFormElement, state: FormState, control: HTMLInputElement): Promise<void> {
	const name = control.name;
	if (hasBuiltInError(validityObject(control.validity))) {
		state.validity[name] = { ...state.validity[name], ...validityObject(control.validity) };
		render(form, state);
		return;
	}
	const args: [string, FormData] = [control.value, control.form ? new FormData(control.form) : new FormData()];
	const entries = templatesOf(form)
		.filter((t) => t.getAttribute(MESSAGE) === name && t.hasAttribute('data-mm-rf-matcher'))
		.map((t) => ({ id: t.getAttribute('data-mm-rf-matcher')!, match: state.matchers?.[Number(t.getAttribute('data-mm-rf-matcher'))] }))
		.filter((e): e is { id: string; match: Matcher } => typeof e.match === 'function');
	const sync: { id: string; match: Matcher }[] = [];
	const async: { id: string; match: Matcher }[] = [];
	for (const entry of entries) {
		if (entry.match.constructor.name === 'AsyncFunction' || entry.match(...args) instanceof Promise) async.push(entry);
		else if (entry.match.constructor.name === 'Function') sync.push(entry);
	}
	const syncErrors = Object.fromEntries(sync.map(({ id, match }) => [id, match(...args) as boolean]));
	const hasSyncErrors = Object.values(syncErrors).some(Boolean);
	control.setCustomValidity(hasSyncErrors ? DEFAULT_INVALID_MESSAGE : '');
	state.validity[name] = { ...state.validity[name], ...validityObject(control.validity) };
	state.custom[name] = { ...state.custom[name], ...syncErrors };
	render(form, state);
	if (hasSyncErrors || !async.length) return;
	const asyncErrors = Object.fromEntries(await Promise.all(async.map(({ id, match }) => Promise.resolve(match(...args)).then((m) => [id, m] as const))));
	const hasAsyncErrors = Object.values(asyncErrors).some(Boolean);
	control.setCustomValidity(hasAsyncErrors ? DEFAULT_INVALID_MESSAGE : '');
	state.validity[name] = { ...state.validity[name], ...validityObject(control.validity) };
	state.custom[name] = { ...state.custom[name], ...asyncErrors };
	render(form, state);
}

function reset(form: HTMLFormElement, state: FormState, control: HTMLInputElement): void {
	control.setCustomValidity('');
	state.validity[control.name] = undefined;
	state.custom[control.name] = {};
	render(form, state);
}

const controlOf = (form: HTMLFormElement, target: EventTarget | null): HTMLInputElement | undefined => (target instanceof HTMLElement && target.hasAttribute('data-mm-rf-control') && (target as HTMLInputElement).form === form ? (target as HTMLInputElement) : undefined);

/** Starts a converted Radix Form: its controls' validity is kept as Radix keeps it from here on. */
export function mount(el: Element): void {
	if (!(el instanceof HTMLFormElement) || !el.hasAttribute(FORM) || forms.has(el)) return;
	const form = el;
	const state: FormState = { validity: {}, custom: {} };
	forms.set(form, state);
	const key = form.getAttribute(FORM);
	if (key) void matchersOf(key).then((m) => (state.matchers = m));
	// Form's onInvalid runs after the control's, for every control of the form: it focuses the first invalid one.
	form.addEventListener(
		'invalid',
		(event) => {
			const control = controlOf(form, event.target);
			if (control) void update(form, state, control);
			const first = [...form.elements].filter((e): e is HTMLElement => e instanceof HTMLElement).find(isInvalid);
			if (first && first === event.target) first.focus();
			event.preventDefault();
		},
		true,
	);
	form.addEventListener('change', (event) => {
		const control = controlOf(form, event.target);
		if (control) void update(form, state, control);
	});
	form.addEventListener('input', (event) => {
		const control = controlOf(form, event.target);
		if (control) reset(form, state, control);
	});
	form.addEventListener('reset', () => {
		for (const control of form.querySelectorAll<HTMLInputElement>('[data-mm-rf-control]')) reset(form, state, control);
	});
	render(form, state);
}
