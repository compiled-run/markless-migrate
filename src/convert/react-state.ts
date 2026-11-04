import type { BoundAttribute, StateCode, StateComponent, StateNode } from '../library/types.ts';
import { attr, childrenOf, elementChildren, isElement, textContent, walk, type Element, type Node } from './dom.ts';
import type { Binding } from './tsrx.ts';

type ElementNode = Extract<StateNode, { kind: 'element' }>;
type IfNode = Extract<StateNode, { kind: 'if' }>;
type ForNode = Extract<StateNode, { kind: 'for' }>;

/** What one node of a component's render was found as on the page. */
type Found =
	| { readonly kind: 'element'; readonly node: ElementNode; readonly el: Element; readonly inner: readonly Found[] }
	| { readonly kind: 'if'; readonly node: IfNode; readonly els: readonly Element[]; readonly inner: readonly Found[]; readonly parent: Element; readonly before: Node | null }
	| { readonly kind: 'for'; readonly node: ForNode; readonly els: readonly Element[]; readonly parent: Element; readonly before: Node | null };

interface Seq {
	readonly found: Found[];
	/** The element children consumed. */
	readonly end: number;
	/** What the page shows that the source fixes or the state decides, checked: how sure the match is. */
	readonly evidence: number;
	/** Checks of what the state decides at load. */
	readonly state: number;
}

// Below this many checks a match could be any element that happens to look alike.
const MIN_EVIDENCE = 3;
const MAX_STEPS = 20_000;

const collapse = (t: string) => t.replace(/[ \t\n\r\f]+/g, ' ').trim();

/**
 * The app's components that keep React state, on Markless state: each instance plan's facts find on the page
 * (src/library/react-state.ts) declares a state() per state and a computed() per derived value, named for the
 * instance; attributes and text that read them are written as expressions; a conditional render is an @if around what
 * the page shows (the other arm written from the source); a list is a keyed @for; and the handlers that set state are
 * written inline with their setter calls as assignments.
 */
export class ReactStatePlan {
	private readonly bindings = new Map<Element, Binding>();
	private readonly facts: readonly StateComponent[];
	private readonly used = new Set<Element>();
	private readonly computed = new Set<string>();
	private n = 0;
	private taken: (el: Element) => boolean = () => false;
	private opens: (el: Element) => boolean = () => false;
	private kidsOf: (el: Element) => readonly Element[] = elementChildren;
	/** Instances found, by component. */
	readonly counts = new Map<string, number>();

	constructor(facts: readonly StateComponent[] | undefined) {
		this.facts = (facts ?? []).filter((f) => !f.refused && f.nodes?.length);
	}

	bind(el: Element): Binding | undefined {
		return this.bindings.get(el);
	}

	/** Whether a declaration is one of this plan's computed(). */
	declaresComputed(line: string): boolean {
		return this.computed.has(line);
	}

	/**
	 * Finds each instance of a converted component in `root`, never on an element `taken` (another plan binds it), an
	 * opener only where the element `opens` a layer of the page; how many it found.
	 */
	add(root: Element, taken: (el: Element) => boolean = () => false, opens: (el: Element) => boolean = () => false): number {
		this.taken = taken;
		this.opens = opens;
		const page = new PageIndex(root);
		this.kidsOf = (el) => page.kids(el);
		let found = 0;
		for (const fact of this.facts) {
			for (const { el: start, parent, kids, at } of page.starts(fact.nodes![0]!)) {
				if (this.used.has(start)) continue;
				const seq = this.sequence(fact.nodes!, 0, kids, at, parent, false, { steps: 0 });
				if (!seq || seq.end === at || seq.evidence < MIN_EVIDENCE || !seq.state) continue;
				const consumed = consumedOf(seq.found);
				if (consumed.some((el) => this.used.has(el))) continue;
				for (const el of consumed) for (const x of walk(el)) this.used.add(x);
				this.instance(fact, seq.found);
				this.counts.set(fact.component, (this.counts.get(fact.component) ?? 0) + 1);
				found++;
			}
		}
		this.kidsOf = elementChildren;
		return found;
	}

	/** Matches `nodes[i..]` against `kids[j..]`, all of them when `full`. */
	private sequence(nodes: readonly StateNode[], i: number, kids: readonly Element[], j: number, parent: Element, full: boolean, budget: { steps: number }): Seq | undefined {
		if (++budget.steps > MAX_STEPS) return undefined;
		if (i === nodes.length) return !full || j === kids.length ? { found: [], end: j, evidence: 0, state: 0 } : undefined;
		const node = nodes[i]!;
		const rest = (at: number, found: Found[], evidence: number, state: number): Seq | undefined => {
			const tail = this.sequence(nodes, i + 1, kids, at, parent, full, budget);
			return tail && { found: [...found, ...tail.found], end: tail.end, evidence: evidence + tail.evidence, state: state + tail.state };
		};
		switch (node.kind) {
			case 'text':
				return rest(j, [], 0, 0);
			case 'opaque':
				for (let k = j; k <= kids.length; k++) {
					const hit = rest(k, [], 0, 0);
					if (hit) return hit;
				}
				return undefined;
			case 'element': {
				const el = kids[j];
				const m = el && this.element(node, el, budget);
				return m ? rest(j + 1, [{ kind: 'element', node, el, inner: m.found }], m.evidence, m.state) : undefined;
			}
			case 'if': {
				const arm = node.initial ? node.then : node.else;
				const shown = this.sequence(arm, 0, kids, j, parent, false, budget);
				if (!shown) return undefined;
				const els = kids.slice(j, shown.end);
				const before = kids[shown.end] ?? null;
				return rest(shown.end, [{ kind: 'if', node, els, inner: shown.found, parent, before }], shown.evidence, shown.state + 1);
			}
			case 'for': {
				const rows = kids.slice(j, j + node.initial);
				if (rows.length !== node.initial || rows.some((r) => r.tagName !== node.tag)) return undefined;
				return rest(j + node.initial, [{ kind: 'for', node, els: rows, parent, before: kids[j + node.initial] ?? null }], node.initial ? 1 : 0, 1);
			}
		}
	}

	private element(node: ElementNode, el: Element, budget: { steps: number }): { found: Found[]; evidence: number; state: number } | undefined {
		if (this.used.has(el) || this.taken(el)) return undefined;
		let evidence = 0;
		let state = 0;
		if (node.tag !== undefined) {
			if (el.tagName !== node.tag) return undefined;
		} else if (!node.slots?.includes(attr(el, 'data-slot') ?? '')) return undefined;
		else evidence++;
		for (const [name, value] of Object.entries(node.attrs)) {
			if (name === 'class') continue;
			if (attr(el, name) !== value) return undefined;
			evidence++;
		}
		for (const [name, b] of Object.entries(node.bound ?? {})) {
			if (b.added) continue;
			if (name === 'class' ? !classFits(el, b) : (attr(el, name) ?? null) !== b.initial) return undefined;
			evidence++;
			state++;
		}
		if (node.opens) {
			if (!this.opens(el)) return undefined;
			evidence++;
			state++;
		}
		if (node.text) {
			if (collapse(textContent(el)) !== collapse(node.text.initial ?? "")) return undefined;
			evidence++;
			state++;
		}
		if (!node.children) return { found: [], evidence, state };
		if (node.children.every((c) => c.kind === 'text')) {
			const text = collapse(node.children.map((c) => (c.kind === 'text' ? c.value : '')).join(''));
			if (collapse(textContent(el)) !== text) return undefined;
			return { found: [], evidence: evidence + (text ? 1 : 0), state };
		}
		if (node.loose) {
			for (const p of walk(el)) {
				const kids = this.kidsOf(p);
				for (let j = 0; j <= kids.length; j++) {
					const seq = this.sequence(node.children, 0, kids, j, p, false, budget);
					if (seq && (seq.end > j || seq.state)) return { found: seq.found, evidence: evidence + seq.evidence, state: state + seq.state };
				}
			}
			return undefined;
		}
		const seq = this.sequence(node.children, 0, this.kidsOf(el), 0, el, true, budget);
		return seq && { found: seq.found, evidence: evidence + seq.evidence, state: state + seq.state };
	}

	private instance(fact: StateComponent, found: readonly Found[]): void {
		const n = this.n++;
		const names = fact.slots!.map((s) => `${s.name}_${n}`);
		const write = (code: StateCode) => code.map((c) => (typeof c === 'number' ? names[c] : c)).join('');
		const declare = fact.slots!.map((s, i) => {
			if (s.kind === 'state') return `let ${names[i]} = state(${write(s.init)});`;
			const line = `const ${names[i]} = computed(() => ${write(s.init)});`;
			this.computed.add(line);
			return line;
		});
		const put = (el: Element, b: Binding) => {
			const own = this.bindings.get(el);
			this.bindings.set(el, {
				declare,
				omit: [...(own?.omit ?? []), ...(b.omit ?? [])],
				extra: [...(own?.extra ?? []), ...(b.extra ?? [])],
				...(own?.children !== undefined || b.children !== undefined ? { children: b.children ?? own?.children } : {}),
				...(own?.replace !== undefined || b.replace !== undefined ? { replace: b.replace ?? own?.replace } : {}),
				...(own?.inserts || b.inserts ? { inserts: [...(own?.inserts ?? []), ...(b.inserts ?? [])] } : {}),
			});
		};
		// Each instance's state is declared where its markup is, whichever element is emitted first.
		const anchor = consumedOf(found)[0];
		if (anchor) put(anchor, {});
		const visit = (list: readonly Found[]) => {
			for (const f of list) {
				if (f.kind === 'element') {
					const { node, el } = f;
					const bound = Object.entries(node.bound ?? {});
					const events = Object.entries(node.events ?? {});
					put(el, {
						omit: bound.map(([name]) => name),
						extra: [...bound.map(([name, b]) => `${name}={${write(b.code)}}`), ...events.map(([prop, code]) => `${prop}={${write(code)}}`)],
						...(node.text ? { children: `{${write(node.text.code)}}` } : {}),
					});
					visit(f.inner);
				} else if (f.kind === 'if') {
					const test = write(f.node.test);
					const other = f.node.markup ? write(f.node.markup) : '';
					// The arm the page shows is emitted as it is, between the two halves; the other is written from the source.
					const [open, close] = f.node.initial ? [`@if (${test}) { <>`, `</> }${other ? ` @else { <>${other}</> }` : ''}`] : [`@if (${test}) { <>${other}</> } @else { <>`, '</> }'];
					if (f.els.length) {
						// The halves sit in the parent around the arm's elements, which are emitted as they are between them.
						const kids = childrenOf(f.parent);
						const after = kids[kids.indexOf(f.els.at(-1)!) + 1] ?? null;
						put(f.parent, { inserts: [{ before: f.els[0]!, markup: open }, { before: after, markup: close }] });
					} else if (other) put(f.parent, { inserts: [{ before: f.before, markup: f.node.initial ? `@if (!(${test})) { <>${other}</> }` : `@if (${test}) { <>${other}</> }` }] });
					visit(f.inner);
				} else {
					const { node } = f;
					const markup = `@for (const ${node.item} of ${write(node.list)}${node.index ? `; index ${node.index}` : ''}; key ${write(node.key)}) { ${write(node.markup)} }`;
					if (f.els.length) {
						put(f.els[0]!, { replace: markup });
						for (const el of f.els.slice(1)) put(el, { replace: '' });
					} else put(f.parent, { inserts: [{ before: f.before, markup }] });
				}
			}
		};
		visit(found);
	}
}

interface Start {
	readonly el: Element;
	readonly parent: Element;
	readonly kids: readonly Element[];
	readonly at: number;
	/** Its place in document order. */
	readonly n: number;
}

/** One page's elements read once for every component: each with its parent's element children, and by the tag and slot a render's first node can ask for. */
class PageIndex {
	private readonly all: Start[] = [];
	private readonly children = new Map<Element, readonly Element[]>();
	private readonly byTag = new Map<string, Start[]>();
	private readonly bySlot = new Map<string, Start[]>();

	constructor(root: Element) {
		const at = new Map<Element, number>();
		for (const parent of walk(root)) {
			const kids = elementChildren(parent);
			this.children.set(parent, kids);
			kids.forEach((el, i) => at.set(el, i));
		}
		for (const el of walk(root)) {
			const parent = el.parentNode as Element | null;
			if (!parent || !isElement(parent)) continue;
			const kids = this.kids(parent);
			const s: Start = { el, parent, kids, at: at.get(el) ?? kids.indexOf(el), n: this.all.length };
			this.all.push(s);
			push(this.byTag, el.tagName, s);
			push(this.bySlot, attr(el, 'data-slot') ?? '', s);
		}
	}

	kids(el: Element): readonly Element[] {
		return this.children.get(el) ?? elementChildren(el);
	}

	/** The elements a render whose first node is `first` can start at, in document order: any other fails that node. */
	starts(first: StateNode): readonly Start[] {
		if (first.kind !== 'element') return this.all;
		if (first.tag !== undefined) return this.byTag.get(first.tag) ?? [];
		const lists = (first.slots ?? []).map((s) => this.bySlot.get(s) ?? []);
		if (lists.length < 2) return lists[0] ?? [];
		return [...new Set(lists.flat())].sort((a, b) => a.n - b.n);
	}
}

function push<K, V>(map: Map<K, V[]>, key: K, value: V): void {
	const list = map.get(key);
	if (list) list.push(value);
	else map.set(key, [value]);
}

/** Whether an element's class is what a state-read class shows at load: the source's classes all present. */
function classFits(el: Element, b: BoundAttribute): boolean {
	const has = new Set((attr(el, 'class') ?? '').split(/[ \t\n\r\f]+/).filter(Boolean));
	return (b.initial ?? '').split(/[ \t\n\r\f]+/).filter(Boolean).every((c) => has.has(c));
}

/** The page elements a match consumed, in document order. */
function consumedOf(found: readonly Found[]): Element[] {
	const out: Element[] = [];
	for (const f of found) {
		if (f.kind === 'element') out.push(f.el);
		else out.push(...f.els);
	}
	return out;
}
