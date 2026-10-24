// The page chrome every route shares, ported from theme-classic: skip link, announcement bar, navbar, footer,
// back-to-top, and the site-wide <head> metadata. (The navbar's mobile drawer is built by lib/site.ts from this
// navbar and the page's sidebar when the window is narrow, as the theme renders it only then.)
import {
	clsx,
	useContext,
	styles,
	ThemeClassNames,
	translate,
	Link,
	withBaseUrl,
	isInternalUrl,
	samePath,
	themeConfig,
	siteConfig,
	ThemedImage,
	Head,
	IconArrow,
	IconClose,
	IconMenu,
	IconLanguage,
	IconLightMode,
	IconDarkMode,
	IconSystemColorMode,
	IconExternalLink,
} from './core.jsx';
import { isReactServerMarkup } from '../source/h.mjs';
import { drawerMarkup, earlyDrawer } from '../../lib/drawer-markup.js';

// The docs plugin's global data, read the way useActiveDocContext reads it.
function docsPlugins() {
	return useContext().globalData['docusaurus-plugin-content-docs'] ?? {};
}
const stripSlash = (path) => (path.length > 1 ? path.replace(/\/$/, '') : path);
function matches(path, base, exact) {
	const a = stripSlash(path);
	const b = stripSlash(base);
	return exact ? a === b : a === b || a.startsWith(b === '/' ? '/' : `${b}/`);
}
export function activeDocContext(pluginId = 'default') {
	const path = useContext().path;
	const plugin = docsPlugins()[pluginId];
	if (!plugin) return { alternateDocVersions: {} };
	const activePlugin = Object.entries(docsPlugins()).find(([, data]) => matches(path, data.path, false));
	if (!activePlugin || activePlugin[0] !== pluginId) return { alternateDocVersions: {} };
	const activeVersion = plugin.versions.find((version) => matches(path, version.path, false));
	const activeDoc = activeVersion?.docs.find((doc) => matches(path, doc.path, true));
	const alternateDocVersions = {};
	if (activeDoc)
		for (const version of plugin.versions) {
			const doc = version.docs.find((d) => d.id === activeDoc.id);
			if (doc) alternateDocVersions[version.name] = doc;
		}
	return { activeVersion, activeDoc, alternateDocVersions };
}
function latestVersion(pluginId = 'default') {
	const plugin = docsPlugins()[pluginId];
	return plugin.versions.find((v) => v.isLast) ?? plugin.versions[0];
}
function layoutDoc(docId, pluginId = 'default') {
	const plugin = docsPlugins()[pluginId];
	if (!plugin) return null;
	const { activeVersion } = activeDocContext(pluginId);
	const version = activeVersion ?? latestVersion(pluginId);
	return version.docs.find((doc) => doc.id === docId) ?? null;
}

function SkipToContent() {
	const label = translate({ id: 'theme.common.skipToMainContent', message: 'Skip to main content' });
	return (
		<div role="region" aria-label={label}>
			<a className={styles('SkipToContent').skipToContent} href="#__docusaurus_skipToContent_fallback">
				{label}
			</a>
		</div>
	);
}

function AnnouncementBar() {
	const { announcementBar } = themeConfig();
	if (!announcementBar) return null;
	const s = styles('AnnouncementBar');
	const content = styles('AnnouncementBar/Content');
	const close = styles('AnnouncementBar/CloseButton');
	const { backgroundColor, textColor, isCloseable = true } = announcementBar;
	return (
		<div className={clsx(ThemeClassNames.announcementBar.container, s.announcementBar)} style={{ backgroundColor, color: textColor }} role="banner">
			{isCloseable && <div className={s.announcementBarPlaceholder} />}
			<div className={clsx(content.content, s.announcementBarContent)} dangerouslySetInnerHTML={{ __html: announcementBar.content }} />
			{isCloseable && (
				<button type="button" aria-label={translate({ id: 'theme.AnnouncementBar.closeButtonAriaLabel', message: 'Close' })} className={clsx('clean-btn close', close.closeButton, s.announcementBarClose)}>
					<IconClose width={14} height={14} strokeWidth={3.1} />
				</button>
			)}
		</div>
	);
}

export function Logo({ imageClassName, titleClassName, ...rest }) {
	const { title } = siteConfig();
	const { navbar } = themeConfig();
	const logo = navbar.logo;
	const alt = logo?.alt ?? (navbar.title ? '' : title);
	const image = logo && <ThemedImage className={logo.className} sources={{ light: withBaseUrl(logo.src), dark: withBaseUrl(logo.srcDark || logo.src) }} height={logo.height} width={logo.width} alt={alt} style={logo.style} />;
	return (
		<Link to={withBaseUrl(logo?.href || '/')} {...rest} {...(logo?.target && { target: logo.target })}>
			{logo && (imageClassName ? <div className={imageClassName}>{image}</div> : image)}
			{navbar.title != null && <b className={titleClassName}>{navbar.title}</b>}
		</Link>
	);
}

function NavbarLogo() {
	return <Logo className="navbar__brand" imageClassName="navbar__logo" titleClassName="navbar__title text--truncate" />;
}

// The toggle answers its first click in that click's frame, before lib/site.ts has loaded: it sets the colour mode
// as the theme's ColorModeProvider does and marks the click, and lib/site.ts finishes the rest when it starts.
const colorModeScript = (key, labels) =>
	`(function(s){var b=s.previousElementSibling,l=${JSON.stringify(labels)};b.addEventListener("click",function(e){if(window.__mmSiteBooted)return;e.__mmColorMode=1;window.__mmColorModeAt=e.timeStamp;var r=document.documentElement,c=r.getAttribute("data-theme-choice"),n=c==="light"?"dark":c==="dark"?"system":"light";try{n==="system"?localStorage.removeItem(${JSON.stringify(key)}):localStorage.setItem(${JSON.stringify(key)},n)}catch(x){}r.setAttribute("data-theme",n==="system"?(matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"):n);r.setAttribute("data-theme-choice",n);b.title=l[n];b.setAttribute("aria-label",l.aria.replace("{mode}",l[n]))});s.remove()})(document.currentScript)`;

export function ColorModeToggle({ className, buttonClassName }) {
	const s = styles('ColorModeToggle');
	const label = translate({ message: 'system mode', id: 'theme.colorToggle.ariaLabel.mode.system' });
	const labels = {
		light: translate({ message: 'light mode', id: 'theme.colorToggle.ariaLabel.mode.light' }),
		dark: translate({ message: 'dark mode', id: 'theme.colorToggle.ariaLabel.mode.dark' }),
		system: label,
		aria: translate({ message: 'Switch between dark and light mode (currently {mode})', id: 'theme.colorToggle.ariaLabel' }),
	};
	const { siteStorage } = useContext();
	return (
		<div className={clsx(s.toggle, className)}>
			<button className={clsx('clean-btn', s.toggleButton, isReactServerMarkup() && s.toggleButtonDisabled, buttonClassName)} type="button" disabled={isReactServerMarkup()} title={label} aria-label={translate({ message: 'Switch between dark and light mode (currently {mode})', id: 'theme.colorToggle.ariaLabel' }, { mode: label })}>
				<IconLightMode aria-hidden={true} className={clsx(s.toggleIcon, s.lightToggleIcon)} />
				<IconDarkMode aria-hidden={true} className={clsx(s.toggleIcon, s.darkToggleIcon)} />
				<IconSystemColorMode aria-hidden={true} className={clsx(s.toggleIcon, s.systemToggleIcon)} />
			</button>
			<script>{colorModeScript(`theme${siteStorage?.namespace ?? ''}`, labels)}</script>
		</div>
	);
}

export function NavbarColorModeToggle({ className }) {
	const { navbar, colorMode } = themeConfig();
	if (colorMode.disableSwitch) return null;
	return <ColorModeToggle className={className} buttonClassName={navbar.style === 'dark' ? styles('Navbar/ColorModeToggle').darkNavbarColorModeToggle : undefined} />;
}

// DocSearch's button as it renders once the page has started: ⌘ K on Apple platforms, Ctrl K elsewhere. The page
// writes the keys while it is parsed (lib/site.ts again after an in-place navigation), so they never flash.
const SEARCH_KEYS = `(function(s){var m=/(Mac|iPhone|iPod|iPad)/i.test(navigator.platform),k=m?"Meta":"Control",b=s.parentNode.parentNode;b.setAttribute("aria-label","Search ("+k+"+k)");b.setAttribute("aria-keyshortcuts",k+"+k");s.insertAdjacentHTML("beforebegin",m?'<kbd class="DocSearch-Button-Key">\u2318</kbd><kbd class="DocSearch-Button-Key">K</kbd>':'<kbd class="DocSearch-Button-Key DocSearch-Button-Key--ctrl">Ctrl</kbd><kbd class="DocSearch-Button-Key">K</kbd>');s.remove()})(document.currentScript)`;
export function SearchBar() {
	return (
		<button type="button" className="DocSearch DocSearch-Button" aria-label="Search (Meta+k)" aria-keyshortcuts="Meta+k">
			<span className="DocSearch-Button-Container">
				<svg width="20" height="20" className="DocSearch-Search-Icon" viewBox="0 0 24 24" aria-hidden="true">
					<circle cx="11" cy="11" r="8" stroke="currentColor" fill="none" strokeWidth="1.4"></circle>
					<path d="m21 21-4.3-4.3" stroke="currentColor" fill="none" strokeLinecap="round" strokeLinejoin="round"></path>
				</svg>
				<span className="DocSearch-Button-Placeholder">Search</span>
			</span>
			<span className="DocSearch-Button-Keys">
				<script>{SEARCH_KEYS}</script>
			</span>
		</button>
	);
}

function isRegexpStringMatch(regex, value) {
	return typeof regex !== 'undefined' && new RegExp(regex, 'gi').test(value);
}

function NavbarNavLink({ activeBasePath, activeBaseRegex, to, href, label, html, isDropdownLink, prependBaseUrlToHref, ...props }) {
	const toUrl = withBaseUrl(to);
	const activeBaseUrl = withBaseUrl(activeBasePath);
	const normalizedHref = withBaseUrl(href, { forcePrependBaseUrl: true });
	const isExternalLink = label && href && !isInternalUrl(href);
	const content = html
		? { dangerouslySetInnerHTML: { __html: html } }
		: {
				children: (
					<>
						{label}
						{isExternalLink && <IconExternalLink {...(isDropdownLink && { width: 12, height: 12 })} />}
					</>
				),
			};
	if (href) return <Link href={prependBaseUrlToHref ? normalizedHref : href} {...props} {...content} />;
	return (
		<Link
			to={toUrl}
			isNavLink
			{...((activeBasePath || activeBaseRegex) && { isActive: (_m, location) => (activeBaseRegex ? isRegexpStringMatch(activeBaseRegex, location.pathname) : location.pathname.startsWith(activeBaseUrl)) })}
			{...props}
			{...content}
		/>
	);
}

function DefaultNavbarItem({ mobile = false, position, isDropdownItem = false, className, ...props }) {
	const activeClassName = props.activeClassName ?? (mobile ? 'menu__link--active' : 'navbar__link--active');
	if (mobile) {
		return (
			<li className="menu__list-item">
				<NavbarNavLink className={clsx('menu__link', className)} {...props} activeClassName={activeClassName} />
			</li>
		);
	}
	const element = <NavbarNavLink className={clsx(isDropdownItem ? 'dropdown__link' : 'navbar__item navbar__link', className)} isDropdownLink={isDropdownItem} {...props} activeClassName={activeClassName} />;
	return isDropdownItem ? <li>{element}</li> : element;
}

function DropdownNavbarItem({ mobile = false, items, position, className, onClick, ...props }) {
	return (
		<div className={clsx('navbar__item', 'dropdown', 'dropdown--hoverable', { 'dropdown--right': position === 'right' })}>
			<NavbarNavLink aria-haspopup="true" aria-expanded={false} role="button" href={props.to ? undefined : '#'} className={clsx('navbar__link', className)} {...props}>
				{props.children ?? props.label}
			</NavbarNavLink>
			<ul className="dropdown__menu">
				{items.map((child) => (
					<NavbarItem isDropdownItem activeClassName="dropdown__link--active" {...child} />
				))}
			</ul>
		</div>
	);
}

function HtmlNavbarItem({ value, className, mobile = false, isDropdownItem = false }) {
	const Comp = isDropdownItem ? 'li' : 'div';
	return <Comp className={clsx({ navbar__item: !mobile && !isDropdownItem, 'menu__list-item': mobile }, className)} dangerouslySetInnerHTML={{ __html: value }} />;
}

function DocNavbarItem({ docId, label, docsPluginId, ...props }) {
	const { activeDoc } = activeDocContext(docsPluginId);
	const doc = layoutDoc(docId, docsPluginId);
	const pageActive = activeDoc?.path === doc?.path;
	if (doc === null || (doc.unlisted && !pageActive)) return null;
	return <DefaultNavbarItem exact {...props} data-mm-doc-link={JSON.stringify({ plugin: docsPluginId ?? 'default', docId })} isActive={() => pageActive || (!!activeDoc?.sidebar && activeDoc.sidebar === doc.sidebar)} label={label ?? doc.id} to={doc.path} />;
}

function DocSidebarNavbarItem({ sidebarId, label, docsPluginId, ...props }) {
	const { activeDoc, activeVersion } = activeDocContext(docsPluginId);
	const version = activeVersion ?? latestVersion(docsPluginId);
	const sidebarLink = version.sidebars[sidebarId].link;
	return <DefaultNavbarItem exact {...props} data-mm-sidebar-link={JSON.stringify({ plugin: docsPluginId ?? 'default', sidebarId })} isActive={() => activeDoc?.sidebar === sidebarId} label={label ?? sidebarLink.label} to={sidebarLink.path} />;
}

function DocsVersionDropdownNavbarItem({ mobile, docsPluginId, dropdownActiveClassDisabled, dropdownItemsBefore = [], dropdownItemsAfter = [], versions: _configs, ...props }) {
	const context = activeDocContext(docsPluginId);
	const plugin = docsPlugins()[docsPluginId ?? 'default'];
	const versionItems = plugin.versions.map((version) => ({ version, label: version.label }));
	const target = (version) => context.alternateDocVersions[version.name] ?? version.docs.find((doc) => doc.id === version.mainDocId);
	const displayed = versionItems.find((item) => item.version === context.activeVersion) ?? versionItems.find((item) => item.version.isLast) ?? versionItems[0];
	const plugin_ = docsPluginId ?? 'default';
	const items = [...dropdownItemsBefore, ...versionItems.map(({ version, label }) => ({ label, to: target(version).path, isActive: () => version === context.activeVersion, 'data-mm-version-item': JSON.stringify({ plugin: plugin_, name: version.name }) })), ...dropdownItemsAfter];
	const dropdownLabel = mobile && items.length > 1 ? translate({ id: 'theme.navbar.mobileVersionsDropdown.label', message: 'Versions' }) : displayed.label;
	const dropdownTo = mobile && items.length > 1 ? undefined : target(displayed.version).path;
	if (items.length <= 1) return <DefaultNavbarItem {...props} mobile={mobile} label={dropdownLabel} to={dropdownTo} isActive={dropdownActiveClassDisabled ? () => false : undefined} />;
	return <DropdownNavbarItem {...props} {...(!mobile && { 'data-mm-version-toggle': plugin_ })} mobile={mobile} label={dropdownLabel} to={dropdownTo} items={items} isActive={dropdownActiveClassDisabled ? () => false : undefined} />;
}

export function alternateUrl(locale, fullyQualified) {
	const { i18n, path } = useContext();
	const { baseUrl } = siteConfig();
	const config = i18n.localeConfigs[locale];
	const suffix = path.replace(baseUrl, '');
	return `${fullyQualified ? config.url : ''}${config.baseUrl}${suffix}`;
}

function LocaleDropdownNavbarItem({ mobile, dropdownItemsBefore = [], dropdownItemsAfter = [], queryString, ...props }) {
	const { i18n } = useContext();
	const localeItems = i18n.locales.map((locale) => ({
		label: i18n.localeConfigs[locale].label,
		lang: i18n.localeConfigs[locale].htmlLang,
		to: `pathname://${alternateUrl(locale, false)}`,
		target: '_self',
		autoAddBaseUrl: false,
		className: locale === i18n.currentLocale ? (mobile ? 'menu__link--active' : 'dropdown__link--active') : '',
		'data-mm-keep-location': '',
	}));
	const label = mobile ? translate({ message: 'Languages', id: 'theme.navbar.mobileLanguageDropdown.label' }) : i18n.localeConfigs[i18n.currentLocale].label;
	return (
		<DropdownNavbarItem
			{...props}
			mobile={mobile}
			label={
				<>
					<IconLanguage className={styles('NavbarItem/LocaleDropdownNavbarItem').iconLanguage} />
					{label}
				</>
			}
			items={[...dropdownItemsBefore, ...localeItems, ...dropdownItemsAfter]}
		/>
	);
}

function CustomDogfoodNavbarItem({ content, mobile }) {
	const path = useContext().path;
	if (!(path === '/tests' || path.startsWith('/tests/'))) return null;
	return (
		<button type="button">
			{content}
			{mobile ? ' (mobile)' : ''}
		</button>
	);
}

const ComponentTypes = {
	default: DefaultNavbarItem,
	localeDropdown: LocaleDropdownNavbarItem,
	search: ({ mobile, className }) =>
		mobile ? null : (
			<div className={clsx(className, styles('Navbar/Search').navbarSearchContainer)}>
				<SearchBar />
			</div>
		),
	dropdown: DropdownNavbarItem,
	html: HtmlNavbarItem,
	doc: DocNavbarItem,
	docSidebar: DocSidebarNavbarItem,
	docsVersionDropdown: DocsVersionDropdownNavbarItem,
	'custom-dogfood-navbar-item': CustomDogfoodNavbarItem,
};

export function NavbarItem({ type, ...props }) {
	const kind = !type || type === 'default' ? ('items' in props ? 'dropdown' : 'default') : type;
	const Component = ComponentTypes[kind];
	if (!Component) throw new Error(`No NavbarItem component for type "${type}"`);
	return <Component {...props} />;
}

function splitNavbarItems(items) {
	const left = items.filter((item) => (item.position ?? 'right') === 'left');
	const right = items.filter((item) => (item.position ?? 'right') === 'right');
	return [left, right];
}

const drawerClasses = () => ({
	toggle: styles('ColorModeToggle').toggle,
	colorModeToggle: styles('Navbar/Content').colorModeToggle,
	searchContainer: styles('Navbar/Search').navbarSearchContainer,
	dropdownMobile: styles('NavbarItem/DropdownNavbarItem/Mobile').dropdownNavbarItemMobile,
	yearGroupHeading: styles('BlogSidebar/Mobile').yearGroupHeading,
});

export function Navbar() {
	const { navbar } = themeConfig();
	const s = styles('Navbar/Layout');
	const content = styles('Navbar/Content');
	const [left, right] = splitNavbarItems(navbar.items);
	return (
		<nav aria-label={translate({ id: 'theme.NavBar.navAriaLabel', message: 'Main' })} className={clsx(ThemeClassNames.layout.navbar.container, 'navbar', 'navbar--fixed-top', navbar.hideOnScroll && [s.navbarHideable], { 'navbar--dark': navbar.style === 'dark', 'navbar--primary': navbar.style === 'primary' })}>
			<div className="navbar__inner">
				<div className={clsx(ThemeClassNames.layout.navbar.containerLeft, 'navbar__items')}>
					<button aria-label={translate({ id: 'theme.docs.sidebar.toggleSidebarButtonAriaLabel', message: 'Toggle navigation bar' })} aria-expanded={false} className="navbar__toggle clean-btn" type="button">
						<IconMenu />
					</button>
					<script>{`(${earlyDrawer})(document.currentScript,${drawerMarkup},${JSON.stringify(drawerClasses())})`}</script>
					<NavbarLogo />
					{left.map((item) => (
						<NavbarItem {...item} />
					))}
				</div>
				<div className={clsx(ThemeClassNames.layout.navbar.containerRight, 'navbar__items navbar__items--right')}>
					{right.map((item) => (
						<NavbarItem {...item} />
					))}
					<NavbarColorModeToggle className={content.colorModeToggle} />
					{!navbar.items.some((item) => item.type === 'search') && (
						<div className={styles('Navbar/Search').navbarSearchContainer}>
							<SearchBar />
						</div>
					)}
				</div>
			</div>
			<div role="presentation" className="navbar-sidebar__backdrop" />
		</nav>
	);
}

function FooterLinkItem({ item }) {
	const { to, href, label, prependBaseUrlToHref, className, ...props } = item;
	return (
		<Link className={clsx('footer__link-item', className)} {...(href ? { href: prependBaseUrlToHref ? withBaseUrl(href, { forcePrependBaseUrl: true }) : href } : { to: withBaseUrl(to) })} {...props}>
			{label}
			{href && !isInternalUrl(href) && <IconExternalLink />}
		</Link>
	);
}

export function Footer() {
	const { footer } = themeConfig();
	if (!footer) return null;
	const { copyright, links, logo, style } = footer;
	const logoStyles = styles('Footer/Logo');
	const logoImage = logo && <ThemedImage className={clsx('footer__logo', logo.className)} alt={logo.alt} sources={{ light: withBaseUrl(logo.src), dark: withBaseUrl(logo.srcDark ?? logo.src) }} width={logo.width} height={logo.height} style={logo.style} />;
	const multiColumn = links?.length > 0 && 'title' in links[0];
	return (
		<footer className={clsx(ThemeClassNames.layout.footer.container, 'footer', { 'footer--dark': style === 'dark' })}>
			<div className="container container-fluid">
				{links?.length > 0 &&
					(multiColumn ? (
						<div className="row footer__links">
							{links.map((column) => (
								<div className={clsx(ThemeClassNames.layout.footer.column, 'col footer__col', column.className)}>
									<div className="footer__title">{column.title}</div>
									<ul className="footer__items clean-list">
										{column.items.map((item) =>
											item.html ? (
												<li className={clsx('footer__item', item.className)} dangerouslySetInnerHTML={{ __html: item.html }} />
											) : (
												<li className="footer__item">
													<FooterLinkItem item={item} />
												</li>
											),
										)}
									</ul>
								</div>
							))}
						</div>
					) : (
						<div className="footer__links text--center">
							<div className="footer__links">{links.map((item, i) => [item.html ? <span className={clsx('footer__link-item', item.className)} dangerouslySetInnerHTML={{ __html: item.html }} /> : <FooterLinkItem item={item} />, links.length !== i + 1 && <span className="footer__link-separator">·</span>])}</div>
						</div>
					))}
				{(logo || copyright) && (
					<div className="footer__bottom text--center">
						{logo && (
							<div className="margin-bottom--sm">
								{logo.href ? (
									<Link href={logo.href} className={logoStyles.footerLogoLink} target={logo.target}>
										{logoImage}
									</Link>
								) : (
									logoImage
								)}
							</div>
						)}
						{copyright && <div className="footer__copyright" dangerouslySetInnerHTML={{ __html: copyright }} />}
					</div>
				)}
			</div>
		</footer>
	);
}

export function BackToTopButton() {
	return <button aria-label={translate({ id: 'theme.BackToTopButton.buttonAriaLabel', message: 'Scroll back to top' })} className={clsx('clean-btn', ThemeClassNames.common.backToTopButton, styles('BackToTopButton').backToTopButton)} type="button" />;
}

// <head> metadata, in the order react-helmet resolves it: later tags of the same name replace earlier ones.
export function PageMetadata({ title, description, keywords, image, children }) {
	const { siteConfig: config, titleFormatter, plugin } = useContext();
	const params = { title, siteTitle: config.title, titleDelimiter: config.titleDelimiter, plugin: plugin ?? { id: 'default', name: 'native' } };
	const formatted = title ? (titleFormatter ? titleFormatter({ ...params, defaultFormatter: (p) => defaultTitle(p.title, config) }) : defaultTitle(title, config)) : undefined;
	return (
		<>
			{formatted && (
				<Head>
					<title>{formatted}</title>
					<meta property="og:title" content={formatted} />
				</Head>
			)}
			{description && (
				<Head>
					<meta name="description" content={description} />
					<meta property="og:description" content={description} />
				</Head>
			)}
			{keywords && (
				<Head>
					<meta name="keywords" content={Array.isArray(keywords) ? keywords.join(',') : keywords} />
				</Head>
			)}
			{image && (
				<Head>
					<meta property="og:image" content={withBaseUrl(image, { absolute: true })} />
					<meta name="twitter:image" content={withBaseUrl(image, { absolute: true })} />
				</Head>
			)}
			{children && <Head>{children}</Head>}
		</>
	);
}
export function defaultTitle(title, config) {
	const trimmed = title?.trim();
	if (!trimmed || trimmed === config.title) return config.title;
	return `${trimmed} ${config.titleDelimiter} ${config.title}`;
}

export function SearchMetadata({ locale, version, tag }) {
	return (
		<Head>
			{locale && <meta name="docusaurus_locale" content={locale} />}
			{version && <meta name="docusaurus_version" content={version} />}
			{tag && <meta name="docusaurus_tag" content={tag} />}
			{locale && <meta name="docsearch:language" content={locale} />}
			{version && <meta name="docsearch:version" content={version} />}
			{tag && <meta name="docsearch:docusaurus_tag" content={tag} />}
		</Head>
	);
}

function SiteMetadata() {
	const { i18n, siteConfig: config, path } = useContext();
	const { metadata, image } = themeConfig();
	const canonical = config.url + withBaseUrl(path);
	const htmlLang = i18n.localeConfigs[i18n.currentLocale].htmlLang;
	const og = (code) => code.replace('-', '_');
	return (
		<>
			<Head>
				<meta name="twitter:card" content="summary_large_image" />
			</Head>
			{image && <PageMetadata image={image} />}
			<Head>
				<meta property="og:url" content={canonical} />
				<link rel="canonical" href={canonical} />
			</Head>
			<Head>
				{Object.entries(i18n.localeConfigs).map(([locale, { htmlLang: lang }]) => (
					<link rel="alternate" href={alternateUrl(locale, true)} hrefLang={lang} />
				))}
				<link rel="alternate" href={alternateUrl(i18n.defaultLocale, true)} hrefLang="x-default" />
				<meta property="og:locale" content={og(htmlLang)} />
				{Object.values(i18n.localeConfigs)
					.filter((c) => c.htmlLang !== htmlLang)
					.map((c) => (
						<meta property="og:locale:alternate" content={og(c.htmlLang)} />
					))}
			</Head>
			<SearchMetadata tag="default" locale={i18n.currentLocale} />
			<Head>
				{metadata.map((m) => (
					<meta {...m} />
				))}
			</Head>
		</>
	);
}

// The site-wide head tags the app renders above every route (SiteMetadataDefaults and SiteMetadata).
export function AppMetadata() {
	return (
		<>
			<SiteMetadataDefaults />
			<SiteMetadata />
		</>
	);
}

function SiteMetadataDefaults() {
	const { siteConfig: config } = useContext();
	return (
		<Head>
			<title>{config.title}</title>
			<meta property="og:title" content={config.title} />
			<meta name="viewport" content="width=device-width, initial-scale=1.0" />
			{config.noIndex && <meta name="robots" content="noindex, nofollow" />}
			{config.favicon && <link rel="icon" href={withBaseUrl(config.favicon)} />}
		</Head>
	);
}

export function Layout({ children, noFooter, wrapperClassName, title, description }) {
	return (
		<>
			<PageMetadata title={title} description={description} />
			<SkipToContent />
			<AnnouncementBar />
			<Navbar />
			<div id="__docusaurus_skipToContent_fallback" className={clsx(ThemeClassNames.layout.main.container, styles('Layout').mainWrapper, wrapperClassName)}>
				{children}
			</div>
			{!noFooter && <Footer />}
		</>
	);
}

export { IconArrow };
