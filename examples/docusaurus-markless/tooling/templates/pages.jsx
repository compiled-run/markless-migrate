// The pages plugin's templates: Markdown/MDX pages (@theme/MDXPage) and the site's React pages (the home page,
// showcase, versions, feature requests), plus the search plugin's search page.
import { join } from 'node:path';
import { clsx, styles, ThemeClassNames, translate, Translate, Heading } from '../theme/core.jsx';
import { Layout, PageMetadata } from '../theme/chrome.jsx';
import { TOC, EditMetaRow, ContentVisibility } from '../theme/docs.jsx';
import { SearchPage } from '../theme/search.jsx';
import { readGenerated, website } from '../source/site.mjs';
import { importMdx, resolveSync, compileSiteMdxImports } from '../source/mdx.mjs';
import { existsSync } from 'node:fs';

function MDXPage({ content: Content }) {
	const { metadata, assets = {} } = Content;
	const { title, editUrl, description, frontMatter, lastUpdatedBy, lastUpdatedAt } = metadata;
	const { keywords, wrapperClassName, hide_table_of_contents: hideToc } = frontMatter;
	const s = styles('MDXPage');
	return (
		<Layout>
			<PageMetadata title={title} description={description} keywords={keywords} image={assets.image ?? frontMatter.image} />
			<main className="container container--fluid margin-vert--lg">
				<div className={clsx('row', s.mdxPageWrapper)}>
					<div className={clsx('col', !hideToc && 'col--8')}>
						<ContentVisibility metadata={metadata} />
						<article>
							<Content />
						</article>
						{!!(editUrl || lastUpdatedAt || lastUpdatedBy) && <EditMetaRow className={clsx('margin-top--sm', ThemeClassNames.pages.pageFooterEditMetaRow)} editUrl={editUrl} lastUpdatedAt={lastUpdatedAt} lastUpdatedBy={lastUpdatedBy} />}
					</div>
					{!hideToc && Content.toc.length > 0 && (
						<div className="col col--2">
							<TOC toc={Content.toc} minHeadingLevel={frontMatter.toc_min_heading_level} maxHeadingLevel={frontMatter.toc_max_heading_level} />
						</div>
					)}
				</div>
			</main>
		</Layout>
	);
}

async function siteComponent(alias, rules) {
	const file = join(website, alias.replace(/^@site\//, ''));
	await compileSiteMdxImports(existsSync(file) ? file : `${file}.tsx`, rules);
	const resolved = resolveSync(alias, join(website, 'docusaurus.config.ts'));
	return (await import(resolved)).default;
}

async function routeModules(route, site) {
	const out = {};
	for (const [name, alias] of Object.entries(route.modules ?? {})) {
		if (name === 'config' || name === 'content') continue;
		out[name] = await readGenerated(site.context, alias);
	}
	return out;
}

export const templates = {
	'@theme/MDXPage': async (route, site) => {
		const mod = await importMdx(join(website, route.modules.content.replace(/^@site\//, '')), '', site.rules);
		const Content = (props) => mod.default(props);
		Object.assign(Content, { metadata: mod.metadata, frontMatter: mod.frontMatter, assets: mod.assets ?? {}, toc: mod.toc });
		return { context: { htmlClasses: [clsx(mod.frontMatter.wrapperClassName, ThemeClassNames.page.mdxPage)] }, element: () => <MDXPage content={Content} /> };
	},
	'@theme/NotFound': async () => ({
		context: { htmlClasses: [], plugin: { name: 'native', id: 'default' } },
		element: () => (
			<>
				<PageMetadata title={translate({ id: 'theme.NotFound.title', message: 'Page Not Found' })} />
				<Layout>
					<main className={clsx('container margin-vert--xl')}>
						<div className="row">
							<div className="col col--6 col--offset-3">
								<Heading as="h1" className="hero__title">
									<Translate id="theme.NotFound.title">Page Not Found</Translate>
								</Heading>
								<p>
									<Translate id="theme.NotFound.p1">We could not find what you were looking for.</Translate>
								</p>
								<p>
									<Translate id="theme.NotFound.p2">Please contact the owner of the site that linked you to the original URL and let them know their link is broken.</Translate>
								</p>
							</div>
						</div>
					</main>
				</Layout>
			</>
		),
	}),
	'@theme/SearchPage': async () => ({ context: { htmlClasses: ['search-page-wrapper'] }, element: () => <SearchPage /> }),
};

// A page whose component is one of the site's own modules (src/pages/*.tsx, a plugin's page component).
export async function sitePageTemplate(route, site) {
	const Component = await siteComponent(route.component.startsWith('@site/') ? route.component : `@site/${route.component}`, site.rules);
	const props = JSON.parse(JSON.stringify(route.props ?? {}));
	Object.assign(props, await routeModules(route, site));
	return { context: { htmlClasses: [] }, element: () => <Component {...props} /> };
}

// A page whose component is a plugin's own theme component (the debug panel's pages).
export async function pluginThemeTemplate(route, site) {
	const Component = (await import(resolveSync(route.component, join(website, 'docusaurus.config.ts')))).default;
	const props = JSON.parse(JSON.stringify(route.props ?? {}));
	// The client's config, global data and metadata are the JSON the build generated from them.
	const json = (value) => JSON.parse(JSON.stringify(value));
	return { context: { htmlClasses: [], siteConfig: json(site.context.siteConfig), globalData: json(site.globalData), siteMetadata: json(site.siteMetadata) }, element: () => <Component {...props} /> };
}
