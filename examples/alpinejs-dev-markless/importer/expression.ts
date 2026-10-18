import * as acorn from 'acorn';

type AnyNode = acorn.Node & Record<string, unknown>;

export interface Binding {
	/** What the generated component reads for this name: a state or computed variable, or a loop row's field. */
	readonly code: string;
	readonly kind: 'state' | 'computed' | 'loop';
}

export interface Scope {
	readonly vars: ReadonlyMap<string, Binding>;
	readonly parent: Scope | undefined;
	/** The x-data element's handle, for $root. */
	readonly root: () => string;
	readonly refs: Map<string, () => string>;
	/** Names of the getters in this x-data, for `this.name`. */
	readonly self: ReadonlyMap<string, Binding> | undefined;
	/** x-model bindings by ref name, for $refs.name._x_model. */
	readonly models: Map<string, string>;
}

export interface ExpressionContext {
	readonly scope: Scope;
	/** The handle of the element the directive sits on ($el, $dispatch, $focus). */
	readonly el: () => string;
	readonly locals?: readonly string[];
	/** Magic names a callback receives as parameters ($input, $width, ...), and the names the generated code gives them. */
	readonly renames?: Readonly<Record<string, string>>;
	readonly anchor?: { readonly x: string; readonly y: string };
	readonly globals: ReadonlySet<string>;
	readonly imports: Set<string>;
}

export interface Compiled {
	readonly code: string;
	readonly reads: ReadonlySet<string>;
	readonly writes: ReadonlySet<string>;
	readonly usesEvent: boolean;
}

const BROWSER_GLOBALS = new Set(['alert', 'confirm', 'prompt', 'console', 'document', 'window', 'Math', 'Array', 'Object', 'JSON', 'Number', 'String', 'Boolean', 'Date', 'parseInt', 'parseFloat', 'isNaN', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Promise', 'undefined', 'NaN', 'Infinity', 'encodeURIComponent', 'decodeURIComponent', 'localStorage', 'navigator', 'location', 'fetch', 'event']);

export function lookup(scope: Scope | undefined, name: string): Binding | undefined {
	for (let s = scope; s; s = s.parent) {
		const found = s.vars.get(name);
		if (found) return found;
	}
	return undefined;
}

function refHandle(scope: Scope | undefined, name: string): (() => string) | undefined {
	for (let s = scope; s; s = s.parent) {
		const found = s.refs.get(name);
		if (found) return found;
	}
	return undefined;
}

function refModel(scope: Scope | undefined, name: string): string | undefined {
	for (let s = scope; s; s = s.parent) {
		const found = s.models.get(name);
		if (found) return found;
	}
	return undefined;
}

function isMagicElement(node: AnyNode): boolean {
	if (node.type === 'Identifier') return node.name === '$el' || node.name === '$root';
	return node.type === 'MemberExpression' && (node.object as AnyNode).type === 'Identifier' && (node.object as AnyNode).name === '$refs';
}

function patternNames(node: AnyNode | null | undefined, into: Set<string>): void {
	if (!node) return;
	switch (node.type) {
		case 'Identifier':
			into.add(node.name as string);
			break;
		case 'ObjectPattern':
			for (const p of node.properties as AnyNode[]) patternNames((p.type === 'RestElement' ? p.argument : p.value) as AnyNode, into);
			break;
		case 'ArrayPattern':
			for (const e of node.elements as AnyNode[]) patternNames(e, into);
			break;
		case 'RestElement':
			patternNames(node.argument as AnyNode, into);
			break;
		case 'AssignmentPattern':
			patternNames(node.left as AnyNode, into);
			break;
	}
}

function scopeChainVars(scope: Scope | undefined): Map<string, string> {
	const out = new Map<string, string>();
	const chain: Scope[] = [];
	for (let s = scope; s; s = s.parent) chain.unshift(s);
	for (const s of chain) for (const [name, binding] of s.vars) out.set(name, binding.code);
	return out;
}

/** Rewrites an Alpine expression into code for the generated component: data names become its variables, magics its helpers. */
export function compile(source: string, mode: 'expression' | 'statements', context: ExpressionContext): Compiled {
	const offset = mode === 'expression' ? 1 : 0;
	const text = mode === 'expression' ? `(${source})` : source;
	const program = acorn.parse(text, { ecmaVersion: 'latest', allowReturnOutsideFunction: true, sourceType: 'script' }) as unknown as AnyNode;
	const edits: { start: number; end: number; text: string }[] = [];
	const reads = new Set<string>();
	const writes = new Set<string>();
	let usesEvent = false;
	const replace = (node: acorn.Node, value: string) => edits.push({ start: node.start, end: node.end, text: value });
	const write = (target: AnyNode, locals: ReadonlySet<string>) => {
		if (target.type === 'Identifier' && !locals.has(target.name as string)) {
			const binding = lookup(context.scope, target.name as string);
			if (binding?.kind === 'state') writes.add(binding.code);
			else if (binding) throw new Error(`cannot assign to ${binding.kind} ${target.name as string}`);
		} else if (target.type === 'MemberExpression') {
			let base = target as AnyNode;
			while (base.type === 'MemberExpression') base = base.object as AnyNode;
			if (base.type === 'Identifier' && lookup(context.scope, base.name as string) && !locals.has(base.name as string)) throw new Error(`mutating ${base.name as string} in place is not supported`);
		}
	};

	const visit = (node: AnyNode | null | undefined, locals: ReadonlySet<string>, parent?: AnyNode): void => {
		if (!node || typeof node.type !== 'string') return;
		switch (node.type) {
			case 'Identifier': {
				const name = node.name as string;
				if (context.renames && name in context.renames) return replace(node, context.renames[name]!);
				if (locals.has(name)) return;
				if (name === '$event') {
					usesEvent = true;
					return replace(node, 'event');
				}
				if (name === '$el') return replace(node, context.el());
				if (name === '$root') return replace(node, context.scope.root());
				if (name === '$data') {
					const vars = scopeChainVars(context.scope);
					for (const code of vars.values()) reads.add(code);
					return replace(node, `{ ${[...vars].map(([k, v]) => `${k}: ${v}`).join(', ')} }`);
				}
				if (name === '$focus') {
					context.imports.add('focusMagic:focus');
					return replace(node, `focusMagic(${context.el()})`);
				}
				const binding = lookup(context.scope, name);
				if (binding) {
					reads.add(binding.code);
					return replace(node, binding.code);
				}
				if (BROWSER_GLOBALS.has(name) || context.globals.has(name)) return;
				throw new Error(`unknown name ${name} in ${JSON.stringify(source)}`);
			}
			case 'ThisExpression':
				throw new Error('this outside a getter');
			case 'MemberExpression': {
				const object = node.object as AnyNode;
				const property = node.property as AnyNode;
				if (object.type === 'ThisExpression' && !node.computed && context.scope.self) {
					const binding = context.scope.self.get(property.name as string) ?? lookup(context.scope, property.name as string);
					if (!binding) throw new Error(`unknown this.${property.name as string}`);
					reads.add(binding.code);
					return replace(node, binding.code);
				}
				if (object.type === 'Identifier' && object.name === '$refs' && !node.computed) {
					const handle = refHandle(context.scope, property.name as string);
					if (!handle) throw new Error(`unknown ref ${property.name as string}`);
					return replace(node, handle());
				}
				if (object.type === 'Identifier' && object.name === '$anchor' && context.anchor && !node.computed) {
					const code = property.name === 'x' ? context.anchor.x : context.anchor.y;
					reads.add(code);
					return replace(node, code);
				}
				visit(object, locals, node);
				if (node.computed) visit(property, locals, node);
				return;
			}
			case 'CallExpression': {
				const callee = node.callee as AnyNode;
				// $refs.name._x_model.get() / .set(value): the bound property itself.
				if (callee.type === 'MemberExpression' && (callee.object as AnyNode).type === 'MemberExpression') {
					const model = callee.object as AnyNode;
					const refs = model.object as AnyNode;
					if ((model.property as AnyNode).name === '_x_model' && refs.type === 'MemberExpression' && (refs.object as AnyNode).name === '$refs') {
						const bound = refModel(context.scope, (refs.property as AnyNode).name as string);
						if (!bound) throw new Error('x-model ref not found');
						const method = (callee.property as AnyNode).name;
						if (method === 'get') {
							reads.add(bound);
							return replace(node, bound);
						}
						if (method === 'set') {
							const arg = (node.arguments as AnyNode[])[0]!;
							visit(arg, locals, node);
							writes.add(bound);
							edits.push({ start: node.start, end: arg.start, text: `(${bound} = ` });
							edits.push({ start: arg.end, end: node.end, text: ')' });
							return;
						}
					}
				}
				if (callee.type === 'Identifier' && callee.name === '$dispatch') {
					context.imports.add('dispatch:on');
					edits.push({ start: callee.start, end: callee.end, text: `dispatch(${context.el()}, ` });
					const args = node.arguments as AnyNode[];
					for (const arg of args) visit(arg, locals, node);
					// "dispatch(el, " already opened the argument list; drop the original "(".
					edits.push({ start: callee.end, end: callee.end + 1, text: '' });
					return;
				}
				visit(callee, locals, node);
				for (const arg of node.arguments as AnyNode[]) visit(arg, locals, node);
				return;
			}
			case 'Property': {
				if (parent?.type === 'ObjectExpression' && node.shorthand) {
					const name = (node.key as AnyNode).name as string;
					const binding = locals.has(name) ? undefined : lookup(context.scope, name);
					if (binding) {
						reads.add(binding.code);
						return replace(node, `${name}: ${binding.code}`);
					}
					return;
				}
				if (node.computed) visit(node.key as AnyNode, locals, node);
				visit(node.value as AnyNode, locals, node);
				return;
			}
			case 'ArrowFunctionExpression':
			case 'FunctionExpression':
			case 'FunctionDeclaration': {
				const inner = new Set(locals);
				for (const p of node.params as AnyNode[]) patternNames(p, inner);
				if (node.id) inner.add((node.id as AnyNode).name as string);
				visit(node.body as AnyNode, inner, node);
				return;
			}
			case 'VariableDeclarator':
				visit(node.init as AnyNode, locals, node);
				return;
			case 'BlockStatement':
			case 'Program': {
				const inner = new Set(locals);
				for (const statement of node.body as AnyNode[]) {
					if (statement.type === 'VariableDeclaration') for (const d of statement.declarations as AnyNode[]) patternNames(d.id as AnyNode, inner);
				}
				for (const statement of node.body as AnyNode[]) visit(statement, inner, node);
				return;
			}
			case 'AssignmentExpression': {
				const left = node.left as AnyNode;
				// An element handle is read-only in Markless; a property write on the element goes through assign().
				if (left.type === 'MemberExpression' && !left.computed && node.operator === '=' && isMagicElement(left.object as AnyNode)) {
					context.imports.add('assign:bind');
					visit(left.object as AnyNode, locals, left);
					visit(node.right as AnyNode, locals, node);
					edits.push({ start: node.start, end: (left.object as AnyNode).start, text: 'assign(' });
					edits.push({ start: (left.object as AnyNode).end, end: (node.right as AnyNode).start, text: `, ${JSON.stringify((left.property as AnyNode).name)}, ` });
					edits.push({ start: (node.right as AnyNode).end, end: node.end, text: ')' });
					return;
				}
				write(node.left as AnyNode, locals);
				visit(node.left as AnyNode, locals, node);
				visit(node.right as AnyNode, locals, node);
				return;
			}
			case 'UpdateExpression':
				write(node.argument as AnyNode, locals);
				visit(node.argument as AnyNode, locals, node);
				return;
			case 'TemplateLiteral':
				for (const e of node.expressions as AnyNode[]) visit(e, locals, node);
				return;
		}
		for (const [key, value] of Object.entries(node)) {
			if (key === 'type' || key === 'start' || key === 'end') continue;
			if (Array.isArray(value)) for (const v of value) visit(v as AnyNode, locals, node);
			else if (value && typeof value === 'object' && typeof (value as AnyNode).type === 'string') visit(value as AnyNode, locals, node);
		}
	};
	visit(program, new Set(context.locals ?? []));
	edits.sort((a, b) => b.start - a.start || b.end - a.end);
	let out = text;
	for (const edit of edits) out = out.slice(0, edit.start) + edit.text + out.slice(edit.end);
	if (mode === 'expression') out = out.slice(1, -1);
	void offset;
	return { code: out.trim(), reads, writes, usesEvent };
}

/** The properties of an x-data object literal, as written: values, getters and methods. */
export interface DataProperty {
	readonly name: string;
	readonly kind: 'value' | 'getter' | 'method';
	readonly source: string;
}

export function dataProperties(source: string): DataProperty[] {
	if (!source.trim()) return [];
	const program = acorn.parse(`(${source})`, { ecmaVersion: 'latest' }) as unknown as AnyNode;
	const expression = ((program.body as AnyNode[])[0] as AnyNode).expression as AnyNode;
	if (expression.type !== 'ObjectExpression') throw new Error(`x-data is not an object literal: ${source}`);
	const text = `(${source})`;
	return (expression.properties as AnyNode[]).map((p) => {
		const name = ((p.key as AnyNode).name ?? (p.key as AnyNode).value) as string;
		const value = p.value as AnyNode;
		if (p.kind === 'get') return { name, kind: 'getter', source: text.slice(((value.body as AnyNode).start) + 1, (value.body as AnyNode).end - 1) };
		if (p.method || value.type === 'FunctionExpression' || value.type === 'ArrowFunctionExpression') return { name, kind: 'method', source: text.slice(value.start, value.end) };
		return { name, kind: 'value', source: text.slice(value.start, value.end) };
	});
}

/** Evaluates an Alpine expression at build time against the initial data, the way Alpine's evaluator does (with). */
export function evaluateInitial(source: string, data: Record<string, unknown>): unknown {
	// eslint-disable-next-line no-new-func
	return new Function('__data', `with (__data) { return (${source}); }`)(new Proxy(data, { has: (target, key) => key in target || (typeof key === 'string' && key.startsWith('$')), get: (target, key) => (key in target ? target[key as string] : undefined) }));
}

export function initialData(sources: readonly string[]): Record<string, unknown> {
	const merged: Record<string, unknown> = {};
	for (const source of sources) {
		if (!source.trim()) continue;
		// eslint-disable-next-line no-new-func
		const value = new Function('$persist', `return (${source});`)((v: unknown) => v) as Record<string, unknown>;
		Object.defineProperties(merged, Object.getOwnPropertyDescriptors(value));
	}
	return merged;
}
