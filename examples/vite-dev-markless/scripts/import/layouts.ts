import { docsHeader, docsTopBanner, marketingTopBanner } from './header.ts';

// One writer per layout of @voidzero-dev/vitepress-theme: Layout.vue with VPDoc, VPPage or NotFound inside, and
// VPLayout.vue's marketing layout for `layout: home`. Each returns the page's markup as the theme leaves it once
// mounted, scope attributes included, around the Markdown the site's own pipeline rendered.

export interface SidebarItem {
	readonly text?: string;
	readonly link?: string;
	readonly items?: readonly SidebarItem[];
	readonly collapsed?: boolean;
	readonly rel?: string;
	readonly target?: string;
}

export interface OutlineItem {
	readonly title: string;
	readonly link: string;
	readonly children: readonly OutlineItem[];
}

export interface PageLink {
	readonly text: string;
	readonly link: string;
}

export interface Page {
	readonly route: string;
	readonly relativePath: string;
	readonly frontmatter: Record<string, unknown>;
	content: string;
	readonly sidebar: readonly SidebarItem[];
	readonly headers: readonly OutlineItem[];
	readonly prev?: PageLink;
	readonly next?: PageLink;
	readonly editLink?: { readonly url: string; readonly text: string };
	readonly hasAside: boolean;
	readonly copyright: string;
	readonly nav: string;
	readonly isActive: (link: string | undefined) => boolean;
	readonly isExternal: (link: string) => boolean;
}

const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const attr = (t: string) => esc(t).replace(/"/g, '&quot;');
const cls = (...names: (string | false | undefined)[]) => names.filter(Boolean).join(' ');

function vpLink(href: string, own: string, inner: string, scope: string, isExternal: boolean, extra: { noIcon?: boolean; target?: string; rel?: string } = {}): string {
	const classes = cls('VPLink', 'link', isExternal && 'vp-external-link-icon', extra.noIcon && 'no-icon', own);
	const target = extra.target ?? (isExternal ? '_blank' : undefined);
	const rel = extra.rel ?? (isExternal ? 'noreferrer' : undefined);
	return `<a class="${classes}" href="${attr(href)}"${target ? ` target="${target}"` : ''}${rel ? ` rel="${rel}"` : ''} ${scope}>${inner}</a>`;
}

// VPSidebarItem.vue, as it renders once mounted (is-active and has-active set from the page's path).
function sidebarItem(page: Page, item: SidebarItem, depth: number): string {
	const S = 'data-v-75c067b6=""';
	const hasChildren = !!item.items?.length;
	const isLink = !!item.link;
	const active = page.isActive(item.link);
	const hasActive = active || (item.items ? containsActive(page, item.items) : false);
	const collapsible = item.collapsed != null;
	const sectionTag = hasChildren ? 'section' : 'div';
	const textTag = !hasChildren ? 'p' : depth + 2 === 7 ? 'p' : `h${depth + 2}`;
	const classes = cls(
		'VPSidebarItem',
		`level-${depth}`,
		collapsible && 'collapsible',
		collapsible && item.collapsed && !hasActive && 'collapsed',
		isLink && 'is-link',
		active && 'is-active',
		hasActive && 'has-active',
	);
	const text = `<${textTag} class="text" ${S}>${item.text ?? ''}</${textTag}>`;
	let head = '';
	if (item.text) {
		const role = isLink ? '' : ' role="button"';
		const tabindex = item.items ? ' tabindex="0"' : '';
		const label = isLink ? vpLink(item.link!, 'link', text, S, false, { rel: item.rel, target: item.target }) : text;
		head = `<div class="item"${role}${tabindex} ${S}><div class="indicator" ${S}></div>${label}</div>`;
	}
	const children =
		hasChildren && depth < 5
			? `<div class="items" ${S}>${item.items!.map((child) => sidebarItem(page, child, depth + 1)).join('')}</div>`
			: hasChildren
				? `<div class="items" ${S}></div>`
				: '';
	return `<${sectionTag} class="${classes}" ${depth === 0 ? 'data-v-f767aff1="" ' : ''}${S}>${head}${children}</${sectionTag}>`;
}

function containsActive(page: Page, items: readonly SidebarItem[]): boolean {
	return items.some((item) => page.isActive(item.link) || (item.items ? containsActive(page, item.items) : false));
}

function sidebar(page: Page): string {
	const S = 'data-v-18fce6cf=""';
	// VPSidebarGroup.vue drops `no-transition` 300 ms after mounting; the page script does the same.
	const groups = page.sidebar.map((item) => `<div class="no-transition group" data-v-f767aff1="">${sidebarItem(page, item, 0)}</div>`).join('');
	return `<aside class="VPSidebar" data-v-2ea92cbb="" ${S}><nav class="nav" id="VPSidebarNav" aria-labelledby="sidebar-aria-label" tabindex="-1" ${S}><span class="visually-hidden" id="sidebar-aria-label" ${S}> Sidebar Navigation </span>${groups}</nav></aside>`;
}

function outlineItems(items: readonly OutlineItem[], root: boolean, outerScope: string): string {
	const S = 'data-v-546b81a5=""';
	const lis = items
		.map(
			(item) =>
				`<li ${S}><a class="outline-link" href="${attr(item.link)}" title="${attr(item.title)}" ${S}>${esc(item.title)}</a>${item.children.length ? outlineItems(item.children, false, '') : ''}</li>`,
		)
		.join('');
	return `<ul class="VPDocOutlineItem ${root ? 'root' : 'nested'}" ${outerScope}${S}>${lis}</ul>`;
}

// VPLocalNav.vue: shown while the page has an outline or a sidebar (otherwise only once scrolled past the nav, which
// the page script handles).
export function localNav(page: Page, hasSidebar: boolean): string {
	const S = 'data-v-50962069=""';
	const D = 'data-v-5bab9656=""';
	const hasLocalNav = page.headers.length > 0;
	const classes = cls('VPLocalNav', hasSidebar && 'has-sidebar', !hasLocalNav && 'empty', !hasLocalNav && !hasSidebar && 'fixed');
	const menu = hasSidebar
		? `<button class="menu" aria-expanded="false" aria-controls="VPSidebarNav" ${S}><span class="vpi-align-left menu-icon" ${S}></span><span class="menu-text" ${S}>Menu</span></button>`
		: '';
	const button = hasLocalNav
		? `<button class="" ${D}><span class="menu-text" ${D}>On this page</span><span class="vpi-chevron-right icon" ${D}></span></button>`
		: `<button ${D}>Return to top</button>`;
	return `<div class="${classes}" data-v-2ea92cbb="" ${S}><div class="container" ${S}>${menu}<div class="VPLocalNavOutlineDropdown" style="--vp-vh:0px;" ${S} ${D}>${button}</div></div></div>`;
}

const OUTLINE_ICON =
	'<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" data-v-e8d9ab97=""><path d="M7.3335 3.66669H14.0002" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" data-v-e8d9ab97=""></path><path d="M3.6 11.2618C4.31111 11.738 4.66667 11.9762 4.66667 12.3334C4.66667 12.6906 4.31111 12.9287 3.6 13.405C2.88889 13.8812 2.53333 14.1193 2.26667 13.9408C2 13.7622 2 13.2859 2 12.3334C2 11.3808 2 10.9046 2.26667 10.726C2.53333 10.5474 2.88889 10.7855 3.6 11.2618Z" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" data-v-e8d9ab97=""></path><path d="M3.6 2.59509C4.31111 3.07135 4.66667 3.30947 4.66667 3.66667C4.66667 4.02386 4.31111 4.26199 3.6 4.73825C2.88889 5.21451 2.53333 5.45263 2.26667 5.27403C2 5.09544 2 4.61918 2 3.66667C2 2.71415 2 2.23789 2.26667 2.0593C2.53333 1.8807 2.88889 2.11883 3.6 2.59509Z" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" data-v-e8d9ab97=""></path><path d="M7.3335 8H14.0002" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" data-v-e8d9ab97=""></path><path d="M7.3335 12.3333H14.0002" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" data-v-e8d9ab97=""></path></svg>';

// VPDocAside.vue with the outline (VPDocAsideOutline.vue), the site's aside-ads-before slot (AsideSponsors.vue: the
// ViteConf card, its sponsors grid filled by the page script) and Carbon's container.
function aside(page: Page, viteconf: string): string {
	const A = 'data-v-7089d1ca=""';
	const O = 'data-v-e8d9ab97=""';
	const F = 'data-v-ff42876e=""';
	const outline = `<nav aria-labelledby="doc-outline-aria-label" class="${cls('VPDocAsideOutline', page.headers.length > 0 && 'has-outline')}" ${A} ${O}><div class="content" ${O}><div class="outline-marker" ${O} style="top: 33px; opacity: 0;"></div><div aria-level="2" class="outline-title flex items-center gap-2 uppercase text-xs text-grey tracking-wide font-medium" id="doc-outline-aria-label" role="heading" ${O}>${OUTLINE_ICON} On this page</div>${outlineItems(page.headers, true, `${O} `)}</div></nav>`;
	const card = `<a class="viteconf" href="https://viteconf.org/" target="_blank" ${F}><img width="22" height="22" src="${viteconf}" alt="ViteConf Logo" ${F}><span ${F}><p class="extra-info" ${F}>Building Together</p><p class="heading" ${F}>ViteConf 2026</p><p class="extra-info" ${F}>October 15, Online</p></span></a>`;
	return `<div class="aside" data-v-94d54df8=""><div class="aside-curtain" data-v-94d54df8=""></div><div class="aside-container" data-v-94d54df8=""><div class="aside-content" data-v-94d54df8=""><div class="VPDocAside" data-v-94d54df8="" ${A}>${outline}<div class="spacer" ${A}></div>${card}<div class="VPDocAsideCarbonAds" ${A}><div class="VPCarbonAds" data-v-db82336e=""></div></div></div></div></div></div>`;
}

// VPDocFooter.vue: edit link and the previous and next sidebar pages.
function docFooter(page: Page): string {
	const S = 'data-v-56f0051a=""';
	const hasEditLink = !!page.editLink && page.frontmatter.editLink !== false;
	// usePrevNext gives an object for each side unless the page hides it, so the footer shows even when both are empty.
	if (!hasEditLink && page.frontmatter.prev === false && page.frontmatter.next === false) return '';
	const edit = hasEditLink
		? `<div class="edit-info" ${S}><div class="edit-link" ${S}>${vpLink(page.editLink!.url, 'edit-link-button', `<span class="vpi-square-pen edit-link-icon" ${S}></span> ${esc(page.editLink!.text)}`, S, true, { noIcon: true })}</div></div>`
		: '';
	const pager = (link: PageLink | undefined, kind: 'prev' | 'next') =>
		`<div class="pager" ${S}>${link ? vpLink(link.link, `pager-link ${kind}`, `<span class="desc" ${S}>${kind === 'prev' ? 'Previous page' : 'Next page'}</span><span class="title" ${S}>${link.text}</span>`, S, false) : ''}</div>`;
	const nav =
		page.prev || page.next
			? `<nav class="prev-next" aria-labelledby="doc-footer-aria-label" ${S}><span class="visually-hidden" id="doc-footer-aria-label" ${S}>Pager</span>${pager(page.prev, 'prev')}${pager(page.next, 'next')}</nav>`
			: '';
	return `<footer class="VPDocFooter" data-v-94d54df8="" ${S}>${edit}${nav}</footer>`;
}

const pageName = (route: string) => route.replace(/[./]+/g, '_').replace(/_html$/, '');

function vpFooter(page: Page, hasSidebar: boolean): string {
	return `<footer class="${cls('VPFooter', hasSidebar && 'has-sidebar')}" data-v-2ea92cbb="" data-v-ef3003f7=""><div class="container" data-v-ef3003f7=""><p class="copyright" data-v-ef3003f7="">${page.copyright}</p></div></footer>`;
}

const NOT_FOUND =
	'<div class="NotFound" data-v-2eb020da="" data-v-6b4b70f8=""><p class="code" data-v-6b4b70f8="">404</p><h1 class="title" data-v-6b4b70f8="">PAGE NOT FOUND</h1><div class="divider" data-v-6b4b70f8=""></div><blockquote class="quote" data-v-6b4b70f8="">But if you don\'t change your direction, and if you keep looking, you may end up where you are heading.</blockquote><div class="action" data-v-6b4b70f8=""><a class="link" href="/" aria-label="go to home" data-v-6b4b70f8="">Take me home</a></div></div>';

// Layout.vue (the theme's fork of VitePress's default layout): banner, skip link, header, local nav, sidebar, content, footer.
export function docsLayout(page: Page, kind: 'doc' | 'page' | 'not-found', viteconf: string, THEME: string): string {
	const hasSidebar = kind !== 'not-found' && page.frontmatter.sidebar !== false && page.sidebar.length > 0;
	const showLocalNav = kind !== 'not-found' && (page.headers.length > 0 || hasSidebar);
	let content: string;
	if (kind === 'doc') {
		const container = `<div class="container" data-v-94d54df8="">${page.hasAside ? aside(page, viteconf) : ''}<div class="content" data-v-94d54df8=""><div class="content-container" data-v-94d54df8=""><main class="main" data-v-94d54df8=""><div style="position:relative;" class="vp-doc ${pageName(page.route)}" data-v-94d54df8="">${page.content}</div></main>${docFooter(page)}</div></div></div>`;
		content = `<div class="${cls('VPDoc', hasSidebar && 'has-sidebar', page.hasAside && 'has-aside')}" data-v-2eb020da="" data-v-94d54df8="">${container}</div>`;
	} else if (kind === 'page') content = `<div class="VPPage" data-v-2eb020da=""><div style="position:relative;">${page.content}</div></div>`;
	else content = NOT_FOUND;
	return [
		// VitePress mounts the app in <div id="app">; Markless 0.7.0 marks <body> itself as the router's container.
		'<div id="app">',
		'<div class="docs-layout" data-variant="vite" data-v-56d116fe="">',
		'<div class="Layout" data-v-56d116fe="" data-v-2ea92cbb="">',
		docsTopBanner(THEME),
		'<span tabindex="-1" data-v-5e9be77a=""></span><a href="#VPContent" class="VPSkipLink visually-hidden" data-v-5e9be77a="">Skip to content</a>',
		// The not-found page's header links to the address that was asked for, which the page script fills in.
		docsHeader(kind === 'not-found' ? '/404' : page.route, page.nav, THEME),
		'<div class="flex flex-col min-h-screen" data-v-2ea92cbb="">',
		`<div class="${cls(hasSidebar && 'has-sidebar', 'content-wrapper flex-1')}" data-v-2ea92cbb="">`,
		showLocalNav ? localNav(page, hasSidebar) : '',
		hasSidebar ? sidebar(page) : '',
		`<div class="${cls('VPContent', hasSidebar && 'has-sidebar')}" id="VPContent" data-v-2ea92cbb="" data-v-2eb020da="">${content}</div>`,
		'</div>',
		vpFooter(page, hasSidebar),
		'</div>',
		'</div>',
		'</div>',
		'</div>',
	].join('');
}

// VPLayout.vue's marketing layout (`layout: home`): banner, header, then the page's own content.
export function marketingLayout(page: Page, THEME: string): string {
	return [
		'<div id="app">',
		`<div class="marketing-layout" data-theme="${attr(String(page.frontmatter.theme ?? ''))}" data-variant="vite" data-v-56d116fe="">`,
		marketingTopBanner(THEME),
		docsHeader(page.route, page.nav, THEME, true),
		`<div style="position:relative;" data-v-56d116fe="">${page.content}</div>`,
		'</div>',
		'</div>',
	].join('');
}
