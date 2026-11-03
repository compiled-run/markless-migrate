// The code a function can run, declaration by declaration: from named top-level bindings, every binding they reference,
// followed through imports and re-exports (code-closure.ts's module edges), plus each loaded module's top-level code that
// runs at load. A key over that code is unchanged by an edit to code the entries never reach.
import { createHash, randomUUID } from 'node:crypto';
import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHILD_KEYS } from 'yuku/ast';
import { moduleEdges, resolveSpecifier, ROOT, type Target } from './code-closure.ts';
import { keyName, patternNames, type N } from './source/js.ts';

interface Parsed {
	readonly file: string;
	readonly text: string;
	readonly ok: boolean;
	readonly body: readonly N[];
	/** Top-level runtime binding to the statement that declares it. */
	readonly decls: ReadonlyMap<string, N>;
	readonly imports: ReadonlyMap<string, { readonly target: Target; readonly imported: string }>;
	readonly exports: ReadonlyMap<string, string>;
	readonly reexports: ReadonlyMap<string, { readonly target: Target; readonly imported: string }>;
	readonly stars: readonly Target[];
	/** What loading the module loads: its runtime static imports, re-exports and side-effect imports. */
	readonly loads: readonly Target[];
	/** Top-level statements run at load for their effect (a constant's initializer counts once something reads the constant). */
	readonly effects: readonly N[];
	/** Loads made from inside code (import(), require, new URL(…, import.meta.url), paths beside the module), by offset. */
	readonly inner: readonly { readonly at: number; readonly target: Target }[];
	readonly unresolved: readonly { readonly at: number | undefined; readonly why: string }[];
}

const TYPE_NODE = /^TS(?!Enum|Module|As|Satisfies|NonNull|Instantiation|TypeAssertion|ParameterProperty|ExportAssignment|ImportEquals|ExternalModuleReference)/;
const EFFECT = new Set(['CallExpression', 'NewExpression', 'TaggedTemplateExpression', 'AwaitExpression', 'AssignmentExpression', 'UpdateExpression', 'YieldExpression', 'ImportExpression', 'UnaryExpression']);
const DEFERRED = new Set(['FunctionExpression', 'ArrowFunctionExpression', 'FunctionDeclaration']);

function visit(node: N, enter: (node: N, parent: N | undefined, key: string | undefined) => boolean | void, parent?: N, key?: string): void {
	if (enter(node, parent, key) === false) return;
	for (const k of CHILD_KEYS[node.type] ?? []) {
		const child = node[k];
		if (Array.isArray(child)) for (const c of child) c && typeof c.type === 'string' && visit(c, enter, node, k);
		else if (child && typeof child.type === 'string') visit(child, enter, node, k);
	}
}

/** Names a node reads, its type annotations aside. A name a local binding shadows is kept: one binding too many is safe. */
function references(node: N): Set<string> {
	const names = new Set<string>();
	visit(node, (n, parent, key) => {
		if (TYPE_NODE.test(n.type)) return false;
		if (n.type !== 'Identifier') return;
		if (parent && !parent.computed && key === 'property' && parent.type === 'MemberExpression') return;
		if (parent && !parent.computed && key === 'key' && /^(Property|MethodDefinition|PropertyDefinition|AccessorProperty)$/.test(parent.type)) return;
		names.add(n.name);
	});
	return names;
}

/** Whether evaluating the node at load runs code: a call, construction or assignment outside any function it defines. */
function runsAtLoad(node: N): boolean {
	let runs = false;
	visit(node, (n, parent, key) => {
		if (runs || TYPE_NODE.test(n.type)) return false;
		if (DEFERRED.has(n.type)) return false;
		if (n.type === 'StaticBlock' || n.type === 'Decorator' || (n.type === 'PropertyDefinition' && n.static && n.value)) runs = true;
		else if ((n.type === 'PropertyDefinition' || n.type === 'MethodDefinition') && !n.static && key === 'body' && parent?.type === 'ClassBody') return n.computed ? undefined : false;
		else if (EFFECT.has(n.type) && !(n.type === 'UnaryExpression' && n.operator !== 'delete')) runs = true;
		return !runs;
	});
	return runs;
}

async function load(file: string): Promise<Parsed> {
	const text = await readFile(file, 'utf8');
	const found = await moduleEdges(file, text);
	const offset = (site: string) => Number(/:(\d+)$/.exec(site)?.[1]);
	const unresolved = found.unresolved.map((u) => {
		const at = /^\S+:(\d+) /.exec(u)?.[1];
		return { at: at === undefined ? undefined : Number(at), why: u };
	});
	const body = ((found.program?.body ?? []) as N[]).filter(Boolean);
	const decls = new Map<string, N>();
	const imports = new Map<string, { target: Target; imported: string }>();
	const exports = new Map<string, string>();
	const reexports = new Map<string, { target: Target; imported: string }>();
	const stars: Target[] = [];
	const loads: Target[] = [];
	const effects: N[] = [];
	const structural = new Set<number>();
	const declare = (decl: N, stmt: N): boolean => {
		if (decl.type === 'VariableDeclaration') {
			if (decl.declare) return true;
			for (const d of decl.declarations as N[]) for (const name of patternNames(d.id)) decls.set(name, stmt);
			return true;
		}
		if (decl.type === 'FunctionDeclaration' || decl.type === 'ClassDeclaration' || decl.type === 'TSEnumDeclaration' || decl.type === 'TSModuleDeclaration') {
			if (decl.declare) return true;
			const name = decl.id?.type === 'Identifier' ? decl.id.name : undefined;
			if (name) decls.set(name, stmt);
			if (decl.type === 'ClassDeclaration' && runsAtLoad(decl)) effects.push(stmt);
			return true;
		}
		return TYPE_NODE.test(decl.type) || decl.type === 'EmptyStatement';
	};
	for (const stmt of body) {
		if (stmt.type === 'ImportDeclaration') {
			structural.add(stmt.start);
			if (stmt.importKind === 'type') continue;
			const target = resolveSpecifier(file, stmt.source.value);
			loads.push(target);
			for (const s of (stmt.specifiers ?? []) as N[]) {
				if (s.importKind === 'type') continue;
				const imported = s.type === 'ImportDefaultSpecifier' ? 'default' : s.type === 'ImportNamespaceSpecifier' ? '*' : (keyName(s.imported) ?? '');
				imports.set(s.local.name, { target, imported });
			}
		} else if (stmt.type === 'ExportAllDeclaration') {
			structural.add(stmt.start);
			if (stmt.exportKind === 'type') continue;
			const target = resolveSpecifier(file, stmt.source.value);
			loads.push(target);
			if (stmt.exported) reexports.set(keyName(stmt.exported) ?? '', { target, imported: '*' });
			else stars.push(target);
		} else if (stmt.type === 'ExportNamedDeclaration') {
			if (stmt.source) {
				structural.add(stmt.start);
				if (stmt.exportKind === 'type') continue;
				const target = resolveSpecifier(file, stmt.source.value);
				loads.push(target);
				for (const s of (stmt.specifiers ?? []) as N[]) if (s.exportKind !== 'type') reexports.set(keyName(s.exported) ?? '', { target, imported: keyName(s.local) ?? '' });
				continue;
			}
			if (stmt.declaration) {
				declare(stmt.declaration, stmt);
				const d = stmt.declaration as N;
				const names = d.type === 'VariableDeclaration' ? (d.declarations as N[]).flatMap((x) => patternNames(x.id)) : d.id?.type === 'Identifier' ? [d.id.name as string] : [];
				if (!TYPE_NODE.test(d.type) && !d.declare) for (const name of names) exports.set(name, name);
			}
			if (stmt.exportKind !== 'type') for (const s of (stmt.specifiers ?? []) as N[]) if (s.exportKind !== 'type') exports.set(keyName(s.exported) ?? '', keyName(s.local) ?? '');
		} else if (stmt.type === 'ExportDefaultDeclaration') {
			const d = stmt.declaration as N;
			if (d.type === 'Identifier') exports.set('default', d.name);
			else {
				const name = (d.type === 'FunctionDeclaration' || d.type === 'ClassDeclaration') && d.id ? d.id.name : '*default*';
				decls.set(name, stmt);
				exports.set('default', name);
				if (d.type === 'ClassDeclaration' ? runsAtLoad(d) : d.type !== 'FunctionDeclaration') effects.push(stmt);
			}
		} else if (!declare(stmt, stmt)) effects.push(stmt);
	}
	const inner = found.edges.filter((e) => !e.typeOnly && !structural.has(offset(e.site))).map((e) => ({ at: offset(e.site), target: e.target }));
	return { file, text, ok: Boolean(found.program), body, decls, imports, exports, reexports, stars, loads, effects, inner, unresolved };
}

async function filesIn(dir: string): Promise<string[]> {
	const out: string[] = [];
	for (const entry of await readdir(dir, { withFileTypes: true })) {
		if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
		const path = join(dir, entry.name);
		if (entry.isDirectory()) out.push(...(await filesIn(path)));
		else if (entry.isFile()) out.push(path);
	}
	return out;
}

export interface DeclarationClosure {
	/** Each top-level statement the entries can run, as `path:offset name`, sorted. */
	readonly units: readonly string[];
	/** Files taken whole: loaded as a module namespace, opened beside a module, or not a module at all. */
	readonly files: readonly string[];
	readonly packages: Readonly<Record<string, string>>;
	/** Loads in reached code no file could be named for: a key over this closure is never reused. */
	readonly unresolved: readonly string[];
	/** The text of every unit and the bytes of every whole file, in order, for the key. */
	readonly parts: readonly (readonly [string, string | Uint8Array])[];
}

const PARSED = /\.[cm]?[jt]sx?$/;
// The key's own machinery: a cache that keys itself by its code reaches these, and they record nothing.
const OPAQUE = new Set([fileURLToPath(import.meta.url), fileURLToPath(new URL('./code-closure.ts', import.meta.url))]);

/** The declarations `entries` (a file and top-level names in it) can run, and the code every module they load runs at load. */
export async function declarationClosure(entries: readonly { readonly file: string; readonly names: readonly string[] }[]): Promise<DeclarationClosure> {
	const reached = new Map<string, Map<number, { node: N; name: string }>>();
	const loaded = new Set<string>();
	const whole = new Set<string>();
	const raw = new Set<string>();
	const packages: Record<string, string> = {};
	const unresolved = new Set<string>();
	const queue: (() => Promise<void>)[] = [];
	const exportsSeen = new Set<string>();
	const parsed = new Map<string, Promise<Parsed>>();
	const parseFile = (file: string): Promise<Parsed> => {
		let p = parsed.get(file);
		if (!p) parsed.set(file, (p = load(file)));
		return p;
	};

	const target = (t: Target, why: string): void => {
		if (t.kind === 'package') packages[t.name] = t.version;
		else if (t.kind === 'unresolved') unresolved.add(`${why}: ${t.why}`);
		else if (t.kind === 'file') queue.push(() => wholeFile(t.path));
		else if (t.kind === 'dir') queue.push(async () => {
			for (const f of await filesIn(t.path)) await wholeFile(f);
		});
	};
	const loadModule = async (file: string): Promise<Parsed | undefined> => {
		if (OPAQUE.has(file)) return undefined;
		if (!PARSED.test(file)) {
			raw.add(file);
			return undefined;
		}
		const mod = await parseFile(file);
		if (loaded.has(file)) return mod;
		loaded.add(file);
		if (!mod.ok) unresolved.add(mod.unresolved[0]?.why ?? `${relative(ROOT, file)} does not parse`);
		for (const t of mod.loads) {
			if (t.kind === 'file') queue.push(() => loadModule(t.path).then(() => {}));
			else target(t, relative(ROOT, file));
		}
		for (const stmt of mod.effects) unit(mod, stmt, '(runs at load)');
		return mod;
	};
	const wholeFile = async (file: string): Promise<void> => {
		if (whole.has(file)) return;
		whole.add(file);
		const mod = await loadModule(file);
		if (!mod) return;
		for (const [name, stmt] of mod.decls) unit(mod, stmt, name);
		for (const name of mod.reexports.keys()) queue.push(() => exported(file, name));
		for (const star of mod.stars) target(star, relative(ROOT, file));
	};
	const unit = (mod: Parsed, stmt: N, name: string): void => {
		const units = reached.get(mod.file) ?? reached.set(mod.file, new Map()).get(mod.file)!;
		if (units.has(stmt.start)) return;
		units.set(stmt.start, { node: stmt, name });
		for (const ref of references(stmt)) queue.push(() => local(mod.file, ref));
		for (const u of mod.unresolved) if (u.at !== undefined && u.at >= stmt.start && u.at < stmt.end) unresolved.add(u.why);
		for (const e of mod.inner) if (e.at >= stmt.start && e.at < stmt.end) target(e.target, `${relative(ROOT, mod.file)}:${e.at}`);
	};
	const local = async (file: string, name: string): Promise<void> => {
		const mod = await loadModule(file);
		if (!mod) return;
		const decl = mod.decls.get(name);
		if (decl) return unit(mod, decl, name);
		const imp = mod.imports.get(name);
		if (!imp) return;
		if (imp.target.kind !== 'file') return target(imp.target, `${relative(ROOT, file)} ${name}`);
		if (imp.imported === '*') return wholeFile(imp.target.path);
		await exported(imp.target.path, imp.imported);
	};
	const exported = async (file: string, name: string): Promise<void> => {
		const seen = `${file}\0${name}`;
		if (exportsSeen.has(seen)) return;
		exportsSeen.add(seen);
		const mod = await loadModule(file);
		if (!mod) return;
		const localName = mod.exports.get(name);
		if (localName !== undefined) return local(file, localName);
		const re = mod.reexports.get(name);
		if (re) {
			if (re.target.kind !== 'file') return target(re.target, `${relative(ROOT, file)} ${name}`);
			return re.imported === '*' ? wholeFile(re.target.path) : exported(re.target.path, re.imported);
		}
		// `export *` never forwards `default`; a name none of them has is a missing binding, which the module's own load reports.
		if (name !== 'default') for (const star of mod.stars) if (star.kind === 'file') await exported(star.path, name);
	};

	for (const entry of entries) {
		const file = resolve(entry.file);
		if (!(await stat(file).then((s) => s.isFile(), () => false))) {
			unresolved.add(`${relative(ROOT, file)} is not a file`);
			continue;
		}
		for (const name of entry.names) {
			const mod = await loadModule(file);
			if (!mod?.decls.has(name) && !mod?.imports.has(name)) unresolved.add(`${relative(ROOT, file)} has no top-level ${name}`);
			queue.push(() => local(file, name));
		}
	}
	while (queue.length) await queue.shift()!();

	const parts: [string, string | Uint8Array][] = [];
	const units: string[] = [];
	for (const file of [...reached.keys()].sort()) {
		const mod = await parseFile(file);
		for (const [start, { node, name }] of [...reached.get(file)!].sort(([a], [b]) => a - b)) {
			units.push(`${relative(ROOT, file)}:${start} ${name}`);
			parts.push([`unit ${relative(ROOT, file)}`, mod.text.slice(start, node.end)]);
		}
	}
	const files = [...raw].sort();
	for (const file of files) parts.push([`file ${relative(ROOT, file)}`, await readFile(file)]);
	for (const [name, version] of Object.entries(packages).sort(([a], [b]) => (a < b ? -1 : 1))) parts.push([`package ${name}`, version]);
	return { units, files, packages, unresolved: [...unresolved].sort(), parts };
}

/** A key over the entries' declaration closure and `extra`; unique per call when any load in it is unresolved. */
export async function declarationKey(entries: readonly { readonly file: string; readonly names: readonly string[] }[], extra: Readonly<Record<string, string>> = {}): Promise<string> {
	const closure = await declarationClosure(entries);
	const hash = createHash('sha256');
	const part = (name: string, value: string | Uint8Array) => {
		const bytes = typeof value === 'string' ? Buffer.from(value) : value;
		hash.update(`${name}\0${bytes.length}\0`).update(bytes);
	};
	for (const [name, value] of closure.parts) part(name, value);
	for (const [name, value] of Object.entries(extra).sort(([a], [b]) => (a < b ? -1 : 1))) part(`extra ${name}`, value);
	if (closure.unresolved.length) part('unresolved', `${closure.unresolved.join('\n')}\n${randomUUID()}`);
	return hash.digest('base64url').slice(0, 22);
}
