// What the ported theme shares: the page context, translation, links, class names, icons, headings and themed
// images, written from @docusaurus/theme-classic and theme-common so they produce the same markup.
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { Fragment, isElement, useContext } from '../source/h.mjs';
import { cssModuleMap } from '../source/stylesheet.mjs';
import { website } from '../source/site.mjs';
import clsx from '../source/clsx.mjs';

export { clsx, useContext };

const packages = join(website, '../packages');
// The CSS module of a theme component, by its directory under theme-classic's (or theme-common's) source.
export function styles(dir) {
	const candidates = [join(packages, 'docusaurus-theme-classic/src/theme', dir, 'styles.module.css'), join(packages, 'docusaurus-theme-common/src', dir), join(packages, dir)];
	const file = candidates.find((path) => path.endsWith('.css') && existsSync(path));
	if (!file) throw new Error(`no stylesheet for ${dir}`);
	return cssModuleMap(file);
}

export const ThemeClassNames = {
	page: {
		blogListPage: 'blog-list-page',
		blogPostPage: 'blog-post-page',
		blogTagsListPage: 'blog-tags-list-page',
		blogTagPostListPage: 'blog-tags-post-list-page',
		blogAuthorsListPage: 'blog-authors-list-page',
		blogAuthorsPostsPage: 'blog-authors-posts-page',
		docsDocPage: 'docs-doc-page',
		docsTagsListPage: 'docs-tags-list-page',
		docsTagDocListPage: 'docs-tags-doc-list-page',
		mdxPage: 'mdx-page',
	},
	common: {
		editThisPage: 'theme-edit-this-page',
		lastUpdated: 'theme-last-updated',
		backToTopButton: 'theme-back-to-top-button',
		codeBlock: 'theme-code-block',
		admonition: 'theme-admonition',
		unlistedBanner: 'theme-unlisted-banner',
		draftBanner: 'theme-draft-banner',
		admonitionType: (type) => `theme-admonition-${type}`,
	},
	announcementBar: { container: 'theme-announcement-bar' },
	tabs: { container: 'theme-tabs-container' },
	layout: {
		navbar: {
			container: 'theme-layout-navbar',
			containerLeft: 'theme-layout-navbar-left',
			containerRight: 'theme-layout-navbar-right',
			mobileSidebar: { container: 'theme-layout-navbar-sidebar', panel: 'theme-layout-navbar-sidebar-panel' },
		},
		main: { container: 'theme-layout-main' },
		footer: { container: 'theme-layout-footer', column: 'theme-layout-footer-column' },
	},
	docs: {
		docVersionBanner: 'theme-doc-version-banner',
		docVersionBadge: 'theme-doc-version-badge',
		docBreadcrumbs: 'theme-doc-breadcrumbs',
		docMarkdown: 'theme-doc-markdown',
		docTocMobile: 'theme-doc-toc-mobile',
		docTocDesktop: 'theme-doc-toc-desktop',
		docFooter: 'theme-doc-footer',
		docFooterTagsRow: 'theme-doc-footer-tags-row',
		docFooterEditMetaRow: 'theme-doc-footer-edit-meta-row',
		docSidebarContainer: 'theme-doc-sidebar-container',
		docSidebarMenu: 'theme-doc-sidebar-menu',
		docSidebarItemCategory: 'theme-doc-sidebar-item-category',
		docSidebarItemLink: 'theme-doc-sidebar-item-link',
		docSidebarItemCategoryLevel: (level) => `theme-doc-sidebar-item-category-level-${level}`,
		docSidebarItemLinkLevel: (level) => `theme-doc-sidebar-item-link-level-${level}`,
		docCard: { container: 'theme-doc-card-container', heading: 'theme-doc-card-heading', icon: 'theme-doc-card-icon', title: 'theme-doc-card-title', description: 'theme-doc-card-description' },
	},
	blog: { blogFooterTagsRow: 'theme-blog-footer-tags-row', blogFooterEditMetaRow: 'theme-blog-footer-edit-meta-row' },
	pages: { pageFooterEditMetaRow: 'theme-pages-footer-edit-meta-row' },
};

export function interpolate(text, values) {
	const segments = text.split(/(\{\w+\})/).map((seg, index) => {
		if (index % 2 === 1) {
			const value = values?.[seg.slice(1, -1)];
			if (value !== undefined) return value;
		}
		return seg;
	});
	if (segments.some((seg) => isElement(seg) || Array.isArray(seg))) return segments.filter((seg) => seg !== '');
	return segments.join('');
}

export function translate({ message, id }, values) {
	const translations = useContext().codeTranslations ?? {};
	return interpolate(translations[id ?? message] ?? message ?? id, values);
}

export function Translate({ children, id, values }) {
	const translations = useContext().codeTranslations ?? {};
	return <>{interpolate(translations[id ?? children] ?? children ?? id, values)}</>;
}

export const hasProtocol = (url) => /^(?:[A-Z][A-Z\d+.-]*:|\/\/)/i.test(url);
export const isInternalUrl = (url) => typeof url !== 'undefined' && !hasProtocol(url);

export function siteConfig() {
	return useContext().siteConfig;
}
export function themeConfig() {
	return useContext().siteConfig.themeConfig;
}

export function withBaseUrl(url, { forcePrependBaseUrl = false, absolute = false } = {}) {
	const { baseUrl, url: siteUrl } = siteConfig();
	if (!url || url.startsWith('#') || hasProtocol(url)) return url;
	if (forcePrependBaseUrl) return baseUrl + url.replace(/^\//, '');
	if (url === baseUrl.replace(/\/$/, '')) return baseUrl;
	const basePath = !url.startsWith(baseUrl) ? baseUrl + url.replace(/^\//, '') : url;
	return absolute ? siteUrl + basePath : basePath;
}
export const useBaseUrl = (url, options) => withBaseUrl(url, options);

function applyTrailingSlash(path, trailingSlash) {
	if (typeof trailingSlash === 'undefined' || path.startsWith('#') || /^\w+:/.test(path)) return path;
	const [pathname, ...rest] = path.split(/(?=[?#])/);
	const suffix = rest.join('');
	if (pathname === '/' || pathname === '') return path;
	const next = trailingSlash ? (pathname.endsWith('/') ? pathname : `${pathname}/`) : pathname.replace(/\/$/, '');
	return next + suffix;
}

// @docusaurus/Link: a plain <a>; external targets open in a new tab, internal ones get the base URL.
export function Link({ isNavLink, to, href, activeClassName, activeStyle, isActive, 'data-noBrokenLinkCheck': _skip, autoAddBaseUrl = true, exact, ...props }) {
	const target = to || href;
	const internal = isInternalUrl(target);
	const withoutProtocol = target?.replace('pathname://', '');
	let link = withoutProtocol !== undefined ? (autoAddBaseUrl && withoutProtocol.startsWith('/') ? withBaseUrl(withoutProtocol) : withoutProtocol) : undefined;
	if (link && internal) link = applyTrailingSlash(link, siteConfig().trailingSlash);
	const isAnchor = link?.startsWith('#') ?? false;
	const internalTarget = !props.target || props.target === '_self';
	const regular = !link || !internal || !internalTarget || isAnchor;
	if (regular) {
		return <a href={link} {...(target && !internal ? { target: '_blank', rel: 'noopener noreferrer' } : {})} {...props} />;
	}
	if (isNavLink) {
		const path = useContext().path;
		const active = isActive ? isActive(null, { pathname: path }) : exact ? samePath(link, path) : path.startsWith(link.replace(/\/$/, '')) && (path.length === link.replace(/\/$/, '').length || path[link.replace(/\/$/, '').length] === '/');
		const className = clsx(props.className, active && (activeClassName ?? 'active'));
		return <a {...(active ? { 'aria-current': 'page' } : {})} {...props} className={className} style={active && activeStyle ? { ...props.style, ...activeStyle } : props.style} href={link} />;
	}
	return <a {...props} href={link} />;
}

export function samePath(a, b) {
	const normalize = (p) => (p?.endsWith('/') ? p : `${p}/`).toLowerCase();
	return normalize(a) === normalize(b);
}

export function useAnchorTargetClassName(id) {
	if (typeof id === 'undefined') return undefined;
	const anchors = styles('docusaurus-theme-common/src/utils/anchorUtils.module.css');
	return themeConfig().navbar.hideOnScroll ? anchors.anchorTargetHideOnScrollNavbar : anchors.anchorTargetStickyNavbar;
}

export function Heading({ as: As, id, ...props }) {
	if (As === 'h1' || !id) return <As {...props} id={undefined} />;
	const title = translate({ id: 'theme.common.headingLinkTitle', message: 'Direct link to {heading}' }, { heading: typeof props.children === 'string' ? props.children : id });
	return (
		<As {...props} className={clsx('anchor', useAnchorTargetClassName(id), props.className)} id={id}>
			{props.children}
			<Link className="hash-link" to={`#${id}`} aria-label={title} title={title} translate="no">
				{'​'}
			</Link>
		</As>
	);
}

// ThemedComponent once the page has started: only the current colour mode's variant (light here; lib/site.ts
// swaps it when the mode changes).
export function ThemedComponent({ className, children }) {
	const themed = styles('docusaurus-theme-common/src/components/ThemedComponent/styles.module.css');
	const theme = useContext().colorMode ?? 'light';
	return children({ theme, className: clsx(className, themed.themedComponent, themed[`themedComponent--${theme}`]) });
}

export function ThemedImage({ sources, className, alt, ...rest }) {
	// The server render has both variants, so both are preloaded; data-mm-ssr-dark carries the other one to that rule.
	// data-mm-themed tells lib/site.ts the other colour mode's image.
	const themed = sources.light !== sources.dark ? JSON.stringify(sources) : undefined;
	return <ThemedComponent className={className}>{({ theme, className: cls }) => <img src={sources[theme]} alt={alt} className={cls} {...rest} data-mm-ssr-dark={sources.dark} data-mm-themed={themed} />}</ThemedComponent>;
}

export function Head({ children }) {
	const ctx = useContext();
	ctx.head?.push(children);
	return null;
}

export function BrowserOnly({ children, fallback }) {
	return typeof children === 'function' ? children() : (fallback ?? null);
}

// Icons
export const IconArrow = (props) => (
	<svg width="20" height="20" aria-hidden="true" {...props}>
		<g fill="#7a7a7a">
			<path d="M9.992 10.023c0 .2-.062.399-.172.547l-4.996 7.492a.982.982 0 01-.828.454H1c-.55 0-1-.453-1-1 0-.2.059-.403.168-.551l4.629-6.942L.168 3.078A.939.939 0 010 2.528c0-.548.45-.997 1-.997h2.996c.352 0 .649.18.828.45L9.82 9.472c.11.148.172.347.172.55zm0 0"></path>
			<path d="M19.98 10.023c0 .2-.058.399-.168.547l-4.996 7.492a.987.987 0 01-.828.454h-3c-.547 0-.996-.453-.996-1 0-.2.059-.403.168-.551l4.625-6.942-4.625-6.945a.939.939 0 01-.168-.55 1 1 0 01.996-.997h3c.348 0 .649.18.828.45l4.996 7.492c.11.148.168.347.168.55zm0 0"></path>
		</g>
	</svg>
);
export const IconClose = ({ width = 21, height = 21, color = 'currentColor', strokeWidth = 1.2, className, ...rest }) => (
	<svg viewBox="0 0 15 15" width={width} height={height} {...rest}>
		<g stroke={color} strokeWidth={strokeWidth}>
			<path d="M.75.75l13.5 13.5M14.25.75L.75 14.25"></path>
		</g>
	</svg>
);
export const IconCopy = (props) => (
	<svg viewBox="0 0 24 24" {...props}>
		<path fill="currentColor" d="M19,21H8V7H19M19,5H8A2,2 0 0,0 6,7V21A2,2 0 0,0 8,23H19A2,2 0 0,0 21,21V7A2,2 0 0,0 19,5M16,1H4A2,2 0 0,0 2,3V17H4V3H16V1Z"></path>
	</svg>
);
export const IconSuccess = (props) => (
	<svg viewBox="0 0 24 24" {...props}>
		<path fill="currentColor" d="M21,7L9,19L3.5,13.5L4.91,12.09L9,16.17L19.59,5.59L21,7Z"></path>
	</svg>
);
export const IconWordWrap = (props) => (
	<svg viewBox="0 0 24 24" {...props}>
		<path fill="currentColor" d="M4 19h6v-2H4v2zM20 5H4v2h16V5zm-3 6H4v2h13.25c1.1 0 2 .9 2 2s-.9 2-2 2H15v-2l-3 3l3 3v-2h2c2.21 0 4-1.79 4-4s-1.79-4-4-4z"></path>
	</svg>
);
export const IconDarkMode = (props) => (
	<svg viewBox="0 0 24 24" width={24} height={24} {...props}>
		<path fill="currentColor" d="M9.37,5.51C9.19,6.15,9.1,6.82,9.1,7.5c0,4.08,3.32,7.4,7.4,7.4c0.68,0,1.35-0.09,1.99-0.27C17.45,17.19,14.93,19,12,19 c-3.86,0-7-3.14-7-7C5,9.07,6.81,6.55,9.37,5.51z M12,3c-4.97,0-9,4.03-9,9s4.03,9,9,9s9-4.03,9-9c0-0.46-0.04-0.92-0.1-1.36 c-0.98,1.37-2.58,2.26-4.4,2.26c-2.98,0-5.4-2.42-5.4-5.4c0-1.81,0.89-3.42,2.26-4.4C12.92,3.04,12.46,3,12,3L12,3z"></path>
	</svg>
);
export const IconLightMode = (props) => (
	<svg viewBox="0 0 24 24" width={24} height={24} {...props}>
		<path fill="currentColor" d="M12,9c1.65,0,3,1.35,3,3s-1.35,3-3,3s-3-1.35-3-3S10.35,9,12,9 M12,7c-2.76,0-5,2.24-5,5s2.24,5,5,5s5-2.24,5-5 S14.76,7,12,7L12,7z M2,13l2,0c0.55,0,1-0.45,1-1s-0.45-1-1-1l-2,0c-0.55,0-1,0.45-1,1S1.45,13,2,13z M20,13l2,0c0.55,0,1-0.45,1-1 s-0.45-1-1-1l-2,0c-0.55,0-1,0.45-1,1S19.45,13,20,13z M11,2v2c0,0.55,0.45,1,1,1s1-0.45,1-1V2c0-0.55-0.45-1-1-1S11,1.45,11,2z M11,20v2c0,0.55,0.45,1,1,1s1-0.45,1-1v-2c0-0.55-0.45-1-1-1C11.45,19,11,19.45,11,20z M5.99,4.58c-0.39-0.39-1.03-0.39-1.41,0 c-0.39,0.39-0.39,1.03,0,1.41l1.06,1.06c0.39,0.39,1.03,0.39,1.41,0s0.39-1.03,0-1.41L5.99,4.58z M18.36,16.95 c-0.39-0.39-1.03-0.39-1.41,0c-0.39,0.39-0.39,1.03,0,1.41l1.06,1.06c0.39,0.39,1.03,0.39,1.41,0c0.39-0.39,0.39-1.03,0-1.41 L18.36,16.95z M19.42,5.99c0.39-0.39,0.39-1.03,0-1.41c-0.39-0.39-1.03-0.39-1.41,0l-1.06,1.06c-0.39,0.39-0.39,1.03,0,1.41 s1.03,0.39,1.41,0L19.42,5.99z M7.05,18.36c0.39-0.39,0.39-1.03,0-1.41c-0.39-0.39-1.03-0.39-1.41,0l-1.06,1.06 c-0.39,0.39-0.39,1.03,0,1.41s1.03,0.39,1.41,0L7.05,18.36z"></path>
	</svg>
);
export const IconSystemColorMode = (props) => (
	<svg viewBox="0 0 24 24" width={24} height={24} {...props}>
		<path fill="currentColor" d="m12 21c4.971 0 9-4.029 9-9s-4.029-9-9-9-9 4.029-9 9 4.029 9 9 9zm4.95-13.95c1.313 1.313 2.05 3.093 2.05 4.95s-0.738 3.637-2.05 4.95c-1.313 1.313-3.093 2.05-4.95 2.05v-14c1.857 0 3.637 0.737 4.95 2.05z"></path>
	</svg>
);
export const IconMenu = ({ width = 30, height = 30, className, ...rest }) => (
	<svg className={className} width={width} height={height} viewBox="0 0 30 30" aria-hidden="true" {...rest}>
		<path stroke="currentColor" strokeLinecap="round" strokeMiterlimit="10" strokeWidth="2" d="M4 7h22M4 15h22M4 23h22"></path>
	</svg>
);
export const IconLanguage = ({ width = 20, height = 20, ...props }) => (
	<svg viewBox="0 0 24 24" width={width} height={height} aria-hidden={true} {...props}>
		<path fill="currentColor" d="M12.87 15.07l-2.54-2.51.03-.03c1.74-1.94 2.98-4.17 3.71-6.53H17V4h-7V2H8v2H1v1.99h11.17C11.5 7.92 10.44 9.75 9 11.35 8.07 10.32 7.3 9.19 6.69 8h-2c.73 1.63 1.73 3.17 2.98 4.56l-5.09 5.02L4 19l5-5 3.11 3.11.76-2.04zM18.5 10h-2L12 22h2l1.12-3h4.75L21 22h2l-4.5-12zm-2.62 7l1.62-4.33L19.12 17h-3.24z"></path>
	</svg>
);
export const IconHome = (props) => (
	<svg viewBox="0 0 24 24" {...props}>
		<path d="M10 19v-5h4v5c0 .55.45 1 1 1h3c.55 0 1-.45 1-1v-7h1.7c.46 0 .68-.57.33-.87L12.67 3.6c-.38-.34-.96-.34-1.34 0l-8.36 7.53c-.34.3-.13.87.33.87H5v7c0 .55.45 1 1 1h3c.55 0 1-.45 1-1z" fill="currentColor"></path>
	</svg>
);
export function IconEdit({ className, ...rest }) {
	const s = styles('Icon/Edit');
	return (
		<svg fill="currentColor" height="20" width="20" viewBox="0 0 40 40" className={clsx(s.iconEdit, className)} aria-hidden="true" {...rest}>
			<g>
				<path d="m34.5 11.7l-3 3.1-6.3-6.3 3.1-3q0.5-0.5 1.2-0.5t1.1 0.5l3.9 3.9q0.5 0.4 0.5 1.1t-0.5 1.2z m-29.5 17.1l18.4-18.5 6.3 6.3-18.4 18.4h-6.3v-6.2z"></path>
			</g>
		</svg>
	);
}
export function IconExternalLink({ width = 13.5, height = 13.5 }) {
	const s = styles('Icon/ExternalLink');
	return (
		<svg width={width} height={height} aria-label={translate({ id: 'theme.IconExternalLink.ariaLabel', message: '(opens in new tab)' })} className={s.iconExternalLink}>
			<use href="#theme-svg-external-link"></use>
		</svg>
	);
}

export { Fragment };

// A CSS module of the site itself (website/src/...), with the class names the old build gave it.
export const siteStyles = (rel) => cssModuleMap(join(website, rel));
