import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseModule, walk, type Module, type N } from '../source/js.ts';
import type { FormLibrary } from './form-libraries.ts';

// The schema a form validates with, as the old source wrote it: the expression its useForm call is given, with every
// top-level declaration and package import that expression reaches, copied unchanged into a module of the port.

/** One useForm call of the old source, with the text the component around it shows (to tell its form on a page). */
export interface SourceForm {
	readonly file: string;
	readonly library: FormLibrary;
	/** The schema module's source (`export const schema = ...`), or why the form's schema cannot be copied. */
	readonly module?: string;
	readonly why?: string;
	/** Packages the schema module imports. */
	readonly packages: readonly string[];
	/** The string literals and JSX text of the file, which its rendered form may show. */
	readonly strings: readonly string[];
}

const PACKAGE = /^(?:@[^/]+\/)?[^./][^/]*/;

const prop = (obj: N | undefined, name: string): N | undefined => (obj?.type === 'ObjectExpression' ? (obj.properties as N[]).find((p) => p.type === 'Property' && ((p.key.type === 'Identifier' && p.key.name === name) || (p.key.type === 'Literal' && p.key.value === name)))?.value : undefined);

/** The expression a useForm call validates with, by library; why not, when the call uses what the port does not run. */
function schemaOf(library: FormLibrary, options: N | undefined): { expr?: N; why?: string } {
	if (library === 'react-hook-form') {
		const resolver = prop(options, 'resolver');
		if (!resolver) return { why: 'useForm is given no resolver' };
		if (resolver.type !== 'CallExpression' || !/^(zodResolver|valibotResolver|standardSchemaResolver)$/.test(resolver.callee?.name ?? '')) return { why: 'its resolver is not a schema resolver' };
		if (resolver.arguments.length > 1) return { why: 'its resolver is given options' };
		const mode = prop(options, 'mode');
		const revalidate = prop(options, 'reValidateMode');
		if ((mode && mode.value !== 'onSubmit') || (revalidate && revalidate.value !== 'onChange') || prop(options, 'criteriaMode')) return { why: 'it validates at times other than on submit, then on change' };
		return { expr: resolver.arguments[0] };
	}
	if (library === 'tanstack-form') {
		const validators = prop(options, 'validators');
		const keys = validators?.type === 'ObjectExpression' ? (validators.properties as N[]).map((p) => p.key?.name) : [];
		if (keys.length !== 1 || keys[0] !== 'onSubmit') return { why: 'its validators are not one onSubmit schema' };
		return { expr: prop(validators, 'onSubmit') };
	}
	const validate = prop(options, 'validate');
	const revalidate = prop(options, 'revalidate');
	if ((validate && validate.value !== 'submit') || (revalidate && revalidate.value !== 'input')) return { why: 'it validates at times other than on submit, then on input' };
	const schema = prop(options, 'schema');
	return schema ? { expr: schema } : { why: 'useForm is given no schema' };
}

/** The identifiers an expression reads (not property names or object keys). */
function reads(node: N): Set<string> {
	const out = new Set<string>();
	walk(node, (n, ancestors) => {
		if (n.type !== 'Identifier') return;
		const parent = ancestors.at(-1);
		if (parent?.type === 'MemberExpression' && parent.property === n && !parent.computed) return;
		if (parent?.type === 'Property' && parent.key === n && !parent.computed && !parent.shorthand) return;
		out.add(n.name);
	});
	return out;
}

/** The schema module for an expression of a module: its imports and top-level declarations it reaches, in source order. */
export function schemaModule(mod: Module, expr: N): { module?: string; packages: string[]; why?: string } {
	const needed = new Set<string>();
	const pending = [...reads(expr)];
	const statements = new Set<N>();
	const packages = new Set<string>();
	const imports: string[] = [];
	while (pending.length) {
		const name = pending.pop()!;
		if (needed.has(name)) continue;
		needed.add(name);
		const imported = mod.imports.get(name);
		if (imported) {
			if (imported.source.startsWith('.') || imported.source.startsWith('@/') || imported.source.startsWith('~/')) return { packages: [], why: `the schema reads ${name} from ${imported.source}, a file of the old app` };
			packages.add(PACKAGE.exec(imported.source)![0]);
			imports.push(imported.imported === '*' ? `import * as ${name} from ${JSON.stringify(imported.source)};` : imported.imported === 'default' ? `import ${name} from ${JSON.stringify(imported.source)};` : `import { ${imported.imported === name ? name : `${imported.imported} as ${name}`} } from ${JSON.stringify(imported.source)};`);
			continue;
		}
		const stmt = (mod.program.body as N[]).find((s) => {
			const decl = s.type === 'ExportNamedDeclaration' ? s.declaration : s;
			if (decl?.type === 'VariableDeclaration') return (decl.declarations as N[]).some((d) => d.id.type === 'Identifier' && d.id.name === name);
			return (decl?.type === 'FunctionDeclaration' || decl?.type === 'ClassDeclaration') && decl.id?.name === name;
		});
		if (!stmt) continue;
		const decl = stmt.type === 'ExportNamedDeclaration' ? stmt.declaration : stmt;
		statements.add(decl);
		for (const n of reads(decl)) if (!needed.has(n)) pending.push(n);
	}
	const body = [...statements].sort((a, b) => a.start - b.start).map((s) => mod.text.slice(s.start, s.end));
	const module = `${[...new Set(imports)].sort().join('\n')}\n\n${body.join('\n\n')}\n\nexport const schema = ${mod.text.slice(expr.start, expr.end)};\n`;
	return { module, packages: [...packages] };
}

/** The useForm calls of one source file, by the library that the file imports useForm from. */
export function sourceForms(file: string, text: string): SourceForm[] {
	const mod = parseModule(file, text);
	const strings: string[] = [];
	walk(mod.program, (n) => {
		if (n.type === 'Literal' && typeof n.value === 'string') strings.push(n.value);
		else if (n.type === 'JSXText') strings.push(String(n.value).replace(/\s+/g, ' ').trim());
	});
	const library = (local: string): FormLibrary | undefined => {
		const source = mod.imports.get(local)?.source;
		return source === 'react-hook-form' ? 'react-hook-form' : source === '@tanstack/react-form' ? 'tanstack-form' : source === '@formisch/react' ? 'formisch' : undefined;
	};
	const out: SourceForm[] = [];
	walk(mod.program, (n) => {
		if (n.type !== 'CallExpression' || n.callee.type !== 'Identifier') return;
		const lib = library(n.callee.name);
		if (!lib || mod.imports.get(n.callee.name)?.imported !== 'useForm') return;
		const found = schemaOf(lib, n.arguments[0]);
		const base = { file, library: lib, strings: strings.filter((s) => s.length >= 3) };
		if (!found.expr) out.push({ ...base, packages: [], why: found.why ?? 'no schema' });
		else {
			const made = schemaModule(mod, found.expr);
			out.push({ ...base, packages: made.packages, ...(made.module ? { module: made.module } : {}), ...(made.why ? { why: made.why } : {}) });
		}
	});
	return out;
}

/** The source form a region shows: the one whose file's strings the region's text holds the most of, when one does alone or its equals validate alike. */
export function matchSource(text: string, candidates: readonly SourceForm[]): SourceForm | undefined {
	const scored = candidates.map((c) => ({ c, score: new Set(c.strings.filter((s) => text.includes(s))).size })).sort((a, b) => b.score - a.score);
	const best = scored.filter((s) => s.score > 0 && s.score === scored[0]!.score).map((s) => s.c);
	// Copies of one example (a registry per style) that validate alike are one form.
	return best.length && best.every((c) => c.library === best[0]!.library && c.module === best[0]!.module && c.why === best[0]!.why) ? best[0] : undefined;
}

const LIBRARIES: Readonly<Record<string, FormLibrary>> = { 'react-hook-form': 'react-hook-form', '@tanstack/react-form': 'tanstack-form', '@formisch/react': 'formisch' };

/** The old source's useForm calls, from the files the usage inventory found calling one; none without the source. */
export async function formSources(source: string | undefined, usagePath: string): Promise<{ readonly forms: readonly SourceForm[]; readonly version: (name: string) => string | undefined }> {
	if (!source) return { forms: [], version: () => undefined };
	const usage = await readFile(usagePath, 'utf8').then((text) => JSON.parse(text) as { behaviours?: { library: string; feature: string; sites: ({ file: string } | object)[] }[] }, () => ({ behaviours: [] }));
	const files = new Set<string>();
	for (const b of usage.behaviours ?? []) if (LIBRARIES[b.library] && b.feature === 'useForm') for (const site of b.sites) if ('file' in site) files.add(site.file);
	const forms: SourceForm[] = [];
	for (const file of [...files].sort()) {
		const text = await readFile(join(source, file), 'utf8').catch(() => undefined);
		if (text !== undefined) forms.push(...sourceForms(file, text));
	}
	const manifest = await readFile(join(source, 'package.json'), 'utf8').then((text) => JSON.parse(text) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> }, () => ({}) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> });
	return { forms, version: (name) => manifest.dependencies?.[name] ?? manifest.devDependencies?.[name] };
}
