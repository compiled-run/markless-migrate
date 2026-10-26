import { createHash } from 'node:crypto';
import { attr, childrenOf, isElement, type Element, type Text } from './dom.ts';
import { emitElement, lit, type Binding, type EmitOptions } from './tsrx.ts';

export interface SharedComponent {
	readonly name: string;
	readonly file: string;
	readonly source: string;
	readonly pages: number;
}

export interface Factored {
	readonly components: readonly SharedComponent[];
	binding(route: string, el: Element): Binding | undefined;
	used(route: string): readonly SharedComponent[];
}

/** Values a framework generates per render position (React's useId, Radix's and React Aria's ids built on it). */
export const GENERATED_ID = /_[Rr]_[\w-]*_|«r[\w]+»|:r[\w]+:|react-aria\d*-[\w:-]+|\bbase-ui-[\w:-]*\d/;

const MIN_SHARED = 2048;
const GENERATED_ALL = new RegExp(GENERATED_ID.source, 'g');

/** A page's path and its elements' hashes and sizes. */
interface Indexed {
	readonly route: string;
	readonly path: string;
	readonly root: Element;
	readonly hash: Map<Element, string>;
	readonly size: Map<Element, number>;
}

export interface RegionOptions {
	readonly extra?: (el: Element) => string | undefined;
	/** Whether pages may differ in this attribute's value and still share the region (by default: a link's attributes besides its href). */
	readonly varies?: (el: Element, name: string) => boolean;
	/** An element that is each page's own (the page's content, a template): never shared, nor any region holding it. */
	readonly skip?: (el: Element) => boolean;
	/** The region's name, before the default (its data-slot, aria-label, id or landmark tag). */
	readonly name?: (el: Element) => string | undefined;
}

/** One region several pages render alike: its markup is `element` (the first page's copy) with `expressions` of `path` for what differs. */
export interface SharedRegion {
	readonly name: string;
	readonly base: string;
	readonly element: Element;
	readonly expressions: ReadonlyMap<Element, Readonly<Record<string, string>>>;
	/** Values no expression of the path gives, by path: the component reads them as `values[key]` from `VALUES[path]`. */
	readonly table: Readonly<Record<string, Readonly<Record<string, string>>>>;
	readonly members: readonly { readonly route: string; readonly path: string; readonly element: Element }[];
}

const digest = (text: string) => createHash('sha1').update(text).digest('base64url');

const linkAttributes = (el: Element, name: string) => el.tagName === 'a' && name !== 'href' && attr(el, 'href') !== undefined;

function index(route: string, path: string, root: Element, options: RegionOptions): Indexed {
	const hash = new Map<Element, string>();
	const size = new Map<Element, number>();
	const varies = options.varies ?? linkAttributes;
	const visit = (el: Element): [string, number] => {
		let bytes = el.tagName.length * 2 + 5;
		const parts: string[] = [el.tagName];
		if (el !== root && options.skip?.(el)) parts.push(`!${route}`);
		else {
			for (const a of el.attrs) {
				bytes += a.name.length + a.value.length + 4;
				if (varies(el, a.name)) parts.push(`${a.name}=@varies`);
				else parts.push(`${a.name}=${GENERATED_ID.test(a.value) ? '@id' : a.value}`);
			}
			for (const child of childrenOf(el)) {
				if (isElement(child)) {
					const [h, n] = visit(child);
					parts.push(h);
					bytes += n;
				} else if (child.nodeName === '#text') {
					const t = (child as Text).value;
					parts.push(`#${t}`);
					bytes += t.length;
				}
			}
		}
		const appended = options.extra?.(el);
		if (appended) {
			parts.push(`+${appended.replace(GENERATED_ALL, '@id')}`);
			bytes += appended.length;
		}
		const h = digest(parts.join('\u0000'));
		hash.set(el, h);
		size.set(el, bytes);
		return [h, bytes];
	};
	visit(root);
	return { route, path, root, hash, size };
}

function elementsOf(root: Element): Element[] {
	const out: Element[] = [];
	const visit = (el: Element) => {
		out.push(el);
		for (const child of childrenOf(el)) if (isElement(child)) visit(child);
	};
	visit(root);
	return out;
}

const slug = (text: string) =>
	text
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '')
		.slice(0, 40) || 'region';

const pascal = (text: string) =>
	text
		.split('-')
		.map((w) => w.charAt(0).toUpperCase() + w.slice(1))
		.join('');

function regionName(el: Element): string {
	const named = attr(el, 'data-slot') ?? attr(el, 'aria-label') ?? attr(el, 'id') ?? (['header', 'footer', 'nav', 'aside', 'main'].includes(el.tagName) ? el.tagName : undefined);
	return slug(named ?? el.tagName);
}

interface Cluster {
	readonly hash: string;
	readonly members: { readonly page: Indexed; readonly el: Element }[];
}

type Value = { readonly path: string; readonly value: string | undefined };

// The value as `prefix + path + suffix`, when every page's value holds its own path at the same place.
function pathInside(values: readonly Value[]): string | undefined {
	const first = values[0]!;
	if (first.value === undefined) return undefined;
	for (let at = first.value.indexOf(first.path); at >= 0; at = first.value.indexOf(first.path, at + 1)) {
		const prefix = first.value.slice(0, at);
		const suffix = first.value.slice(at + first.path.length);
		// Markless renders an attribute that is a bare prop as a DOM update, which a kept part cannot hold; an expression of it is not one.
		if (values.every((v) => v.value === `${prefix}${v.path}${suffix}`)) return prefix || suffix ? [prefix && lit(prefix), 'path', suffix && lit(suffix)].filter(Boolean).join(' + ') : '`${path}`';
	}
	return undefined;
}

// The value most pages share, with the few that differ named by path.
function byPath(values: readonly Value[]): string | undefined {
	const groups = new Map<string | undefined, string[]>();
	for (const v of values) (groups.get(v.value) ?? groups.set(v.value, []).get(v.value)!).push(v.path);
	const ordered = [...groups].sort((a, b) => b[1].length - a[1].length);
	const [fallback, ...others] = ordered;
	if (others.length > 2 && others.reduce((n, [, paths]) => n + paths.length, 0) > Math.max(3, values.length / 4)) return undefined;
	return others.reduceRight((rest, [value, paths]) => `${paths.length === 1 ? `path === ${lit(paths[0]!)}` : `${JSON.stringify(paths)}.includes(path)`} ? ${optional(value)} : ${rest}`, optional(fallback![0]));
}

/**
 * Finds the regions several pages render alike (a header, a sidebar, a footer), the largest first. What differs between
 * the pages that share one becomes an expression of the page's path: the current page's link (`path === href`), the path
 * inside the value, the few pages whose value differs, or a value looked up by path.
 */
export function sharedRegions(roots: ReadonlyMap<string, Element>, options: RegionOptions = {}): SharedRegion[] {
	const pages = [...roots].map(([route, root]) => index(route, new URL(route, 'http://x').pathname, root, options));
	const pagesWith = new Map<string, Set<string>>();
	for (const page of pages) for (const [el, h] of page.hash) if (el !== page.root && page.size.get(el)! >= MIN_SHARED) (pagesWith.get(h) ?? pagesWith.set(h, new Set()).get(h)!).add(page.route);
	const clusters = new Map<string, Cluster>();
	for (const page of pages) {
		const select = (el: Element) => {
			const h = page.hash.get(el)!;
			if (el !== page.root && page.size.get(el)! >= MIN_SHARED && (pagesWith.get(h)?.size ?? 0) >= 2) {
				const cluster = clusters.get(h) ?? clusters.set(h, { hash: h, members: [] }).get(h)!;
				if (!cluster.members.some((m) => m.page === page)) cluster.members.push({ page, el });
				return;
			}
			if (el !== page.root && options.skip?.(el)) return;
			for (const child of childrenOf(el)) if (isElement(child)) select(child);
		};
		select(page.root);
	}
	const regions: SharedRegion[] = [];
	const names = new Map<string, number>();
	for (const cluster of [...clusters.values()].filter((c) => c.members.length >= 2)) {
		const first = cluster.members[0]!.el;
		const named = options.name?.(first);
		const kind = named ? slug(named) : regionName(first);
		const n = (names.get(kind) ?? 0) + 1;
		names.set(kind, n);
		const base = `${kind}${n > 1 ? `-${n}` : ''}`;
		const lists = cluster.members.map((m) => elementsOf(m.el));
		const reference = lists[0]!;
		const expressions = new Map<Element, Record<string, string>>();
		const table: Record<string, Record<string, string>> = {};
		let column = 0;
		reference.forEach((el, i) => {
			const exprs: Record<string, string> = {};
			const attrNames = new Set(lists.flatMap((list) => list[i]!.attrs.map((a) => a.name)));
			for (const attrName of attrNames) {
				const values = cluster.members.map((m, k) => ({ path: m.page.path, value: attr(lists[k]![i]!, attrName) }));
				if (values.every((v) => v.value === values[0]!.value)) continue;
				// A link's other attributes may mark the page it leads to; its own href never does.
				const href = el.tagName === 'a' && attrName !== 'href' ? attr(el, 'href')?.split('#')[0] : undefined;
				const current = values.filter((v) => href !== undefined && v.path === href);
				const other = values.filter((v) => !(href !== undefined && v.path === href));
				const uniform = (vs: typeof values) => vs.length > 0 && vs.every((v) => v.value === vs[0]!.value);
				if (href !== undefined && current.length && uniform(current) && uniform(other)) {
					exprs[attrName] = `path === ${lit(href)} ? ${optional(current[0]!.value)} : ${optional(other[0]!.value)}`;
					continue;
				}
				if (href !== undefined && current.length && !other.length) {
					exprs[attrName] = `path === ${lit(href)} ? ${optional(current[0]!.value)} : undefined`;
					continue;
				}
				const section = href !== undefined && href !== '/' ? values.filter((v) => v.path.startsWith(href)) : [];
				const outside = values.filter((v) => !section.includes(v));
				if (section.length && uniform(section) && uniform(outside) && section[0]!.value !== outside[0]!.value) {
					exprs[attrName] = `path.startsWith(${lit(href!)}) ? ${optional(section[0]!.value)} : ${optional(outside[0]!.value)}`;
					continue;
				}
				const derived = pathInside(values) ?? byPath(values);
				if (derived) {
					exprs[attrName] = derived;
					continue;
				}
				const key = `v${column++}`;
				for (const v of values) (table[v.path] ??= {})[key] = v.value ?? '';
				exprs[attrName] = `values[${lit(key)}]`;
			}
			if (Object.keys(exprs).length) expressions.set(el, exprs);
		});
		regions.push({ name: pascal(base), base, element: first, expressions, table, members: cluster.members.map((m) => ({ route: m.page.route, path: m.page.path, element: m.el })) });
	}
	return regions;
}

/** The module of a shared region's component, around its emitted markup: `({ path })`, its table of values when it needs one, and the statements its markup reads (`declarations`). */
export function regionModule(region: SharedRegion, markup: string, head: { readonly comment: string; readonly imports?: readonly string[]; readonly declarations?: readonly string[] }): string {
	const hasTable = Object.keys(region.table).length > 0;
	const usesPath = hasTable || [...region.expressions.values()].some((exprs) => Object.values(exprs).some((e) => /\bpath\b/.test(e)));
	return `${head.comment}
${[...(head.imports ?? [])].map((line) => `${line}\n`).join('')}${hasTable ? `const VALUES: Readonly<Record<string, Readonly<Record<string, string>>>> = ${JSON.stringify(region.table)};\n\n` : ''}export default function ${region.name}({ path }: { readonly path: string }) @{
${hasTable ? '\tconst values = VALUES[path] ?? {};\n' : ''}${(head.declarations ?? []).map((d) => `\t${d}\n`).join('')}${usesPath ? '' : '\tvoid path;\n'}
	${markup}
}
`;
}

/**
 * Writes each region several pages render alike as one component taking the page's path (see sharedRegions), for the
 * converter's pages.
 */
export function factor(roots: ReadonlyMap<string, Element>, options: { readonly bind?: EmitOptions['bind']; readonly dir?: string; readonly extra?: (el: Element) => string | undefined } = {}): Factored {
	const byElement = new Map<Element, SharedComponent>();
	const usedBy = new Map<string, SharedComponent[]>();
	const components: SharedComponent[] = [];
	const dir = options.dir ?? 'components/converted';
	for (const region of sharedRegions(roots, { extra: options.extra })) {
		const declarations: string[] = [];
		const markup = emitElement(region.element, {
			declarations,
			bind: (el) => {
				const own = options.bind?.(el);
				const exprs = region.expressions.get(el);
				if (!exprs) return own;
				return { ...own, expressions: { ...own?.expressions, ...exprs } };
			},
		});
		const source = regionModule(region, markup, {
			comment: `// Generated by markless-migrate convert from the old site; change the converter, not this file. (shared by ${region.members.length} pages)`,
			imports: declarations.length ? ["import { state } from '@markless/core';"] : [],
			declarations,
		});
		const component: SharedComponent = { name: region.name, file: `${dir}/${region.base}.tsrx`, source, pages: region.members.length };
		components.push(component);
		for (const m of region.members) {
			byElement.set(m.element, component);
			(usedBy.get(m.route) ?? usedBy.set(m.route, []).get(m.route)!).push(component);
		}
	}
	return {
		components,
		binding: (_route, el) => {
			const component = byElement.get(el);
			return component ? { replace: `<${component.name} path={path} />` } : undefined;
		},
		used: (route) => usedBy.get(route) ?? [],
	};
}

function optional(value: string | undefined): string {
	return value === undefined ? 'undefined' : lit(value);
}
