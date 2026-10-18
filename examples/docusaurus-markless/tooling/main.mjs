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
import { missingPorts, loadRequirable, resolveSync } from './source/mdx.mjs';
import { setSiteResolver } from './source/jsx-loader.mjs';
import { templates as docsTemplates } from './templates/docs.jsx';
import { templates as blogTemplates } from './templates/blog.jsx';
import { templates as pagesTemplates, sitePageTemplate } from './templates/pages.jsx';
import { app, pageFile, writePage, writeFooter, writeHeads, pluginHtmlTags, copyFiles, clearPages, writeClientData, runPostBuild } from './source/output.mjs';

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
});
await loadRequirable(['@docusaurus/useBaseUrl'], site.rules);
for (const route of site.routes) if (route.component.startsWith('@site/')) registerTemplates({ [route.component]: sitePageTemplate });

const sitemap = site.plugins.find((p) => p.name === 'docusaurus-plugin-sitemap');
const ignore = (sitemap?.options.ignorePatterns ?? []).map((pattern) => new RegExp(`^${pattern.replace(/\{([^}]+)\}/g, (_, list) => `(${list.split(',').join('|')})`).replace(/\/\*\*/g, '(/.*)?')}$`));

// The routes a visitor can reach and the sitemap lists: every page route but the debug pages, the 404 page,
// the sitemap's ignored patterns and versions marked noIndex.
async function pageRoutes() {
	const out = [];
	for (const route of site.routes) {
		const path = routePath(route.path);
		if (path.startsWith('/__docusaurus') || path.includes('*') || route.path === '/404.html') continue;
		if (ignore.some((re) => re.test(path))) continue;
		const versionRoute = route.ancestors.find((a) => a.context?.data?.docsVersion);
		if (versionRoute && (await readGenerated(site.context, versionRoute.context.data.docsVersion)).noIndex) continue;
		out.push(route);
	}
	return out;
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
const failures = [];
const skipped = [];
const pages = new Map();
let footer;
// A page with Mermaid diagrams renders twice: once to collect them, again once they are drawn.
async function renderWithDiagrams(route) {
	const page = await renderRoute(route, site, siteMdxComponents);
	if (!mermaidPending.size) return page;
	const drawn = await drawMermaid([...mermaidPending], site.context.siteConfig.themeConfig.mermaid);
	for (const [value, svg] of drawn) mermaidRendered.set(value, svg);
	mermaidPending.clear();
	return renderRoute(route, site, siteMdxComponents);
}
for (const route of routes) {
	const path = routePath(route.path);
	try {
		const page = await renderWithDiagrams(route);
		const key = route === notFound ? '/404' : path;
		pages.set(key, page);
		await writeFile(join(outDir, `${encodeURIComponent(path)}.html`), toHtml(page.body));
		await writeFile(join(outDir, `${encodeURIComponent(path)}.head.json`), JSON.stringify({ title: page.title, htmlClasses: page.htmlClasses, head: toHtml(page.head) }));
		footer = (await writePage(path, route === notFound ? join(app, 'pages/404.tsrx') : pageFile(path, allPaths), page.body)) ?? footer;
	} catch (error) {
		failures.push(`${path} (${route.component}): ${error.stack.split('\n').slice(0, 2).join(' ')}`);
	}
}
if (footer) await writeFooter(footer);
if (!only.length) {
	const tags = pluginHtmlTags(site);
	await writeHeads(pages, tags.head, tags.body);
	await writeClientData(site, pages);
	await runPostBuild(site, pages);
	await writeFile(join(app, 'lib/routes.json'), `${JSON.stringify([...pages.keys()].filter((p) => p !== '/404').sort(), null, '\t')}\n`);
	await copyFiles(site);
}
process.stdout.write(`${pages.size} of ${routes.length} routes written${skipped.length ? `, ${skipped.length} left out (noindex): ${skipped.join(', ')}` : ''}\n`);
for (const failure of failures) process.stdout.write(`  ${failure}\n`);
for (const [specifier, files] of missingPorts) process.stdout.write(`missing port: ${specifier} (${[...files].slice(0, 3).join(', ')})\n`);
