import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { attr, walk, type Element } from './dom.ts';
import { PORTS } from './parts.ts';

/**
 * A site's own client component, ported to Markless by hand (`lib/site/<file>.tsrx`), that stands in for the element of
 * a layer `selector` picks (`lib/site/components.json`). The component renders that element and everything in it, and
 * takes the file the layer's largest content is served from as its `fill` prop: it renders the element that content
 * goes into, `data-mm-layer-fill={fill}`.
 */
export interface SiteComponent {
	readonly selector: string;
	readonly component: string;
	/** `page`: it stands in for an element of the page itself (no layer, no `fill`), rendering what it shows itself. */
	readonly in?: 'page';
	/**
	 * A page component whose controls open what the old page portaled to the end of the body (menus, a drawer): the
	 * converter leaves those layers out, and the file's `Layers` export renders them there, with the page's layers.
	 */
	readonly layers?: boolean;
	/** Library ports its own markup uses that the old page's markup did not show (a palette opened only by a key). */
	readonly ports?: readonly string[];
}

export async function readSiteComponents(app: string): Promise<readonly SiteComponent[]> {
	const text = await readFile(join(app, 'lib', 'site', 'components.json'), 'utf8').catch(() => undefined);
	if (text === undefined) return [];
	const listed = JSON.parse(text) as SiteComponent[];
	for (const c of listed) {
		parseSelector(c.selector);
		if (!/^[a-z0-9-]+\.tsrx$/.test(c.component)) throw new Error(`lib/site/components.json: "${c.component}" is not a .tsrx file in lib/site`);
		for (const port of c.ports ?? []) if (!PORTS.some((p) => p.module === port)) throw new Error(`lib/site/components.json: ${c.component} names "${port}", which is not a library port`);
		if (c.layers && c.in !== 'page') throw new Error(`lib/site/components.json: ${c.component} renders its own layers ("layers") but is not "in": "page"`);
	}
	return listed;
}

/** The library parts the site's own code imports (`lib/site`, `from '../parts/<module>.ts'`): the app needs their files whether or not a page's markup uses them. */
export async function siteImportedParts(app: string): Promise<string[]> {
	const dir = join(app, 'lib', 'site');
	const names = await readdir(dir).catch(() => [] as string[]);
	const modules = new Set<string>();
	for (const name of names.filter((n) => /\.(ts|tsrx)$/.test(n))) {
		for (const m of (await readFile(join(dir, name), 'utf8')).matchAll(/from\s+'\.\.\/parts\/([\w/-]+)\.ts'/g)) modules.add(m[1]!);
	}
	return [...modules].sort();
}

/** The component's import name: its file name in PascalCase (`command-menu.tsrx` is CommandMenu). */
export const componentName = (c: SiteComponent): string =>
	c.component
		.replace(/\.tsrx$/, '')
		.split('-')
		.map((w) => w.charAt(0).toUpperCase() + w.slice(1))
		.join('');

/** The name a page component's `Layers` export is imported as (`TypesetLayers` for `typeset.tsrx`). */
export const layersName = (c: SiteComponent): string => `${componentName(c)}Layers`;

export const componentImport = (c: SiteComponent, fromDir: string): string => `import ${componentName(c)}${c.layers ? `, { Layers as ${layersName(c)} }` : ''} from '${fromDir}/lib/site/${c.component}';`;

interface Compound {
	readonly tag?: string;
	readonly attrs: readonly { readonly name: string; readonly value?: string }[];
	readonly has: readonly Compound[];
}

// The selectors a site lists: a compound of a tag and attribute tests, each `:has()` naming a descendant the same way.
function parseSelector(selector: string): Compound {
	let at = 0;
	const fail = (): never => {
		throw new Error(`lib/site/components.json: "${selector}" is not a tag with [attribute], [attribute="value"] and :has() tests`);
	};
	const compound = (): Compound => {
		const tag = /^[a-z][a-z0-9-]*/i.exec(selector.slice(at))?.[0];
		if (tag) at += tag.length;
		const attrs: { name: string; value?: string }[] = [];
		const has: Compound[] = [];
		for (;;) {
			const test = /^\[([^\s=\]"]+)(?:="([^"]*)")?\]/.exec(selector.slice(at));
			if (test) {
				attrs.push(test[2] === undefined ? { name: test[1]! } : { name: test[1]!, value: test[2] });
				at += test[0].length;
				continue;
			}
			if (selector.startsWith(':has(', at)) {
				at += 5;
				has.push(compound());
				if (selector[at] !== ')') fail();
				at++;
				continue;
			}
			break;
		}
		if (!tag && !attrs.length && !has.length) fail();
		return { tag: tag?.toLowerCase(), attrs, has };
	};
	const out = compound();
	if (at !== selector.length) fail();
	return out;
}

function matches(el: Element, c: Compound): boolean {
	if (c.tag && el.tagName !== c.tag) return false;
	for (const a of c.attrs) {
		const value = attr(el, a.name);
		if (value === undefined || (a.value !== undefined && value !== a.value)) return false;
	}
	return c.has.every((inner) => [...walk(el)].some((d) => d !== el && matches(d, inner)));
}

/** The layer site component `el` is the element of, if any. */
export function siteComponentOf(el: Element, components: readonly SiteComponent[]): SiteComponent | undefined {
	return components.find((c) => c.in !== 'page' && matches(el, parseSelector(c.selector)));
}

/** The page site component `el` is the element of, if any. */
export function pageComponentOf(el: Element, components: readonly SiteComponent[]): SiteComponent | undefined {
	return components.find((c) => c.in === 'page' && matches(el, parseSelector(c.selector)));
}

/** The page site component `el` is the element of, or is inside: what a control there opens is that component's. */
export function inPageComponent(el: Element, components: readonly SiteComponent[]): SiteComponent | undefined {
	for (let at: Element | undefined = el; at && 'tagName' in at; at = at.parentNode as Element | undefined) {
		const own = pageComponentOf(at, components);
		if (own) return own;
	}
	return undefined;
}

/** A generated module with an import, after its first line, of each page site component its markup renders. */
export function withSiteImports(source: string, components: readonly SiteComponent[], fromDir: string): string {
	const used = components.filter((c) => c.in === 'page' && new RegExp(`<(${componentName(c)}|${layersName(c)})\\b`).test(source));
	return used.length ? source.replace('\n', `\n${used.map((c) => componentImport(c, fromDir)).join('\n')}\n`) : source;
}
