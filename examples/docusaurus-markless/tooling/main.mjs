// The importer itself (tooling/import.mjs runs it once .jsx can be loaded).
// The old site's content plugins read website/ (docs, sidebars, blog posts, the changelog, pages) as
// `docusaurus build` does; each route is then rendered by the importer for its page template (templates/), with
// the theme and the site's MDX components ported to static markup (theme/, ports/), and written as TSRX.
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { loadSite, readGenerated } from './source/site.mjs';
import { renderRoute, registerTemplates, routePath, mermaidPending, mermaidRendered } from './source/render.mjs';
import { drawMermaid } from './source/mermaid.mjs';
import { toHtml } from './source/h.mjs';
import { existsSync } from 'node:fs';
import { missingPorts, loadRequirable, resolveSync, assetUrlsIn, provideGenerated, debugTheme, jsonViewLite } from './source/mdx.mjs';
import { setSiteResolver, addSiteRoot } from './source/jsx-loader.mjs';
import { templates as docsTemplates } from './templates/docs.jsx';
import { templates as blogTemplates } from './templates/blog.jsx';
import { templates as pagesTemplates, sitePageTemplate, pluginThemeTemplate } from './templates/pages.jsx';
import { app, fileRoute, pageFile, writePage, writeFooter, writeHeads, pluginHtmlTags, copyFiles, clearPages, writeClientData, runPostBuild } from './source/output.mjs';

const args = process.argv.slice(2);
const only = args.filter((a, i) => args[i - 1] === '--only');
const outDir = join(import.meta.dirname, '.out');

registerTemplates(docsTemplates);
registerTemplates(blogTemplates);
registerTemplates(pagesTemplates);

const site = await loadSite();
setSiteResolver((specifier, parent) => {
	const resolved = resolveSync(specifier, parent);
	return typeof resolved === 'string' ? resolved : null;
}, assetUrlsIn);
await loadRequirable(['@docusaurus/useBaseUrl'], site.rules);
addSiteRoot(debugTheme);
addSiteRoot(jsonViewLite);
// @generated/routes as the old client imports it: each route's component is a function (marked for the JSON view port).
const routesConfig = (await import(`data:text/javascript,${encodeURIComponent(site.routesConfig.replace(/^import .*$/gm, '').replace('export default', 'const ComponentCreator = () => ({ $function: true });\nexport default'))}`)).default;
provideGenerated('@generated/routes', routesConfig);
provideGenerated('@generated/registry', Object.fromEntries(site.registry.map(([chunk, modulePath]) => [chunk, [null, modulePath, site.moduleIds[chunk] ?? modulePath]])));
for (const route of site.routes) if (existsSync(join(debugTheme, route.component.replace(/^@theme\//, ''), 'index.js'))) registerTemplates({ [route.component]: pluginThemeTemplate });
// The site's own swizzled ThemeProvider/TitleFormatter: the formatter it hands to TitleFormatterProvider.
const titleFormatterFile = resolveSync('@site/src/theme/ThemeProvider/TitleFormatter', join(site.context.siteDir, 'docusaurus.config.ts'));
if (typeof titleFormatterFile === 'string') site.titleFormatter = (await import(titleFormatterFile)).default({ children: null })?.props?.formatter;
for (const route of site.routes) if (route.component.startsWith('@site/')) registerTemplates({ [route.component]: sitePageTemplate });

const sitemap = site.plugins.find((p) => p.name === 'docusaurus-plugin-sitemap');
const ignore = (sitemap?.options.ignorePatterns ?? []).map((pattern) => new RegExp(`^${pattern.replace(/\{([^}]+)\}/g, (_, list) => `(${list.split(',').join('|')})`).replace(/\/\*\*/g, '(/.*)?')}$`));

// Every page route the old site serves: its sitemap's routes and the rest (the dogfooding test pages, the debug
// pages), all but the catch-all not-found route, which becomes pages/404.tsrx.
async function pageRoutes() {
	return site.routes.filter((route) => !route.path.includes('*') && route.path !== '/404.html');
}

// The site's own MDXComponents (website/src/theme/MDXComponents.tsx) add these to the theme's.
const siteMdxComponents = {
	Highlight: (await import('./ports/components-Highlight.jsx')).default,
	TweetQuote: (await import('./ports/components-TweetQuote.jsx')).default,
};
// The not-found page Docusaurus writes as 404.html, served for any path no route has.
const notFound = { path: '/404.html', component: '@theme/NotFound', ancestors: [] };
const allRoutes = [...(await pageRoutes()), notFound];
const routes = allRoutes.filter((route) => !only.length || only.includes(routePath(route.path)));
const allPaths = allRoutes.map((route) => routePath(route.path));
await mkdir(outDir, { recursive: true });
if (!only.length) await clearPages();
const FEED_SOURCES = new Set(['@theme/BlogPostPage', '@theme/ChangelogPage']);
const failures = [];
const skipped = [];
const pages = new Map();
let footer;
// A page with Mermaid diagrams renders twice: once to collect them, again once they are drawn.
async function renderWithDiagrams(route) {
	mermaidPending.clear();
	const page = await renderRoute(route, site, siteMdxComponents);
	if (!mermaidPending.size) return page;
	try {
		const drawn = await drawMermaid([...mermaidPending], site.context.siteConfig.themeConfig.mermaid);
		for (const [value, svg] of drawn) mermaidRendered.set(value, svg);
	} finally {
		mermaidPending.clear();
	}
	return renderRoute(route, site, siteMdxComponents);
}
for (const route of routes) {
	const path = routePath(route.path);
	try {
		const page = await renderWithDiagrams(route);
		const key = route === notFound ? '/404' : path;
		// The blog plugins' feeds are made from these pages' HTML as React's server render writes it.
		if (FEED_SOURCES.has(route.component)) page.feedBody = (await renderRoute(route, site, siteMdxComponents, { reactServerMarkup: true })).body;
		pages.set(key, page);
		await writeFile(join(outDir, `${encodeURIComponent(path)}.html`), toHtml(page.body));
		await writeFile(join(outDir, `${encodeURIComponent(path)}.head.json`), JSON.stringify({ title: page.title, htmlClasses: page.htmlClasses, head: toHtml(page.head) }));
		footer = (await writePage(path, route === notFound ? join(app, 'pages/404.tsrx') : pageFile(path, allPaths), page.body)) ?? footer;
	} catch (error) {
		failures.push(`${path} (${route.component}): ${error.stack.split('\n').slice(0, 2).join(' ')}`);
	}
}
if (footer) await writeFooter(footer);
for (const failure of failures) process.stdout.write(`  ${failure}\n`);
if (!only.length) {
	const tags = pluginHtmlTags(site);
	await writeHeads(pages, tags.head, tags.body);
	await writeClientData(site, pages);
	await runPostBuild(site, pages);
	await writeFile(join(app, 'lib/routes.json'), `${JSON.stringify([...pages.keys()].filter((p) => p !== '/404').sort(), null, '\t')}\n`);
	const aliases = Object.fromEntries([...pages.keys()].filter((p) => fileRoute(p) !== p).map((p) => [encodeURI(p), encodeURI(fileRoute(p))]));
	await writeFile(join(app, 'lib/route-aliases.json'), `${JSON.stringify(aliases, null, '\t')}\n`);
	await copyFiles(site);
}
process.stdout.write(`${pages.size} of ${routes.length} routes written${skipped.length ? `, ${skipped.length} left out (noindex): ${skipped.join(', ')}` : ''}\n`);
for (const [specifier, files] of missingPorts) process.stdout.write(`missing port: ${specifier} (${[...files].slice(0, 3).join(', ')})\n`);
