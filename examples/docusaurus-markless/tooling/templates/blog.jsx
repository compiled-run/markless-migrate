// The blog plugin's page templates (posts, paginated lists, tags, authors, archive), for the blog and for the
// site's changelog (a blog plugin instance over CHANGELOG.md with its own list and post components).
import { join } from 'node:path';
import { BlogListPage, BlogPostPage, BlogTagsListPage, BlogTagsPostsPage, BlogArchivePage, BlogAuthorsListPage, BlogAuthorsPostsPage, ChangelogList, ChangelogPage } from '../theme/blog.jsx';
import { readGenerated, website } from '../source/site.mjs';
import { importMdx } from '../source/mdx.mjs';

const sitePath = (alias) => join(website, alias.replace(/^@site\//, ''));

async function content(item, site) {
	const ref = item.content ?? item;
	const path = typeof ref === 'string' ? ref : ref.path;
	const query = typeof ref === 'string' || !ref.query ? '' : `?${new URLSearchParams(ref.query)}`;
	const mod = await importMdx(sitePath(path), query, site.rules);
	const Content = (props) => mod.default(props);
	Object.assign(Content, { metadata: mod.metadata, frontMatter: mod.frontMatter, assets: mod.assets ?? {}, toc: mod.toc, contentTitle: mod.contentTitle });
	return Content;
}

async function blogProps(route, site) {
	// Route props reach the theme as JSON, as Docusaurus serializes them for the browser.
	const props = JSON.parse(JSON.stringify(route.props ?? {}));
	if (route.modules?.sidebar) props.sidebar = await readGenerated(site.context, route.modules.sidebar);
	if (route.modules?.items) props.items = await Promise.all(route.modules.items.map(async (item) => ({ content: await content(item, site) })));
	if (route.modules?.content) props.content = await content(route.modules.content, site);
	const blogMetadataRef = route.context?.data?.blogMetadata;
	const blogMetadata = blogMetadataRef ? await readGenerated(site.context, blogMetadataRef) : undefined;
	return { props, blogMetadata };
}

const page = (Component, htmlClass) => async (route, site) => {
	const { props, blogMetadata } = await blogProps(route, site);
	return { context: { blogMetadata, htmlClasses: [htmlClass] }, element: () => <Component {...props} /> };
};

export const templates = {
	'@theme/BlogListPage': page(BlogListPage, 'blog-list-page'),
	'@theme/BlogPostPage': page(BlogPostPage, 'blog-post-page'),
	'@theme/BlogTagsListPage': page(BlogTagsListPage, 'blog-tags-list-page'),
	'@theme/BlogTagsPostsPage': page(BlogTagsPostsPage, 'blog-tags-post-list-page'),
	'@theme/BlogArchivePage': page(BlogArchivePage, undefined),
	'@theme/Blog/Pages/BlogAuthorsListPage': page(BlogAuthorsListPage, 'blog-authors-list-page'),
	'@theme/Blog/Pages/BlogAuthorsPostsPage': page(BlogAuthorsPostsPage, 'blog-authors-posts-page'),
	'@theme/ChangelogList': page(ChangelogList, 'blog-list-page'),
	'@theme/ChangelogPage': page(ChangelogPage, 'blog-post-page'),
};
