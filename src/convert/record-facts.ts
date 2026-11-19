// What convert records, read from its module graph (yuku's analyzer over index.ts): each kind of recording and the
// recorder functions handed its directories, the orchestration code around them, the app files and options it reads.
import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { analyze, type Module } from 'yuku/analyzer';
import { resolveSpecifier, ROOT } from '../code-closure.ts';
import type { N } from '../source/js.ts';

export const INDEX = join(import.meta.dirname, 'index.ts');
/** The recordings store, under the app's folder. */
export const STORE = '.migrate/convert';
const RECORD_KEY = join(import.meta.dirname, 'record-key.ts');

/** A recorder: a top-level function of a module, handed a kind's directory by index.ts's `record`. */
export interface RecorderEntry {
	readonly file: string;
	readonly name: string;
}

export interface KindFacts {
	readonly entries: readonly RecorderEntry[];
	/** The orchestration's statements this kind's recordings run under: convert's statements up to the first recording, and each holding one of this kind. */
	readonly statements: readonly { readonly start: number; readonly end: number }[];
	/** index.ts's top-level bindings those statements reference, recorders aside. */
	readonly names: readonly string[];
}

export interface RecordingFacts {
	readonly source: string;
	readonly kinds: ReadonlyMap<string, KindFacts>;
	/** The app's files (from the app's folder) the orchestration reads. */
	readonly inputs: readonly string[];
	/** The convert options the orchestration reads. */
	readonly options: readonly string[];
	/** Each place the analysis could not attribute: a key over these facts is never reused. */
	readonly problems: readonly string[];
}

const analyzed = (file: string): Module => analyze(readFileSync(file, 'utf8'), { path: file } as Parameters<typeof analyze>[1]);

const unwrap = (m: Module, node: N): N => {
	let at = node;
	for (let up = m.parentOf(at as never) as N | null; up && (up.type === 'AwaitExpression' || up.type === 'ParenthesizedExpression' || up.type === 'TSNonNullExpression' || up.type === 'TSAsExpression'); up = m.parentOf(up as never) as N | null) at = up;
	return at;
};
const parentOf = (m: Module, node: N): N | undefined => (m.parentOf(node as never) as N | null) ?? undefined;
const isFn = (n: N | undefined) => !!n && (n.type === 'ArrowFunctionExpression' || n.type === 'FunctionExpression' || n.type === 'FunctionDeclaration');
const enclosingFn = (m: Module, node: N): N | undefined => {
	for (let up = parentOf(m, node); up; up = parentOf(m, up)) if (isFn(up)) return up;
	return undefined;
};
const literal = (n: N | undefined): string | undefined => (n?.type === 'Literal' && typeof n.value === 'string' ? n.value : n?.type === 'TemplateLiteral' && n.expressions.length === 0 ? n.quasis[0].value.cooked : undefined);
const at = (m: Module, node: N) => `${relative(ROOT, m.path)}:${node.start}`;

/** The binding a function is declared as: `function f`, or `const f = (...) => ...`. */
function declaredAs(m: Module, fn: N) {
	if (fn.type === 'FunctionDeclaration') return m.bindingOf(fn.id);
	const up = parentOf(m, unwrap(m, fn));
	return up?.type === 'VariableDeclarator' && up.id.type === 'Identifier' ? m.bindingOf(up.id) : null;
}

/** The import a binding is, with the file and exported name it leads to. */
function importOf(m: Module, binding: NonNullable<ReturnType<Module['bindingOf']>>): RecorderEntry | string {
	const imp = m.imports.find((i) => i.local?.id === binding.id);
	if (!imp) return `${binding.name} is not an import`;
	if (imp.isNamespace || imp.typeOnly || !imp.name) return `${binding.name} is not a named value import`;
	const target = resolveSpecifier(m.path, imp.specifier);
	if (target.kind !== 'file') return `${binding.name} is imported from ${imp.specifier}, not a file of this repository`;
	return { file: target.path, name: imp.name };
}

const callOf = (m: Module, ref: N): N | undefined => {
	const up = parentOf(m, ref);
	return up?.type === 'CallExpression' && up.callee === ref ? up : undefined;
};

/** Reads index.ts: the recordings convert makes, each through `record` (a function whose body is the only caller of the directory provider). */
export function recordingFacts(file = INDEX): RecordingFacts {
	const parsed = new Map<string, Module>();
	const moduleOf = (path: string): Module => parsed.get(path) ?? parsed.set(path, analyzed(path)).get(path)!;
	const m = moduleOf(file);
	const problems: string[] = [];
	const fail = (node: N, why: string) => problems.push(`${at(m, node)} ${why}`);

	// The store: the binding made by `RecordDirs.open(...)`, in the function that records (convert).
	const recordDirs = m.imports.find((i) => i.name === 'RecordDirs' && (() => {
		const t = resolveSpecifier(m.path, i.specifier);
		return t.kind === 'file' && t.path === RECORD_KEY;
	})());
	const opened = recordDirs?.local?.references.map((r) => r.node as N).filter((n) => {
		const up = parentOf(m, n);
		return up?.type === 'MemberExpression' && up.property.name === 'open' && callOf(m, up);
	}) ?? [];
	if (opened.length !== 1) return { source: m.source, kinds: new Map(), inputs: [], options: [], problems: [`${relative(ROOT, file)}: RecordDirs.open is called ${opened.length} times, not once`] };
	const openCall = unwrap(m, callOf(m, parentOf(m, opened[0]!)!)!);
	const dirsDecl = parentOf(m, openCall);
	const host = enclosingFn(m, openCall);
	if (dirsDecl?.type !== 'VariableDeclarator' || host?.type !== 'FunctionDeclaration') return { source: m.source, kinds: new Map(), inputs: [], options: [], problems: [`${at(m, openCall)} RecordDirs.open is not held by a top-level function's const`] };
	const dirs = m.bindingOf(dirsDecl.id)!;
	const body = host.body.body as N[];
	const statementOf = (node: N): N => {
		let s = node;
		for (let up = parentOf(m, s); up && up !== host.body; up = parentOf(m, up)) s = up;
		return s;
	};

	// The directory provider: the one function that calls dirs.dir(...); the record function: the one that calls it.
	const soleCaller = (binding: NonNullable<ReturnType<Module['bindingOf']>>, member?: string): ReturnType<Module['bindingOf']> => {
		const callers = new Set<N>();
		for (const r of binding.references) {
			const node = r.node as N;
			const up = parentOf(m, node);
			if (member ? up?.type === 'MemberExpression' && up.property.name === member && callOf(m, up) : callOf(m, node)) {
				const fn = enclosingFn(m, node);
				if (fn) callers.add(fn);
				else fail(node, `${binding.name}${member ? `.${member}` : ''} is called outside a function`);
			} else if (!member) fail(node, `${binding.name} is used other than called`);
		}
		if (callers.size !== 1) {
			problems.push(`${binding.name}${member ? `.${member}` : ''} is called from ${callers.size} functions, not one`);
			return null;
		}
		const fn = [...callers][0]!;
		const as = declaredAs(m, fn);
		if (!as) fail(fn, `the caller of ${binding.name}${member ? `.${member}` : ''} is not a named function`);
		return as;
	};
	const provider = soleCaller(dirs, 'dir');
	const record = provider && soleCaller(provider);
	const kinds = new Map<string, { entries: Map<string, RecorderEntry>; statements: Set<N> }>();
	const entryBindings = new Set<number>();
	const allowed = new Set<N>();
	const entry = (node: N, kind: string, where: N) => {
		const ref = m.referenceOf(node as never);
		const binding = ref?.binding;
		if (!binding) return fail(node, 'a recorder that is not a declared function');
		const found = importOf(m, binding);
		if (typeof found === 'string') return fail(node, `the recorder ${found}`);
		entryBindings.add(binding.id);
		allowed.add(node);
		const k = kinds.get(kind)!;
		k.entries.set(`${found.file}\0${found.name}`, found);
		k.statements.add(statementOf(where));
	};
	if (record) {
		for (const r of record.references) {
			const call = callOf(m, r.node as N);
			if (!call) continue;
			const kind = literal(call.arguments[0]);
			if (kind === undefined) {
				fail(call, 'a recording whose kind is not a literal');
				continue;
			}
			if (!kinds.has(kind)) kinds.set(kind, { entries: new Map(), statements: new Set() });
			kinds.get(kind)!.statements.add(statementOf(call));
			const recorder = call.arguments[1] as N | undefined;
			if (recorder?.type === 'Identifier') entry(recorder, kind, call);
			else if (recorder && isFn(recorder)) {
				// An adapter: what it calls with the directory it is handed (its fourth parameter) is the recorder.
				const dir = recorder.params[3];
				const binding = dir?.type === 'Identifier' ? m.bindingOf(dir) : null;
				if (!binding) fail(recorder, 'a recorder adapter without a directory parameter');
				else
					for (const use of binding.references) {
						const up = parentOf(m, use.node as N);
						if (up?.type === 'CallExpression' && up.arguments.includes(use.node) && up.callee.type === 'Identifier') entry(up.callee, kind, call);
						else fail(use.node as N, 'a recorder adapter hands its directory to something other than a function it calls');
					}
			} else fail(call, 'a recorder that is neither a function nor an imported one');
		}
	}
	// A recorder function used anywhere but as record's recorder records outside the keyed store.
	for (const id of entryBindings) for (const r of m.bindings[id]!.references) if (!allowed.has(r.node as N) && !r.inTypePosition) fail(r.node as N, `the recorder ${r.name} is used outside record`);

	const recordStatements = new Set([...kinds.values()].flatMap((k) => [...k.statements]));
	const first = body.findIndex((s) => recordStatements.has(s));
	const prefix = first < 0 ? [] : body.slice(0, first);

	// The app's files the orchestration reads: paths joined from `options.app` (or a folder joined from it) with literals.
	const inputs = new Set<string>();
	const optionsRead = new Set<string>();
	const options = host.params[0]?.type === 'Identifier' ? m.bindingOf(host.params[0]) : null;
	const isJoin = (call: N | undefined, mod: Module) => {
		if (call?.type !== 'CallExpression' || call.callee.type !== 'Identifier') return false;
		const b = mod.referenceOf(call.callee)?.binding;
		const imp = b && mod.imports.find((i) => i.local?.id === b.id);
		return !!imp && (imp.specifier === 'node:path' || imp.specifier === 'path') && (imp.name === 'join' || imp.name === 'resolve');
	};
	const storeCall = (mod: Module, call: N): boolean => {
		if (call.callee.type === 'MemberExpression' && call.callee.object.type === 'Identifier' && call.callee.property.name === 'open') return mod.referenceOf(call.callee.object)?.binding?.id === recordDirs?.local?.id;
		const b = call.callee.type === 'Identifier' ? mod.referenceOf(call.callee)?.binding : null;
		const imp = b && mod.imports.find((i) => i.local?.id === b.id);
		return !!imp && /^(node:)?fs(\/promises)?$/.test(imp.specifier);
	};
	const inside = (node: N, within: readonly N[]) => within.some((s) => node.start >= s.start && node.end <= s.end);
	const followed = new Set<string>();
	// `audit`: only whether a folder of the store is handed to a function, anywhere in convert (the inputs are the slice's).
	const pathUses = (mod: Module, binding: NonNullable<ReturnType<Module['bindingOf']>>, base: string, within: readonly N[] | undefined, depth: number, audit = false): void => {
		for (const r of binding.references) {
			const node = r.node as N;
			if (within && !inside(node, within)) continue;
			const up = parentOf(mod, node);
			if (isJoin(up, mod) && up!.arguments[0] === node) {
				const rest = (up!.arguments as N[]).slice(1).map(literal);
				const open = rest.indexOf(undefined);
				// A path whose end is computed is every file under its literal start (the store's own files, say).
				const path = [base, ...(open < 0 ? rest : [...rest.slice(0, open), '*'])].filter(Boolean).join('/');
				const holder = parentOf(mod, unwrap(mod, up!));
				if (open < 0 && holder?.type === 'VariableDeclarator' && holder.init === unwrap(mod, up!) && holder.id.type === 'Identifier') pathUses(mod, mod.bindingOf(holder.id)!, path, within, depth, audit);
				else {
					if (!audit) inputs.add(path);
					// A folder of the store handed to anything but the file system or the store's opening is a recording made outside record.
					if ((path === STORE || path.startsWith(`${STORE}/`)) && holder?.type === 'CallExpression' && holder.arguments.includes(unwrap(mod, up!)) && !storeCall(mod, holder)) problems.push(`${at(mod, up!)} a folder of the store is handed to a function: record through record()`);
				}
			} else if (audit) continue;
			else if (up?.type === 'CallExpression' && up.arguments.includes(node) && up.callee.type === 'Identifier' && depth < 4) {
				const b = mod.referenceOf(up.callee)?.binding;
				const target = b ? importOf(mod, b) : 'an unknown function';
				if (typeof target === 'string') {
					problems.push(`${at(mod, up)} the app's folder is handed to ${target}`);
					continue;
				}
				// The key reads the app's inputs this analysis names.
				if (target.file === RECORD_KEY) continue;
				const seen = `${target.file}\0${target.name}\0${up.arguments.indexOf(node)}`;
				if (followed.has(seen)) continue;
				followed.add(seen);
				const callee = moduleOf(target.file);
				const def = callee.resolveExport(target.name);
				const decl = def?.binding?.declarations[0] as N | undefined;
				const fn = decl && (isFn(parentOf(callee, decl)) ? parentOf(callee, decl) : parentOf(callee, decl)?.type === 'VariableDeclarator' ? parentOf(callee, decl)!.init : undefined);
				const param = fn?.params?.[up.arguments.indexOf(node)];
				const pb = param?.type === 'Identifier' ? callee.bindingOf(param) : null;
				if (!pb || def?.module !== callee) problems.push(`${at(mod, up)} the app's folder is handed to ${target.name}, whose parameter cannot be followed`);
				else pathUses(callee, pb, base, undefined, depth + 1);
			} else problems.push(`${at(mod, node)} the app's folder is used other than joined with literals or handed to a function`);
		}
	};

	// The key's own machinery (record-key.ts) decides where recordings go, not what they hold: its code is no recording's input.
	const keyMachinery = new Set(m.imports.filter((i) => {
		const t = resolveSpecifier(m.path, i.specifier);
		return t.kind === 'file' && t.path === RECORD_KEY && i.local;
	}).map((i) => i.local!.id));
	const result = new Map<string, KindFacts>();
	const slices = new Set<N>(prefix);
	for (const [kind, k] of kinds) {
		const statements = [...prefix, ...[...k.statements].sort((a, b) => a.start - b.start)];
		for (const s of statements) slices.add(s);
		const names = new Set<string>();
		for (const s of statements)
			m.walk(
				{
					Identifier(node, ctx) {
						const ref = ctx.reference;
						const b = ref?.binding;
						if (!ref || ref.inTypePosition || !b || b.scope.id !== m.rootScope.id || entryBindings.has(b.id) || keyMachinery.has(b.id) || b.declarations.includes(host.id)) return;
						names.add(b.name);
					},
				},
				s as never,
			);
		result.set(kind, { entries: [...k.entries.values()].sort((a, b) => (a.file + a.name < b.file + b.name ? -1 : 1)), statements: statements.map((s) => ({ start: s.start, end: s.end })), names: [...names].sort() });
	}
	const within = [...slices];
	if (options) {
		for (const r of options.references) {
			const node = r.node as N;
			if (!inside(node, within)) continue;
			const up = parentOf(m, node);
			if (up?.type === 'MemberExpression' && up.object === node && !up.computed) {
				optionsRead.add(up.property.name);
				if (up.property.name === 'app') {
					const holder = parentOf(m, unwrap(m, up));
					if (holder?.type === 'VariableDeclarator' && holder.id.type === 'Identifier') {
						pathUses(m, m.bindingOf(holder.id)!, '', within, 0);
						pathUses(m, m.bindingOf(holder.id)!, '', [host], 0, true);
					}
					else fail(up, "options.app is read other than into a const");
				}
			} else fail(node, 'the convert options are used other than by a field');
		}
	} else problems.push(`${at(m, host)} the recording function's options are not one parameter`);
	return { source: m.source, kinds: result, inputs: [...inputs].sort(), options: [...optionsRead].sort(), problems: [...new Set(problems)].sort() };
}
