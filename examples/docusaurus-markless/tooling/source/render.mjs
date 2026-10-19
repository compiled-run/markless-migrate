// Renders one route of the old site through the template its theme component names: the page body (what
// Docusaurus mounts in #__docusaurus), its <head> elements and its <html> classes.
import { h, render, withContext, setRawParser } from './h.mjs';
import { parseHtml } from './html.mjs';
import { join } from 'node:path';
import { readGenerated, website } from './site.mjs';
import { cssModuleMap } from './stylesheet.mjs';
import { mdxComponents } from '../theme/content.jsx';
import { AppMetadata } from '../theme/chrome.jsx';

setRawParser(parseHtml);

const registry = {};
export function registerTemplates(templates) {
	Object.assign(registry, templates);
}

const pluginClass = (name) => `plugin-${name.replace(/docusaurus-(?:plugin|theme)-(?:content-)?/gi, '')}`;

export function routePath(path) {
	return path.length > 1 ? path.replace(/\/$/, '') : path;
}

async function routePlugin(route, site) {
	const alias = [route, ...route.ancestors].map((r) => r.context?.plugin).find(Boolean);
	return alias ? readGenerated(site.context, alias) : undefined;
}

// Helmet's rule: a tag in a later <Head> replaces the earlier one with the same identity.
function headKey(node) {
	const attr = (name) => node.attrs.find(([n]) => n === name)?.[1];
	if (node.tag === 'title') return 'title';
	if (node.tag === 'meta') return attr('name') ? `meta:name:${attr('name')}` : attr('property') && attr('property') !== 'og:locale:alternate' ? `meta:property:${attr('property')}` : null;
	if (node.tag === 'link' && attr('rel') === 'canonical') return 'link:canonical';
	if (node.tag === 'link' && attr('rel') === 'alternate' && attr('hreflang')) return `link:alternate:${attr('hreflang')}`;
	return null;
}

// React's server render puts a preload link for every eagerly loaded image (both colour variants of a themed
// one) at the start of the root, then the <link> elements the components rendered.
function hoistPreloads(root) {
	const images = [];
	const links = [];
	const walk = (node, parent) => {
		if (typeof node === 'string') return;
		if (node.tag === 'img') {
			const attr = (name) => node.attrs.find(([n]) => n === name)?.[1];
			const dark = attr('data-mm-ssr-dark');
			node.attrs = node.attrs.filter(([n]) => n !== 'data-mm-ssr-dark');
			if (!node.raw && !node.noPreload && attr('loading') !== 'lazy' && attr('fetchpriority') !== 'low' && attr('src')) images.push(attr('src'), ...(dark ? [dark] : []));
		}
		if (node.tag === 'link' && parent && !node.raw) {
			links.push(node);
			parent.children.splice(parent.children.indexOf(node), 1);
			return;
		}
		[...node.children].forEach((child) => walk(child, node));
	};
	[...root.children].forEach((child) => walk(child, root));
	const preloads = [...new Set(images)].filter((src) => !src.startsWith('data:')).map((src) => ({ tag: 'link', attrs: [['rel', 'preload'], ['as', 'image'], ['href', src]], children: [] }));
	root.children.unshift(...preloads, ...links);
}

// Mermaid diagrams are drawn by the mermaid library in a browser: the first render of a page collects them,
// tooling/source/mermaid.mjs draws them, and the page renders again with the SVGs.
export const mermaidRendered = new Map();
export const mermaidPending = new Set();
function mermaid({ value }) {
	const svg = mermaidRendered.get(value);
	if (svg === undefined) {
		mermaidPending.add(value);
		return null;
	}
	if (svg.error !== undefined) return h('div', { className: errorStyles().errorBoundaryFallback }, h('p', null, svg.error), h('button', { type: 'button' }, 'Try again'));
	return h('div', { className: `docusaurus-mermaid-container ${mermaidStyles().container}`, dangerouslySetInnerHTML: { __html: svg.light }, 'data-mm-mermaid-dark': svg.dark });
}
let mermaidStyleMap;
let errorStyleMap;
const errorStyles = () => (errorStyleMap ??= cssModuleMap(join(website, '../packages/docusaurus-theme-common/src/utils/errorBoundaryUtils.module.css')));
const mermaidStyles = () => (mermaidStyleMap ??= cssModuleMap(join(website, '../packages/docusaurus-theme-mermaid/src/theme/Mermaid/styles.module.css')));

export async function renderRoute(route, site, extraComponents = {}) {
	const template = registry[route.component];
	if (!template) throw new Error(`no template for ${route.component} (${route.path})`);
	const prepared = await template(route, site);
	const plugin = prepared.context?.plugin ?? (await routePlugin(route, site));
	const head = [];
	const context = {
		siteConfig: site.context.siteConfig,
		i18n: site.context.i18n,
		globalData: site.globalData,
		siteMetadata: site.siteMetadata,
		codeTranslations: site.context.codeTranslations,
		path: routePath(route.path),
		plugin,
		head,
		mdxComponents: mdxComponents(extraComponents),
		Mermaid: (props) => mermaid(props),
		titleFormatter: site.titleFormatter,
		...prepared.context,
	};
	return withContext(context, () => {
		const body = render(h('div', { id: '__docusaurus' }, h(AppMetadata), prepared.element()));
		hoistPreloads(body[0]);
		const heads = [];
		for (const children of head) {
			// Helmet's <html>/<body> children set attributes on those elements, which document.tsrx writes itself.
			const nodes = render(children).filter((n) => typeof n !== 'string' && n.tag !== 'html' && n.tag !== 'body');
			const keys = new Set(nodes.map(headKey).filter(Boolean));
			for (const list of heads) for (let i = list.length - 1; i >= 0; i--) if (keys.has(headKey(list[i]))) list.splice(i, 1);
			heads.push(nodes);
		}
		const htmlClasses = [plugin && pluginClass(plugin.name), plugin && `plugin-id-${plugin.id}`, ...(context.htmlClasses ?? [])].filter(Boolean);
		return { body, head: heads.flat(), htmlClasses, title: heads.flat().find((n) => n.tag === 'title')?.children.join('') };
	});
}
