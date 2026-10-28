import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseFragment } from 'parse5';
import { attr, body, parseDocument, walk, type Element } from '../src/convert/dom.ts';
import { FormPlan, MESSAGES, TYPED, type CapturedForm, type FormLibrary } from '../src/convert/form-libraries.ts';
import { matchSource, sourceForms } from '../src/convert/form-schemas.ts';
import { emitChildren, emitElement } from '../src/convert/tsrx.ts';

// A form demo's region as the old page showed it, built from one description so the states differ only where the
// field's errors and value reach: shadcn's Field around an input, a textarea with a character count, and a FieldError
// the field renders while it is invalid (a list where the library gives several messages).
interface Shape {
	readonly title?: readonly string[];
	readonly about?: readonly string[];
	readonly typed?: string;
}
const fieldError = (errors: readonly string[] | undefined) =>
	!errors?.length ? '' : `<div role="alert" data-slot="field-error" class="text-destructive">${errors.length === 1 ? errors[0] : `<ul class="list-disc">${errors.map((e) => `<li>${e}</li>`).join('')}</ul>`}</div>`;
function region(s: Shape): string {
	const invalid = (e: readonly string[] | undefined) => String(Boolean(e?.length));
	return `<div data-slot="card"><div data-slot="card-title">Bug Report</div><form id="bug"><div role="group" data-slot="field" data-invalid="${invalid(s.title)}"><label data-slot="field-label" for="t">Bug Title</label><input data-slot="input" id="t" aria-invalid="${invalid(s.title)}" name="title" value="">${fieldError(s.title)}</div><div role="group" data-slot="field" data-invalid="${invalid(s.about)}"><label data-slot="field-label" for="a">About</label><textarea data-slot="textarea" id="a" aria-invalid="${invalid(s.about)}" name="about"></textarea><span data-slot="counter">${(s.typed ?? '').length}/100 characters</span>${fieldError(s.about)}</div></form><button type="button" data-slot="button">Reset</button><button type="submit" form="bug" data-slot="button">Submit</button></div>`;
}

const SOURCE = `"use client"
import { zodResolver } from "@hookform/resolvers/zod"
import { Controller, useForm } from "react-hook-form"
import * as z from "zod"
import { Input } from "@/registry/new-york-v4/ui/input"

const MAX = 100
const formSchema = z.object({
  title: z.string().min(5, "Bug title must be at least 5 characters."),
  about: z.string().max(MAX, "Too long."),
})

export default function BugReportForm() {
  const form = useForm({ resolver: zodResolver(formSchema), defaultValues: { title: "", about: "" } })
  return <form id="bug"><label>Bug Title</label><Input /></form>
}
`;

function capture(library: FormLibrary): CapturedForm {
	const snaps: CapturedForm['snapshots'][number][] = [{ name: 'initial', html: region({}) }];
	for (const field of ['title', 'about'] as const)
		// react-hook-form's setError keeps one message of the two it is given.
		for (const errors of [MESSAGES.slice(0, 1), MESSAGES.slice(0, 2)]) snaps.push({ name: 'error', field, errors, html: region({ [field]: library === 'react-hook-form' ? errors.slice(0, 1) : errors }) });
	for (const value of TYPED) {
		snaps.push({ name: 'value', field: 'title', value, html: region({}) });
		snaps.push({ name: 'value', field: 'about', value, html: region({ typed: value }) });
	}
	return {
		sig: 'form||',
		nth: 0,
		library,
		region: { sig: 'card', nth: 0 },
		options: {},
		fields: ['title', 'about'],
		defaults: { title: '', about: '' },
		controls: [
			{ sig: 'input', nth: 0, field: 'title', kind: 'text', ...(library === 'tanstack-form' ? { blurs: true } : {}) },
			{ sig: 'textarea', nth: 0, field: 'about', kind: 'text' },
		],
		submits: [{ sig: 'submit', nth: 0 }],
		resets: [{ sig: 'reset', nth: 0 }],
		focus: { title: { sig: 'input', nth: 0 } },
		snapshots: snaps,
	};
}

function convert(library: FormLibrary) {
	const form = capture(library);
	const root = body(parseDocument(`<body>${region({})}</body>`));
	const els = [...walk(root)];
	const located: Record<string, Element | undefined> = {
		card: els.find((el) => attr(el, 'data-slot') === 'card'),
		input: els.find((el) => el.tagName === 'input'),
		textarea: els.find((el) => el.tagName === 'textarea'),
		reset: els.find((el) => el.tagName === 'button' && attr(el, 'type') === 'button'),
		submit: els.find((el) => attr(el, 'type') === 'submit'),
	};
	const source = sourceForms('registry/new-york-v4/examples/form-rhf-demo.tsx', library === 'react-hook-form' ? SOURCE : SOURCE.replace('react-hook-form', library === 'tanstack-form' ? '@tanstack/react-form' : '@formisch/react').replace('{ resolver: zodResolver(formSchema),', library === 'tanstack-form' ? '{ validators: { onSubmit: formSchema },' : '{ schema: formSchema,'));
	const plan = new FormPlan({ forms: source, version: (name) => (name === 'zod' ? '^3.25.76' : undefined) });
	const placed = plan.add('/forms', [form], (sig, nth) => (nth === 0 ? located[sig] : undefined), (html) => emitChildren(parseFragment(html) as unknown as Element));
	const declarations: string[] = [];
	const out = emitElement(root, { declarations, bind: (el) => plan.bind(el) });
	return { plan, placed, out, declarations };
}

test('a field\'s errors are state its region takes from the form part, and every attribute an error changed follows whether it has one', () => {
	const { placed, out, plan, declarations } = convert('react-hook-form');
	assert.equal(placed, 1, plan.notes.join('\n'));
	assert.deepEqual([...new Set(declarations)], ['let fl0e0 = state([] as string[]);', 'let fl0m0 = state("");', 'let fl0e1 = state([] as string[]);', 'let fl0m1 = state("");', 'let fl0v1 = state("");']);
	assert.match(out, /<div data-slot="card" data-mm-fl="fl_[0-9a-f]{10}" onMmform=\{\(event\) => \{ const d = .*fl0e0 = d\.e\["title"\] \?\? \[\]; fl0m0 = fl0e0\[0\] \?\? ""; fl0e1 = d\.e\["about"\] \?\? \[\]; fl0m1 = fl0e1\[0\] \?\? ""; fl0v1 = String\(d\.v\["about"\] \?\? ""\); \}\}>/);
	assert.match(out, /<div role="group" data-slot="field" data-invalid=\{fl0e0\.length \? "true" : "false"\}>/);
	assert.match(out, /<input data-slot="input" id="t" name="title" value="" aria-invalid=\{fl0e0\.length \? "true" : "false"\} data-mm-fl-field="title" data-mm-fl-kind="text" data-mm-fl-focus="title" \/>/);
	// react-hook-form shows one message: the FieldError holds the field's first error.
	assert.match(out, /@if \(fl0e0\.length\) \{ <div role="alert" data-slot="field-error" class="text-destructive">\{fl0m0\}<\/div> \}<\/div>/);
	assert.match(out, /<span data-slot="counter">\{fl0v1\.length\}\{"\/100 characters"\}<\/span>/);
	assert.match(out, /<button type="button" data-slot="button" data-mm-fl-reset="">Reset<\/button>/);
});

test('where the library shows several messages, one message is the FieldError\'s text and several are its list, an item per message', () => {
	for (const library of ['tanstack-form', 'formisch'] as const) {
		const { placed, out, plan } = convert(library);
		assert.equal(placed, 1, plan.notes.join('\n'));
		assert.equal(/data-mm-fl-kind="text" data-mm-fl-blur=""/.test(out), library === 'tanstack-form', 'a field whose blur the old page handled says so');
		assert.match(out, /@if \(fl0e0\.length === 1\) \{ <div role="alert" data-slot="field-error" class="text-destructive">\{fl0m0\}<\/div> \}@if \(fl0e0\.length > 1\) \{ <div role="alert" data-slot="field-error" class="text-destructive"><ul class="list-disc">@for \(const m of fl0e0; key m\) \{ <li>\{m\}<\/li> \}<\/ul><\/div> \}/);
	}
});

test('the form\'s spec and its schema module: the old source\'s schema and what it reads, copied unchanged', () => {
	const { plan } = convert('react-hook-form');
	const files = plan.files();
	const schema = [...files].find(([name]) => name.startsWith('form-schemas/'))![1];
	assert.match(schema, /import \* as z from "zod";\n\nconst MAX = 100\n\nconst formSchema = z\.object\(\{[\s\S]*about: z\.string\(\)\.max\(MAX, "Too long\."\),\n\}\)\n\nexport const schema = formSchema;\n$/);
	assert.doesNotMatch(schema, /Input|BugReportForm|hookform/);
	const forms = files.get('form-libraries.ts')!;
	assert.match(forms, /"fl_[0-9a-f]{10}": \{ \.\.\.\{"library":"react-hook-form","fields":\[\{"name":"title","path":\["title"\]\},\{"name":"about","path":\["about"\]\}\],"defaults":\{"title":"","about":""\}\}, schema: \(\) => import\('\.\/form-schemas\/fs_[0-9a-f]{10}\.ts'\)\.then\(\(m\) => m\.schema\) \}/);
	assert.deepEqual([...plan.packages], [['zod', '^3.25.76']]);
});

test('the region\'s form is told by the text it shows among the old source\'s forms', () => {
	const a = sourceForms('a.tsx', SOURCE);
	const b = sourceForms('b.tsx', SOURCE.replace('Bug Title', 'Profile Name').replace('Bug title must', 'Name must'));
	assert.equal(matchSource('Bug Report Bug Title', [...a, ...b])?.file, 'a.tsx');
	assert.equal(matchSource('Profile Name', [...a, ...b])?.file, 'b.tsx');
});

test('the region renders and compiles with its form bindings', async () => {
	const { compileTsrxModule, collectTsrxModuleDiagnostics } = await import('@markless/compiler');
	for (const library of ['react-hook-form', 'tanstack-form'] as const) {
		const { out, declarations } = convert(library);
		const source = `import { state } from '@markless/core';\nexport default function Page() @{\n\t${[...new Set(declarations)].join('\n\t')}\n\t${out.replace(/^<body>|<\/body>$/g, '')}\n}\n`;
		const result = await compileTsrxModule({ filename: 'pages/t.tsrx', source, symbols: [] });
		assert.deepEqual(collectTsrxModuleDiagnostics(result).filter((d) => d.severity === 'error').map((d) => `${d.code}: ${d.message}`), []);
	}
});

test('a form with a field per row of a list a visitor adds to (emails.0.address) is left out, with why', () => {
	const form = capture('react-hook-form');
	const plan = new FormPlan({ forms: sourceForms('a.tsx', SOURCE), version: () => undefined });
	const root = body(parseDocument(`<body>${region({})}</body>`));
	const card = [...walk(root)].find((el) => attr(el, 'data-slot') === 'card');
	assert.equal(plan.add('/forms', [{ ...form, fields: ['emails.0.address', 'emails.1.address'] }], () => card, (html) => html), 0);
	assert.match(plan.notes.join('\n'), /list a visitor adds to and removes from/);
});

// shadcn's array demo: a row per email, its Remove shown while there are others, a FieldError under an invalid row, and
// Add disabled at five rows.
const listRow = (i: number, n: number, errors: readonly string[] = []) =>
	`<div role="group" data-slot="field" data-invalid="${errors.length > 0}"><div data-slot="input-group"><input data-slot="input-group-control" id="email-${i}" name="emails.${i}.address" aria-invalid="${errors.length > 0}" value="">${n > 1 ? `<div data-slot="input-group-addon"><button type="button" data-slot="input-group-button" aria-label="Remove email ${i + 1}">x</button></div>` : ''}</div>${fieldError(errors)}</div>`;
const listRegion = (n: number, errorsOf: (i: number) => readonly string[] = () => []) => `<div data-slot="card"><div data-slot="card-title">Contact Emails</div><form id="list"><div data-slot="field-group">${Array.from({ length: n }, (_, i) => listRow(i, n, errorsOf(i))).join('')}<button type="button" data-slot="button"${n >= 5 ? ' disabled=""' : ''}>Add Email Address</button></div></form><button type="submit" form="list" data-slot="button">Save</button></div>`;

test('a list\'s rows are one keyed @for from the first row, each place the rows differ reading its index; a row\'s error, its Remove and Add\'s limit follow the rows', async () => {
	const form: CapturedForm = {
		sig: 'form||',
		nth: 0,
		library: 'formisch',
		region: { sig: 'card', nth: 0 },
		options: {},
		fields: ['emails.0.address', 'emails.1.address'],
		defaults: { emails: [{ address: '' }, { address: '' }] },
		controls: [
			{ sig: 'input', nth: 0, field: 'emails.0.address', kind: 'text' },
			{ sig: 'input', nth: 1, field: 'emails.1.address', kind: 'text' },
		],
		submits: [{ sig: 'submit', nth: 0 }],
		resets: [],
		focus: {},
		list: { path: ['emails'], append: { sig: 'button|button|Add Email Address', nth: 0 }, item: { address: '' }, max: 5, focusAppended: false },
		snapshots: [
			{ name: 'initial', html: listRegion(2) },
			{ name: 'error', field: 'emails.0.address', errors: MESSAGES.slice(0, 1), html: listRegion(2, (i) => (i === 0 ? MESSAGES.slice(0, 1) : [])) },
			{ name: 'error', field: 'emails.0.address', errors: MESSAGES.slice(0, 2), html: listRegion(2, (i) => (i === 0 ? MESSAGES.slice(0, 2) : [])) },
			{ name: 'rows', value: '1', html: listRegion(1) },
			{ name: 'rows', value: '5', html: listRegion(5) },
		],
	};
	const root = body(parseDocument(`<body>${listRegion(2)}</body>`));
	const els = [...walk(root)];
	const inputs = els.filter((el) => el.tagName === 'input');
	const located = (sig: string, nth: number): Element | undefined => (sig === 'card' ? els.find((el) => attr(el, 'data-slot') === 'card') : sig === 'input' ? inputs[nth] : sig === 'button|button|Add Email Address' ? els.find((el) => attr(el, 'data-slot') === 'button' && attr(el, 'type') === 'button') : undefined);
	const source = sourceForms('form-formisch-array.tsx', SOURCE.replace('react-hook-form', '@formisch/react').replace('{ resolver: zodResolver(formSchema),', '{ schema: formSchema,').replace('Bug Title', 'Contact Emails'));
	const plan = new FormPlan({ forms: source, version: () => undefined });
	assert.equal(plan.add('/forms', [form], located, (html) => emitChildren(parseFragment(html) as unknown as Element)), 1, plan.notes.join('\n'));
	const declarations: string[] = [];
	const out = emitElement(root, { declarations, bind: (el) => plan.bind(el) });
	assert.match(out, /<div data-slot="field-group">@for \(const r of fl0r; key r\.k\) \{ <div role="group" data-slot="field" data-invalid=\{r\.e0\.length \? "true" : "false"\} data-mm-fl-row=\{r\.i\}>/);
	assert.match(out, /<input data-slot="input-group-control" id=\{"email-" \+ r\.i\} name=\{"emails\." \+ r\.i \+ "\.address"\} value="" data-mm-fl-field=\{"emails\." \+ r\.i \+ "\.address"\} data-mm-fl-kind="text" aria-invalid=\{r\.e0\.length \? "true" : "false"\} \/>/);
	assert.match(out, /<div data-slot="input-group-addon" hidden=\{fl0r\.length < 2\}><button type="button" data-slot="input-group-button" aria-label=\{"Remove email " \+ \(r\.i \+ 1\)\} data-mm-fl-remove="emails">x<\/button><\/div>/);
	assert.match(out, /<div role="alert" data-slot="field-error" class="text-destructive" hidden=\{r\.e0\.length !== 1\}>\{r\.m0\}<\/div><div role="alert" data-slot="field-error" class="text-destructive" hidden=\{r\.e0\.length < 2\}><ul class="list-disc">@for \(const m of r\.e0; key m\) \{ <li>\{m\}<\/li> \}<\/ul><\/div><\/div> \}<button type="button" data-slot="button" data-mm-fl-append="emails" disabled=\{fl0r\.length >= 5\}>Add Email Address<\/button>/);
	assert.equal((out.match(/name=\{"emails\./g) ?? []).length, 1, 'the second row is the first one\'s copy');
	assert.deepEqual([...new Set(declarations)], ['let fl0r = state([{"k":0,"i":0,"e0":[],"m0":""},{"k":1,"i":1,"e0":[],"m0":""}] as { k: number; i: number; e0: string[]; m0: string }[]);']);
	assert.match(plan.files().get('form-libraries.ts')!, /"lists":\[\{"name":"emails","path":\["emails"\],"subs":\[\{"name":"address","path":\["address"\],"item":""\}\],"rows":2\}\],"defaults":\{"emails\.0\.address":"","emails\.1\.address":""\}/);
	const { compileTsrxModule, collectTsrxModuleDiagnostics } = await import('@markless/compiler');
	const result = await compileTsrxModule({ filename: 'pages/t.tsrx', source: `import { state } from '@markless/core';\nexport default function Page() @{\n\t${[...new Set(declarations)].join('\n\t')}\n\t${out.replace(/^<body>|<\/body>$/g, '')}\n}\n`, symbols: [] });
	assert.deepEqual(collectTsrxModuleDiagnostics(result).filter((d) => d.severity === 'error').map((d) => `${d.code}: ${d.message}`), []);
});
