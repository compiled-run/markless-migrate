import { openProject, resolveImport, isTestFile, isConfigFile, type Project } from '../source/files.ts';
import { isFunction, keyName, memberName, parseModule, patternNames, unwrap, walk, type Module, type N } from '../source/js.ts';

/** What a handler does, read from its source: whether the port must answer it with more than a library part. */
export type HandlerClass = 'effect' | 'mirror' | 'noop';

/** One element the original's source wires to a handler, or a library part that answers the press itself (a Close). */
export interface HandlerSite {
	readonly file: string;
	readonly line: number;
	/** The JSX element as written (`DropdownMenuItem`, `button`). */
	readonly element: string;
	/** The handler props (`onClick`), or `part` for a library part that acts on its own press. */
	readonly props: readonly string[];
	/** `app` handlers are the site's own code; a `part` is library behaviour, answered by the library's port. */
	readonly kind: 'app' | 'part';
	readonly handler: HandlerClass;
	/** The tag its element renders, when it is one (`input`), which decides what `onChange` hears. */
	readonly tag?: string;
	/** How it is found in a rendered page, best first: itself, then elements inside it and beside it. */
	readonly anchors: readonly Anchor[];
	/** `file#Component` of the function that renders it. */
	readonly in?: string;
	/** Words the component shows around it: the port element it is found as must sit among most of them. */
	readonly context: readonly string[];
}

/** An element of the source as a rendered page shows it: data-slot (or tag), literal attributes, static text. */
export interface Anchor {
	readonly slot?: string;
	readonly tag?: string;
	readonly attrs: Readonly<Record<string, string>>;
	readonly text: string;
	/**
	 * The element itself, an element inside it (a Select's trigger), or one beside it (the trigger of the menu a radio
	 * group sits in), when the element itself renders nothing or shows nothing to find it by.
	 */
	readonly anchor: 'self' | 'inside' | 'near';
}

const SOURCE = /\.(jsx|tsx)$/;
// Wrapper modules of a component kit (shadcn's ui/): their handlers are the library's own behaviour, ported by its parts.
const WRAPPERS = /(^|\/)ui(-[a-z]+)?\/[^/]+\.[jt]sx$/;
const CONTEXT_WORDS = 12;
const IDENTIFYING = ['placeholder', 'aria-label', 'title', 'name', 'id', 'href', 'role', 'data-name', 'htmlFor'];
const HANDLER = /^on[A-Z][A-Za-z]*$/;
// Library parts whose own press does something (closes, opens, chooses): answered by the library's port alone.
const ACTING_PART = /(Close|Trigger|Cancel|^AlertDialogAction|MenuItem|CheckboxItem|RadioItem|SelectItem|ComboboxItem|ToggleGroupItem|CarouselNext|CarouselPrevious)$/;
const POPUP_ROOT = /^(\w*\.)?(Picker|Select|DropdownMenu|ContextMenu|Popover|Dialog|AlertDialog|Drawer|Sheet|Combobox|Menu|Menubar|HoverCard|Collapsible)(\.Root|Root)?$/;
// Layout parts named like acting ones (a sidebar's menu item is an <li>).
const LAYOUT_PART = /^(SidebarMenu|NavigationMenuItem$)/;
const NOOP_CALLS = /^(\w+\.(preventDefault|stopPropagation)|console\.\w+)$/;

interface Scan {
	readonly project: Project;
	readonly modules: Map<string, Module | undefined>;
	readonly slots: Map<string, { slot?: string; tag?: string } | null>;
}

async function moduleOf(scan: Scan, file: string): Promise<Module | undefined> {
	if (!scan.modules.has(file)) {
		const text = await scan.project.read(file);
		scan.modules.set(file, text ? parseModule(file, text) : undefined);
	}
	return scan.modules.get(file);
}

const jsxName = (n: N | undefined): string | undefined => {
	if (!n) return undefined;
	if (n.type === 'JSXIdentifier') return n.name;
	if (n.type === 'JSXMemberExpression') return `${jsxName(n.object)}.${n.property.name}`;
	if (n.type === 'JSXNamespacedName') return `${n.namespace.name}:${n.name.name}`;
	return undefined;
};

const attrName = (a: N): string | undefined => (a.type === 'JSXAttribute' ? jsxName(a.name) : undefined);

function literalAttr(a: N): string | undefined {
	const v = a.value;
	if (!v) return '';
	if (v.type === 'Literal' && typeof v.value === 'string') return v.value;
	if (v.type === 'JSXExpressionContainer') {
		const e = unwrap(v.expression);
		if (e?.type === 'Literal' && (typeof e.value === 'string' || typeof e.value === 'number')) return String(e.value);
		if (e?.type === 'TemplateLiteral' && !e.expressions.length) return e.quasis[0].value.cooked ?? '';
	}
	return undefined;
}

/** The static text an element's children show, without what expressions render. */
function staticText(el: N): string {
	let out = '';
	const visit = (n: N) => {
		for (const c of (n.children ?? []) as N[]) {
			if (c.type === 'JSXText') out += ` ${c.value}`;
			else if (c.type === 'JSXElement' || c.type === 'JSXFragment') visit(c);
			else if (c.type === 'JSXExpressionContainer') {
				const e = unwrap(c.expression);
				if (e?.type === 'Literal' && typeof e.value === 'string') out += ` ${e.value}`;
			}
		}
	};
	visit(el);
	return out.replace(/\s+/g, ' ').trim();
}

/** The element a component renders first, as data-slot or tag: followed through the kit's wrappers and the app's components. */
async function rootSlot(scan: Scan, file: string, name: string, depth = 0): Promise<{ slot?: string; tag?: string } | undefined> {
	if (/^[a-z]/.test(name)) return { tag: name };
	const key = `${file}#${name}`;
	if (scan.slots.has(key)) return scan.slots.get(key) ?? undefined;
	scan.slots.set(key, null);
	const mod = await moduleOf(scan, file);
	if (!mod || depth > 5) return undefined;
	const local = name.split('.')[0]!;
	const imp = mod.imports.get(local);
	let found: { slot?: string; tag?: string } | undefined;
	if (imp && !name.includes('.')) {
		const target = resolveImport(scan.project, file, imp.source);
		if (target) found = await rootSlot(scan, target, imp.imported === 'default' ? local : imp.imported, depth + 1);
	} else if (!imp) {
		const def = mod.bindings.get(local);
		if (def) found = await slotOfDefinition(scan, mod, def, depth);
	}
	scan.slots.set(key, found ?? null);
	return found;
}

async function slotOfDefinition(scan: Scan, mod: Module, def: N, depth: number): Promise<{ slot?: string; tag?: string } | undefined> {
	let first: N | undefined;
	walk(def, (n) => {
		if (first) return false;
		if (n.type === 'JSXElement') {
			first = n;
			return false;
		}
	});
	if (!first) return undefined;
	const open = first.openingElement as N;
	const name = jsxName(open.name);
	if (!name) return undefined;
	const inner = /^[a-z]/.test(name) ? { tag: name } : await rootSlot(scan, mod.file, name, depth + 1);
	// The outermost data-slot names the element; the tag it finally renders (an <input>) says what it hears.
	for (const a of open.attributes as N[]) if (attrName(a) === 'data-slot') {
		const v = literalAttr(a);
		if (v) return { slot: v, ...(inner?.tag ? { tag: inner.tag } : {}) };
	}
	return inner;
}

/** The first JSX element an app component's definition renders, and its file; none for a kit's wrapper or a package. */
async function definitionOf(scan: Scan, file: string, name: string, depth = 0): Promise<{ file: string; el: N } | undefined> {
	if (!/^[A-Z]/.test(name) || name.includes('.') || depth > 3) return undefined;
	const mod = await moduleOf(scan, file);
	if (!mod) return undefined;
	const imp = mod.imports.get(name);
	if (imp) {
		const target = resolveImport(scan.project, file, imp.source);
		return target && !isWrapper(target) ? definitionOf(scan, target, imp.imported === 'default' ? name : imp.imported, depth + 1) : undefined;
	}
	const def = mod.bindings.get(name);
	let first: N | undefined;
	if (def) walk(def, (n) => {
		if (first) return false;
		if (n.type === 'JSXElement') {
			first = n;
			return false;
		}
	});
	return first ? { file, el: first } : undefined;
}

/** The enclosing component function and its name. */
function componentOf(ancestors: readonly N[]): { fn: N; name: string } | undefined {
	for (let i = ancestors.length - 1; i >= 0; i--) {
		const n = ancestors[i]!;
		if (n.type === 'FunctionDeclaration' && n.id && /^[A-Z]/.test(n.id.name)) return { fn: n, name: n.id.name };
		if ((n.type === 'ArrowFunctionExpression' || n.type === 'FunctionExpression') && ancestors[i - 1]?.type === 'VariableDeclarator' && /^[A-Z]/.test(ancestors[i - 1]!.id?.name ?? '')) return { fn: n, name: ancestors[i - 1]!.id.name };
	}
	return undefined;
}

/** The names a component takes as props (destructured or `props`). */
function paramNames(fn: N): Set<string> {
	const first = (fn.params as N[] | undefined)?.[0];
	return new Set(first ? patternNames(first) : []);
}

/** `[value, setValue]` pairs a component keeps with useState. */
function stateSetters(fn: N): Map<string, string> {
	const out = new Map<string, string>();
	walk(fn, (n) => {
		if (n.type !== 'VariableDeclarator' || n.id?.type !== 'ArrayPattern') return;
		const init = unwrap(n.init);
		if (init?.type !== 'CallExpression' || !/(^|\.)useState$/.test(memberName(init.callee) ?? '')) return;
		const [v, s] = n.id.elements as (N | null)[];
		if (v?.type === 'Identifier' && s?.type === 'Identifier') out.set(s.name, v.name);
	});
	return out;
}

// Props through which a library root takes state it also keeps itself (Dialog's open, Select's value).
const STATE_PROPS = /^(open|value|checked|pressed|selected|expanded|active|defaultOpen|defaultValue|activeIndex|isOpen|isExpanded|isSelected|selectedKey|selectedKeys|expandedKeys|inputValue)$/;

/**
 * Whether the component hands `name` to a library root's state prop (`<Dialog open={open}>`, `checked={prefs.sms}`), so
 * a handler setting it does what the root's own part does. Its other reads render what the state shows, which convert
 * captured.
 */
function onlyMirrored(fn: N, name: string): boolean {
	let mirrored = false;
	walk(fn, (n, ancestors) => {
		if (mirrored || n.type !== 'Identifier' || n.name !== name) return;
		// A parameter of the same name (`setOpen((open) => !open)`) is another variable.
		if (ancestors.some((a) => a !== fn && isFunction(a) && (a.params as N[]).some((p) => patternNames(p).includes(name)))) return;
		const attr = [...ancestors].reverse().find((a) => a.type === 'JSXAttribute' || isFunction(a));
		if (attr?.type === 'JSXAttribute' && STATE_PROPS.test(attrName(attr) ?? '')) mirrored = true;
	});
	return mirrored;
}

/**
 * What a handler does. `noop`: nothing the page shows (empty, preventDefault, logging). `mirror`: it only stores the
 * value the same element is given back (`open={open} onOpenChange={setOpen}`, the state read nowhere else), which the
 * library's port keeps itself. Anything else is `effect`, and calling a prop the component was given counts as one too.
 */
function classify(value: N | undefined, el: N, comp: { fn: N } | undefined): HandlerClass | 'forward' {
	const e = unwrap(value?.type === 'JSXExpressionContainer' ? value.expression : value);
	if (!e) return 'effect';
	// Only a handler prop handed down (`onValueChange`) is the caller's to ledger; a setter passed as data (`setQuery`) runs here.
	const params = new Set([...(comp ? paramNames(comp.fn) : [])].filter((p) => HANDLER.test(p)));
	const name = memberName(e);
	if (name && (params.has(name) || /^props\./.test(name))) return 'forward';
	if (e.type === 'Identifier' && comp) {
		const state = stateSetters(comp.fn).get(e.name);
		// The setter, the state's declaration and the one prop that reads it back.
		return state && onlyMirrored(comp.fn, state) ? 'mirror' : 'effect';
	}
	if (e.type === 'ArrowFunctionExpression' || e.type === 'FunctionExpression') {
		const body = e.body as N;
		const statements = body.type === 'BlockStatement' ? (body.body as N[]) : [{ type: 'ExpressionStatement', start: body.start, end: body.end, expression: body }];
		if (!statements.length) return 'noop';
		const calls = statements.map((s) => (s.type === 'ExpressionStatement' ? unwrap(s.expression) : undefined));
		if (calls.every((c) => c?.type === 'CallExpression' && NOOP_CALLS.test(memberName(c.callee) ?? ''))) return 'noop';
		const callees = calls.map((c) => (c?.type === 'CallExpression' ? memberName(c.callee)?.replace(/\?$/, '') : undefined));
		if (callees.every((c) => c && (params.has(c) || /^props\./.test(c) || NOOP_CALLS.test(c)))) return 'forward';
		// `() => setOpen(true)` beside `<Dialog open={open}>`: the library's part opens what the state would.
		const setters = comp ? stateSetters(comp.fn) : new Map<string, string>();
		if (callees.every((c) => c && (setters.has(c) || NOOP_CALLS.test(c))) && callees.some((c) => setters.has(c!)) && callees.every((c) => !setters.has(c!) || onlyMirrored(comp!.fn, setters.get(c!)!))) return 'mirror';
	}
	return 'effect';
}

const isWrapper = (file: string) => WRAPPERS.test(file);

type Signature = Anchor;

async function signatureOf(scan: Scan, file: string, el: N): Promise<Omit<Anchor, 'anchor'>> {
	const open = el.openingElement as N;
	const name = jsxName(open.name) ?? '';
	const found = await rootSlot(scan, file, name);
	const attrs: Record<string, string> = {};
	for (const a of open.attributes as N[]) {
		const n = attrName(a);
		if (!n || !IDENTIFYING.includes(n)) continue;
		const v = literalAttr(a);
		if (v) attrs[n === 'htmlFor' ? 'for' : n] = v;
	}
	return { ...(found?.slot ? { slot: found.slot } : {}), ...(found?.tag ? { tag: found.tag } : {}), attrs, text: staticText(el) };
}

const identifiable = (s: Omit<Anchor, 'anchor'>) => Boolean((s.slot ?? s.tag) && (s.text || Object.keys(s.attrs).length));

function* jsxBelow(el: N): Generator<N> {
	const queue = [...((el.children ?? []) as N[])];
	while (queue.length) {
		const n = queue.shift()!;
		if (n.type === 'JSXElement') yield n;
		if (n.type === 'JSXElement' || n.type === 'JSXFragment') queue.push(...((n.children ?? []) as N[]));
		else if (n.type === 'JSXExpressionContainer') walk(n.expression, (x) => {
			if (x.type === 'JSXElement') {
				queue.push(x);
				return false;
			}
		});
	}
}

const MAX_ANCHORS = 3;

/** The elements a site is found by in a page: itself, then findable elements inside it, then ones in its nearest JSX parents. */
async function anchorsOf(scan: Scan, file: string, el: N, ancestors: readonly N[]): Promise<{ anchors: Anchor[]; tag?: string }> {
	const own = await signatureOf(scan, file, el);
	const out: Anchor[] = identifiable(own) ? [{ ...own, anchor: 'self' }] : [];
	// Rendered through its parent (`<DialogTrigger asChild><Button>`): the element carries the parent's data-slot.
	const parent = ancestors.at(-1)?.type === 'JSXElement' ? ancestors.at(-1)! : undefined;
	if (parent && (parent.openingElement.attributes as N[]).some((a) => attrName(a) === 'asChild')) {
		const outer = await signatureOf(scan, file, parent);
		if (outer.slot && identifiable({ ...own, slot: outer.slot })) out.unshift({ ...own, slot: outer.slot, anchor: 'self' });
	}
	const take = async (from: N, anchor: Anchor['anchor'], skip?: N, inFile = file) => {
		let n = 0;
		for (const below of jsxBelow(from)) {
			if (out.length >= MAX_ANCHORS || ++n > 40) return;
			if (below === skip) continue;
			const s = await signatureOf(scan, inFile, below);
			if (identifiable(s)) out.push({ ...s, anchor });
		}
	};
	await take(el, 'inside');
	// A component given no children of its own (<LanguageSelector />): what its definition renders.
	if (out.length < MAX_ANCHORS && jsxBelow(el).next().done) {
		const def = await definitionOf(scan, file, jsxName(el.openingElement.name) ?? '');
		if (def) {
			const s = await signatureOf(scan, def.file, def.el);
			if (identifiable(s) && out.length < MAX_ANCHORS) out.push({ ...s, anchor: 'inside' });
			await take(def.el, 'inside', undefined, def.file);
		}
	}
	// Beside it, only the trigger of the pop-up it sits in: what opens the menu a radio group's items are in.
	const root = ancestors.filter((a) => a.type === 'JSXElement').reverse().slice(0, 4).find((a) => POPUP_ROOT.test(jsxName(a.openingElement.name) ?? ''));
	if (root && out.length < MAX_ANCHORS) {
		let n = 0;
		for (const below of jsxBelow(root)) {
			if (out.length >= MAX_ANCHORS || ++n > 40) break;
			if (below === el) continue;
			const s = await signatureOf(scan, file, below);
			if (identifiable(s) && /-trigger$/.test(s.slot ?? '')) out.push({ ...s, anchor: 'near' });
		}
	}
	return { anchors: out, ...(own.tag ? { tag: own.tag } : {}) };
}

/** The longer words of a component's static text, other than the anchors' own, in source order. */
function contextOf(fn: N, anchors: readonly Anchor[]): string[] {
	const own = new Set(anchors.flatMap((a) => a.text.toLowerCase().split(/[^\p{L}\p{N}]+/u)));
	const out = new Set<string>();
	walk(fn, (n) => {
		if (out.size >= CONTEXT_WORDS) return false;
		if (n.type !== 'JSXText') return;
		for (const w of String(n.value).toLowerCase().split(/[^\p{L}\p{N}]+/u)) if (w.length >= 4 && !own.has(w) && out.size < CONTEXT_WORDS) out.add(w);
	});
	return [...out];
}

/** Every element in the source wired to a handler, plus each library part that acts on its own press. */
export async function handlerSites(root: string): Promise<HandlerSite[]> {
	const project = await openProject(root);
	const scan: Scan = { project, modules: new Map(), slots: new Map() };
	const out: HandlerSite[] = [];
	for (const file of project.files) {
		if (!SOURCE.test(file) || isTestFile(file) || isConfigFile(file) || isWrapper(file)) continue;
		const mod = await moduleOf(scan, file);
		if (!mod?.ok) continue;
		const pending: { el: N; ancestors: N[] }[] = [];
		walk(mod.program, (n, ancestors) => {
			if (n.type === 'JSXElement') pending.push({ el: n, ancestors: [...ancestors] });
		});
		for (const { el, ancestors } of pending) {
			const open = el.openingElement as N;
			const element = jsxName(open.name);
			if (!element) continue;
			const comp = componentOf(ancestors);
			const handlers: { prop: string; cls: HandlerClass }[] = [];
			for (const a of open.attributes as N[]) {
				const prop = attrName(a);
				if (!prop || !HANDLER.test(prop)) continue;
				const cls = classify(a.value, el, comp);
				// A prop handed on to the caller is ledgered where the caller passes its own handler.
				if (cls !== 'forward') handlers.push({ prop, cls });
			}
			const imported = mod.imports.get(element.split('.')[0]!);
			const fromKit = imported ? (/^[@a-z]/.test(imported.source) && !imported.source.startsWith('@/')) || isWrapper(resolveImport(project, file, imported.source) ?? '') : false;
			const part = !handlers.length && fromKit && ACTING_PART.test(element.replace(/\./g, '')) && !LAYOUT_PART.test(element);
			if (!handlers.length && !part) continue;
			const sig = await anchorsOf(scan, file, el, ancestors);
			const props = part ? ['part'] : handlers.map((h) => h.prop);
			const handler: HandlerClass = part ? 'effect' : handlers.some((h) => h.cls === 'effect') ? 'effect' : handlers.some((h) => h.cls === 'mirror') ? 'mirror' : 'noop';
			out.push({ file, line: mod.line(el.start), element, props, kind: part ? 'part' : 'app', handler, ...sig, ...(comp ? { in: `${file}#${comp.name}` } : {}), context: comp ? contextOf(comp.fn, sig.anchors) : [] });
		}
	}
	return out;
}

export { keyName };
