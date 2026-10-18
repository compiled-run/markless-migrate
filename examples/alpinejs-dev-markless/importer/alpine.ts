import * as acorn from 'acorn';
import { parseFragment, type DefaultTreeAdapterMap } from 'parse5';
import type { DemoRef } from './docs-page.ts';
import { compile, dataProperties, evaluateInitial, initialData, lookup, type Binding, type Compiled, type Scope } from './expression.ts';
import { attribute, entities, htmlToTsrx, lit } from './tsrx.ts';

type Node = DefaultTreeAdapterMap['childNode'];
type Element = DefaultTreeAdapterMap['element'];
type TextNode = DefaultTreeAdapterMap['textNode'];

export interface Translated {
	readonly refs: readonly DemoRef[];
	readonly module: string | undefined;
}

interface Directive {
	readonly type: string;
	readonly value: string;
	readonly modifiers: readonly string[];
	readonly expression: string;
	readonly raw: string;
}

const isElement = (node: Node | undefined): node is Element => !!node && 'tagName' in node;
const ALPINE_ATTR = /^(x-|@|:)/;
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const EVENT_PROPS: Record<string, string> = { click: 'onClick', dblclick: 'onDblClick', input: 'onInput', change: 'onChange', keydown: 'onKeyDown', keyup: 'onKeyUp', focus: 'onFocus', blur: 'onBlur', mousemove: 'onMouseMove', mouseout: 'onMouseOut', mouseover: 'onMouseOver', mouseenter: 'onMouseEnter', mouseleave: 'onMouseLeave', mousedown: 'onMouseDown', mouseup: 'onMouseUp', submit: 'onSubmit', scroll: 'onScroll', touchstart: 'onTouchStart', touchmove: 'onTouchMove', contextmenu: 'onContextMenu' };
const PROP_MODIFIERS = new Set(['window', 'document', 'outside', 'away', 'once', 'capture', 'passive', 'debounce', 'throttle', 'dot', 'camel']);

function parseDirective(name: string, expression: string): Directive | undefined {
	if (!ALPINE_ATTR.test(name)) return undefined;
	let full = name;
	if (full.startsWith('@')) full = `x-on:${full.slice(1)}`;
	else if (full.startsWith(':')) full = `x-bind${full}`;
	const match = /^x-([^:.]+)(?::([^.]+))?((?:\.[^.]+)*)$/.exec(full);
	if (!match) throw new Error(`cannot read directive ${name}`);
	return { type: match[1]!, value: match[2] ?? '', modifiers: match[3] ? match[3].slice(1).split('.') : [], expression, raw: name };
}

const directivesOf = (el: Element) => el.attrs.flatMap((a) => parseDirective(a.prefix ? `${a.prefix}:${a.name}` : a.name, a.value) ?? []);
const staticAttrs = (el: Element) => el.attrs.filter((a) => !ALPINE_ATTR.test(a.name) && !a.name.startsWith('wire:'));
const attrValue = (el: Element, name: string) => el.attrs.find((a) => a.name === name)?.value;
const children = (el: Element): Node[] => (el.tagName === 'template' ? ((el as unknown as { content: { childNodes: Node[] } }).content.childNodes as Node[]) : (el.childNodes as Node[]));

function hasAlpine(nodes: readonly Node[]): boolean {
	return nodes.some((n) => isElement(n) && (n.tagName === 'script' || n.attrs.some((a) => ALPINE_ATTR.test(a.name)) || hasAlpine(children(n))));
}

interface Handler {
	readonly body: string;
	readonly writes: ReadonlySet<string>;
	/** The element whose own model write this is, so its own value is not written back. */
	readonly self?: string;
}

interface Reaction {
	readonly deps: ReadonlySet<string>;
	readonly code: string;
	readonly el?: string;
}

const RESERVED = new Set(['event', 'state', 'computed', 'element', 'text', 'attr', 'cls', 'sty', 'show', 'trap', 'anchor', 'listen', 'passes', 'dispatch', 'focusMagic', 'modelValue', 'syncModel', 'mask', 'sort', 'intersect', 'resize', 'persist', 'persisted', 'setStyles', 'rows', 'default', 'new', 'delete', 'class', 'function', 'var', 'let', 'const', 'in', 'of', 'if', 'for', 'do', 'while', 'switch', 'case', 'return', 'this', 'with', 'void', 'typeof']);

class Component {
	readonly decls: string[] = [];
	readonly idle: string[] = [];
	readonly handlers: Handler[] = [];
	readonly reactions: Reaction[] = [];
	readonly computedDeps = new Map<string, ReadonlySet<string>>();
	readonly imports: Set<string>;
	readonly globals: Set<string>;
	readonly names = new Set<string>();
	readonly handles = new Map<Element, string>();
	readonly persisted = new Map<string, string>();
	readonly scopes = new Map<Element, { scope: Scope; data: Record<string, unknown> }>();
	private counter = 0;

	constructor(imports: Set<string>, globals: Set<string>) {
		this.imports = imports;
		this.globals = globals;
	}

	name(base: string): string {
		let candidate = base.replace(/[^\w$]/g, '_');
		if (RESERVED.has(candidate) || this.globals.has(candidate)) candidate = `${candidate}_`;
		let n = 2;
		const original = candidate;
		while (this.names.has(candidate)) candidate = `${original}_${n++}`;
		this.names.add(candidate);
		return candidate;
	}

	fresh(prefix: string): string {
		return this.name(`${prefix}${this.counter++}`);
	}

	handle(el: Element): string {
		let h = this.handles.get(el);
		if (!h) {
			h = this.fresh('el');
			this.handles.set(el, h);
			this.decls.push(`const ${h} = element<HTMLElement>();`);
			this.imports.add('element:core');
		}
		return h;
	}

	/** A handler body: the statements, then every reaction to what they wrote. Placeholders resolve once all reactions are known. */
	handler(body: string, writes: ReadonlySet<string>, self?: string): string {
		this.handlers.push({ body, writes, self });
		return `__HANDLER_${this.handlers.length - 1}__`;
	}

	expand(deps: Iterable<string>): Set<string> {
		const out = new Set<string>();
		const add = (d: string) => {
			if (out.has(d)) return;
			out.add(d);
			for (const inner of this.computedDeps.get(d) ?? []) add(inner);
		};
		for (const d of deps) add(d);
		return out;
	}

	renderHandler(index: number, depth: number): string {
		const handler = this.handlers[index]!;
		const lines = handler.body ? [handler.body.replace(/;?\s*$/, ';')] : [];
		const written = new Set(handler.writes);
		for (const reaction of this.reactions) {
			if (reaction.el && reaction.el === handler.self) continue;
			if ([...this.expand(reaction.deps)].some((d) => written.has(d))) lines.push(reaction.code);
		}
		for (const [variable, key] of this.persisted) if (written.has(variable)) lines.push(`persist(${lit(key)}, ${variable});`);
		const pad = '\t'.repeat(depth);
		return `{\n${lines.map((l) => `${pad}\t${l}`).join('\n')}\n${pad}}`;
	}
}

interface Walk {
	readonly component: Component;
	readonly scope: Scope;
	readonly data: Record<string, unknown>;
	readonly static: boolean;
}

const MODULE_IMPORTS: Record<string, string> = { core: '@markless/core', bind: './alpine/bind.ts', show: './alpine/show.ts', on: './alpine/on.ts', model: './alpine/model.ts', focus: './alpine/focus.ts', anchor: './alpine/anchor.ts', observe: './alpine/observe.ts', mask: './alpine/mask.ts', sort: './alpine/sort.ts', persist: './alpine/persist.ts' };

export const failures: string[] = [];

/** Turns each Alpine demo of a docs page into a Markless component by rule: x-data becomes state, directives become bindings, handlers and the ported plugin behaviours. */
export function translateDemos(demos: readonly string[], context: { route: string; up: string }): Translated {
	const imports = new Set<string>();
	const moduleCode: string[] = [];
	const refs: DemoRef[] = [];
	demos.forEach((html, index) => {
		const nodes = parseFragment(html).childNodes as Node[];
		if (!hasAlpine(nodes)) {
			refs.push({ name: `Demo${index}`, inline: htmlToTsrx(html, 4) });
			return;
		}
		try {
			moduleCode.push(translateDemo(nodes, `Demo${index}`, imports));
			refs.push({ name: `Demo${index}` });
		} catch (error) {
			failures.push(`${context.route} demo ${index}: ${(error as Error).message}`);
			refs.push({ name: `Demo${index}`, inline: '' });
		}
	});
	if (!moduleCode.length) return { refs, module: undefined };
	const byModule = new Map<string, Set<string>>();
	for (const entry of imports) {
		const [name, module] = entry.split(':') as [string, string];
		if (!byModule.has(module)) byModule.set(module, new Set());
		byModule.get(module)!.add(name);
	}
	const head = [...byModule].map(([module, names]) => `import { ${[...names].sort().join(', ')} } from '${MODULE_IMPORTS[module]!.replace('./alpine/', `${context.up}components/alpine/`)}';`);
	return { refs, module: `// Generated by importer/run.ts from content/; edit the importer or the content, not this file.\n${head.join('\n')}\n\n${moduleCode.join('\n\n')}\n` };
}

function translateDemo(input: Node[], name: string, imports: Set<string>): string {
	const globals = new Set<string>();
	const preamble: string[] = [];
	let nodes = input.filter((n) => n.nodeName !== '#comment' && !(n.nodeName === '#text' && !(n as TextNode).value.trim()));
	const scripts = nodes.filter((n): n is Element => isElement(n) && n.tagName === 'script');
	nodes = nodes.filter((n) => !scripts.includes(n as Element));
	let morph: Morph | undefined;
	for (const script of scripts) {
		const source = (script.childNodes[0] as TextNode | undefined)?.value ?? '';
		if (source.includes('Alpine.morph')) {
			morph = readMorph(source);
			continue;
		}
		const program = acorn.parse(source, { ecmaVersion: 'latest' }) as unknown as { body: (acorn.Node & { type: string; id?: { name: string } })[] };
		for (const statement of program.body) {
			if (statement.type !== 'FunctionDeclaration') throw new Error('demo script holds more than functions');
			globals.add(statement.id!.name);
			preamble.push(source.slice(statement.start, statement.end).replace(/^ {4}/gm, ''));
		}
	}
	if (nodes.length !== 1 || !isElement(nodes[0])) throw new Error('a demo must have one root element');
	const root = nodes[0];
	teleport(root);
	const component = new Component(imports, globals);
	imports.add('state:core');
	const topScope: Scope = { vars: new Map(), parent: undefined, root: () => component.handle(root), refs: new Map(), self: undefined, models: new Map() };
	if (morph) prepareMorph(root, morph, component);
	const markup = emit(root, 2, { component, scope: topScope, data: {}, static: false });
	if (component.idle.length) {
		const h = component.handle(root);
		void h;
	}
	let out = markup;
	if (component.idle.length) {
		const idle = component.idle.map((l) => `\t\t\t${l}`).join('\n');
		// The demo's setup (window, document and custom-event listeners, plugin behaviours) runs when the page goes idle.
		out = out.replace(/^(\t*<[\w-]+)/, (_, open: string) => `${open} onIdle={() => {\n${idle}\n\t\t}}`);
	}
	out = out.replace(/ ?__ELREF_(\d+)__/g, (_, id: string) => {
		const h = component.handles.get(byId[Number(id)]!);
		return h ? ` el={${h}}` : '';
	});
	for (let pass = 0; pass < 3; pass++) {
		out = out.replace(/__HANDLER_(\d+)__/g, (_, i: string, offset: number) => {
			const lineStart = out.lastIndexOf('\n', offset) + 1;
			const depth = /^\t*/.exec(out.slice(lineStart))![0].length;
			return component.renderHandler(Number(i), depth);
		});
	}
	return `${preamble.join('\n\n')}${preamble.length ? '\n\n' : ''}export function ${name}() @{\n${component.decls.map((d) => `\t${d}`).join('\n')}\n\n${out}}`;
}

// x-teleport="#id" moves the template's content to the end of the target as Alpine does when it starts; the template stays.
function teleport(root: Element): void {
	const byId = (node: Node, id: string): Element | undefined => {
		if (!isElement(node)) return undefined;
		if (attrValue(node, 'id') === id) return node;
		for (const child of children(node)) {
			const found = byId(child, id);
			if (found) return found;
		}
		return undefined;
	};
	const visit = (node: Node, scopes: Element[]) => {
		if (!isElement(node)) return;
		const directives = directivesOf(node);
		const inner = directives.some((d) => d.type === 'data') ? [...scopes, node] : scopes;
		const port = directives.find((d) => d.type === 'teleport');
		if (port) {
			const target = byId(root, port.expression.replace(/^#/, ''));
			if (!target) throw new Error(`teleport target ${port.expression} is outside the demo`);
			const content = children(node).find(isElement)!;
			const forwarded = directives.filter((d) => d.type === 'on');
			for (const d of forwarded) content.attrs.push({ name: d.raw, value: d.expression });
			const moved = { ...content } as Element;
			(moved as unknown as { teleportedFrom: Element[] }).teleportedFrom = inner;
			target.childNodes.push(moved as unknown as DefaultTreeAdapterMap['childNode']);
			(node as unknown as { content: { childNodes: Node[] } }).content.childNodes = [];
			node.attrs = node.attrs.filter((a) => !ALPINE_ATTR.test(a.name));
			visit(moved, inner);
			return;
		}
		for (const child of [...children(node)]) visit(child, inner);
	};
	visit(root, []);
}

interface Morph {
	readonly button: string;
	readonly target: string;
	readonly html: string;
}

function readMorph(source: string): Morph {
	const button = /querySelector\('#([\w-]+)'\)\.addEventListener\('click'/.exec(source)?.[1];
	const target = /let el = document\.querySelector\('#([\w-]+)'\)/.exec(source)?.[1];
	const html = /Alpine\.morph\(el, `([\s\S]*?)`\)/.exec(source)?.[1];
	if (!button || !target || !html) throw new Error('unrecognised morph script');
	return { button, target, html };
}

// Alpine.morph to a template that only adds elements: the added elements render behind a flag the button sets.
function prepareMorph(root: Element, morph: Morph, component: Component): void {
	const find = (node: Node, id: string): Element | undefined => {
		if (!isElement(node)) return undefined;
		if (attrValue(node, 'id') === id) return node;
		for (const child of children(node)) {
			const found = find(child, id);
			if (found) return found;
		}
		return undefined;
	};
	const target = find(root, morph.target);
	const button = find(root, morph.button);
	if (!target || !button) throw new Error('morph elements not found');
	const next = (parseFragment(morph.html.trim()).childNodes as Node[]).find(isElement)!;
	const flag = component.name('morphed');
	component.decls.push(`let ${flag} = state(false);`);
	const old = children(target).filter(isElement);
	const sig = (el: Element) => `${el.tagName}|${el.attrs.map((a) => `${a.name}=${a.value}`).join(' ')}`;
	const merged: Node[] = [];
	let i = 0;
	for (const child of (next.childNodes as Node[]).filter(isElement)) {
		if (old[i] && sig(old[i]!) === sig(child)) merged.push(old[i++]!);
		else {
			(child as unknown as { morphFlag: string }).morphFlag = flag;
			merged.push(child);
		}
	}
	if (i !== old.length) throw new Error('morph removes elements');
	target.childNodes = merged as typeof target.childNodes;
	button.attrs.push({ name: '@click', value: `__morph__${flag}` });
}

function textOf(node: Node): string {
	if (node.nodeName === '#text') return (node as TextNode).value;
	return isElement(node) ? children(node).map(textOf).join('') : '';
}

function scopeFor(el: Element, walk: Walk): { scope: Scope; data: Record<string, unknown> } {
	const directives = directivesOf(el);
	const data = directives.find((d) => d.type === 'data');
	if (!data) return { scope: walk.scope, data: walk.data };
	const { component } = walk;
	const vars = new Map<string, Binding>();
	const self = new Map<string, Binding>();
	const scope: Scope = { vars, parent: walk.scope, root: () => component.handle(el), refs: new Map(), self, models: new Map() };
	const modelable = directives.find((d) => d.type === 'modelable');
	const properties = dataProperties(data.expression);
	const initial = initialData([data.expression]);
	for (const property of properties) {
		if (modelable && modelable.expression === property.name) {
			// x-modelable="count" with x-model="number": the inner name is the outer property.
			const outer = directives.find((d) => d.type === 'model')!;
			const binding = lookup(walk.scope, outer.expression)!;
			vars.set(property.name, binding);
			continue;
		}
		if (property.kind === 'value') {
			const ident = component.name(property.name);
			const persistMatch = /^\$persist\(([\s\S]*)\)$/.exec(property.source.trim());
			const init = persistMatch ? persistMatch[1]! : property.source;
			const compiled = compile(init, 'expression', { scope: walk.scope, el: () => component.handle(el), globals: component.globals, imports: component.imports });
			component.decls.push(`let ${ident} = state(${compiled.code});`);
			vars.set(property.name, { code: ident, kind: 'state' });
			self.set(property.name, { code: ident, kind: 'state' });
			if (persistMatch) {
				const key = `_x_${property.name}`;
				component.persisted.set(ident, key);
				component.imports.add('persist:persist');
				component.imports.add('persisted:persist');
				component.idle.push(`${ident} = persisted(${lit(key)}, ${ident});`);
			}
		} else if (property.kind === 'getter') {
			const ident = component.name(property.name);
			vars.set(property.name, { code: ident, kind: 'computed' });
			self.set(property.name, { code: ident, kind: 'computed' });
		} else throw new Error(`x-data method ${property.name} is not supported`);
	}
	for (const property of properties.filter((p) => p.kind === 'getter')) {
		const ident = vars.get(property.name)!.code;
		const compiled = compile(property.source, 'statements', { scope, el: () => component.handle(el), globals: component.globals, imports: component.imports });
		component.computedDeps.set(ident, compiled.reads);
		component.imports.add('computed:core');
		component.decls.push(`const ${ident} = computed(() => {\n\t\t${compiled.code.replace(/\n\s*/g, '\n\t\t')}\n\t});`);
	}
	const prescan = (node: Node, top: boolean) => {
		if (!isElement(node)) return;
		const ds = directivesOf(node);
		if (!top && ds.some((d) => d.type === 'data')) return;
		const r = ds.find((d) => d.type === 'ref');
		if (r) scope.refs.set(r.expression, () => component.handle(node));
		children(node).forEach((c) => prescan(c, false));
	};
	prescan(el, true);
	const merged = Object.create(null) as Record<string, unknown>;
	Object.defineProperties(merged, Object.getOwnPropertyDescriptors(walk.data));
	Object.defineProperties(merged, Object.getOwnPropertyDescriptors(initial));
	component.scopes.set(el, { scope, data: merged });
	return { scope, data: merged };
}

/** A value read for markup: a variable read directly, anything else through a computed. */
function reading(compiled: Compiled, walk: Walk, wrap?: (code: string) => string): string {
	const { component } = walk;
	const direct = /^[\w$]+(\.[\w$]+)?$/.test(compiled.code) && !wrap;
	if (direct) return compiled.code;
	const ident = component.fresh('value');
	component.imports.add('computed:core');
	component.decls.push(`const ${ident} = computed(() => ${wrap ? wrap(compiled.code) : `(${compiled.code})`});`);
	component.computedDeps.set(ident, compiled.reads);
	return ident;
}

function inLoop(scope: Scope): boolean {
	for (let s: Scope | undefined = scope; s; s = s.parent) if ([...s.vars.values()].some((b) => b.kind === 'loop')) return true;
	return false;
}

function emit(el: Element, depth: number, outer: Walk): string {
	const pad = '\t'.repeat(depth);
	const { component } = outer;
	const teleportedFrom = (el as unknown as { teleportedFrom?: Element[] }).teleportedFrom;
	const origin = teleportedFrom?.length ? component.scopes.get(teleportedFrom.at(-1)!) : undefined;
	const { scope, data } = scopeFor(el, origin ? { ...outer, ...origin } : outer);
	const walk: Walk = { ...outer, scope, data };
	const directives = directivesOf(el);
	const has = (type: string) => directives.find((d) => d.type === type);
	const ctx = (extra: Partial<Parameters<typeof compile>[2]> = {}) => ({ scope, el: () => component.handle(el), globals: component.globals, imports: component.imports, ...extra });
	void teleportedFrom;

	const ref = has('ref');
	if (ref) {
		let owner: Scope = scope;
		owner.refs.set(ref.expression, () => component.handle(el));
		void owner;
	}

	// <template x-for> and <template x-if> stay in the page, as Alpine leaves them, and render their content after them.
	if (el.tagName === 'template') {
		const forDirective = has('for');
		const ifDirective = has('if');
		const content = children(el).filter(isElement);
		if (forDirective) return `${pad}<template></template>\n${emitFor(forDirective, directives.find((d) => d.type === 'bind' && d.value === 'key'), content[0]!, depth, walk)}`;
		if (ifDirective) {
			const compiled = compile(ifDirective.expression, 'expression', ctx());
			const cond = reading(compiled, walk);
			const arm = content.map((c) => emit(c, depth + 1, { ...walk, static: true }).replace(/\n$/, ';\n')).join('');
			return `${pad}<template></template>\n${pad}@if (${cond}) {\n${arm}${pad}}\n`;
		}
		return `${pad}<template></template>\n`;
	}

	const attrs: string[] = [];
	const statics = staticAttrs(el);
	const base = (name: string) => statics.find((a) => a.name === name)?.value ?? '';
	const without = new Set<string>();
	const show = has('show');
	const collapse = has('collapse');
	const transitions = directives.filter((d) => d.type === 'transition');
	const imperative = !!(show || has('trap') || has('anchor'));
	let styleOut: string | undefined;
	let hiddenOut = false;

	if (show) {
		if (walk.static) throw new Error('x-show inside x-if or x-for');
		const compiled = compile(show.expression, 'expression', ctx());
		const h = component.handle(el);
		const options: string[] = [];
		if (show.modifiers.includes('important')) options.push('important: true');
		if (transitions.length) {
			const classes = transitions.filter((t) => t.expression && t.value);
			const helper = transitions.filter((t) => !(t.expression && t.value));
			if (classes.length) options.push(`transition: { classes: { ${classes.map((t) => `${lit(t.value)}: ${lit(t.expression)}`).join(', ')} } }`);
			else options.push(`transition: { helper: { ${helper.map((t) => `${lit(t.value)}: ${JSON.stringify(t.modifiers)}`).join(', ')} } }`);
		}
		if (collapse) options.push(`collapse: ${JSON.stringify(collapse.modifiers)}`);
		component.imports.add('show:show');
		component.reactions.push({ deps: compiled.reads, code: `show(${h}, ${compiled.code}${options.length ? `, { ${options.join(', ')} }` : ''});`, el: h });
		const visible = !!evaluateInitial(show.expression, data);
		let style = base('style');
		if (!visible && !(collapse && collapse.modifiers.includes('min'))) style = `${style}${style && !style.trim().endsWith(';') ? ';' : ''}${style ? ' ' : ''}display: none${show.modifiers.includes('important') ? ' !important' : ''};`;
		if (collapse && !visible) {
			const min = collapse.modifiers.includes('min') ? Number(/(\d+)/.exec(collapse.modifiers[collapse.modifiers.indexOf('min') + 1] ?? '0')?.[1] ?? 0) : 0;
			style = `${style}${style ? ' ' : ''}height: ${min}px; overflow: hidden;`;
			if (!collapse.modifiers.includes('min')) hiddenOut = true;
		}
		styleOut = style;
		without.add('style');
	}

	for (const d of directives.filter((x) => x.type === 'bind')) {
		if (d.value === 'key') continue;
		const compiled = compile(d.expression, 'expression', ctx(has('anchor') ? { anchor: anchorVars(el, walk) } : {}));
		if (d.value === 'class') {
			component.imports.add('cls:bind');
			attrs.push(`class={${reading(compiled, walk, (c) => `cls(${lit(base('class'))}, ${c})`)}}`);
			without.add('class');
		} else if (d.value === 'style') {
			if (imperative) {
				component.imports.add('setStyles:bind');
				const h = component.handle(el);
				component.reactions.push({ deps: compiled.reads, code: `setStyles(${h}, ${compiled.code});` });
				component.idle.push(`setStyles(${h}, ${compiled.code});`);
			} else {
				component.imports.add('sty:bind');
				attrs.push(`style={${reading(compiled, walk, (c) => `sty(${lit(base('style'))}, ${c})`)}}`);
				without.add('style');
			}
		} else {
			component.imports.add('attr:bind');
			attrs.push(`${d.value}={${inLoop(scope) && /^[\w$.]+$/.test(compiled.code) ? compiled.code : reading(compiled, walk, (c) => `attr(${lit(d.value)}, ${c})`)}}`);
			without.add(d.value);
		}
	}

	// x-model: the field starts with the data's value; its own events write the data; writes from elsewhere put the value back.
	const model = has('model');
	const modelable = has('modelable');
	let modelInitial: { checked?: boolean; value?: string; selected?: Set<string> } | undefined;
	if (model && !modelable) {
		const binding = lookup(scope, model.expression);
		if (!binding || binding.kind !== 'state') throw new Error(`x-model on ${model.expression}`);
		const h = component.handle(el);
		if (ref) scope.models.set(ref.expression, binding.code);
		const current = evaluateInitial(model.expression, data);
		const type = (attrValue(el, 'type') ?? '').toLowerCase();
		const field = ['input', 'textarea', 'select'].includes(el.tagName);
		if (field) {
			component.imports.add('modelValue:model');
			component.imports.add('syncModel:model');
			component.reactions.push({ deps: new Set([binding.code]), code: `syncModel(${h}, ${binding.code});`, el: h });
			if (type === 'checkbox') modelInitial = { checked: Array.isArray(current) ? current.some((v) => v == (attrValue(el, 'value') ?? 'on')) : !!current };
			else if (type === 'radio') {
				modelInitial = { checked: typeof current === 'boolean' ? current === ['1', 'true', 'on', 'yes'].includes(attrValue(el, 'value') ?? '') : (attrValue(el, 'value') ?? 'on') == current };
				if (!attrValue(el, 'name')) attrs.push(`name=${lit(model.expression)}`);
			} else if (el.tagName === 'select') modelInitial = { selected: new Set(([] as unknown[]).concat(current).map((v) => `${v}`)) };
			else if (current !== undefined && current !== null && current !== '') modelInitial = { value: String(current) };
			const events: { event: string; filter?: string }[] = [];
			const m = model.modifiers;
			if (m.includes('change') || m.includes('lazy')) events.push({ event: 'change' });
			if (m.includes('blur')) events.push({ event: 'blur' });
			if (m.includes('enter')) events.push({ event: 'keydown', filter: `(event as KeyboardEvent).key === 'Enter'` });
			if (!events.length) events.push({ event: el.tagName === 'select' || ['checkbox', 'radio'].includes(type) ? 'change' : 'input' });
			for (const e of events) {
				const body = `${e.filter ? `if (!(${e.filter})) return;\n` : ''}${binding.code} = modelValue(${h}!, ${JSON.stringify(m)}, event, ${binding.code}) as typeof ${binding.code}`;
				pendingEvents(el).push({ event: e.event, code: component.handler(body, new Set([binding.code]), h) });
			}
		}
	}

	// x-on
	for (const d of directives.filter((x) => x.type === 'on')) {
		if (d.expression.startsWith('__morph__')) {
			const flag = d.expression.slice('__morph__'.length);
			pendingEvents(el).push({ event: 'click', code: component.handler(`${flag} = true`, new Set([flag])) });
			continue;
		}
		const compiled = compile(d.expression, 'statements', ctx());
		const needsListen = !EVENT_PROPS[d.value] || d.modifiers.some((m) => PROP_MODIFIERS.has(m));
		const filtered = d.modifiers.length > 0 && !needsListen;
		if (filtered) component.imports.add('passes:on');
		const body = `${filtered ? `if (!passes(event, ${component.handle(el)}, ${JSON.stringify(d.modifiers)})) return;\n` : ''}${compiled.code}`;
		const code = component.handler(body, compiled.writes);
		if (needsListen) {
			component.imports.add('listen:on');
			component.idle.push(`listen(${component.handle(el)}, ${lit(d.value)}, ${JSON.stringify(d.modifiers)}, (event) => ${code.replace(/^/, '')});`);
		} else pendingEvents(el).push({ event: d.value, code });
	}

	const trapDirective = has('trap');
	if (trapDirective) {
		const compiled = compile(trapDirective.expression, 'expression', ctx());
		component.imports.add('trap:focus');
		const h = component.handle(el);
		component.reactions.push({ deps: compiled.reads, code: `trap(${h}, ${compiled.code}, ${JSON.stringify(trapDirective.modifiers)});` });
		if (evaluateInitial(trapDirective.expression, data)) component.idle.push(`trap(${h}, ${compiled.code}, ${JSON.stringify(trapDirective.modifiers)});`);
	}
	const anchorDirective = has('anchor');
	if (anchorDirective) {
		const compiled = compile(anchorDirective.expression, 'expression', ctx());
		component.imports.add('anchor:anchor');
		const vars = anchorVarsIfUsed(el, walk);
		const move = vars ? `, (x, y) => ${component.handler(`${vars.x} = x;\n${vars.y} = y`, new Set([vars.x, vars.y]))}` : '';
		component.idle.push(`anchor(${component.handle(el)}, ${compiled.code}, ${JSON.stringify(anchorDirective.modifiers)}${move});`);
	}
	const intersectDirective = has('intersect');
	if (intersectDirective) {
		const compiled = compile(intersectDirective.expression, 'statements', ctx());
		component.imports.add('intersect:observe');
		component.idle.push(`intersect(${component.handle(el)}, ${lit(intersectDirective.value)}, ${JSON.stringify(intersectDirective.modifiers)}, () => ${component.handler(compiled.code, compiled.writes)});`);
	}
	const resizeDirective = has('resize');
	if (resizeDirective) {
		const compiled = compile(resizeDirective.expression, 'statements', ctx({ renames: { $width: 'width', $height: 'height' } }));
		component.imports.add('resize:observe');
		component.idle.push(`resize(${component.handle(el)}, ${JSON.stringify(resizeDirective.modifiers)}, (width, height) => ${component.handler(compiled.code, compiled.writes)});`);
	}
	const maskDirective = has('mask');
	if (maskDirective) {
		component.imports.add('mask:mask');
		const template = maskDirective.value === 'dynamic' || maskDirective.value === 'function' ? compile(maskDirective.expression.trim(), 'expression', ctx({ renames: { $input: 'input', $money: 'money' } })).code : lit(maskDirective.expression);
		component.idle.push(`mask(${component.handle(el)} as HTMLInputElement, (input, money) => ${template});`);
	}
	const sortDirective = directives.find((d) => d.type === 'sort' && !d.value);
	if (sortDirective) {
		component.imports.add('sort:sort');
		const items: string[] = [];
		const handles: string[] = [];
		const collect = (node: Node) => {
			if (!isElement(node)) return;
			for (const d of directivesOf(node)) {
				if (d.type === 'sort' && d.value === 'item') items.push(`[${component.handle(node)}, ${d.expression ? compile(d.expression, 'expression', ctx()).code : 'undefined'}]`);
				if (d.type === 'sort' && d.value === 'handle') handles.push(component.handle(node));
			}
			children(node).forEach(collect);
		};
		children(el).forEach(collect);
		const config = directives.find((d) => d.type === 'sort' && d.value === 'config');
		const run = sortDirective.expression ? compile(sortDirective.expression, 'statements', ctx({ renames: { $item: 'item', $position: 'position', $key: 'item' } })) : undefined;
		component.idle.push(`sort(${component.handle(el)}, { ghost: ${sortDirective.modifiers.includes('ghost')}, items: [${items.join(', ')}], handles: [${handles.join(', ')}]${config ? `, config: ${config.expression}` : ''} }${run ? `, (item, position) => ${component.handler(run.code, run.writes)}` : ''});`);
	}

	attrs.unshift(`__ELREF_${elementId(el)}__`);
	for (const e of pendingEvents(el)) attrs.push(`${EVENT_PROPS[e.event]}={(event) => ${e.code}}`);
	if (pendingEvents(el).length > 0) mergeEvents(attrs);

	const staticOut = statics
		.filter((a) => !without.has(a.name))
		.map((a) => {
			if (a.name === 'value' && modelInitial?.value !== undefined) return attribute('value', modelInitial.value);
			return attribute(a.name, a.value);
		});
	if (modelInitial?.value !== undefined && !statics.some((a) => a.name === 'value') && el.tagName !== 'textarea') staticOut.push(attribute('value', modelInitial.value));
	if (modelInitial?.checked) staticOut.push(' checked');
	if (styleOut) staticOut.push(attribute('style', styleOut));
	if (hiddenOut) staticOut.push(' hidden');
	const open = `<${el.tagName}${staticOut.join('')}${attrs.length ? ` ${attrs.join(' ')}` : ''}`;

	if (VOID.has(el.tagName)) return `${pad}${open} />\n`;

	const text = has('text');
	if (text) {
		const compiled = compile(text.expression, 'expression', ctx());
		component.imports.add('text:bind');
		if (walk.static) throw new Error('x-text inside x-if');
		const value = inLoop(scope) && /^[\w$.]+$/.test(compiled.code) ? compiled.code : reading(compiled, walk, (c) => `text(${c})`);
		return `${pad}${open}>{${value}}</${el.tagName}>\n`;
	}
	const html = has('html');
	if (html) {
		const compiled = compile(html.expression, 'expression', ctx());
		const constant = [...compiled.reads].every((r) => !component.handlers.some((h) => h.writes.has(r))) && ![...compiled.reads].some((r) => component.persisted.has(r));
		if (!constant) throw new Error('x-html of a value that changes');
		// A value nothing writes renders once; Alpine's innerHTML of it is that markup.
		return `${pad}${open}>\n${htmlToTsrx(String(evaluateInitial(html.expression, data)), depth + 1)}${pad}</${el.tagName}>\n`;
	}

	let kids = children(el).filter((n) => n.nodeName !== '#comment');
	if (el.tagName === 'select' && modelInitial?.selected) {
		for (const option of kids.filter(isElement).filter((o) => o.tagName === 'option')) {
			const value = attrValue(option, 'value') ?? textOf(option).trim();
			if (modelInitial.selected.has(value) && !option.attrs.some((a) => a.name === 'selected')) option.attrs.push({ name: 'selected', value: '' });
		}
	}
	if (el.tagName === 'textarea') return `${pad}${open}>${modelInitial?.value ? `{${lit(modelInitial.value)}}` : kids.map((k) => `{${lit((k as TextNode).value ?? '')}}`).join('')}</${el.tagName}>\n`;
	const flagged = (node: Node) => (node as unknown as { morphFlag?: string }).morphFlag;
	const body = emitChildren(kids, depth + 1, walk, el, flagged);
	if (!body.trim()) return `${pad}${open}></${el.tagName}>\n`;
	return `${pad}${open}>\n${body}${pad}</${el.tagName}>\n`;
}

const ids = new Map<Element, number>();
const byId: Element[] = [];
function elementId(el: Element): number {
	let id = ids.get(el);
	if (id === undefined) {
		id = byId.length;
		ids.set(el, id);
		byId.push(el);
	}
	return id;
}

const pending = new WeakMap<Element, { event: string; code: string }[]>();
function pendingEvents(el: Element): { event: string; code: string }[] {
	let list = pending.get(el);
	if (!list) pending.set(el, (list = []));
	return list;
}

// Two Alpine listeners for one event on one element (@click and @click.shift) become one prop running both in order.
function mergeEvents(attrs: string[]): void {
	const byProp = new Map<string, number[]>();
	attrs.forEach((a, i) => {
		const prop = /^(on[A-Z]\w*)=/.exec(a)?.[1];
		if (prop) byProp.set(prop, [...(byProp.get(prop) ?? []), i]);
	});
	for (const [prop, indexes] of byProp) {
		if (indexes.length < 2) continue;
		const bodies = indexes.map((i) => attrs[i]!.replace(`${prop}={(event) => `, '').replace(/\}$/, ''));
		const merged = `${prop}={(event) => {\n${bodies.map((b) => `((event: Event) => ${b})(event);`).join('\n')}\n}}`;
		for (const i of indexes.slice(1).reverse()) attrs.splice(i, 1);
		attrs[indexes[0]!] = merged;
	}
}

const anchors = new WeakMap<Element, { x: string; y: string }>();
function anchorVars(el: Element, walk: Walk): { x: string; y: string } {
	let vars = anchors.get(el);
	if (!vars) {
		vars = { x: walk.component.name('anchorX'), y: walk.component.name('anchorY') };
		walk.component.decls.push(`let ${vars.x} = state(0);`, `let ${vars.y} = state(0);`);
		anchors.set(el, vars);
	}
	return vars;
}
function anchorVarsIfUsed(el: Element, walk: Walk): { x: string; y: string } | undefined {
	return directivesOf(el).some((d) => d.expression.includes('$anchor')) ? anchorVars(el, walk) : undefined;
}

function emitFor(directive: Directive, key: Directive | undefined, content: Element, depth: number, walk: Walk): string {
	const pad = '\t'.repeat(depth);
	const match = /^\s*(?:\(([^)]*)\)|([\w$]+))\s+(?:in|of)\s+([\s\S]+)$/.exec(directive.expression);
	if (!match) throw new Error(`x-for ${directive.expression}`);
	const names = (match[1] ?? match[2]!).split(',').map((n) => n.trim());
	const { component } = walk;
	const list = compile(match[3]!, 'expression', { scope: walk.scope, el: () => component.handle(content), globals: component.globals, imports: component.imports });
	const row = component.fresh('row');
	const rows = component.fresh('rows');
	component.imports.add('computed:core');
	// Alpine iterates arrays by index, objects by key, numbers from 1: each row carries the item and its index or key.
	component.imports.add('rows:bind');
	component.decls.push(`const ${rows} = computed(() => rows(${list.code}));`);
	component.computedDeps.set(rows, list.reads);
	const vars = new Map<string, Binding>([[names[0]!, { code: `${row}.item`, kind: 'loop' }]]);
	if (names[1]) vars.set(names[1], { code: `${row}.index`, kind: 'loop' });
	const scope: Scope = { vars, parent: walk.scope, root: walk.scope.root, refs: new Map(), self: undefined, models: new Map() };
	const keyCode = key ? compile(key.expression, 'expression', { scope, el: () => '', globals: component.globals, imports: component.imports }).code : `${row}.index`;
	const body = emit(content, depth + 1, { ...walk, scope, static: false });
	return `${pad}@for (const ${row} of ${rows}; key ${keyCode}) {\n${body}${pad}}\n`;
}

function emitChildren(kids: Node[], depth: number, walk: Walk, parent: Element, flagged: (n: Node) => string | undefined): string {
	const pad = '\t'.repeat(depth);
	const elementKids = kids.filter((n) => n.nodeName !== '#text' || (n as TextNode).value.trim());
	const hasText = kids.some((n) => n.nodeName === '#text' && (n as TextNode).value.trim());
	let out = '';
	kids.forEach((node, i) => {
		if (node.nodeName === '#text') {
			const value = (node as TextNode).value;
			const collapsed = value.replace(/[ \t\n\r\f]+/g, ' ');
			if (!collapsed.trim()) {
				// Whitespace between two elements renders as a space between inline ones; keep it when either neighbour is inline content.
				const prev = kids[i - 1];
				const next = kids[i + 1];
				const inlineish = (n: Node | undefined) => !!n && (n.nodeName === '#text' || (isElement(n) && ['span', 'strong', 'a', 'button', 'input', 'label', 'code', 'em', 'b', 'i', 'select', 'textarea', 'img', 'br', 'kbd', 'small'].includes(n.tagName)));
				if (prev && next && inlineish(prev) && inlineish(next)) out += `${pad}{" "}\n`;
				return;
			}
			const lead = /^\s/.test(value) && i > 0 ? '{" "}' : '';
			const trail = /\s$/.test(value) && i < kids.length - 1 ? '{" "}' : '';
			out += `${pad}${lead}${/\u00a0/.test(collapsed) ? `{${lit(collapsed.trim())}}` : entities(collapsed.trim())}${trail}\n`;
			return;
		}
		if (!isElement(node)) return;
		const flag = flagged(node);
		if (flag) {
			out += `${pad}@if (${flag}) {\n${emit(node, depth + 1, { ...walk, static: true }).replace(/\n$/, ';\n')}${pad}}\n`;
			return;
		}
		out += emit(node, depth, walk);
	});
	void elementKids;
	void hasText;
	void parent;
	return out;
}
