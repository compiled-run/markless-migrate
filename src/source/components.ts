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
				// A component handed to a library as data renders where the library puts it: `{ cellRenderer: Badge }`.
				if (n.type === 'Property' && n.value?.type === 'Identifier' && isPascal(n.value.name)) tags.push(n.value.name);
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
	// A bundler entry with no component of its own renders the app's root: `createRoot(el).render(<App />)`.
	for (const file of new Set(routes.flatMap((r) => r.entries ?? []))) {
		if (byFile.get(file)?.length) continue;
		const mod = mods.get(file) ?? (await ctx.module(file));
		if (!mod) continue;
		const tags = new Set<string>();
		let line = 0;
		walk(mod.program, (n) => {
			if (n.type !== 'JSXOpeningElement' || n.name.type !== 'JSXIdentifier' || !isPascal(n.name.name)) return;
			tags.add(n.name.name);
			line ||= mod.line(n.start);
		});
		const targets = (await Promise.all([...tags].map((name) => resolveName(mod, name)))).filter((d): d is Def => Boolean(d));
		if (!targets.length) continue;
		const owner: Def = { id: `${file}#Entry`, name: 'Entry', file, line, node: undefined };
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
	const count = dependentCounts(facts.components);
	const rank = { layout: 0, component: 1, route: 2 } as const;
	const place = new Map(facts.components.map((c, i) => [c.id, i]));
	// Ties keep the components' own order, as a stable sort of the ready ones would.
	const better = (a: Component, b: Component) => rank[a.kind] - rank[b.kind] || count(b.id) - count(a.id) || a.id.localeCompare(b.id) || place.get(a.id)! - place.get(b.id)!;
	const remaining = new Map(facts.components.map((c) => [c.id, new Set(c.uses.filter((u) => byId.has(u) && u !== c.id))]));
	const waiting = new Map<string, string[]>();
	for (const [id, deps] of remaining) for (const d of deps) (waiting.get(d) ?? waiting.set(d, []).get(d)!).push(id);
	const ready = new Heap<Component>(better);
	for (const [id, deps] of remaining) if (!deps.size) ready.push(byId.get(id)!);
	const order: PlanStep[] = [];
	while (remaining.size) {
		let next = ready.pop();
		// A cycle leaves nothing ready: the component with the fewest dependencies left goes first.
		if (!next) {
			let pick: [string, Set<string>] | undefined;
			for (const entry of remaining) if (!pick || entry[1].size - pick[1].size < 0 || (entry[1].size === pick[1].size && entry[0].localeCompare(pick[0]) < 0)) pick = entry;
			next = byId.get(pick![0])!;
		}
		order.push({ kind: next.kind, id: next.id, name: next.name, file: next.file, unlocks: count(next.id) });
		remaining.delete(next.id);
		for (const id of waiting.get(next.id) ?? []) {
			const deps = remaining.get(id);
			if (deps?.delete(next.id) && !deps.size) ready.push(byId.get(id)!);
		}
	}
	return order;
}

// How many components render each one, directly or through others (itself left out): strongly connected parts found once,
// and each part's dependents a bit set joined from the parts that render it.
function dependentCounts(components: readonly Component[]): (id: string) => number {
	const index = new Map<string, number>();
	const ids: string[] = [];
	const at = (id: string) => index.get(id) ?? (index.set(id, ids.push(id) - 1), ids.length - 1);
	for (const c of components) at(c.id);
	const edges: number[][] = [];
	for (const c of components) edges[at(c.id)] = [...new Set(c.usedBy.map(at))];
	const n = ids.length;
	for (let v = 0; v < n; v++) edges[v] ??= [];
	// Tarjan's algorithm without recursion: parts come out with every part they reach already out.
	const order = new Int32Array(n).fill(-1);
	const low = new Int32Array(n);
	const part = new Int32Array(n).fill(-1);
	const stack: number[] = [];
	const onStack = new Uint8Array(n);
	const parts: number[][] = [];
	let time = 0;
	for (let root = 0; root < n; root++) {
		if (order[root] !== -1) continue;
		const work: [number, number][] = [[root, 0]];
		order[root] = low[root] = time++;
		stack.push(root);
		onStack[root] = 1;
		while (work.length) {
			const top = work[work.length - 1]!;
			const [v, i] = top;
			if (i < edges[v]!.length) {
				top[1]++;
				const w = edges[v]![i]!;
				if (order[w] === -1) {
					order[w] = low[w] = time++;
					stack.push(w);
					onStack[w] = 1;
					work.push([w, 0]);
				} else if (onStack[w]) low[v] = Math.min(low[v]!, order[w]!);
				continue;
			}
			work.pop();
			if (work.length) {
				const u = work[work.length - 1]![0];
				low[u] = Math.min(low[u]!, low[v]!);
			}
			if (low[v] === order[v]) {
				const members: number[] = [];
				for (let w = stack.pop()!; ; w = stack.pop()!) {
					onStack[w] = 0;
					part[w] = parts.length;
					members.push(w);
					if (w === v) break;
				}
				parts.push(members);
			}
		}
	}
	const words = (n + 31) >>> 5;
	const reach = parts.map(() => new Uint32Array(words));
	const bit = (set: Uint32Array, v: number) => (set[v >>> 5]! |= 1 << (v & 31));
	parts.forEach((members, p) => {
		const own = reach[p]!;
		for (const v of members)
			for (const w of edges[v]!) {
				const q = part[w]!;
				bit(own, w);
				if (q !== p) for (let k = 0; k < words; k++) own[k]! |= reach[q]![k]!;
			}
	});
	const ones = (x: number) => {
		x -= (x >>> 1) & 0x55555555;
		x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
		return (((x + (x >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
	};
	const counts = reach.map((set) => set.reduce((sum, word) => sum + ones(word), 0));
	return (id: string) => {
		const v = index.get(id);
		if (v === undefined) return 0;
		const own = reach[part[v]!]!;
		return counts[part[v]!]! - ((own[v >>> 5]! >>> (v & 31)) & 1);
	};
}

/** A binary heap: pop gives the least by `less`. */
class Heap<T> {
	private readonly items: T[] = [];
	private readonly less: (a: T, b: T) => number;
	constructor(less: (a: T, b: T) => number) {
		this.less = less;
	}
	push(item: T): void {
		const a = this.items;
		a.push(item);
		for (let i = a.length - 1; i > 0; ) {
			const up = (i - 1) >> 1;
			if (this.less(a[i]!, a[up]!) >= 0) break;
			[a[i], a[up]] = [a[up]!, a[i]!];
			i = up;
		}
	}
	pop(): T | undefined {
		const a = this.items;
		if (!a.length) return undefined;
		const top = a[0]!;
		const last = a.pop()!;
		if (a.length) {
			a[0] = last;
			for (let i = 0; ; ) {
				const l = 2 * i + 1;
				const r = l + 1;
				let m = i;
				if (l < a.length && this.less(a[l]!, a[m]!) < 0) m = l;
				if (r < a.length && this.less(a[r]!, a[m]!) < 0) m = r;
				if (m === i) break;
				[a[i], a[m]] = [a[m]!, a[i]!];
				i = m;
			}
		}
		return top;
	}
}
