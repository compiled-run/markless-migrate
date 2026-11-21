// What code in a closure reads besides code (yuku's analyzer across the closure's files): environment variables, and module state code outside it changes.
import { readFileSync } from 'node:fs';
import { relative } from 'node:path';
import { Analyzer, type Module } from 'yuku/analyzer';
import type { Node } from 'yuku';
import { ROOT } from './code-closure.ts';

export interface Span {
	readonly file: string;
	readonly start: number;
	readonly end: number;
}

export interface ClosureReads {
	readonly env: ReadonlySet<string>;
	/** Module-level bindings the code reads that code outside it assigns or mutates (`path name`). */
	readonly state: ReadonlySet<string>;
	readonly problems: readonly string[];
	/** Where each environment problem is: the file (absolute), the offset, and why. */
	readonly sites: readonly { readonly file: string; readonly at: number; readonly why: string }[];
}

const PROCESS = new Set(['process', 'node:process']);
// The global object's names, through which `process` can be read too.
const GLOBALS = new Set(['globalThis', 'global']);
const WRAPPERS = new Set(['ParenthesizedExpression', 'TSAsExpression', 'TSSatisfiesExpression', 'TSNonNullExpression', 'TSTypeAssertion']);

/** The node with the parentheses and type assertions around it. */
function outer(m: Module, node: Node): Node {
	let at = node;
	for (let up = m.parentOf(at); up && WRAPPERS.has(up.type); up = m.parentOf(up)) at = up;
	return at;
}
// Methods that change the container they are called on.
const MUTATORS = new Set(['set', 'add', 'delete', 'clear', 'push', 'pop', 'shift', 'unshift', 'splice', 'sort', 'reverse', 'fill', 'copyWithin']);

/** Spans by file, sorted by start, for asking whether a node lies inside one. */
export class SpanIndex {
	private readonly byFile = new Map<string, { start: number; end: number }[]>();

	constructor(spans: readonly Span[]) {
		for (const s of spans) this.byFile.set(s.file, [...(this.byFile.get(s.file) ?? []), { start: s.start, end: s.end }]);
		for (const list of this.byFile.values()) list.sort((x, y) => x.start - y.start);
	}

	get files(): readonly string[] {
		return [...this.byFile.keys()];
	}

	holds(file: string, node: Node): boolean {
		const list = this.byFile.get(file);
		if (!list) return false;
		let lo = 0;
		let hi = list.length - 1;
		while (lo <= hi) {
			const mid = (lo + hi) >> 1;
			const s = list[mid];
			if (!s) return false;
			if (s.start > node.start) hi = mid - 1;
			else if (node.end <= s.end) return true;
			else lo = mid + 1;
		}
		return false;
	}
}

interface EnvUse {
	readonly node: Node;
	/** The variable read, or why it is not a variable's name. */
	readonly name?: string;
	readonly problem?: string;
}

interface Changed {
	readonly binding: string;
	readonly declaration: Node;
	readonly sites: readonly { readonly file: string; readonly node: Node }[];
}

/** One analysis over every file any closure holds, so a reference made from another module is seen. */
export class ClosureProject {
	private readonly analyzer = new Analyzer();
	private readonly envUses = new Map<string, readonly EnvUse[]>();
	private readonly changes = new Map<string, readonly Changed[]>();

	constructor(files: Iterable<string>) {
		for (const file of files) this.analyzer.setFile(file, readFileSync(file, 'utf8'));
		this.analyzer.link();
	}

	/** Every read of the environment in a file, each by the variable it names or why it names none. */
	private envOf(m: Module): readonly EnvUse[] {
		const known = this.envUses.get(m.path);
		if (known) return known;
		const out: EnvUse[] = [];
		const processImports = new Map<number, 'process' | 'env'>();
		for (const i of m.imports) if (i.local && PROCESS.has(i.specifier)) processImports.set(i.local.id, i.isNamespace || i.name === 'default' ? 'process' : 'env');
		for (const ref of m.references) {
			if (ref.inTypePosition) continue;
			let node: Node = ref.node;
			let sort = ref.binding ? processImports.get(ref.binding.id) : ref.name === 'process' ? 'process' : undefined;
			if (!ref.binding && GLOBALS.has(ref.name)) {
				const field = m.parentOf(outer(m, node));
				if (field?.type !== 'MemberExpression' || field.object !== outer(m, node)) continue;
				const name = field.computed ? (field.property.type === 'Literal' && typeof field.property.value === 'string' ? field.property.value : undefined) : field.property.type === 'Identifier' ? field.property.name : undefined;
				if (field.computed && name === undefined) out.push({ node, problem: 'reads a global by a computed name' });
				else if (field.computed && name === 'process') out.push({ node, problem: 'uses process other than by one of its fields' });
				else if (name === 'process') (node = field), (sort = 'process');
			}
			if (!sort) continue;
			const up = m.parentOf(outer(m, node));
			const member = up?.type === 'MemberExpression' && up.object === outer(m, node) && !up.computed ? up : undefined;
			if (sort === 'env') {
				out.push(member?.property.type === 'Identifier' ? { node, name: member.property.name } : { node, problem: "reads the environment other than by a variable's name" });
				continue;
			}
			if (!member) {
				out.push({ node, problem: 'uses process other than by one of its fields' });
				continue;
			}
			if (member.property.type !== 'Identifier' || member.property.name !== 'env') continue;
			const read = m.parentOf(member);
			out.push(read?.type === 'MemberExpression' && read.object === member && !read.computed && read.property.type === 'Identifier' ? { node, name: read.property.name } : { node: member, problem: "reads the environment other than by a variable's name" });
		}
		this.envUses.set(m.path, out);
		return out;
	}

	/** The module-level bindings of a file that some code changes (a `let` assigned, or any binding's value changed in place), with every place that changes them. */
	private changesOf(m: Module): readonly Changed[] {
		const known = this.changes.get(m.path);
		if (known) return known;
		const out: Changed[] = [];
		for (const binding of m.rootScope.bindings) {
			const declaration = binding.declarations[0];
			const declarator = declaration ? m.parentOf(declaration) : null;
			const statement = declarator ? m.parentOf(declarator) : null;
			if (declarator?.type !== 'VariableDeclarator' || statement?.type !== 'VariableDeclaration' || !declaration) continue;
			const sites = binding.findReferences().filter((use) => use.isWrite || mutates(use.module, use.node)).map((use) => ({ file: use.module.path, node: use.node }));
			if (sites.length) out.push({ binding: `${relative(ROOT, m.path)} ${binding.name}`, declaration, sites });
		}
		this.changes.set(m.path, out);
		return out;
	}

	/**
	 * What `spans` (one kind's code) reads besides code. `recording` is all code that runs while recordings are made: a
	 * module-level binding this kind's code holds that recording code outside it changes is state another kind sets.
	 */
	reads(spans: SpanIndex, recording: SpanIndex): ClosureReads {
		const env = new Set<string>();
		const state = new Set<string>();
		const problems: string[] = [];
		const sites: { file: string; at: number; why: string }[] = [];
		for (const file of spans.files) {
			const m = this.analyzer.module(file);
			if (!m) {
				problems.push(`${relative(ROOT, file)} is not in the analysis`);
				continue;
			}
			for (const use of this.envOf(m)) {
				if (!spans.holds(file, use.node)) continue;
				if (use.name) env.add(use.name);
				else {
					sites.push({ file, at: use.node.start, why: use.problem ?? '' });
					problems.push(`${relative(ROOT, file)}:${use.node.start} ${use.problem ?? ''}`);
				}
			}
			for (const changed of this.changesOf(m)) if (spans.holds(file, changed.declaration) && changed.sites.some((site) => !spans.holds(site.file, site.node) && recording.holds(site.file, site.node))) state.add(changed.binding);
		}
		return { env, state, problems, sites };
	}
}

// Not seen: a change through an alias (`const m = cache; m.set()`) or by a function handed the binding (docs/convert.md).
/** Whether a reference changes what it names in place, directly or through a member of it: `x.set(...)`, `x.y.set(...)`, `x.y = ...`, `x[k]++`, `delete x.y`, `Object.assign(x.y, ...)`. */
function mutates(m: Module, node: Node): boolean {
	let at = node;
	for (let up = m.parentOf(at); up?.type === 'MemberExpression' && up.object === at; up = m.parentOf(at)) at = up;
	const up = m.parentOf(at);
	if (up?.type === 'CallExpression' && up.arguments[0] === at && up.callee.type === 'MemberExpression' && !up.callee.computed && up.callee.object.type === 'Identifier' && up.callee.object.name === 'Object' && up.callee.property.type === 'Identifier') return ['assign', 'defineProperty', 'defineProperties', 'setPrototypeOf'].includes(up.callee.property.name);
	if (at === node || at.type !== 'MemberExpression') return false;
	if (up?.type === 'CallExpression' && up.callee === at) return !at.computed && at.property.type === 'Identifier' && MUTATORS.has(at.property.name);
	if (up?.type === 'AssignmentExpression' && up.left === at) return true;
	if (up?.type === 'UpdateExpression') return true;
	return up?.type === 'UnaryExpression' && up.operator === 'delete';
}
