import { attr, outer, walk, type Element } from './dom.ts';
import { GENERATED_ID } from './factor.ts';
import { APP_URL_TOKEN, emitElement, lit, type Binding } from './tsrx.ts';
import { createHash } from 'node:crypto';
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

// A modal open at load marks the body's other children hidden (aria-hidden, Base UI's inert): the same child, in its at-rest look.
const MODAL_MARKS = / (?:aria-hidden|data-aria-hidden|data-base-ui-inert|inert)(?:="[^"]*")?(?=[\s/>])/g;
const keyOf = (el: Element) => {
	const html = outer(el).replace(GENERATED_ALL, '@id');
	const open = html.indexOf('>') + 1;
	return html.slice(0, open).replace(MODAL_MARKS, '') + html.slice(open);
};

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
function sharedMarkup(c: Common, table: Record<string, Record<string, string>>, column: { n: number }, bind: (el: Element) => Binding | undefined, dropped: (what: string) => void, read = (key: string) => `values[${lit(key)}]`): string {
	const lists = new Map([...c.byRoute].map(([route, el]) => [route, [...walk(el)]]));
	const reference = [...walk(c.el)];
	const expressions = new Map<Element, Record<string, string>>();
	reference.forEach((el, i) => {
		for (const a of el.attrs) {
			const values = [...lists].map(([route, list]) => [route, attr(list[i]!, a.name) ?? ''] as const);
			if (values.every(([, v]) => v === values[0]![1])) continue;
			const key = `b${column.n++}`;
			for (const [route, v] of values) (table[route] ??= {})[key] = v;
			(expressions.get(el) ?? expressions.set(el, {}).get(el)!)[a.name] = read(key);
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

export function documentModule(split: BodySplit, bind: (el: Element) => Binding | undefined, dropped: (what: string) => void, partsDir: string, parts: readonly PartUse[], headScripts: readonly (string | { readonly name: string; readonly attributes: string })[] = []): string {
	const table: Record<string, Record<string, string>> = {};
	const column = { n: 0 };
	const before = split.before.map((c) => sharedMarkup(c, table, column, bind, dropped));
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
			}${headScripts.map((h) => (typeof h === 'string' ? `\n\t\t\t<script>{${h}}</script>` : `\n\t\t\t<script ${h.attributes}>{${h.name}}</script>`)).join('')}
		</head>
		<body${bodyNames.map((n) => ` ${n}={${attrExpr('page.body', n)}}`).join('')}>
			${before.join('\n\t\t\t')}
			{children}
			<BodyExtras route={route} />
			@for (const href of page.late; key href) {
				<link rel="stylesheet" href={href} />
			}
		</body>
	</Html>
}
`;
}

/** Each distinct layer a page's controls portal, written once as a component in `layers/`. */
export interface LayerTable {
	readonly files: readonly { readonly file: string; readonly source: string }[];
	/** The large layers' markup as HTML files, by path under public/: their component renders a placeholder that names the file. */
	readonly served: readonly { readonly path: string; readonly html: string }[];
	/** The layers every page portals alike (the search palette), rendered by the Document. */
	readonly everywhere: readonly string[];
	/** The components of the layers only some pages portal, for a route: rendered by the page after its own content. */
	own(route: string): readonly string[];
	/** A served layer's file, and its markup with the file given as an expression: two whose `shell` is alike differ only in their file. */
	servedLayer(name: string): { readonly path: string; readonly shell: string; readonly markup: (src: string) => string } | undefined;
	/** The key a layer opens by, and the length of its markup. */
	layerOf(name: string): { readonly key: string; readonly bytes: number } | undefined;
}

/**
 * A layer at least this long (tsrx source) is not rendered into the pages that portal it: like the old page, which
 * mounted it on use, a page carries its shell in a <template> and the file holding the rest, fetched as the page loads;
 * the parts mount the shell on use and fill it when the file is in (the search palette: 450 kB on every page otherwise).
 */
export const SERVED_LAYER_BYTES = 16_384;

/** Where a served layer's shell takes its content: the shell's mark, given the file's path once it is known. */
export const LAYER_FILL = '@@MM_LAYER_FILL@@';

export function layerTable(layers: ReadonlyMap<string, readonly { readonly key: string; readonly markup: string; readonly shell: string; readonly fill: string; readonly declare?: readonly string[]; readonly imports?: readonly string[] }[]>): LayerTable {
	const ids = new Map<string, number>();
	const files: { file: string; source: string }[] = [];
	const served: { path: string; html: string }[] = [];
	const layerOf = new Map([...layers.values()].flat().map((l) => [l.markup, l]));
	const servedBy = new Map<string, { path: string; shell: string; markup: (src: string) => string }>();
	const info = new Map<string, { key: string; bytes: number }>();
	const nameOf = (markup: string) => {
		if (!ids.has(markup)) {
			const n = ids.size;
			ids.set(markup, n);
			const layer = layerOf.get(markup);
			if (layer) info.set(`Layer${n}`, { key: layer.key, bytes: markup.length });
			// A layer that holds state (a date picker's calendar) declares it in its component; it is never served as a file.
			let body = `${(layer?.declare ?? []).map((line) => `\t${line}\n`).join('')}\t<>${markup}</>\n`;
			// A layer a site component stands in for is served whatever its size: the component renders the shell, and the file holds the rest.
			if ((markup.length >= SERVED_LAYER_BYTES || layer?.imports?.length) && layer?.fill && !layer.declare?.length) {
				// A directory's index: every static host serves /<hash>/ without the redirect Cloudflare answers <hash>.html with.
				const path = `/_converted/layers/${createHash('sha256').update(layer.fill).digest('hex').slice(0, 16)}/`;
				served.push({ path, html: layer.fill });
				const keys = [...new Set([...layer.shell.matchAll(/ data-mm-layer="([^"]*)"/g)].map((m) => m[1]!))];
				const origin = layer.fill.includes(APP_URL_TOKEN) || layer.shell.includes(APP_URL_TOKEN) ? ' data-mm-app-url={APP_URL}' : '';
				const shell = layer.shell.split(LAYER_FILL).join(path);
				const servedMarkup = (src: string) => `<link rel="preload" href=${src} as="fetch" crossorigin="anonymous" fetchpriority="low" /><template data-mm-layer-src=${src} data-mm-layer-keys=${lit(keys.join(' '))}${origin}>${layer.imports?.length ? '' : shell}</template>${layer.imports?.length ? shell : ''}`;
				// The file is fetched while the page loads, at low priority, and the parts' fetch of it takes that response.
				body = `${origin ? `\tconst APP_URL: string = import.meta.env.VITE_APP_URL ?? '';\n` : ''}\t<>${servedMarkup(lit(path))}</>\n`;
				if (!origin && !layer.imports?.length) servedBy.set(`Layer${n}`, { path, shell: JSON.stringify([layer.shell, keys]), markup: (src) => servedMarkup(`{${src}}`) });
			}
			const stateImport = layer?.declare?.some((line) => /\bstate\(/.test(line)) ? "import { state } from '@markless/core';\n" : '';
			const siteImports = (layer?.imports ?? []).map((line) => `${line}\n`).join('');
			files.push({ file: `layers/layer-${n}.tsrx`, source: `// Generated by markless-migrate convert from the old site; change the converter, not this file.\n${stateImport}${siteImports}export default function Layer${n}() @{\n${body}}\n` });
		}
		return `Layer${ids.get(markup)}`;
	};
	const routes = [...layers.keys()];
	// The router never wires the Document in the browser, so a layer with a site component or state stays in its pages.
	const plain = (l: { readonly imports?: readonly string[]; readonly declare?: readonly string[] }) => !l.imports?.length && !l.declare?.length;
	const everywhere = (layers.get(routes[0] ?? '') ?? []).filter((l) => plain(l) && routes.every((r) => layers.get(r)?.some((x) => x.markup === l.markup))).map((l) => l.markup);
	const shared = new Set(everywhere);
	const top = everywhere.map((m) => nameOf(m));
	const own = new Map(routes.map((r) => [r, [...new Set((layers.get(r) ?? []).filter((l) => !shared.has(l.markup)).map((l) => nameOf(l.markup)))]]));
	return { files, served, everywhere: top, own: (route) => own.get(route) ?? [], servedLayer: (name) => servedBy.get(name), layerOf: (name) => info.get(name) };
}

/**
 * A page's markup: its root, then what it renders after it (body children, layers) in the old body's order. A toaster
 * renders outside a branch (its repeat nests a repeat), the rest in branches on `shown`, one per run between toasters.
 */
export function pageBody(root: string, after: readonly { readonly markup: string; readonly toaster?: boolean }[], shown: string): string {
	if (!after.some((a) => a.markup)) return root;
	const runs: { markup: string; toaster: boolean }[] = [];
	for (const a of after) {
		if (!a.markup) continue;
		const last = runs.at(-1);
		if (last && !last.toaster && !a.toaster) last.markup += a.markup;
		else runs.push({ markup: a.markup, toaster: Boolean(a.toaster) });
	}
	return `<>@if (${shown}) { ${root} }${runs.map((r) => (r.toaster ? r.markup : `@if (${shown}) { <>${r.markup}</> }`)).join('')}</>`;
}

/**
 * The body children every page has after its own content (the toast regions), as one component each page renders
 * after its root and before the layers it portals: what a page opens lands after them, as a portal at the end of the
 * old body did. Undefined when there are none.
 */
export function bodyAfterModule(split: BodySplit, bind: (el: Element) => Binding | undefined, dropped: (what: string) => void, ranged = false, keys?: Map<string, string>): string | undefined {
	if (!split.after.length) return undefined;
	const table: Record<string, Record<string, string>> = {};
	const column = { n: 0 };
	// A query's page that shows what its path's page shows reads the path's values: `keys` names the route each page passes.
	const shared = () => {
		for (const route of new Set(split.after.flatMap((c) => [...c.byRoute.keys()]))) {
			const path = route.split('?')[0]!;
			if (path !== route && JSON.stringify(table[path] ?? {}) === JSON.stringify(table[route] ?? table[path] ?? {})) {
				delete table[route];
				keys?.set(route, path);
			}
		}
		return JSON.stringify(table);
	};
	if (!ranged) {
		const after = split.after.map((c) => sharedMarkup(c, table, column, bind, dropped));
		return `// Generated by markless-migrate convert from the old site; change the converter, not this file.
const AFTER_VALUES: Readonly<Record<string, Readonly<Record<string, string>>>> = ${shared()};

export default function BodyAfter({ route }: { readonly route: string }) @{
	const values = AFTER_VALUES[route] ?? AFTER_VALUES[route.split('?')[0] ?? '/'] ?? {};
	void values;
	<>${after.join('')}</>
}
`;
	}
	// A page that shows notifications renders their region itself, between the rest, which it renders one child at a time.
	const parts = split.after.map((c, i) => `export function BodyAfter${i}({ route }: { readonly route: string }) @{
	const values = AFTER_VALUES[route] ?? AFTER_VALUES[route.split('?')[0] ?? '/'] ?? {};
	void values;
	<>${sharedMarkup(c, table, column, bind, dropped)}</>
}
`);
	return `// Generated by markless-migrate convert from the old site; change the converter, not this file.
const AFTER_VALUES: Readonly<Record<string, Readonly<Record<string, string>>>> = ${shared()};

${parts.join('\n')}
export default function BodyAfter({ route }: { readonly route: string }) @{
	<>${split.after.map((_, i) => `<BodyAfter${i} route={route} />`).join('')}</>
}
`;
}

/**
 * The body children only some pages have (a measuring element a library left), per route, and the layers every page
 * portals alike. The layers only some pages portal are the pages' own (`LayerTable.own`), so each page's server code
 * carries only its own layers.
 */
/** The routes whose body children outside the page root hold something to wire: the page renders those, not the Document. */
export function pagesWiring(extras: ReadonlyMap<string, readonly Element[]>, wired: (el: Element) => boolean): Map<string, Element[]> {
	return new Map([...extras].filter(([, els]) => els.some((el) => [...walk(el)].some(wired))).map(([route, els]) => [route, [...els]]));
}

export function extrasModule(split: BodySplit, dropped: (what: string) => void, table: LayerTable, bind?: (el: Element) => Binding | undefined): string {
	const cases = [...split.extras.keys()];
	const arms = cases.map((route) => `\t\t\t@case ${lit(route)}: {\n\t\t\t\t<>${(split.extras.get(route) ?? []).map((el) => emitElement(el, { dropped, ...(bind ? { bind } : {}) })).join('')}</>\n\t\t\t}`).join('\n');
	const imports = table.everywhere.map((name) => `import ${name} from './layers/${name.replace(/^Layer/, 'layer-')}.tsrx';`).join('\n');
	// Components in a fragment root render only inside branches: the layers sit in one on a module constant.
	const top = table.everywhere.length ? `@if (SHOWN) { <>${table.everywhere.map((n) => `<${n} />`).join('')}</> }` : '';
	return `// Generated by markless-migrate convert from the old site; change the converter, not this file.
${imports}
const SHOWN = true;

export default function BodyExtras({ route }: { readonly route: string }) @{
	<>
		${top}
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
	readonly late: readonly string[];
}

export function headOf(page: { readonly href: string } | undefined): PageHead {
	const url = page ? new URL(page.href) : undefined;
	// A page prerendered at build is rendered by a local server, so its own URLs name the site's public origin when the build has one.
	const origin = import.meta.env.VITE_APP_URL || (url ? url.origin : '');
	// A path no route has is the not-found page's.
	const route = (url && (ROUTES[url.pathname + url.search] ?? ROUTES[url.pathname] ?? ROUTES['/_markless-migrate/not-found'])) ?? ROUTES['/'];
	if (!route) return { html: {}, body: {}, tags: [], late: [] };
	return {
		html: route.html,
		body: route.body,
		late: route.late ?? [],
		tags: route.tags.map((id, key) => {
			const t = TAGS[id]!;
			const a: Record<string, string | undefined> = { ...t.attrs };
			for (const [name, path] of Object.entries(t.self ?? {})) a[name] = origin + path;
			return { key, tag: t.tag, a, text: t.text ?? '' };
		}),
	};
}
`;
