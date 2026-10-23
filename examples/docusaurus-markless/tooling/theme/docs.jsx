// The docs templates, ported from theme-classic: the docs layout (sidebar, collapse button, main column), a doc
// page (breadcrumbs, content, footer, pagination, table of contents), generated category index pages and doc cards.
import { clsx, useContext, styles, ThemeClassNames, translate, Translate, Link, withBaseUrl, isInternalUrl, samePath, themeConfig, siteConfig, Head, Heading, IconArrow, IconHome, IconEdit, IconExternalLink } from './core.jsx';
import { BackToTopButton, Logo, PageMetadata, SearchMetadata } from './chrome.jsx';
import { Admonition, MDXContent } from './content.jsx';

export const isActiveSidebarItem = (item, activePath) => {
	if (item.type === 'link') return item.href !== undefined && samePath(item.href, activePath);
	if (item.type === 'category') return (item.href !== undefined && samePath(item.href, activePath)) || item.items.some((sub) => isActiveSidebarItem(sub, activePath));
	return false;
};
function isVisibleSidebarItem(item, activePath) {
	if (item.type === 'category') return isActiveSidebarItem(item, activePath) || (item.href !== undefined && !item.linkUnlisted) || item.items.some((sub) => isVisibleSidebarItem(sub, activePath));
	if (item.type === 'link') return !item.unlisted || isActiveSidebarItem(item, activePath);
	return true;
}
export function findFirstSidebarItemLink(item) {
	if (item.type === 'link' && !item.unlisted) return item.href;
	if (item.type === 'category') {
		if (item.href && !item.linkUnlisted) return item.href;
		for (const sub of item.items) {
			const link = findFirstSidebarItemLink(sub);
			if (link) return link;
		}
	}
	return undefined;
}
export function sidebarBreadcrumbs(items, pathname, onlyCategories = false) {
	const out = [];
	const extract = (list) => {
		for (const item of list) {
			if (item.type === 'category') {
				if (samePath(item.href, pathname) || extract(item.items)) {
					out.unshift(item);
					return true;
				}
			} else if (item.type === 'link' && item.docId && samePath(item.href, pathname)) {
				if (!onlyCategories) out.unshift(item);
				return true;
			}
		}
		return false;
	};
	extract(items);
	return out;
}
export function currentSidebarCategory() {
	const { sidebar, path } = useContext();
	return sidebarBreadcrumbs(sidebar.items, path, true).slice(-1)[0];
}

function DocSidebarItemLink({ item, activePath, level, index, ...props }) {
	const { href, label, className, autoAddBaseUrl } = item;
	const isActive = isActiveSidebarItem(item, activePath);
	const internal = isInternalUrl(href);
	return (
		<li className={clsx(ThemeClassNames.docs.docSidebarItemLink, ThemeClassNames.docs.docSidebarItemLinkLevel(level), 'menu__list-item', className)}>
			<Link className={clsx('menu__link', !internal && styles('DocSidebarItem/Link').menuExternalLink, { 'menu__link--active': isActive })} autoAddBaseUrl={autoAddBaseUrl} aria-current={isActive ? 'page' : undefined} to={href} {...props}>
				<span className={styles('DocSidebarItem/Link').linkLabel}>{label}</span>
				{!internal && <IconExternalLink />}
			</Link>
		</li>
	);
}

function DocSidebarItemHtml({ item, level }) {
	const { value, defaultStyle, className } = item;
	return <li className={clsx(ThemeClassNames.docs.docSidebarItemLink, ThemeClassNames.docs.docSidebarItemLinkLevel(level), defaultStyle && [styles('DocSidebarItem/Html').menuHtmlItem, 'menu__list-item'], className)} dangerouslySetInnerHTML={{ __html: value }} />;
}

// A collapsed category's items are not in the page until it is first opened (the theme's lazy Collapsible):
// lib/site.ts renders them then, from the sidebar's JSON file that lib/sidebars.json names.
function DocSidebarItemCategory({ item, activePath, level, index, ...props }) {
	const visible = item.items.filter((sub) => isVisibleSidebarItem(sub, activePath));
	if (visible.length === 0) {
		if (typeof item.href !== 'string') return null;
		const { type, collapsed, collapsible, items, linkUnlisted, ...rest } = item;
		return <DocSidebarItemLink item={{ type: 'link', ...rest }} activePath={activePath} level={level} index={index} {...props} />;
	}
	const { items, label, collapsible, className, href } = item;
	const s = styles('DocSidebarItem/Category');
	const isActive = isActiveSidebarItem(item, activePath);
	const isCurrentPage = samePath(href, activePath);
	const collapsed = !collapsible ? false : isActive ? false : item.collapsed;
	// useCategoryHrefWithSSRFallback once in the browser: the first item's link is only the server render's fallback.
	const hrefWithFallback = href && !item.linkUnlisted ? href : undefined;
	return (
		<li className={clsx(ThemeClassNames.docs.docSidebarItemCategory, ThemeClassNames.docs.docSidebarItemCategoryLevel(level), 'menu__list-item', { 'menu__list-item--collapsed': collapsed }, className)}>
			<div className={clsx('menu__list-item-collapsible', { 'menu__list-item-collapsible--active': isCurrentPage })}>
				<Link
					className={clsx(s.categoryLink, 'menu__link', { 'menu__link--sublist': collapsible, 'menu__link--sublist-caret': !href && collapsible, 'menu__link--active': isActive })}
					aria-current={isCurrentPage ? 'page' : undefined}
					role={collapsible && !href ? 'button' : undefined}
					aria-expanded={collapsible && !href ? !collapsed : undefined}
					href={collapsible ? (hrefWithFallback ?? '#') : hrefWithFallback}
					{...props}>
					<span className={s.categoryLinkLabel}>{label}</span>
				</Link>
				{href && collapsible && (
					<button
						aria-label={collapsed ? translate({ id: 'theme.DocSidebarItem.expandCategoryAriaLabel', message: "Expand sidebar category '{label}'" }, { label }) : translate({ id: 'theme.DocSidebarItem.collapseCategoryAriaLabel', message: "Collapse sidebar category '{label}'" }, { label })}
						aria-expanded={!collapsed}
						type="button"
						className="clean-btn menu__caret"
					/>
				)}
			</div>
			{!collapsed && (
				<ul className="menu__list" style="display: block; overflow: visible; height: auto;">
					<DocSidebarItems items={items} tabIndex={0} activePath={activePath} level={level + 1} />
				</ul>
			)}
		</li>
	);
}

export function DocSidebarItems({ items, ...props }) {
	return items
		.filter((item) => isVisibleSidebarItem(item, props.activePath))
		.map((item, index) => {
			if (item.type === 'category') return <DocSidebarItemCategory item={item} index={index} {...props} />;
			if (item.type === 'html') return <DocSidebarItemHtml item={item} index={index} {...props} />;
			return <DocSidebarItemLink item={item} index={index} {...props} />;
		});
}

function SidebarAd() {
	return <div style={{ border: 'solid thin red', padding: 10, textAlign: 'center' }}>Sidebar Ad</div>;
}

function DocSidebarDesktop({ path, sidebar }) {
	const { navbar, docs } = themeConfig();
	const s = styles('DocSidebar/Desktop');
	const content = styles('DocSidebar/Desktop/Content');
	const collapse = styles('DocSidebar/Desktop/CollapseButton');
	const ad = path.includes('/tests/');
	return (
		<div className={clsx(s.sidebar, navbar.hideOnScroll && s.sidebarWithHideableNavbar)}>
			{navbar.hideOnScroll && <Logo tabIndex={-1} className={s.sidebarLogo} />}
			{ad && <SidebarAd />}
			<nav aria-label={translate({ id: 'theme.docs.sidebar.navAriaLabel', message: 'Docs sidebar' })} className={clsx('menu thin-scrollbar', content.menu, themeConfig().announcementBar && content.menuWithAnnouncementBar)}>
				<ul className={clsx(ThemeClassNames.docs.docSidebarMenu, 'menu__list')}>
					<DocSidebarItems items={sidebar} activePath={path} level={1} />
				</ul>
			</nav>
			{ad && <SidebarAd />}
			{docs.sidebar.hideable && (
				<button type="button" title={translate({ id: 'theme.docs.sidebar.collapseButtonTitle', message: 'Collapse sidebar' })} aria-label={translate({ id: 'theme.docs.sidebar.collapseButtonAriaLabel', message: 'Collapse sidebar' })} className={clsx('button button--secondary button--outline', collapse.collapseSidebarButton)}>
					<IconArrow className={collapse.collapseSidebarButtonIcon} />
				</button>
			)}
		</div>
	);
}

export function DocRootLayout({ children }) {
	const { sidebar, path } = useContext();
	const root = styles('DocRoot/Layout');
	const aside = styles('DocRoot/Layout/Sidebar');
	const main = styles('DocRoot/Layout/Main');
	return (
		<div className={root.docsWrapper}>
			<BackToTopButton />
			<div className={root.docRoot}>
				{sidebar && (
					<aside className={clsx(ThemeClassNames.docs.docSidebarContainer, aside.docSidebarContainer)} data-mm-sidebar={`${useContext().version.pluginId}:${sidebar.name}`}>
						<div className={aside.sidebarViewport}>
							<DocSidebarDesktop sidebar={sidebar.items} path={path} />
						</div>
					</aside>
				)}
				<main className={clsx(main.docMainContainer, !sidebar && main.docMainContainerEnhanced)}>
					<div className={clsx('container padding-top--md padding-bottom--lg', main.docItemWrapper)}>{children}</div>
				</main>
			</div>
		</div>
	);
}

export function DocBreadcrumbs() {
	const { sidebar, path, docsPluginData, siteConfig: config } = useContext();
	if (docsPluginData?.breadcrumbs === false || !sidebar) return null;
	const breadcrumbs = sidebarBreadcrumbs(sidebar.items, path);
	const s = styles('DocBreadcrumbs');
	const home = styles('DocBreadcrumbs/Items/Home');
	const structured = {
		'@context': 'https://schema.org',
		'@type': 'BreadcrumbList',
		itemListElement: breadcrumbs.filter((b) => b.href).map((b, index) => ({ '@type': 'ListItem', position: index + 1, name: b.label, item: `${config.url}${b.href}`.replace(/\/$/, config.trailingSlash ? '/' : '') })),
	};
	return (
		<>
			<Head>
				<script type="application/ld+json">{JSON.stringify(structured)}</script>
			</Head>
			<nav className={clsx(ThemeClassNames.docs.docBreadcrumbs, s.breadcrumbsContainer)} aria-label={translate({ id: 'theme.docs.breadcrumbs.navAriaLabel', message: 'Breadcrumbs' })}>
				<ul className="breadcrumbs">
					<li className="breadcrumbs__item">
						<Link aria-label={translate({ id: 'theme.docs.breadcrumbs.home', message: 'Home page' })} className="breadcrumbs__link" href={withBaseUrl('/')}>
							<IconHome className={home.breadcrumbHomeIcon} />
						</Link>
					</li>
					{breadcrumbs.map((item, idx) => {
						const isLast = idx === breadcrumbs.length - 1;
						const href = item.type === 'category' && item.linkUnlisted ? undefined : item.href;
						return (
							<li className={clsx('breadcrumbs__item', { 'breadcrumbs__item--active': isLast })}>
								{isLast || !href ? (
									<span className="breadcrumbs__link">{item.label}</span>
								) : (
									<Link className="breadcrumbs__link" href={href}>
										<span>{item.label}</span>
									</Link>
								)}
							</li>
						);
					})}
				</ul>
			</nav>
		</>
	);
}

function DocVersionBadge({ className }) {
	const { version } = useContext();
	if (!version?.badge) return null;
	return (
		<span className={clsx(className, ThemeClassNames.docs.docVersionBadge, 'badge badge--secondary')}>
			<Translate id="theme.docs.versionBadge.label" values={{ versionLabel: version.label }}>
				{'Version: {versionLabel}'}
			</Translate>
		</span>
	);
}

function DocVersionBanner() {
	const { version } = useContext();
	if (!version?.banner) return null;
	throw new Error('version banners are not ported: the old site builds one docs version');
}

function treeify(flat) {
	const headings = flat.map((h) => ({ ...h, parentIndex: -1, children: [] }));
	const prev = Array(7).fill(-1);
	headings.forEach((curr, i) => {
		curr.parentIndex = Math.max(...prev.slice(2, curr.level));
		prev[curr.level] = i;
	});
	const roots = [];
	headings.forEach((h) => {
		const { parentIndex, ...rest } = h;
		if (parentIndex >= 0) headings[parentIndex].children.push(rest);
		else roots.push(rest);
	});
	return roots;
}
function filterToc(toc, min, max) {
	return toc.flatMap((item) => {
		const children = filterToc(item.children, min, max);
		return item.level >= min && item.level <= max ? [{ ...item, children }] : children;
	});
}

function TOCItemTree({ toc, className, linkClassName, isChild }) {
	if (!toc.length) return null;
	return (
		<ul className={isChild ? undefined : className}>
			{toc.map((heading) => (
				<li>
					<Link to={`#${heading.id}`} className={linkClassName ?? undefined} dangerouslySetInnerHTML={{ __html: heading.value }} />
					<TOCItemTree isChild toc={heading.children} className={className} linkClassName={linkClassName} />
				</li>
			))}
		</ul>
	);
}

export function TOCItems({ toc, className = 'table-of-contents table-of-contents__left-border', linkClassName = 'table-of-contents__link', minHeadingLevel, maxHeadingLevel }) {
	const config = themeConfig().tableOfContents;
	const tree = filterToc(treeify(toc), minHeadingLevel ?? config.minHeadingLevel, maxHeadingLevel ?? config.maxHeadingLevel);
	return <TOCItemTree toc={tree} className={className} linkClassName={linkClassName} />;
}

export function TOC({ className, ...props }) {
	return (
		<div className={clsx(styles('TOC').tableOfContents, 'thin-scrollbar', className)}>
			<TOCItems {...props} linkClassName="table-of-contents__link toc-highlight" />
		</div>
	);
}

// TOCCollapsible: its list is mounted on first opening (lazy); lib/site.ts makes it from the page's TOC then.
export function TOCCollapsible({ toc, className, minHeadingLevel, maxHeadingLevel }) {
	const s = styles('TOCCollapsible');
	const button = styles('TOCCollapsible/CollapseButton');
	return (
		<div className={clsx(s.tocCollapsible, className)}>
			<button type="button" className={clsx('clean-btn', button.tocCollapsibleButton)}>
				<Translate id="theme.TOCCollapsible.toggleButtonLabel">On this page</Translate>
			</button>
		</div>
	);
}

export function DocPaginator({ className, previous, next }) {
	return (
		<nav className={clsx(className, 'pagination-nav')} aria-label={translate({ id: 'theme.docs.paginator.navAriaLabel', message: 'Docs pages' })}>
			{previous && <PaginatorNavLink {...previous} subLabel={<Translate id="theme.docs.paginator.previous">Previous</Translate>} />}
			{next && <PaginatorNavLink {...next} subLabel={<Translate id="theme.docs.paginator.next">Next</Translate>} isNext />}
		</nav>
	);
}

export function PaginatorNavLink({ permalink, title, subLabel, isNext }) {
	return (
		<Link className={clsx('pagination-nav__link', isNext ? 'pagination-nav__link--next' : 'pagination-nav__link--prev')} to={permalink}>
			{subLabel && <div className="pagination-nav__sublabel">{subLabel}</div>}
			<div className="pagination-nav__label">{title}</div>
		</Link>
	);
}

export function EditThisPage({ editUrl }) {
	return (
		<Link to={editUrl} className={ThemeClassNames.common.editThisPage}>
			<IconEdit />
			<Translate id="theme.common.editThisPage">Edit this page</Translate>
		</Link>
	);
}

export function LastUpdated({ lastUpdatedAt, lastUpdatedBy }) {
	const at = lastUpdatedAt ? new Date(lastUpdatedAt) : undefined;
	const date = at && new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(at);
	return (
		<span className={ThemeClassNames.common.lastUpdated}>
			<Translate
				id="theme.lastUpdated.lastUpdatedAtBy"
				values={{
					atDate: at ? (
						<Translate
							id="theme.lastUpdated.atDate"
							values={{
								date: (
									<b>
										<time dateTime={at.toISOString()} itemProp="dateModified">
											{date}
										</time>
									</b>
								),
							}}>
							{' on {date}'}
						</Translate>
					) : (
						''
					),
					byUser: lastUpdatedBy ? (
						<Translate id="theme.lastUpdated.byUser" values={{ user: <b>{lastUpdatedBy}</b> }}>
							{' by {user}'}
						</Translate>
					) : (
						''
					),
				}}>
				{'Last updated{atDate}{byUser}'}
			</Translate>
		</span>
	);
}

export function EditMetaRow({ className, editUrl, lastUpdatedAt, lastUpdatedBy }) {
	const s = styles('EditMetaRow');
	return (
		<div className={clsx('row', className)}>
			<div className={clsx('col', s.noPrint)}>{editUrl && <EditThisPage editUrl={editUrl} />}</div>
			<div className={clsx('col', s.lastUpdated)}>{(lastUpdatedAt || lastUpdatedBy) && <LastUpdated lastUpdatedAt={lastUpdatedAt} lastUpdatedBy={lastUpdatedBy} />}</div>
		</div>
	);
}

export function Tag({ permalink, label, count, description }) {
	const s = styles('Tag');
	return (
		<Link rel="tag" href={permalink} title={description} className={clsx(s.tag, count ? s.tagWithCount : s.tagRegular)}>
			{label}
			{count && <span>{count}</span>}
		</Link>
	);
}

export function TagsListInline({ tags }) {
	const s = styles('TagsListInline');
	return (
		<>
			<b>
				<Translate id="theme.tags.tagsListLabel">Tags:</Translate>
			</b>
			<ul className={clsx(s.tags, 'padding--none', 'margin-left--sm')}>
				{tags.map((tag) => (
					<li className={s.tag}>
						<Tag {...tag} />
					</li>
				))}
			</ul>
		</>
	);
}

export function Unlisted({ className }) {
	return (
		<>
			<Head>
				<meta name="robots" content="noindex, nofollow" />
			</Head>
			<Admonition type="warning" title={<Translate id="theme.contentVisibility.unlistedBanner.title">Unlisted page</Translate>} className={clsx(className, ThemeClassNames.common.unlistedBanner)}>
				<Translate id="theme.contentVisibility.unlistedBanner.message">This page is unlisted. Search engines will not index it, and only users having a direct link can access it.</Translate>
			</Admonition>
		</>
	);
}
export function Draft({ className }) {
	return (
		<Admonition type="warning" title={<Translate id="theme.contentVisibility.draftBanner.title">Draft page</Translate>} className={clsx(className, ThemeClassNames.common.draftBanner)}>
			<Translate id="theme.contentVisibility.draftBanner.message">This page is a draft. It will only be visible in dev and be excluded from the production build.</Translate>
		</Admonition>
	);
}
export function ContentVisibility({ metadata }) {
	const { unlisted, frontMatter = {} } = metadata;
	return (
		<>
			{(unlisted || frontMatter.unlisted) && <Unlisted />}
			{frontMatter.draft && <Draft />}
		</>
	);
}

// @theme/DocItem: the doc's MDX content in its layout.
// Where theme-classic's doc page puts the MDX content in React's tree: the layout's place, packed, then the content as
// the second of DocItem/Content's two children (the synthetic title before it).
const DOC_CONTENT_TREE_PLACE = { overflow: 'hralaqh', forks: [[2, 1]] };
export function DocItem({ content: Content }) {
	const { doc } = useContext();
	const { metadata, frontMatter, toc, contentTitle, assets } = doc;
	const s = styles('DocItem/Layout');
	const hidden = frontMatter.hide_table_of_contents;
	const canRender = !hidden && toc.length > 0;
	const syntheticTitle = !frontMatter.hide_title && typeof contentTitle === 'undefined' ? metadata.title : null;
	const { editUrl, lastUpdatedAt, lastUpdatedBy, tags } = metadata;
	const tagsRow = tags.length > 0;
	const editRow = !!(editUrl || lastUpdatedAt || lastUpdatedBy);
	return (
		<>
			<PageMetadata title={metadata.title} description={metadata.description} keywords={frontMatter.keywords} image={assets?.image ?? frontMatter.image} />
			<div className="row">
				<div className={clsx('col', !hidden && s.docItemCol)}>
					<ContentVisibility metadata={metadata} />
					<DocVersionBanner />
					<div className={s.docItemContainer}>
						<article>
							<DocBreadcrumbs />
							<DocVersionBadge />
							{canRender && <TOCCollapsible toc={toc} minHeadingLevel={frontMatter.toc_min_heading_level} maxHeadingLevel={frontMatter.toc_max_heading_level} className={clsx(ThemeClassNames.docs.docTocMobile, styles('DocItem/TOC/Mobile').tocMobile)} />}
							<div className={clsx(ThemeClassNames.docs.docMarkdown, 'markdown')}>
								{syntheticTitle && (
									<header>
										<Heading as="h1">{syntheticTitle}</Heading>
									</header>
								)}
								<MDXContent reactTreePlace={DOC_CONTENT_TREE_PLACE}>
						<Content />
					</MDXContent>
							</div>
							{(tagsRow || editRow) && (
								<footer className={clsx(ThemeClassNames.docs.docFooter, 'docusaurus-mt-lg')}>
									{tagsRow && (
										<div className={clsx('row margin-top--sm', ThemeClassNames.docs.docFooterTagsRow)}>
											<div className="col">
												<TagsListInline tags={tags} />
											</div>
										</div>
									)}
									{editRow && <EditMetaRow className={clsx('margin-top--sm', ThemeClassNames.docs.docFooterEditMetaRow)} editUrl={editUrl} lastUpdatedAt={lastUpdatedAt} lastUpdatedBy={lastUpdatedBy} />}
								</footer>
							)}
						</article>
						<DocPaginator className="docusaurus-mt-lg" previous={metadata.previous} next={metadata.next} />
					</div>
				</div>
				{canRender && (
					<div className="col col--3">
						<TOC toc={toc} minHeadingLevel={frontMatter.toc_min_heading_level} maxHeadingLevel={frontMatter.toc_max_heading_level} className={ThemeClassNames.docs.docTocDesktop} />
					</div>
				)}
			</div>
		</>
	);
}

const extractLeadingEmoji = (text) => {
	const match = /^(\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic})*️?)\s*/u.exec(text);
	return match ? { emoji: match[1], rest: text.slice(match[0].length) } : { emoji: undefined, rest: text };
};

function DocCardLayout({ className, href, icon, title, description }) {
	const layout = styles('DocCard/Layout');
	const heading = styles('DocCard/Heading');
	return (
		<Link href={href} className={clsx('card padding--lg', ThemeClassNames.docs.docCard.container, layout.cardContainer, className)}>
			<Heading as="h2" className={clsx(ThemeClassNames.docs.docCard.heading, heading.cardTitle)} title={title}>
				{icon && <span className={clsx(ThemeClassNames.docs.docCard.icon, styles('DocCard/Heading/Icon').cardTitleIcon)}>{icon}</span>}
				<span className={clsx('text--truncate', ThemeClassNames.docs.docCard.title, styles('DocCard/Heading/Text').cardTitleText)}>{title}</span>
			</Heading>
			{description && (
				<p className={clsx('text--truncate', ThemeClassNames.docs.docCard.description, styles('DocCard/Description').cardDescription)} title={description}>
					{description}
				</p>
			)}
		</Link>
	);
}

function iconTitle(item) {
	const extracted = extractLeadingEmoji(item.label);
	const fallback = item.type === 'category' ? '🗃️' : isInternalUrl(item.href) ? '📄️' : '🔗';
	return { icon: extracted.emoji ?? fallback, title: extracted.rest.trim() };
}

export function DocCard({ item }) {
	const { version } = useContext();
	if (item.type === 'category') {
		const href = findFirstSidebarItemLink(item);
		if (!href) return null;
		const count = item.items.length;
		return <DocCardLayout className={item.className} href={href} description={item.description ?? (count === 1 ? '1 item' : `${count} items`)} {...iconTitle(item)} />;
	}
	const doc = item.docId ? version.docs[item.docId] : undefined;
	return <DocCardLayout className={item.className} href={item.href} description={item.description ?? doc?.description} {...iconTitle(item)} />;
}

export function DocCardList({ items, className }) {
	const list = items ?? (() => {
		const { sidebar, path } = useContext();
		return sidebarBreadcrumbs(sidebar.items, path, true).slice(-1)[0]?.items ?? sidebar.items;
	})();
	const s = styles('DocCardList');
	return (
		<section className={clsx('row', className)}>
			{list
				.filter((item) => (item.type === 'category' || item.type === 'link' ? !!findFirstSidebarItemLink(item) : true))
				.map((item) => (
					<article className={clsx(s.docCardListItem, 'col col--6')}>
						<DocCard item={item} />
					</article>
				))}
		</section>
	);
}

// @theme/DocCategoryGeneratedIndexPage with the site's wrapper (the hint footer).
export function DocCategoryGeneratedIndexPage({ categoryGeneratedIndex: index }) {
	const s = styles('DocCategoryGeneratedIndexPage');
	const category = currentSidebarCategory();
	const site = styles('../website/src/theme/DocCategoryGeneratedIndexPage/styles.module.css');
	const docPath = useContext().globalData['docusaurus-plugin-content-docs'].default.versions[0].docs.find((doc) => doc.id === 'guides/docs/sidebar/items')?.path;
	return (
		<>
			<PageMetadata title={index.title} description={index.description} keywords={index.keywords} image={withBaseUrl(index.image)} />
			<div className={s.generatedIndexPage}>
				<DocVersionBanner />
				<DocBreadcrumbs />
				<DocVersionBadge />
				<header>
					<Heading as="h1" className={s.title}>
						{index.title}
					</Heading>
					{index.description && <p>{index.description}</p>}
				</header>
				<article className="margin-top--lg">
					<DocCardList items={category.items} className={s.list} />
				</article>
				<footer className="margin-top--md">
					<DocPaginator previous={index.navigation.previous} next={index.navigation.next} />
				</footer>
			</div>
			<p className={site.footerTip}>
				<Translate values={{ guideLink: <Link to={`${docPath}#category-link`}><Translate>the generated index page guide</Translate></Link> }}>{'Want to implement the same page? Read {guideLink} to find out!'}</Translate>
			</p>
		</>
	);
}

export { SearchMetadata, siteConfig };

function TagsListByLetter({ tags }) {
	const groups = {};
	for (const tag of Object.values(tags)) (groups[tag.label[0].toUpperCase()] ??= []).push(tag);
	const letters = Object.entries(groups)
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([letter, list]) => ({ letter, tags: list.sort((a, b) => a.label.localeCompare(b.label)) }));
	const s = styles('TagsListByLetter');
	return (
		<section className="margin-vert--lg">
			{letters.map((entry) => (
				<article>
					<Heading as="h2" id={entry.letter}>
						{entry.letter}
					</Heading>
					<ul className="padding--none">
						{entry.tags.map((tag) => (
							<li className={s.tag}>
								<Tag {...tag} />
							</li>
						))}
					</ul>
					<hr />
				</article>
			))}
		</section>
	);
}
export { TagsListByLetter };

export function DocTagsListPage({ tags }) {
	const title = translate({ id: 'theme.tags.tagsPageTitle', message: 'Tags' });
	return (
		<>
			<PageMetadata title={title} />
			<SearchMetadata tag="doc_tags_list" />
			<div className="container margin-vert--lg">
				<div className="row">
					<main className="col col--8 col--offset-2">
						<Heading as="h1">{title}</Heading>
						<TagsListByLetter tags={tags} />
					</main>
				</div>
			</div>
		</>
	);
}

export function DocTagDocListPage({ tag }) {
	const n = tag.count === 1 ? 'One doc tagged' : `${tag.count} docs tagged`;
	const title = translate({ id: 'theme.docs.tagDocListPageTitle', message: '{nDocsTagged} with "{tagName}"' }, { nDocsTagged: n, tagName: tag.label });
	return (
		<>
			<PageMetadata title={title} description={tag.description} />
			<SearchMetadata tag="doc_tag_doc_list" />
			<div className="container margin-vert--lg">
				<div className="row">
					<main className="col col--8 col--offset-2">
						{tag.unlisted && <Unlisted />}
						<header className="margin-bottom--xl">
							<Heading as="h1">{title}</Heading>
							{tag.description && <p>{tag.description}</p>}
							<Link href={tag.allTagsPath}>
								<Translate id="theme.tags.tagsPageLink">View all tags</Translate>
							</Link>
						</header>
						<section className="margin-vert--lg">
							{tag.items.map((doc) => (
								<article className="margin-vert--lg">
									<Link to={doc.permalink}>
										<Heading as="h2">{doc.title}</Heading>
									</Link>
									{doc.description && <p>{doc.description}</p>}
								</article>
							))}
						</section>
					</main>
				</div>
			</div>
		</>
	);
}
