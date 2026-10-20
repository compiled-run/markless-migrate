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

const digest = (text: string) => createHash('sha1').update(text).digest('base64url');

function index(route: string, path: string, root: Element, extra?: (el: Element) => string | undefined): Indexed {
	const hash = new Map<Element, string>();
	const size = new Map<Element, number>();
	const visit = (el: Element): [string, number] => {
		let bytes = el.tagName.length * 2 + 5;
		const parts: string[] = [el.tagName];
		// A link's other attributes may mark the current page (data-active, aria-current, a class): they are left out of
		// the hash, and the component writes each as an expression of the path.
		const link = el.tagName === 'a' && attr(el, 'href') !== undefined;
		for (const a of el.attrs) {
			bytes += a.name.length + a.value.length + 4;
			if (link && a.name !== 'href') parts.push(`${a.name}=@link`);
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
		const appended = extra?.(el);
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

/**
 * Finds the regions several pages render alike (a header, a sidebar, a footer), the largest first, and writes each as one
 * component taking the page's path. What differs between the pages that share one is either the current page's link
 * (written as `path === href`) or a value looked up by path.
 */
export function factor(roots: ReadonlyMap<string, Element>, options: { readonly bind?: EmitOptions['bind']; readonly dir?: string; readonly extra?: (el: Element) => string | undefined } = {}): Factored {
	const pages = [...roots].map(([route, root]) => index(route, new URL(route, 'http://x').pathname, root, options.extra));
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
			for (const child of childrenOf(el)) if (isElement(child)) select(child);
		};
		select(page.root);
	}
	const byElement = new Map<Element, { component: SharedComponent; page: Indexed }>();
	const usedBy = new Map<string, SharedComponent[]>();
	const components: SharedComponent[] = [];
	const names = new Map<string, number>();
	const dir = options.dir ?? 'components/converted';
	for (const cluster of [...clusters.values()].filter((c) => c.members.length >= 2)) {
		const first = cluster.members[0]!.el;
		const base = regionName(first);
		const n = (names.get(base) ?? 0) + 1;
		names.set(base, n);
		const name = pascal(`${base}${n > 1 ? `-${n}` : ''}`);
		const file = `${dir}/${base}${n > 1 ? `-${n}` : ''}.tsrx`;
		const lists = cluster.members.map((m) => elementsOf(m.el));
		const reference = lists[0]!;
		const expressions = new Map<Element, Record<string, string>>();
		const table: Record<string, Record<string, string>> = {};
		let column = 0;
		reference.forEach((el, i) => {
			const exprs: Record<string, string> = {};
			const names = new Set(lists.flatMap((list) => list[i]!.attrs.map((a) => a.name)));
			for (const attrName of names) {
				const values = cluster.members.map((m, k) => ({ path: m.page.path, el: lists[k]![i]!, value: attr(lists[k]![i]!, attrName) }));
				if (values.every((v) => v.value === values[0]!.value)) continue;
				const href = el.tagName === 'a' ? attr(el, 'href')?.split('#')[0] : undefined;
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
				const key = `v${column++}`;
				for (const v of values) (table[v.path] ??= {})[key] = v.value ?? '';
				exprs[attrName] = `values[${lit(key)}]`;
			}
			if (Object.keys(exprs).length) expressions.set(el, exprs);
		});
		const markup = emitElement(first, {
			bind: (el) => {
				const own = options.bind?.(el);
				const exprs = expressions.get(el);
				if (!exprs) return own;
				return { ...own, expressions: { ...own?.expressions, ...exprs } };
			},
		});
		const hasTable = Object.keys(table).length > 0;
		const source = `// Generated by markless-migrate convert from the old site; change the converter, not this file. (shared by ${cluster.members.length} pages)
${hasTable ? `const VALUES: Readonly<Record<string, Readonly<Record<string, string>>>> = ${JSON.stringify(table)};\n\n` : ''}export default function ${name}({ path }: { readonly path: string }) @{
${hasTable ? '\tconst values = VALUES[path] ?? {};\n' : ''}${markup.includes('path ===') ? '' : '\tvoid path;\n'}
	${markup}
}
`;
		const component: SharedComponent = { name, file, source, pages: cluster.members.length };
		components.push(component);
		for (const m of cluster.members) {
			byElement.set(m.el, { component, page: m.page });
			(usedBy.get(m.page.route) ?? usedBy.set(m.page.route, []).get(m.page.route)!).push(component);
		}
	}
	return {
		components,
		binding: (_route, el) => {
			const hit = byElement.get(el);
			return hit ? { replace: `<${hit.component.name} path={path} />` } : undefined;
		},
		used: (route) => usedBy.get(route) ?? [],
	};
}

function optional(value: string | undefined): string {
	return value === undefined ? 'undefined' : lit(value);
}
