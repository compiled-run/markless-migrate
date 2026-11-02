// Radix Form (@radix-ui/react-form 0.1.8, radix-ui 1.4.3) as its FormControl and FormMessage run: a control is
// validated on its invalid event and native change and reset on input and form reset. What that shows is the form's
// Markless state (convert's RadixFormPlan): each message while its match holds, the fields' flags, the descriptions.

type Validity = Readonly<Record<string, boolean>>;
type Matcher = (value: string, formData: FormData) => boolean | Promise<boolean>;

/** A Form.Message that renders on a match: a built-in ValidityState key, or the index of a custom matcher. */
export interface RadixFormMessage {
	readonly field: string;
	readonly id: string;
	readonly match?: string;
	readonly matcher?: number;
}

export interface RadixFormEntry {
	readonly fields: readonly string[];
	readonly messages: readonly RadixFormMessage[];
	/** Each control's aria-describedby at load: the ids of the messages that render without a match. */
	readonly described: Readonly<Record<string, string>>;
	readonly matchers?: () => Promise<readonly Matcher[]>;
}

/** What the form shows: the messages shown by index, and by field its control's description and its valid/invalid flags. */
export interface RadixFormView {
	readonly s: Readonly<Record<number, true>>;
	readonly d: Readonly<Record<string, string>>;
	readonly v: Readonly<Record<string, 'true'>>;
	readonly i: Readonly<Record<string, 'true'>>;
}

export const initialView = (described: Readonly<Record<string, string>>): RadixFormView => ({ s: {}, d: { ...described }, v: {}, i: {} });

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

interface Live {
	readonly entry: RadixFormEntry;
	readonly validity: Record<string, Validity | undefined>;
	/** Each custom matcher's last result, by field and matcher index. */
	readonly custom: Record<string, Record<number, boolean>>;
	/** Each field's message ids in the order they mounted, as Radix's set of message ids per field keeps them. */
	readonly order: Record<string, string[]>;
	shown: ReadonlySet<number>;
	matchers?: readonly Matcher[];
}

const FORM = 'data-mm-rf';

let registry: Promise<Readonly<Record<string, RadixFormEntry>>> | undefined;
const entries = () => (registry ??= import('../radix-forms.ts').then((m) => m.FORMS as Readonly<Record<string, RadixFormEntry>>));

const hasBuiltInError = (validity: Validity) => Object.entries(validity).some(([key, on]) => key !== 'valid' && key !== 'customError' && on);

function validityObject(validity: ValidityState): Validity {
	const out: Record<string, boolean> = {};
	for (const key in validity) out[key] = validity[key as keyof ValidityState] as boolean;
	return out;
}

const isInvalid = (el: Element) => 'validity' in el && ((el as HTMLInputElement).validity.valid === false || el.getAttribute('aria-invalid') === 'true');

function matches(live: Live, m: RadixFormMessage): boolean {
	const validity = live.validity[m.field];
	if (m.match !== undefined) return validity?.[m.match] === true;
	return !!validity && !hasBuiltInError(validity) && live.custom[m.field]?.[m.matcher ?? -1] === true;
}

/** Hands the form's state what React renders from its validity. */
function render(form: HTMLFormElement, live: Live): void {
	const shown = new Set<number>();
	live.entry.messages.forEach((m, k) => matches(live, m) && shown.add(k));
	live.entry.messages.forEach((m, k) => {
		if (live.shown.has(k) && !shown.has(k)) live.order[m.field] = (live.order[m.field] ?? []).filter((id) => id !== m.id);
	});
	live.entry.messages.forEach((m, k) => {
		if (!live.shown.has(k) && shown.has(k)) live.order[m.field] = [...(live.order[m.field] ?? []), m.id];
	});
	live.shown = shown;
	const s: Record<number, true> = {};
	for (const k of shown) s[k] = true;
	const d: Record<string, string> = {};
	const v: Record<string, 'true'> = {};
	const i: Record<string, 'true'> = {};
	for (const field of live.entry.fields) {
		const ids = live.order[field] ?? [];
		if (ids.length) d[field] = ids.join(' ');
		const validity = live.validity[field];
		if (validity?.valid === true) v[field] = 'true';
		if (validity?.valid === false) i[field] = 'true';
	}
	form.dispatchEvent(new CustomEvent<RadixFormView>('mmradixform', { detail: { s, d, v, i } }));
}

/** FormControl's updateControlValidity: the built-in validity, else the sync matchers, else the async ones once they settle. */
async function update(form: HTMLFormElement, live: Live, control: HTMLInputElement): Promise<void> {
	const name = control.name;
	if (hasBuiltInError(validityObject(control.validity))) {
		live.validity[name] = { ...live.validity[name], ...validityObject(control.validity) };
		render(form, live);
		return;
	}
	const args: [string, FormData] = [control.value, control.form ? new FormData(control.form) : new FormData()];
	const entries = live.entry.messages.flatMap((m) => (m.field === name && m.matcher !== undefined && typeof live.matchers?.[m.matcher] === 'function' ? [{ id: m.matcher, match: live.matchers[m.matcher]! }] : []));
	const sync: { id: number; match: Matcher }[] = [];
	const async: { id: number; match: Matcher }[] = [];
	for (const entry of entries) {
		if (entry.match.constructor.name === 'AsyncFunction' || entry.match(...args) instanceof Promise) async.push(entry);
		else if (entry.match.constructor.name === 'Function') sync.push(entry);
	}
	const syncErrors = Object.fromEntries(sync.map(({ id, match }) => [id, match(...args) as boolean]));
	const hasSyncErrors = Object.values(syncErrors).some(Boolean);
	control.setCustomValidity(hasSyncErrors ? DEFAULT_INVALID_MESSAGE : '');
	live.validity[name] = { ...live.validity[name], ...validityObject(control.validity) };
	live.custom[name] = { ...live.custom[name], ...syncErrors };
	render(form, live);
	if (hasSyncErrors || !async.length) return;
	const asyncErrors = Object.fromEntries(await Promise.all(async.map(({ id, match }) => Promise.resolve(match(...args)).then((m) => [id, m] as const))));
	const hasAsyncErrors = Object.values(asyncErrors).some(Boolean);
	control.setCustomValidity(hasAsyncErrors ? DEFAULT_INVALID_MESSAGE : '');
	live.validity[name] = { ...live.validity[name], ...validityObject(control.validity) };
	live.custom[name] = { ...live.custom[name], ...asyncErrors };
	render(form, live);
}

function reset(form: HTMLFormElement, live: Live, control: HTMLInputElement): void {
	control.setCustomValidity('');
	live.validity[control.name] = undefined;
	live.custom[control.name] = {};
	render(form, live);
}

const controlOf = (form: HTMLFormElement, target: EventTarget | null): HTMLInputElement | undefined => (target instanceof HTMLElement && target.hasAttribute('data-mm-rf-control') && (target as HTMLInputElement).form === form ? (target as HTMLInputElement) : undefined);

const started = new WeakSet<Element>();

/** Starts a converted Radix Form: its controls' validity is kept as Radix keeps it from here on. */
export function mount(el: Element): void {
	if (!(el instanceof HTMLFormElement) || !el.hasAttribute(FORM) || started.has(el)) return;
	started.add(el);
	const form = el;
	const ready = entries().then((all) => {
		const entry = all[form.getAttribute(FORM) ?? ''];
		if (!entry) return undefined;
		const order: Record<string, string[]> = {};
		for (const [field, ids] of Object.entries(entry.described)) order[field] = ids.split(/\s+/).filter(Boolean);
		const live: Live = { entry, validity: {}, custom: {}, order, shown: new Set() };
		void entry.matchers?.().then((m) => (live.matchers = m));
		return live;
	});
	const when = (run: (live: Live) => void) => void ready.then((live) => live && run(live));
	// Form's onInvalid runs after the control's, for every control of the form: it focuses the first invalid one.
	form.addEventListener(
		'invalid',
		(event) => {
			const control = controlOf(form, event.target);
			if (control) when((live) => void update(form, live, control));
			const first = [...form.elements].filter((e): e is HTMLElement => e instanceof HTMLElement).find(isInvalid);
			if (first && first === event.target) first.focus();
			event.preventDefault();
		},
		true,
	);
	form.addEventListener('change', (event) => {
		const control = controlOf(form, event.target);
		if (control) when((live) => void update(form, live, control));
	});
	form.addEventListener('input', (event) => {
		const control = controlOf(form, event.target);
		if (control) when((live) => reset(form, live, control));
	});
	form.addEventListener('reset', () =>
		when((live) => {
			for (const control of form.querySelectorAll<HTMLInputElement>('[data-mm-rf-control]')) reset(form, live, control);
		}),
	);
}
