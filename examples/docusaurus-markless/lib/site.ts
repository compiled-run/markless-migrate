// The behaviour docusaurus.io's React theme adds in the browser, written against the imported markup.
// Storage keys and class names are the old site's own, so a visitor's saved choices carry over.
import classes from './theme-classes.json';
import prismThemes from './prism-themes.json';
import docsVersions from './docs-versions.json';
import sidebarData from './sidebars.json';
import { init as initSearchPage } from './search-page.ts';
import { initShowcase } from './showcase.ts';
import { initJsonViews } from './json-view.ts';
import { init as initImageZoom } from './image-zoom.ts';
import { initColorGenerator, onColorModeChange } from './color-generator.ts';

type Choice = 'light' | 'dark' | null;
type Dict = Record<string, Record<string, string> | undefined>;
type SidebarItem = { type: 'link' | 'category' | 'html'; href?: string; label: string; docId?: string; unlisted?: boolean; items?: SidebarItem[]; collapsed?: boolean; collapsible?: boolean; className?: string; linkUnlisted?: boolean; value?: string; defaultStyle?: boolean; autoAddBaseUrl?: boolean };

const c = classes as Record<string, Record<string, string>>;
const cls = (module: string, local: string): string => c[module]?.[local] ?? local;
const SUFFIX = '-189';
const THEME_KEY = `theme${SUFFIX}`;
const TAB_KEY = (group: string) => `docusaurus.tab.${group}${SUFFIX}`;
const DISMISS_KEY = `docusaurus.announcement.dismiss${SUFFIX}`;
const ANNOUNCEMENT_ID_KEY = `docusaurus.announcement.id${SUFFIX}`;
const ANNOUNCEMENT_ID = 'announcementBar-v3.10';
const MOBILE_MAX = 996;

function closest(event: Event, selector: string): HTMLElement | null {
	const node = event.target;
	return node instanceof Element ? (node.closest(selector) as HTMLElement | null) : null;
}

function storage(): Storage | undefined {
	try {
		return window.localStorage;
	} catch {
		return undefined;
	}
}

const isMobile = () => window.innerWidth <= MOBILE_MAX;
const samePath = (a: string | undefined, b: string) => {
	const norm = (p: string) => (p.endsWith('/') ? p : `${p}/`).toLowerCase();
	return a !== undefined && norm(a) === norm(b);
};
const currentPath = () => window.location.pathname.replace(/\/$/, '') || '/';

// What the importer left on elements for this script (data-mm-*): read once, then taken off the page.
const hints = new WeakMap<Element, Record<string, string>>();
function readHints(root: ParentNode): void {
	for (const el of root.querySelectorAll('*')) {
		let found: Record<string, string> | undefined;
		for (const attr of [...el.attributes]) {
			if (!attr.name.startsWith('data-mm-')) continue;
			(found ??= {})[attr.name.slice('data-mm-'.length)] = attr.value;
			el.removeAttribute(attr.name);
		}
		if (found) hints.set(el, { ...hints.get(el), ...found });
	}
}
const hint = (el: Element | null | undefined, name: string): string | undefined => (el ? hints.get(el)?.[name] : undefined);

// Colour mode: the three-way toggle, the code blocks' Prism colours and the themed images.
function choice(): Choice {
	const saved = storage()?.getItem(THEME_KEY);
	return saved === 'light' || saved === 'dark' ? saved : null;
}
const systemDark = () => window.matchMedia('(prefers-color-scheme: dark)').matches;

type PrismTheme = { plain: Record<string, string>; styles: { types: string[]; languages?: string[]; style: Record<string, string> }[] };
const themeDicts = new Map<string, Dict>();
function themeDict(dark: boolean, language: string): Dict {
	const key = `${dark}:${language}`;
	let dict = themeDicts.get(key);
	if (!dict) {
		const theme = (prismThemes as Record<string, PrismTheme>)[dark ? 'dark' : 'light']!;
		dict = {};
		for (const entry of theme.styles) {
			if (entry.languages && !entry.languages.includes(language)) continue;
			for (const type of entry.types) dict[type] = { ...dict[type], ...entry.style };
		}
		dict.root = theme.plain;
		dict.plain = { ...theme.plain, backgroundColor: undefined as unknown as string };
		themeDicts.set(key, dict);
	}
	return dict;
}
function applyStyle(el: HTMLElement, style: Record<string, string> | undefined): void {
	el.removeAttribute('style');
	for (const [name, value] of Object.entries(style ?? {})) {
		if (value === undefined || value === null || value === '') continue;
		el.style.setProperty(name.startsWith('--') ? name : name.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`), value);
	}
	if (!el.getAttribute('style')) el.removeAttribute('style');
}
function applyCodeTheme(dark: boolean): void {
	const theme = (prismThemes as Record<string, PrismTheme>)[dark ? 'dark' : 'light']!;
	for (const block of document.querySelectorAll<HTMLElement>('.theme-code-block')) {
		const vars: Record<string, string> = {};
		if (theme.plain.color) vars['--prism-color'] = theme.plain.color;
		if (theme.plain.backgroundColor) vars['--prism-background-color'] = theme.plain.backgroundColor;
		applyStyle(block, vars);
		const pre = block.querySelector<HTMLElement>('pre.prism-code');
		if (!pre) continue;
		const language = /language-(\S+)/.exec(pre.className)?.[1] ?? 'text';
		const dict = themeDict(dark, language);
		applyStyle(pre, dict.root);
		for (const line of pre.querySelectorAll<HTMLElement>('.token-line')) {
			applyStyle(line, dict.plain);
			for (const token of line.querySelectorAll<HTMLElement>('span.token')) {
				const types = [...token.classList].filter((t) => t !== 'token');
				const empty = token.style.display === 'inline-block' ? true : undefined;
				let style: Record<string, string> | undefined;
				if (types.length === 1 && types[0] === 'plain') style = empty ? { display: 'inline-block' } : undefined;
				else if (types.length === 1 && empty) style = dict[types[0]!];
				else style = Object.assign(empty ? { display: 'inline-block' } : {}, ...types.map((t) => dict[t]));
				applyStyle(token, style);
			}
		}
	}
}
function applyThemedImages(dark: boolean): void {
	const light = cls('ThemedComponent', 'themedComponent--light');
	const darkClass = cls('ThemedComponent', 'themedComponent--dark');
	for (const img of document.querySelectorAll<HTMLImageElement>(`img.${cls('ThemedComponent', 'themedComponent')}`)) {
		img.classList.toggle(light, !dark);
		img.classList.toggle(darkClass, dark);
		const sources = hint(img, 'themed');
		if (!sources) continue;
		const { light: lightSrc, dark: darkSrc } = JSON.parse(sources) as { light: string; dark: string };
		const want = dark ? darkSrc : lightSrc;
		if (img.getAttribute('src') !== want) img.setAttribute('src', want);
	}
}
const MODE_LABEL: Record<string, string> = { light: 'light mode', dark: 'dark mode', system: 'system mode' };
function applyColorMode(next: Choice): void {
	const root = document.documentElement;
	const dark = next ? next === 'dark' : systemDark();
	root.setAttribute('data-theme', dark ? 'dark' : 'light');
	root.setAttribute('data-theme-choice', next ?? 'system');
	const label = MODE_LABEL[next ?? 'system']!;
	for (const button of document.querySelectorAll(`.${cls('ColorModeToggle', 'toggle')} button`)) {
		button.setAttribute('title', label);
		button.setAttribute('aria-label', `Switch between dark and light mode (currently ${label})`);
	}
	if (codeDark !== dark) {
		applyCodeTheme(dark);
		codeDark = dark;
	}
	applyThemedImages(dark);
}
let codeDark = false;
function cycleColorMode(): void {
	const current = choice();
	const next: Choice = current === null ? 'light' : current === 'light' ? 'dark' : null;
	if (next) storage()?.setItem(THEME_KEY, next);
	else storage()?.removeItem(THEME_KEY);
	applyColorMode(next);
	onColorModeChange(next);
}

// Docs versions: the version a docs page belongs to, else the reader's preferred one (saved when they pick one in
// the version dropdown or the version banner), else the latest, decides where the navbar's doc links point.
type DocsVersion = { name: string; label: string; isLast: boolean; path: string; mainDoc?: string; docs: Record<string, string>; sidebars: Record<string, string> };
const plugins = docsVersions as Record<string, { path: string; versions: DocsVersion[] }>;
const PREFERRED_KEY = (plugin: string) => `docs-preferred-version-${plugin}${SUFFIX}`;
const underPath = (path: string, base: string) => {
	const a = path.replace(/\/$/, '');
	const b = base.replace(/\/$/, '');
	return a === b || a.startsWith(b === '' ? '/' : `${b}/`);
};
function activeDocsVersion(plugin: string): DocsVersion | undefined {
	const path = currentPath();
	const active = Object.entries(plugins)
		.sort((a, b) => b[1].path.localeCompare(a[1].path))
		.find(([, data]) => underPath(path, data.path));
	if (active?.[0] !== plugin) return undefined;
	const versions = plugins[plugin]!.versions;
	const latest = versions.find((v) => v.isLast);
	return [...versions.filter((v) => v !== latest), ...(latest ? [latest] : [])].find((v) => underPath(path, v.path));
}
export function docsVersionCandidates(plugin: string): DocsVersion[] {
	const versions = plugins[plugin]?.versions ?? [];
	const preferred = versions.find((v) => v.name === storage()?.getItem(PREFERRED_KEY(plugin)));
	return [activeDocsVersion(plugin), preferred, versions.find((v) => v.isLast) ?? versions[0]].filter((v): v is DocsVersion => Boolean(v));
}
function applyDocsVersions(): void {
	for (const link of document.querySelectorAll<HTMLAnchorElement>('.navbar__inner a')) {
		const doc = hint(link, 'doc-link');
		const sidebar = hint(link, 'sidebar-link');
		const toggle = hint(link, 'version-toggle');
		if (doc) {
			const { plugin, docId } = JSON.parse(doc) as { plugin: string; docId: string };
			const path = docsVersionCandidates(plugin).map((v) => v.docs[docId]).find(Boolean);
			if (path) link.setAttribute('href', linkHref(path));
		} else if (sidebar) {
			const { plugin, sidebarId } = JSON.parse(sidebar) as { plugin: string; sidebarId: string };
			const path = docsVersionCandidates(plugin)[0]?.sidebars[sidebarId];
			if (path) link.setAttribute('href', linkHref(path));
		} else if (toggle && !activeDocsVersion(toggle)) {
			const shown = docsVersionCandidates(toggle)[0];
			if (shown?.mainDoc) {
				link.setAttribute('href', linkHref(shown.mainDoc));
				link.textContent = shown.label;
			}
		}
	}
	keepLocation();
}
// Version and language links keep the page's ?query#hash.
function keepLocation(): void {
	for (const link of document.querySelectorAll<HTMLAnchorElement>('.navbar__inner .dropdown__link, .navbar-sidebar .menu__link')) {
		if (!hint(link, 'version-item') && !hint(link, 'keep-location')) continue;
		const base = (link.getAttribute('href') ?? '').replace(/[?#].*$/, '');
		link.setAttribute('href', `${base}${location.search}${location.hash}`);
	}
}
function savePreferredVersion(link: HTMLAnchorElement): void {
	const desktop = link.closest('.navbar-sidebar') ? [...document.querySelectorAll<HTMLAnchorElement>('.navbar__inner .dropdown__link')].find((a) => a.pathname === link.pathname && hint(a, 'version-item')) : link;
	const item = hint(desktop, 'version-item');
	if (!item) return;
	const { plugin, name } = JSON.parse(item) as { plugin: string; name: string };
	storage()?.setItem(PREFERRED_KEY(plugin), name);
}

// Tabs: a choice is saved per groupId and every tab group with that id follows it; a queryString tab group also
// writes it to the URL.
type TabsHint = { groupId?: string; queryString?: string | boolean; values: string[] };
function tabsHint(container: Element): TabsHint | undefined {
	const raw = hint(container, 'tabs');
	return raw ? (JSON.parse(raw) as TabsHint) : undefined;
}
function selectInContainer(container: Element, value: string): void {
	const info = tabsHint(container);
	const tabs = [...container.querySelectorAll(':scope > ul[role=tablist] > li[role=tab]')];
	const panels = [...container.querySelectorAll(':scope > .margin-top--md > [role=tabpanel]')];
	tabs.forEach((tab, index) => {
		const on = (info?.values[index] ?? tab.textContent) === value;
		tab.setAttribute('tabindex', on ? '0' : '-1');
		tab.setAttribute('aria-selected', on ? 'true' : 'false');
		tab.classList.toggle('tabs__item--active', on);
		const panel = panels[index] as HTMLElement | undefined;
		if (panel) panel.hidden = !on;
	});
}
function tabValue(tab: Element): string {
	const container = tab.closest('.theme-tabs-container')!;
	const index = [...tab.parentElement!.children].indexOf(tab);
	return tabsHint(container)?.values[index] ?? tab.textContent ?? '';
}
function queryKey(info: TabsHint | undefined): string | undefined {
	if (!info?.queryString) return undefined;
	return typeof info.queryString === 'string' ? info.queryString : info.groupId;
}
function selectTab(tab: HTMLElement): void {
	const container = tab.closest('.theme-tabs-container');
	if (!container || tab.getAttribute('aria-selected') === 'true') return;
	const value = tabValue(tab);
	const info = tabsHint(container);
	if (info?.groupId) {
		storage()?.setItem(TAB_KEY(info.groupId), value);
		for (const other of document.querySelectorAll('.theme-tabs-container')) {
			const otherInfo = tabsHint(other);
			if (otherInfo?.groupId === info.groupId && otherInfo.values.includes(value)) selectInContainer(other, value);
		}
	} else selectInContainer(container, value);
	const key = queryKey(info);
	if (key) {
		const url = new URL(window.location.href);
		url.searchParams.set(key, value);
		history.replaceState(history.state, '', url);
		keepLocation();
	}
	updateWordWrap();
}
function restoreTabs(): void {
	for (const container of document.querySelectorAll('.theme-tabs-container')) {
		const info = tabsHint(container);
		if (!info) continue;
		const key = queryKey(info);
		const fromQuery = key ? new URLSearchParams(window.location.search).get(key) : null;
		const fromStorage = info.groupId ? storage()?.getItem(TAB_KEY(info.groupId)) : null;
		const value = [fromQuery, fromStorage].find((v) => v && info.values.includes(v));
		if (value) selectInContainer(container, value);
	}
}

// The theme's Collapsible: height animated with a duration that grows with the content.
function heightDuration(height: number): number {
	if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return 1;
	const constant = height / 36;
	return Math.round((4 + 15 * constant ** 0.25 + constant / 5) * 10);
}
function collapseStyle(el: HTMLElement, collapsed: boolean): void {
	el.style.display = collapsed ? 'none' : 'block';
	el.style.overflow = collapsed ? 'hidden' : 'visible';
	el.style.height = collapsed ? '0px' : 'auto';
}
function animateCollapsible(el: HTMLElement, collapsed: boolean, done?: () => void): void {
	el.style.willChange = 'height';
	const transition = () => {
		const height = el.scrollHeight;
		el.style.transition = `height ${heightDuration(height)}ms ease-in-out`;
		el.style.height = `${height}px`;
	};
	requestAnimationFrame(() => {
		if (collapsed) {
			transition();
			requestAnimationFrame(() => {
				el.style.height = '0px';
				el.style.overflow = 'hidden';
			});
		} else {
			el.style.display = 'block';
			requestAnimationFrame(transition);
		}
	});
	const end = (event: TransitionEvent) => {
		if (event.propertyName !== 'height' || event.target !== el) return;
		el.removeEventListener('transitionend', end);
		collapseStyle(el, collapsed);
		done?.();
	};
	el.addEventListener('transitionend', end);
}

// <details>: the theme cancels the browser's own toggle and animates; `open` comes off only once it has closed.
function toggleDetails(event: Event, summary: HTMLElement): void {
	const details = summary.parentElement as HTMLDetailsElement | null;
	const content = summary.nextElementSibling as HTMLElement | null;
	if (!details || !content || summary !== details.querySelector(':scope > summary')) return;
	event.preventDefault();
	event.stopPropagation();
	const collapsed = details.getAttribute('data-collapsed') !== 'false';
	if (collapsed) {
		details.setAttribute('data-collapsed', 'false');
		details.open = true;
		animateCollapsible(content, false);
	} else {
		details.setAttribute('data-collapsed', 'true');
		animateCollapsible(content, true, () => {
			details.open = false;
		});
	}
}

// Sidebar categories: a collapsed category's items are rendered when it is first opened (from lib/sidebars.json);
// opening one closes its open siblings (autoCollapseCategories).
const data = sidebarData as { classes: Record<string, string>; sidebars: Record<string, SidebarItem[]>; trailingSlash?: boolean };
// @docusaurus/Link's trailing-slash rule for internal links.
function linkHref(href: string | undefined): string {
	if (href === undefined || data.trailingSlash === undefined || !href.startsWith('/')) return href ?? '';
	const [pathname = '', ...rest] = href.split(/(?=[?#])/);
	if (pathname === '/') return href;
	return (data.trailingSlash ? (pathname.endsWith('/') ? pathname : `${pathname}/`) : pathname.replace(/\/$/, '')) + rest.join('');
}
function isActive(item: SidebarItem, path: string): boolean {
	if (item.type === 'link') return samePath(item.href, path);
	if (item.type === 'category') return samePath(item.href, path) || (item.items ?? []).some((sub) => isActive(sub, path));
	return false;
}
function isVisible(item: SidebarItem, path: string): boolean {
	if (item.type === 'category') return isActive(item, path) || (item.href !== undefined && !item.linkUnlisted) || (item.items ?? []).some((sub) => isVisible(sub, path));
	if (item.type === 'link') return !item.unlisted || isActive(item, path);
	return true;
}
function firstLink(item: SidebarItem): string | undefined {
	if (item.type === 'link' && !item.unlisted) return item.href;
	if (item.type === 'category') {
		if (item.href && !item.linkUnlisted) return item.href;
		for (const sub of item.items ?? []) {
			const link = firstLink(sub);
			if (link) return link;
		}
	}
	return undefined;
}
const escapeHtml = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const externalIcon = `<svg width="13.5" height="13.5" aria-label="(opens in new tab)" class="${data.classes.iconExternalLink}"><use href="#theme-svg-external-link"></use></svg>`;
function itemsMarkup(items: SidebarItem[], level: number, tabIndex: number, path: string): string {
	return items
		.filter((item) => isVisible(item, path))
		.map((item) => {
			if (item.type === 'html') return `<li class="${['theme-doc-sidebar-item-link', `theme-doc-sidebar-item-link-level-${level}`, item.defaultStyle ? 'menu__list-item' : '', item.className ?? ''].filter(Boolean).join(' ')}">${item.value}</li>`;
			if (item.type === 'category') {
				const visible = (item.items ?? []).filter((sub) => isVisible(sub, path));
				if (visible.length === 0) {
					if (!item.href) return '';
					return linkMarkup({ ...item, type: 'link' }, level, tabIndex, path);
				}
				const active = isActive(item, path);
				const current = samePath(item.href, path);
				const collapsed = !item.collapsible ? false : active ? false : Boolean(item.collapsed);
				const href = item.href && !item.linkUnlisted ? item.href : item.collapsible ? firstLink(item) : undefined;
				const linkClass = [data.classes.categoryLink, 'menu__link', item.collapsible ? 'menu__link--sublist' : '', !item.href && item.collapsible ? 'menu__link--sublist-caret' : '', active ? 'menu__link--active' : ''].filter(Boolean).join(' ');
				const label = escapeHtml(item.label);
				const caret = item.href && item.collapsible ? `<button aria-label="${collapsed ? 'Expand' : 'Collapse'} sidebar category '${label}'" aria-expanded="${!collapsed}" type="button" class="clean-btn menu__caret"></button>` : '';
				const role = item.collapsible && !item.href ? ` role="button" aria-expanded="${!collapsed}"` : '';
				const children = collapsed ? '' : `<ul class="menu__list" style="display: block; overflow: visible; height: auto;">${itemsMarkup(item.items ?? [], level + 1, 0, path)}</ul>`;
				return `<li class="${['theme-doc-sidebar-item-category', `theme-doc-sidebar-item-category-level-${level}`, 'menu__list-item', collapsed ? 'menu__list-item--collapsed' : '', item.className ?? ''].filter(Boolean).join(' ')}"><div class="menu__list-item-collapsible${current ? ' menu__list-item-collapsible--active' : ''}"><a class="${linkClass}"${current ? ' aria-current="page"' : ''}${role} tabindex="${tabIndex}" href="${escapeHtml(item.collapsible ? linkHref(href ?? '#') : linkHref(href))}"><span class="${data.classes.categoryLinkLabel}">${label}</span></a>${caret}</div>${children}</li>`;
			}
			return linkMarkup(item, level, tabIndex, path);
		})
		.join('');
}
function linkMarkup(item: SidebarItem, level: number, tabIndex: number, path: string): string {
	const external = /^(?:[A-Z][A-Z\d+.-]*:|\/\/)/i.test(item.href ?? '');
	const active = isActive(item, path);
	const linkClass = ['menu__link', external ? data.classes.menuExternalLink : '', active ? 'menu__link--active' : ''].filter(Boolean).join(' ');
	const target = external ? ' target="_blank" rel="noopener noreferrer"' : '';
	return `<li class="${['theme-doc-sidebar-item-link', `theme-doc-sidebar-item-link-level-${level}`, 'menu__list-item', item.className ?? ''].filter(Boolean).join(' ')}"><a class="${linkClass}"${active ? ' aria-current="page"' : ''} tabindex="${tabIndex}"${external ? ` href="${escapeHtml(item.href ?? '')}"${target}` : ` href="${escapeHtml(linkHref(item.href))}"`}><span class="${data.classes.linkLabel}">${escapeHtml(item.label)}</span>${external ? externalIcon : ''}</a></li>`;
}
function sidebarOf(element: Element): SidebarItem[] | undefined {
	const aside = document.querySelector('aside.theme-doc-sidebar-container');
	const key = hint(aside, 'sidebar');
	void element;
	return key ? data.sidebars[key] : undefined;
}
function categoryPath(li: Element): string[] {
	const path: string[] = [];
	for (let at: Element | null = li; at; at = at.parentElement?.closest('li.theme-doc-sidebar-item-category') ?? null) path.unshift(at.querySelector(':scope > .menu__list-item-collapsible > a')?.textContent ?? '');
	return path;
}
function categoryItem(li: Element): SidebarItem | undefined {
	const path = categoryPath(li);
	let items = sidebarOf(li);
	let found: SidebarItem | undefined;
	for (const label of path) {
		found = items?.find((item) => item.type === 'category' && item.label === label);
		items = found?.items;
	}
	return found;
}
function levelOf(li: Element): number {
	const match = /theme-doc-sidebar-item-category-level-(\d+)/.exec(li.className);
	return match ? Number(match[1]) : 1;
}
// The doc sidebar stays mounted while the reader moves between the pages it lists: the next page gets the same
// sidebar element back (its open categories, scroll offset and running transitions), with the active link moved.
const sidebarMemory: { key?: string; aside?: Element; hidden: boolean } = { hidden: false };
const desktopSidebarKey = () => hint(document.querySelector('aside.theme-doc-sidebar-container'), 'sidebar');
function restoreSidebar(): void {
	const aside = document.querySelector('aside.theme-doc-sidebar-container') ?? undefined;
	const key = desktopSidebarKey();
	const kept = sidebarMemory.aside;
	if (!aside || key !== sidebarMemory.key || !kept || kept === aside || isMobile() || !kept.querySelector('nav[aria-label="Docs sidebar"]')) {
		sidebarMemory.key = key;
		sidebarMemory.aside = aside;
		if (kept !== aside) sidebarMemory.hidden = false;
		return;
	}
	const scrolled = aside.querySelector('nav[aria-label="Docs sidebar"]')?.scrollTop ?? 0;
	hints.set(kept, hints.get(aside) ?? {});
	aside.replaceWith(kept);
	const nav = kept.querySelector('nav[aria-label="Docs sidebar"]');
	if (nav) nav.scrollTop = scrolled;
	if (sidebarMemory.hidden) setSidebarHidden(true, false);
	// Styled first, so moving the active link runs its colour transitions as on a sidebar that never left the page.
	void kept.getBoundingClientRect();
	if (nav) markActive(nav);
}
function markActive(nav: Element): void {
	const path = currentPath();
	for (const li of nav.querySelectorAll('li.theme-doc-sidebar-item-link')) {
		const link = li.querySelector(':scope > a.menu__link');
		if (!link || link.classList.contains(data.classes.menuExternalLink)) continue;
		const active = samePath(link.getAttribute('href') ?? undefined, path);
		link.classList.toggle('menu__link--active', active);
		if (active) link.setAttribute('aria-current', 'page');
		else link.removeAttribute('aria-current');
	}
	for (const li of nav.querySelectorAll('li.theme-doc-sidebar-item-category')) {
		const item = categoryItem(li);
		const link = li.querySelector(':scope > .menu__list-item-collapsible > a.menu__link');
		if (!item || !link) continue;
		const active = isActive(item, path);
		const current = samePath(item.href, path);
		link.classList.toggle('menu__link--active', active);
		if (current) link.setAttribute('aria-current', 'page');
		else link.removeAttribute('aria-current');
		li.querySelector(':scope > .menu__list-item-collapsible')?.classList.toggle('menu__list-item-collapsible--active', current);
		if (active && li.classList.contains('menu__list-item--collapsed')) setCategory(li, false);
	}
}
function setCategory(item: Element, collapse: boolean, animate = true): void {
	const button = item.querySelector(':scope > .menu__list-item-collapsible > button.menu__caret');
	const roleLink = item.querySelector(':scope > .menu__list-item-collapsible > a[role=button]');
	let list = item.querySelector(':scope > ul.menu__list') as HTMLElement | null;
	if (!list && !collapse) {
		const category = categoryItem(item);
		if (!category) return;
		item.insertAdjacentHTML('beforeend', `<ul class="menu__list" style="display: none; overflow: hidden; height: 0px;">${itemsMarkup(category.items ?? [], levelOf(item) + 1, 0, currentPath())}</ul>`);
		list = item.querySelector(':scope > ul.menu__list') as HTMLElement | null;
	}
	item.classList.toggle('menu__list-item--collapsed', collapse);
	if (button) {
		const label = button.getAttribute('aria-label')?.replace(/^(Expand|Collapse) sidebar category /, '') ?? '';
		button.setAttribute('aria-expanded', collapse ? 'false' : 'true');
		button.setAttribute('aria-label', `${collapse ? 'Expand' : 'Collapse'} sidebar category ${label}`);
	}
	roleLink?.setAttribute('aria-expanded', collapse ? 'false' : 'true');
	if (!list) return;
	for (const link of list.querySelectorAll(':scope > li > a, :scope > li > .menu__list-item-collapsible > a')) link.setAttribute('tabindex', collapse ? '-1' : '0');
	if (animate) animateCollapsible(list, collapse);
	else collapseStyle(list, collapse);
}
function toggleCategory(item: Element): void {
	const collapse = !item.classList.contains('menu__list-item--collapsed');
	if (!collapse && autoCollapse) {
		for (const sibling of item.parentElement?.children ?? []) {
			if (sibling !== item && sibling.matches('li.theme-doc-sidebar-item-category:not(.menu__list-item--collapsed)') && sibling.querySelector(':scope > .menu__list-item-collapsible > button.menu__caret, :scope > .menu__list-item-collapsible > a[role=button]')) setCategory(sibling, true);
		}
	}
	setCategory(item, collapse);
}
const autoCollapse = true;

// The TOC highlight: the link of the heading the reader is at.
function updateTocHighlight(): void {
	const links = [...document.getElementsByClassName('table-of-contents__link toc-highlight')] as HTMLAnchorElement[];
	const anchors = [...document.querySelectorAll('h2.anchor, h3.anchor')] as HTMLElement[];
	const visible = (el: HTMLElement): DOMRect => {
		const rect = el.getBoundingClientRect();
		return rect.top === rect.bottom && el.parentElement ? visible(el.parentElement) : rect;
	};
	const next = anchors.find((anchor) => visible(anchor).top >= 0);
	let active: HTMLElement | null;
	if (next) {
		const rect = visible(next);
		active = rect.top > 0 && rect.bottom < window.innerHeight / 2 ? next : (anchors[anchors.indexOf(next) - 1] ?? null);
	} else active = anchors[anchors.length - 1] ?? null;
	for (const link of links) {
		const id = decodeURIComponent(link.href.substring(link.href.indexOf('#') + 1));
		link.classList.toggle('table-of-contents__link--active', Boolean(active) && active!.id === id);
	}
}

const EXPAND_ICON =
	'<svg width="20" height="20" aria-hidden="true" class="EXPAND_ICON"><g fill="#7a7a7a"><path d="M9.992 10.023c0 .2-.062.399-.172.547l-4.996 7.492a.982.982 0 01-.828.454H1c-.55 0-1-.453-1-1 0-.2.059-.403.168-.551l4.629-6.942L.168 3.078A.939.939 0 010 2.528c0-.548.45-.997 1-.997h2.996c.352 0 .649.18.828.45L9.82 9.472c.11.148.172.347.172.55zm0 0"></path><path d="M19.98 10.023c0 .2-.058.399-.168.547l-4.996 7.492a.987.987 0 01-.828.454h-3c-.547 0-.996-.453-.996-1 0-.2.059-.403.168-.551l4.625-6.942-4.625-6.945a.939.939 0 01-.168-.55 1 1 0 01.996-.997h3c.348 0 .649.18.828.45l4.996 7.492c.11.148.168.347.168.55zm0 0"></path></g></svg>';
// Hiding the doc sidebar narrows its container first; the sidebar itself hides, and the expand button appears, once
// that width transition has ended (at once when motion is reduced). Showing it again is immediate.
function setSidebarHidden(hidden: boolean, animate = true): void {
	sidebarMemory.hidden = hidden;
	const aside = document.querySelector('aside.theme-doc-sidebar-container') as HTMLElement | null;
	const main = document.querySelector(`main.${cls('DocRoot/Layout/Main', 'docMainContainer')}`);
	aside?.classList.toggle(cls('DocRoot/Layout/Sidebar', 'docSidebarContainerHidden'), hidden);
	main?.classList.toggle(cls('DocRoot/Layout/Main', 'docMainContainerEnhanced'), hidden);
	main?.querySelector(':scope > .container')?.classList.toggle(cls('DocRoot/Layout/Main', 'docItemWrapperEnhanced'), hidden);
	if (!hidden || !aside) return setSidebarContentHidden(false);
	if (!animate || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return setSidebarContentHidden(true);
	const end = (event: TransitionEvent) => {
		if (event.target !== aside) return;
		aside.removeEventListener('transitionend', end);
		if (sidebarMemory.hidden) setSidebarContentHidden(true);
	};
	aside.addEventListener('transitionend', end);
}
function setSidebarContentHidden(hidden: boolean): void {
	const aside = document.querySelector('aside.theme-doc-sidebar-container');
	aside?.querySelector(`.${cls('DocSidebar/Desktop', 'sidebar')}`)?.classList.toggle(cls('DocSidebar/Desktop', 'sidebarHidden'), hidden);
	const viewport = aside?.querySelector(`.${cls('DocRoot/Layout/Sidebar', 'sidebarViewport')}`);
	const expand = viewport?.querySelector(`:scope > .${cls('DocRoot/Layout/Sidebar/ExpandButton', 'expandButton')}`);
	if (hidden && viewport && !expand) viewport.insertAdjacentHTML('beforeend', `<div class="${cls('DocRoot/Layout/Sidebar/ExpandButton', 'expandButton')}" title="Expand sidebar" aria-label="Expand sidebar" tabindex="0" role="button">${EXPAND_ICON.replace('EXPAND_ICON', cls('DocRoot/Layout/Sidebar/ExpandButton', 'expandButtonIcon'))}</div>`);
	if (!hidden) expand?.remove();
}

async function copyCode(button: HTMLElement): Promise<void> {
	const code = button.closest('.theme-code-block')?.querySelector('pre code') as HTMLElement | null;
	if (!code || !navigator.clipboard) return;
	const text = [...code.querySelectorAll('.token-line')].map((line) => line.textContent).join('\n');
	await navigator.clipboard.writeText(text);
	const copied = cls('CodeBlock/Buttons/CopyButton', 'copyButtonCopied');
	button.classList.add(copied);
	button.setAttribute('aria-label', 'Copied');
	setTimeout(() => {
		button.classList.remove(copied);
		button.setAttribute('aria-label', 'Copy code to clipboard');
	}, 1000);
}

function dismissAnnouncement(): void {
	storage()?.setItem(DISMISS_KEY, 'true');
	document.querySelector('.theme-announcement-bar')?.remove();
	document.querySelector('nav[aria-label="Docs sidebar"]')?.classList.remove(cls('DocSidebar/Desktop/Content', 'menuWithAnnouncementBar'));
}

let searching: Promise<void> | undefined;
function openSearch(): void {
	searching ??= import('./search.ts').then((search) => search.load());
	void searching.then(() => import('./search.ts')).then((search) => {
		search.open();
		search.show();
	});
}

function setDropdown(dropdown: Element, show: boolean): void {
	dropdown.classList.toggle('dropdown--show', show);
	dropdown.querySelector(':scope > .navbar__link')?.setAttribute('aria-expanded', show ? 'true' : 'false');
}
function closeDropdownsOutside(target: EventTarget | null): void {
	for (const dropdown of document.querySelectorAll('.dropdown.dropdown--show')) if (!(target instanceof Node && dropdown.contains(target))) setDropdown(dropdown, false);
}

// SkipToContent, as Docusaurus wrote it: tabindex on, focus, tabindex off again.
function skipToContent(event: Event): void {
	event.preventDefault();
	const target = (document.querySelector('main:first-of-type') ?? document.getElementById('__docusaurus_skipToContent_fallback')) as HTMLElement | null;
	if (!target) return;
	target.setAttribute('tabindex', '-1');
	target.focus();
	target.removeAttribute('tabindex');
}

const WRAP_BUTTON = () =>
	`<button type="button" aria-label="Toggle word wrap" title="Toggle word wrap" class="clean-btn"><svg viewBox="0 0 24 24" class="${cls('CodeBlock/Buttons/WordWrapButton', 'wordWrapButtonIcon')}" aria-hidden="true"><path fill="currentColor" d="M4 19h6v-2H4v2zM20 5H4v2h16V5zm-3 6H4v2h13.25c1.1 0 2 .9 2 2s-.9 2-2 2H15v-2l-3 3l3 3v-2h2c2.21 0 4-1.79 4-4s-1.79-4-4-4z"></path></svg></button>`;
// The word wrap button exists only while a code block scrolls sideways (or is already wrapped).
function updateWordWrap(): void {
	for (const pre of document.querySelectorAll('.theme-code-block pre')) {
		const code = pre.querySelector('code');
		const group = pre.parentElement?.querySelector(`:scope > .${cls('CodeBlock/Buttons', 'buttonGroup')}`);
		if (!code || !group || (pre as HTMLElement).offsetParent === null) continue;
		const scrollable = pre.scrollWidth > pre.clientWidth || code.hasAttribute('style');
		const button = group.querySelector('button[aria-label="Toggle word wrap"]');
		if (scrollable && !button) group.insertAdjacentHTML('afterbegin', WRAP_BUTTON());
		if (!scrollable && button) button.remove();
	}
}
function toggleWordWrap(button: HTMLElement): void {
	const code = button.closest('.theme-code-block')?.querySelector('pre code') as HTMLElement | null;
	if (!code) return;
	const enabledClass = cls('CodeBlock/Buttons/WordWrapButton', 'wordWrapButtonEnabled');
	const enabled = button.classList.contains(enabledClass);
	if (enabled) code.removeAttribute('style');
	else {
		code.style.whiteSpace = 'pre-wrap';
		code.style.overflowWrap = 'anywhere';
	}
	button.classList.toggle(enabledClass, !enabled);
	updateWordWrap();
}

let lastScrollY = 0;
// Scroll effects of the old theme: the hideable navbar, the sidebar's announcement-bar margin and back-to-top.
function onScroll(): void {
	const y = window.scrollY;
	const navbar = document.querySelector(`nav.${cls('Navbar/Layout', 'navbarHideable')}`) as HTMLElement | null;
	const hidden = cls('Navbar/Layout', 'navbarHidden');
	if (navbar) {
		const height = navbar.getBoundingClientRect().height;
		if (y < height) navbar.classList.remove(hidden);
		else if (lastScrollY && y >= lastScrollY) navbar.classList.add(hidden);
		else if (y + window.innerHeight < document.documentElement.scrollHeight - height) navbar.classList.remove(hidden);
	}
	const bar = document.querySelector('.theme-announcement-bar');
	document.querySelector('nav[aria-label="Docs sidebar"]')?.classList.toggle(cls('DocSidebar/Desktop/Content', 'menuWithAnnouncementBar'), Boolean(bar) && y === 0);
	const back = document.querySelector('.theme-back-to-top-button');
	if (back) back.classList.toggle(cls('BackToTopButton', 'backToTopButtonShow'), y >= 300 && y < lastScrollY);
	lastScrollY = y;
}

// The mobile drawer (Navbar/MobileSidebar): it exists only below 997px, built from the page's navbar and its
// sidebar (docs or blog) as the theme renders it there.
function mobileNavItem(link: HTMLAnchorElement): string {
	const copy = link.cloneNode(true) as HTMLAnchorElement;
	copy.className = [...link.classList].filter((c) => c !== 'navbar__item' && c !== 'navbar__link').map((c) => (c === 'navbar__link--active' ? 'menu__link--active' : c)).join(' ');
	copy.classList.add('menu__link');
	const classesInOrder = ['menu__link', ...[...copy.classList].filter((c) => c !== 'menu__link')];
	copy.className = classesInOrder.join(' ');
	return `<li class="menu__list-item">${copy.outerHTML}</li>`;
}
function mobileDropdown(dropdown: Element, label: string, labelIcon: string): string {
	const items = [...dropdown.querySelectorAll(':scope > .dropdown__menu > li')];
	const path = currentPath();
	const isActiveItem = (li: Element) => {
		const a = li.querySelector('a');
		return Boolean(a && (a.classList.contains('dropdown__link--active') || (!/^https?:/.test(a.getAttribute('href') ?? '') && samePath(a.getAttribute('href') ?? undefined, path) && !a.getAttribute('lang'))));
	};
	const containsActive = items.some((li) => li.querySelector('a.dropdown__link--active') && !li.querySelector('a[lang]'));
	const collapsed = !containsActive;
	const list = items
		.map((li) => {
			const a = li.querySelector('a');
			if (!a) return `<li class="${['menu__list-item', li.className].filter(Boolean).join(' ')}">${li.innerHTML}</li>`;
			const copy = a.cloneNode(true) as HTMLAnchorElement;
			copy.className = ['menu__link', ...[...a.classList].filter((cl) => cl !== 'dropdown__link').map((cl) => (cl === 'dropdown__link--active' ? 'menu__link--active' : cl))].join(' ');
			for (const svg of copy.querySelectorAll('svg[width="12"]')) {
				svg.setAttribute('width', '13.5');
				svg.setAttribute('height', '13.5');
			}
			void isActiveItem;
			return `<li class="menu__list-item">${copy.outerHTML}</li>`;
		})
		.join('');
	return `<li class="menu__list-item${collapsed ? ' menu__list-item--collapsed' : ''}"><div class="menu__list-item-collapsible"><a href="#" role="button" class="${cls('NavbarItem/DropdownNavbarItem/Mobile', 'dropdownNavbarItemMobile')} menu__link menu__link--sublist">${labelIcon}${label}</a><button aria-label="${collapsed ? 'Expand' : 'Collapse'} the dropdown" aria-expanded="${!collapsed}" type="button" class="clean-btn menu__caret"></button></div>${collapsed ? '' : `<ul class="menu__list" style="display: block; overflow: visible; height: auto;">${list}</ul>`}</li>`;
}
const pendingDropdownLists = new WeakMap<Element, string>();
let keptDrawer: Element | undefined;
function buildDrawer(nav: Element): void {
	const inner = nav.querySelector(':scope > .navbar__inner');
	if (!inner) return;
	const brand = inner.querySelector('.navbar__brand')?.outerHTML ?? '';
	const toggle = inner.querySelector(`.${cls('Navbar/Content', 'colorModeToggle')}`);
	const toggleCopy = toggle?.cloneNode(true) as HTMLElement | undefined;
	if (toggleCopy) toggleCopy.className = `${cls('ColorModeToggle', 'toggle')} margin-right--md`;
	const primary: string[] = [];
	const dropdownLists: string[] = [];
	for (const el of [...inner.querySelectorAll(':scope > .navbar__items > *')]) {
		if (el.matches('button.navbar__toggle, a.navbar__brand') || el.classList.contains(cls('Navbar/Content', 'colorModeToggle')) || el.classList.contains(cls('Navbar/Search', 'navbarSearchContainer'))) continue;
		if (el.matches('a.navbar__item')) primary.push(mobileNavItem(el as HTMLAnchorElement));
		else if (el.matches('.dropdown')) {
			const link = el.querySelector(':scope > .navbar__link')!;
			const icon = link.querySelector('svg')?.outerHTML ?? '';
			const label = link.querySelector('svg') ? 'Languages' : 'Versions';
			const markup = mobileDropdown(el, label, icon);
			primary.push(markup);
			dropdownLists.push(markup);
		} else if (el.matches('div.navbar__item')) primary.push(`<li class="${el.className.replace('navbar__item', 'menu__list-item').trim()}">${el.innerHTML}</li>`);
	}
	const sidebarMenu = document.querySelector('nav[aria-label="Docs sidebar"] > ul.theme-doc-sidebar-menu') ?? parkedNode('sidebar')?.querySelector('nav[aria-label="Docs sidebar"] > ul.theme-doc-sidebar-menu');
	const blogNav = document.querySelector('nav[aria-label="Blog recent posts navigation"]');
	let secondary = '';
	if (sidebarMenu) secondary = (sidebarMenu as Element).outerHTML;
	else if (blogNav) secondary = blogSidebarMobile(blogNav);
	const showSecondary = Boolean(secondary);
	const close = '<svg viewBox="0 0 15 15" width="21" height="21"><g stroke="var(--ifm-color-emphasis-600)" stroke-width="1.2"><path d="M.75.75l13.5 13.5M14.25.75L.75 14.25"></path></g></svg>';
	const panel = 'theme-layout-navbar-sidebar-panel navbar-sidebar__item menu';
	const markup = `<div class="theme-layout-navbar-sidebar navbar-sidebar"><div class="navbar-sidebar__brand">${brand}${toggleCopy?.outerHTML ?? ''}<button type="button" aria-label="Close navigation bar" class="clean-btn navbar-sidebar__close">${close}</button></div><div class="navbar-sidebar__items${showSecondary ? ' navbar-sidebar__items--show-secondary' : ''}"><div class="${panel}"${showSecondary ? ' inert=""' : ''}><ul class="menu__list">${primary.join('')}</ul></div><div class="${panel}"${showSecondary ? '' : ' inert=""'}><button type="button" class="clean-btn navbar-sidebar__back">← Back to main menu</button>${secondary}</div></div></div>`;
	// The drawer stays mounted across navigations, so a close started by a link click keeps sliding out.
	const kept = keptDrawer;
	if (kept && !kept.isConnected) {
		const fresh = document.createElement('div');
		fresh.innerHTML = markup;
		const next = fresh.firstElementChild!;
		const items = kept.querySelector(':scope > .navbar-sidebar__items');
		const nextItems = next.querySelector(':scope > .navbar-sidebar__items')!;
		kept.querySelector(':scope > .navbar-sidebar__brand')?.replaceWith(next.querySelector(':scope > .navbar-sidebar__brand')!);
		nav.append(kept);
		void kept.getBoundingClientRect();
		if (items) {
			items.className = nextItems.className;
			items.replaceChildren(...nextItems.childNodes);
		} else kept.append(nextItems);
	} else nav.insertAdjacentHTML('beforeend', markup);
	keptDrawer = nav.querySelector(':scope > .theme-layout-navbar-sidebar') ?? undefined;
	document.body.style.overflow = 'visible';
	void pendingDropdownLists;
	void dropdownLists;
}
function blogSidebarMobile(nav: Element): string {
	const groups = [...nav.querySelectorAll(':scope > [role=group]')];
	const list = (ul: Element) => `<ul class="menu__list">${[...ul.querySelectorAll(':scope > li > a')].map((a) => `<li class="menu__list-item"><a class="menu__link${a.getAttribute('aria-current') ? ' menu__link--active' : ''}"${a.getAttribute('aria-current') ? ' aria-current="page"' : ''} href="${a.getAttribute('href')}">${a.innerHTML}</a></li>`).join('')}</ul>`;
	const heading = (h3: Element | null) => (h3 ? `<h3 class="${cls('BlogSidebar/Mobile', 'yearGroupHeading')}">${h3.innerHTML}</h3>` : '');
	if (groups.length) return groups.map((g) => `<div role="group">${heading(g.querySelector('h3'))}${list(g.querySelector('ul')!)}</div>`).join('');
	const ul = nav.querySelector(':scope > ul');
	return ul ? list(ul) : '';
}
function toggleDrawer(show: boolean): void {
	const nav = document.querySelector('nav.theme-layout-navbar');
	nav?.classList.toggle('navbar-sidebar--show', show);
	nav?.querySelector(':scope > .navbar__inner .navbar__toggle')?.setAttribute('aria-expanded', show ? 'true' : 'false');
	document.body.style.overflow = show ? 'hidden' : 'visible';
}
function showSecondaryMenu(show: boolean): void {
	const items = document.querySelector('.navbar-sidebar__items');
	if (!items) return;
	items.classList.toggle('navbar-sidebar__items--show-secondary', show);
	const [primary, secondary] = items.querySelectorAll(':scope > .navbar-sidebar__item');
	primary?.toggleAttribute('inert', show);
	secondary?.toggleAttribute('inert', !show);
}
function toggleMobileDropdown(li: Element): void {
	const collapsed = !li.classList.contains('menu__list-item--collapsed');
	let list = li.querySelector(':scope > ul.menu__list') as HTMLElement | null;
	if (!list && !collapsed) {
		const label = li.querySelector('.menu__link--sublist')?.textContent ?? '';
		const desktop = [...document.querySelectorAll('.navbar__inner .dropdown')].find((dropdown) => (dropdown.querySelector(':scope > .navbar__link svg') ? 'Languages' : 'Versions') === label);
		if (!desktop) return;
		const html = mobileDropdown(desktop, label, '');
		const tmp = document.createElement('div');
		tmp.innerHTML = html.replace('menu__list-item--collapsed', '');
		const items = tmp.querySelector('ul.menu__list');
		if (items) {
			items.setAttribute('style', 'display: none; overflow: hidden; height: 0px;');
			li.append(items);
			list = items as HTMLElement;
		}
	}
	li.classList.toggle('menu__list-item--collapsed', collapsed);
	const caret = li.querySelector(':scope > .menu__list-item-collapsible > .menu__caret');
	caret?.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
	caret?.setAttribute('aria-label', collapsed ? 'Expand the dropdown' : 'Collapse the dropdown');
	if (list) animateCollapsible(list, collapsed);
}

// Docusaurus renders by window size (desktop above 996px): the navbar drawer only on mobile, the doc sidebar's
// content and the desktop table of contents only on desktop.
const parked = new Map<string, { parent: Element; node: Element; before: Node | null }>();
function park(key: string, node: Element | null): void {
	if (!node || parked.has(key)) return;
	parked.set(key, { parent: node.parentElement!, node, before: node.nextSibling });
	node.remove();
}
function unpark(key: string): void {
	const entry = parked.get(key);
	if (!entry) return;
	entry.parent.insertBefore(entry.node, entry.before);
	parked.delete(key);
}
const parkedNode = (key: string) => parked.get(key)?.node;
function applyWindowSize(): void {
	const nav = document.querySelector('nav.theme-layout-navbar');
	const drawer = nav?.querySelector(':scope > .theme-layout-navbar-sidebar');
	if (isMobile()) {
		if (nav && !drawer) buildDrawer(nav);
		park('sidebar', document.querySelector(`aside.theme-doc-sidebar-container .${cls('DocSidebar/Desktop', 'sidebar')}`));
		park('toc', document.querySelector(`.${cls('TOC', 'tableOfContents')}`));
		park('blog-sidebar', document.querySelector('nav[aria-label="Blog recent posts navigation"]')?.parentElement ?? null);
	} else {
		unpark('sidebar');
		unpark('toc');
		unpark('blog-sidebar');
		drawer?.remove();
		nav?.classList.remove('navbar-sidebar--show');
		if (drawer) document.body.style.removeProperty('overflow');
		if (!document.body.getAttribute('style')) document.body.removeAttribute('style');
	}
}

// TOCCollapsible: its list is made from the page's table of contents when first opened.
function toggleTocCollapsible(button: HTMLElement): void {
	const box = button.closest(`.${cls('TOCCollapsible', 'tocCollapsible')}`);
	if (!box) return;
	const expanded = box.classList.contains(cls('TOCCollapsible', 'tocCollapsibleExpanded'));
	let content = box.querySelector(`:scope > .${cls('TOCCollapsible', 'tocCollapsibleContent')}`) as HTMLElement | null;
	if (!content && !expanded) {
		const source = (document.querySelector(`.${cls('TOC', 'tableOfContents')} > ul`) ?? parkedNode('toc')?.querySelector(':scope > ul')) as Element | undefined;
		if (!source) return;
		const list = source.cloneNode(true) as Element;
		for (const a of list.querySelectorAll('a')) a.className = 'table-of-contents__link';
		box.insertAdjacentHTML('beforeend', `<div class="${cls('TOCCollapsible', 'tocCollapsibleContent')}" style="display: none; overflow: hidden; height: 0px;">${list.outerHTML}</div>`);
		content = box.lastElementChild as HTMLElement;
	}
	box.classList.toggle(cls('TOCCollapsible', 'tocCollapsibleExpanded'), !expanded);
	button.classList.toggle(cls('TOCCollapsible/CollapseButton', 'tocCollapsibleButtonExpanded'), !expanded);
	if (content) animateCollapsible(content, expanded);
}

// Ideal images (plugin-ideal-image): the placeholder loads its image once it is in the viewport, through a
// Waypoint that starts an XHR on enter and cancels it on leave (a jump over the image counts as both).
type Position = 'below' | 'inside' | 'above' | 'invisible';
type Lazy = { previous: Position | null; inViewport: boolean; request?: XMLHttpRequest; loaded: boolean };
type IdealHint = { alt?: string; width: number; height: number; srcSet: { src: string; width: number; height: number }[]; style?: string; imgStyle?: string };
const lazy = new Map<Element, Lazy>();
function position(el: Element): Position {
	const rect = el.getBoundingClientRect();
	if (rect.height === 0 && rect.width === 0) return 'invisible';
	if (rect.top > window.innerHeight) return 'below';
	if (rect.bottom < 0) return 'above';
	return 'inside';
}
function pickSource(el: Element, set: IdealHint['srcSet']): IdealHint['srcSet'][number] {
	const width = el.getBoundingClientRect().width * (window.devicePixelRatio || 1);
	const sorted = [...set].sort((a, b) => a.width - b.width);
	return sorted.find((s) => s.width >= width) ?? sorted[sorted.length - 1]!;
}
function lazyLoad(el: Element, info: IdealHint, state: Lazy): void {
	if (state.loaded || state.request) return;
	const source = pickSource(el, info.srcSet);
	const request = new XMLHttpRequest();
	state.request = request;
	request.open('GET', source.src);
	request.responseType = 'blob';
	request.onload = () => {
		state.request = undefined;
		state.loaded = true;
		if (!el.isConnected) return;
		(el as HTMLElement).setAttribute('style', info.style ?? '');
		el.innerHTML = '';
		const img = document.createElement('img');
		if (info.alt !== undefined) img.alt = info.alt;
		img.width = info.width;
		img.height = info.height;
		img.src = source.src;
		img.setAttribute('style', info.imgStyle ?? '');
		el.append(img);
	};
	request.send();
}
function checkLazyImages(): void {
	for (const el of document.querySelectorAll('div > svg:only-child')) {
		const box = el.parentElement!;
		const raw = hint(box, 'ideal');
		if (!raw) continue;
		const info = JSON.parse(raw) as IdealHint;
		let state = lazy.get(box);
		if (!state) lazy.set(box, (state = { previous: null, inViewport: false, loaded: false }));
		const now = position(box);
		const before = state.previous;
		state.previous = now;
		if (before === now) continue;
		const enter = () => {
			if (state!.inViewport) return;
			state!.inViewport = true;
			queueMicrotask(() => lazyLoad(box, info, state!));
		};
		const leave = () => {
			if (!state!.request) return;
			state!.inViewport = false;
			state!.request.abort();
			state!.request = undefined;
		};
		if (now === 'inside') enter();
		else if (before === 'inside') leave();
		if ((before === 'below' && now === 'above') || (before === 'above' && now === 'below')) {
			enter();
			leave();
		}
	}
}

// APITable: a row is a link to its own anchor (click on a cell, or Enter on the row).
function apiTableRow(event: Event): boolean {
	const row = closest(event, `table.${cls('APITable', 'apiTable')} > tbody > tr[id]`);
	if (!row) return false;
	if (event.type === 'click' && !(event.target instanceof Element && event.target.tagName === 'TD')) return false;
	if (event.type === 'click' && window.getSelection()?.toString()) return false;
	history.pushState(history.state, '', `#${row.id}`);
	window.dispatchEvent(new HashChangeEvent('hashchange'));
	row.scrollIntoView();
	return true;
}

// react-lite-youtube-embed: preconnect on hover, the player iframe on click.
let youtubeWarmed = false;
function warmYoutube(): void {
	if (youtubeWarmed) return;
	youtubeWarmed = true;
	for (const href of ['https://www.youtube-nocookie.com', 'https://www.google.com']) {
		const link = document.createElement('link');
		link.rel = 'preconnect';
		link.href = href;
		document.head.append(link);
	}
}
function playYoutube(article: HTMLElement): void {
	const raw = hint(article, 'youtube');
	if (!raw || article.querySelector('iframe')) return;
	const { id, params, title } = JSON.parse(raw) as { id: string; params?: string; title: string };
	const search = new URLSearchParams({ autoplay: '1' });
	if (params) new URLSearchParams(params.startsWith('&') ? params.slice(1) : params).forEach((value, key) => search.append(key, value));
	article.classList.add('lyt-activated');
	article.insertAdjacentHTML('beforeend', `<iframe class="" title="${escapeHtml(title)}" width="560" height="315" allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture" allowfullscreen="" src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?${search}"></iframe>`);
}

// The changelog's author avatars: a broken GitHub avatar shows a placeholder; the expand button shows them all.
const FALLBACK_AVATAR =
	'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600" fill="none" stroke="%2325c2a0" stroke-width="30" version="1.1"><circle cx="300" cy="230" r="115"/><path stroke-linecap="butt" d="M106.81863443903,481.4 a205,205 1 0,1 386.36273112194,0"/></svg>';
function avatarFallback(img: HTMLImageElement): void {
	if (img.getAttribute('src') !== FALLBACK_AVATAR) img.src = FALLBACK_AVATAR;
}
function watchAvatars(root: ParentNode): void {
	for (const img of root.querySelectorAll<HTMLImageElement>(`img.${cls('ChangelogAuthor', 'image')}`)) {
		if (img.complete && img.naturalWidth === 0) avatarFallback(img);
		img.addEventListener('error', () => avatarFallback(img), { once: true });
	}
}
function toggleChangelogAuthors(button: HTMLElement): void {
	const row = button.parentElement!;
	const expanded = button.hasAttribute('data-expanded');
	const authors = JSON.parse(hint(button, 'changelog-authors') ?? '[]') as { name: string; url?: string; imageURL?: string }[];
	if (!expanded) {
		const markup = authors.map((a) => `<div class="${cls('ChangelogAuthors', 'imageOnlyAuthorCol')}"><div class="avatar margin-bottom--sm">${a.imageURL ? `<a class="avatar__photo-link avatar__photo" href="${escapeHtml(a.url ?? '')}"${a.url && /^https?:/.test(a.url) ? ' target="_blank" rel="noopener noreferrer"' : ''}><img class="${cls('ChangelogAuthor', 'image')}" src="${escapeHtml(a.imageURL)}" alt="${escapeHtml(a.name)}"></a>` : ''}</div></div>`).join('');
		button.insertAdjacentHTML('beforebegin', markup);
		watchAvatars(row);
		button.setAttribute('data-expanded', '');
	} else {
		const cols = [...row.querySelectorAll(`:scope > .${cls('ChangelogAuthors', 'imageOnlyAuthorCol')}`)];
		cols.slice(10).forEach((col) => col.remove());
		button.removeAttribute('data-expanded');
	}
	const path = expanded
		? 'M476.612887 1009.12034L169.240699 695.380437a51.981345 51.981345 0 0 1 0-72.319045 49.382277 49.382277 0 0 1 70.824582 0l271.959897 277.645356 271.862433-277.645356a49.382277 49.382277 0 0 1 70.824582 0 51.981345 51.981345 0 0 1 0 72.319045l-307.307212 313.739903a49.447254 49.447254 0 0 1-70.792094 0z m307.274724-608.116755L511.99269 123.455693l-271.959897 277.645357a49.382277 49.382277 0 0 1-70.824582 0 51.981345 51.981345 0 0 1 0-72.319045L476.580399 15.042102a49.382277 49.382277 0 0 1 70.727117 0l307.372188 313.739903a51.981345 51.981345 0 0 1 0 72.319045 49.414766 49.414766 0 0 1-70.824582 0z'
		: 'M783.915092 1009.031953l-271.898251-277.615587-271.930737 277.550617a49.214558 49.214558 0 0 1-70.752018 0 51.780862 51.780862 0 0 1 0-72.246322l307.274261-313.706262a49.279528 49.279528 0 0 1 70.784503 0l307.33923 313.706262a51.975771 51.975771 0 0 1 0 72.311292 49.409467 49.409467 0 0 1-70.816988 0z m-307.306745-608.05155L169.269117 87.274141A51.975771 51.975771 0 0 1 169.269117 14.96285a49.409467 49.409467 0 0 1 70.816987 0l271.930737 277.615586L783.850122 14.96285a49.409467 49.409467 0 0 1 70.816988 0 51.975771 51.975771 0 0 1 0 72.311291l-307.33923 313.706262a49.376982 49.376982 0 0 1-70.719533 0z';
	button.querySelector('path')?.setAttribute('d', path);
}

// The community pages' Versions component: the latest canary version, from npm, as the original fetches it. Until
// it answers, the parts that need it wait aside (taken off the page at start).
function loadCanaryVersion(): void {
	const marked = [...document.querySelectorAll('[hidden]')].filter((el) => hint(el, 'canary'));
	const version = [...document.querySelectorAll('span')].filter((span) => hint(span, 'canary') === 'version');
	if (!marked.length && !version.length) return;
	const find = (name: string) => marked.find((el) => hint(el, 'canary') === name);
	const start = find('unknown-start');
	const end = find('unknown-end');
	const unknown: Node[] = [];
	let anchor: Comment | undefined;
	if (start && end) {
		for (let node = start.nextSibling; node && node !== end; node = node.nextSibling) unknown.push(node);
		anchor = document.createComment('');
		start.replaceWith(anchor);
		end.remove();
	}
	const known = find('known');
	known?.remove();
	const publish = find('publish');
	const publishAt = publish ? { parent: publish.parentNode!, before: publish.nextSibling } : undefined;
	publish?.remove();
	void fetch('https://registry.npmjs.org/@docusaurus/core')
		.then((res) => res.json())
		.then((body: { versions: Record<string, unknown>; time: Record<string, string> }) => {
			const name = Object.keys(body.versions).at(-1)!;
			const time = body.time[name];
			for (const span of version) if (span.isConnected) span.innerHTML = `Current: <b>${escapeHtml(name)}</b>`;
			if (anchor?.isConnected) {
				for (const node of unknown) (node as ChildNode).remove();
				if (known) anchor.replaceWith(document.createRange().createContextualFragment(known.innerHTML));
				else anchor.remove();
			}
			if (time && publishAt?.parent.isConnected) publishAt.parent.insertBefore(document.createRange().createContextualFragment(`The latest canary version that's available on npm is published at <b>${escapeHtml(new Date(time).toLocaleString())}</b>.`), publishAt.before);
			for (const token of document.querySelectorAll('.language-diff .token-line span')) if (token.textContent?.includes('0.0.0-4922')) token.textContent = token.textContent.replace('0.0.0-4922', name);
		})
		.catch(() => undefined);
}

// The feature-requests page: Canny's widget, as the original loads it.
function loadCanny(): void {
	const main = document.querySelector<HTMLElement>('main[data-canny]');
	if (!main || document.getElementById('canny-jssdk')) return;
	const w = window as unknown as { Canny?: ((...args: unknown[]) => void) & { q?: unknown[] } };
	if (typeof w.Canny !== 'function') {
		const queue = function (...args: unknown[]) {
			(queue.q ??= []).push(args);
		} as ((...args: unknown[]) => void) & { q?: unknown[] };
		w.Canny = queue;
	}
	const script = document.createElement('script');
	script.type = 'text/javascript';
	script.async = true;
	script.id = 'canny-jssdk';
	script.src = 'https://canny.io/sdk.js';
	document.getElementsByTagName('script')[0]?.parentNode?.insertBefore(script, document.getElementsByTagName('script')[0]!) ?? document.head.append(script);
	const dark = document.documentElement.getAttribute('data-theme') === 'dark';
	w.Canny!('render', { boardToken: '054e0e53-d951-b14c-7e74-9eb8f9ed2f91', basePath: '/feature-requests', theme: dark ? 'dark' : 'light' });
}

// The error-boundary demo button (docs/docusaurus-core): its click throws, and the layout's boundary shows this.
function boom(button: HTMLElement): void {
	const message = hint(button, 'boom') ?? 'Boom!';
	const fallback = document.createElement('div');
	fallback.innerHTML = `<main class="container margin-vert--xl"><div class="row"><div class="col col--6 col--offset-3"><h1 class="hero__title">This page crashed.</h1><div class="margin-vert--lg"><button type="button" class="button button--primary">Try again</button></div><div class="errorBoundaryError_tglT"><p>${escapeHtml(message).replace(/\n/g, '<br>')}</p></div></div></div></main>`;
	const main = document.getElementById('__docusaurus_skipToContent_fallback');
	if (!main) return;
	const saved = [...main.childNodes];
	main.replaceChildren(...fallback.childNodes);
	main.querySelector('button')?.addEventListener('click', () => main.replaceChildren(...saved));
}

function siteClick(event: Event): void {
	// React Router keeps the page when a link points at the address already shown (the version dropdown's "Canary").
	const link = closest(event, 'a[href]') as HTMLAnchorElement | null;
	if (link && !link.target && link.origin === location.origin && link.pathname === location.pathname && link.search === location.search && !link.hash && link.getAttribute('href') !== '#') event.preventDefault();
	if (link) savePreferredVersion(link);
	if (link?.closest('.theme-doc-version-banner')) {
		const latest = Object.entries(plugins).find(([id]) => activeDocsVersion(id));
		const last = latest?.[1].versions.find((v) => v.isLast);
		if (latest && last) storage()?.setItem(PREFERRED_KEY(latest[0]), last.name);
	}
	if (closest(event, `a.${cls('SkipToContent', 'skipToContent')}`)) return skipToContent(event);
	if (closest(event, `.${cls('AnnouncementBar', 'announcementBarClose')}`)) return dismissAnnouncement();
	if (closest(event, `.${cls('ColorModeToggle', 'toggle')} button`)) return cycleColorMode();
	const tab = closest(event, 'li[role=tab]');
	if (tab) return selectTab(tab);
	const wrap = closest(event, '.theme-code-block button[aria-label="Toggle word wrap"]');
	if (wrap) return toggleWordWrap(wrap);
	if (closest(event, '.theme-back-to-top-button')) return window.scrollTo({ top: 0, behavior: 'smooth' });
	const copy = closest(event, '.theme-code-block button[aria-label="Copy code to clipboard"]');
	if (copy) return void copyCode(copy);
	const summary = closest(event, 'details > summary');
	if (summary) return toggleDetails(event, summary);
	const drawer = closest(event, '.theme-layout-navbar-sidebar');
	const caret = closest(event, 'button.menu__caret');
	if (caret && caret.closest('li.theme-doc-sidebar-item-category')) {
		event.preventDefault();
		return toggleCategory(caret.closest('li.theme-doc-sidebar-item-category')!);
	}
	const categoryLink = closest(event, 'li.theme-doc-sidebar-item-category > .menu__list-item-collapsible > a.menu__link');
	if (categoryLink) {
		const item = categoryLink.closest('li.theme-doc-sidebar-item-category')!;
		const collapsible = categoryLink.classList.contains('menu__link--sublist');
		const hasHref = !categoryLink.hasAttribute('role');
		if (collapsible) {
			if (!hasHref || samePath(categoryLink.getAttribute('href') ?? undefined, currentPath())) {
				event.preventDefault();
				toggleCategory(item);
			} else if (item.classList.contains('menu__list-item--collapsed')) toggleCategory(item);
		}
		if (drawer && hasHref) toggleDrawer(false);
		return;
	}
	if (drawer && caret && caret.closest('.menu__list-item')) {
		event.preventDefault();
		return toggleMobileDropdown(caret.closest('.menu__list-item')!);
	}
	const mobileDropdownLink = drawer ? closest(event, 'a.menu__link--sublist[role=button]') : null;
	if (mobileDropdownLink) {
		event.preventDefault();
		return toggleMobileDropdown(mobileDropdownLink.closest('.menu__list-item')!);
	}
	if (closest(event, 'button.navbar-sidebar__back')) return showSecondaryMenu(false);
	if (drawer && link && !link.classList.contains('menu__link--sublist')) return toggleDrawer(false);
	if (closest(event, `button.${cls('DocSidebar/Desktop/CollapseButton', 'collapseSidebarButton')}`)) return setSidebarHidden(true);
	if (closest(event, `.${cls('DocRoot/Layout/Sidebar/ExpandButton', 'expandButton')}`)) return setSidebarHidden(false);
	if (closest(event, 'button.DocSearch-Button')) return openSearch();
	if (closest(event, '.navbar__inner button.navbar__toggle')) {
		showSecondaryMenu(Boolean(document.querySelector('.navbar-sidebar__items > .navbar-sidebar__item:nth-child(2) > :not(button)')));
		return toggleDrawer(true);
	}
	if (closest(event, '.navbar-sidebar__backdrop, .navbar-sidebar__close')) return toggleDrawer(false);
	const tocButton = closest(event, `button.${cls('TOCCollapsible/CollapseButton', 'tocCollapsibleButton')}`);
	if (tocButton) return toggleTocCollapsible(tocButton);
	if (apiTableRow(event)) return;
	const youtube = closest(event, 'article.yt-lite');
	if (youtube) return playYoutube(youtube);
	const authors = closest(event, `button.${cls('ChangelogAuthors', 'toggleButton')}`);
	if (authors) return toggleChangelogAuthors(authors);
	const boomButton = closest(event, 'button.button--danger');
	if (boomButton && hint(boomButton, 'boom')) return boom(boomButton);
	const dropdownToggle = closest(event, '.dropdown > a.navbar__link[role=button][href="#"]');
	if (dropdownToggle) event.preventDefault();
}

function siteKeyDown(event: KeyboardEvent): void {
	const toggle = closest(event, '.dropdown > a.navbar__link[role=button]');
	if (toggle && (event.key === 'Enter' || event.key === ' ')) {
		event.preventDefault();
		const dropdown = toggle.parentElement!;
		setDropdown(dropdown, !dropdown.classList.contains('dropdown--show'));
		return;
	}
	const tab = closest(event, 'li[role=tab]');
	if (tab) {
		if (event.key === 'Enter') return selectTab(tab);
		if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
			const tabs = [...(tab.parentElement?.children ?? [])] as HTMLElement[];
			const at = tabs.indexOf(tab);
			const next = event.key === 'ArrowRight' ? (tabs[at + 1] ?? tabs[0]) : (tabs[at - 1] ?? tabs[tabs.length - 1]);
			next?.focus();
		}
		return;
	}
	const expand = closest(event, `.${cls('DocRoot/Layout/Sidebar/ExpandButton', 'expandButton')}`);
	if (expand && (event.key === 'Enter' || event.key === ' ')) return setSidebarHidden(false);
	if (event.key === 'Enter' && closest(event, `table.${cls('APITable', 'apiTable')} > tbody > tr[id]`)) apiTableRow(event);
}

let booted = false;

// What Docusaurus redoes on every route: the router's client-side navigation swaps in a fresh page, so this runs again then.
function pageInit(): void {
	parked.clear();
	readHints(document.body);
	restoreTabs();
	if (storage()?.getItem(DISMISS_KEY) === 'true') document.querySelector('.theme-announcement-bar')?.remove();
	codeDark = false;
	applyColorMode(choice());
	// The navbar's body-scroll lock (useLockBodyScroll) writes the unlocked value as soon as it mounts.
	if (document.querySelector('nav.navbar') && !document.querySelector('nav.navbar-sidebar--show')) document.body.style.overflow = 'visible';
	restoreSidebar();
	applyDocsVersions();
	applyWindowSize();
	queueMicrotask(checkLazyImages);
	updateWordWrap();
	lastScrollY = window.scrollY;
	updateTocHighlight();
	watchAvatars(document);
	loadCanaryVersion();
	loadCanny();
	initSearchPage();
	initShowcase();
	initJsonViews(hint);
	initImageZoom();
	initColorGenerator((mode) => {
		storage()?.setItem(THEME_KEY, mode);
		applyColorMode(mode);
	});
}

export function siteBoot(): void {
	if (booted) return;
	booted = true;
	const viewed = storage()?.getItem(ANNOUNCEMENT_ID_KEY);
	const fresh = viewed !== ANNOUNCEMENT_ID;
	storage()?.setItem(ANNOUNCEMENT_ID_KEY, ANNOUNCEMENT_ID);
	if (fresh) storage()?.setItem(DISMISS_KEY, 'false');
	pageInit();
	document.addEventListener('marklessrouterrendered', pageInit);
	window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
		if (choice() === null) applyColorMode(null);
	});
	document.addEventListener('click', siteClick);
	window.addEventListener('resize', applyWindowSize);
	window.addEventListener('scroll', checkLazyImages, { passive: true });
	window.addEventListener('resize', checkLazyImages, { passive: true });
	window.addEventListener('resize', updateWordWrap, { passive: true });
	window.addEventListener('scroll', onScroll, { passive: true });
	document.addEventListener('scroll', updateTocHighlight);
	document.addEventListener('mouseover', (event) => {
		if (closest(event, 'article.yt-lite')) warmYoutube();
	});
	// Docusaurus loads DocSearch's code when the pointer reaches the search button; here it loads at idle, so no click waits on it.
	requestIdleCallback(() => void import('./search.ts').then((search) => search.load()));
	window.addEventListener('hashchange', keepLocation);
	window.addEventListener('hashchange', () => {
		if (document.getElementById(decodeURIComponent(window.location.hash.slice(1)))) document.querySelector(`nav.${cls('Navbar/Layout', 'navbarHideable')}`)?.classList.add(cls('Navbar/Layout', 'navbarHidden'));
	});
	document.addEventListener('mousedown', (event) => closeDropdownsOutside(event.target));
	document.addEventListener('focusin', (event) => closeDropdownsOutside(event.target));
	document.addEventListener('keydown', (event) => {
		siteKeyDown(event);
		if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
			event.preventDefault();
			openSearch();
		}
	});
}
