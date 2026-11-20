// What convert records, read with yuku's analyzer over index.ts: each kind, its recorders, the code around them, and what that code reads.
import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { CallExpression, FunctionParameter, Node } from 'yuku';
import { analyze, type Module } from 'yuku/analyzer';
import { resolveSpecifier, ROOT } from '../code-closure.ts';

export const INDEX = join(import.meta.dirname, 'index.ts');
/** The recordings store, under the app's folder. */
export const STORE = '.migrate/convert';
const RECORD_KEY = join(import.meta.dirname, 'record-key.ts');

/** Bindings of convert handed to a recorder as a function, and why what they do is no part of a recording. */
export const HANDLES: Readonly<Record<string, string>> = {
	log: 'where progress lines go',
	limit: 'how many recordings run at once',
};

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

type Binding = NonNullable<ReturnType<Module['bindingOf']>>;
type Fn = Extract<Node, { type: 'ArrowFunctionExpression' | 'FunctionExpression' | 'FunctionDeclaration' }>;

const analyzed = (file: string): Module => analyze(readFileSync(file, 'utf8'), { path: file });
const isFn = (n: Node | null | undefined): n is Fn => !!n && (n.type === 'ArrowFunctionExpression' || n.type === 'FunctionExpression' || n.type === 'FunctionDeclaration');
const WRAPPERS = new Set(['AwaitExpression', 'ParenthesizedExpression', 'TSNonNullExpression', 'TSAsExpression']);

/** The node with the awaits, parentheses and type assertions around it. */
function unwrap(m: Module, node: Node): Node {
	let at = node;
	for (let up = m.parentOf(at); up && WRAPPERS.has(up.type); up = m.parentOf(up)) at = up;
	return at;
}
function enclosingFn(m: Module, node: Node): Fn | undefined {
	for (let up = m.parentOf(node); up; up = m.parentOf(up)) if (isFn(up)) return up;
	return undefined;
}
function literal(n: Node | null | undefined): string | undefined {
	if (n?.type === 'Literal' && typeof n.value === 'string') return n.value;
	if (n?.type === 'TemplateLiteral' && n.expressions.length === 0) return n.quasis[0]?.value.cooked ?? undefined;
	return undefined;
}
const at = (m: Module, node: Node) => `${relative(ROOT, m.path)}:${node.start}`;
const calleeOf = (m: Module, ref: Node): CallExpression | undefined => {
	const up = m.parentOf(ref);
	return up?.type === 'CallExpression' && up.callee === ref ? up : undefined;
};
const memberName = (n: Node | null): string | undefined => (n?.type === 'MemberExpression' && !n.computed && n.property.type === 'Identifier' ? n.property.name : undefined);

/** The binding a function is declared as: `function f`, or `const f = (...) => ...`. */
function declaredAs(m: Module, fn: Fn): Binding | null {
	if (fn.type === 'FunctionDeclaration') return fn.id ? m.bindingOf(fn.id) : null;
	const up = m.parentOf(unwrap(m, fn));
	return up?.type === 'VariableDeclarator' && up.id.type === 'Identifier' ? m.bindingOf(up.id) : null;
}

/** The import a binding is, with the file and exported name it leads to. */
function importOf(m: Module, binding: Binding): RecorderEntry | string {
	const imp = m.imports.find((i) => i.local?.id === binding.id);
	if (!imp) return `${binding.name} is not an import`;
	if (imp.isNamespace || imp.typeOnly || !imp.name) return `${binding.name} is not a named value import`;
	const target = resolveSpecifier(m.path, imp.specifier);
	if (target.kind !== 'file') return `${binding.name} is imported from ${imp.specifier}, not a file of this repository`;
	return { file: target.path, name: imp.name };
}

/** The function an exported name of a module declares. */
function exportedFn(m: Module, name: string): Fn | undefined {
	const declaration = m.resolveExport(name)?.binding?.declarations[0];
	const up = declaration ? m.parentOf(declaration) : null;
	if (isFn(up)) return up;
	return up?.type === 'VariableDeclarator' && isFn(up.init) ? up.init : undefined;
}

/** Whether a parameter is typed as a function, directly or through a type alias of its module or one it imports. */
function takesFunction(m: Module, param: FunctionParameter, moduleOf: (file: string) => Module): boolean {
	const id = param.type === 'AssignmentPattern' ? param.left : param;
	const annotation = id.type === 'Identifier' ? id.typeAnnotation?.typeAnnotation : undefined;
	if (!annotation) return false;
	if (annotation.type === 'TSFunctionType') return true;
	if (annotation.type !== 'TSTypeReference' || annotation.typeName.type !== 'Identifier') return false;
	const binding = m.lookup(annotation.typeName.name, { space: 'type' });
	let home = m;
	let declaration = binding?.declarations[0];
	const imported = binding ? m.imports.find((i) => i.local?.id === binding.id) : undefined;
	if (imported?.name) {
		const target = resolveSpecifier(m.path, imported.specifier);
		if (target.kind !== 'file') return false;
		home = moduleOf(target.path);
		declaration = home.resolveExport(imported.name)?.binding?.declarations[0];
	}
	const alias = declaration ? home.parentOf(declaration) : null;
	return alias?.type === 'TSTypeAliasDeclaration' && alias.typeAnnotation.type === 'TSFunctionType';
}

const empty = (problem: string): RecordingFacts => ({ source: '', kinds: new Map(), inputs: [], options: [], problems: [problem] });

/** Reads index.ts: the recordings convert makes, each through `record` (a function whose body is the only caller of the directory provider). */
export function recordingFacts(file = INDEX): RecordingFacts {
	const parsed = new Map<string, Module>();
	const moduleOf = (path: string): Module => {
		const known = parsed.get(path);
		if (known) return known;
		const m = analyzed(path);
		parsed.set(path, m);
		return m;
	};
	const m = moduleOf(file);
	const problems: string[] = [];
	const fail = (node: Node, why: string) => problems.push(`${at(m, node)} ${why}`);

	// The store: the binding made by `RecordDirs.open(...)`, in the function that records (convert).
	const recordDirs = m.imports.find((i) => {
		const t = resolveSpecifier(m.path, i.specifier);
		return i.name === 'RecordDirs' && t.kind === 'file' && t.path === RECORD_KEY;
	})?.local;
	const opens: CallExpression[] = [];
	for (const r of recordDirs?.references ?? []) {
		const up = m.parentOf(r.node);
		const call = up && memberName(up) === 'open' ? calleeOf(m, up) : undefined;
		if (call) opens.push(call);
	}
	const [openCall] = opens;
	if (opens.length !== 1 || !openCall) return { ...empty(`${relative(ROOT, file)}: RecordDirs.open is called ${opens.length} times, not once`), source: m.source };
	const dirsDecl = m.parentOf(unwrap(m, openCall));
	const host = enclosingFn(m, openCall);
	const dirs = dirsDecl?.type === 'VariableDeclarator' && dirsDecl.id.type === 'Identifier' ? m.bindingOf(dirsDecl.id) : null;
	if (!dirs || host?.type !== 'FunctionDeclaration' || !host.body) return { ...empty(`${at(m, openCall)} RecordDirs.open is not held by a top-level function's const`), source: m.source };
	const hostBody = host.body;
	const body = hostBody.body;
	const statementOf = (node: Node): Node => {
		let s = node;
		for (let up = m.parentOf(s); up && up !== hostBody; up = m.parentOf(up)) s = up;
		return s;
	};
	const declaredInHost = (b: Binding) => b.declarations.some((d) => d.start >= host.start && d.end <= host.end);

	// The directory provider: the one function that calls dirs.stage(...); the record function: the one that calls it.
	const soleCaller = (binding: Binding, member?: string): Binding | null => {
		const callers = new Set<Fn>();
		for (const r of binding.references) {
			const up = m.parentOf(r.node);
			const called = member ? (up && memberName(up) === member ? calleeOf(m, up) : undefined) : calleeOf(m, r.node);
			if (called) {
				const fn = enclosingFn(m, r.node);
				if (fn) callers.add(fn);
				else fail(r.node, `${binding.name}${member ? `.${member}` : ''} is called outside a function`);
			} else if (!member) fail(r.node, `${binding.name} is used other than called`);
		}
		const [fn] = callers;
		if (callers.size !== 1 || !fn) {
			problems.push(`${binding.name}${member ? `.${member}` : ''} is called from ${callers.size} functions, not one`);
			return null;
		}
		const as = declaredAs(m, fn);
		if (!as) fail(fn, `the caller of ${binding.name}${member ? `.${member}` : ''} is not a named function`);
		return as;
	};
	const provider = soleCaller(dirs, 'stage');
	const record = provider && soleCaller(provider);
	const kinds = new Map<string, { entries: Map<string, RecorderEntry>; statements: Set<Node> }>();
	const entryBindings = new Set<number>();
	const allowed = new Set<Node>();
	// A function handed to a recorder must be a known handle of convert: what any other one does is in no key.
	const handle = (arg: Node, why: string) => {
		const binding = arg.type === 'Identifier' ? m.referenceOf(arg)?.binding : null;
		if (!binding || !(binding.name in HANDLES) || !declaredInHost(binding)) fail(arg, `${why}: only ${Object.keys(HANDLES).join(' and ')} (HANDLES) may be`);
	};
	const entry = (node: Node, kinds_: { entries: Map<string, RecorderEntry> }): RecorderEntry | undefined => {
		const binding = node.type === 'Identifier' ? m.referenceOf(node)?.binding : null;
		if (!binding) {
			fail(node, 'a recorder that is not a declared function');
			return undefined;
		}
		const found = importOf(m, binding);
		if (typeof found === 'string') {
			fail(node, `the recorder ${found}`);
			return undefined;
		}
		entryBindings.add(binding.id);
		allowed.add(node);
		kinds_.entries.set(`${found.file}\0${found.name}`, found);
		return found;
	};
	for (const r of record?.references ?? []) {
		const call = calleeOf(m, r.node);
		if (!call) continue;
		const kind = literal(call.arguments[0]);
		if (kind === undefined) {
			fail(call, 'a recording whose kind is not a literal');
			continue;
		}
		const k = kinds.get(kind) ?? { entries: new Map<string, RecorderEntry>(), statements: new Set<Node>() };
		kinds.set(kind, k);
		k.statements.add(statementOf(call));
		const recorder = call.arguments[1];
		const given = call.arguments.slice(4);
		for (const arg of given) if (isFn(arg)) fail(arg, 'a function written in place is handed to a recorder');
		if (recorder?.type === 'Identifier') {
			const found = entry(recorder, k);
			const fn = found && exportedFn(moduleOf(found.file), found.name);
			if (found && !fn) fail(recorder, `the recorder ${found.name} is not a function its module declares`);
			// record(kind, recorder, browser, route, ...given) hands given[j] to the recorder's parameter 4 + j.
			if (fn) given.forEach((arg, j) => {
				const param = fn.params[4 + j];
				if (param && takesFunction(moduleOf(found.file), param, moduleOf)) handle(arg, `a function handed to ${found.name}`);
			});
		} else if (isFn(recorder)) {
			// An adapter: what it calls with the directory it is handed (its fourth parameter) is the recorder.
			const dir = recorder.params[3];
			const binding = dir?.type === 'Identifier' ? m.bindingOf(dir) : null;
			if (!binding) fail(recorder, 'a recorder adapter without a directory parameter');
			for (const use of binding?.references ?? []) {
				const up = m.parentOf(use.node);
				if (up?.type === 'CallExpression' && up.arguments.some((a) => a === use.node)) entry(up.callee, k);
				else fail(use.node, 'a recorder adapter hands its directory to something other than a function it calls');
			}
			// What the adapter reads from outside itself is not what it is handed, so it must be a handle or the recorder.
			for (const ref of m.references) {
				const b = ref.binding;
				if (ref.inTypePosition || !b || ref.node.start < recorder.start || ref.node.end > recorder.end) continue;
				if (b.declarations.every((d) => d.start >= recorder.start && d.end <= recorder.end)) continue;
				if (m.imports.some((i) => i.local?.id === b.id)) continue;
				handle(ref.node, 'a recorder adapter reads what it is not handed');
			}
		} else fail(call, 'a recorder that is neither a function nor an imported one');
	}
	// A recorder function used anywhere but as record's recorder records outside the keyed store.
	for (const id of entryBindings) for (const r of m.bindings[id]?.references ?? []) if (!allowed.has(r.node) && !r.inTypePosition) fail(r.node, `the recorder ${r.name} is used outside record`);

	const recordStatements = new Set([...kinds.values()].flatMap((k) => [...k.statements]));
	const first = body.findIndex((s) => recordStatements.has(s));
	const prefix: Node[] = first < 0 ? [] : body.slice(0, first);

	// The app's files the orchestration reads: paths joined from `options.app` (or a folder joined from it) with literals.
	const inputs = new Set<string>();
	const optionsRead = new Set<string>();
	const optionsParam = host.params[0];
	const options = optionsParam?.type === 'Identifier' ? m.bindingOf(optionsParam) : null;
	const fromPath = (mod: Module, call: Node | null): call is CallExpression => {
		if (call?.type !== 'CallExpression' || call.callee.type !== 'Identifier') return false;
		const b = mod.referenceOf(call.callee)?.binding;
		const imp = b ? mod.imports.find((i) => i.local?.id === b.id) : undefined;
		return !!imp && (imp.specifier === 'node:path' || imp.specifier === 'path') && (imp.name === 'join' || imp.name === 'resolve');
	};
	const storeCall = (mod: Module, call: CallExpression): boolean => {
		if (call.callee.type === 'MemberExpression' && call.callee.object.type === 'Identifier' && memberName(call.callee) === 'open') return mod.referenceOf(call.callee.object)?.binding?.id === recordDirs?.id;
		const b = call.callee.type === 'Identifier' ? mod.referenceOf(call.callee)?.binding : null;
		const imp = b ? mod.imports.find((i) => i.local?.id === b.id) : undefined;
		return !!imp && ['fs', 'node:fs', 'fs/promises', 'node:fs/promises'].includes(imp.specifier);
	};
	const fsWrite = (mod: Module, call: CallExpression): boolean => {
		const b = call.callee.type === 'Identifier' ? mod.referenceOf(call.callee)?.binding : null;
		const imp = b ? mod.imports.find((i) => i.local?.id === b.id) : undefined;
		return !!imp?.name && ['fs', 'node:fs', 'fs/promises', 'node:fs/promises'].includes(imp.specifier) && ['writeFile', 'writeFileSync', 'appendFile', 'appendFileSync', 'mkdir', 'mkdirSync', 'rm', 'rmSync'].includes(imp.name);
	};
	const inside = (node: Node, within: readonly Node[]) => within.some((s) => node.start >= s.start && node.end <= s.end);
	const followed = new Set<string>();
	// `audit`: only whether a folder of the store is handed to a function, anywhere in convert (the inputs are the slice's).
	const pathUses = (mod: Module, binding: Binding, base: string, within: readonly Node[] | undefined, depth: number, audit = false): void => {
		for (const r of binding.references) {
			const node = r.node;
			if (within && !inside(node, within)) continue;
			const up = mod.parentOf(node);
			if (fromPath(mod, up) && up.arguments[0] === node) {
				const rest = up.arguments.slice(1).map(literal);
				const open = rest.indexOf(undefined);
				// A path whose end is computed is every file under its literal start (the store's own files, say).
				const path = [base, ...(open < 0 ? rest : [...rest.slice(0, open), '*'])].filter(Boolean).join('/');
				const outer = unwrap(mod, up);
				const holder = mod.parentOf(outer);
				const held = open < 0 && holder?.type === 'VariableDeclarator' && holder.init === outer && holder.id.type === 'Identifier' ? mod.bindingOf(holder.id) : null;
				if (held) pathUses(mod, held, path, within, depth, audit);
				else {
					// A path handed to a write is something the orchestration makes (prefetch.json, costs), not one of its inputs.
					if (!audit && !(holder?.type === 'CallExpression' && holder.arguments[0] === outer && fsWrite(mod, holder))) inputs.add(path);
					// A folder of the store handed to anything but the file system or the store's opening is a recording made outside record.
					if ((path === STORE || path.startsWith(`${STORE}/`)) && holder?.type === 'CallExpression' && holder.arguments.some((a) => a === outer) && !storeCall(mod, holder)) problems.push(`${at(mod, up)} a folder of the store is handed to a function: record through record()`);
				}
			} else if (audit) continue;
			else if (up?.type === 'CallExpression' && up.arguments.some((a) => a === node) && up.callee.type === 'Identifier' && depth < 4) {
				const b = mod.referenceOf(up.callee)?.binding;
				const target = b ? importOf(mod, b) : 'an unknown function';
				if (typeof target === 'string') {
					problems.push(`${at(mod, up)} the app's folder is handed to ${target}`);
					continue;
				}
				// The key reads the app's inputs this analysis names.
				if (target.file === RECORD_KEY) continue;
				const index = up.arguments.findIndex((a) => a === node);
				const seen = `${target.file}\0${target.name}\0${index}`;
				if (followed.has(seen)) continue;
				followed.add(seen);
				const callee = moduleOf(target.file);
				const param = exportedFn(callee, target.name)?.params[index];
				const pb = param?.type === 'Identifier' ? callee.bindingOf(param) : null;
				if (!pb) problems.push(`${at(mod, up)} the app's folder is handed to ${target.name}, whose parameter cannot be followed`);
				else pathUses(callee, pb, base, undefined, depth + 1);
			} else problems.push(`${at(mod, node)} the app's folder is used other than joined with literals or handed to a function`);
		}
	};

	// The key's own machinery (record-key.ts) decides where recordings go, not what they hold: its code is no recording's input.
	const keyMachinery = new Set<number>();
	for (const i of m.imports) {
		const t = resolveSpecifier(m.path, i.specifier);
		if (t.kind === 'file' && t.path === RECORD_KEY && i.local) keyMachinery.add(i.local.id);
	}
	const result = new Map<string, KindFacts>();
	const slices = new Set<Node>(prefix);
	for (const [kind, k] of kinds) {
		const statements = [...prefix, ...[...k.statements].sort((a, b) => a.start - b.start)];
		for (const s of statements) slices.add(s);
		const names = new Set<string>();
		for (const ref of m.references) {
			const b = ref.binding;
			if (ref.inTypePosition || !b || !inside(ref.node, statements) || b.scope.id !== m.rootScope.id || entryBindings.has(b.id) || keyMachinery.has(b.id) || (host.id && b.declarations.includes(host.id))) continue;
			names.add(b.name);
		}
		result.set(kind, { entries: [...k.entries.values()].sort((a, b) => (a.file + a.name < b.file + b.name ? -1 : 1)), statements: statements.map((s) => ({ start: s.start, end: s.end })), names: [...names].sort() });
	}
	const within = [...slices];
	if (!options) problems.push(`${at(m, host)} the recording function's options are not one parameter`);
	for (const r of options?.references ?? []) {
		const node = r.node;
		if (!inside(node, within)) continue;
		const up = m.parentOf(node);
		const field = up?.type === 'MemberExpression' && up.object === node ? memberName(up) : undefined;
		if (!up || !field) {
			fail(node, 'the convert options are used other than by a field');
			continue;
		}
		optionsRead.add(field);
		if (field !== 'app') continue;
		const holder = m.parentOf(unwrap(m, up));
		const app = holder?.type === 'VariableDeclarator' && holder.id.type === 'Identifier' ? m.bindingOf(holder.id) : null;
		if (!app) {
			fail(up, 'options.app is read other than into a const');
			continue;
		}
		pathUses(m, app, '', within, 0);
		pathUses(m, app, '', [host], 0, true);
	}
	return { source: m.source, kinds: result, inputs: [...inputs].sort(), options: [...optionsRead].sort(), problems: [...new Set(problems)].sort() };
}

