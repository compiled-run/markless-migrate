import type { Context } from '../source/context.ts';
import { resolveImport } from '../source/files.ts';
import { functionOf, staticValue, known, unwrap, walk, type Module, type N } from '../source/js.ts';
import type { Composition } from './types.ts';

/** A library part a JSX tag renders: named off the package, or reached through local components that pass their props on to it. */
export interface PartRef {
	readonly library: string;
	readonly export: string;
	/** The literal data-slot the part is given on the way (the outermost wins: each wrapper spreads its props after its own). */
	readonly slot?: string;
}

interface Component {
	readonly mod: Module;
	readonly fn: N;
}

interface Tag {
	readonly part?: PartRef;
	readonly component?: Component;
	readonly host?: string;
}

const MAX_DEPTH = 6;
const MAX_TEXT = 80;

/** The role a part plays, as shadcn names its slots: `Dialog.Close` is dialog-close, `@radix-ui/react-popover`'s `Trigger` popover-trigger. */
export function partRole(library: string, exportName: string): string {
	const kebab = (s: string) => s.replace(/([a-z0-9])([A-Z])/g, '$1-$2').replace(/([A-Z])([A-Z][a-z])/g, '$1-$2').toLowerCase();
	const names = exportName.split('.');
	// `Collapsible.CollapsibleTrigger` (radix-ui's long aliases) names its family once.
	if (names.length > 1 && names[1]!.startsWith(names[0]!)) names.shift();
	const words = names.map(kebab).join('-');
	const family = /^@radix-ui\/react-(.+)$/.exec(library)?.[1];
	return family && !words.startsWith(`${family}-`) && words !== family ? `${family}-${words}` : words;
}

function jsxName(name: N): { root: string; member?: string } | undefined {
	if (name.type === 'JSXIdentifier') return { root: name.name };
	if (name.type === 'JSXMemberExpression') {
		const object = jsxName(name.object);
		if (!object) return undefined;
		return { root: object.root, member: object.member ? `${object.member}.${name.property.name}` : name.property.name };
	}
	return undefined;
}

const attribute = (opening: N, name: string): N | undefined => (opening.attributes as N[]).find((a) => a.type === 'JSXAttribute' && a.name.type === 'JSXIdentifier' && a.name.name === name);

function literalAttr(opening: N, name: string, mod: Module): string | undefined {
	const a = attribute(opening, name);
	if (!a?.value) return undefined;
	if (a.value.type === 'Literal') return typeof a.value.value === 'string' ? a.value.value : undefined;
	if (a.value.type === 'JSXExpressionContainer') {
		const v = staticValue(a.value.expression, mod);
		return known(v) && typeof v === 'string' ? v : undefined;
	}
	return undefined;
}

function isTrue(opening: N, name: string): boolean {
	const a = attribute(opening, name);
	if (!a) return false;
	if (a.value === null) return true;
	return a.value.type === 'JSXExpressionContainer' && a.value.expression.type === 'Literal' && a.value.expression.value === true;
}

function jsxText(node: N, mod: Module): string | undefined {
	const parts: string[] = [];
	walk(node, (n) => {
		if (n.type === 'JSXText') parts.push(n.value);
		else if (n.type === 'JSXExpressionContainer' && n.expression.type !== 'JSXEmptyExpression') {
			const v = staticValue(n.expression, mod);
			if (known(v) && (typeof v === 'string' || typeof v === 'number')) parts.push(String(v));
			return false;
		} else if (n.type === 'JSXAttribute') return false;
	});
	const text = parts.join(' ').replace(/\s+/g, ' ').trim();
	return text ? text.slice(0, MAX_TEXT) : undefined;
}

function returned(fn: N): N | undefined {
	if (fn.body?.type !== 'BlockStatement') return unwrap(fn.body);
	let out: N | undefined;
	walk(fn.body, (n) => {
		if (out || (n !== fn && (n.type === 'FunctionDeclaration' || n.type === 'FunctionExpression' || n.type === 'ArrowFunctionExpression'))) return false;
		if (n.type === 'ReturnStatement') out = unwrap(n.argument ?? undefined);
	});
	return out;
}

/** The names a component's props reach its body under: `props`, or the rest of a destructured first parameter. */
function propsNames(fn: N): Set<string> {
	const raw = (fn.params as N[])[0];
	const param = raw?.type === 'AssignmentPattern' ? raw.left : raw;
	const names = new Set<string>();
	if (param?.type === 'Identifier') names.add(param.name);
	else if (param?.type === 'ObjectPattern') for (const p of param.properties as N[]) if (p.type === 'RestElement' && p.argument.type === 'Identifier') names.add(p.argument.name);
	return names;
}

const isPackage = (spec: string, ctx: Context) => !spec.startsWith('.') && !ctx.project.aliases.some((a) => spec.startsWith(a.prefix)) && !!packageOf(spec);

function packageOf(spec: string): string | undefined {
	if (/^(node:|virtual:|~|\/|#|bun:|data:)/.test(spec)) return undefined;
	const parts = spec.split('/');
	if (spec.startsWith('@')) return parts.length >= 2 && parts[0]!.length > 1 ? `${parts[0]}/${parts[1]}` : undefined;
	return parts[0];
}

/**
 * What the source says a part renders through its child: every element naming a library part, straight off the
 * package or through local components that spread their props onto one, that passes `asChild` (Radix's Slot) or a
 * `render` element (Base UI's useRender). The page shows the child's element, so its data-slot may be the child's.
 */
export class Compositions {
	private readonly components = new Map<string, Promise<Component | undefined>>();
	private readonly forwards = new Map<N, Promise<PartRef | undefined>>();
	// A component that renders itself, or modules re-exporting each other, would wait on their own answer.
	private readonly pending = new Set<unknown>();

	private readonly ctx: Context;

	constructor(ctx: Context) {
		this.ctx = ctx;
	}

	/** The component a module exports under a name, through re-exports. */
	async exported(file: string, name: string, depth = 0): Promise<Component | undefined> {
		const key = `${file}#${name}`;
		if (this.pending.has(key)) return undefined;
		let found = this.components.get(key);
		if (!found) {
			this.pending.add(key);
			this.components.set(key, (found = this.findExported(file, name, depth).finally(() => this.pending.delete(key))));
		}
		return found;
	}

	private async findExported(file: string, name: string, depth: number): Promise<Component | undefined> {
		if (depth > MAX_DEPTH) return undefined;
		const mod = await this.ctx.module(file);
		if (!mod) return undefined;
		const node = mod.exports.get(name);
		const fn = node ? functionOf(node, mod) : undefined;
		if (fn) return { mod, fn };
		const re = mod.reexports.get(name);
		if (re) {
			const target = resolveImport(this.ctx.project, file, re.source);
			return target ? this.exported(target, re.imported, depth + 1) : undefined;
		}
		for (const source of mod.starExports) {
			const target = resolveImport(this.ctx.project, file, source);
			const hit = target ? await this.exported(target, name, depth + 1) : undefined;
			if (hit) return hit;
		}
		return undefined;
	}

	/** What a JSX tag names in a module: a library part, a local component, or a host element. */
	async tag(mod: Module, name: N, depth = 0): Promise<Tag> {
		const tag = jsxName(name);
		if (!tag) return {};
		if (!tag.member && /^[a-z]/.test(tag.root)) return { host: tag.root };
		const imp = mod.imports.get(tag.root);
		if (imp && isPackage(imp.source, this.ctx)) {
			const library = packageOf(imp.source)!;
			if (library === 'react') return {};
			const exportName = imp.imported === '*' ? tag.member : tag.member ? `${imp.imported}.${tag.member}` : imp.imported;
			return exportName ? { part: { library, export: exportName } } : {};
		}
		let component: Component | undefined;
		if (imp) {
			const target = resolveImport(this.ctx.project, mod.file, imp.source);
			const exportName = imp.imported === '*' ? tag.member : tag.member ? undefined : imp.imported;
			component = target && exportName ? await this.exported(target, exportName) : undefined;
		} else if (!tag.member) {
			const fn = functionOf(mod.bindings.get(tag.root), mod);
			component = fn ? { mod, fn } : undefined;
		}
		if (!component) return {};
		const part = await this.forwarded(component, depth + 1);
		return part ? { part, component } : { component };
	}

	/** The library part a component passes its props on to (`<SheetPrimitive.Close data-slot="sheet-close" {...props} />`). */
	async forwarded(component: Component, depth = 0): Promise<PartRef | undefined> {
		if (this.pending.has(component.fn)) return undefined;
		let found = this.forwards.get(component.fn);
		if (!found) {
			this.pending.add(component.fn);
			this.forwards.set(component.fn, (found = this.findForwarded(component, depth).finally(() => this.pending.delete(component.fn))));
		}
		return found;
	}

	private async findForwarded({ mod, fn }: Component, depth: number): Promise<PartRef | undefined> {
		if (depth > MAX_DEPTH) return undefined;
		const names = propsNames(fn);
		if (!names.size) return undefined;
		const openings: N[] = [];
		walk(fn, (n) => {
			if (n.type === 'JSXOpeningElement' && (n.attributes as N[]).some((a) => a.type === 'JSXSpreadAttribute' && a.argument.type === 'Identifier' && names.has(a.argument.name))) openings.push(n);
		});
		for (const opening of openings) {
			const { part } = await this.tag(mod, opening.name, depth);
			if (!part) continue;
			const slot = literalAttr(opening, 'data-slot', mod) ?? part.slot;
			return { library: part.library, export: part.export, ...(slot ? { slot } : {}) };
		}
		return undefined;
	}

	/** The data-slot values an element can render with: its own literal, the part's, the slot its component's root writes. */
	async slotsOf(mod: Module, element: N, depth = 0): Promise<string[]> {
		if (depth > MAX_DEPTH || element.type !== 'JSXElement') return [];
		const opening = element.openingElement;
		const out: string[] = [];
		const own = literalAttr(opening, 'data-slot', mod);
		if (own) out.push(own);
		const { part, component } = await this.tag(mod, opening.name, depth);
		if (part?.slot) out.push(part.slot);
		else if (component) out.push(...(await this.rootSlots(component, depth + 1)));
		const child = isTrue(opening, 'asChild') ? onlyChild(element) : undefined;
		if (child) out.push(...(await this.slotsOf(mod, child, depth + 1)));
		return [...new Set(out)];
	}

	private async rootSlots(component: Component, depth: number): Promise<string[]> {
		const root = returned(component.fn);
		return root?.type === 'JSXElement' ? this.slotsOf(component.mod, root, depth) : [];
	}

	/** Every composition site in a module, its routes left to the caller. */
	async sites(mod: Module): Promise<Omit<Composition, 'routes'>[]> {
		const found: { opening: N; element: N; ancestors: N[] }[] = [];
		walk(mod.program, (n, ancestors) => {
			if (n.type !== 'JSXOpeningElement') return;
			const element = ancestors[ancestors.length - 1];
			if (element?.type !== 'JSXElement') return;
			if (isTrue(n, 'asChild') || renderElement(n)) found.push({ opening: n, element, ancestors: ancestors.slice(0, -1) });
		});
		const out: Omit<Composition, 'routes'>[] = [];
		for (const { opening, element, ancestors } of found) {
			const { part } = await this.tag(mod, opening.name);
			if (!part) continue;
			const via = isTrue(opening, 'asChild') ? 'asChild' : 'render';
			const child = via === 'asChild' ? onlyChild(element) : renderElement(opening);
			if (!child) continue;
			const own = literalAttr(opening, 'data-slot', mod) ?? part.slot;
			const slots = [...new Set([...(own ? [own] : []), ...(await this.slotsOf(mod, child))])];
			const text = jsxText(via === 'asChild' ? child : element, mod);
			const label = literalAttr(opening, 'aria-label', mod) ?? literalAttr(child.openingElement, 'aria-label', mod);
			const around = await this.within(mod, ancestors);
			const within = around?.slot;
			// The row beside it is the page's only where its parent is the element `within` names.
			const parent = ancestors[ancestors.length - 1];
			const row = around?.at === ancestors.length - 1 && (await this.passesChildren(mod, parent!)) ? siblingsOf(element, parent, mod) : undefined;
			out.push({ library: part.library, export: part.export, part: partRole(part.library, part.export), via, slots, ...(text ? { text } : {}), ...(label ? { label } : {}), ...(within ? { within } : {}), ...(row ?? {}), file: mod.file, line: mod.line(opening.start) });
		}
		return out;
	}

	/** Whether an element puts its JSX children in the page as they are: a host element, or a component whose root takes them from its props alone. */
	private async passesChildren(mod: Module, element: N): Promise<boolean> {
		const { host, component } = await this.tag(mod, element.openingElement.name);
		if (host) return true;
		const root = component ? returned(component.fn) : undefined;
		if (root?.type !== 'JSXElement') return false;
		const names = propsNames(component!.fn);
		const spreads = (root.openingElement.attributes as N[]).some((a) => a.type === 'JSXSpreadAttribute' && a.argument.type === 'Identifier' && names.has(a.argument.name));
		return spreads && (root.children as N[]).every((c) => c.type === 'JSXText' && !c.value.trim());
	}

	/** The data-slot of the nearest element around a site that the source names one for. */
	private async within(mod: Module, ancestors: readonly N[]): Promise<{ slot: string; at: number } | undefined> {
		for (let i = ancestors.length - 1; i >= 0; i--) {
			const a = ancestors[i]!;
			if (a.type === 'JSXAttribute') return undefined;
			if (a.type !== 'JSXElement') continue;
			const { part, component } = await this.tag(mod, a.openingElement.name);
			const slot = literalAttr(a.openingElement, 'data-slot', mod) ?? part?.slot ?? (component ? (await this.rootSlots(component, 1))[0] : undefined);
			if (slot) return { slot, at: i };
		}
		return undefined;
	}
}

/** The texts of the elements beside a site in its parent, itself included, when the source fixes them (no expression children). */
function siblingsOf(element: N, parent: N | undefined, mod: Module): { siblings: (string | null)[]; index: number } | undefined {
	if (parent?.type !== 'JSXElement') return undefined;
	const kids: N[] = [];
	for (const c of parent.children as N[]) {
		if (c.type === 'JSXText') continue;
		if (c.type === 'JSXExpressionContainer' && c.expression.type === 'JSXEmptyExpression') continue;
		if (c.type !== 'JSXElement') return undefined;
		kids.push(c);
	}
	return { siblings: kids.map((k) => jsxText(k, mod) ?? null), index: kids.indexOf(element) };
}

function onlyChild(element: N): N | undefined {
	const kids = (element.children as N[]).filter((c) => !(c.type === 'JSXText' && !c.value.trim()));
	return kids.length === 1 && kids[0]!.type === 'JSXElement' ? kids[0] : undefined;
}

function renderElement(opening: N): N | undefined {
	const a = attribute(opening, 'render');
	const e = a?.value?.type === 'JSXExpressionContainer' ? unwrap(a.value.expression) : undefined;
	return e?.type === 'JSXElement' ? e : undefined;
}
