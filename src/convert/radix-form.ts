import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { BUILT_IN_MESSAGES, DEFAULT_INVALID_MESSAGE } from '../../parts/radix/form.ts';
import { parseModule, walk as walkJs, type Module, type N } from '../source/js.ts';
import { attr, elementChildren, walk, type Element } from './dom.ts';
import { copiedModule } from './form-schemas.ts';
import { lit, mergeBindings, type Binding } from './tsrx.ts';

// Radix Form's messages render only while their match holds, so the old page at load has none of them: what each
// Form.Message shows, and where, is read from the source's Form.Field, and its custom matchers are the source's functions.

/** A child of a Form.Field as the source writes it, in order. */
export type FieldChild =
	| { readonly kind: 'label' | 'control' | 'element' }
	/** Rendered from page state (a `{cond ? <Form.Message/> : null}`): nothing at load, and nothing the port shows. */
	| { readonly kind: 'dynamic' }
	/** A Form.Message rendered on a built-in match (its ValidityState key) or a custom matcher (its index among the form's). */
	| { readonly kind: 'message'; readonly field: string; readonly match: string | number; readonly force: boolean; readonly html: string };

export interface SourceField {
	readonly name: string;
	readonly children: readonly FieldChild[];
}

export interface SourceRadixForm {
	readonly file: string;
	readonly fields: readonly SourceField[];
	/** The module exporting the form's custom matchers (`export const matchers = [...]`), when it has any. */
	readonly matchers?: string;
	readonly notes: readonly string[];
}

const FORM_PARTS = new Set(['Root', 'Field', 'Label', 'Control', 'Message', 'Submit', 'ValidityState']);
const NAMED: Readonly<Record<string, string>> = { Form: 'Root', FormField: 'Field', FormLabel: 'Label', FormControl: 'Control', FormMessage: 'Message', FormSubmit: 'Submit' };

/** Which Radix Form part a JSX element name renders, through the module's imports of radix-ui or @radix-ui/react-form. */
function partOf(mod: Module, name: N): string | undefined {
	if (name.type === 'JSXMemberExpression' && name.object.type === 'JSXIdentifier') {
		const imp = mod.imports.get(name.object.name);
		const ns = (imp?.source === 'radix-ui' && imp.imported === 'Form') || (imp?.source === '@radix-ui/react-form' && imp.imported === '*');
		return ns && FORM_PARTS.has(name.property.name) ? name.property.name : undefined;
	}
	if (name.type !== 'JSXIdentifier') return undefined;
	const imp = mod.imports.get(name.name);
	if (imp?.source !== '@radix-ui/react-form') return undefined;
	return FORM_PARTS.has(imp.imported) ? imp.imported : NAMED[imp.imported];
}

const attrOf = (el: N, name: string): N | undefined => (el.openingElement.attributes as N[]).find((a) => a.type === 'JSXAttribute' && a.name.type === 'JSXIdentifier' && a.name.name === name);

/** An attribute's value when it is a string literal (`a="x"` or `a={"x"}`). */
function stringOf(a: N | undefined): string | undefined {
	const v = a?.value;
	if (v?.type === 'Literal' && typeof v.value === 'string') return v.value;
	if (v?.type === 'JSXExpressionContainer' && v.expression.type === 'Literal' && typeof v.expression.value === 'string') return v.expression.value;
	return undefined;
}

/** A boolean attribute's literal value: written bare or as `{true}`/`{false}`; undefined when it is an expression. */
function boolOf(a: N): boolean | undefined {
	if (!a.value) return true;
	const e = a.value.type === 'JSXExpressionContainer' ? a.value.expression : undefined;
	return e?.type === 'Literal' && typeof e.value === 'boolean' ? e.value : undefined;
}

/** JSX text as React renders it: each line trimmed where it meets another, blank lines dropped, lines joined by a space. */
function jsxText(raw: string): string {
	const lines = raw.split(/\r\n|\n|\r/);
	const out: string[] = [];
	lines.forEach((line, i) => {
		let t = line.replace(/\t/g, ' ');
		if (i > 0) t = t.replace(/^ +/, '');
		if (i < lines.length - 1) t = t.replace(/ +$/, '');
		if (t) out.push(t);
	});
	return out.join(' ');
}

const escapeText = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escapeAttr = (t: string) => t.replace(/&/g, '&amp;').replace(/"/g, '&quot;');

const isBlank = (c: N) => c.type === 'JSXText' && !jsxText(c.value).trim();
const isEmptyExpression = (c: N) => c.type === 'JSXExpressionContainer' && c.expression.type === 'JSXEmptyExpression';

interface Message {
	readonly match: { readonly kind: 'built-in'; readonly name: string } | { readonly kind: 'custom'; readonly fn: N } | undefined;
	readonly force: boolean | 'state';
	readonly field?: string;
	readonly html?: string;
	readonly why?: string;
}

/** What a Form.Message renders when it shows: Radix's span with its literal props and its text, or its default text. */
function messageOf(el: N, mod: Module): Message {
	const match = attrOf(el, 'match');
	const builtIn = stringOf(match);
	const fnNode = match?.value?.type === 'JSXExpressionContainer' ? match.value.expression : undefined;
	const matcher: Message['match'] = builtIn !== undefined ? { kind: 'built-in', name: builtIn } : fnNode && (fnNode.type === 'ArrowFunctionExpression' || fnNode.type === 'FunctionExpression' || fnNode.type === 'Identifier') ? { kind: 'custom', fn: fnNode } : undefined;
	const forceAttr = attrOf(el, 'forceMatch');
	const force = forceAttr ? (boolOf(forceAttr) ?? 'state') : false;
	const nameAttr = attrOf(el, 'name');
	const field = stringOf(nameAttr);
	if (match && !matcher) return { match: undefined, force, why: `its match is ${mod.text.slice(match.start, match.end).slice(0, 40)}` };
	if (nameAttr && field === undefined) return { match: matcher, force, why: 'its name is an expression' };
	const attrs: string[] = [];
	for (const a of el.openingElement.attributes as N[]) {
		if (a.type !== 'JSXAttribute' || a.name.type !== 'JSXIdentifier') return { match: matcher, force, why: 'it spreads props' };
		const n = a.name.name as string;
		if (n === 'match' || n === 'forceMatch' || n === 'name' || n === 'key') continue;
		const v = stringOf(a);
		if (v === undefined) return { match: matcher, force, why: `its ${n} is an expression` };
		attrs.push(`${n === 'className' ? 'class' : n}="${escapeAttr(v)}"`);
	}
	const kids = (el.children as N[]).filter((c) => !isEmptyExpression(c));
	let text: string | undefined;
	if (kids.length) {
		const parts = kids.map((c) => (c.type === 'JSXText' ? jsxText(c.value) : c.type === 'JSXExpressionContainer' && c.expression.type === 'Literal' && typeof c.expression.value === 'string' ? c.expression.value : undefined));
		if (parts.some((p) => p === undefined)) return { match: matcher, force, why: 'its children are not text' };
		text = parts.join('');
	}
	const shows = text || (matcher?.kind === 'built-in' ? BUILT_IN_MESSAGES[matcher.name] : DEFAULT_INVALID_MESSAGE);
	const html = `<span${attrs.length ? ` ${attrs.join(' ')}` : ''}>${escapeText(shows ?? '')}</span>`;
	return { match: matcher, force, ...(field !== undefined ? { field } : {}), html };
}

/** The Radix Form.Roots of a source file, each with its fields' children and its custom matchers' module. */
export function radixForms(file: string, text: string): SourceRadixForm[] {
	const mod = parseModule(file, text);
	const out: SourceRadixForm[] = [];
	walkJs(mod.program, (node) => {
		if (node.type !== 'JSXElement' || partOf(mod, node.openingElement.name) !== 'Root') return;
		const notes: string[] = [];
		const matchers: N[] = [];
		const fields: SourceField[] = [];
		walkJs(node, (n) => {
			if (n.type !== 'JSXElement' || partOf(mod, n.openingElement.name) !== 'Field') return;
			const name = stringOf(attrOf(n, 'name'));
			if (name === undefined) {
				notes.push(`${file}:${mod.line(n.start)} a Form.Field whose name is an expression is not ported`);
				return false;
			}
			const children: FieldChild[] = [];
			for (const c of n.children as N[]) {
				if (isBlank(c) || isEmptyExpression(c)) continue;
				if (c.type === 'JSXText') continue;
				if (c.type !== 'JSXElement') {
					children.push({ kind: 'dynamic' });
					continue;
				}
				const part = partOf(mod, c.openingElement.name);
				if (part === 'Label') children.push({ kind: 'label' });
				else if (part === 'Control') children.push({ kind: 'control' });
				else if (part !== 'Message') children.push({ kind: 'element' });
				else {
					const m = messageOf(c, mod);
					if (m.why || !m.html) {
						notes.push(`${file}:${mod.line(c.start)} a Form.Message of ${name} is not ported: ${m.why}`);
						// What it renders at load is unknown: the field cannot be told apart on the page.
						children.push({ kind: 'dynamic' });
						continue;
					}
					if (m.force === 'state') notes.push(`${file}:${mod.line(c.start)} the Form.Message of ${name} has a forceMatch the page's own state gives; the port keeps its value at load`);
					// A message with no match, or forced, renders at load: it is in the page already.
					if (!m.match || m.force === true) {
						children.push({ kind: 'element' });
						continue;
					}
					let match: string | number;
					if (m.match.kind === 'built-in') match = m.match.name;
					else {
						match = matchers.length;
						matchers.push(m.match.fn);
					}
					children.push({ kind: 'message', field: m.field ?? name, match, force: false, html: m.html });
				}
			}
			fields.push({ name, children });
			return false;
		});
		let module: string | undefined;
		if (matchers.length) {
			const made = copiedModule(mod, matchers, 'matchers');
			if (made.module && !made.packages.length) module = made.module;
			else {
				notes.push(`${file}:${mod.line(node.start)} its custom matchers are not ported: ${made.why ?? `they import ${made.packages.join(', ')}`}`);
				for (const f of fields) (f.children as FieldChild[]).forEach((c, i, all) => c.kind === 'message' && typeof c.match === 'number' && (all[i] = { kind: 'dynamic' }));
			}
		}
		out.push({ file, fields, ...(module ? { matchers: module } : {}), notes });
		return false;
	});
	return out;
}

/** The Radix Form.Roots of the old source: the files that render one, as plan's libraries.json lists them. */
export async function radixFormSources(source: string | undefined, librariesPath: string): Promise<SourceRadixForm[]> {
	if (!source) return [];
	const libraries = await readFile(librariesPath, 'utf8').then((t) => JSON.parse(t) as { libraries?: { name: string; exports: { name: string; sites?: { file: string }[] }[] }[] }, () => ({ libraries: [] }));
	const files = new Set<string>();
	for (const lib of libraries.libraries ?? []) if (lib.name === 'radix-ui' || lib.name === '@radix-ui/react-form') for (const e of lib.exports) if (/^(Form\.Root|Root|Form)$/.test(e.name)) for (const s of e.sites ?? []) files.add(s.file);
	const out: SourceRadixForm[] = [];
	for (const file of [...files].sort()) {
		const text = await readFile(join(source, file), 'utf8').catch(() => undefined);
		if (text !== undefined) out.push(...radixForms(file, text));
	}
	return out;
}

export const MATCHERS_MODULE = 'radix-forms.ts';
export const MATCHERS_DIR = 'radix-form-matchers';

const hash = (s: string) => createHash('sha256').update(s).digest('hex').slice(0, 12);
const named = (el: Element) => (/^(input|select|textarea)$/.test(el.tagName) ? attr(el, 'name') : undefined);

/**
 * Radix forms on the converted pages: each message a template where Radix renders it, which parts/radix/form.ts shows
 * while its match holds; each field, label and control marked with its field's name.
 */
export class RadixFormPlan {
	private readonly bindings = new Map<Element, Binding>();
	private readonly modules = new Map<string, string>();
	readonly notes: string[] = [];
	private readonly sources: readonly SourceRadixForm[];

	constructor(sources: readonly SourceRadixForm[]) {
		this.sources = sources;
		for (const s of sources) this.notes.push(...s.notes);
	}

	get used(): boolean {
		return this.bindings.size > 0;
	}

	bind(el: Element): Binding | undefined {
		return this.bindings.get(el);
	}

	private set(el: Element, b: Binding): void {
		this.bindings.set(el, mergeBindings(this.bindings.get(el), b)!);
	}

	/** Places the source's forms on the page under `root`; the number placed. */
	add(route: string, root: Element, emit: (html: string) => string): number {
		let placed = 0;
		for (const form of walk(root)) {
			if (form.tagName !== 'form' || this.bindings.has(form)) continue;
			const names = new Set([...walk(form)].map(named).filter((n): n is string => n !== undefined));
			const candidates = this.sources.filter((s) => s.fields.length > 0 && s.fields.every((f) => names.has(f.name)));
			if (!candidates.length) continue;
			const best = Math.max(...candidates.map((c) => c.fields.length));
			const chosen = candidates.filter((c) => c.fields.length === best);
			if (new Set(chosen.map((c) => JSON.stringify([c.fields, c.matchers]))).size > 1) {
				this.notes.push(`${route}: a form several Form.Roots of the source could render is not ported (${chosen.map((c) => c.file).join(', ')})`);
				continue;
			}
			if (this.place(route, form, chosen[0]!, emit)) placed++;
		}
		return placed;
	}

	private place(route: string, form: Element, source: SourceRadixForm, emit: (html: string) => string): boolean {
		const staged = new Map<Element, Binding>();
		const stage = (el: Element, b: Binding) => staged.set(el, mergeBindings(staged.get(el), b)!);
		let messages = 0;
		for (const field of source.fields) {
			const controls = [...walk(form)].filter((el) => named(el) === field.name);
			const at = field.children.findIndex((c) => c.kind === 'control');
			const div = controls.length === 1 ? (controls[0]!.parentNode as Element | null) : null;
			const rendered = field.children.filter((c) => c.kind === 'label' || c.kind === 'control' || c.kind === 'element');
			const kids = div ? elementChildren(div) : [];
			const dynamic = field.children.some((c) => c.kind === 'dynamic');
			// A dynamic child rendered nothing at load only if the page shows exactly the field's static children.
			if (at < 0 || !div || div === form || kids.length !== rendered.length || kids[rendered.indexOf(field.children[at]!)] !== controls[0]) {
				this.notes.push(`${route}: the Form.Field ${field.name} is not ported: the page does not show the children its source renders${dynamic ? ' (it renders some from page state)' : ''}`);
				continue;
			}
			stage(div, { extra: [`data-mm-rf-field=${lit(field.name)}`] });
			let k = 0;
			field.children.forEach((c, i) => {
				if (c.kind === 'label') stage(kids[k]!, { extra: [`data-mm-rf-label=${lit(field.name)}`] });
				if (c.kind === 'control') stage(kids[k]!, { extra: ['data-mm-rf-control=""'] });
				if (c.kind === 'label' || c.kind === 'control' || c.kind === 'element') {
					k++;
					return;
				}
				if (c.kind !== 'message') return;
				const next = field.children.slice(i + 1).findIndex((x) => x.kind === 'label' || x.kind === 'control' || x.kind === 'element');
				const before = next < 0 ? null : (kids[k] ?? null);
				const how = typeof c.match === 'number' ? `data-mm-rf-matcher="${c.match}"` : `data-mm-rf-match=${lit(c.match)}`;
				stage(div, { inserts: [{ before, markup: `<template data-mm-rf-message=${lit(c.field)} ${how}>${emit(c.html)}</template>` }] });
				messages++;
			});
		}
		if (!messages) return false;
		const key = source.matchers ? `rfm_${hash(source.matchers)}` : '';
		if (source.matchers) this.modules.set(key, source.matchers);
		stage(form, { extra: [`data-mm-rf=${lit(key)}`, 'onVisible={() => mount("data-mm-rf")}'] });
		for (const [el, b] of staged) this.set(el, b);
		return true;
	}

	/** The matchers' registry and modules, under the app's lib/parts/. */
	files(): Map<string, string> {
		const out = new Map<string, string>();
		if (!this.used) return out;
		const entries = [...this.modules.keys()].map((key) => `\t${key}: () => import('./${MATCHERS_DIR}/${key}.ts').then((m) => m.matchers),`);
		out.set(MATCHERS_MODULE, `// Generated by markless-migrate convert: each Radix form's custom matchers; change the converter, not this file.\nexport const MATCHERS: Readonly<Record<string, () => Promise<readonly ((value: string, formData: FormData) => boolean | Promise<boolean>)[]>>> = {\n${entries.join('\n')}\n};\n`);
		for (const [key, module] of this.modules) out.set(`${MATCHERS_DIR}/${key}.ts`, `// Generated by markless-migrate convert: the old source's Form.Message matchers, copied unchanged.\n${module}`);
		return out;
	}
}
