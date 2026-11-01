import { attr, childrenOf, isElement, type Element, type Node } from './dom.ts';

/**
 * A page captured once per query value (`/create?template=vite`) is written as one page the server renders the same
 * for every query, so it is built ahead like any other: what the captured variants show differently is resolved in the
 * browser from `location.search`, as the old page's client code resolved it.
 */
export interface QueryVariants {
	/** The query of each variant beside the base (`?template=vite`), in capture order. */
	readonly searches: readonly string[];
	/** Base elements whose attributes take the variant's value: attribute name to its key in the table. */
	readonly expressions: ReadonlyMap<Element, Readonly<Record<string, string>>>;
	/** Base elements on the way to a difference: written inline, never as a component several pages share. */
	readonly holds: ReadonlySet<Element>;
	/** Base elements a variant differs in beyond an attribute the visitor cannot see: the page cannot be written this way if one is emitted. */
	readonly unaligned: ReadonlySet<Element>;
	/** Each variant's values (the base's under ''), by key: the page's table. */
	readonly table: Readonly<Record<string, Readonly<Record<string, string>>>>;
}

export const VARIANT_STATE = 'queryVariant';
export const VARIANT_TABLE = 'QUERY_VARIANTS';

/** The attributes whose value changes what a visitor sees before the page runs: a variant differing in one keeps its server render. */
const SEEN = new Set(['class', 'style', 'src', 'srcset', 'hidden', 'width', 'height', 'open', 'value', 'checked', 'selected', 'placeholder', 'poster', 'd', 'fill', 'stroke', 'transform', 'viewbox']);

const kind = (n: Node) => (isElement(n) ? `<${n.tagName}` : n.nodeName === '#text' ? '#text' : n.nodeName);
const textOf = (n: Node) => (n as { value?: string }).value ?? '';

/**
 * Aligns each variant's root with the base's. `content` is what the converter adds to an element beyond its markup
 * (its captured panels, appended layers, keys): an element whose content differs is unaligned, as one whose children
 * differ in kind or text.
 */
export function queryVariants(base: Element, variants: ReadonlyMap<string, Element>, content: (el: Element) => string | undefined): QueryVariants {
	const expressions = new Map<Element, Record<string, string>>();
	const holds = new Set<Element>();
	const unaligned = new Set<Element>();
	const table: Record<string, Record<string, string>> = { '': {} };
	const searches = [...variants.keys()];
	for (const s of searches) table[s] = {};
	let column = 0;
	const parents = new Map<Element, Element>();
	const hold = (el: Element) => {
		for (let at: Element | undefined = el; at && !holds.has(at); at = parents.get(at)) holds.add(at);
	};
	const visit = (b: Element, vs: readonly Element[]) => {
		if (vs.some((v) => v.tagName !== b.tagName || (content(v) ?? '') !== (content(b) ?? ''))) {
			unaligned.add(b);
			hold(b);
			return;
		}
		const kids = childrenOf(b);
		const lists = vs.map((v) => childrenOf(v));
		if (lists.some((list) => list.length !== kids.length || list.some((n, i) => kind(n) !== kind(kids[i]!) || (!isElement(n) && textOf(n) !== textOf(kids[i]!))))) {
			unaligned.add(b);
			hold(b);
			return;
		}
		const names = new Set([b, ...vs].flatMap((el) => el.attrs.map((a) => (a.prefix ? `${a.prefix}:${a.name}` : a.name))));
		for (const name of names) {
			const value = (el: Element) => attr(el, name);
			const at = value(b);
			if (vs.every((v) => value(v) === at)) continue;
			if (SEEN.has(name.toLowerCase())) {
				unaligned.add(b);
				hold(b);
				continue;
			}
			const key = `v${column++}`;
			if (at !== undefined) table['']![key] = at;
			vs.forEach((v, i) => {
				const own = value(v);
				if (own !== undefined) table[searches[i]!]![key] = own;
			});
			(expressions.get(b) ?? expressions.set(b, {}).get(b)!)[name] = key;
			hold(b);
		}
		kids.forEach((k, i) => {
			if (!isElement(k)) return;
			parents.set(k, b);
			visit(
				k,
				lists.map((list) => list[i] as Element),
			);
		});
	};
	visit(base, [...variants.values()]);
	return { searches, expressions, holds, unaligned, table };
}

const VARIANT_VALUES = 'queryValues';

// The row is read once into a local: Markless lowers no state read nested inside a table lookup.
export const VARIANT_DECLARATIONS = [`let ${VARIANT_STATE} = state('');`, `const ${VARIANT_VALUES} = computed(() => { const search = ${VARIANT_STATE}; return ${VARIANT_TABLE}[search] ?? ${VARIANT_TABLE}['']!; });`];

export const variantValue = (key: string): string => `${VARIANT_VALUES}.${key}`;

/** The page's handler that picks its variant once it runs: a query no variant was captured for shows the base, as the old switch's default did. */
export const VARIANT_PICK = `onVisible={() => { ${VARIANT_STATE} = Object.hasOwn(${VARIANT_TABLE}, location.search) ? location.search : ''; }}`;
