// The code a piece of this repository runs, by its module graph: each module parsed (yuku), its imports, re-exports,
// dynamic imports, requires and the files it opens beside itself followed. A key over that code changes when any of it does.
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { readdir, readFile, stat } from 'node:fs/promises';
import { isBuiltin } from 'node:module';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yuku';
import { walk, type N } from './source/js.ts';

/** The package root (the folder of package.json): files are keyed by their path from it. */
export const ROOT = resolve(import.meta.dirname, '..');

export type Target =
	| { readonly kind: 'file'; readonly path: string }
	| { readonly kind: 'dir'; readonly path: string }
	| { readonly kind: 'package'; readonly name: string; readonly version: string }
	| { readonly kind: 'builtin' }
	| { readonly kind: 'unresolved'; readonly why: string };

export interface Edge {
	readonly spec: string;
	readonly target: Target;
	/** `import type` / `export type ... from`: erased, so nothing of the target runs. */
	readonly typeOnly: boolean;
	/** `file:offset`, for messages. */
	readonly site: string;
}

const PARSED = /\.[cm]?[jt]sx?$/;

function packageOf(from: string, name: string): Target {
	for (let dir = dirname(from); ; dir = dirname(dir)) {
		const manifest = join(dir, 'node_modules', name, 'package.json');
		if (existsSync(manifest)) {
			try {
				const { version } = JSON.parse(readFileSync(manifest, 'utf8')) as { version?: string };
				return { kind: 'package', name, version: version ?? '' };
			} catch (error) {
				return { kind: 'unresolved', why: `${manifest}: ${(error as Error).message}` };
			}
		}
		if (dirname(dir) === dir) return { kind: 'unresolved', why: `no package ${name} above ${from}` };
	}
}

/** Where a specifier written in `from` leads. A relative path that ends in `/` (or names a folder) is the whole folder. */
export function resolveSpecifier(from: string, spec: string): Target {
	if (spec.startsWith('node:') || isBuiltin(spec)) return { kind: 'builtin' };
	if (spec.startsWith('file:')) spec = fileURLToPath(spec);
	if (spec.startsWith('.') || spec.startsWith('/')) {
		const path = resolve(dirname(from), spec);
		if (!existsSync(path)) return { kind: 'unresolved', why: `${spec} from ${relative(ROOT, from)} does not exist` };
		return spec.endsWith('/') || isDir(path) ? { kind: 'dir', path } : { kind: 'file', path };
	}
	const parts = spec.split('/');
	return packageOf(from, spec.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0]!);
}

let dependencies: string[] | undefined;
const ownDependencies = (): string[] => {
	if (!dependencies) {
		const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
		dependencies = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }).sort();
	}
	return dependencies;
};

const isDir = (path: string): boolean => statSync(path, { throwIfNoEntry: false })?.isDirectory() ?? false;

const literal = (node: N | undefined): string | undefined => (node?.type === 'Literal' && typeof node.value === 'string' ? node.value : node?.type === 'TemplateLiteral' && node.expressions.length === 0 ? node.quasis[0].value.cooked : undefined);
const isImportMeta = (node: N | undefined, prop: string): boolean => node?.type === 'MemberExpression' && node.object?.type === 'MetaProperty' && node.property?.name === prop;
const calleeName = (node: N): string | undefined => (node.type === 'Identifier' ? node.name : node.type === 'MemberExpression' && !node.computed ? `${calleeName(node.object) ?? '?'}.${node.property.name}` : undefined);

/**
 * What a module loads: static and dynamic imports, re-exports, `require`/`createRequire(...)(...)`, `new URL(lit, import.meta.url)`,
 * and `join`/`resolve(import.meta.dirname, lit...)`. A load the parse cannot name (a computed specifier, a path built from
 * `import.meta.dirname` with anything but literals, a parse error) is in `unresolved`.
 */
export async function moduleEdges(file: string, source?: string): Promise<{ readonly program?: N; readonly edges: readonly Edge[]; readonly unresolved: readonly string[] }> {
	if (!PARSED.test(file)) return { edges: [], unresolved: [] };
	const text = source ?? (await readFile(file, 'utf8'));
	const result = parse(text, { path: file, sourceType: file.endsWith('.cjs') ? 'script' : 'module', preserveParens: false } as Parameters<typeof parse>[1]);
	const errors = result.diagnostics.filter((d) => d.severity === 'error');
	const at = (node: N) => `${relative(ROOT, file)}:${node.start}`;
	if (errors.length) return { edges: [], unresolved: [`${relative(ROOT, file)}: does not parse (${errors[0]!.message})`] };
	const program = result.program as unknown as N;
	const edges: Edge[] = [];
	const unresolved: string[] = [];
	const add = (spec: string, node: N, typeOnly = false) => {
		const target = resolveSpecifier(file, spec);
		if (target.kind === 'unresolved') unresolved.push(`${at(node)} ${target.why}`);
		edges.push({ spec, target, typeOnly, site: at(node) });
	};
	const handled = new Set<N>();
	// A computed specifier: a relative one's literal folder, a bare one any package this one depends on, else unresolved.
	const dynamic = (node: N, source: N | undefined) => {
		const spec = literal(source);
		if (spec !== undefined) return add(spec, node);
		if (source?.type === 'MemberExpression' && source.object?.type === 'NewExpression' && isImportMeta(source.object.arguments?.[1], 'url')) return;
		const lead = source?.type === 'TemplateLiteral' ? source.quasis[0].value.cooked as string : undefined;
		if (lead?.startsWith('./') || lead?.startsWith('../')) return add(lead.slice(0, lead.lastIndexOf('/') + 1), node);
		if (lead !== undefined && !lead.startsWith('/') && !lead.includes(':')) {
			for (const name of ownDependencies()) add(name, node);
			return;
		}
		unresolved.push(`${at(node)} a load of a computed specifier`);
	};
	walk(program, (node) => {
		switch (node.type) {
			case 'ImportDeclaration':
				add(node.source.value, node, node.importKind === 'type');
				return false;
			case 'ExportAllDeclaration':
			case 'ExportNamedDeclaration':
				if (node.source) add(node.source.value, node, node.exportKind === 'type');
				return;
			case 'ImportExpression':
				dynamic(node, node.source);
				return;
			case 'NewExpression':
				if (node.callee?.type === 'Identifier' && node.callee.name === 'URL' && isImportMeta(node.arguments[1], 'url')) {
					const spec = literal(node.arguments[0]);
					if (spec === undefined) unresolved.push(`${at(node)} new URL of a computed path beside the module`);
					else add(spec.startsWith('.') ? spec : `./${spec}`, node);
					handled.add(node.arguments[1]);
				}
				return;
			case 'CallExpression': {
				const name = calleeName(node.callee);
				const requires = name === 'require' || name === 'require.resolve' || (node.callee.type === 'CallExpression' && calleeName(node.callee.callee) === 'createRequire');
				if (requires) {
					dynamic(node, node.arguments[0]);
					return;
				}
				if ((name === 'join' || name === 'resolve' || name === 'path.join' || name === 'path.resolve') && (isImportMeta(node.arguments[0], 'dirname') || node.arguments[0]?.type === 'Identifier' && node.arguments[0].name === '__dirname')) {
					handled.add(node.arguments[0]);
					const rest = node.arguments.slice(1).map(literal);
					if (rest.some((r: string | undefined) => r === undefined)) add('./', node);
					else add(`./${rest.join('/')}${rest.length ? '' : '/'}`, node);
				}
				return;
			}
			case 'MemberExpression':
				// Whatever else is read through the module's own path is taken to be under its folder.
				if ((isImportMeta(node, 'dirname') || isImportMeta(node, 'filename')) && !handled.has(node)) add('./', node);
				return;
		}
	});
	return { program, edges, unresolved };
}

async function dirFiles(dir: string): Promise<string[]> {
	const out: string[] = [];
	for (const entry of await readdir(dir, { withFileTypes: true })) {
		if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
		const path = join(dir, entry.name);
		if (entry.isDirectory()) out.push(...(await dirFiles(path)));
		else if (entry.isFile()) out.push(path);
	}
	return out;
}

export interface Closure {
	/** Every file the entries can load, themselves included, absolute and sorted. */
	readonly files: readonly string[];
	/** Each package any of them imports, by name, at its installed version. */
	readonly packages: Readonly<Record<string, string>>;
	/** Folders read through a digest of what is read of them (`ClosureOptions.dirs`), by path from ROOT. */
	readonly dirs: Readonly<Record<string, string>>;
	/** Loads no file could be named for: a key over this closure is never reused. */
	readonly unresolved: readonly string[];
}

export interface ClosureOptions {
	/** A folder (absolute) that one module (`by`, from ROOT) reads as data, with what it reads of it: used in place of every file under it. */
	readonly dirs?: readonly { readonly dir: string; readonly by: string; readonly read: () => Promise<string> }[];
	/** Loads followed as if a module of the closure made them (`usedBy`'s). */
	readonly edges?: readonly Edge[];
}

/** The entries' module graph: type-only imports aside, every module they load, every file and folder they open beside themselves. */
export async function closureOf(entries: readonly string[], options: ClosureOptions = {}): Promise<Closure> {
	const files = new Set<string>();
	const packages: Record<string, string> = {};
	const unresolved: string[] = [];
	const dirs: Record<string, string> = {};
	const readBy = (edge: Edge, path: string) => options.dirs?.find((d) => resolve(d.dir) === path && d.by === edge.site.slice(0, edge.site.lastIndexOf(':')));
	const visit = async (file: string): Promise<void> => {
		if (files.has(file)) return;
		if (!(await stat(file).then((s) => s.isFile(), () => false))) {
			unresolved.push(`${relative(ROOT, file)} is not a file`);
			return;
		}
		files.add(file);
		const found = await moduleEdges(file);
		unresolved.push(...found.unresolved);
		await follow(found.edges);
	};
	const follow = async (edges: readonly Edge[]): Promise<void> => {
		for (const edge of edges) {
			if (edge.typeOnly) continue;
			const t = edge.target;
			if (t.kind === 'file') await visit(t.path);
			else if (t.kind === 'dir' && readBy(edge, t.path)) dirs[`${relative(ROOT, t.path) || '.'} by ${readBy(edge, t.path)!.by}`] ??= await readBy(edge, t.path)!.read();
			else if (t.kind === 'dir') for (const f of await dirFiles(t.path)) await visit(f);
			else if (t.kind === 'package') packages[t.name] = t.version;
		}
	};
	for (const entry of entries) await visit(resolve(entry));
	await follow(options.edges ?? []);
	return { files: [...files].sort(), packages: Object.fromEntries(Object.entries(packages).sort(([a], [b]) => (a < b ? -1 : 1))), dirs: Object.fromEntries(Object.entries(dirs).sort(([a], [b]) => (a < b ? -1 : 1))), unresolved: [...new Set(unresolved)].sort() };
}

/** A key over the entries' closure: each file's path from ROOT and bytes, each package's version, then `extra`. Unique per call when anything is unresolved. */
export async function codeKey(entries: readonly string[], extra: Readonly<Record<string, string>> = {}, options: ClosureOptions = {}): Promise<string> {
	const closure = await closureOf(entries, options);
	return keyOf(closure, extra);
}

export async function keyOf(closure: Closure, extra: Readonly<Record<string, string>> = {}): Promise<string> {
	const hash = createHash('sha256');
	const part = (name: string, bytes: string | Uint8Array) => {
		const b = typeof bytes === 'string' ? Buffer.from(bytes) : bytes;
		hash.update(`${name}\0${b.length}\0`).update(b);
	};
	for (const file of closure.files) part(`file ${relative(ROOT, file)}`, await readFile(file));
	for (const [name, version] of Object.entries(closure.packages)) part(`package ${name}`, version);
	for (const [name, value] of Object.entries(closure.dirs)) part(`dir ${name}`, value);
	for (const [name, value] of Object.entries(extra).sort(([a], [b]) => (a < b ? -1 : 1))) part(`extra ${name}`, value);
	if (closure.unresolved.length) part('unresolved', `${closure.unresolved.join('\n')}\n${randomUUID()}`);
	return hash.digest('base64url').slice(0, 22);
}

const isReference = (node: N, parent: N | undefined): boolean => {
	if (!parent) return true;
	if ((parent.type === 'MemberExpression' || parent.type === 'TSQualifiedName') && parent.property === node && !parent.computed) return false;
	if ((parent.type === 'Property' || parent.type === 'MethodDefinition' || parent.type === 'PropertyDefinition') && parent.key === node && !parent.computed && !parent.shorthand) return false;
	return true;
};

function declaredNames(node: N, into: Set<string>): void {
	if (!node) return;
	if (node.type === 'Identifier') into.add(node.name);
	else if (node.type === 'ObjectPattern') for (const p of node.properties) declaredNames(p.type === 'RestElement' ? p.argument : p.value, into);
	else if (node.type === 'ArrayPattern') for (const e of node.elements) declaredNames(e?.type === 'RestElement' ? e.argument : e, into);
	else if (node.type === 'AssignmentPattern') declaredNames(node.left, into);
}

/**
 * What part of one module runs: `pick` names the nodes that run (one command's branch, say) in place of the declaration
 * holding them (`within`, never reached whole), and every top-level
 * declaration they reference runs too, transitively, as do top-level statements that are not declarations. Returns their
 * source text and the loads in them (the value imports they reference among them). Declarations nothing reaches are left out.
 */
export async function usedBy(file: string, pick: (program: N) => { readonly nodes: readonly N[]; readonly within?: N }): Promise<{ readonly text: string; readonly edges: readonly Edge[]; readonly unresolved: readonly string[] }> {
	const text = await readFile(file, 'utf8');
	const { program, edges, unresolved } = await moduleEdges(file, text);
	if (!program) return { text, edges, unresolved };
	const imports = new Map<string, N>();
	const declared = new Map<string, N>();
	const effects: N[] = [];
	for (const statement of program.body as N[]) {
		if (statement.type === 'ImportDeclaration') {
			if (statement.importKind !== 'type') for (const s of statement.specifiers) if (s.importKind !== 'type') imports.set(s.local.name, statement);
			continue;
		}
		const node = (statement.type === 'ExportNamedDeclaration' || statement.type === 'ExportDefaultDeclaration') && statement.declaration ? statement.declaration : statement;
		const names = new Set<string>();
		if (node.type === 'FunctionDeclaration' || node.type === 'ClassDeclaration' || node.type === 'TSEnumDeclaration') names.add(node.id?.name);
		else if (node.type === 'VariableDeclaration') for (const d of node.declarations) declaredNames(d.id, names);
		else if (!/^(TS\w+Declaration|ExportAllDeclaration|ExportNamedDeclaration)$/.test(node.type)) effects.push(statement);
		for (const name of names) declared.set(name, statement);
	}
	const used = new Set<N>();
	const reached = new Set<N>();
	const reach = (root: N) => {
		if (used.has(root)) return;
		used.add(root);
		walk(root, (n, ancestors) => {
			if (n.type !== 'Identifier' || !isReference(n, ancestors[ancestors.length - 1])) return;
			const statement = declared.get(n.name);
			if (statement) reach(statement);
			const imported = imports.get(n.name);
			if (imported) reached.add(imported);
		});
	};
	const picked = pick(program);
	if (picked.within) used.add(picked.within);
	for (const node of [...picked.nodes, ...effects]) reach(node);
	if (picked.within) used.delete(picked.within);
	const kept = [...used].sort((a, b) => a.start - b.start);
	const offset = (e: Edge) => Number(e.site.slice(e.site.lastIndexOf(':') + 1));
	const inKept = (at: number) => [...reached].some((s) => s.start === at) || kept.some((s) => at >= s.start && at < s.end);
	const site = new RegExp(`^${relative(ROOT, file).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:(\\d+) `);
	return { text: kept.map((s) => text.slice(s.start, s.end)).join('\n'), edges: edges.filter((e) => !e.typeOnly && inKept(offset(e))), unresolved: unresolved.filter((u) => !site.test(u) || inKept(Number(site.exec(u)![1]))) };
}
