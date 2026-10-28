import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as z from 'zod';
import { formAct, formValues, initialState, issuesByField, type FormAction, type FormLibrary, type FormSpec, type FormState, type Issue, type Validate } from '../parts/form-library.ts';

// shadcn's form demos, with the schemas their pages validate with; each sequence and what each field showed after every
// step is what the old page showed for the same steps, read from its form library.
const bugReport = z.object({
	title: z.string().min(5, 'Bug title must be at least 5 characters.').max(32, 'Bug title must be at most 32 characters.'),
	description: z.string().min(20, 'Description must be at least 20 characters.').max(100, 'Description must be at most 100 characters.'),
});
const profile = z.object({
	username: z
		.string()
		.min(3, 'Username must be at least 3 characters.')
		.max(10, 'Username must be at most 10 characters.')
		.regex(/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores.'),
});
const validator = (schema: z.ZodType): Validate => (values) => ((schema as unknown as { '~standard': { validate: (v: unknown) => { issues?: Issue[] } } })['~standard'].validate(values).issues ?? []);

const spec = (library: FormLibrary, names: readonly string[]): FormSpec => ({ library, fields: names.map((name) => ({ name, path: [name] })), defaults: Object.fromEntries(names.map((n) => [n, ''])) });

type Step = readonly [FormAction, string];
function run(s: FormSpec, schema: z.ZodType, steps: readonly Step[]): void {
	let state: FormState = initialState(s);
	for (const [action, expected] of steps) {
		const result = formAct(s, state, action, validator(schema));
		state = result.state;
		const shown = s.fields.map((f) => (state.errors[f.name] ?? []).join('+')).join(' | ');
		assert.equal(`${shown}${result.focus ? ` focus=${result.focus}` : ''}${result.submit ? ` submit=${JSON.stringify(result.submit)}` : ''}`, expected, JSON.stringify(action));
	}
}

const change = (field: string, value: string): FormAction => ({ k: 'change', field, value });
const SUBMIT: FormAction = { k: 'submit' };
const BOTH = 'Bug title must be at least 5 characters. | Description must be at least 20 characters.';

test('react-hook-form and Formisch: nothing before a submit, then every change validates its field; a failed submit focuses its first invalid field', () => {
	for (const library of ['react-hook-form', 'formisch'] as const) {
		run(spec(library, ['title', 'description']), bugReport, [
			[change('title', 'ab'), ' | '],
			[change('description', 'x'), ' | '],
			[SUBMIT, `${BOTH} focus=title`],
			[change('title', 'abcde'), ' | Description must be at least 20 characters.'],
			[change('title', 'abcd'), BOTH],
			[change('description', 'x123456789012345678901'), 'Bug title must be at least 5 characters. | '],
			[SUBMIT, 'Bug title must be at least 5 characters. |  focus=title'],
			[change('title', 'abcde'), ' | '],
			[SUBMIT, ' |  submit={"title":"abcde","description":"x123456789012345678901"}'],
			[{ k: 'reset' }, ' | '],
			[change('title', 'ab'), ' | '],
			[SUBMIT, `${BOTH} focus=title`],
		]);
	}
});

test('TanStack Form: a submit shows every field\'s errors and focuses nothing; a change takes its field\'s submit errors away until the next submit', () => {
	run(spec('tanstack-form', ['title', 'description']), bugReport, [
		[change('title', 'ab'), ' | '],
		[SUBMIT, BOTH],
		[change('title', 'abcde'), ' | Description must be at least 20 characters.'],
		[change('title', 'abcd'), ' | Description must be at least 20 characters.'],
		[change('description', 'x123456789012345678901'), ' | '],
		[SUBMIT, 'Bug title must be at least 5 characters. | '],
		[change('title', 'abcde'), ' | '],
		[SUBMIT, ' |  submit={"title":"abcde","description":"x123456789012345678901"}'],
		[{ k: 'reset' }, ' | '],
		[SUBMIT, BOTH],
	]);
});

test('a field failing two checks: react-hook-form shows the first message, TanStack Form and Formisch every message', () => {
	const steps = (library: FormLibrary) => (library === 'react-hook-form' ? 'Username must be at least 3 characters.' : 'Username must be at least 3 characters.+Username can only contain letters, numbers, and underscores.');
	for (const library of ['react-hook-form', 'tanstack-form', 'formisch'] as const) {
		const s = spec(library, ['username']);
		run(s, profile, [
			[change('username', 'a!'), ''],
			[SUBMIT, `${steps(library)}${library === 'tanstack-form' ? '' : ' focus=username'}`],
			[change('username', 'a!b'), library === 'tanstack-form' ? '' : 'Username can only contain letters, numbers, and underscores.'],
			[change('username', 'ab'), library === 'tanstack-form' ? '' : 'Username must be at least 3 characters.'],
			[change('username', 'abc'), ''],
		]);
	}
});

test('a field\'s value sits at its path in the values the schema validates, and an issue names the field by that path', () => {
	const s: FormSpec = { library: 'react-hook-form', fields: [{ name: 'emails.0.address', path: ['emails', 0, 'address'] }, { name: 'emails.1.address', path: ['emails', 1, 'address'] }], defaults: { 'emails.0.address': '', 'emails.1.address': 'b@c.de' } };
	assert.deepEqual(formValues(s, s.defaults), { emails: [{ address: '' }, { address: 'b@c.de' }] });
	assert.deepEqual(issuesByField(s, [{ message: 'Enter a valid email address.', path: ['emails', 0, { key: 'address' }] }]), { 'emails.0.address': ['Enter a valid email address.'] });
});

test('a control whose blur the old page handled (TanStack Form\'s handleBlur) takes its field\'s errors away when it loses focus', () => {
	const s = spec('tanstack-form', ['title', 'description']);
	let state = formAct(s, initialState(s), SUBMIT, validator(bugReport)).state;
	assert.deepEqual(state.errors.title, ['Bug title must be at least 5 characters.']);
	state = formAct(s, state, { k: 'blur', field: 'title' }, validator(bugReport)).state;
	assert.deepEqual(state.errors.title, []);
	assert.deepEqual(state.errors.description, ['Description must be at least 20 characters.']);
});

// shadcn's array demo: a list of email rows, each valid as an email; react-hook-form's zod schema and Formisch's valibot
// one give an empty row one message (react-hook-form) or two (Formisch: an address is required, and must be an email).
const contacts = z.object({ emails: z.array(z.object({ address: z.string().min(1, 'Enter an email address.').email('Enter a valid email address.') })).min(1).max(5) });
const listSpec = (library: FormLibrary): FormSpec => ({ library, fields: [], lists: [{ name: 'emails', path: ['emails'], subs: [{ name: 'address', path: ['address'], item: '' }], rows: 2, ...(library === 'react-hook-form' ? { focusAppended: true } : {}) }], defaults: { 'emails.0.address': '', 'emails.1.address': '' } });

function runList(s: FormSpec, steps: readonly (readonly [FormAction, string])[]): void {
	let state = initialState(s);
	for (const [action, expected] of steps) {
		const result = formAct(s, state, action, validator(contacts));
		state = result.state;
		const rows = (state.rows?.emails ?? []).map((_, i) => `${state.values[`emails.${i}.address`] || '_'}:${(state.errors[`emails.${i}.address`] ?? []).map((m) => (m.startsWith('Enter a valid') ? 'V' : 'E')).join('')}`).join(' ');
		assert.equal(`${rows}${result.focus ? ` focus=${result.focus}` : ''}`, expected, JSON.stringify(action));
	}
}

test('a list: rows added and taken out move their values and errors; Formisch validates again on each once submitted, react-hook-form focuses a row it adds', () => {
	const steps = (library: FormLibrary) => [
		[SUBMIT, `_:${library === 'formisch' ? 'EV' : 'E'} _:${library === 'formisch' ? 'EV' : 'E'} focus=emails.0.address`],
		[change('emails.0.address', 'a@b.co'), `a@b.co: _:${library === 'formisch' ? 'EV' : 'E'}`],
		[change('emails.1.address', 'x'), 'a@b.co: x:V'],
		[{ k: 'append', list: 'emails' }, library === 'formisch' ? 'a@b.co: x:V _:EV' : 'a@b.co: x:V _: focus=emails.2.address'],
		[{ k: 'remove', list: 'emails', row: 0 }, library === 'formisch' ? 'x:V _:EV' : 'x:V _:'],
		[{ k: 'remove', list: 'emails', row: 1 }, 'x:V'],
		[{ k: 'reset' }, '_: _:'],
	] as const;
	for (const library of ['react-hook-form', 'formisch'] as const) runList(listSpec(library), steps(library));
});
