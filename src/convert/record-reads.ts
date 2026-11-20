// What code in a closure reads besides code (yuku's analyzer across the closure's files): environment variables, and module state code outside it changes.
import { readFileSync } from 'node:fs';
import { relative } from 'node:path';
import { Analyzer, type Module } from 'yuku/analyzer';
import type { Node } from 'yuku';
import { ROOT } from '../code-closure.ts';

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
}

const PROCESS = new Set(['process', 'node:process']);
// Methods that change the container they are called on.
const MUTATORS = new Set(['set', 'add', 'delete', 'clear', 'push', 'pop', 'shift', 'unshift', 'splice', 'sort', 'reverse', 'fill', 'copyWithin']);

/** One analysis over every file any closure holds, so a reference made from another module is seen. */
export class ClosureProject {
	private readonly analyzer = new Analyzer();

	constructor(files: Iterable<string>) {
		for (const file of files) this.analyzer.setFile(file, readFileSync(file, 'utf8'));
		this.analyzer.link();
	}

	private module(file: string): Module | undefined {
		return this.analyzer.module(file);
	}

	/**
	 * What `spans` (one kind's code) reads besides code. `recording` is all code that runs while recordings are made: a
	 * module-level binding this kind's code holds that recording code outside it changes is state another kind sets.
	 */
	reads(spans: readonly Span[], recording: readonly Span[]): ClosureReads {
		const env = new Set<string>();
		const state = new Set<string>();
		const problems: string[] = [];
		const inside = (file: string, node: Node) => within(spans, file, node);
		for (const file of new Set(spans.map((s) => s.file))) {
			const m = this.module(file);
			if (!m) {
				problems.push(`${relative(ROOT, file)} is not in the analysis`);
				continue;
			}
			const at = (node: Node) => `${relative(ROOT, file)}:${node.start}`;
			for (const ref of m.references) {
				const node = ref.node;
				if (!inside(file, node) || ref.inTypePosition) continue;
				const binding = ref.binding;
				let sort: 'process' | 'env' | undefined = !binding && ref.name === 'process' ? 'process' : undefined;
				if (binding) {
					const imp = m.imports.find((i) => i.local?.id === binding.id);
					if (imp && PROCESS.has(imp.specifier)) sort = imp.isNamespace || imp.name === 'default' ? 'process' : imp.name === 'env' ? 'env' : undefined;
				}
				if (!sort) continue;
				const up = m.parentOf(node);
				const member = up?.type === 'MemberExpression' && up.object === node && !up.computed ? up : undefined;
				if (sort === 'env') {
					if (member && member.property.type === 'Identifier') env.add(member.property.name);
					else problems.push(`${at(node)} reads the environment other than by a variable's name`);
					continue;
				}
				if (!member) {
					problems.push(`${at(node)} uses process other than by one of its fields`);
					continue;
				}
				if (member.property.type !== 'Identifier' || member.property.name !== 'env') continue;
				const name = m.parentOf(member);
				if (name?.type === 'MemberExpression' && name.object === member && !name.computed && name.property.type === 'Identifier') env.add(name.property.name);
				else problems.push(`${at(member)} reads the environment other than by a variable's name`);
			}
			// Module-level bindings declared in the closure: changed by another kind's code, they are an input no key holds.
			for (const binding of m.rootScope.bindings) {
				const declaration = binding.declarations[0];
				if (!declaration || !inside(file, declaration)) continue;
				for (const use of binding.findReferences()) {
					const where = use.module.path;
					if (inside(where, use.node) || !within(recording, where, use.node)) continue;
					if (use.isWrite || mutates(use.module, use.node)) {
						state.add(`${relative(ROOT, file)} ${binding.name}`);
						break;
					}
				}
			}
		}
		return { env, state, problems };
	}
}

const within = (spans: readonly Span[], file: string, node: Node) => spans.some((s) => s.file === file && node.start >= s.start && node.end <= s.end);

/** Whether a reference changes what it names in place: `x.set(...)`, `x.y = ...`, `x[k]++`, `delete x.y`, `Object.assign(x, ...)`. */
function mutates(m: Module, node: Node): boolean {
	const up = m.parentOf(node);
	if (up?.type === 'CallExpression' && up.arguments[0] === node && up.callee.type === 'MemberExpression' && !up.callee.computed && up.callee.object.type === 'Identifier' && up.callee.object.name === 'Object' && up.callee.property.type === 'Identifier') return ['assign', 'defineProperty', 'defineProperties', 'setPrototypeOf'].includes(up.callee.property.name);
	if (up?.type !== 'MemberExpression' || up.object !== node) return false;
	const above = m.parentOf(up);
	if (above?.type === 'CallExpression' && above.callee === up) return !up.computed && up.property.type === 'Identifier' && MUTATORS.has(up.property.name);
	if (above?.type === 'AssignmentExpression' && above.left === up) return true;
	if (above?.type === 'UpdateExpression') return true;
	return above?.type === 'UnaryExpression' && above.operator === 'delete';
}
