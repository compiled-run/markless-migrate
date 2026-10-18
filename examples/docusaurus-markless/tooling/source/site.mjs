// Reads the old site's sources the way `docusaurus build` does before it bundles anything: the config, then every
// content plugin's loadContent/contentLoaded (docs and sidebars, blog posts and their front matter, the changelog,
// pages). What comes back is the route list, each route's template (its theme component) and its data.
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export const website = process.env.DOCUSAURUS_WEBSITE ?? join(import.meta.dirname, '../../../../../mm-upstreams/docusaurus/website');
export const siteRequire = createRequire(join(website, 'node_modules/@docusaurus/core/package.json'));

export async function loadSite() {
	process.env.BUILD_FAST = 'true';
	process.env.NODE_ENV = 'production';
	const { loadContext } = siteRequire('@docusaurus/core/lib/server/site.js');
	const { loadPlugins } = siteRequire('@docusaurus/core/lib/server/plugins/plugins.js');
	const context = await loadContext({ siteDir: website, locale: 'en', automaticBaseUrlLocalizationDisabled: true });
	const { plugins, routes, globalData } = await loadPlugins(context);
	const leaves = [];
	const walk = (route, ancestors) => {
		if (route.routes?.length) route.routes.forEach((child) => walk(child, [...ancestors, route]));
		else leaves.push({ ...route, ancestors });
	};
	routes.forEach((route) => walk(route, []));
	const rules = [];
	for (const plugin of plugins) {
		if (!/content-(docs|blog|pages)|changelog|mdx-fallback/.test(plugin.name) || !plugin.configureWebpack) continue;
		const config = await plugin.configureWebpack({ module: { rules: [] } }, true, { getStyleLoaders: () => [], getJSLoader: () => ({}), currentBundler: { name: 'rspack' } }, plugin.content);
		for (const rule of config?.module?.rules ?? []) rules.push({ plugin, include: rule.include ?? [''], use: rule.use });
	}
	rules.sort((a, b) => (a.include[0] === '') - (b.include[0] === ''));
	const { createSiteMetadata } = siteRequire('@docusaurus/core/lib/server/siteMetadata.js');
	const siteMetadata = createSiteMetadata({ plugins, siteVersion: context.siteVersion });
	const { generateRoutesCode } = siteRequire('@docusaurus/core/lib/server/codegen/codegenRoutes.js');
	const { registry } = generateRoutesCode(routes);
	const sortedRegistry = Object.entries(registry).sort((a, b) => a[0].localeCompare(b[0]));
	return { context, plugins, routes: leaves, routeTree: routes, globalData, rules, siteMetadata, registry: sortedRegistry };
}

// `~blog/...`, `~docs/...` and `@generated/...` point into the generated files the plugins just wrote.
export function generatedPath(context, alias) {
	const dir = context.generatedFilesDir;
	if (alias.startsWith('~blog/')) return join(dir, 'docusaurus-plugin-content-blog', alias.slice('~blog/'.length));
	if (alias.startsWith('~docs/')) return join(dir, 'docusaurus-plugin-content-docs', alias.slice('~docs/'.length));
	if (alias.startsWith('~pages/')) return join(dir, 'docusaurus-plugin-content-pages', alias.slice('~pages/'.length));
	if (alias.startsWith('@generated/')) return join(dir, alias.slice('@generated/'.length));
	if (alias.startsWith('@site/')) return join(website, alias.slice('@site/'.length));
	return alias;
}

export async function readGenerated(context, alias) {
	const path = generatedPath(context, alias);
	return JSON.parse(await readFile(path.endsWith('.json') ? path : `${path}.json`, 'utf8'));
}

// Runs the loaders the content plugin configured for this file (the MDX loader, and for blog posts the truncation
// loader before it), exactly as the bundler would: the result is the compiled MDX module's source.
export async function compileWithPluginLoaders(rules, filePath, query = '') {
	const rule = rules.find((r) => r.include.some((dir) => filePath.startsWith(dir)));
	if (!rule) throw new Error(`no content plugin owns ${filePath}`);
	let source = await readFile(filePath, 'utf8');
	for (const use of [...rule.use].reverse()) {
		const loader = siteRequire(use.loader);
		const fn = loader.default ?? loader.mdxLoader ?? loader;
		source = await new Promise((resolve, reject) => {
			const ctx = {
				resource: filePath + query,
				resourcePath: filePath,
				resourceQuery: query,
				getOptions: () => use.options,
				addDependency: () => {},
				async: () => (error, result) => (error ? reject(error) : resolve(result)),
				_compiler: { name: 'client' },
				_compilation: { compiler: { name: 'client' } },
				emitWarning: () => {},
				emitError: () => {},
			};
			Promise.resolve(fn.call(ctx, source)).catch(reject);
		});
	}
	return { source, plugin: rule.plugin };
}
