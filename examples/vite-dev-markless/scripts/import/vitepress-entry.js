// Loaded into the docs' own VitePress dev server (scripts/import-docs.ts): renders one page's Markdown with the site's
// markdown pipeline and the components the Markdown uses, and lends the theme's sidebar helpers to the importer.
import { createSSRApp, h } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { dataSymbol, initData, siteDataRef } from '__VITEPRESS__/dist/client/app/data.js';
import { RouterSymbol, createRouter } from '__VITEPRESS__/dist/client/app/router.js';
import { Content } from '__VITEPRESS__/dist/client/app/components/Content.js';
import { ClientOnly } from '__VITEPRESS__/dist/client/app/components/ClientOnly.js';
import Theme from '@theme/index';
export { getFlatSideBarLinks, getSidebar, getSidebarGroups, hasActiveLink } from '@vp-support/sidebar';
export { isActive } from '@vp-support/shared-utils';
export { isLinkExternal, normalizeLink } from '@vp-support/utils';

export async function renderPage(path, file, component) {
	const router = createRouter(() => import(/* @vite-ignore */ file), undefined);
	// A component of the page on its own: what a client-only branch of the page renders once it switches.
	const own = component && (await import(/* @vite-ignore */ component.file)).default;
	const app = createSSRApp({ render: () => (own ? h(own, component.props) : h(Content)) });
	app.provide(RouterSymbol, router);
	const data = initData(router.route);
	app.provide(dataSymbol, data);
	app.component('Content', Content);
	app.component('ClientOnly', ClientOnly);
	Object.defineProperties(app.config.globalProperties, {
		$frontmatter: { get: () => data.frontmatter.value },
		$params: { get: () => data.page.value.params },
	});
	await Theme.enhanceApp?.({ app, router, siteData: siteDataRef });
	await router.go(path);
	const html = await renderToString(app, {});
	return {
		html,
		page: JSON.parse(JSON.stringify(router.route.data)),
		site: JSON.parse(JSON.stringify(siteDataRef.value)),
	};
}
