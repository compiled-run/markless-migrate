import { parse } from 'yuku';
import { parse as parseTsrx } from 'yuku-tsrx';

// biome-ignore lint/suspicious/noExplicitAny: ESTree from yuku and yuku-tsrx, walked generically
type Node = any;

/** The files the class facts read as code: what the app's modules can be. */
export const MODULE = /\.(?:[mc]?[jt]sx?|tsrx)$/;

// The class-like word a template's text ends with right before an interpolation: `style-${name}` builds `style-…`.
const START = /(?:^|[\s"'`])(-?[A-Za-z_][\w-]*-)$/;
const CLASS_LIST = new Set(['add', 'remove', 'toggle', 'replace']);
const CLASS_HELPERS = new Set(['cn', 'clsx', 'classNames', 'classnames', 'cva', 'twMerge', 'tw']);

/** A module's syntax tree, or undefined where it does not parse. */
export function parseModule(file: string, text: string): Node | undefined {
	try {
		return file.endsWith('.tsrx') ? parseTsrx(text, { lang: 'tsx' }).program : parse(text, { path: file, sourceType: 'module' }).program;
	} catch {
		return undefined;
	}
}

/**
 * What a module says about classes its templates build: `starts`, of the templates in a class position (a class or
 * className attribute, classList.add/remove/toggle/replace, a class helper such as cn, a className assignment,
 * setAttribute('class', …)); `named`, the starts of the templates under each variable or property name; `flows`, the
 * names a class position reads.
 */
export interface ClassFacts {
	readonly starts: readonly string[];
	readonly named: readonly (readonly [string, readonly string[]])[];
	readonly flows: readonly string[];
	/** Offsets of class-position builders with no fixed start (`${size}-text`, `[a, b].join('-')`): classes the cut cannot see. */
	readonly unseen: readonly number[];
}

const nameOf = (node: Node): string | undefined => (node?.type === 'Identifier' || node?.type === 'JSXIdentifier' ? node.name : (node?.type === 'Literal' || node?.type === 'StringLiteral') && typeof node.value === 'string' ? node.value : undefined);

function startsOf(template: Node): string[] {
	const out: string[] = [];
	for (let i = 0; i < template.expressions.length; i++) {
		const start = START.exec(template.quasis[i]?.value?.cooked ?? '')?.[1];
		if (start) out.push(start);
	}
	return out;
}

function classArgs(call: Node): readonly Node[] {
	const callee = call.callee;
	if (callee?.type === 'Identifier' && CLASS_HELPERS.has(callee.name)) return call.arguments;
	if (callee?.type !== 'MemberExpression' || callee.computed) return [];
	const method = nameOf(callee.property);
	if (method && CLASS_LIST.has(method) && nameOf(callee.object?.type === 'MemberExpression' ? callee.object.property : callee.object) === 'classList') return call.arguments;
	if (method === 'setAttribute' && nameOf(call.arguments[0]) === 'class') return call.arguments.slice(1);
	return [];
}

export function classFacts(program: Node): ClassFacts {
	const starts = new Set<string>();
	const named = new Map<string, Set<string>>();
	const flows = new Set<string>();
	const unseen: number[] = [];
	const visit = (node: Node, inClass: boolean, binding: string | undefined): void => {
		if (!node || typeof node !== 'object') return;
		if (Array.isArray(node)) {
			for (const child of node) visit(child, inClass, binding);
			return;
		}
		// Types say nothing about what runs.
		if (typeof node.type === 'string' && node.type.startsWith('TS')) return;
		if (inClass && node.type === 'BinaryExpression' && node.operator === '+') {
			const start = typeof node.left?.value === 'string' ? START.exec(node.left.value)?.[1] : undefined;
			if (start) starts.add(start);
			else if (node.left?.type !== 'BinaryExpression') unseen.push(node.start);
		}
		if (inClass && node.type === 'CallExpression' && node.callee?.type === 'MemberExpression' && nameOf(node.callee.property) === 'join' && node.callee.object?.type === 'ArrayExpression') unseen.push(node.start);
		if (node.type === 'TemplateLiteral') {
			const found = startsOf(node);
			if (inClass && node.expressions.length && !found.length) unseen.push(node.start);
			if (inClass) for (const s of found) starts.add(s);
			else if (binding) for (const s of found) (named.get(binding) ?? named.set(binding, new Set()).get(binding)!).add(s);
		}
		if (inClass && node.type === 'Identifier') flows.add(node.name);
		if (inClass && node.type === 'MemberExpression' && !node.computed) {
			const name = nameOf(node.property);
			if (name) flows.add(name);
		}
		if (node.type === 'JSXAttribute') {
			const attr = nameOf(node.name);
			return visit(node.value, inClass || attr === 'class' || attr === 'className', undefined);
		}
		if (node.type === 'CallExpression') {
			const args = classArgs(node);
			visit(node.callee, inClass, undefined);
			for (const arg of node.arguments) visit(arg, inClass || args.includes(arg), undefined);
			return;
		}
		if (node.type === 'AssignmentExpression' && node.left?.type === 'MemberExpression' && nameOf(node.left.property) === 'className') return visit(node.right, true, undefined);
		if (node.type === 'VariableDeclarator') return visit(node.init, inClass, nameOf(node.id) ?? binding);
		if (node.type === 'Property' || node.type === 'ObjectProperty') return visit(node.value, inClass, (node.computed ? undefined : nameOf(node.key)) ?? binding);
		// A function's body is no class position of its caller's; what it returns goes by the function's name.
		const fn = node.type === 'ArrowFunctionExpression' || node.type === 'FunctionExpression' || node.type === 'FunctionDeclaration';
		const own = node.type === 'FunctionDeclaration' ? nameOf(node.id) : node.type === 'JSXElement' ? undefined : binding;
		for (const key of Object.keys(node)) if (key !== 'parent' && typeof node[key] === 'object') visit(node[key], fn ? false : inClass, own);
	};
	visit(program, false, undefined);
	return { starts: [...starts], named: [...named].map(([k, v]) => [k, [...v]] as const), flows: [...flows], unseen };
}

/** The class starts a set of modules builds: those in class positions, and those under a name some module puts in one. */
export function builtStarts(all: Iterable<ClassFacts>): string[] {
	const list = [...all];
	const flows = new Set(list.flatMap((f) => f.flows));
	const out = new Set(list.flatMap((f) => f.starts));
	for (const f of list) for (const [name, starts] of f.named) if (flows.has(name)) for (const s of starts) out.add(s);
	return [...out];
}

/** `tokens`, and every class longer than one of `starts` that begins with it. */
export function withBuilt(tokens: { has(token: string): boolean }, starts: Iterable<string>): { has(token: string): boolean } {
	const list = [...new Set(starts)];
	if (!list.length) return tokens;
	return { has: (token) => tokens.has(token) || list.some((s) => token.length > s.length && token.startsWith(s)) };
}
