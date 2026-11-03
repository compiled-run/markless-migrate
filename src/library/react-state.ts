import { isFunction, patternNames, staticValue, known, unwrap, walk, type Module, type N } from '../source/js.ts';
import { announcedChange, configAttribute, followedProp, followsAny } from '../convert/parts.ts';
import type { Compositions, PartRef } from './composition.ts';
import { cancelOf, freeNames, GLOBALS, HOOK, Refused, TS_EXPRESSIONS, WRAPPERS, type Handlers } from './handlers.ts';
import type { BoundAttribute, StateCode, StateComponent, StateNode, StateSlot } from './types.ts';

// React's hooks a component's own state converts from; any other hook leaves the component in React.
const STATE = new Set(['useState', 'useReducer']);
const EFFECTS = new Set(['useEffect', 'useLayoutEffect', 'useInsertionEffect']);
// Pure globals an expression the plan evaluates at load may read.
const PURE = new Set(['Math', 'JSON', 'Number', 'String', 'Boolean', 'Array', 'Object', 'undefined', 'Infinity', 'NaN', 'parseInt', 'parseFloat', 'isNaN', 'encodeURIComponent']);
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
// The props a component passes on to its element that the page shows as attributes of it.
const DOM_PROPS = /^(aria-|data-)|^(id|role|title|type|tabIndex|disabled|hidden|name|value|placeholder|href|htmlFor)$/;
// What reaches the element of a component that is not a plain element wrapper (a library part, a `Comp`): its own props
// (value, checked, disabled, onChange) are its API, only these pass through as written.
const PART_DOM_PROPS = /^(aria-|data-)|^(id|role|title|tabIndex)$/;
const PART_EVENTS = /^on(Click|DoubleClick|ContextMenu|KeyDown|KeyUp|Focus|Blur|(Mouse|Pointer)(Down|Up|Enter|Leave|Move|Over|Out))$/;
// React Aria's components answer presses and changes through their own callbacks, not DOM events.
const CALLBACK_LIBRARIES = new Set(['react-aria-components', 'react-aria']);
const TEXT_INPUT = /^(input|textarea)$/;
// Each library's controlled props, by the callback it calls with the value it would take next (its documented API).
const CONTROLLED: Readonly<Record<string, Readonly<Record<string, string>>>> = {
	'radix-ui': { open: 'onOpenChange', value: 'onValueChange', checked: 'onCheckedChange', pressed: 'onPressedChange' },
	'@base-ui/react': { open: 'onOpenChange', value: 'onValueChange', checked: 'onCheckedChange', pressed: 'onPressedChange' },
	'react-aria-components': { isOpen: 'onOpenChange', isExpanded: 'onExpandedChange', expandedKeys: 'onExpandedChange', selectedKey: 'onSelectionChange', selectedKeys: 'onSelectionChange', isSelected: 'onChange', value: 'onChange', inputValue: 'onInputChange' },
	cmdk: { value: 'onValueChange' },
	vaul: { open: 'onOpenChange' },
	'input-otp': { value: 'onChange' },
};
const controlledProps = (library: string) => CONTROLLED[/^@radix-ui\/react-/.test(library) ? 'radix-ui' : library];
// React's props for DOM events; any other on* prop is a library's callback (onOpenChange), which no DOM event fires.
const DOM_EVENTS = /^on(Click|DoubleClick|ContextMenu|Input|Change|Submit|Reset|Invalid|KeyDown|KeyUp|Focus|Blur|(Mouse|Pointer)(Down|Up|Enter|Leave|Move|Over|Out)|Touch(Start|End|Move|Cancel)|Wheel|Scroll|Drag(Start|End|Enter|Leave|Over)?|Drop|Copy|Cut|Paste|Toggle|Load|Error)$/;

const hookName = (init: N | undefined): string | undefined => {
	const call = unwrap(init);
	if (call?.type !== 'CallExpression') return undefined;
	const c = call.callee;
	const name = c.type === 'Identifier' ? c.name : c.type === 'MemberExpression' && !c.computed && c.object.type === 'Identifier' ? `${c.object.name}.${c.property.name}` : undefined;
	return name && HOOK.test(name) ? name.replace(/^React\./, '') : undefined;
};

/** The DOM attribute a JSX prop of a host element writes. */
const domName = (prop: string) => (prop === 'className' ? 'class' : prop === 'htmlFor' ? 'for' : /^(aria|data)-/.test(prop) ? prop : prop.toLowerCase());

/** The attribute text React writes for a value, or null where it writes none. */
function attributeText(name: string, v: unknown): string | null {
	if (v === null || v === undefined) return null;
	if (typeof v === 'boolean') return /^(aria|data)-/.test(name) ? String(v) : v ? '' : null;
	return String(v);
}

/** The text React renders for a child value. */
const childText = (v: unknown) => (v === null || v === undefined || typeof v === 'boolean' ? '' : String(v));

/** A JSX text's value as React renders it: lines trimmed where they break, blank lines gone. */
export function jsxTextValue(raw: string): string {
	const lines = raw.split(/\r\n|\n|\r/);
	let last = 0;
	lines.forEach((l, i) => {
		if (/[^ \t]/.test(l)) last = i;
	});
	let out = '';
	lines.forEach((l, i) => {
		let line = l.replace(/\t/g, ' ');
		if (i > 0) line = line.replace(/^ +/, '');
		if (i < lines.length - 1) line = line.replace(/ +$/, '');
		if (line) out += i !== last ? `${line} ` : line;
	});
	return out;
}

const join = (code: StateCode, names: readonly string[]) => code.map((c) => (typeof c === 'number' ? names[c] : c)).join('');

/** Merges neighbouring text in a code. */
function tidy(code: readonly (string | number)[]): StateCode {
	const out: (string | number)[] = [];
	for (const c of code) {
		if (c === '') continue;
		if (typeof c === 'string' && typeof out.at(-1) === 'string') out[out.length - 1] += c;
		else out.push(c);
	}
	return out;
}

interface Local {
	readonly node: N;
	readonly statement: N;
	/** A static value the component computes from literals alone, written into code that reads it. */
	readonly value?: unknown;
	/** A function the component declares (a handler, a useCallback). */
	readonly fn?: N;
}

/** A state given as it is to a library part's controlled prop beside the callback that sets it to the part's next value. */
interface ControlledPair {
	readonly tag: string;
	readonly part: PartRef;
	readonly prop: string;
	/** Its value's state and its callback's setter, where they name the state. */
	readonly uses: N[];
	readonly change: N;
	/** The part's element in the render, once it is placed; none where convert cannot find it on the page. */
	node?: { events?: Record<string, StateCode> };
	/** The part's own trigger among its children, which opens it without the app's state. */
	trigger?: string;
}

type ElementNode = { -readonly [K in keyof Extract<StateNode, { kind: 'element' }>]: Extract<StateNode, { kind: 'element' }>[K] };

interface Scope {
	readonly mod: Module;
	readonly component: N;
	readonly slots: (StateSlot & { value: unknown })[];
	readonly index: Map<string, number>;
	readonly setters: Map<string, number>;
	readonly dispatchers: Map<string, { slot: number; reducer: string }>;
	readonly locals: Map<string, Local>;
	/** Names whose value the page already shows and keeps (useId). */
	readonly kept: Set<string>;
	readonly props: Set<string>;
	/** Each state's declarator, by slot. */
	readonly declarators: Map<number, N>;
	/** Each state a part's controlled prop takes, with the nodes that name it there (its value's state, its callback's setter). */
	readonly controlled: Map<number, ControlledPair[]>;
	/** Each element found with DOM event handlers, and the handlers' expressions. */
	readonly sites: { readonly node: ElementNode; readonly exprs: readonly N[] }[];
}

const isReference = (n: N, parent: N | undefined) =>
	!(parent?.type === 'MemberExpression' && parent.property === n && !parent.computed) &&
	!(parent?.type === 'Property' && parent.key === n && !parent.computed && !parent.shorthand) &&
	!((parent?.type === 'MethodDefinition' || parent?.type === 'PropertyDefinition') && parent.key === n) &&
	!(parent?.type === 'LabeledStatement' || parent?.type === 'BreakStatement' || parent?.type === 'ContinueStatement');

/** The names declared anywhere inside a node: parameters, variables, functions. */
function declaredInside(node: N): Set<string> {
	const out = new Set<string>();
	walk(node, (n) => {
		if (isFunction(n)) for (const p of n.params as N[]) for (const name of patternNames(p)) out.add(name);
		if ((n.type === 'FunctionDeclaration' || n.type === 'FunctionExpression') && n.id) out.add(n.id.name);
		if (n.type === 'VariableDeclarator') for (const name of patternNames(n.id)) out.add(name);
		if (n.type === 'CatchClause' && n.param) for (const name of patternNames(n.param)) out.add(name);
	});
	return out;
}

/**
 * A node's source as code: each state or computed read is its slot, each setter call an assignment to its slot
 * (`setOpen(!open)` is `open = !open`, an updater `setN((n) => n + 1)` is applied to the slot), each dispatch an
 * assignment of its reducer's answer, a component's static value its literal, TypeScript taken out.
 */
function rewrite(scope: Scope, node: N, outer: ReadonlySet<string> = new Set()): StateCode {
	const shadow = declaredInside(node);
	const isOwn = (name: string) => scope.index.has(name) || scope.setters.has(name) || scope.dispatchers.has(name);
	// A parameter may take a state's name (`(value) => setValue(value)`): inside its function the name is the parameter.
	const params = new Set<string>();
	walk(node, (n) => {
		if (isFunction(n)) for (const p of n.params as N[]) for (const name of patternNames(p)) params.add(name);
	});
	for (const name of shadow) if (isOwn(name) && !params.has(name)) throw new Refused(`declares ${name} again inside its code, the name of its state`);
	const edits: { start: number; end: number; out: StateCode }[] = [];
	const hidden = (ancestors: readonly N[]): Set<string> => {
		const out = new Set(outer);
		for (const a of ancestors) if (isFunction(a)) for (const p of a.params as N[]) for (const name of patternNames(p)) out.add(name);
		return out;
	};
	const inner = (n: N, ancestors: readonly N[]) => rewrite(scope, n, hidden(ancestors));
	// A component's or module's value fixed by literals, written in where the code reads it.
	const literal = (name: string): string | undefined => {
		if (shadow.has(name) || outer.has(name) || scope.index.has(name)) return undefined;
		const local = scope.locals.get(name);
		if (local) return 'value' in local && !local.fn ? (JSON.stringify(local.value) ?? 'undefined') : undefined;
		return scope.props.has(name) ? undefined : moduleLiteral(scope.mod, name);
	};
	walk(node, (n, ancestors) => {
		if (n.type === 'TSTypeAnnotation' || n.type === 'TSTypeParameterInstantiation' || n.type === 'TSTypeParameterDeclaration') {
			edits.push({ start: n.start, end: n.end, out: [] });
			return false;
		}
		if (TS_EXPRESSIONS.has(n.type)) edits.push({ start: n.expression.end, end: n.end, out: [] });
		const off = hidden(ancestors);
		if (isFunction(n) && n !== node) {
			// A function's parameters are its own names, not the state's; its body is rewritten with them hidden.
			for (const p of n.params as N[]) for (const name of patternNames(p)) off.add(name);
		}
		if (n.type === 'CallExpression' && n.callee.type === 'Identifier' && !off.has(n.callee.name)) {
			const slot = scope.setters.get(n.callee.name);
			const arg = (n.arguments as N[])[0];
			if (slot !== undefined) {
				const v = arg ? inner(arg, [...ancestors, n]) : ['undefined'];
				edits.push({ start: n.start, end: n.end, out: isFunction(unwrap(arg)) ? ['(', slot, ' = (', ...v, ')(', slot, '))'] : ['(', slot, ' = ', ...v, ')'] });
				return false;
			}
			const d = scope.dispatchers.get(n.callee.name);
			if (d) {
				edits.push({ start: n.start, end: n.end, out: ['(', d.slot, ` = ${d.reducer}(`, d.slot, ', ', ...(arg ? inner(arg, [...ancestors, n]) : ['undefined']), '))'] });
				return false;
			}
		}
		const parent = ancestors.at(-1);
		if (n.type === 'Property' && n.shorthand && n.value.type === 'Identifier') {
			const name = n.value.name;
			if (off.has(name)) return false;
			const slot = scope.index.get(name);
			const value = literal(name);
			if (slot !== undefined) edits.push({ start: n.start, end: n.end, out: [`${name}: `, slot] });
			else if (value !== undefined) edits.push({ start: n.start, end: n.end, out: [`${name}: ${value}`] });
			return false;
		}
		if (n.type !== 'Identifier' || !isReference(n, parent) || off.has(n.name)) return;
		const slot = scope.index.get(n.name);
		const setter = scope.setters.get(n.name);
		const d = scope.dispatchers.get(n.name);
		const value = literal(n.name);
		if (slot !== undefined) edits.push({ start: n.start, end: n.end, out: [slot] });
		else if (setter !== undefined) edits.push({ start: n.start, end: n.end, out: ['((v) => (', setter, ' = typeof v === "function" ? v(', setter, ') : v))'] });
		else if (d) edits.push({ start: n.start, end: n.end, out: ['((a) => (', d.slot, ` = ${d.reducer}(`, d.slot, ', a)))'] });
		else if (value !== undefined) edits.push({ start: n.start, end: n.end, out: [value] });
	});
	const out: (string | number)[] = [];
	let at = node.start;
	for (const e of edits.sort((a, b) => a.start - b.start)) {
		if (e.start < at) continue;
		out.push(scope.mod.text.slice(at, e.start), ...e.out);
		at = e.end;
	}
	out.push(scope.mod.text.slice(at, node.end));
	return tidy(out);
}

/** A module-level const fixed by literals (plain data), as a literal; undefined for anything else. */
function moduleLiteral(mod: Module, name: string): string | undefined {
	const bound = mod.bindings.get(name);
	if (!bound || isFunction(bound) || mod.imports.has(name)) return undefined;
	const v = staticValue({ type: 'Identifier', name, start: 0, end: 0 }, mod);
	if (!known(v) || typeof v === 'function') return undefined;
	const text = v === undefined ? 'undefined' : JSON.stringify(v);
	return text !== undefined && plain(v) ? text : undefined;
}

/** Whether a value is plain data: what JSON writes back as it is. */
function plain(v: unknown): boolean {
	if (v === null || ['string', 'number', 'boolean', 'undefined'].includes(typeof v)) return typeof v !== 'number' || Number.isFinite(v);
	if (Array.isArray(v)) return v.every(plain);
	return typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype && Object.values(v as object).every(plain);
}

const reads = (scope: Scope, node: N) => [...freeNames(node)].some((n) => scope.index.has(n) || scope.setters.has(n) || scope.dispatchers.has(n) || writesThrough(scope, n, new Set()));

/** Whether a component's own function reads or writes its state, through the functions it calls. */
function writesThrough(scope: Scope, name: string, seen: Set<string>): boolean {
	const local = scope.locals.get(name);
	if (!local?.fn || seen.has(name)) return false;
	seen.add(name);
	return [...freeNames(local.fn)].some((n) => scope.index.has(n) || scope.setters.has(n) || scope.dispatchers.has(n) || writesThrough(scope, n, seen));
}

/** Refuses an expression that reads what the page would not have: a prop, a kept value, a hook, a name it cannot place. */
function checkNames(scope: Scope, node: N, allowed: ReadonlySet<string> = new Set()): void {
	for (const name of freeNames(node)) {
		if (scope.index.has(name) || scope.setters.has(name) || scope.dispatchers.has(name) || allowed.has(name) || PURE.has(name)) continue;
		const local = scope.locals.get(name);
		if (local && 'value' in local && !local.fn) continue;
		if (!local && !scope.props.has(name) && moduleLiteral(scope.mod, name) !== undefined) continue;
		if (scope.props.has(name)) throw new Refused(`its state's markup reads the prop ${name}`);
		if (scope.kept.has(name)) throw new Refused(`its state's markup reads ${name}, a value its hook gives`);
		if (local) throw new Refused(`its state's markup reads ${name}, which the component computes from more than its state`);
		throw new Refused(`its state's markup reads ${name}, which the page has no value for`);
	}
}

/** Runs a code at load: the value the page shows for it. */
function evaluate(scope: Scope, code: StateCode): unknown {
	const params = scope.slots.map((_, i) => `mmSlot${i}`);
	try {
		return new Function(...params, `"use strict"; return (${join(code, params)});`)(...scope.slots.map((s) => s.value));
	} catch (error) {
		throw new Refused(`its markup's value at load could not be worked out (${(error as Error).message.slice(0, 60)})`);
	}
}

const isJsx = (n: N | undefined) => n?.type === 'JSXElement' || n?.type === 'JSXFragment';
const isEmpty = (n: N | undefined) => !n || (n.type === 'Literal' && (n.value === null || n.value === false || n.value === '')) || (n.type === 'Identifier' && n.name === 'undefined');

/** What a JSX tag is named in its module. */
const tagName = (n: N): string => (n.type === 'JSXIdentifier' ? n.name : n.type === 'JSXMemberExpression' ? `${tagName(n.object)}.${n.property.name}` : '?');

/**
 * The components of the app that keep React state, read from the source: their state and the values derived from it,
 * and what they render, so convert finds each instance on the page and writes it on Markless state: state() for each
 * state, computed() for each derived value, an @if for a conditional render, a keyed @for for a list, and the
 * handlers that set it with their setter calls as assignments.
 */
export class StateComponents {
	private readonly composer: Compositions;
	private readonly carrier: Handlers;

	constructor(composer: Compositions, carrier: Handlers) {
		this.composer = composer;
		this.carrier = carrier;
	}

	async sites(mod: Module): Promise<Omit<StateComponent, 'routes'>[]> {
		if (WRAPPERS.test(mod.file)) return [];
		const out: Omit<StateComponent, 'routes'>[] = [];
		for (const { name, fn } of components(mod)) {
			const body = fn.body?.type === 'BlockStatement' ? (fn.body.body as N[]) : [];
			const hooks = body.flatMap((st) => (st.type === 'VariableDeclaration' ? (st.declarations as N[]).map((d) => hookName(d.init)) : []));
			if (!hooks.some((h) => h && STATE.has(h))) continue;
			const base = { file: mod.file, line: mod.line(fn.start), component: name };
			const effects: { line: number; reason: string }[] = [];
			try {
				const fact = await this.component(mod, fn, body, effects);
				out.push({ ...base, ...fact, ...(effects.length ? { effects } : {}) });
			} catch (error) {
				if (!(error instanceof Refused)) throw error;
				out.push({ ...base, refused: error.message, ...(effects.length ? { effects } : {}) });
			}
		}
		return out;
	}

	private async component(mod: Module, fn: N, body: N[], effects: { line: number; reason: string }[]): Promise<Pick<StateComponent, 'slots' | 'nodes' | 'partState'>> {
		const props = new Set((fn.params as N[]).flatMap((p) => patternNames(p)));
		const scope: Scope = { mod, component: fn, slots: [], index: new Map(), setters: new Map(), dispatchers: new Map(), locals: new Map(), kept: new Set(), props, declarators: new Map(), controlled: new Map(), sites: [] };
		let returned: N | undefined;
		for (const [i, st] of body.entries()) {
			if (st.type === 'ReturnStatement') {
				if (i !== body.length - 1) throw new Refused('returns before its last statement');
				returned = unwrap(st.argument);
				continue;
			}
			if (st.type === 'FunctionDeclaration' && st.id) {
				scope.locals.set(st.id.name, { node: st, statement: st, fn: st });
				continue;
			}
			if (st.type === 'ExpressionStatement') {
				const hook = hookName(st.expression);
				if (hook && EFFECTS.has(hook)) {
					effects.push({ line: mod.line(st.start), reason: `${hook} runs after React renders; Markless has no effects, and this one is not a handler or an attach behaviour` });
					throw new Refused(`runs ${hook} (line ${mod.line(st.start)}), which has no Markless counterpart`);
				}
				throw new Refused(hook ? `calls ${hook} at render, which convert does not port` : `runs a statement at render (line ${mod.line(st.start)})`);
			}
			if (st.type !== 'VariableDeclaration') throw new Refused(`runs a ${st.type} at render (line ${mod.line(st.start)})`);
			for (const d of st.declarations as N[]) await this.declare(scope, st, d);
		}
		if (!returned || !isJsx(returned)) throw new Refused('renders something other than JSX');
		const nodes = await this.nodes(scope, returned.type === 'JSXFragment' ? (returned.children as N[]) : [returned]);
		const partState: { state: string; part: string; prop: string }[] = [];
		const mirrored = new Set<number>();
		for (const [slot, pairs] of scope.controlled) {
			const { name, value } = scope.slots[slot]!;
			const pair = pairs[0]!;
			const { tag, part, prop, uses } = pair;
			if (pairs.length > 1) throw new Refused(`passes its state ${name} to the ${prop} of more than one part`);
			const own = scope.declarators.get(slot)!;
			const setters = [...scope.setters].filter(([, i]) => i === slot).map(([setter]) => setter);
			const elsewhere = (names: readonly string[]) => names.some((n) => references(fn.body, n, own).some((r) => !uses.includes(r)));
			if (elsewhere(setters)) {
				const followed = followedProp(part.library, part.export, prop);
				const refs = setters.flatMap((setter) => references(fn.body, setter, own).filter((r) => !uses.includes(r)));
				const sitesOf = (r: N) => scope.sites.filter((site) => site.exprs.some((e) => within(r, e) || (e.type === 'Identifier' && within(r, scope.locals.get(e.name)?.fn))));
				if (!followed || refs.some((r) => !sitesOf(r).length)) throw new Refused(`passes its state ${name} to <${tag}>'s ${prop} and sets it elsewhere, which needs <${tag}> to follow it`);
				if (pair.trigger) throw new Refused(`passes its state ${name} to <${tag}>'s ${prop} and sets it elsewhere beside its own <${pair.trigger}>, which its port does not follow yet`);
				// The part follows the state its openers carry and announces its own changes there, as the library calls back.
				for (const site of new Set(refs.flatMap(sitesOf))) {
					site.node.opens = true;
					site.node.bound = { ...site.node.bound, [followed.attribute]: { code: ['(', slot, ') ? "true" : "false"'], initial: attributeText(followed.attribute, Boolean(value)), added: true } };
					site.node.events = { ...site.node.events, [`on${followed.event[0]!.toUpperCase()}${followed.event.slice(1)}`]: tidy(['(mmEvent) => (', ...rewrite(scope, pair.change), ')((mmEvent as CustomEvent).detail)']) };
				}
				continue;
			}
			if (!elsewhere([name])) {
				mirrored.add(slot);
				partState.push({ state: name, part: `${part.library} ${part.export}`, prop });
				continue;
			}
			// Read elsewhere: the state follows the part, its callback run on each change the part's port announces.
			const announced = announcedChange(part.library, part.export, prop);
			if (!announced) throw new Refused(`passes its state ${name} to <${tag}>'s ${prop} and reads it elsewhere, which needs <${tag}> to announce its changes`);
			if (!pair.node) throw new Refused(`its state reaches <${tag}>, which convert cannot find on the page`);
			const first = announced.list && !Array.isArray(value) ? '[0]' : '';
			pair.node.events = { ...pair.node.events, [`on${announced.event[0]!.toUpperCase()}${announced.event.slice(1)}`]: tidy(['(mmEvent) => (', ...rewrite(scope, pair.change), `)((mmEvent as CustomEvent).detail${first})`]) };
		}
		if (!partState.length) return { slots: scope.slots.map(({ name, kind, init }) => ({ name, kind, init })), nodes };
		// The part keeps a mirrored state itself; the others are renumbered past it (nothing but the part's props named it).
		const renumber = new Map<number, number>();
		scope.slots.forEach((_, i) => {
			if (!mirrored.has(i)) renumber.set(i, renumber.size);
		});
		const code = (c: StateCode): StateCode => c.map((x) => (typeof x === 'number' ? renumber.get(x)! : x));
		const slots = scope.slots.filter((_, i) => renumber.has(i)).map(({ name, kind, init }) => ({ name, kind, init: code(init) }));
		return { slots, nodes: nodes.map((n) => renumbered(n, code)), partState };
	}

	private async declare(scope: Scope, st: N, d: N): Promise<void> {
		const { mod } = scope;
		const hook = hookName(d.init);
		const call = unwrap(d.init);
		const args = (call?.arguments ?? []) as N[];
		const add = (slot: StateSlot & { value: unknown }) => {
			scope.index.set(slot.name, scope.slots.length);
			scope.slots.push(slot);
			return scope.slots.length - 1;
		};
		if (hook === 'useState' || hook === 'useReducer') {
			if (d.id.type !== 'ArrayPattern') throw new Refused(`keeps its ${hook} result whole`);
			const [value, set] = d.id.elements as (N | null)[];
			if (value?.type !== 'Identifier') throw new Refused(`destructures the state ${hook} keeps`);
			const initArg = hook === 'useState' ? args[0] : args[1];
			if (hook === 'useReducer' && args[2]) throw new Refused('gives useReducer an init function');
			let initial: unknown = undefined;
			if (initArg) {
				checkNames(scope, initArg);
				initial = evaluate(scope, rewrite(scope, initArg));
				if (hook === 'useState' && typeof initial === 'function') initial = (initial as () => unknown)();
			}
			const literal = initial === undefined ? 'undefined' : JSON.stringify(initial);
			if (literal === undefined || (initial !== undefined && JSON.stringify(JSON.parse(literal)) !== literal) || (typeof initial === 'object' && initial !== null && Object.getPrototypeOf(initial) !== Object.prototype && !Array.isArray(initial))) throw new Refused(`starts ${value.name} at a value that is not plain data`);
			const slot = add({ name: value.name, kind: 'state', init: [literal], value: initial });
			scope.declarators.set(slot, d);
			if (set?.type === 'Identifier') {
				if (hook === 'useState') scope.setters.set(set.name, slot);
				else {
					const reducer = unwrap(args[0]);
					if (reducer?.type !== 'Identifier' || scope.locals.has(reducer.name) || scope.props.has(reducer.name)) throw new Refused('gives useReducer a reducer it does not declare at module level');
					scope.dispatchers.set(set.name, { slot, reducer: reducer.name });
				}
			}
			return;
		}
		if (hook === 'useId') {
			for (const name of patternNames(d.id)) scope.kept.add(name);
			return;
		}
		if (hook === 'useMemo' || hook === 'useCallback') {
			const f = unwrap(args[0]);
			if (!f || !isFunction(f) || d.id.type !== 'Identifier') throw new Refused(`gives ${hook} something other than a function`);
			if (hook === 'useCallback') {
				scope.locals.set(d.id.name, { node: d, statement: st, fn: f });
				return;
			}
			const expr = f.body.type === 'BlockStatement' ? (f.body.body.length === 1 && f.body.body[0].type === 'ReturnStatement' ? unwrap(f.body.body[0].argument) : undefined) : unwrap(f.body);
			if (!expr) throw new Refused('computes a useMemo in statements');
			return this.derive(scope, d.id.name, expr, add);
		}
		if (hook) {
			const imp = mod.imports.get(hook.split('.')[0]!) ?? mod.imports.get(hook);
			const fromPackage = imp && !imp.source.startsWith('.') && !imp.source.startsWith('@/') && imp.source !== 'react';
			throw new Refused(fromPackage ? `calls ${hook} from ${imp!.source}, a library hook convert does not port yet` : hook === 'useRef' ? 'keeps a useRef, which convert does not port yet' : `calls ${hook}, a hook convert does not port yet`);
		}
		if (st.kind !== 'const') throw new Refused(`declares ${patternNames(d.id).join(', ')} with ${st.kind}`);
		const init = unwrap(d.init);
		if (isFunction(init)) {
			if (d.id.type !== 'Identifier') throw new Refused('destructures a function');
			scope.locals.set(d.id.name, { node: d, statement: st, fn: init });
			return;
		}
		// The port mounts a layer in the same place whether the source portals it or not: the tag's choice binds nothing.
		if (d.id.type === 'Identifier' && init && portalChoice(scope, init)) {
			scope.locals.set(d.id.name, { node: d, statement: st });
			return;
		}
		if (d.id.type === 'Identifier' && init && reads(scope, init)) return this.derive(scope, d.id.name, init, add);
		const names = [...freeNames(init ?? d.id)];
		if (d.id.type === 'Identifier' && init && names.every((n) => PURE.has(n) || (scope.locals.get(n) && 'value' in scope.locals.get(n)!) || (!scope.locals.has(n) && !scope.props.has(n) && moduleLiteral(mod, n) !== undefined))) {
			const value = evaluate(scope, rewrite(scope, init));
			scope.locals.set(d.id.name, { node: d, statement: st, value });
			return;
		}
		for (const name of patternNames(d.id)) scope.locals.set(name, { node: d, statement: st });
	}

	/** A value derived from state, computed(): its expression must read state and what the page has alone. */
	private derive(scope: Scope, name: string, expr: N, add: (slot: StateSlot & { value: unknown }) => number): void {
		checkNames(scope, expr);
		const init = rewrite(scope, expr);
		add({ name, kind: 'computed', init, value: evaluate(scope, init) });
	}

	private async nodes(scope: Scope, list: readonly N[]): Promise<StateNode[]> {
		const out: StateNode[] = [];
		for (const c of list) {
			if (c.type === 'JSXText') {
				const value = jsxTextValue(c.value);
				if (value) out.push({ kind: 'text', value });
			} else if (c.type === 'JSXFragment') out.push(...(await this.nodes(scope, c.children as N[])));
			else if (c.type === 'JSXElement') out.push(...((await this.elementless(scope, c)) ?? [await this.element(scope, c)]));
			else if (c.type === 'JSXExpressionContainer') {
				const e = unwrap(c.expression);
				if (!e || e.type === 'JSXEmptyExpression') continue;
				out.push(...(await this.expression(scope, e)));
			}
		}
		return out;
	}

	/** A `{…}` child: markup the page shows as it is when it reads no state, else an @if, a @for or text. */
	private async expression(scope: Scope, e: N): Promise<StateNode[]> {
		if (!reads(scope, e)) {
			const v = staticValue(e, scope.mod);
			if (known(v) && (typeof v === 'string' || typeof v === 'number')) return [{ kind: 'text', value: String(v) }];
			if (isJsx(e)) return this.nodes(scope, [e]);
			return [{ kind: 'opaque' }];
		}
		if (e.type === 'LogicalExpression' && e.operator === '&&' && isJsx(unwrap(e.right))) return [await this.branch(scope, e.left, unwrap(e.right), undefined)];
		if (e.type === 'ConditionalExpression' && (isJsx(unwrap(e.consequent)) || isJsx(unwrap(e.alternate)))) return [await this.branch(scope, e.test, unwrap(e.consequent), unwrap(e.alternate))];
		const map = mapOf(e);
		if (map) return [await this.list(scope, map.list, map.fn)];
		checkNames(scope, e);
		const code = rewrite(scope, e);
		const value = evaluate(scope, code);
		// React renders nothing for null, undefined and booleans; strings and numbers as they are.
		return [{ kind: 'text', value: '', bound: { code: typeof value === 'string' || typeof value === 'number' ? code : ['(', ...code, ') || ""'], initial: childText(value) } }];
	}

	private async branch(scope: Scope, test: N, yes: N | undefined, no: N | undefined): Promise<StateNode> {
		checkNames(scope, test);
		const code = rewrite(scope, test);
		const initial = Boolean(evaluate(scope, code));
		const arm = async (n: N | undefined) => (n && !isEmpty(n) ? (isJsx(n) ? this.nodes(scope, [n]) : this.expression(scope, n)) : []);
		const then = await arm(yes);
		const otherwise = await arm(no);
		const hidden = initial ? no : yes;
		const markup = hidden && !isEmpty(hidden) ? await this.markup(scope, isJsx(hidden) ? hidden : { type: 'JSXExpressionContainer', expression: hidden, start: 0, end: 0 }, new Set()) : undefined;
		return { kind: 'if', test: code, initial, then, else: otherwise, ...(markup ? { markup } : {}) };
	}

	private async list(scope: Scope, list: N, fn: N): Promise<StateNode> {
		checkNames(scope, list);
		const code = rewrite(scope, list);
		const value = evaluate(scope, code);
		if (!Array.isArray(value)) throw new Refused('maps over a state that is not an array at load');
		const [itemParam, indexParam] = fn.params as N[];
		if (itemParam?.type !== 'Identifier' || (indexParam && indexParam.type !== 'Identifier')) throw new Refused('maps with a destructured row');
		const body = fn.body.type === 'BlockStatement' ? (fn.body.body.length === 1 && fn.body.body[0].type === 'ReturnStatement' ? unwrap(fn.body.body[0].argument) : undefined) : unwrap(fn.body);
		if (body?.type !== 'JSXElement') throw new Refused('maps each row to something other than one element');
		const opening = body.openingElement;
		const name = tagName(opening.name);
		if (!/^[a-z]/.test(name)) throw new Refused(`maps each row to <${name}>, which convert cannot render from the source`);
		const allowed = new Set([itemParam.name, ...(indexParam ? [indexParam.name] : [])]);
		const keyAttr = (opening.attributes as N[]).find((a) => a.type === 'JSXAttribute' && a.name.name === 'key');
		const keyExpr = keyAttr?.value?.type === 'JSXExpressionContainer' ? unwrap(keyAttr.value.expression) : undefined;
		if (keyExpr) checkNames(scope, keyExpr, allowed);
		const index = indexParam?.name ?? (keyExpr ? undefined : 'mmIndex');
		return {
			kind: 'for',
			list: code,
			item: itemParam.name,
			...(index ? { index } : {}),
			key: keyExpr ? rewrite(scope, keyExpr) : [index!],
			initial: value.length,
			tag: name,
			markup: await this.markup(scope, body, allowed),
		};
	}

	private async element(scope: Scope, el: N, given: Readonly<Record<string, BoundAttribute>> = {}): Promise<StateNode> {
		const { mod } = scope;
		const opening = el.openingElement;
		const tag = await this.composer.tag(mod, opening.name);
		const name = tagName(opening.name);
		const host = tag.host;
		const slots = host ? [] : await this.composer.slotsOf(mod, el);
		const spreads = await this.composer.spreadsProps(mod, el);
		const wraps = host ?? (tag.part ? undefined : await this.composer.rootHost(mod, el));
		const passesProp = (prop: string) => Boolean(host) || (spreads && (wraps ? DOM_PROPS : PART_DOM_PROPS).test(prop));
		const passesEvent = (prop: string) => (wraps ? DOM_EVENTS.test(prop) : spreads && PART_EVENTS.test(prop) && !CALLBACK_LIBRARIES.has(tag.part?.library ?? ''));
		const attrs: Record<string, string> = {};
		const bound: Record<string, BoundAttribute> = { ...given };
		const events: Record<string, StateCode> = {};
		const handlers: N[] = [];
		const controlled = host ? { attrs: new Set<N>(), pairs: [] } : await this.controlledPairs(scope, opening, name, tag.part);
		for (const a of opening.attributes as N[]) {
			if (controlled.attrs.has(a)) continue;
			if (a.type === 'JSXSpreadAttribute') {
				if (reads(scope, a.argument)) throw new Refused(`spreads its state onto <${name}>`);
				continue;
			}
			if (a.name.type !== 'JSXIdentifier') continue;
			const prop: string = a.name.name;
			const expr = a.value?.type === 'JSXExpressionContainer' ? unwrap(a.value.expression) : undefined;
			if (prop === 'key' && expr && reads(scope, expr)) throw new Refused(`remounts <${name}> when its state changes its key, which convert does not port yet`);
			if (prop === 'key' || prop === 'ref' || prop === 'children') continue;
			if (/^on[A-Z]/.test(prop)) {
				if (!expr || !reads(scope, expr)) continue;
				if (!DOM_EVENTS.test(prop)) throw new Refused(`sets its state from <${name}>'s ${prop}, a callback no DOM event fires`);
				if (!passesEvent(prop)) throw new Refused(`sets its state from <${name}>'s ${prop}, which <${name}> answers itself, not as the DOM event`);
				const event = prop === 'onChange' && wraps && TEXT_INPUT.test(wraps) ? 'onInput' : prop === 'onDoubleClick' ? 'onDblClick' : prop;
				events[event] = await this.handler(scope, expr);
				handlers.push(expr);
				continue;
			}
			const dom = domName(prop);
			if (!passesProp(prop)) {
				if (!expr || !reads(scope, expr)) continue;
				const config = tag.part && configAttribute(tag.part.library, tag.part.export, prop);
				if (!config || config.on) throw new Refused(`passes its state to <${name}>'s ${prop}, a prop convert does not port yet`);
				bound[config.attribute] = configBound(scope, config.attribute, expr);
				continue;
			}
			if (prop === 'className' || prop === 'style') {
				if (expr && reads(scope, expr)) {
					if (!host || prop === 'style') throw new Refused(`its ${prop} on <${name}> reads state`);
					checkNames(scope, expr);
					const code = rewrite(scope, expr);
					bound[dom] = { code, initial: attributeText(dom, evaluate(scope, code)) };
				}
				continue;
			}
			if (!a.value) attrs[dom] = /^(aria|data)-/.test(dom) ? 'true' : '';
			else if (a.value.type === 'Literal') attrs[dom] = String(a.value.value);
			else if (expr && reads(scope, expr)) {
				checkNames(scope, expr);
				const code = rewrite(scope, expr);
				const value = evaluate(scope, code);
				// React writes a boolean aria-/data- value as its word, where Markless leaves false out.
				bound[dom] = { code: /^(aria|data)-/.test(dom) && typeof value === 'boolean' ? ['(', ...code, ') ? "true" : "false"'] : code, initial: attributeText(dom, value) };
			} else if (expr) {
				const v = staticValue(expr, mod);
				const text = typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' ? attributeText(dom, v) : null;
				if (text !== null) attrs[dom] = text;
			}
		}
		const kids = (el.children as N[]).filter((c) => !(c.type === 'JSXText' && !jsxTextValue(c.value)));
		const stateInside = kids.some((c) => (c.type === 'JSXExpressionContainer' ? reads(scope, c.expression) : c.type !== 'JSXText' && jsxReads(scope, c)));
		if (tag.part && !host && followsAny(tag.part.library, tag.part.export)) {
			// A Root that renders no element: its content is a layer, what the page shows of it the wrapper's own.
			if (stateInside) throw new Refused(`its state reaches inside <${name}>, whose content is a layer convert does not search yet`);
			if (Object.keys(bound).length || Object.keys(events).length) throw new Refused(`its state reaches <${name}>, which convert cannot find on the page`);
			const trigger = await this.ownTrigger(scope, el, tag.part);
			for (const pair of controlled.pairs) if (trigger) pair.trigger = trigger;
			return { kind: 'opaque' };
		}
		const node: ElementNode = { kind: 'element', attrs, ...(host ? { tag: host } : {}), ...(slots.length ? { slots } : {}) };
		if (Object.keys(bound).length) node.bound = bound;
		if (Object.keys(events).length) node.events = events;
		if (handlers.length) scope.sites.push({ node, exprs: handlers });
		if (!host && !slots.length) {
			if (stateInside || node.bound || node.events) throw new Refused(`its state reaches <${name}>, which convert cannot find on the page`);
			return { kind: 'opaque' };
		}
		for (const pair of controlled.pairs) pair.node = node;
		const passes = host ? true : await this.composer.passesChildren(mod, el);
		if (!passes && !stateInside) return node;
		const children = await this.nodes(scope, el.children as N[]);
		const texts = children.filter((c): c is Extract<StateNode, { kind: 'text' }> => c.kind === 'text');
		if (texts.length === children.length && texts.some((c) => c.bound)) {
			node.text = { code: tidy(texts.flatMap((c, i) => [...(i ? [' + '] : texts.length > 1 ? ['"" + '] : []), ...(c.bound ? (texts.length > 1 ? ['(', ...c.bound.code, ')'] : c.bound.code) : [JSON.stringify(c.value)])])), initial: texts.map((c) => c.bound?.initial ?? c.value).join('') };
			return node;
		}
		if (texts.some((c) => c.bound)) throw new Refused(`mixes text that reads state with elements in <${name}>`);
		if (children.length === 1 && children[0]!.kind === 'opaque' && !stateInside) return node;
		node.children = children;
		if (!passes) node.loose = true;
		return node;
	}

	/** The tag of a part's own Trigger among an element's descendants (`<DialogTrigger>` in a Dialog), if it has one. */
	private async ownTrigger(scope: Scope, el: N, part: PartRef): Promise<string | undefined> {
		const trigger = `${part.export.split('.')[0]}.Trigger`;
		const openings: N[] = [];
		walk(el, (n) => {
			if (n !== el.openingElement && n.type === 'JSXOpeningElement') openings.push(n);
		});
		for (const o of openings) {
			const found = (await this.composer.tag(scope.mod, o.name)).part;
			if (found?.library === part.library && found.export === trigger) return tagName(o.name);
		}
		return undefined;
	}

	/**
	 * A part that renders no element (a Radix menu's Root) given state in a config prop its port reads on a child part's
	 * element (`dir` on the trigger): its children in its place, that child with the attribute bound, the rest (its
	 * portal, whose content is a layer) as the page has them. Undefined for any other element.
	 */
	private async elementless(scope: Scope, el: N): Promise<StateNode[] | undefined> {
		const opening = el.openingElement;
		const { part, component } = await this.composer.tag(scope.mod, opening.name);
		if (!part || component) return undefined;
		const name = tagName(opening.name);
		const given = new Map<string, { props: string[]; bound: Record<string, BoundAttribute> }>();
		for (const a of opening.attributes as N[]) {
			if (a.type !== 'JSXAttribute' || a.name.type !== 'JSXIdentifier') continue;
			const expr = a.value?.type === 'JSXExpressionContainer' ? unwrap(a.value.expression) : undefined;
			const config = configAttribute(part.library, part.export, a.name.name);
			if (!config?.on || !expr || !reads(scope, expr)) continue;
			const at = given.get(config.on) ?? given.set(config.on, { props: [], bound: {} }).get(config.on)!;
			at.props.push(a.name.name);
			at.bound[config.attribute] = configBound(scope, config.attribute, expr);
		}
		if (!given.size) return undefined;
		const out: StateNode[] = [];
		for (const c of el.children as N[]) {
			if (c.type === 'JSXText' && !jsxTextValue(c.value)) continue;
			const child = c.type === 'JSXElement' ? (await this.composer.tag(scope.mod, c.openingElement.name)).part : undefined;
			const placed = child?.library === part.library ? given.get(child.export) : undefined;
			if (placed) {
				out.push(await this.element(scope, c, placed.bound));
				given.delete(child!.export);
			} else if (c.type === 'JSXExpressionContainer' ? reads(scope, c.expression) : jsxReads(scope, c)) throw new Refused(`its state reaches <${name}>'s children, which convert cannot find on the page`);
			else out.push({ kind: 'opaque' });
		}
		const [unplaced] = given;
		if (unplaced) throw new Refused(`passes its state to <${name}>'s ${unplaced[1].props.join(', ')}, which its port reads on <${unplaced[0]}>, not a child of it here`);
		return out;
	}

	/**
	 * A library part's controlled props given a state as it is (`open={open}`, `checked={on ?? false}`) beside the
	 * callback that sets it to the part's next value (`onOpenChange={setOpen}`, `(v) => setOpen(v)`): recorded for the
	 * component to decide whether the part keeps that state itself; the attributes it takes.
	 */
	private async controlledPairs(scope: Scope, opening: N, name: string, part: PartRef | undefined): Promise<{ attrs: Set<N>; pairs: ControlledPair[] }> {
		const out = new Set<N>();
		const found: ControlledPair[] = [];
		const props = part && controlledProps(part.library);
		if (!props) return { attrs: out, pairs: found };
		const attrs = new Map((opening.attributes as N[]).filter((a) => a.type === 'JSXAttribute' && a.name.type === 'JSXIdentifier').map((a) => [a.name.name as string, a]));
		const exprOf = (a: N | undefined) => (a?.value?.type === 'JSXExpressionContainer' ? unwrap(a.value.expression) : undefined);
		for (const [prop, callback] of Object.entries(props)) {
			const value = exprOf(attrs.get(prop));
			const change = exprOf(attrs.get(callback));
			if (!value || !change) continue;
			// `on ?? false`: the part's callback never gives a nullish value, so a state that starts set is shown as it is.
			const read = value.type === 'LogicalExpression' && value.operator === '??' && unwrap(value.right)?.type === 'Literal' ? unwrap(value.left) : value;
			const slot = read?.type === 'Identifier' ? scope.index.get(read.name) : undefined;
			if (slot === undefined || scope.slots[slot]!.kind !== 'state' || (read !== value && scope.slots[slot]!.value == null)) continue;
			const setter = setterCall(change, (n) => scope.setters.get(n) === slot);
			if (!setter || !(await this.composer.passesOn(scope.mod, opening.name, [prop, callback]))) continue;
			const pairs = scope.controlled.get(slot) ?? scope.controlled.set(slot, []).get(slot)!;
			const pair: ControlledPair = { tag: name, part, prop, uses: [read!, setter], change };
			pairs.push(pair);
			found.push(pair);
			out.add(attrs.get(prop)!).add(attrs.get(callback)!);
		}
		return { attrs: out, pairs: found };
	}

	/** A handler that reads or sets state: its setter calls as assignments, the component functions it calls inside it. */
	private async handler(scope: Scope, expr: N): Promise<StateCode> {
		const fn = expr.type === 'Identifier' ? scope.locals.get(expr.name)?.fn : isFunction(expr) ? expr : undefined;
		if (!fn && expr.type !== 'Identifier') throw new Refused('gives a handler that is computed');
		if (!fn && !scope.setters.has(expr.name) && !scope.dispatchers.has(expr.name)) throw new Refused(`gives the handler ${expr.name}, which it does not declare`);
		const declarations: StateCode[] = [];
		const module = new Set<string>();
		const seen = new Set<string>();
		const need = (node: N) => {
			for (const name of freeNames(node)) {
				const d = scope.dispatchers.get(name);
				if (d) module.add(d.reducer);
				if (scope.index.has(name) || scope.setters.has(name) || d || GLOBALS.has(name) || seen.has(name)) continue;
				seen.add(name);
				const local = scope.locals.get(name);
				if (scope.props.has(name)) throw new Refused(`its handler reads the prop ${name}`);
				if (scope.kept.has(name)) throw new Refused(`its handler reads ${name}, a value its hook gives`);
				if (local?.fn) {
					need(local.fn);
					declarations.push(local.fn.type === 'FunctionDeclaration' ? rewrite(scope, local.fn) : tidy([`const ${name} = `, ...rewrite(scope, local.fn), ';']));
				} else if (local && 'value' in local) continue;
				else if (local) {
					if (reads(scope, local.node.init)) continue;
					need(local.node.init);
					declarations.push(tidy(['const ', ...rewrite(scope, local.node), ';']));
				} else module.add(name);
			}
		};
		need(expr);
		const carried = await this.carrier.carryModuleNames(scope.mod, module);
		const calls = Object.entries(carried.calls);
		if (calls.length) throw new Refused(`its handler calls ${calls.map(([, c]) => `${c.from}'s ${c.imported}`).join(', ')}, which a state handler does not port yet`);
		const cancels = fn && fn.params.length ? cancelOf(fn) : undefined;
		const own = expr.type === 'Identifier' && scope.locals.get(expr.name)?.fn ? [expr.name] : rewrite(scope, expr);
		if (!declarations.length && !carried.declarations.length && !cancels) return own;
		return tidy(['(mmEvent) => {', ...(cancels ? [' mmEvent.preventDefault();'] : []), '\n', ...carried.declarations.map((d) => `${d}\n`), ...declarations.flatMap((d) => [...d, '\n']), 'return (', ...own, ')(mmEvent);\n}']);
	}

	/** An arm or a row the page does not show at load, as tsrx written from the source: host elements, text and state. */
	private async markup(scope: Scope, node: N, allowed: ReadonlySet<string>): Promise<StateCode> {
		const out: (string | number)[] = [];
		const emit = async (n: N): Promise<void> => {
			if (n.type === 'JSXFragment') {
				for (const c of n.children as N[]) await emit(c);
				return;
			}
			if (n.type === 'JSXText') {
				const t = jsxTextValue(n.value);
				if (t) out.push(/[{}<>@&]/.test(t) ? `{${JSON.stringify(t)}}` : t);
				return;
			}
			if (n.type === 'JSXExpressionContainer') {
				const e = unwrap(n.expression);
				if (!e || e.type === 'JSXEmptyExpression') return;
				if (isJsx(e)) return emit(e);
				if (e.type === 'LogicalExpression' && e.operator === '&&' && isJsx(unwrap(e.right))) {
					checkNames(scope, e.left, allowed);
					out.push('@if (', ...rewrite(scope, e.left), ') { <>');
					await emit(unwrap(e.right)!);
					out.push('</> }');
					return;
				}
				if (e.type === 'ConditionalExpression' && (isJsx(unwrap(e.consequent)) || isJsx(unwrap(e.alternate)))) {
					checkNames(scope, e.test, allowed);
					out.push('@if (', ...rewrite(scope, e.test), ') { <>');
					if (!isEmpty(unwrap(e.consequent))) await emit({ type: 'JSXExpressionContainer', expression: e.consequent, start: 0, end: 0 });
					out.push('</> } @else { <>');
					if (!isEmpty(unwrap(e.alternate))) await emit({ type: 'JSXExpressionContainer', expression: e.alternate, start: 0, end: 0 });
					out.push('</> }');
					return;
				}
				checkNames(scope, e, allowed);
				out.push('{', ...rewrite(scope, e), '}');
				return;
			}
			if (n.type !== 'JSXElement') throw new Refused(`renders a ${n.type} where the page shows nothing at load`);
			const opening = n.openingElement;
			const name = tagName(opening.name);
			if (!/^[a-z]/.test(name)) throw new Refused(`renders <${name}> where the page shows nothing at load, which convert cannot render from the source`);
			out.push(`<${name}`);
			for (const a of opening.attributes as N[]) {
				if (a.type === 'JSXSpreadAttribute') throw new Refused(`spreads props onto a <${name}> the page shows nothing of at load`);
				const prop: string = a.name.type === 'JSXIdentifier' ? a.name.name : '';
				if (!prop || prop === 'key' || prop === 'ref') continue;
				const expr = a.value?.type === 'JSXExpressionContainer' ? unwrap(a.value.expression) : undefined;
				if (/^on[A-Z]/.test(prop)) {
					if (!expr) continue;
					if (allowed.size && [...freeNames(expr)].some((x) => allowed.has(x))) throw new Refused(`a row's handler reads the row, which convert does not port yet`);
					out.push(` ${prop === 'onChange' && TEXT_INPUT.test(name) ? 'onInput' : prop === 'onDoubleClick' ? 'onDblClick' : prop}={`, ...(await this.handler(scope, expr)), '}');
					continue;
				}
				if (prop === 'style' && expr) throw new Refused(`gives a <${name}> the page shows nothing of at load a style object`);
				const dom = domName(prop);
				if (!a.value) out.push(` ${dom}${/^(aria|data)-/.test(dom) ? '="true"' : ''}`);
				else if (a.value.type === 'Literal') out.push(` ${dom}=${JSON.stringify(String(a.value.value))}`);
				else if (expr) {
					checkNames(scope, expr, allowed);
					const code = rewrite(scope, expr);
					out.push(` ${dom}={`, ...code, '}');
				}
			}
			if (VOID.has(name)) {
				out.push(' />');
				return;
			}
			out.push('>');
			for (const c of n.children as N[]) await emit(c);
			out.push(`</${name}>`);
		};
		await emit(node);
		return tidy(out);
	}
}

/** `on ? Menu.Portal : React.Fragment`: a tag state picks between a library's Portal and React's Fragment. */
function portalChoice(scope: Scope, init: N): boolean {
	if (init.type !== 'ConditionalExpression' || !reads(scope, init.test)) return false;
	const named = (n: N | undefined) => {
		const e = unwrap(n);
		const root = e?.type === 'MemberExpression' && !e.computed && e.object.type === 'Identifier' ? e.object.name : e?.type === 'Identifier' ? e.name : undefined;
		const imp = root ? scope.mod.imports.get(root) : undefined;
		if (!imp || imp.source.startsWith('.')) return undefined;
		const last = e!.type === 'MemberExpression' ? e!.property.name : imp.imported;
		return imp.source === 'react' ? (last === 'Fragment' ? 'fragment' : undefined) : last === 'Portal' ? 'portal' : undefined;
	};
	const sides = [named(init.consequent), named(init.alternate)];
	if (!sides.includes('portal') || sides.includes(undefined)) return false;
	checkNames(scope, init.test);
	return true;
}

/** A config prop's value bound to the attribute its port reads: a data-mm- one is the port's own, which the page lacks. */
function configBound(scope: Scope, attribute: string, expr: N): BoundAttribute {
	checkNames(scope, expr);
	const code = rewrite(scope, expr);
	const value = evaluate(scope, code);
	return { code: /^(aria|data)-/.test(attribute) && typeof value === 'boolean' ? ['(', ...code, ') ? "true" : "false"'] : code, initial: attributeText(attribute, value), ...(/^data-mm-/.test(attribute) ? { added: true as const } : {}) };
}

/** The setter a callback is or calls with its one parameter alone (`setOpen`, `(v) => setOpen(v)`, `(v) => { setOpen(v) }`): its name's node. */
function setterCall(fn: N, isSetter: (name: string) => boolean): N | undefined {
	if (fn.type === 'Identifier') return isSetter(fn.name) ? fn : undefined;
	if (!isFunction(fn) || fn.params.length !== 1 || fn.params[0].type !== 'Identifier') return undefined;
	const param: string = fn.params[0].name;
	const body = fn.body.type === 'BlockStatement' ? (fn.body.body.length === 1 && fn.body.body[0].type === 'ExpressionStatement' ? unwrap(fn.body.body[0].expression) : undefined) : unwrap(fn.body);
	const args = (body?.arguments ?? []) as N[];
	const arg = unwrap(args[0]);
	return body?.type === 'CallExpression' && body.callee.type === 'Identifier' && isSetter(body.callee.name) && args.length === 1 && arg?.type === 'Identifier' && arg.name === param ? body.callee : undefined;
}

const within = (n: N, outer: N | undefined) => Boolean(outer) && n.start >= outer!.start && n.end <= outer!.end;

/** The nodes in a component's body that read `name` as its own binding: not a parameter or a declaration of the same name, nor `own`'s declaration of it. */
function references(body: N, name: string, own: N): N[] {
	const out: N[] = [];
	walk(body, (n, ancestors) => {
		if (n.type !== 'Identifier' || n.name !== name || !isReference(n, ancestors.at(-1))) return;
		const inside = (x: N) => n.start >= x.start && n.end <= x.end;
		if (inside(own.id)) return;
		if (ancestors.some((a) => isFunction(a) && (a.params as N[]).some((p) => inside(p) || patternNames(p).includes(name)))) return;
		out.push(n);
	});
	return out;
}

/** A node with each state code's slot numbers mapped. */
function renumbered(node: StateNode, code: (c: StateCode) => StateCode): StateNode {
	const bound = (b: BoundAttribute): BoundAttribute => ({ ...b, code: code(b.code) });
	const each = (list: readonly StateNode[]) => list.map((n) => renumbered(n, code));
	switch (node.kind) {
		case 'element':
			return {
				...node,
				...(node.bound ? { bound: Object.fromEntries(Object.entries(node.bound).map(([k, b]) => [k, bound(b)])) } : {}),
				...(node.events ? { events: Object.fromEntries(Object.entries(node.events).map(([k, c]) => [k, code(c)])) } : {}),
				...(node.text ? { text: bound(node.text) } : {}),
				...(node.children ? { children: each(node.children) } : {}),
			};
		case 'text':
			return node.bound ? { ...node, bound: bound(node.bound) } : node;
		case 'opaque':
			return node;
		case 'if':
			return { ...node, test: code(node.test), then: each(node.then), else: each(node.else), ...(node.markup ? { markup: code(node.markup) } : {}) };
		case 'for':
			return { ...node, list: code(node.list), key: code(node.key), markup: code(node.markup) };
	}
}

function jsxReads(scope: Scope, n: N): boolean {
	let hit = false;
	walk(n, (x) => {
		if (hit) return false;
		if (x.type === 'JSXExpressionContainer' && x.expression.type !== 'JSXEmptyExpression' && reads(scope, x.expression)) hit = true;
	});
	return hit;
}

/** `list.map((item) => <li … />)`: the list and the row function. */
function mapOf(e: N): { list: N; fn: N } | undefined {
	if (e.type !== 'CallExpression' || e.callee.type !== 'MemberExpression' || e.callee.computed || e.callee.property.name !== 'map') return undefined;
	const fn = unwrap((e.arguments as N[])[0]);
	return isFunction(fn) ? { list: e.callee.object, fn: fn! } : undefined;
}

/** The components a module declares: capitalised functions, as declarations or as consts. */
function components(mod: Module): { name: string; fn: N }[] {
	const out: { name: string; fn: N }[] = [];
	for (const raw of mod.program.body as N[]) {
		const st = (raw.type === 'ExportNamedDeclaration' || raw.type === 'ExportDefaultDeclaration') && raw.declaration ? raw.declaration : raw;
		if (st.type === 'FunctionDeclaration' && /^[A-Z]/.test(st.id?.name ?? '')) out.push({ name: st.id.name, fn: st });
		if (st.type === 'VariableDeclaration')
			for (const d of st.declarations as N[]) {
				const init = unwrap(d.init);
				if (d.id.type === 'Identifier' && /^[A-Z]/.test(d.id.name) && isFunction(init)) out.push({ name: d.id.name, fn: init! });
			}
	}
	return out;
}
