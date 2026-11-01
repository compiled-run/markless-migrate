import type { Context } from '../source/context.ts';
import { resolveImport } from '../source/files.ts';
import { isFunction, known, patternNames, staticValue, unwrap, walk, type Module, type N } from '../source/js.ts';
import type { Compositions } from './composition.ts';
import type { CarriedHandler } from './types.ts';

// The events carried: a submit is the one use recording never makes (it submits only form-library forms), so a carried
// handler never repeats a recorded effect.
const EVENTS: Readonly<Record<string, string>> = { onSubmit: 'submit' };
const GLOBALS = new Set(['FormData', 'console', 'Date', 'Math', 'JSON', 'Number', 'String', 'Boolean', 'Array', 'Object', 'URL', 'URLSearchParams', 'setTimeout', 'clearTimeout', 'Intl', 'Promise', 'encodeURIComponent', 'decodeURIComponent', 'Error', 'undefined', 'Infinity', 'NaN', 'Map', 'Set', 'RegExp', 'parseInt', 'parseFloat', 'isNaN']);
const TS_EXPRESSIONS = new Set(['TSAsExpression', 'TSSatisfiesExpression', 'TSNonNullExpression']);
const HOOK = /^(React\.)?use[A-Z]\w*$/;
const MAX_WORDS = 40;
// A component kit's wrapper modules (shadcn's ui/): their handlers are the library's own behaviour, which its part ports.
const WRAPPERS = /(^|\/)ui(-[a-z]+)?\/[^/]+\.[jt]sx$/;

const jsxName = (n: N): string | undefined => (n.type === 'JSXIdentifier' ? n.name : n.type === 'JSXMemberExpression' ? `${jsxName(n.object)}.${n.property.name}` : undefined);

/** The source of a node with its TypeScript taken out: annotations, type arguments, `as` and `!`. */
export function stripTypes(text: string, node: N, drop: ReadonlySet<N> = new Set()): string {
	const cuts: [number, number][] = [];
	walk(node, (n) => {
		if (drop.has(n)) {
			cuts.push([n.start, n.end]);
			return false;
		}
		if (n.type === 'TSTypeAnnotation' || n.type === 'TSTypeParameterInstantiation' || n.type === 'TSTypeParameterDeclaration') {
			cuts.push([n.start, n.end]);
			return false;
		}
		if (TS_EXPRESSIONS.has(n.type)) cuts.push([n.expression.end, n.end]);
	});
	let out = '';
	let at = node.start;
	for (const [a, b] of cuts.sort((x, y) => x[0] - y[0])) {
		if (a < at) continue;
		out += text.slice(at, a);
		at = b;
	}
	return out + text.slice(at, node.end);
}

/** The names a function reads that it does not declare itself, outside its types. */
function freeNames(fn: N): Set<string> {
	const declared = new Set<string>();
	const used = new Set<string>();
	walk(fn, (n, ancestors) => {
		if (n.type.startsWith('TS') && !TS_EXPRESSIONS.has(n.type)) return false;
		if (isFunction(n)) for (const p of n.params as N[]) for (const name of patternNames(p)) declared.add(name);
		if ((n.type === 'FunctionDeclaration' || n.type === 'FunctionExpression') && n.id) declared.add(n.id.name);
		if (n.type === 'VariableDeclarator') for (const name of patternNames(n.id)) declared.add(name);
		if (n.type === 'CatchClause' && n.param) for (const name of patternNames(n.param)) declared.add(name);
		if (n.type !== 'Identifier') return;
		const parent = ancestors.at(-1);
		if (parent?.type === 'MemberExpression' && parent.property === n && !parent.computed) return;
		if (parent?.type === 'Property' && parent.key === n && !parent.computed && !parent.shorthand) return;
		if ((parent?.type === 'MethodDefinition' || parent?.type === 'PropertyDefinition') && parent.key === n) return;
		if (parent?.type === 'LabeledStatement' || parent?.type === 'BreakStatement' || parent?.type === 'ContinueStatement') return;
		used.add(n.name);
	});
	return new Set([...used].filter((n) => !declared.has(n)));
}

/** The component function a JSX element sits in. */
function componentOf(ancestors: readonly N[]): N | undefined {
	for (let i = ancestors.length - 1; i >= 0; i--) {
		const n = ancestors[i]!;
		if (n.type === 'FunctionDeclaration' && /^[A-Z]/.test(n.id?.name ?? '')) return n;
		if ((n.type === 'ArrowFunctionExpression' || n.type === 'FunctionExpression') && ancestors[i - 1]?.type === 'VariableDeclarator' && /^[A-Z]/.test(ancestors[i - 1]!.id?.name ?? '')) return n;
	}
	return undefined;
}

/** A declaration of `name` among the statements of a component's body. */
function localDeclaration(component: N, name: string): { node: N; statement: N } | undefined {
	const body = component.body?.type === 'BlockStatement' ? (component.body.body as N[]) : [];
	for (const stmt of body) {
		if (stmt.type === 'FunctionDeclaration' && stmt.id?.name === name) return { node: stmt, statement: stmt };
		if (stmt.type === 'VariableDeclaration') for (const d of stmt.declarations as N[]) if (patternNames(d.id).includes(name)) return { node: d, statement: stmt };
	}
	return undefined;
}

class Refused extends Error {}

interface Carry {
	/** Statements left out: the handler's own cancel of its event, which the page applies as it dispatches. */
	readonly drop: Set<N>;
	readonly declarations: string[];
	readonly seen: Set<N>;
	readonly calls: Map<string, { from: string; imported: string }>;
}

/**
 * Carries the app's own submit handlers over from the source: the function each form-like element is given, every
 * local or module function and value it reads (each module's own, through its imports), and the library functions it
 * calls, which convert points at their ports. A handler that reads the component's props, React state or a hook is
 * refused: what it reads lives in React, not in the page.
 */
export class Handlers {
	private readonly ctx: Context;
	private readonly composer: Compositions;

	constructor(ctx: Context, composer: Compositions) {
		this.ctx = ctx;
		this.composer = composer;
	}

	async sites(mod: Module): Promise<Omit<CarriedHandler, 'routes'>[]> {
		if (WRAPPERS.test(mod.file)) return [];
		const found: { element: N; attr: N; ancestors: N[] }[] = [];
		walk(mod.program, (n, ancestors) => {
			if (n.type !== 'JSXElement') return;
			for (const a of n.openingElement.attributes as N[]) if (a.type === 'JSXAttribute' && a.name.type === 'JSXIdentifier' && EVENTS[a.name.name]) found.push({ element: n, attr: a, ancestors: [...ancestors] });
		});
		const out: Omit<CarriedHandler, 'routes'>[] = [];
		for (const { element, attr, ancestors } of found) {
			const base = { file: mod.file, line: mod.line(element.start), element: jsxName(element.openingElement.name) ?? '', event: EVENTS[attr.name.name]!, slots: await this.composer.slotsOf(mod, element), words: wordsOf(element, mod) };
			try {
				const code = await this.carry(mod, attr, componentOf(ancestors));
				out.push({ ...base, ...code });
			} catch (error) {
				if (!(error instanceof Refused)) throw error;
				out.push({ ...base, refused: error.message });
			}
		}
		return out;
	}

	private async carry(mod: Module, attr: N, component: N | undefined): Promise<Pick<CarriedHandler, 'code' | 'calls'>> {
		const value = attr.value?.type === 'JSXExpressionContainer' ? unwrap(attr.value.expression) : undefined;
		if (!value) throw new Refused('its handler is no expression');
		const carry: Carry = { drop: new Set(), declarations: [], seen: new Set(), calls: new Map() };
		const fn = value.type === 'Identifier' ? functionOf((component && localDeclaration(component, value.name)) || this.moduleDeclaration(mod, value.name)) : isFunction(value) ? value : undefined;
		const cancels = fn ? cancelOf(fn) : undefined;
		if (cancels) carry.drop.add(cancels);
		if (value.type === 'Identifier') await this.need(mod, value.name, component, carry);
		else if (isFunction(value)) for (const name of freeNames(value)) await this.need(mod, name, component, carry);
		else throw new Refused(`its handler is computed (${mod.text.slice(value.start, value.end).slice(0, 40)})`);
		const handler = value.type === 'Identifier' ? value.name : stripTypes(mod.text, value, carry.drop);
		const code = `(${[...carry.calls.keys()].join(', ')}) => {\n${carry.declarations.join('\n')}\nreturn ${handler};\n}`;
		return { code, calls: Object.fromEntries(carry.calls), ...(cancels ? { cancels: true } : {}) };
	}

	/** What `name` is where the handler reads it, carried along: a declaration, a library call to port, or a global. */
	private async need(mod: Module, name: string, component: N | undefined, carry: Carry, depth = 0): Promise<void> {
		if (depth > 8) throw new Refused(`reads ${name} through too many declarations`);
		if (carry.calls.has(name)) return;
		const local = component ? localDeclaration(component, name) : undefined;
		if (component && !local && (component.params as N[]).some((p) => patternNames(p).includes(name))) throw new Refused(`reads the component's prop ${name}`);
		const declared = local ?? this.moduleDeclaration(mod, name);
		if (declared) return this.declare(mod, declared, local ? component : undefined, carry, depth);
		const imp = mod.imports.get(name);
		if (imp) {
			const target = resolveImport(this.ctx.project, mod.file, imp.source);
			if (!target) {
				carry.calls.set(name, { from: imp.source, imported: imp.imported });
				return;
			}
			const other = await this.ctx.module(target);
			const node = other && imp.imported !== '*' && imp.imported !== 'default' ? this.moduleDeclaration(other, imp.imported) : undefined;
			if (!other || !node) throw new Refused(`reads ${name} from ${imp.source}, which declares no such value`);
			if (imp.imported !== name) throw new Refused(`reads ${imp.imported} from ${imp.source} under another name`);
			return this.declare(other, node, undefined, carry, depth);
		}
		if (GLOBALS.has(name)) return;
		throw new Refused(`reads ${name}, which the page has no value for`);
	}

	private moduleDeclaration(mod: Module, name: string): { node: N; statement: N } | undefined {
		for (const raw of mod.program.body as N[]) {
			const stmt = (raw.type === 'ExportNamedDeclaration' || raw.type === 'ExportDefaultDeclaration') && raw.declaration ? raw.declaration : raw;
			if (stmt.type === 'FunctionDeclaration' && stmt.id?.name === name) return { node: stmt, statement: stmt };
			if (stmt.type === 'VariableDeclaration') for (const d of stmt.declarations as N[]) if (patternNames(d.id).includes(name)) return { node: d, statement: stmt };
		}
		return undefined;
	}

	private async declare(mod: Module, { node, statement }: { node: N; statement: N }, component: N | undefined, carry: Carry, depth: number): Promise<void> {
		if (carry.seen.has(statement)) return;
		carry.seen.add(statement);
		if (node.type === 'VariableDeclarator') {
			const init = unwrap(node.init);
			const callee = init?.type === 'CallExpression' ? init.callee : undefined;
			const name = callee?.type === 'Identifier' ? callee.name : callee?.type === 'MemberExpression' && callee.object.type === 'Identifier' && callee.property.type === 'Identifier' ? `${callee.object.name}.${callee.property.name}` : '';
			if (HOOK.test(name)) throw new Refused(`reads ${patternNames(node.id).join(', ')}, which React state or a hook keeps`);
			if (statement.kind !== 'const') throw new Refused(`reads ${patternNames(node.id).join(', ')}, which the component reassigns`);
		}
		for (const name of freeNames(node.type === 'VariableDeclarator' ? { ...node, type: 'ArrowFunctionExpression', params: [], body: node.init ?? node.id } : node)) await this.need(mod, name, component, carry, depth + 1);
		carry.declarations.push(node.type === 'VariableDeclarator' ? `const ${stripTypes(mod.text, node, carry.drop)};` : stripTypes(mod.text, node, carry.drop));
	}
}

const functionOf = (d: { node: N } | undefined): N | undefined => {
	const n = d?.node.type === 'VariableDeclarator' ? unwrap(d.node.init) : d?.node;
	return n && isFunction(n) ? n : undefined;
};

/**
 * The statement a handler cancels its event in, `event.preventDefault()` among its body's own statements: a carried
 * handler runs once the page has loaded it, after the event, so the page cancels the event as it dispatches instead.
 * A cancel anywhere else is a condition only the handler knows, and is refused.
 */
function cancelOf(fn: N): N | undefined {
	const param = (fn.params as N[])[0];
	const name = param?.type === 'Identifier' ? param.name : undefined;
	const isCancel = (n: N) => n.type === 'CallExpression' && n.callee.type === 'MemberExpression' && !n.callee.computed && n.callee.property.name === 'preventDefault';
	const top = fn.body?.type === 'BlockStatement' ? (fn.body.body as N[]).find((st) => st.type === 'ExpressionStatement' && isCancel(unwrap(st.expression)!) && unwrap(st.expression)!.callee.object.type === 'Identifier' && unwrap(st.expression)!.callee.object.name === name) : undefined;
	let other = false;
	walk(fn, (n) => {
		if (n === top) return false;
		if (isCancel(n)) other = true;
	});
	if (other) throw new Refused('cancels its event where only it knows when, which a page applies as the event dispatches');
	return top;
}

/** The text an element shows, as the source fixes it: its own JSX text and the strings of the module data it renders. */
export function wordsOf(element: N, mod: Module): string[] {
	const out = new Set<string>();
	const add = (s: unknown) => {
		if (typeof s === 'string' && /\S\s+\S/.test(s.trim()) && s.trim().length >= 6 && out.size < MAX_WORDS) out.add(s.replace(/\s+/g, ' ').trim());
		else if (Array.isArray(s)) s.forEach(add);
		else if (s && typeof s === 'object') Object.values(s).forEach(add);
	};
	walk(element, (n) => {
		if (out.size >= MAX_WORDS) return false;
		if (n.type === 'JSXText') add(n.value);
		if (n.type === 'Identifier' && mod.bindings.has(n.name)) {
			const v = staticValue(n, mod);
			if (known(v) && typeof v === 'object') add(v);
		}
	});
	return [...out];
}
