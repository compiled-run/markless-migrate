import { parse, type ParseResult } from 'yuku';
import { CHILD_KEYS } from 'yuku/ast';

// yuku emits ESTree; a loose node type keeps the walkers readable.
export type N = { type: string; start: number; end: number; [key: string]: any };

export interface Module {
	readonly file: string;
	readonly text: string;
	readonly program: N;
	readonly line: (offset: number) => number;
	readonly imports: ReadonlyMap<string, { source: string; imported: string; line: number }>;
	/** Top-level bindings: name to its declarator init, function or class node. */
	readonly bindings: ReadonlyMap<string, N>;
	/** Exported name to the local node it exports (`default` included). */
	readonly exports: ReadonlyMap<string, N>;
	/** `export { a as b } from './x'` and `export * from './x'`: exported name to source and imported name; `*` lists star sources. */
	readonly reexports: ReadonlyMap<string, { source: string; imported: string }>;
	readonly starExports: readonly string[];
	/** Markup outside script blocks in .vue/.svelte/.astro/.html, scripts blanked to spaces. */
	readonly template: string;
	readonly ok: boolean;
}

/** The parse's error diagnostics; yuku also reports warnings, which do not make a parse fail. */
export const errorsOf = (result: ParseResult) => result.diagnostics.filter((d) => d.severity === 'error');

export function lineIndex(text: string): (offset: number) => number {
	const starts = [0];
	for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) starts.push(i + 1);
	return (offset) => {
		let lo = 0;
		let hi = starts.length - 1;
		while (lo < hi) {
			const mid = (lo + hi + 1) >> 1;
			if (starts[mid]! <= offset) lo = mid;
			else hi = mid - 1;
		}
		return lo + 1;
	};
}

const blank = (s: string) => s.replace(/[^\n]/g, ' ');

/** Splits a single-file component into its script (other text blanked, so offsets match the file) and its markup. */
export function splitComponent(file: string, text: string): { script: string; template: string; lang: 'ts' | 'tsx' | 'js' } {
	if (/\.(m?[jt]sx?|cjs|cts)$/.test(file)) {
		const lang = /\.[cm]?tsx$/.test(file) ? 'tsx' : /\.[cm]?ts$/.test(file) ? 'ts' : 'tsx';
		return { script: text, template: '', lang: /\.(m?js|cjs)$/.test(file) ? 'tsx' : lang };
	}
	const ranges: [number, number][] = [];
	let ts = false;
	if (file.endsWith('.astro')) {
		const fm = /^(\s*)---\r?\n([\s\S]*?)\r?\n---/.exec(text);
		if (fm) {
			const start = fm[1]!.length + 4;
			ranges.push([start, start + fm[2]!.length]);
			ts = true;
		}
	}
	for (const m of text.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
		const attrs = m[1]!;
		if (/\bsrc=|type=["'](?!module|text\/javascript|module\b)[^"']*["']/i.test(attrs)) continue;
		if (/lang=["']ts/.test(attrs)) ts = true;
		const start = m.index! + m[0].indexOf('>') + 1;
		ranges.push([start, start + m[2]!.length]);
	}
	let script = '';
	let template = '';
	let at = 0;
	for (const [s, e] of ranges) {
		script += blank(text.slice(at, s)) + text.slice(s, e);
		template += text.slice(at, s) + blank(text.slice(s, e));
		at = e;
	}
	script += blank(text.slice(at));
	template += text.slice(at);
	template = template.replace(/<style\b[\s\S]*?<\/style>/gi, blank);
	return { script, template, lang: ts ? 'ts' : 'js' };
}

export function parseModule(file: string, text: string): Module {
	const { script, template, lang } = splitComponent(file, text);
	let result = parse(script, { lang, preserveParens: false, sourceType: 'module' });
	let errors = errorsOf(result);
	const retries: ['ts' | 'tsx' | 'js', 'module' | 'commonjs'][] = [...(lang === 'tsx' ? [['ts', 'module'] as ['ts', 'module']] : []), ...(file.endsWith('.astro') ? [[lang, 'commonjs'] as [typeof lang, 'commonjs']] : [])];
	for (const [l, sourceType] of retries) {
		if (!errors.length) break;
		const retry = parse(script, { lang: l, preserveParens: false, sourceType });
		const retryErrors = errorsOf(retry);
		if (retryErrors.length < errors.length) [result, errors] = [retry, retryErrors];
	}
	const program = result.program as unknown as N;
	const imports = new Map<string, { source: string; imported: string; line: number }>();
	const bindings = new Map<string, N>();
	const exports = new Map<string, N>();
	const reexports = new Map<string, { source: string; imported: string }>();
	const starExports: string[] = [];
	const line = lineIndex(text);
	const declare = (decl: N, exported: boolean) => {
		if (decl.type === 'VariableDeclaration') {
			for (const d of decl.declarations as N[]) {
				for (const name of patternNames(d.id)) {
					bindings.set(name, d.init ?? d);
					if (exported) exports.set(name, d.init ?? d);
				}
				const req = d.init ? requireSource(d.init) : undefined;
				if (req !== undefined) {
					if (d.id.type === 'Identifier') imports.set(d.id.name, { source: req, imported: 'default', line: line(d.start) });
					else if (d.id.type === 'ObjectPattern') for (const p of d.id.properties as N[]) if (p.type === 'Property' && p.value.type === 'Identifier') imports.set(p.value.name, { source: req, imported: keyName(p.key) ?? p.value.name, line: line(d.start) });
				}
			}
		} else if ((decl.type === 'FunctionDeclaration' || decl.type === 'ClassDeclaration' || decl.type === 'TSEnumDeclaration') && decl.id) {
			bindings.set(decl.id.name, decl);
			if (exported) exports.set(decl.id.name, decl);
		}
	};
	for (const stmt of program.body as N[]) {
		if (stmt.type === 'ImportDeclaration') {
			for (const s of stmt.specifiers as N[]) {
				const imported = s.type === 'ImportDefaultSpecifier' ? 'default' : s.type === 'ImportNamespaceSpecifier' ? '*' : (keyName(s.imported) ?? '');
				imports.set(s.local.name, { source: stmt.source.value, imported, line: line(stmt.start) });
			}
		} else if (stmt.type === 'ExportNamedDeclaration') {
			if (stmt.declaration) declare(stmt.declaration, true);
			for (const s of (stmt.specifiers ?? []) as N[]) {
				const local = keyName(s.local) ?? '';
				if (stmt.source) reexports.set(keyName(s.exported) ?? local, { source: stmt.source.value, imported: local });
				else exports.set(keyName(s.exported) ?? local, bindings.get(local) ?? s);
			}
		} else if (stmt.type === 'ExportAllDeclaration') {
			if (stmt.exported) reexports.set(keyName(stmt.exported) ?? '', { source: stmt.source.value, imported: '*' });
			else starExports.push(stmt.source.value);
		} else if (stmt.type === 'ExportDefaultDeclaration') {
			const d = stmt.declaration as N;
			if ((d.type === 'FunctionDeclaration' || d.type === 'ClassDeclaration') && d.id) bindings.set(d.id.name, d);
			exports.set('default', d.type === 'Identifier' ? (bindings.get(d.name) ?? d) : d);
		} else declare(stmt, false);
	}
	for (const stmt of program.body as N[]) {
		if (stmt.type === 'ExportDefaultDeclaration' && stmt.declaration.type === 'Identifier') exports.set('default', bindings.get(stmt.declaration.name) ?? stmt.declaration);
		if (stmt.type === 'ExportNamedDeclaration' && !stmt.declaration && !stmt.source) for (const s of (stmt.specifiers ?? []) as N[]) exports.set(keyName(s.exported) ?? '', bindings.get(keyName(s.local) ?? '') ?? s);
		const assigned = stmt.type === 'ExpressionStatement' && stmt.expression.type === 'AssignmentExpression' ? stmt.expression : undefined;
		if (assigned && memberName(assigned.left) === 'module.exports') exports.set('default', assigned.right);
	}
	return { file, text, program, line, imports, bindings, exports, reexports, starExports, template, ok: errors.length === 0 };
}

function requireSource(node: N): string | undefined {
	if (node.type === 'CallExpression' && node.callee.type === 'Identifier' && node.callee.name === 'require' && node.arguments[0]?.type === 'Literal') return String(node.arguments[0].value);
	if (node.type === 'AwaitExpression' && node.argument.type === 'ImportExpression' && node.argument.source.type === 'Literal') return String(node.argument.source.value);
	return undefined;
}

export function patternNames(node: N | null | undefined): string[] {
	if (!node) return [];
	switch (node.type) {
		case 'Identifier':
			return [node.name];
		case 'ObjectPattern':
			return (node.properties as N[]).flatMap((p) => patternNames(p.type === 'RestElement' ? p.argument : p.value));
		case 'ArrayPattern':
			return (node.elements as N[]).flatMap((e) => patternNames(e));
		case 'AssignmentPattern':
			return patternNames(node.left);
		case 'RestElement':
			return patternNames(node.argument);
		default:
			return [];
	}
}

export function keyName(node: N | null | undefined): string | undefined {
	if (!node) return undefined;
	if (node.type === 'Identifier' || node.type === 'PrivateIdentifier') return node.name;
	if (node.type === 'Literal') return String(node.value);
	return undefined;
}

export const unwrap = (node: N | null | undefined): N | undefined => {
	let n = node ?? undefined;
	while (n && (n.type === 'TSAsExpression' || n.type === 'TSSatisfiesExpression' || n.type === 'TSNonNullExpression' || n.type === 'ParenthesizedExpression' || n.type === 'TSTypeAssertion' || n.type === 'ChainExpression' || n.type === 'AwaitExpression')) n = n.expression ?? n.argument;
	return n;
};

/** `a.b.c` for a member chain of plain names, `a.b().c` when calls sit in between; undefined otherwise. */
export function memberName(node: N | null | undefined): string | undefined {
	const n = unwrap(node);
	if (!n) return undefined;
	if (n.type === 'Identifier') return n.name;
	if (n.type === 'ThisExpression') return 'this';
	if (n.type === 'MetaProperty') return `${n.meta.name}.${n.property.name}`;
	if (n.type === 'MemberExpression') {
		const object = memberName(n.object);
		if (object === undefined) return undefined;
		const prop = n.computed ? (n.property.type === 'Literal' ? String(n.property.value) : '[]') : n.property.name;
		return `${object}.${prop}`;
	}
	if (n.type === 'CallExpression') {
		const callee = memberName(n.callee);
		return callee === undefined ? undefined : `${callee}()`;
	}
	return undefined;
}

export const rootName = (node: N | null | undefined): string | undefined => memberName(node)?.split(/[.(]/)[0];

const KEYS = CHILD_KEYS;

/** Depth-first walk; return false from `enter` to skip a node's children. */
export function walk(node: N, enter: (node: N, ancestors: readonly N[]) => void | false, ancestors: N[] = []): void {
	if (enter(node, ancestors) === false) return;
	const keys = KEYS[node.type];
	if (!keys) return;
	ancestors.push(node);
	for (const key of keys) {
		const child = node[key];
		if (Array.isArray(child)) {
			for (const c of child) if (c && typeof c.type === 'string') walk(c, enter, ancestors);
		} else if (child && typeof child.type === 'string') walk(child, enter, ancestors);
	}
	ancestors.pop();
}

export const isFunction = (n: N | undefined): boolean => !!n && (n.type === 'FunctionDeclaration' || n.type === 'FunctionExpression' || n.type === 'ArrowFunctionExpression');

export function enclosingFunction(ancestors: readonly N[]): N | undefined {
	for (let i = ancestors.length - 1; i >= 0; i--) if (isFunction(ancestors[i])) return ancestors[i];
	return undefined;
}

/** The function a binding names: the function itself, or the function a call like `memo(fn)` wraps. */
export function functionOf(node: N | undefined, mod?: Module, depth = 0): N | undefined {
	const n = unwrap(node);
	if (!n || depth > 4) return undefined;
	if (isFunction(n)) return n;
	if (n.type === 'VariableDeclarator') return functionOf(n.init, mod, depth + 1);
	if (n.type === 'Identifier' && mod) return functionOf(mod.bindings.get(n.name), mod, depth + 1);
	if (n.type === 'CallExpression') {
		for (const arg of n.arguments as N[]) {
			const f = functionOf(arg, mod, depth + 1);
			if (f) return f;
		}
	}
	return undefined;
}

const UNKNOWN = Symbol('unknown');

/** A value computed without running code: literals, arrays and objects of them, and top-level consts. */
export function staticValue(node: N | null | undefined, mod?: Module, depth = 0): unknown {
	const n = unwrap(node);
	if (!n || depth > 8) return UNKNOWN;
	switch (n.type) {
		case 'Literal':
			return n.value;
		case 'TemplateLiteral':
			if (n.expressions.length) {
				let out = '';
				for (let i = 0; i < n.quasis.length; i++) {
					out += n.quasis[i].value.cooked ?? n.quasis[i].value.raw;
					if (i < n.expressions.length) {
						const v = staticValue(n.expressions[i], mod, depth + 1);
						if (v === UNKNOWN || typeof v === 'object') return UNKNOWN;
						out += String(v);
					}
				}
				return out;
			}
			return n.quasis.map((q: N) => q.value.cooked ?? q.value.raw).join('');
		case 'TaggedTemplateExpression':
			return n.quasi.expressions.length ? UNKNOWN : staticValue(n.quasi, mod, depth + 1);
		case 'ArrayExpression':
			return (n.elements as N[]).map((e) => (e?.type === 'SpreadElement' ? UNKNOWN : staticValue(e, mod, depth + 1)));
		case 'ObjectExpression': {
			const out: Record<string, unknown> = {};
			for (const p of n.properties as N[]) {
				if (p.type !== 'Property') continue;
				const key = p.computed ? staticValue(p.key, mod, depth + 1) : keyName(p.key);
				if (typeof key === 'string' || typeof key === 'number') out[String(key)] = p.value.type === 'Identifier' && p.shorthand && !mod?.bindings.has(p.value.name) ? UNKNOWN : staticValue(p.value, mod, depth + 1);
			}
			return out;
		}
		case 'BinaryExpression':
			if (n.operator === '+') {
				const l = staticValue(n.left, mod, depth + 1);
				const r = staticValue(n.right, mod, depth + 1);
				if (l === UNKNOWN || r === UNKNOWN) return UNKNOWN;
				return (l as string) + (r as string);
			}
			return UNKNOWN;
		case 'UnaryExpression':
			if (n.operator === '-' && n.argument.type === 'Literal') return -n.argument.value;
			if (n.operator === '!' && n.argument.type === 'Literal') return !n.argument.value;
			return UNKNOWN;
		case 'Identifier': {
			if (n.name === 'undefined') return undefined;
			const bound = mod?.bindings.get(n.name);
			return bound && bound.type !== 'VariableDeclarator' && !isFunction(bound) && bound.type !== 'ClassDeclaration' ? staticValue(bound, mod, depth + 1) : UNKNOWN;
		}
		default:
			return UNKNOWN;
	}
}

export const known = (v: unknown) => v !== UNKNOWN;
export const str = (node: N | null | undefined, mod?: Module): string | undefined => {
	const v = staticValue(node, mod);
	return typeof v === 'string' ? v : undefined;
};

export const envName = (node: N | null | undefined): string | undefined => {
	const name = memberName(node);
	const m = name && /^(?:process\.env|import\.meta\.env|Deno\.env)\.([A-Za-z_][\w]*)$/.exec(name);
	return m ? m[1] : undefined;
};

/** The initialiser of `name` declared inside `scope` (a function), if any. */
export function localInit(scope: N | undefined, name: string): N | undefined {
	if (!scope) return undefined;
	let init: N | undefined;
	walk(scope, (n) => {
		if (!init && n.type === 'VariableDeclarator' && n.id.type === 'Identifier' && n.id.name === name && n.init) init = n.init;
	});
	return init;
}

const placeholderName = (node: N) => memberName(node)?.split(/[.(]/).filter(Boolean).pop()?.replace(/\W/g, '') || 'param';

/**
 * A URL or path with what is not static replaced: `${ENV}` for an environment variable, `${name}` for
 * another value at the start (an unknown base), `:name` for a value inside the path. Undefined when
 * nothing about it is static.
 */
export function urlText(node: N | null | undefined, mod?: Module, scope?: N, depth = 0): string | undefined {
	const n = unwrap(node);
	if (!n || depth > 6) return undefined;
	const s = str(n, mod);
	if (s !== undefined) return s;
	const env = envName(n);
	if (env) return `\${${env}}`;
	const part = (e: N, leading: boolean) => urlText(e, mod, scope, depth + 1) ?? (leading ? `\${${memberName(e) ?? 'base'}}` : `:${placeholderName(e)}`);
	if (n.type === 'TemplateLiteral') {
		let out = '';
		for (let i = 0; i < n.quasis.length; i++) {
			out += n.quasis[i].value.cooked ?? n.quasis[i].value.raw;
			if (i < n.expressions.length) out += part(n.expressions[i], out === '');
		}
		return out;
	}
	if (n.type === 'BinaryExpression' && n.operator === '+') {
		const l = urlText(n.left, mod, scope, depth + 1);
		const r = urlText(n.right, mod, scope, depth + 1);
		if (l === undefined && r === undefined) return undefined;
		return (l ?? part(n.left, true)) + (r ?? part(n.right, false));
	}
	if (n.type === 'NewExpression' && memberName(n.callee) === 'URL') {
		const path = urlText(n.arguments[0], mod, scope, depth + 1);
		const base = n.arguments[1] ? urlText(n.arguments[1], mod, scope, depth + 1) : undefined;
		if (path === undefined) return undefined;
		return base && !/^https?:/.test(path) && /^\$\{|^https?:/.test(base) ? base.replace(/\/$/, '') + (path.startsWith('/') ? path : `/${path}`) : path;
	}
	if (n.type === 'Identifier') {
		const local = localInit(scope, n.name);
		if (local) return urlText(local, mod, scope, depth + 1);
		const bound = mod?.bindings.get(n.name);
		if (bound && bound.type !== 'VariableDeclarator' && !isFunction(bound)) return urlText(bound, mod, scope, depth + 1);
	}
	if (n.type === 'LogicalExpression') return urlText(n.left, mod, scope, depth + 1) ?? urlText(n.right, mod, scope, depth + 1);
	return undefined;
}

/** Text of a template literal with interpolations dropped (fragments), for GraphQL and GROQ. */
export function queryText(node: N | null | undefined, mod?: Module): string | undefined {
	const n = unwrap(node);
	if (!n) return undefined;
	if (n.type === 'TaggedTemplateExpression') return queryText(n.quasi, mod);
	if (n.type === 'TemplateLiteral') return n.quasis.map((q: N) => q.value.cooked ?? q.value.raw).join(' ');
	if (n.type === 'CallExpression' && n.arguments.length === 1) return queryText(n.arguments[0], mod);
	if (n.type === 'Identifier') {
		const bound = mod?.bindings.get(n.name);
		if (bound && bound.type !== 'VariableDeclarator' && !isFunction(bound)) return queryText(bound, mod);
		return undefined;
	}
	return str(n, mod);
}

export function property(obj: N | undefined, name: string): N | undefined {
	const o = unwrap(obj);
	if (!o || o.type !== 'ObjectExpression') return undefined;
	for (const p of o.properties as N[]) if (p.type === 'Property' && !p.computed && keyName(p.key) === name) return p.value;
	return undefined;
}

export function parseJsonc(text: string): unknown {
	const result = parse(`(${text})`, { preserveParens: false });
	if (errorsOf(result).length) return undefined;
	const stmt = (result.program.body[0] as unknown as N | undefined)?.expression as N | undefined;
	const value = staticValue(stmt);
	return known(value) ? value : undefined;
}

/** Callee names reached from a function body: plain calls and member calls, with their nodes. */
export function callsIn(node: N): { name: string; node: N }[] {
	const out: { name: string; node: N }[] = [];
	walk(node, (n) => {
		if (n.type === 'CallExpression' || n.type === 'NewExpression') {
			const name = memberName(n.callee);
			if (name) out.push({ name, node: n });
		}
	});
	return out;
}
