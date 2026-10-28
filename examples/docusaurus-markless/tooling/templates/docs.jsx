// The docs plugin's page templates: a doc (@theme/DocItem) and a generated category index
// (@theme/DocCategoryGeneratedIndexPage), inside the docs layout with the version's sidebar.
import { join } from 'node:path';
import { Layout, SearchMetadata, PageMetadata } from '../theme/chrome.jsx';
import { DocRootLayout, DocItem, DocCategoryGeneratedIndexPage, DocTagsListPage, DocTagDocListPage } from '../theme/docs.jsx';
import { readGenerated, website } from '../source/site.mjs';
import { importMdx } from '../source/mdx.mjs';

async function docsContext(route, site) {
	const versionRoute = route.ancestors.find((a) => a.context?.data?.docsVersion);
	const version = await readGenerated(site.context, versionRoute.context.data.docsVersion);
	const sidebarName = route.sidebar;
	const sidebar = sidebarName ? { name: sidebarName, items: version.docsSidebars[sidebarName] } : null;
	const plugin = site.plugins.find((p) => p.name === 'docusaurus-plugin-content-docs' && p.options.id === version.pluginId);
	return {
		version,
		sidebar,
		docsPluginData: { breadcrumbs: plugin.options.breadcrumbs },
		htmlClasses: [version.className, 'docs-doc-page'],
	};
}

function DocsPage({ version, children, root = true }) {
	return (
		<Layout>
			<SearchMetadata version={version.version} tag={`docs-${version.pluginId}-${version.version}`} />
			<PageMetadata>{version.noIndex && <meta name="robots" content="noindex, nofollow" />}</PageMetadata>
			{root ? <DocRootLayout>{children}</DocRootLayout> : children}
		</Layout>
	);
}

const tagsPage = (Component, htmlClass) => async (route, site) => {
	const base = await docsContext(route, site);
	const props = JSON.parse(JSON.stringify(route.props ?? {}));
	return {
		context: { ...base, sidebar: null, htmlClasses: [base.version.className, htmlClass] },
		element: () => (
			<DocsPage version={base.version} root={false}>
				<Component {...props} />
			</DocsPage>
		),
	};
};

export const templates = {
	'@theme/DocTagsListPage': tagsPage(DocTagsListPage, 'docs-tags-list-page'),
	'@theme/DocTagDocListPage': tagsPage(DocTagDocListPage, 'docs-tags-doc-list-page'),
	'@theme/DocItem': async (route, site) => {
		const base = await docsContext(route, site);
		const file = join(website, route.modules.content.replace(/^@site\//, ''));
		const mod = await importMdx(file, '', site.rules);
		const doc = { metadata: mod.metadata, frontMatter: mod.frontMatter, toc: mod.toc, contentTitle: mod.contentTitle, assets: mod.assets ?? {} };
		return {
			context: { ...base, doc, htmlClasses: [...base.htmlClasses, `docs-doc-id-${mod.metadata.id}`] },
			element: () => (
				<DocsPage version={base.version}>
					<DocItem content={mod.default} />
				</DocsPage>
			),
		};
	},
	'@theme/DocCategoryGeneratedIndexPage': async (route, site) => {
		const base = await docsContext(route, site);
		return {
			context: base,
			element: () => (
				<DocsPage version={base.version}>
					<DocCategoryGeneratedIndexPage categoryGeneratedIndex={route.props.categoryGeneratedIndex} />
				</DocsPage>
			),
		};
	},
};
