import { builtinModules } from 'node:module';
import { readFile } from 'node:fs/promises';
import { join, posix } from 'node:path';
import { scanSource } from '../source/index.ts';
import { createContext } from '../source/context.ts';
import { isConfigFile, isScript, isTestFile, openProject, resolveImport, type Project } from '../source/files.ts';
import { functionOf, isFunction, keyName, localInit, memberName, parseJsonc, staticValue, known, unwrap, walk, type Module, type N } from '../source/js.ts';
import type { Component, SourceRoute } from '../source/types.ts';
import { catalogEntry, type CatalogEntry } from './catalog.ts';
import { componentRoutes, fileRoutes } from './routes.ts';
import { cssPackage, exportedNames, injectedTokens, installedPackage, packageFramework, rendersDom } from './package.ts';
import type { ExportUsage, LibrariesFile, LibraryClass, LibraryUsage, PropUsage, Site, UsageSite } from './types.ts';

const BUILTIN = new Set(builtinModules);
const SKIP_SPEC = /^(node:|virtual:|~icons\/|\/|#|bun:|data:)|\?(url|raw|inline|worker)$/;
const MAX_TEXT = 80;
const SIDE_EFFECT = '(side effects)';
const TEST_LIBS = /^(vitest|jest|@jest\/|@testing-library\/|vitest-browser-|@playwright\/test|playwright|cypress|msw)(\/|$)/;

export interface LibraryScanOptions {
	/** The source scan's routes and components, so each usage site names the routes that render it. */
	readonly routes?: readonly SourceRoute[];
	readonly components?: readonly Component[];
	/** The new Markless app, whose installed @markless/ui decides which families are available. */
	readonly newApp?: string;
	readonly framework?: string | null;
}

interface ImportLocal {
	readonly local: string;
	readonly library: string;
	/** `*` for a namespace import, `default`, or the imported name. */
	readonly imported: string;
	readonly typeOnly: boolean;
	readonly line: number;
}

interface Draft {
	readonly name: string;
	readonly exports: Map<string, ExportUsage>;
	readonly cssImports: Site[];
	/** `import 'pkg'` with nothing bound: a stylesheet or a module run for its side effects. */
	readonly bare: Site[];
}

/** The package an import specifier names, or undefined for a relative path, an alias, a builtin or a virtual module. */
export function packageName(spec: string): string | undefined {
	if (spec.startsWith('.') || SKIP_SPEC.test(spec) || BUILTIN.has(spec) || BUILTIN.has(spec.split('/')[0]!)) return undefined;
	const parts = spec.split('/');
	if (spec.startsWith('@')) return parts.length >= 2 && parts[0]!.length > 1 ? `${parts[0]}/${parts[1]}` : undefined;
	return parts[0];
}

const literal = (node: N | undefined, mod: Module): string | number | boolean | null | undefined => {
	if (!node) return undefined;
	const v = staticValue(node, mod);
	return known(v) && (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' || v === null) ? v : undefined;
};

const sourceText = (node: N, mod: Module, max = 60) => mod.text.slice(node.start, node.end).replace(/\s+/g, ' ').slice(0, max);

function addProp(record: Record<string, PropUsage>, key: string, value: string | number | boolean | null | undefined): void {
	const p = (record[key] ??= { values: [], dynamic: 0, sites: 0 });
	p.sites++;
	if (value === undefined) p.dynamic++;
	else if (!p.values.includes(value)) p.values.push(value);
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

function jsxText(node: N, mod: Module): string | undefined {
	const parts: string[] = [];
	walk(node, (n) => {
		if (n.type === 'JSXText') parts.push(n.value);
		else if (n.type === 'JSXExpressionContainer' && n.expression.type !== 'JSXEmptyExpression') {
			const v = literal(n.expression, mod);
			if (typeof v === 'string' || typeof v === 'number') parts.push(String(v));
			return false;
		} else if (n.type === 'JSXAttribute') return false;
	});
	const text = parts.join(' ').replace(/\s+/g, ' ').trim();
	return text ? text.slice(0, MAX_TEXT) : undefined;
}

/** The member chain read from a value: `getRowModel().rows` for `table.getRowModel().rows.map(...)`. */
function chainFrom(id: N, ancestors: readonly N[]): { segs: string[]; called: boolean; top: N; parent: N | undefined } {
	const segs: string[] = [];
	let node = id;
	let called = false;
	for (let i = ancestors.length - 1; i >= 0; i--) {
		const parent = ancestors[i]!;
		if (parent.type === 'MemberExpression' && parent.object === node) {
			segs.push(parent.computed ? (parent.property.type === 'Literal' ? String(parent.property.value) : '[]') : parent.property.name);
		} else if ((parent.type === 'CallExpression' || parent.type === 'NewExpression') && parent.callee === node) {
			if (segs.length) segs[segs.length - 1] += '()';
			else called = true;
		} else if (parent.type === 'ChainExpression' || parent.type === 'TSNonNullExpression' || parent.type === 'ParenthesizedExpression') {
			/* transparent */
		} else return { segs, called, top: node, parent };
		node = parent;
	}
	return { segs, called, top: node, parent: undefined };
}

const ARRAY_TAIL = /^(map|forEach|filter|find|some|every|length|reduce|slice|join|includes|flatMap|at|\[\])(\(\))?$/;

function chainLabel(segs: readonly string[], max = 3): string | undefined {
	const kept: string[] = [];
	for (const s of segs) {
		if (ARRAY_TAIL.test(s) && kept.length) break;
		kept.push(s);
		if (kept.length === max) break;
	}
	return kept.length ? kept.join('.') : undefined;
}

function typeRefsIn(node: N | undefined, locals: ReadonlySet<string>): string[] {
	if (!node) return [];
	const found: string[] = [];
	walk(node, (n) => {
		if (n.type === 'TSTypeReference') {
			const name = n.typeName.type === 'Identifier' ? n.typeName.name : n.typeName.type === 'TSQualifiedName' ? n.typeName.right.name : undefined;
			const root = n.typeName.type === 'TSQualifiedName' && n.typeName.left.type === 'Identifier' ? n.typeName.left.name : undefined;
			if (name && locals.has(name)) found.push(name);
			else if (root && locals.has(root)) found.push(root);
		}
	});
	return found;
}

function annotationOf(node: N | undefined): N | undefined {
	return node?.typeAnnotation?.typeAnnotation ?? node?.typeAnnotation;
}

/** Props a type alias or interface declares with a library type: `{ table: Table<TData> }` gives table -> Table. */
function aliasProps(mod: Module, locals: ReadonlySet<string>): Map<string, Map<string, string>> {
	const out = new Map<string, Map<string, string>>();
	for (const raw of mod.program.body as N[]) {
		const stmt = raw.type === 'ExportNamedDeclaration' && raw.declaration ? raw.declaration : raw;
		if (stmt.type !== 'TSTypeAliasDeclaration' && stmt.type !== 'TSInterfaceDeclaration') continue;
		const props = new Map<string, string>();
		walk(stmt, (n) => {
			if (n.type === 'TSPropertySignature') {
				const key = keyName(n.key);
				const ref = typeRefsIn(annotationOf(n), locals)[0];
				if (key && ref) props.set(key, ref);
				return false;
			}
		});
		if (props.size) out.set(stmt.id.name, props);
	}
	return out;
}

interface Binding {
	readonly name: string;
	readonly scope: N;
	readonly onto: (label: string) => void;
	/** Segments of a member chain kept in a label (3 unless the value is reached through a ref). */
	readonly max?: number;
}

const MEMO = /^(React\.)?(useMemo|useCallback|computed|ref|shallowRef|reactive|readonly|createMemo)$/;

/** The object, array or function a value is written as: through consts and `useMemo(() => [...])` and the like; an identifier when it is none of those. */
function dataNode(node: N | undefined, mod: Module, scope: N, depth = 0): N | undefined {
	const n = unwrap(node);
	if (!n || depth > 6) return undefined;
	if (n.type === 'ObjectExpression' || n.type === 'ArrayExpression' || isFunction(n)) return n;
	if (n.type === 'Identifier') {
		const init = localInit(scope, n.name);
		if (init) return dataNode(init, mod, scope, depth + 1);
		const bound = mod.bindings.get(n.name);
		if (bound && bound.type !== 'VariableDeclarator') return isFunction(bound) ? bound : dataNode(bound, mod, mod.program, depth + 1);
		return n;
	}
	if (n.type === 'CallExpression' && MEMO.test(memberName(n.callee) ?? '')) {
		const arg = unwrap(n.arguments[0]);
		if (/useMemo|computed|createMemo/.test(memberName(n.callee)!) && arg && isFunction(arg)) return dataNode(returned(arg), mod, arg, depth + 1);
		return dataNode(arg, mod, scope, depth + 1);
	}
	return undefined;
}

type Push = (name: string, scope: N, onto: (label: string) => void) => void;

/** What a function reads off the value a library hands it: its first parameter, whole or destructured. */
function paramReads(fn: N, push: Push, record: (label: string) => void): void {
	const raw = (fn.params as N[])[0];
	const param = raw?.type === 'AssignmentPattern' ? raw.left : raw;
	if (param?.type === 'Identifier') push(param.name, fn, (label) => !label.startsWith('->') && record(label));
	else if (param?.type === 'ObjectPattern') {
		for (const p of param.properties as N[]) {
			const key = p.type === 'Property' ? keyName(p.key) : undefined;
			if (!key) continue;
			record(key);
			const value = p.value?.type === 'AssignmentPattern' ? p.value.left : p.value;
			if (value?.type === 'Identifier') push(value.name, fn, (label) => !label.startsWith('->') && record(`${key}.${label}`));
		}
	}
}

function returned(fn: N): N | undefined {
	if (fn.body?.type !== 'BlockStatement') return fn.body;
	let out: N | undefined;
	walk(fn.body, (n) => {
		if (out || (isFunction(n) && n !== fn)) return false;
		if (n.type === 'ReturnStatement') out = n.argument ?? undefined;
	});
	return out;
}

function enclosing(ancestors: readonly N[], program: N): N {
	for (let i = ancestors.length - 1; i >= 0; i--) if (isFunction(ancestors[i])) return ancestors[i]!;
	return program;
}

interface KitExport {
	readonly file: string;
	readonly name: string;
	readonly line: number;
	readonly wraps: Set<string>;
	readonly classes: Set<string>;
	host?: string;
	variantsFn?: string;
}

interface CvaTable {
	readonly available: Record<string, string[]>;
	readonly classes: Record<string, Record<string, string>>;
	readonly base: string;
}

function cvaTables(mod: Module): Map<string, CvaTable> {
	const out = new Map<string, CvaTable>();
	for (const [name, node] of mod.bindings) {
		if (node?.type !== 'CallExpression' || node.callee.type !== 'Identifier' || node.callee.name !== mod.imports.get('cva')?.imported && node.callee.name !== 'cva') continue;
		const base = literal(node.arguments[0], mod);
		const config = staticValue(node.arguments[1], mod) as { variants?: Record<string, Record<string, unknown>> } | undefined;
		const available: Record<string, string[]> = {};
		const classes: Record<string, Record<string, string>> = {};
		for (const [variant, options] of Object.entries(config && typeof config === 'object' ? (config.variants ?? {}) : {})) {
			if (!options || typeof options !== 'object') continue;
			available[variant] = Object.keys(options);
			classes[variant] = Object.fromEntries(Object.entries(options).map(([k, v]) => [k, typeof v === 'string' ? v : '']));
		}
		out.set(name, { available, classes, base: typeof base === 'string' ? base : '' });
	}
	return out;
}

/** The app's UI kit folder (shadcn/ui's `components/ui`), from components.json or by convention. */
async function kitDir(project: Project): Promise<{ dir: string; name: string } | undefined> {
	const config = (await project.read('components.json')) ? (parseJsonc(await project.read('components.json')) as { $schema?: string; aliases?: { ui?: string; components?: string } } | undefined) : undefined;
	const has = (dir: string) => project.files.some((f) => f.startsWith(`${dir}/`));
	const aliasDir = (spec: string | undefined): string | undefined => {
		if (!spec) return undefined;
		for (const alias of project.aliases) {
			if (!spec.startsWith(alias.prefix)) continue;
			for (const target of alias.targets) {
				const dir = posix.normalize(target + spec.slice(alias.prefix.length)).replace(/^\.\//, '').replace(/\/$/, '');
				if (has(dir)) return dir;
			}
		}
		return has(spec) ? spec : undefined;
	};
	const name = config && /shadcn/.test(config.$schema ?? '') ? 'shadcn/ui' : 'ui kit';
	const fromConfig = aliasDir(config?.aliases?.ui) ?? aliasDir(config?.aliases?.components ? `${config.aliases.components}/ui` : undefined);
	if (fromConfig) return { dir: fromConfig, name };
	const conventional = [...new Set(project.files.map((f) => /^(.*(?:^|\/)components\/ui)\//.exec(f)?.[1]).filter((d): d is string => !!d))][0];
	if (!conventional) return undefined;
	for (const file of project.files.filter((f) => f.startsWith(`${conventional}/`))) if (/@radix-ui\/|class-variance-authority|bits-ui|@headlessui\//.test(await project.read(file))) return { dir: conventional, name };
	return undefined;
}

function blankExport(name: string): ExportUsage {
	return { name, kind: 'value', imports: [], sites: [], props: {}, options: {}, reads: [], members: {} };
}

function frameworkFor(name: string, entry: CatalogEntry): LibraryUsage['framework'] {
	if (entry.framework === 'none') return 'none';
	if (/vue/.test(name)) return 'vue';
	if (/svelte|bits-ui/.test(name)) return 'svelte';
	if (/solid/.test(name)) return 'solid';
	return entry.framework;
}

async function installedUi(newApp: string | undefined): Promise<{ version: string; parts: Set<string> } | undefined> {
	if (!newApp) return undefined;
	const pkg = await installedPackage(newApp, '@markless/ui');
	if (!pkg) return undefined;
	const manifest = JSON.parse(await readFile(join(pkg.dir, 'api/manifest.json'), 'utf8').catch(() => '{}')) as Record<string, { parts?: { part: string }[] }>;
	const parts = new Set<string>();
	for (const [family, def] of Object.entries(manifest)) {
		parts.add(family);
		for (const p of def.parts ?? []) parts.add(`${family}.${p.part}`);
	}
	return { version: pkg.json.version ?? '', parts };
}

/**
 * Takes stock of every library the app imports and exactly what it uses of each: imports, components
 * with the props and variants passed, hooks with the options passed and the fields read back, members
 * read on values typed by the library, the CSS it puts on the page, and every usage site.
 */
export async function scanLibraries(dir: string, options: LibraryScanOptions = {}): Promise<LibrariesFile> {
	if (!options.components || !options.routes) {
		const facts = await scanSource(dir);
		options = { ...options, components: facts.components, routes: facts.routes, framework: facts.framework };
	}
	const project = await openProject(dir);
	const ctx = createContext(project);
	const kit = await kitDir(project);
	const inKit = (file: string) => !!kit && file.startsWith(`${kit.dir}/`);
	const drafts = new Map<string, Draft>();
	const draft = (name: string) => {
		let d = drafts.get(name);
		if (!d) drafts.set(name, (d = { name, exports: new Map(), cssImports: [], bare: [] }));
		return d;
	};
	const usage = (library: string, name: string) => {
		const d = draft(library);
		let e = d.exports.get(name);
		if (!e) d.exports.set(name, (e = blankExport(name)));
		return e;
	};
	const comps = new Map<string, Component[]>();
	for (const c of options.components ?? []) comps.set(c.file, [...(comps.get(c.file) ?? []), c]);
	for (const list of comps.values()) list.sort((a, b) => a.line - b.line);
	const enclosingComponent = (file: string, line: number) => (comps.get(file) ?? []).filter((c) => c.line <= line).at(-1);
	const kitExports = new Map<string, KitExport>();
	const files = project.files.filter((f) => isScript(f) && !isTestFile(f) && !isConfigFile(f) && !/\.gen\.[cm]?[jt]sx?$/.test(f));
	const bindingsToTrack: { mod: Module; binding: Binding }[] = [];
	const importedFns: { exp: ExportUsage; path: string; file: string; spec: string; imported: string }[] = [];
	const importers = new Map<string, string[]>();

	for (const file of files) {
		const mod = await ctx.module(file);
		if (!mod) continue;
		// Test helpers outside a test folder (test-utils/) still only serve tests.
		if ((mod.program.body as N[]).some((s) => s.type === 'ImportDeclaration' && TEST_LIBS.test(String(s.source.value)))) continue;
		const locals = new Map<string, ImportLocal>();
		for (const stmt of mod.program.body as N[]) {
			if ((stmt.type === 'ExportNamedDeclaration' || stmt.type === 'ExportAllDeclaration') && stmt.source) {
				const target = resolveImport(project, file, String(stmt.source.value));
				if (target) importers.set(target, [...(importers.get(target) ?? []), file]);
			}
			if (stmt.type !== 'ImportDeclaration') continue;
			const spec = String(stmt.source.value);
			const line = mod.line(stmt.start);
			let library: string | undefined;
			const target = spec.startsWith('.') || !packageName(spec) || project.aliases.some((a) => spec.startsWith(a.prefix)) ? resolveImport(project, file, spec) : undefined;
			if (target) importers.set(target, [...(importers.get(target) ?? []), file]);
			if (target) {
				if (kit && inKit(target) && !inKit(file)) library = kit.name;
				else if (kit && inKit(target) && inKit(file)) library = kit.name;
				else continue;
			} else library = packageName(spec);
			if (!library) continue;
			if (/\.(css|scss|sass|less)$/.test(spec)) {
				draft(library).cssImports.push({ file, line });
				continue;
			}
			const typeOnly = stmt.importKind === 'type';
			for (const s of stmt.specifiers as N[]) {
				const imported = s.type === 'ImportDefaultSpecifier' ? 'default' : s.type === 'ImportNamespaceSpecifier' ? '*' : (keyName(s.imported) ?? '');
				const exportName = library === kit?.name && imported !== '*' ? imported : imported;
				locals.set(s.local.name, { local: s.local.name, library, imported: exportName, typeOnly: typeOnly || s.importKind === 'type', line });
				if (imported !== '*') usage(library, exportName).imports.push({ file, line });
			}
			if (!stmt.specifiers.length) draft(library).bare.push({ file, line });
		}
		if (inKit(file)) {
			const tables = cvaTables(mod);
			for (const [name, node] of mod.exports) {
				const fn = isFunction(node) ? node : node?.type === 'VariableDeclarator' ? node.init : undefined;
				if (!fn || !isFunction(fn) || !/^[A-Z]/.test(name)) continue;
				const ke: KitExport = { file, name, line: mod.line(fn.start), wraps: new Set(), classes: new Set() };
				walk(fn, (n) => {
					if (n.type === 'JSXOpeningElement') {
						const tag = jsxName(n.name);
						if (!tag) return;
						const imp = locals.get(tag.root);
						if (imp && imp.library !== kit!.name) ke.wraps.add(`${imp.library} ${imp.imported === '*' ? (tag.member ?? '') : tag.member ? `${imp.imported}.${tag.member}` : imp.imported}`);
						const provider = tag.member === 'Provider' || tag.member === 'Consumer' || /Provider$/.test(tag.member ?? tag.root);
						if (!ke.host && !provider) {
							if (!imp && /^[a-z]/.test(tag.root)) ke.host = tag.root;
							else if (!imp) {
								const init = localInit(fn, tag.root);
								const pick = init?.type === 'ConditionalExpression' ? [init.consequent, init.alternate].find((b: N) => b.type === 'Literal') : init?.type === 'Literal' ? init : undefined;
								ke.host = typeof pick?.value === 'string' ? pick.value : tag.root;
							} else if (imp.library === kit!.name) ke.host = imp.imported;
						}
						for (const attr of n.attributes as N[]) {
							if (attr.type !== 'JSXAttribute' || attr.name.name !== 'className' || !attr.value) continue;
							const v = attr.value.type === 'Literal' ? attr.value.value : undefined;
							if (typeof v === 'string') for (const c of v.split(/\s+/)) if (c) ke.classes.add(c);
						}
					}
					if (n.type === 'CallExpression' && n.callee.type === 'Identifier') {
						if (tables.has(n.callee.name)) ke.variantsFn = n.callee.name;
						if (n.callee.name === 'cn' || n.callee.name === 'clsx' || n.callee.name === 'cx' || tables.has(n.callee.name)) {
							for (const arg of n.arguments as N[]) {
								const v = literal(arg, mod);
								if (typeof v === 'string') for (const c of v.split(/\s+/)) if (c) ke.classes.add(c);
							}
						}
					}
				});
				if (ke.variantsFn) for (const c of tables.get(ke.variantsFn)!.base.split(/\s+/)) if (c) ke.classes.add(c);
				kitExports.set(`${file}#${name}`, ke);
				const exp = usage(kit!.name, name);
				exp.kind = 'component';
				if (ke.variantsFn) {
					const t = tables.get(ke.variantsFn)!;
					exp.variants = Object.fromEntries(Object.entries(t.available).map(([v, opts]) => [v, { used: [], available: opts, classes: t.classes[v] ?? {} }]));
				}
			}
		}
		const libTypes = new Set([...locals.values()].filter((l) => l.imported !== '*').map((l) => l.local));
		const aliases = aliasProps(mod, libTypes);
		const siteBase = (line: number): Pick<UsageSite, 'file' | 'line'> & { in?: string; routes?: string[] } => {
			const c = enclosingComponent(file, line);
			return { file, line, ...(c ? { in: c.id } : {}) };
		};
		if (mod.template.trim()) {
			const globals = GLOBAL_TAGS.filter((g) => g.library in project.deps);
			for (const tag of markupTags(mod.template)) {
				const [root, ...rest] = tag.name.split('.');
				const imp = locals.get(root!) ?? locals.get(pascalTag(root!));
				const global = !imp ? globals.find((g) => g.prefix.test(tag.name)) : undefined;
				if (!imp && !global) continue;
				const library = imp?.library ?? global!.library;
				const exportName = imp ? (imp.imported === '*' ? rest.join('.') || '*' : rest.length ? `${imp.imported}.${rest.join('.')}` : imp.imported) : pascalTag(tag.name);
				const exp = usage(library, exportName);
				exp.kind = 'component';
				const props: Record<string, string> = {};
				for (const [rawKey, raw] of tag.attrs) {
					const bound = /^(:|v-bind:)/.test(rawKey) || (raw.startsWith('{') && raw.endsWith('}'));
					const key = rawKey.replace(/^(:|v-bind:)/, '').replace(/^@/, 'on:');
					const value = raw === '' ? true : bound ? templateLiteral(raw.replace(/^\{|\}$/g, '')) : raw;
					addProp(exp.props, key, value);
					props[key] = value === undefined ? `{${raw.replace(/^\{|\}$/g, '').slice(0, 60)}}` : JSON.stringify(value);
				}
				exp.sites.push({ ...siteBase(mod.line(tag.offset)), kind: 'element', props, ...(tag.text ? { text: tag.text } : {}) });
			}
		}
		const handled = new Set<N>();
		const bind = (name: string, scope: N, onto: (label: string) => void) => bindingsToTrack.push({ mod, binding: { name, scope, onto } });
		const passData = (exp: ExportUsage, path: string, value: N, scope: N, depth = 0): void => {
			const either = unwrap(value);
			if (either?.type === 'ConditionalExpression' || (either?.type === 'LogicalExpression' && depth)) {
				for (const branch of either.type === 'ConditionalExpression' ? [either.consequent, either.alternate] : [either.left, either.right]) passData(exp, path, branch, scope, depth);
				return;
			}
			const n = dataNode(value, mod, scope);
			const leaf = (v: string | number | boolean | null | undefined) => {
				if (!depth) return;
				addProp((exp.data ??= {}), path, v);
				seenIn(exp, `data:${path}`, file);
			};
			if (!n || depth > 8) return leaf(literal(value, mod));
			if (isFunction(n)) {
				leaf(undefined);
				return paramReads(n, bind, (label) => addMember(exp, path, label, file));
			}
			if (n.type === 'Identifier') {
				const imp = mod.imports.get(n.name);
				if (imp && (imp.source.startsWith('.') || !packageName(imp.source) || project.aliases.some((a) => imp.source.startsWith(a.prefix)))) importedFns.push({ exp, path, file, spec: imp.source, imported: imp.imported });
				return leaf(literal(n, mod));
			}
			if (n.type === 'ArrayExpression') {
				for (const el of n.elements as N[]) if (el) passData(exp, el.type === 'SpreadElement' ? path : `${path}[]`, el.type === 'SpreadElement' ? el.argument : el, scope, depth + 1);
				return;
			}
			for (const p of n.properties as N[]) {
				if (p.type === 'SpreadElement') passData(exp, path, p.argument, scope, depth + 1);
				else if (p.type === 'Property') {
					const key = p.computed ? literal(p.key, mod) : keyName(p.key);
					if (typeof key === 'string' || typeof key === 'number') passData(exp, path ? `${path}.${key}` : String(key), p.value, scope, depth + 1);
				}
			}
		};
		walk(mod.program, (n, ancestors) => {
			if (n.type === 'ImportDeclaration') return false;
			if (n.type === 'JSXOpeningElement') {
				const tag = jsxName(n.name);
				const imp = tag && locals.get(tag.root);
				if (!tag || !imp) return;
				handled.add(n.name.type === 'JSXIdentifier' ? n.name : n.name.object);
				const exportName = imp.imported === '*' ? (tag.member ?? '*') : tag.member ? `${imp.imported}.${tag.member}` : imp.imported;
				const exp = usage(imp.library, exportName);
				exp.kind = 'component';
				const props: Record<string, string> = {};
				for (const attr of n.attributes as N[]) {
					if (attr.type === 'JSXSpreadAttribute') {
						addProp(exp.props, '...', undefined);
						props['...'] = `{...${sourceText(attr.argument, mod)}}`;
						continue;
					}
					const key = attr.name.type === 'JSXNamespacedName' ? `${attr.name.namespace.name}:${attr.name.name.name}` : attr.name.name;
					const value = attr.value === null ? true : attr.value.type === 'Literal' ? attr.value.value : attr.value.type === 'JSXExpressionContainer' ? literal(attr.value.expression, mod) : undefined;
					addProp(exp.props, key, value as string | number | boolean | null | undefined);
					props[key] = value === undefined ? `{${attr.value?.type === 'JSXExpressionContainer' ? sourceText(attr.value.expression, mod, 200) : '...'}}` : JSON.stringify(value);
					const expression = attr.value?.type === 'JSXExpressionContainer' && attr.value.expression.type !== 'JSXEmptyExpression' ? (attr.value.expression as N) : undefined;
					if (!expression) continue;
					const scope = enclosing(ancestors, mod.program);
					if (key === 'ref' && expression.type === 'Identifier') bindingsToTrack.push({ mod, binding: { name: expression.name, scope, max: 6, onto: (label) => label.startsWith('current.') && addMember(exp, 'ref', label.slice(8), file) } });
					else passData(exp, key, expression, scope);
				}
				const element = ancestors[ancestors.length - 1];
				const text = element?.type === 'JSXElement' ? jsxText(element, mod) : undefined;
				if (element?.type === 'JSXElement' && (element.children as N[]).some((c) => c.type !== 'JSXText' || c.value.trim())) {
					addProp(exp.props, 'children', undefined);
					props.children = '{children}';
				}
				exp.sites.push({ ...siteBase(mod.line(n.start)), kind: 'element', props, ...(text ? { text } : {}) });
				if (exp.variants) for (const [variant, v] of Object.entries(exp.variants)) {
					const prop = exp.props[variant];
					for (const value of prop?.values ?? []) if (typeof value === 'string' && !v.used.includes(value)) v.used.push(value);
				}
				return;
			}
			if (n.type === 'TSTypeReference') {
				const name = n.typeName.type === 'Identifier' ? n.typeName.name : n.typeName.type === 'TSQualifiedName' && n.typeName.left.type === 'Identifier' ? n.typeName.left.name : undefined;
				const imp = name && locals.get(name);
				if (imp) {
					const exportName = imp.imported === '*' ? (n.typeName.right?.name ?? '*') : n.typeName.type === 'TSQualifiedName' ? `${imp.imported}.${n.typeName.right.name}` : imp.imported;
					const exp = usage(imp.library, exportName);
					if (!exp.sites.some((s) => s.kind !== 'type')) exp.kind = 'type';
					exp.sites.push({ ...siteBase(mod.line(n.start)), kind: 'type' });
					handled.add(n.typeName.type === 'Identifier' ? n.typeName : n.typeName.left);
				}
				return;
			}
			if (n.type === 'Identifier' && !handled.has(n)) {
				const imp = locals.get(n.name);
				const parent = ancestors[ancestors.length - 1];
				if (!imp || !parent) return;
				if ((parent.type === 'MemberExpression' && parent.property === n && !parent.computed) || (parent.type === 'Property' && parent.key === n && !parent.shorthand) || parent.type === 'ImportSpecifier' || parent.type === 'TSQualifiedName') return;
				const { segs, called, top, parent: above } = chainFrom(n, ancestors);
				let exportName = imp.imported;
				let rest = segs;
				if (imp.imported === '*') {
					if (!segs.length) return;
					exportName = segs[0]!.replace(/\(\)$/, '');
					rest = segs.slice(1);
				}
				const exp = usage(imp.library, exportName);
				const isCall = called || (imp.imported === '*' && segs[0]?.endsWith('()') === true);
				const callNode = isCall ? top : undefined;
				if (callNode?.type === 'CallExpression' || callNode?.type === 'NewExpression' || (isCall && rest.length === 0)) {
					const call = callNode?.type === 'CallExpression' || callNode?.type === 'NewExpression' ? callNode : undefined;
					if (exp.kind !== 'component') exp.kind = /^use[A-Z]/.test(exportName) ? 'hook' : 'function';
					exp.sites.push({ ...siteBase(mod.line(n.start)), kind: 'call' });
					const callScope = enclosing(ancestors, mod.program);
					const args = (call?.arguments ?? []) as N[];
					const at = args.findIndex((a) => dataNode(a, mod, callScope)?.type === 'ObjectExpression');
					const arg = at >= 0 ? dataNode(args[at], mod, callScope) : undefined;
					args.forEach((a, i) => i !== at && a.type !== 'SpreadElement' && passData(exp, `args[${i}]`, a, callScope, 0));
					for (const p of at >= 0 ? (arg!.properties as N[]) : []) if (p.type === 'Property' && (p.value.type === 'ArrayExpression' || p.value.type === 'ObjectExpression' || isFunction(p.value))) passData(exp, keyName(p.key) ?? '[]', p.value, callScope);
					if (arg?.type === 'ObjectExpression') {
						for (const p of arg.properties as N[]) {
							if (p.type !== 'Property') continue;
							const key = keyName(p.key);
							if (!key) continue;
							addProp(exp.options, key, literal(p.value, mod));
							seenIn(exp, `option:${key}`, file);
							if (p.value.type === 'ObjectExpression') {
								for (const q of p.value.properties as N[]) {
									if (q.type !== 'Property' || !keyName(q.key)) continue;
									addProp(exp.options, `${key}.${keyName(q.key)}`, literal(q.value, mod));
									seenIn(exp, `option:${key}.${keyName(q.key)}`, file);
								}
							}
						}
					}
					const scope = enclosing(ancestors, mod.program);
					const onto = (label: string) => {
						seenIn(exp, `read:${label}`, file);
						if (!exp.reads.includes(label)) exp.reads.push(label);
					};
					if (above?.type === 'VariableDeclarator' && above.init === top) {
						if (above.id.type === 'Identifier') bind(above.id.name, scope, onto);
						else if (above.id.type === 'ObjectPattern') {
							for (const p of above.id.properties as N[]) {
								if (p.type === 'RestElement') onto('...');
								else if (keyName(p.key)) {
									onto(keyName(p.key)!);
									const value = p.value?.type === 'AssignmentPattern' ? p.value.left : p.value;
									if (value?.type === 'Identifier') bind(value.name, scope, (label) => onto(`${keyName(p.key)}.${label}`));
								}
							}
						}
					}
				} else if (rest.length) {
					const label = chainLabel(rest);
					if (label) seenIn(exp, `read:${label}`, file);
					if (label && !exp.reads.includes(label)) exp.reads.push(label);
					if (exp.kind === 'value' && !exp.sites.length) exp.kind = 'value';
					exp.sites.push({ ...siteBase(mod.line(n.start)), kind: 'reference' });
					const scope = enclosing(ancestors, mod.program);
					let path = '';
					let skip = imp.imported === '*';
					let node: N = n;
					for (let i = ancestors.length - 1; i >= 0 && path.length < 120; i--) {
						const parent = ancestors[i]!;
						if (parent.type === 'MemberExpression' && parent.object === node) {
							const seg = parent.computed ? '[]' : parent.property.name;
							if (skip) skip = false;
							else path = path ? `${path}.${seg}` : seg;
						} else if ((parent.type === 'CallExpression' || parent.type === 'NewExpression') && parent.callee === node) {
							path += '()';
							(parent.arguments as N[]).forEach((arg, j) => arg.type !== 'SpreadElement' && passData(exp, `${path}.args[${j}]`, arg, scope, 1));
						} else if (parent.type !== 'ChainExpression' && parent.type !== 'TSNonNullExpression') break;
						node = parent;
					}
				} else {
					exp.sites.push({ ...siteBase(mod.line(n.start)), kind: 'reference' });
				}
				return;
			}
			if (isFunction(n)) {
				for (const param of n.params as N[]) {
					const annotation = annotationOf(param);
					if (!annotation) continue;
					if (param.type === 'Identifier') {
						const ref = typeRefsIn(annotation, libTypes)[0];
						if (ref) {
							const imp = locals.get(ref)!;
							const exp = usage(imp.library, imp.imported);
							bind(param.name, n, (label) => addMember(exp, '', label, file));
						}
					} else if (param.type === 'ObjectPattern') {
						const direct = annotation.type === 'TSTypeReference' ? typeRefsIn(annotation, libTypes)[0] : undefined;
						if (direct && !(annotation.typeName.type === 'Identifier' && aliases.has(annotation.typeName.name))) {
							const imp = locals.get(direct)!;
							const exp = usage(imp.library, imp.imported);
							paramReads({ ...n, params: [param] } as N, bind, (label) => addMember(exp, '', label, file));
							continue;
						}
						const props = annotation.type === 'TSTypeReference' && annotation.typeName.type === 'Identifier' ? aliases.get(annotation.typeName.name) : undefined;
						for (const p of param.properties as N[]) {
							if (p.type !== 'Property') continue;
							const key = keyName(p.key);
							const ref = key && props?.get(key);
							const value = p.value?.type === 'AssignmentPattern' ? p.value.left : p.value;
							if (!ref || value?.type !== 'Identifier') continue;
							const imp = locals.get(ref)!;
							const exp = usage(imp.library, imp.imported);
							bind(value.name, n, (label) => addMember(exp, '', label, file));
						}
					}
				}
			}
			if (n.type === 'VariableDeclarator' && n.init) {
				const ref = typeRefsIn(annotationOf(n.id), libTypes)[0];
				if (!ref) return;
				const imp = locals.get(ref)!;
				const exp = usage(imp.library, imp.imported);
				walk(n.init, (m, inner) => {
					if (m.type !== 'Property' || !isFunction(m.value)) return;
					const key = keyName(m.key);
					const param = (m.value.params as N[])[0];
					if (!key || !param) return;
					const path = [...inner.filter((a) => a.type === 'Property').map((a) => keyName(a.key)).filter(Boolean), key].join('.');
					if (param.type === 'Identifier') bind(param.name, m.value, (label) => addMember(exp, path, label, file));
					else if (param.type === 'ObjectPattern') {
						for (const p of param.properties as N[]) {
							const pk = p.type === 'Property' ? keyName(p.key) : undefined;
							const value = p.value?.type === 'AssignmentPattern' ? p.value.left : p.value;
							if (pk && value?.type === 'Identifier') bind(value.name, m.value, (label) => addMember(exp, `${path}.${pk}`, label, file));
						}
					}
				});
			}
		});
	}

	for (const f of importedFns) {
		const target = resolveImport(project, f.file, f.spec);
		const other = target ? await ctx.module(target) : undefined;
		const fn = other && functionOf(other.exports.get(f.imported), other);
		if (fn) paramReads(fn, (name, scope, onto) => bindingsToTrack.push({ mod: other, binding: { name, scope, onto } }), (label) => addMember(f.exp, f.path, label, target!));
	}

	for (let i = 0; i < bindingsToTrack.length && i < 20_000; i++) {
		const { mod, binding } = bindingsToTrack[i]!;
		walk(binding.scope, (n, ancestors) => {
			if (n.type === 'Identifier' && n.name === binding.name) {
				const parent = ancestors[ancestors.length - 1];
				if (!parent) return;
				if (parent.type === 'JSXSpreadAttribute') return binding.onto('...');
				if (parent.type === 'VariableDeclarator' && parent.init === n && parent.id.type === 'ObjectPattern') {
					for (const p of parent.id.properties as N[]) binding.onto(p.type === 'RestElement' ? '...' : (keyName(p.key) ?? '[]'));
					return;
				}
				if (parent.type === 'MemberExpression' && parent.property === n && !parent.computed) return;
				if (parent.type === 'JSXExpressionContainer') {
					const attr = ancestors[ancestors.length - 2];
					const el = ancestors[ancestors.length - 3];
					if (attr?.type === 'JSXAttribute' && el?.type === 'JSXOpeningElement') {
						const tag = jsxName(el.name);
						if (tag) binding.onto(`-> <${tag.member ? `${tag.root}.${tag.member}` : tag.root} ${attr.name.name ?? ''}>`);
					}
					return;
				}
				const { segs, top, parent: above } = chainFrom(n, ancestors);
				const label = chainLabel(segs, binding.max);
				if (label) binding.onto(label);
				// `const node = api.getRowNode(id); node.setSelected(true)` reads on through the new name.
				if (label && segs.length && above?.type === 'VariableDeclarator' && above.init === top && above.id.type === 'Identifier' && label.split('.').length < 6) bindingsToTrack.push({ mod, binding: { name: above.id.name, scope: binding.scope, max: binding.max, onto: (more) => !more.startsWith('->') && binding.onto(`${label}.${more}`) } });
			}
		});
	}

	const { byComponent, byRouteFile } = await componentRoutes(ctx, options.routes ?? [], options.components ?? []);
	const routesOfFile = new Map<string, string[]>();
	// A component nothing renders by JSX (one named in a column table) is reached through the files that import it.
	const siteRoutes = (id: string | undefined, file: string): string[] => {
		const own = id ? byComponent.get(id) : byRouteFile.get(file);
		if (own?.length) return own;
		let hit = routesOfFile.get(file);
		if (!hit) routesOfFile.set(file, (hit = byRouteFile.get(file) ?? fileRoutes(file, byComponent, importers, byRouteFile)));
		return hit;
	};

	const kitExternalSites = new Map<string, number>();
	if (kit) {
		const d = drafts.get(kit.name);
		for (const [key, ke] of kitExports) {
			const exp = d?.exports.get(ke.name);
			kitExternalSites.set(key, exp ? exp.sites.filter((s) => s.file !== ke.file && s.kind !== 'type').length : 0);
		}
	}
	const ui = await installedUi(options.newApp);
	const kitMaps = (name: string): ExportUsage['maps'] => {
		const ke = [...kitExports.values()].find((k) => k.name === name);
		if (!ke) return undefined;
		const wraps = [...ke.wraps];
		const mapped = wraps.map((w) => {
			const [lib, member] = w.split(' ');
			const p = catalogEntry(lib!)?.parts;
			return p ? partFor(p, member!) : undefined;
		}).find((p) => p !== undefined && p !== '');
		if (mapped) return { target: mapped, available: ui ? ui.parts.has(mapped) : null };
		if (wraps.length && wraps.every((w) => {
			const [lib, member] = w.split(' ');
			const p = catalogEntry(lib!)?.parts;
			const c = catalogEntry(lib!);
			return c?.class !== 'parity' && c?.class !== 'dom' && ((p && partFor(p, member!) === '') || c?.class === 'drop');
		}) && !ke.host) return { target: '', available: true, note: 'nothing to port: what it wraps needs no Markless counterpart' };
		const ported = wraps.map((w) => w.split(' ')[0]!).find((lib) => catalogEntry(lib)?.class === 'parity' || catalogEntry(lib)?.class === 'dom');
		if (ported) return { target: '', available: false, note: `wraps ${ported}, which needs a port: markless-migrate parity ${ported}` };
		if (!wraps.length && ke.host) return { target: `<${ke.host}>`, available: true, note: 'a styled element with no behaviour: write the element with the same classes' };
		if (wraps.length) return { target: '', available: false, note: `wraps ${wraps.join(', ')}, which has no @markless/ui counterpart in the catalog` };
		return undefined;
	};
	const limits: string[] = [...new Set(ctx.limits)];
	const libraries: LibraryUsage[] = [];
	for (const d of drafts.values()) {
		const entry = d.name === kit?.name ? undefined : catalogEntry(d.name);
		const pkg = d.name === kit?.name ? undefined : await installedPackage(dir, d.name);
		if (d.bare.length) {
			if ((pkg && cssPackage(pkg)) || entry?.css) d.cssImports.push(...d.bare);
			else usage(d.name, SIDE_EFFECT).sites.push(...d.bare.map((s) => ({ ...s, kind: 'reference' as const })));
		}
		const exports: ExportUsage[] = [];
		for (const exp of d.exports.values()) {
			// A kit export nothing in the app renders keeps the primitives it wraps out of the used surface.
			const sites = exp.sites.filter((s) => !kit || !inKit(s.file) || !s.in || !kitExports.has(s.in) || (kitExternalSites.get(s.in) ?? 0) > 0);
			if (!sites.length) continue;
			for (const s of sites) {
				const routes = siteRoutes(s.in, s.file);
				if (routes.length) (s as { routes?: string[] }).routes = routes;
			}
			const out: ExportUsage = { ...exp, sites, members: Object.fromEntries(Object.entries(exp.members).map(([k, v]) => [k, [...v].sort()])), reads: [...exp.reads].sort() };
			if (exp.variants) out.variants = Object.fromEntries(Object.entries(exp.variants).map(([k, v]) => [k, { ...v, classes: Object.fromEntries(v.used.map((u) => [u, v.classes[u] ?? ''])) }]));
			const part = entry?.parts && partFor(entry.parts, exp.name);
			if (part !== undefined) out.maps = part ? { target: part, available: ui ? ui.parts.has(part) : null } : { target: '', available: true, note: 'nothing to port: the Markless family needs no counterpart' };
			if (d.name === kit?.name) {
				const ke = [...kitExports.values()].find((k) => k.name === exp.name);
				if (ke) {
					out.wraps = [...ke.wraps].sort();
					const maps = kitMaps(exp.name);
					if (maps) out.maps = maps;
				}
			}
			exports.push(out);
		}
		if (d.name === kit?.name) {
			const byName = new Map(exports.map((e) => [e.name, e]));
			for (const e of exports) {
				for (let hop = 0; hop < 4; hop++) {
					const inner = /^<([A-Z]\w*)>$/.exec(e.maps?.target ?? '')?.[1];
					const next = inner ? (byName.get(inner)?.maps ?? kitMaps(inner)) : undefined;
					if (!next || next === e.maps) break;
					e.maps = { ...next, note: `${next.note ? `${next.note}; ` : ''}through ${inner}` };
				}
			}
		}
		if (!exports.length && !d.cssImports.length) continue;
		exports.sort((a, b) => b.sites.length - a.sites.length || a.name.localeCompare(b.name));
		const framework: LibraryUsage['framework'] = d.name === kit?.name ? 'react' : entry ? frameworkFor(d.name, entry) : pkg ? packageFramework(pkg) : 'unknown';
		const widget = !entry && framework === 'none' && !!pkg && !cssPackage(pkg) && (await rendersDom(pkg));
		const cls: LibraryClass = d.name === kit?.name ? 'markless-ui' : entry?.class ?? (framework === 'unknown' ? 'unknown' : widget ? 'dom' : framework === 'none' ? 'as-is' : 'parity');
		const reason = d.name === kit?.name ? `the app's own copy of ${kit.name}: each used component maps to the @markless/ui family its primitive maps to, or to the styled element it renders` : entry?.reason ?? (framework === 'unknown' ? 'not in the catalog and not installed, so what it binds to could not be read' : widget ? 'no UI framework among its dependencies, but its code builds DOM (or its keywords name a widget): it renders its own UI into the page, so port the used surface (markless-migrate parity) or a person decides to keep it as a DOM island mounted from attach; never import it unchanged' : framework === 'none' ? 'framework-agnostic (no UI framework among its dependencies, and its code builds no DOM): import it unchanged' : `depends on ${framework}: port the used surface`);
		const prefixes = [...new Set([...(entry?.tokens ?? []), ...(d.name.startsWith('@') ? [] : [`${d.name.replace(/^react-/, '')}-`])])];
		const paints = cls === 'markless-ui' || cls === 'parity' || cls === 'dom' || cls === 'unknown';
		const injected = pkg && paints ? await injectedTokens(pkg, prefixes) : [];
		// Shared tokens (data-state) belong to a library only where it renders: its own sites and the sites of kit components wrapping it.
		const libFiles = new Set(exports.flatMap((e) => e.sites.map((s) => s.file)));
		if (kit && d.name !== kit.name) for (const k of drafts.get(kit.name)?.exports.values() ?? []) if ([...kitExports.values()].some((ke) => ke.name === k.name && [...ke.wraps].some((w) => w.startsWith(`${d.name} `)))) for (const s of k.sites) libFiles.add(s.file);
		const styled = paints ? await styledBy(project, files.filter((f) => libFiles.has(f)), prefixes.filter((p) => p.startsWith('data-') || p.startsWith('--') || injected.some((t) => t.startsWith(p))), libFiles) : [];
		const names = pkg ? await exportedNames(pkg, dir) : undefined;
		const kitTotal = d.name === kit?.name ? [...kitExports.keys()].length : undefined;
		const members = new Set(exports.flatMap((e) => [...e.reads, ...Object.values(e.members).flat()].map((r) => `${e.name}.${r}`)));
		const allSites = exports.flatMap((e) => e.sites);
		const via = kit && d.name !== kit.name && allSites.length && allSites.every((s) => inKit(s.file)) ? kit.name : undefined;
		const classes = d.name === kit?.name ? Object.fromEntries(exports.flatMap((e) => {
			const ke = [...kitExports.values()].find((k) => k.name === e.name);
			return ke?.classes.size ? [[e.name, [...ke.classes].join(' ')]] : [];
		})) : undefined;
		libraries.push({
			name: d.name,
			...(project.deps[d.name] ? { version: project.deps[d.name] } : pkg?.json.version ? { version: pkg.json.version } : {}),
			...(d.name === kit?.name ? { local: { dir: kit.dir, files: project.files.filter(inKit) } } : {}),
			framework,
			class: cls,
			reason,
			...(entry?.core ? { core: entry.core } : {}),
			...(entry?.replacement ? { replacement: entry.replacement } : {}),
			exports,
			css: { imports: d.cssImports, injected, styled, ...(classes ? { classes } : {}) },
			surface: { used: exports.filter((e) => e.sites.length).length, total: names?.size ?? kitTotal ?? null, members: members.size },
			sites: allSites.length,
			...(via ? { via } : {}),
		});
	}
	const order: Record<LibraryClass, number> = { dom: 0, parity: 1, 'markless-ui': 2, unknown: 3, 'as-is': 4, framework: 5, drop: 6 };
	libraries.sort((a, b) => order[a.class] - order[b.class] || b.sites - a.sites || a.name.localeCompare(b.name));
	if (!options.newApp || !ui) limits.push('@markless/ui is not installed in the new app, so `available` on each mapping is null (install it and run plan again)');
	return { version: 1, generatedAt: new Date().toISOString(), source: dir, framework: options.framework ?? null, ...(ui ? { markless_ui: ui.version } : {}), libraries, limits: limits.sort() };
}

function seenIn(exp: ExportUsage, key: string, file: string): void {
	const list = ((exp.at ??= {})[key] ??= []);
	if (!list.includes(file)) list.push(file);
}

/** Components a framework registers globally, used in templates without an import. */
const GLOBAL_TAGS: { library: string; prefix: RegExp }[] = [{ library: 'vuetify', prefix: /^v-[a-z]/ }];

const pascalTag = (tag: string) => tag.replace(/(^|-)([a-z])/g, (_, __, c: string) => c.toUpperCase());

function templateLiteral(expr: string): string | number | boolean | null | undefined {
	const t = expr.trim();
	if (/^(['"`])[^'"`]*\1$/.test(t)) return t.slice(1, -1);
	if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t);
	if (t === 'true' || t === 'false') return t === 'true';
	if (t === 'null') return null;
	return undefined;
}

interface MarkupTag {
	readonly name: string;
	readonly offset: number;
	readonly attrs: [string, string][];
	readonly text?: string;
}

/** Opening tags in a template with their attributes as written (quotes and braces respected) and the text that follows. */
export function markupTags(markup: string): MarkupTag[] {
	const out: MarkupTag[] = [];
	const text = markup.replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, ' '));
	const open = /<([A-Za-z][\w.:-]*)/g;
	for (let m = open.exec(text); m; m = open.exec(text)) {
		const attrs: [string, string][] = [];
		let i = m.index + m[0].length;
		while (i < text.length && text[i] !== '>' && !(text[i] === '/' && text[i + 1] === '>')) {
			if (/\s/.test(text[i]!)) {
				i++;
				continue;
			}
			const name = /^[^\s=>/]+/.exec(text.slice(i))?.[0];
			if (!name) {
				i++;
				continue;
			}
			i += name.length;
			let value = '';
			if (text[i] === '=') {
				i++;
				const q = text[i];
				if (q === '"' || q === "'") {
					const end = text.indexOf(q, i + 1);
					value = text.slice(i + 1, end < 0 ? text.length : end);
					i = end < 0 ? text.length : end + 1;
				} else if (q === '{') {
					let depth = 0;
					const start = i;
					for (; i < text.length; i++) {
						if (text[i] === '{') depth++;
						else if (text[i] === '}' && --depth === 0) break;
					}
					value = text.slice(start, ++i);
				} else {
					const v = /^[^\s>]+/.exec(text.slice(i))?.[0] ?? '';
					value = v;
					i += v.length;
				}
			} else if (name.startsWith('{') && name.endsWith('}')) value = name;
			attrs.push([name, value]);
		}
		const after = text.slice(i + 1, text.indexOf('<', i + 1) < 0 ? undefined : text.indexOf('<', i + 1)).replace(/\{\{[\s\S]*?\}\}/g, ' ').replace(/\s+/g, ' ').trim();
		out.push({ name: m[1]!, offset: m.index, attrs, ...(after && !after.startsWith('{') ? { text: after.slice(0, MAX_TEXT) } : {}) });
	}
	return out;
}

/** The catalog part for an export, also under the prefixed alias Radix exports (`DropdownMenuTrigger` is `Trigger`). */
function partFor(parts: Readonly<Record<string, string>>, name: string): string | undefined {
	if (parts[name] !== undefined) return parts[name];
	const last = name.split('.').at(-1)!;
	if (parts[last] !== undefined) return parts[last];
	const words = last.split(/(?=[A-Z])/);
	for (let i = 1; i < words.length; i++) {
		const suffix = words.slice(i).join('');
		if (parts[suffix] !== undefined) return parts[suffix];
	}
	return undefined;
}

function addMember(exp: ExportUsage, path: string, label: string, file: string): void {
	seenIn(exp, `member:${path}:${label}`, file);
	const list = (exp.members[path] ??= []);
	if (!list.includes(label)) list.push(label);
}

const STYLE_FILE = /\.(css|scss|sass|less)$/;

/** App files that style what a library writes into the page: its classes, `data-*` attributes and custom properties. */
async function styledBy(project: Project, scripts: readonly string[], prefixes: readonly string[], scope: ReadonlySet<string>): Promise<{ token: string; sites: Site[] }[]> {
	if (!prefixes.length) return [];
	const out = new Map<string, Site[]>();
	// Stylesheets are global, so they count for every library; a class string in a script only for the libraries that file renders.
	const targets = [...project.files.filter((f) => STYLE_FILE.test(f)), ...scripts.filter((f) => scope.has(f))];
	const patterns = prefixes.map((p) => {
		if (p.startsWith('data-')) {
			const name = p.slice(5).replace(/[-]$/, '');
			return { token: p, re: new RegExp(`data-\\[${name}|\\[data-${name}|data-${name}[=\\]]`, 'g') };
		}
		return { token: p, re: new RegExp(`(?<![\\w-])${p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\w-]*`, 'g') };
	});
	for (const file of targets) {
		const text = await project.read(file);
		if (!text) continue;
		const lines = text.split('\n');
		lines.forEach((line, i) => {
			for (const { token, re } of patterns) {
				re.lastIndex = 0;
				if (re.test(line)) {
					const list = out.get(token) ?? [];
					if (list.length < 40) list.push({ file, line: i + 1 });
					out.set(token, list);
				}
			}
		});
	}
	return [...out].map(([token, sites]) => ({ token, sites })).sort((a, b) => a.token.localeCompare(b.token));
}
