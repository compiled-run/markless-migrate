import { attr, outer, walk, type Element } from './dom.ts';
import { GENERATED_ID } from './factor.ts';
import { emitElement, lit, type Binding } from './tsrx.ts';
import type { PartUse } from './parts.ts';

const GENERATED_ALL = new RegExp(GENERATED_ID.source, 'g');
const TAG_KINDS = ['meta', 'link', 'title', 'script', 'base'] as const;

export interface PreparedBody {
	readonly route: string;
	readonly before: readonly Element[];
	readonly after: readonly Element[];
	readonly htmlAttrs: Readonly<Record<string, string>>;
	readonly bodyAttrs: Readonly<Record<string, string>>;
	readonly head: readonly { readonly tag: string; readonly attrs: Readonly<Record<string, string>> }[];
}

interface Common {
	readonly el: Element;
	readonly key: string;
	/** Per route, the element that route has in this place. */
	readonly byRoute: ReadonlyMap<string, Element>;
}

export interface BodySplit {
	readonly pages: readonly PreparedBody[];
	readonly before: readonly Common[];
	readonly after: readonly Common[];
	/** Per route, the body children around the page that other pages do not have. */
	readonly extras: ReadonlyMap<string, readonly Element[]>;
}

const keyOf = (el: Element) => outer(el).replace(GENERATED_ALL, '@id');

function common(pages: readonly PreparedBody[], side: 'before' | 'after'): Common[] {
	const first = pages[0];
	if (!first) return [];
	const out: Common[] = [];
	for (const el of first[side]) {
		const key = keyOf(el);
		const byRoute = new Map<string, Element>();
		for (const page of pages) {
			const match = page[side].find((other) => keyOf(other) === key);
			if (match) byRoute.set(page.route, match);
		}
		if (byRoute.size === pages.length) out.push({ el, key, byRoute });
	}
	return out;
}

/** Splits the body children around each page's own root into the document's (on every page alike) and each page's extras. */
export function splitBody(prepared: ReadonlyMap<string, PreparedBody>): BodySplit {
	const pages = [...prepared.values()];
	const before = common(pages, 'before');
	const after = common(pages, 'after');
	const taken = new Set([...before, ...after].flatMap((c) => [...c.byRoute.values()]));
	const extras = new Map<string, Element[]>();
	for (const page of pages) {
		const own = [...page.before, ...page.after].filter((el) => !taken.has(el));
		if (own.length) extras.set(page.route, own);
	}
	return { pages, before, after, extras };
}

/** The document's markup for one shared body child: its generated ids read per route. */
function sharedMarkup(c: Common, table: Record<string, Record<string, string>>, column: { n: number }, bind: (el: Element) => Binding | undefined, dropped: (what: string) => void): string {
	const lists = new Map([...c.byRoute].map(([route, el]) => [route, [...walk(el)]]));
	const reference = [...walk(c.el)];
	const expressions = new Map<Element, Record<string, string>>();
	reference.forEach((el, i) => {
		for (const a of el.attrs) {
			const values = [...lists].map(([route, list]) => [route, attr(list[i]!, a.name) ?? ''] as const);
			if (values.every(([, v]) => v === values[0]![1])) continue;
			const key = `b${column.n++}`;
			for (const [route, v] of values) (table[route] ??= {})[key] = v;
			(expressions.get(el) ?? expressions.set(el, {}).get(el)!)[a.name] = `values[${lit(key)}]`;
		}
	});
	return emitElement(c.el, {
		bind: (el) => {
			const own = bind(el);
			const exprs = expressions.get(el);
			return exprs ? { ...own, expressions: { ...own?.expressions, ...exprs } } : own;
		},
		dropped,
	});
}

function attributeNames(records: readonly Readonly<Record<string, string>>[]): string[] {
	return [...new Set(records.flatMap((r) => Object.keys(r)))].filter((n) => /^[A-Za-z_][\w.:-]*$/.test(n));
}

const attrExpr = (object: string, name: string) => (/^[A-Za-z_$][\w$]*$/.test(name) ? `${object}.${name}` : `${object}[${lit(name)}]`);

export function documentModule(split: BodySplit, bind: (el: Element) => Binding | undefined, dropped: (what: string) => void, partsDir: string, parts: readonly PartUse[]): string {
	const table: Record<string, Record<string, string>> = {};
	const column = { n: 0 };
	const before = split.before.map((c) => sharedMarkup(c, table, column, bind, dropped));
	const after = split.after.map((c) => sharedMarkup(c, table, column, bind, dropped));
	const htmlNames = attributeNames(split.pages.map((p) => p.htmlAttrs));
	const bodyNames = attributeNames(split.pages.map((p) => p.bodyAttrs));
	const tagNames = (kind: string) => attributeNames(split.pages.flatMap((p) => p.head.filter((t) => t.tag === kind).map((t) => t.attrs)));
	const boolean = new Set(['async', 'defer', 'nomodule', 'crossorigin-bool']);
	const tagMarkup = (kind: (typeof TAG_KINDS)[number]) => {
		const names = tagNames(kind);
		const list = names.map((n) => (boolean.has(n) ? ` ${n}={tag.a[${lit(n)}] !== undefined}` : ` ${n}={${attrExpr('tag.a', n)}}`)).join('');
		if (kind === 'title') return `<title${list}>{tag.text}</title>`;
		if (kind === 'script') return `<script${list}>{tag.text}</script>`;
		return `<${kind}${list} />`;
	};
	const kinds = TAG_KINDS.filter((k) => split.pages.some((p) => p.head.some((t) => t.tag === k)));
	const arms = `\t\t\t\t@switch (tag.tag) {\n${kinds.map((k) => `\t\t\t\t\t@case ${lit(k)}: {\n\t\t\t\t\t\t${tagMarkup(k)}\n\t\t\t\t\t}`).join('\n')}\n\t\t\t\t}`;
	const extrasAt = Math.min(1, after.length);
	const imports = [...new Set(parts.map((p) => p.import(partsDir)).filter(Boolean))];

	return `// Generated by markless-migrate convert from the old site; change the converter, not this file.
import type { Children } from '@markless/core';
import { Html } from '@markless/router';
import { headOf } from './head.ts';
import BodyExtras from './components/converted/body-extras.tsrx';
${imports.join('\n')}${imports.length ? '\n' : ''}
const BODY_VALUES: Readonly<Record<string, Readonly<Record<string, string>>>> = ${JSON.stringify(table)};

export default function Document({ url, children }: { readonly url?: { readonly href: string; readonly pathname: string; readonly search: string }; readonly children?: Children }) @{
	const page = headOf(url);
	const route = url ? url.pathname + url.search : '/';
	const values = BODY_VALUES[route] ?? BODY_VALUES[url?.pathname ?? '/'] ?? {};

	<Html${htmlNames.map((n) => ` ${n}={${attrExpr('page.html', n)}}`).join('')}>
		<head>
			@for (const tag of page.tags; key tag.key) {
${arms}
			}
		</head>
		<body${bodyNames.map((n) => ` ${n}={${attrExpr('page.body', n)}}`).join('')}>
			${before.join('\n\t\t\t')}
			{children}
			${after.slice(0, extrasAt).join('\n\t\t\t')}
			<BodyExtras route={route} />
			${after.slice(extrasAt).join('\n\t\t\t')}
		</body>
	</Html>
}
`;
}

/** Each distinct layer a page's controls portal, written once as a component in `layers/`. */
export interface LayerTable {
	readonly files: readonly { readonly file: string; readonly source: string }[];
	/** The layers every page portals alike (the search palette), rendered by the Document. */
	readonly everywhere: readonly string[];
	/** The components of the layers only some pages portal, for a route: rendered by the page after its own content. */
	own(route: string): readonly string[];
}

export function layerTable(layers: ReadonlyMap<string, readonly { readonly key: string; readonly markup: string }[]>): LayerTable {
	const ids = new Map<string, number>();
	const files: { file: string; source: string }[] = [];
	const nameOf = (markup: string) => {
		if (!ids.has(markup)) {
			const n = ids.size;
			ids.set(markup, n);
			files.push({ file: `layers/layer-${n}.tsrx`, source: `// Generated by markless-migrate convert from the old site; change the converter, not this file.\nexport default function Layer${n}() @{\n\t<>${markup}</>\n}\n` });
		}
		return `Layer${ids.get(markup)}`;
	};
	const routes = [...layers.keys()];
	const everywhere = (layers.get(routes[0] ?? '') ?? []).filter((l) => routes.every((r) => layers.get(r)?.some((x) => x.markup === l.markup))).map((l) => l.markup);
	const shared = new Set(everywhere);
	const top = everywhere.map((m) => nameOf(m));
	const own = new Map(routes.map((r) => [r, [...new Set((layers.get(r) ?? []).filter((l) => !shared.has(l.markup)).map((l) => nameOf(l.markup)))]]));
	return { files, everywhere: top, own: (route) => own.get(route) ?? [] };
}

/**
 * The body children only some pages have (a measuring element a library left), per route, and the layers every page
 * portals alike. The layers only some pages portal are the pages' own (`LayerTable.own`), so each page's server code
 * carries only its own layers.
 */
export function extrasModule(split: BodySplit, dropped: (what: string) => void, table: LayerTable): string {
	const cases = [...split.extras.keys()];
	const arms = cases.map((route) => `\t\t\t@case ${lit(route)}: {\n\t\t\t\t<>${(split.extras.get(route) ?? []).map((el) => emitElement(el, { dropped })).join('')}</>\n\t\t\t}`).join('\n');
	const imports = table.everywhere.map((name) => `import ${name} from './layers/${name.replace(/^Layer/, 'layer-')}.tsrx';`).join('\n');
	return `// Generated by markless-migrate convert from the old site; change the converter, not this file.
${imports}

export default function BodyExtras({ route }: { readonly route: string }) @{
	<>
		${table.everywhere.map((n) => `<${n} />`).join('\n\t\t')}
		@switch (route) {
${arms}
			@default: {
				<>{null}</>
			}
		}
	</>
}
`;
}

export const HEAD_HELPER = `// Generated by markless-migrate convert from the old site; change the converter, not this file.
import { ROUTES, TAGS } from './heads.ts';

export interface PageHead {
	readonly html: Readonly<Record<string, string>>;
	readonly body: Readonly<Record<string, string>>;
	readonly tags: readonly { readonly key: number; readonly tag: string; readonly a: Readonly<Record<string, string | undefined>>; readonly text: string }[];
}

export function headOf(page: { readonly href: string } | undefined): PageHead {
	const url = page ? new URL(page.href) : undefined;
	const route = (url && (ROUTES[url.pathname + url.search] ?? ROUTES[url.pathname])) ?? ROUTES['/'];
	if (!route) return { html: {}, body: {}, tags: [] };
	return {
		html: route.html,
		body: route.body,
		tags: route.tags.map((id, key) => {
			const t = TAGS[id]!;
			const a: Record<string, string | undefined> = { ...t.attrs };
			for (const [name, path] of Object.entries(t.self ?? {})) a[name] = url ? url.origin + path : path;
			return { key, tag: t.tag, a, text: t.text ?? '' };
		}),
	};
}
`;
