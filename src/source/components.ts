import { posix } from 'node:path';
import type { Context } from './context.ts';
import { isConfigFile, isTestFile, resolveImport } from './files.ts';
import { functionOf, isFunction, memberName, property, str, unwrap, walk, type Module, type N } from './js.ts';
import type { Component, PlanStep, SourceRoute } from './types.ts';

const COMPONENT_FILE = /\.(tsx|jsx|js|mjs|vue|svelte|astro)$/;
const SFC = /\.(vue|svelte|astro)$/;
const pascal = (s: string) => s.replace(/^[^A-Za-z0-9]+/, '').replace(/(^|[-_.\s]+)(\w)/g, (_, __, c: string) => c.toUpperCase()).replace(/[^\w$]/g, '');
const isPascal = (s: string) => /^[A-Z][\w$]*$/.test(s);

/** A component's name from its file: the stem, or for convention files (`+page`, `index`, `[slug]`) the folder too. */
export function fileComponentName(file: string): string {
	const stem = posix.basename(file).replace(/\.\w+$/, '');
	const clean = (s: string) => pascal(s.replace(/[[\]().+]/g, ' ').trim()) || 'Root';
	if (!/^(\+|index$|page$|route$|layout$|default$)/.test(stem)) return clean(stem);
	const dir = posix.basename(posix.dirname(file));
	const folder = /^(routes|pages|app|src|\.)$/.test(dir) ? 'Root' : clean(dir);
	const role = stem.replace(/^\+/, '').replace(/\..*$/, '');
	return folder + (role === 'index' ? '' : pascal(role));
}
const LAYOUT_FILE = /(^|\/)(layout\.[jt]sx?|\+layout\.svelte|_app\.[jt]sx?|_document\.[jt]sx?|root\.[jt]sx|__root\.[jt]sx|app\.vue|App\.vue|App\.svelte|App\.[jt]sx|error\.vue)$|(^|\/)layouts\/[^/]+\.(vue|astro|svelte|[jt]sx)$|(^|\/)routes\/_[^./]+\.[jt]sx$/;

function containsJsx(node: N): boolean {
	let found = false;
	walk(node, (n) => {
		if (found) return false;
		if (n.type === 'JSXElement' || n.type === 'JSXFragment') found = true;
		else if (n.type === 'CallExpression' && /^(React\.)?createElement|^h$|^jsx$/.test(memberName(n.callee) ?? '')) found = true;
	});
	return found;
}

interface Def {
	id: string;
	name: string;
	file: string;
	line: number;
	node: N | undefined;
	selector?: string;
}

/** Components a module defines: PascalCase functions and classes that render, or the file itself for SFCs. */
function definitions(mod: Module): Def[] {
	const file = mod.file;
	if (SFC.test(file)) {
		const name = fileComponentName(file);
		return [{ id: `${file}#${name}`, name, file, line: 1, node: undefined }];
	}
	const out: Def[] = [];
	const seen = new Set<N>();
	const add = (name: string, node: N, at: N) => {
		if (seen.has(node)) return;
		seen.add(node);
		out.push({ id: `${file}#${name}`, name, file, line: mod.line(at.start), node });
	};
	for (const [name, node] of mod.bindings) {
		if (!isPascal(name)) continue;
		if (node.type === 'ClassDeclaration') {
			const decorator = (node.decorators as N[] | undefined)?.find((d) => memberName(unwrap(d.expression)?.callee) === 'Component');
			if (decorator) {
				const selector = str(property(unwrap(decorator.expression)!.arguments[0], 'selector'), mod);
				out.push({ id: `${file}#${name}`, name, file, line: mod.line(node.start), node, ...(selector ? { selector } : {}) });
				seen.add(node);
			} else if (node.superClass && /Component$/.test(memberName(node.superClass) ?? '') && containsJsx(node)) add(name, node, node);
			continue;
		}
		const fn = functionOf(node, mod);
		if (fn && containsJsx(fn)) add(name, fn, node);
	}
	const def = mod.exports.get('default');
	const fn = def && (isFunction(def) ? def : functionOf(def, mod));
	if (fn && !seen.has(fn) && containsJsx(fn)) {
		add(fn.id?.name ?? fileComponentName(file), fn, fn);
	}
	return out;
}

/** Tag names used in markup (component templates, Angular templates). */
function tagNames(markup: string): string[] {
	const names = new Set<string>();
	const text = markup.replace(/<!--[\s\S]*?-->/g, '');
	for (const m of text.matchAll(/<([A-Za-z][\w.-]*)/g)) names.add(m[1]!);
	return [...names];
}

export async function scanComponents(ctx: Context, routes: SourceRoute[]): Promise<Component[]> {
	const defs = new Map<string, Def>();
	const byFile = new Map<string, Def[]>();
	const mods = new Map<string, Module>();
	for (const file of ctx.project.files) {
		if (!COMPONENT_FILE.test(file) || isTestFile(file) || isConfigFile(file) || file.endsWith('.d.ts')) continue;
		if (/\.m?js$/.test(file) && !/(<[A-Za-z]|createElement)/.test(await ctx.project.read(file))) continue;
		const mod = await ctx.module(file);
		if (!mod) continue;
		mods.set(file, mod);
		const list = definitions(mod);
		byFile.set(file, list);
		for (const d of list) defs.set(d.id, d);
	}
	for (const file of ctx.project.files) {
		if (!/\.ts$/.test(file) || file.endsWith('.d.ts') || isTestFile(file) || !/@Component/.test(await ctx.project.read(file))) continue;
		const mod = await ctx.module(file);
		if (!mod) continue;
		mods.set(file, mod);
		const list = definitions(mod);
		byFile.set(file, list);
		for (const d of list) defs.set(d.id, d);
	}
	const exported = async (file: string, name: string, depth = 0): Promise<Def | undefined> => {
		const list = byFile.get(file);
		const mod = mods.get(file) ?? (await ctx.module(file));
		if (!mod || depth > 5) return undefined;
		if (SFC.test(file) && name === 'default') return list?.[0];
		const node = mod.exports.get(name);
		if (node) {
			const fn = isFunction(node) || node.type === 'ClassDeclaration' ? node : functionOf(node, mod);
			const hit = list?.find((d) => d.node === fn || d.node === node);
			if (hit) return hit;
			if (unwrap(node)?.type === 'Identifier') {
				const imp = mod.imports.get(unwrap(node)!.name);
				const target = imp && resolveImport(ctx.project, file, imp.source);
				if (target) return exported(target, imp!.imported, depth + 1);
			}
		}
		const re = mod.reexports.get(name);
		if (re) {
			const target = resolveImport(ctx.project, file, re.source);
			if (target) return exported(target, re.imported === 'default' ? 'default' : re.imported, depth + 1);
		}
		for (const source of mod.starExports) {
			const target = resolveImport(ctx.project, file, source);
			const hit = target ? await exported(target, name, depth + 1) : undefined;
			if (hit) return hit;
		}
		return undefined;
	};
	const resolveName = async (mod: Module, name: string): Promise<Def | undefined> => {
		const [head, ...rest] = name.split('.');
		const local = byFile.get(mod.file)?.find((d) => d.name === head);
		if (local && !rest.length) return local;
		const imp = mod.imports.get(head!);
		if (!imp) return undefined;
		const target = resolveImport(ctx.project, mod.file, imp.source);
		if (!target) return undefined;
		if (imp.imported === '*' && rest.length) return exported(target, rest[0]!);
		return exported(target, imp.imported);
	};
	const autoImported = new Map<string, Def>();
	for (const [file, list] of byFile) {
		const m = /^(?:app\/|src\/)?components\/(.+)\.(vue|svelte|tsx|jsx)$/.exec(file);
		if (!m || !list[0]) continue;
		const segments = m[1]!.split('/');
		if (segments.at(-1) === 'index') segments.pop();
		autoImported.set(pascal(segments.join('-')), list[0]);
		autoImported.set(pascal(segments.at(-1)!), autoImported.get(pascal(segments.at(-1)!)) ?? list[0]);
	}
	const selectors = new Map<string, Def>();
	for (const d of defs.values()) if (d.selector) for (const s of d.selector.split(',')) selectors.set(s.trim(), d);
	const uses = new Map<string, Set<string>>();
	const link = (from: string, to: Def | undefined) => {
		if (!to || to.id === from) return;
		const set = uses.get(from) ?? new Set();
		set.add(to.id);
		uses.set(from, set);
	};
	for (const [file, mod] of mods) {
		const list = byFile.get(file) ?? [];
		if (SFC.test(file)) {
			const owner = list[0]!;
			for (const tag of tagNames(mod.template)) {
				const name = isPascal(tag.split('.')[0]!) ? tag : file.endsWith('.vue') && tag.includes('-') ? pascal(tag) : undefined;
				if (!name) continue;
				link(owner.id, (await resolveName(mod, name)) ?? (file.endsWith('.vue') ? autoImported.get(name) : undefined));
			}
			continue;
		}
		for (const def of list) {
			if (def.selector || !def.node) continue;
			const tags: string[] = [];
			walk(def.node, (n) => {
				if (n.type === 'JSXOpeningElement') {
					const name = n.name.type === 'JSXIdentifier' ? n.name.name : n.name.type === 'JSXMemberExpression' ? `${n.name.object.name}.${n.name.property.name}` : undefined;
					if (name && isPascal(name.split('.')[0]!)) tags.push(name);
				}
				if (n.type === 'CallExpression' && /^(React\.)?createElement$|^h$|^jsx$/.test(memberName(n.callee) ?? '') && n.arguments[0]?.type === 'Identifier') tags.push(n.arguments[0].name);
			});
			for (const tag of new Set(tags)) link(def.id, await resolveName(mod, tag));
		}
		for (const def of list.filter((d) => d.selector)) {
			const decorator = (def.node!.decorators as N[]).find((d) => memberName(unwrap(d.expression)?.callee) === 'Component')!;
			const opts = unwrap(decorator.expression)!.arguments[0];
			let template = str(property(opts, 'template'), mod) ?? '';
			const url = str(property(opts, 'templateUrl'), mod);
			if (url) template += await ctx.project.read(posix.normalize(posix.join(posix.dirname(file), url)));
			for (const tag of tagNames(template)) link(def.id, selectors.get(tag));
		}
	}
	const routeFiles = new Set(routes.map((r) => r.file));
	// A file that declares one route and names an imported component (TanStack Router's `component: Users`) renders it: the file stands for the route.
	const routeOwners: Def[] = [];
	for (const file of routeFiles) {
		if (routes.filter((r) => r.file === file).length !== 1) continue;
		const mod = mods.get(file) ?? (await ctx.module(file));
		if (!mod) continue;
		const named = new Set<string>();
		let line = 0;
		walk(mod.program, (n) => {
			if (n.type !== 'Property' || n.value?.type !== 'Identifier') return;
			const key = n.key?.type === 'Identifier' ? n.key.name : n.key?.type === 'Literal' ? String(n.key.value) : '';
			if (!/^(component|pendingComponent|errorComponent|notFoundComponent)$/.test(key)) return;
			named.add(n.value.name);
			line ||= mod.line(n.start);
		});
		const local = new Set((byFile.get(file) ?? []).map((d) => d.name));
		const targets = (await Promise.all([...named].filter((name) => !local.has(name)).map((name) => resolveName(mod, name)))).filter((d): d is Def => Boolean(d));
		if (!targets.length) continue;
		const owner: Def = { id: `${file}#Route`, name: 'Route', file, line, node: undefined };
		routeOwners.push(owner);
		for (const t of targets) link(owner.id, t);
	}
	const out: Component[] = [];
	for (const d of routeOwners) out.push({ name: d.name, file: d.file, line: d.line, id: d.id, kind: 'route', uses: [...(uses.get(d.id) ?? [])].sort(), usedBy: [] });
	for (const d of defs.values()) {
		const mod = mods.get(d.file);
		const isDefault = SFC.test(d.file) || (!!mod && (await exported(d.file, 'default'))?.id === d.id);
		const routeComponent = isDefault || (!!mod && new RegExp(`\\bcomponent\\s*:\\s*${d.name}\\b`).test(mod.text));
		const kind: Component['kind'] = LAYOUT_FILE.test(d.file) && isDefault ? 'layout' : routeFiles.has(d.file) && routeComponent ? 'route' : 'component';
		out.push({ name: d.name, file: d.file, line: d.line, id: d.id, kind, uses: [...(uses.get(d.id) ?? [])].sort(), usedBy: [] });
	}
	const byId = new Map(out.map((c) => [c.id, c]));
	for (const c of out) for (const u of c.uses) byId.get(u)?.usedBy.push(c.id);
	for (const c of out) c.usedBy.sort();
	return out.sort((a, b) => a.id.localeCompare(b.id));
}

/** Migration order: dependencies before what renders them; among ready ones, layouts first, then the most depended-on. */
export function planOrder(facts: { components: readonly Component[] }): PlanStep[] {
	const byId = new Map(facts.components.map((c) => [c.id, c]));
	const dependents = new Map<string, number>();
	const count = (id: string) => {
		if (dependents.has(id)) return dependents.get(id)!;
		dependents.set(id, 0);
		const seen = new Set<string>();
		const queue = [...(byId.get(id)?.usedBy ?? [])];
		while (queue.length) {
			const next = queue.pop()!;
			if (seen.has(next) || next === id) continue;
			seen.add(next);
			queue.push(...(byId.get(next)?.usedBy ?? []));
		}
		dependents.set(id, seen.size);
		return seen.size;
	};
	const remaining = new Map(facts.components.map((c) => [c.id, new Set(c.uses.filter((u) => byId.has(u) && u !== c.id))]));
	const rank = { layout: 0, component: 1, route: 2 } as const;
	const order: PlanStep[] = [];
	const better = (a: Component, b: Component) => rank[a.kind] - rank[b.kind] || count(b.id) - count(a.id) || a.id.localeCompare(b.id);
	while (remaining.size) {
		let ready = [...remaining].filter(([, deps]) => deps.size === 0).map(([id]) => byId.get(id)!);
		if (!ready.length) ready = [[...remaining].sort(([a, x], [b, y]) => x.size - y.size || a.localeCompare(b))[0]!].map(([id]) => byId.get(id)!);
		const next = ready.sort(better)[0]!;
		order.push({ kind: next.kind, id: next.id, name: next.name, file: next.file, unlocks: count(next.id) });
		remaining.delete(next.id);
		for (const deps of remaining.values()) deps.delete(next.id);
	}
	return order;
}

