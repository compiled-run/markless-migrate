import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { parse } from 'yuku';
import { parse as parseTsrx } from 'yuku-tsrx';
import { classTokens } from './used-css.ts';

// biome-ignore lint/suspicious/noExplicitAny: ESTree from yuku and yuku-tsrx, walked generically
type Node = any;

interface ModuleFacts {
	/** Every string the module's code holds, outside a host element's literal class attribute. */
	readonly strings: readonly string[];
	/** Each host element's literal class attribute. */
	readonly elements: readonly string[];
	/** The app modules it imports, statically or dynamically. */
	readonly imports: readonly string[];
}

function literal(node: Node): Node | undefined {
	if (!node) return undefined;
	if ((node.type === 'Literal' || node.type === 'StringLiteral') && typeof node.value === 'string') return node;
	if (node.type === 'JSXExpressionContainer') return literal(node.expression);
	return undefined;
}

function factsOf(file: string, text: string): ModuleFacts {
	let program: Node;
	try {
		program = file.endsWith('.tsrx') ? parseTsrx(text, { lang: 'tsx' }).program : parse(text, { path: file, sourceType: 'module' }).program;
	} catch {
		return { strings: [text], elements: [], imports: [] };
	}
	const markup = new Set<Node>();
	const strings: string[] = [];
	const imports: string[] = [];
	const visit = (node: Node): void => {
		if (!node || typeof node !== 'object') return;
		if (Array.isArray(node)) {
			for (const child of node) visit(child);
			return;
		}
		if (node.type === 'JSXElement') {
			const name = node.openingElement?.name;
			if (name?.type === 'JSXIdentifier' && /^[a-z]/.test(name.name))
				for (const a of node.openingElement.attributes ?? []) {
					const key = a.type === 'JSXAttribute' && a.name?.type === 'JSXIdentifier' ? a.name.name : undefined;
					const value = (key === 'class' || key === 'className') && literal(a.value);
					if (value) markup.add(value);
				}
		} else if ((node.type === 'ImportDeclaration' || node.type === 'ExportNamedDeclaration' || node.type === 'ExportAllDeclaration' || node.type === 'ImportExpression') && typeof node.source?.value === 'string') {
			imports.push(node.source.value);
		} else if ((node.type === 'Literal' || node.type === 'StringLiteral') && typeof node.value === 'string' && !markup.has(node)) strings.push(node.value);
		else if (node.type === 'TemplateElement') strings.push(node.value?.cooked ?? node.value?.raw ?? '');
		for (const key of Object.keys(node)) if (key !== 'parent' && typeof node[key] === 'object') visit(node[key]);
	};
	visit(program);
	return { strings, elements: [...markup].map((n) => n.value as string), imports: imports.filter((s) => s.startsWith('.') && !/\.(?:css|svg|png|json|woff2?)(?:\?|$)/.test(s)).map((s) => resolve(dirname(file), s)) };
}

/**
 * What a page's code says about classes, over every app module the entries load: `elements`, each host element's literal
 * class attribute (only that element carries it), and `floating`, the tokens of every other string, which code can put on
 * any element. A class built by joining strings is not seen, as usedCss does not see it either.
 */
export function codeClasses(app: string): (entries: readonly string[]) => Promise<{ elements: string[][]; floating: Set<string> }> {
	// Modules other modules import are read once; an entry (a page, often megabytes) is read for its own call and let go.
	const modules = new Map<string, Promise<ModuleFacts | undefined>>();
	const load = (file: string) => read(file).then((found) => found && factsOf(found.file, found.text));
	const facts = (file: string, entry: boolean) => {
		if (entry && !modules.has(file)) return load(file);
		if (!modules.has(file)) modules.set(file, load(file));
		return modules.get(file)!;
	};
	// An import may leave out the extension or name a folder.
	const read = async (file: string) => {
		for (const candidate of [file, `${file}.ts`, `${file}.tsrx`, `${file}/index.ts`]) {
			const text = await readFile(candidate, 'utf8').catch(() => undefined);
			if (text !== undefined) return { file: candidate, text };
		}
		return undefined;
	};
	return async (entries) => {
		const seen = new Set<string>();
		const roots = new Set(entries.map((e) => resolve(app, e)));
		const queue = [...roots];
		const strings: string[] = [];
		const elements: string[][] = [];
		while (queue.length) {
			const file = queue.pop()!;
			if (seen.has(file) || !file.startsWith(`${app}/`)) continue;
			seen.add(file);
			const f = await facts(file, roots.has(file));
			if (!f) continue;
			strings.push(...f.strings);
			for (const c of f.elements) elements.push(c.split(/\s+/).filter(Boolean));
			queue.push(...f.imports);
		}
		return { elements, floating: classTokens(strings) };
	};
}

/** Whether some element of a page can carry every class of both lists. */
export type Together = (a: readonly string[], b: readonly string[]) => boolean;

/** From the page's elements (each one's class list) and the tokens its code can add to any element: an element that already has the rest. */
export function together(elements: Iterable<readonly string[]>, floating: { has(token: string): boolean }): Together {
	const byClass = new Map<string, Set<number>>();
	let i = 0;
	for (const classes of elements) {
		for (const c of classes) byClass.set(c, (byClass.get(c) ?? new Set()).add(i));
		i++;
	}
	return (a, b) => {
		const need = [...new Set([...a, ...b])].filter((c) => !floating.has(c));
		if (!need.length) return true;
		const sets = need.map((c) => byClass.get(c));
		if (sets.some((s) => !s)) return false;
		const [rarest, ...rest] = (sets as Set<number>[]).sort((x, y) => x.size - y.size);
		for (const el of rarest!) if (rest.every((s) => s.has(el))) return true;
		return false;
	};
}
