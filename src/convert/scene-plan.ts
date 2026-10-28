import { parseFragment } from 'parse5';
import { attr, childrenOf, isElement, walk as walkElements, type Element, type Node } from './dom.ts';
import { emitChildren, lit, type Binding } from './tsrx.ts';
import { layoutOwned, TYPED, type Frame, type Scene, type SceneNode } from './scenes.ts';

type El = Extract<SceneNode, { tag: string }>;
type Value = string | number | null;
const isEl = (n: SceneNode | undefined): n is El => n !== undefined && 'tag' in n;
const LIVE = '.value';
const SCROLL = '.scroll';

/** What the scene part needs to play a demo's recorded uses, written on the demo's element as JSON. */
export interface SceneData {
	/** The selector of the demo's listed controls: a used control is named as the capture named it. */
	readonly listed: string;
	/** Each settled state's frame. */
	readonly rest: readonly number[];
	/** [from state, control, first frame, last frame, ms after the use for each frame, to state]. */
	readonly edges: readonly (readonly [number, string, number, number, readonly number[], number])[];
	/** Each value the part writes: [element key, 'a' attribute | 't' text run | 'h' hidden, attribute name or run index, longest text]. */
	readonly entries: readonly (readonly [number, 'a' | 't' | 'h', string | number, string?])[];
	/** Per frame of a use, [entry, value] for each value that differs from the frame before it: a number is a prefix of the longest text. */
	readonly changes: Readonly<Record<number, readonly (readonly [number, Value])[]>>;
	/** Per settled state's frame, every entry's value there. */
	readonly full: Readonly<Record<number, readonly (readonly [number, Value])[]>>;
	/** The text a listed field was given at capture, which the part replaces with what the visitor typed. */
	readonly typed?: string;
}

interface Timeline {
	readonly frames: Map<number, { readonly node: SceneNode; readonly parent: number | null }>[];
	readonly edges: { readonly from: number; readonly control: string; readonly start: number; readonly end: number; readonly times: readonly number[]; readonly to: number }[];
	readonly rest: number[];
}

/** Frame 0 is the demo as the page loaded; each use's frames follow, in the order they were recorded. */
function timeline(scene: Scene): Timeline {
	const index = (tree: SceneNode) => {
		const out: Timeline['frames'][number] = new Map();
		const visit = (n: SceneNode, parent: number | null) => {
			out.set(n.id, { node: n, parent });
			if (isEl(n)) for (const k of n.kids) visit(k, n.id);
		};
		visit(tree, null);
		return out;
	};
	const frames = [index(scene.states[0]!)];
	const trees: SceneNode[] = [scene.states[0]!];
	const rest = [0];
	const edges: Timeline['edges'] = [];
	for (const recorded of scene.edges) {
		const e = { ...recorded, frames: steady(recorded.frames) };
		if (!e.frames.length) continue;
		const start = frames.length;
		const known = rest[e.to];
		// A use that ends in a state already seen ends on that state's own nodes: React's new ones are renamed to them.
		const renamed = known === undefined ? e.frames.map((f) => f.tree) : renameTo(e.frames.map((f) => f.tree), trees[known]!);
		for (const tree of renamed) {
			frames.push(index(tree));
			trees.push(tree);
		}
		edges.push({ from: e.from, control: e.control, start, end: frames.length - 1, times: e.frames.map((f) => f.t), to: e.to });
		rest[e.to] ??= frames.length - 1;
	}
	return { frames, edges, rest };
}

// A frame shown for under 100 ms that the frames around it skip over (a token a highlighter split differently halfway
// through a stream) is left out: the frame before stays up until the one after, and no arm is spent on it.
function steady(frames: readonly Frame[]): Frame[] {
	const out = [...frames];
	for (let i = 1; i + 1 < out.length; i++) {
		const [before, at, after] = [out[i - 1]!, out[i]!, out[i + 1]!];
		if (after.t - at.t < 100 && !within(at.tree, after.tree) && within(before.tree, after.tree)) out.splice(i--, 1);
	}
	return out;
}

// The frames of a use, with each node of its last frame that stands where a node of `target` stands (same tag, same
// place) given that node's id, unless a frame already holds that id elsewhere.
function renameTo(trees: readonly SceneNode[], target: SceneNode): SceneNode[] {
	const map = new Map<number, number>();
	const pair = (a: SceneNode, b: SceneNode) => {
		if (isEl(a) !== isEl(b)) return;
		if (isEl(a) && isEl(b)) {
			if (a.tag !== b.tag) return;
			if (a.id !== b.id) map.set(a.id, b.id);
			a.kids.forEach((k, i) => b.kids[i] && pair(k, b.kids[i]!));
		} else if (a.id !== b.id) map.set(a.id, b.id);
	};
	pair(trees.at(-1)!, target);
	const ids = (n: SceneNode, out: Set<number>) => {
		out.add(n.id);
		if (isEl(n)) for (const k of n.kids) ids(k, out);
		return out;
	};
	for (const tree of trees) {
		const own = ids(tree, new Set());
		for (const [from, to] of [...map]) if (own.has(to) && !map.has(to) && own.has(from)) map.delete(from);
	}
	const rename = (n: SceneNode): SceneNode => (isEl(n) ? { ...n, id: map.get(n.id) ?? n.id, kids: n.kids.map(rename) } : { ...n, id: map.get(n.id) ?? n.id });
	return trees.map(rename);
}

// A textarea's text is React's defaultValue, following its value (`.value`): not a run of its own.
const runsOf = (n: El): string[] => (n.tag === 'textarea' ? [] : n.kids.filter((k) => !isEl(k)).map((k) => (k as { text: string }).text));
// A subtree's make-up without its values: elements by id, and whether each text run has text.
function structure(n: SceneNode): string {
	if (!isEl(n)) return n.text ? 'T' : '';
	return `${n.id}(${n.tag === 'textarea' ? '' : n.kids.map(structure).join(',')})`;
}
// Whether `a` can be shown as `b` with some of `b`'s elements hidden and some of its text emptied.
function within(a: SceneNode, b: SceneNode): boolean {
	if (!isEl(a) || !isEl(b)) return !isEl(a) && !isEl(b) && (!a.text || !!b.text);
	if (a.id !== b.id) return false;
	const bKids = b.kids;
	let j = 0;
	for (const k of a.kids) {
		if (!isEl(k)) {
			while (j < bKids.length && isEl(bKids[j])) j++;
			if (j >= bKids.length) return !k.text;
			if (!within(k, bKids[j]!)) return false;
			j++;
			continue;
		}
		while (j < bKids.length && !(isEl(bKids[j]) && bKids[j]!.id === k.id)) j++;
		if (j >= bKids.length || !within(k, bKids[j]!)) return false;
		j++;
	}
	return runsOf(a as El).length <= runsOf(b as El).length || runsOf(a as El).slice(runsOf(b as El).length).every((t) => !t);
}

const condition = (frames: readonly number[], name: string): string => {
	const sorted = [...new Set(frames)].sort((a, b) => a - b);
	const parts: string[] = [];
	for (let i = 0; i < sorted.length; ) {
		let j = i;
		while (j + 1 < sorted.length && sorted[j + 1] === sorted[j]! + 1) j++;
		parts.push(sorted[i] === sorted[j] ? `${name} === ${sorted[i]}` : `(${name} >= ${sorted[i]} && ${name} <= ${sorted[j]})`);
		i = j + 1;
	}
	return parts.join(' || ') || 'false';
};

const escapeHtml = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escapeAttr = (t: string) => t.replace(/&/g, '&amp;').replace(/"/g, '&quot;');

/**
 * Recorded uses of a demo's own controls on Markless state. One state per demo holds the frame shown. A node that
 * comes and goes is an @if arm per largest shape it takes: a reply that streams in is one arm whose not-yet-shown
 * parts the scene part hides. The attributes and text that change on a node are written by the scene part at each
 * frame, on elements keyed `data-mm-k`.
 */
export class ScenePlan {
	private readonly bindings = new Map<Element, Binding>();
	private readonly names = new Map<Element, string>();
	private readonly arms = new Map<Element, string[]>();
	private n = 0;
	readonly refused: string[] = [];
	private readonly bound: (el: Element) => boolean;

	/** `bound`: whether another of convert's plans puts an element on Markless state; a demo whose uses would replace one is not played. */
	constructor(bound: (el: Element) => boolean = () => false) {
		this.bound = bound;
	}

	bind(el: Element): Binding | undefined {
		return this.bindings.get(el);
	}

	/** The markup of the arms a demo's uses mount, as HTML: the ports what they show needs (a MessageScroller) are its page's too. */
	markupOf(region: Element): readonly string[] {
		return this.arms.get(region) ?? [];
	}

	/** The state a demo's element declares: part of its identity, so no shared component holds it for two pages. */
	nameOf(el: Element): string | undefined {
		return this.names.get(el);
	}

	/** The element of `el`'s subtree another plan puts on Markless state, named by tag and data-slot. */
	private holdsBound(el: Element): string | undefined {
		const hit = this.bound(el) ? el : [...walkElements(el)].find((d) => this.bound(d));
		return hit ? `<${hit.tagName}${attr(hit, 'data-slot') ? ` data-slot="${attr(hit, 'data-slot')}"` : ''}>` : undefined;
	}

	/** A MessageScroller a use mounts opens where it opened on the old page: held as its server render was, and mounted by its part as it shows. */
	private scroller(el: Element, openings: ReadonlyMap<number, string>): string[] | undefined {
		const slot = attr(el, 'data-slot');
		if (slot !== 'message-scroller' && slot !== 'message-scroller-viewport') return undefined;
		const viewport = slot === 'message-scroller-viewport' ? el : [...walkElements(el)].find((d) => attr(d, 'data-slot') === 'message-scroller-viewport');
		const position = (viewport && openings.get(Number(attr(viewport, 'data-mm-sid')))) ?? 'end';
		const pending = position === 'start' ? [] : ['data-pending-scroll=""'];
		return slot === 'message-scroller-viewport' ? pending : [...pending, `data-mm-default-scroll-position="${position}"`, 'data-mm-mount=""', 'onVisible={() => mount("data-mm-mount")}'];
	}

	add(scene: Scene, region: Element, listed: string): boolean {
		const local = new Map<Element, Binding>();
		const why = this.plan(scene, region, listed, local);
		if (why) {
			this.refused.push(`${scene.sig}#${scene.nth}: ${why}`);
			return false;
		}
		// Every element the demo's state reaches stays in the demo's own component: none is shared with another page.
		const name = this.names.get(region)!;
		for (const [el, b] of local) {
			this.bindings.set(el, b);
			this.names.set(el, name);
		}
		return true;
	}

	private plan(scene: Scene, region: Element, listed: string, bindings: Map<Element, Binding>): string | undefined {
		if (!scene.edges.some((e) => e.frames.length)) return 'no use changed anything';
		const t = timeline(scene);
		const F = t.frames.length;
		const root = scene.states[0]!;
		if (!isEl(root)) return 'the demo is not an element';
		const name = `sc${this.n}`;
		const parentOf = new Map<number, number | null>();
		for (const frame of t.frames)
			for (const [id, p] of frame) {
				const known = parentOf.get(id);
				if (known !== undefined && known !== p.parent) return `node ${id} moves between parents`;
				parentOf.set(id, p.parent);
			}
		const nodeAt = (id: number, f: number) => t.frames[f]!.get(id)?.node;
		// Each parent's element children in one order every frame agrees with.
		const order = new Map<number, number[]>();
		{
			const follows = new Map<number, Map<number, Set<number>>>();
			const seenAt = new Map<number, number>();
			for (const frame of t.frames)
				for (const p of frame.values()) {
					if (!isEl(p.node)) continue;
					const ids = p.node.kids.filter(isEl).map((k) => k.id);
					for (const id of ids) if (!seenAt.has(id)) seenAt.set(id, seenAt.size);
					const edges = follows.get(p.node.id) ?? follows.set(p.node.id, new Map()).get(p.node.id)!;
					for (const id of ids) if (!edges.has(id)) edges.set(id, new Set());
					for (let i = 0; i + 1 < ids.length; i++) edges.get(ids[i]!)!.add(ids[i + 1]!);
				}
			for (const [parent, edges] of follows) {
				const indegree = new Map([...edges.keys()].map((k) => [k, 0]));
				for (const bs of edges.values()) for (const b of bs) indegree.set(b, indegree.get(b)! + 1);
				const ready = [...edges.keys()].filter((k) => indegree.get(k) === 0);
				const out: number[] = [];
				while (ready.length) {
					ready.sort((a, b) => seenAt.get(a)! - seenAt.get(b)!);
					const k = ready.shift()!;
					out.push(k);
					for (const b of edges.get(k)!) {
						indegree.set(b, indegree.get(b)! - 1);
						if (indegree.get(b) === 0) ready.push(b);
					}
				}
				if (out.length !== edges.size) return `the children of node ${parent} change order`;
				order.set(parent, out);
			}
		}
		const entries: [number, 'a' | 't' | 'h', string | number, string?][] = [];
		const entryOf = new Map<string, number>();
		const values: Value[][] = Array.from({ length: F }, () => []);
		const keyed = new Set<number>();
		const entry = (key: number, kind: 'a' | 't' | 'h', which: string | number) => {
			const k = `${key}|${kind}|${which}`;
			let i = entryOf.get(k);
			if (i === undefined) {
				entryOf.set(k, (i = entries.length));
				entries.push([key, kind, which]);
			}
			keyed.add(key);
			return i;
		};
		// The attributes and text runs of element `id` that change over `frames`, as entries.
		const dynamics = (id: number, frames: readonly number[], runs: number) => {
			const names = new Set<string>();
			for (const f of frames) {
				const at = nodeAt(id, f) as El | undefined;
				for (const [a] of at?.attrs ?? []) if (a !== SCROLL && !layoutOwned(at!.attrs, a)) names.add(a);
			}
			for (const a of names) {
				const at = frames.map((f) => {
					const n = nodeAt(id, f);
					return isEl(n) ? (n.attrs.find(([k]) => k === a)?.[1] ?? null) : undefined;
				});
				if (new Set(at.filter((v) => v !== undefined)).size <= 1 && !at.some((v) => v?.includes(TYPED))) continue;
				const i = entry(id, 'a', a);
				frames.forEach((f, j) => at[j] !== undefined && (values[f]![i] = at[j]!));
			}
			for (let r = 0; r < runs; r++) {
				const at = frames.map((f) => {
					const n = nodeAt(id, f);
					return isEl(n) ? (runsOf(n)[r] ?? '') : undefined;
				});
				// What the visitor typed is written by the part even where it never changes.
				if (new Set(at.filter((v) => v !== undefined)).size <= 1 && !at.some((v) => v?.includes(TYPED))) continue;
				const i = entry(id, 't', r);
				const longest = at.reduce<string>((a, v) => (v !== undefined && v.length > a.length ? v : a), '');
				entries[i]![3] = longest;
				frames.forEach((f, j) => {
					const v = at[j];
					if (v !== undefined) values[f]![i] = longest.startsWith(v) ? v.length : v;
				});
			}
		};
		// `rep` as HTML, shown over `frames`: its values from the first of them that has each node, and an entry for every
		// node some of them lack (hidden) and every value that changes.
		const html = (rep: SceneNode, frames: readonly number[]): string => {
			if (!isEl(rep)) return escapeHtml(rep.text);
			const first = frames.find((f) => nodeAt(rep.id, f)) ?? frames[0]!;
			const own = nodeAt(rep.id, first) as El;
			dynamics(rep.id, frames, runsOf(rep).length);
			if (frames.some((f) => !nodeAt(rep.id, f))) {
				const i = entry(rep.id, 'h', '');
				frames.forEach((f) => (values[f]![i] = nodeAt(rep.id, f) ? 0 : 1));
			}
			const attrs = own.attrs.filter(([k]) => !k.startsWith('.')).map(([k, v]) => ` ${k}="${escapeAttr(v)}"`).join('');
			const opened = own.attrs.find(([k]) => k === SCROLL)?.[1];
			if (opened) openings.set(rep.id, opened);
			const runs = runsOf(own);
			let r = 0;
			const kids = rep.kids.map((k) => (isEl(k) ? html(k, frames) : escapeHtml(runs[r++] ?? ''))).join('');
			return `<${rep.tag}${attrs} data-mm-sid="${rep.id}"${nodeAt(rep.id, frames[0]!) ? '' : ' hidden'}>${kids}</${rep.tag}>`;
		};
		const openings = new Map<number, string>();
		const shown: string[] = [];
		const emitScene = (markup: string) =>
			emitChildren(parseFragment(markup) as unknown as Element, {
				bind: (el) => {
					const sid = attr(el, 'data-mm-sid');
					const extra = sid !== undefined && keyed.has(Number(sid)) ? [`data-mm-k="${sid}"`] : [];
					// A form in a demo whose state the old page's script drove submitted nowhere.
					const form = el.tagName === 'form' ? ['data-mm-form=""', 'onSubmit={(event) => event.preventDefault()}'] : [];
					return { omit: ['data-mm-sid'], extra: [...extra, ...form, ...(this.scroller(el, openings) ?? [])] };
				},
			});
		// The arms node `id` is shown by over `frames` (those it is in): frame 0's own shape, then each largest shape.
		const arms = (id: number, frames: readonly number[]): string => {
			const groups: { rep: SceneNode; frames: number[] }[] = [];
			if (frames.includes(0)) groups.push({ rep: nodeAt(id, 0)!, frames: [] });
			const shapes = new Map<string, SceneNode>();
			for (const f of frames) shapes.set(structure(nodeAt(id, f)!), nodeAt(id, f)!);
			const all = [...shapes.values()];
			for (const s of all) if (!all.some((o) => o !== s && within(s, o) && !within(o, s)) && !groups.some((g) => structure(g.rep) === structure(s))) groups.push({ rep: s, frames: [] });
			for (const f of frames) {
				const node = nodeAt(id, f)!;
				(groups.find((g) => structure(g.rep) === structure(node)) ?? groups.find((g) => within(node, g.rep))!).frames.push(f);
			}
			return groups
				.filter((g) => g.frames.length)
				.map((g) => {
					const markup = html(g.rep, g.frames);
					shown.push(markup);
					return `@if (${condition(g.frames, name)}) { <>${emitScene(markup)}</> }`;
				})
				.join('');
		};
		const present = (id: number, frames: readonly number[]) => frames.filter((f) => nodeAt(id, f));
		// Frame 0's elements are the converted page's own: one that is always shown stays the page's, with its own bindings.
		const walk = (n: El, el: Element, frames: readonly number[]): string | undefined => {
			if (el.tagName !== n.tag) return `node ${n.id} is <${el.tagName}> on the page and <${n.tag}> in the capture`;
			const runShapes = new Set(frames.map((f) => runsOf(nodeAt(n.id, f) as El).map((t) => (t ? 'T' : '')).join(',')));
			if (runShapes.size > 1) {
				const held = this.holdsBound(el);
				if (held) return `${held} is on Markless state already`;
				bindings.set(el, { replace: arms(n.id, frames) });
				return undefined;
			}
			dynamics(n.id, frames, runsOf(n).length);
			const pageKids = childrenOf(el).filter(isElement);
			const inserts: { before: Node | null; markup: string }[] = [];
			let pending: number[] = [];
			let k = 0;
			for (const id of order.get(n.id) ?? []) {
				const child = nodeAt(id, frames[0]!);
				if (!child) {
					pending.push(id);
					continue;
				}
				const pageEl = pageKids[k++];
				if (!pageEl) return `node ${id} has no element on the page`;
				if (pending.length) inserts.push({ before: pageEl, markup: pending.map((p) => arms(p, present(p, frames))).join('') });
				pending = [];
				if (present(id, frames).length === frames.length) {
					const why = walk(child as El, pageEl, frames);
					if (why) return why;
				} else {
					const held = this.holdsBound(pageEl);
					if (held) return `${held} is on Markless state already`;
					bindings.set(pageEl, { replace: arms(id, present(id, frames)) });
				}
			}
			if (pending.length) inserts.push({ before: null, markup: pending.map((p) => arms(p, present(p, frames))).join('') });
			if (inserts.length) bindings.set(el, { ...bindings.get(el), inserts });
			return undefined;
		};
		const why = walk(root, region, Array.from({ length: F }, (_, f) => f));
		if (why) return why;
		// Elements of the page whose values change: keyed now that every entry is known.
		const keyPage = (n: El, el: Element) => {
			const own = bindings.get(el);
			if (own?.replace !== undefined) return;
			if (keyed.has(n.id)) bindings.set(el, { ...own, extra: [...(own?.extra ?? []), `data-mm-k="${n.id}"`] });
			const pageKids = childrenOf(el).filter(isElement);
			let k = 0;
			for (const kid of n.kids) if (isEl(kid)) keyPage(kid, pageKids[k++]!);
		};
		keyPage(root, region);
		// An entry has a value in every frame its element is in, whichever arm shows it there.
		entries.forEach(([key, kind, which], i) => {
			for (let f = 0; f < F; f++) {
				if (values[f]![i] !== undefined) continue;
				const n = nodeAt(key, f);
				if (!isEl(n)) continue;
				if (kind === 'h') values[f]![i] = 0;
				else if (kind === 'a') values[f]![i] = n.attrs.find(([k]) => k === which)?.[1] ?? null;
				else {
					const v = runsOf(n)[which as number] ?? '';
					const longest = entries[i]![3] ?? '';
					values[f]![i] = longest.startsWith(v) ? v.length : v;
				}
			}
		});
		const changes: Record<number, (readonly [number, Value])[]> = {};
		const full: Record<number, (readonly [number, Value])[]> = {};
		for (const r of t.rest) full[r] = entries.flatMap((_, i) => (values[r]![i] !== undefined ? [[i, values[r]![i]!] as const] : []));
		for (const e of t.edges)
			for (let f = e.start; f <= e.end; f++) {
				const from = f === e.start ? t.rest[e.from]! : f - 1;
				changes[f] = entries.flatMap((_, i) => {
					const v = values[f]![i];
					return v !== undefined && values[from]![i] !== v ? [[i, v] as const] : [];
				});
			}
		const fields = t.edges.some((e) => e.control.includes('|'));
		const data: SceneData = { listed, rest: t.rest, edges: t.edges.map((e) => [e.from, e.control, e.start, e.end, e.times, e.to] as const), entries, changes, full, ...(fields ? { typed: TYPED } : {}) };
		const own = bindings.get(region);
		const set = `(frame) => { ${name} = frame; }`;
		bindings.set(region, {
			...own,
			declare: [...(own?.declare ?? []), `let ${name} = state(0);`],
			extra: [...(own?.extra ?? []), `data-mm-scene={${lit(JSON.stringify(data))}}`, `onClick={(event) => playScene(event, ${set})}`, ...(fields ? [`onInput={(event) => playScene(event, ${set})}`, `onKeyDown={(event) => playScene(event, ${set})}`] : [])],
		});
		this.names.set(region, name);
		this.arms.set(region, shown);
		this.n++;
		return undefined;
	}
}
