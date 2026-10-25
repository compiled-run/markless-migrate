import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { attr, walk, type Element } from './dom.ts';

/**
 * A site's own client component, ported to Markless by hand (`lib/site/<file>.tsrx`), that stands in for the element of
 * a layer `selector` picks (`lib/site/components.json`). The component renders that element and everything in it, and
 * takes the file the layer's largest content is served from as its `fill` prop: it renders the element that content
 * goes into, `data-mm-layer-fill={fill}`.
 */
export interface SiteComponent {
	readonly selector: string;
	readonly component: string;
}

export async function readSiteComponents(app: string): Promise<readonly SiteComponent[]> {
	const text = await readFile(join(app, 'lib', 'site', 'components.json'), 'utf8').catch(() => undefined);
	if (text === undefined) return [];
	const listed = JSON.parse(text) as SiteComponent[];
	for (const c of listed) {
		parseSelector(c.selector);
		if (!/^[a-z0-9-]+\.tsrx$/.test(c.component)) throw new Error(`lib/site/components.json: "${c.component}" is not a .tsrx file in lib/site`);
	}
	return listed;
}

/** The component's import name: its file name in PascalCase (`command-menu.tsrx` is CommandMenu). */
export const componentName = (c: SiteComponent): string =>
	c.component
		.replace(/\.tsrx$/, '')
		.split('-')
		.map((w) => w.charAt(0).toUpperCase() + w.slice(1))
		.join('');

export const componentImport = (c: SiteComponent, fromDir: string): string => `import ${componentName(c)} from '${fromDir}/lib/site/${c.component}';`;

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

/** The site component `el` is the element of, if any. */
export function siteComponentOf(el: Element, components: readonly SiteComponent[]): SiteComponent | undefined {
	return components.find((c) => matches(el, parseSelector(c.selector)));
}
