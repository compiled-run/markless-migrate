// The behaviour docusaurus.io's React theme adds after hydration, written against the imported markup.
// Storage keys and class names are the old site's own, so a visitor's saved choices carry over.
import themes from './code-themes.json';
import categories from './sidebar-categories.json';
import responsive from './responsive.json';

const SUFFIX = '-189';
const THEME_KEY = `theme${SUFFIX}`;
const TAB_KEY = (group: string) => `docusaurus.tab.${group}${SUFFIX}`;
const DISMISS_KEY = `docusaurus.announcement.dismiss${SUFFIX}`;
const ANNOUNCEMENT_ID_KEY = `docusaurus.announcement.id${SUFFIX}`;
const ANNOUNCEMENT_ID = 'announcementBar-v3.10';
const COPIED = 'copyButtonCopied_wDuR';

type Choice = 'light' | 'dark' | null;

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

function choice(): Choice {
	const saved = storage()?.getItem(THEME_KEY);
	return saved === 'light' || saved === 'dark' ? saved : null;
}

function systemDark(): boolean {
	return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function applyCodeTheme(dark: boolean): void {
	const page = (themes as Record<string, { light: string[]; dark: string[] }>)[window.location.pathname.replace(/\/$/, '') || '/'];
	if (!page) return;
	const styles = dark ? page.dark : page.light;
	const elements = document.querySelectorAll('.theme-code-block, .theme-code-block [style]');
	elements.forEach((el, index) => {
		const style = styles[index];
		if (style !== undefined && el.getAttribute('style') !== style) el.setAttribute('style', style);
	});
}

const MODE_LABEL: Record<string, string> = { light: 'light mode', dark: 'dark mode', system: 'system mode' };

function applyColorMode(next: Choice): void {
	const root = document.documentElement;
	const dark = next ? next === 'dark' : systemDark();
	root.setAttribute('data-theme', dark ? 'dark' : 'light');
	root.setAttribute('data-theme-choice', next ?? 'system');
	const label = MODE_LABEL[next ?? 'system']!;
	for (const button of document.querySelectorAll('.colorModeToggle_UolE button')) {
		button.setAttribute('title', label);
		button.setAttribute('aria-label', `Switch between dark and light mode (currently ${label})`);
	}
	applyCodeTheme(dark);
}

function cycleColorMode(): void {
	const current = choice();
	const next: Choice = current === null ? 'light' : current === 'light' ? 'dark' : null;
	if (next) storage()?.setItem(THEME_KEY, next);
	else storage()?.removeItem(THEME_KEY);
	applyColorMode(next);
}

function tabGroup(tab: Element): string | undefined {
	return (tab.closest('.theme-tabs-container') as HTMLElement | null)?.dataset.groupId;
}

function selectInContainer(container: Element, label: string): void {
	const tabs = [...container.querySelectorAll(':scope > ul[role=tablist] > li[role=tab]')];
	const panels = [...container.querySelectorAll(':scope > .margin-top--md > [role=tabpanel]')];
	tabs.forEach((tab, index) => {
		const on = tab.textContent === label;
		tab.setAttribute('tabindex', on ? '0' : '-1');
		tab.setAttribute('aria-selected', on ? 'true' : 'false');
		tab.classList.toggle('tabs__item--active', on);
		const panel = panels[index] as HTMLElement | undefined;
		if (panel) panel.hidden = !on;
	});
}

// npm2yarn blocks share one choice, saved like Docusaurus saves a tab groupId.
const NPM2YARN = ['npm', 'Yarn', 'pnpm', 'Bun'];

function isNpm2Yarn(container: Element): boolean {
	const labels = [...container.querySelectorAll(':scope > ul[role=tablist] > li[role=tab]')].map((tab) => tab.textContent);
	return labels.length === NPM2YARN.length && labels.every((label, index) => label === NPM2YARN[index]);
}

function selectTab(tab: HTMLElement): void {
	const container = tab.closest('.theme-tabs-container');
	if (!container) return;
	const label = tab.textContent ?? '';
	if (isNpm2Yarn(container)) {
		storage()?.setItem(TAB_KEY('npm2yarn'), label.toLowerCase());
		for (const other of document.querySelectorAll('.theme-tabs-container')) if (isNpm2Yarn(other)) selectInContainer(other, label);
	} else {
		selectInContainer(container, label);
	}
	updateWordWrap();
	void tabGroup;
}

function heightDuration(height: number): number {
	if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return 1;
	const constant = height / 36;
	return Math.round((4 + 15 * constant ** 0.25 + constant / 5) * 10);
}

function animateOpen(content: HTMLElement): void {
	content.style.display = 'block';
	const height = content.scrollHeight;
	content.setAttribute('style', `display: block; overflow: visible; height: auto; will-change: height; transition: height ${heightDuration(height)}ms ease-in-out;`);
}

function animateClose(content: HTMLElement): void {
	const height = content.scrollHeight;
	content.setAttribute('style', `display: none; overflow: hidden; height: 0px; will-change: height; transition: height ${heightDuration(height)}ms ease-in-out;`);
}

function toggleDetails(summary: HTMLElement): void {
	const details = summary.parentElement as HTMLDetailsElement | null;
	const content = summary.nextElementSibling as HTMLElement | null;
	if (!details || !content) return;
	// The browser has already flipped `open`; Docusaurus keeps data-collapsed and the inner height in step with it.
	queueMicrotask(() => {
		const open = details.open;
		details.setAttribute('data-collapsed', open ? 'false' : 'true');
		if (open) animateOpen(content);
		else animateClose(content);
	});
}

function categoryKey(item: Element): string {
	const labels: string[] = [];
	for (let at: Element | null = item; at; at = at.parentElement?.closest('li.theme-doc-sidebar-item-category') ?? null) {
		labels.unshift(at.querySelector(':scope > .menu__list-item-collapsible > a')?.textContent ?? '');
	}
	return labels.join(' / ');
}

function setCategory(item: Element, collapse: boolean): void {
	const button = item.querySelector(':scope > .menu__list-item-collapsible > button.menu__caret');
	let list = item.querySelector(':scope > ul.menu__list') as HTMLElement | null;
	// Docusaurus renders a collapsed category's items only once it is first opened.
	if (!list && !collapse) {
		const markup = (categories as Record<string, string>)[categoryKey(item)];
		if (!markup) return;
		item.insertAdjacentHTML('beforeend', markup);
		list = item.querySelector(':scope > ul.menu__list') as HTMLElement | null;
	}
	item.classList.toggle('menu__list-item--collapsed', collapse);
	if (button) {
		const label = button.getAttribute('aria-label')?.replace(/^(Expand|Collapse) sidebar category /, '') ?? '';
		button.setAttribute('aria-expanded', collapse ? 'false' : 'true');
		button.setAttribute('aria-label', `${collapse ? 'Expand' : 'Collapse'} sidebar category ${label}`);
	}
	if (!list) return;
	for (const link of list.querySelectorAll(':scope > li > a, :scope > li > .menu__list-item-collapsible > a')) link.setAttribute('tabindex', collapse ? '-1' : '0');
	if (collapse) animateClose(list);
	else animateOpen(list);
}

// autoCollapseCategories: opening a category closes its open siblings.
function toggleCategory(button: HTMLElement): void {
	const item = button.closest('li.menu__list-item');
	if (!item) return;
	const collapse = !item.classList.contains('menu__list-item--collapsed');
	if (!collapse) {
		for (const sibling of item.parentElement?.children ?? []) {
			if (sibling !== item && sibling.matches('li.theme-doc-sidebar-item-category:not(.menu__list-item--collapsed)')) setCategory(sibling, true);
		}
	}
	setCategory(item, collapse);
}

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
	'<svg width="20" height="20" aria-hidden="true" class="expandButtonIcon_H1n0"><g fill="#7a7a7a"><path d="M9.992 10.023c0 .2-.062.399-.172.547l-4.996 7.492a.982.982 0 01-.828.454H1c-.55 0-1-.453-1-1 0-.2.059-.403.168-.551l4.629-6.942L.168 3.078A.939.939 0 010 2.528c0-.548.45-.997 1-.997h2.996c.352 0 .649.18.828.45L9.82 9.472c.11.148.172.347.172.55zm0 0"></path><path d="M19.98 10.023c0 .2-.058.399-.168.547l-4.996 7.492a.987.987 0 01-.828.454h-3c-.547 0-.996-.453-.996-1 0-.2.059-.403.168-.551l4.625-6.942-4.625-6.945a.939.939 0 01-.168-.55 1 1 0 01.996-.997h3c.348 0 .649.18.828.45l4.996 7.492c.11.148.168.347.168.55zm0 0"></path></g></svg>';

function setSidebarHidden(hidden: boolean): void {
	const aside = document.querySelector('aside.theme-doc-sidebar-container');
	const sidebar = aside?.querySelector('.sidebar_vtcw');
	const main = document.querySelector('main.docMainContainer_EfwR');
	const wrapper = main?.querySelector(':scope > .container');
	aside?.classList.toggle('docSidebarContainerHidden_gbDM', hidden);
	sidebar?.classList.toggle('sidebarHidden_PrHU', hidden);
	main?.classList.toggle('docMainContainerEnhanced_r8nV', hidden);
	wrapper?.classList.toggle('docItemWrapperEnhanced_nA1F', hidden);
	const viewport = aside?.querySelector('.sidebarViewport_K3q9');
	const expand = viewport?.querySelector(':scope > .expandButton_ockD');
	if (hidden && viewport && !expand) viewport.insertAdjacentHTML('beforeend', `<div class="expandButton_ockD" title="Expand sidebar" aria-label="Expand sidebar" tabindex="0" role="button">${EXPAND_ICON}</div>`);
	if (!hidden) expand?.remove();
}

async function copyCode(button: HTMLElement): Promise<void> {
	const code = button.closest('.theme-code-block')?.querySelector('pre code') as HTMLElement | null;
	if (!code || !navigator.clipboard) return;
	const text = [...code.querySelectorAll('.token-line')].map((line) => line.textContent).join('\n');
	await navigator.clipboard.writeText(text);
	button.classList.add(COPIED);
	button.setAttribute('aria-label', 'Copied');
	setTimeout(() => {
		button.classList.remove(COPIED);
		button.setAttribute('aria-label', 'Copy code to clipboard');
	}, 1000);
}

function dismissAnnouncement(): void {
	storage()?.setItem(DISMISS_KEY, 'true');
	document.querySelector('.theme-announcement-bar')?.remove();
	document.querySelector('nav[aria-label="Docs sidebar"]')?.classList.remove('menuWithAnnouncementBar_Pf08');
}

let searching: Promise<void> | undefined;

function openSearch(): void {
	searching ??= import('./search.ts').then(async (search) => {
		await search.load();
		search.open();
	});
	void searching.then(() => import('./search.ts')).then((search) => search.show());
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

const WRAP_ENABLED = 'wordWrapButtonEnabled_nam_';
const WRAP_BUTTON =
	'<button type="button" aria-label="Toggle word wrap" title="Toggle word wrap" class="clean-btn"><svg viewBox="0 0 24 24" class="wordWrapButtonIcon___5r" aria-hidden="true"><path fill="currentColor" d="M4 19h6v-2H4v2zM20 5H4v2h16V5zm-3 6H4v2h13.25c1.1 0 2 .9 2 2s-.9 2-2 2H15v-2l-3 3l3 3v-2h2c2.21 0 4-1.79 4-4s-1.79-4-4-4z"></path></svg></button>';

// The word wrap button exists only while a code block scrolls sideways (or is already wrapped).
function updateWordWrap(): void {
	for (const pre of document.querySelectorAll('.theme-code-block pre')) {
		const code = pre.querySelector('code');
		const group = pre.parentElement?.querySelector(':scope > [class^=buttonGroup_]');
		if (!code || !group || (pre as HTMLElement).offsetParent === null) continue;
		const scrollable = pre.scrollWidth > pre.clientWidth || code.hasAttribute('style');
		const button = group.querySelector('button[aria-label="Toggle word wrap"]');
		if (scrollable && !button) group.insertAdjacentHTML('afterbegin', WRAP_BUTTON);
		if (!scrollable && button) button.remove();
	}
}

function toggleWordWrap(button: HTMLElement): void {
	const code = button.closest('.theme-code-block')?.querySelector('pre code') as HTMLElement | null;
	if (!code) return;
	const enabled = button.classList.contains(WRAP_ENABLED);
	if (enabled) code.removeAttribute('style');
	else {
		code.style.whiteSpace = 'pre-wrap';
		code.style.overflowWrap = 'anywhere';
	}
	button.classList.toggle(WRAP_ENABLED, !enabled);
	updateWordWrap();
}

let lastScrollY = 0;

// Scroll effects of the old theme: the hideable navbar, the sidebar's announcement-bar margin and back-to-top.
function onScroll(): void {
	const y = window.scrollY;
	const navbar = document.querySelector('nav.navbarHideable_uAgx') as HTMLElement | null;
	if (navbar) {
		const height = navbar.getBoundingClientRect().height;
		if (y < height) navbar.classList.remove('navbarHidden_QgM6');
		else if (lastScrollY && y >= lastScrollY) navbar.classList.add('navbarHidden_QgM6');
		else if (y + window.innerHeight < document.documentElement.scrollHeight - height) navbar.classList.remove('navbarHidden_QgM6');
	}
	const bar = document.querySelector('.theme-announcement-bar');
	document.querySelector('nav[aria-label="Docs sidebar"]')?.classList.toggle('menuWithAnnouncementBar_Pf08', Boolean(bar) && y === 0);
	const back = document.querySelector('.theme-back-to-top-button');
	if (back) back.classList.toggle('backToTopButtonShow_YSA3', y >= 300 && y < lastScrollY);
	lastScrollY = y;
}

function siteClick(event: Event): void {
	if (closest(event, 'a.skipToContent_UHvc')) return skipToContent(event);
	if (closest(event, '.announcementBarClose_UFLi')) return dismissAnnouncement();
	if (closest(event, '.colorModeToggle_UolE button')) return cycleColorMode();
	const tab = closest(event, 'li[role=tab]');
	if (tab) return selectTab(tab);
	const wrap = closest(event, '.theme-code-block button[aria-label="Toggle word wrap"]');
	if (wrap) return toggleWordWrap(wrap);
	if (closest(event, '.theme-back-to-top-button')) return window.scrollTo({ top: 0, behavior: 'smooth' });
	const copy = closest(event, '.theme-code-block button[aria-label="Copy code to clipboard"]');
	if (copy) return void copyCode(copy);
	const summary = closest(event, 'details > summary');
	if (summary) return toggleDetails(summary);
	const caret = closest(event, 'button.menu__caret');
	if (caret) return toggleCategory(caret);
	if (closest(event, 'button.collapseSidebarButton_PUyN')) return setSidebarHidden(true);
	if (closest(event, '.expandButton_ockD')) return setSidebarHidden(false);
	if (closest(event, 'button.DocSearch-Button')) return openSearch();
	if (closest(event, '.navbar__inner button.navbar__toggle')) return toggleDrawer(true);
	if (closest(event, '.navbar-sidebar__backdrop, .navbar-sidebar__close')) return toggleDrawer(false);
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
	const expand = closest(event, '.expandButton_ockD');
	if (expand && (event.key === 'Enter' || event.key === ' ')) setSidebarHidden(false);
}

type RouteParts = { drawer: string; lazy: string[] };

function routeParts(): RouteParts | undefined {
	return (responsive as Record<string, RouteParts>)[window.location.pathname.replace(/\/$/, '') || '/'];
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

function applyWindowSize(): void {
	const mobile = window.innerWidth <= 996;
	const nav = document.querySelector('nav.theme-layout-navbar');
	const drawer = nav?.querySelector(':scope > .theme-layout-navbar-sidebar');
	if (mobile) {
		park('sidebar', document.querySelector('aside.theme-doc-sidebar-container .sidebar_vtcw'));
		park('toc', document.querySelector('.tableOfContents_RLlU'));
		const markup = routeParts()?.drawer;
		if (nav && !drawer && markup) nav.querySelector(':scope > .navbar-sidebar__backdrop')?.insertAdjacentHTML('beforebegin', markup);
	} else {
		unpark('sidebar');
		unpark('toc');
		drawer?.remove();
		nav?.classList.remove('navbar-sidebar--show');
	}
}

function toggleDrawer(show: boolean): void {
	const nav = document.querySelector('nav.theme-layout-navbar');
	nav?.classList.toggle('navbar-sidebar--show', show);
	nav?.querySelector(':scope > .navbar__inner .navbar__toggle')?.setAttribute('aria-expanded', show ? 'true' : 'false');
}

// The home page's ideal-image avatars, as @docusaurus/plugin-ideal-image runs them: a Waypoint reports enter/leave on
// scroll and resize (a jump over the image counts as enter then leave), entering starts an XHR for the image, and
// leaving while that XHR is still running cancels it, leaving the blurred placeholder.
type Position = 'below' | 'inside' | 'above' | 'invisible';
interface Lazy {
	previous: Position | null;
	inViewport: boolean;
	request?: XMLHttpRequest;
	loaded: boolean;
}
const lazy = new Map<Element, Lazy>();

function position(el: Element): Position {
	const rect = el.getBoundingClientRect();
	if (rect.height === 0 && rect.width === 0) return 'invisible';
	if (rect.top > window.innerHeight) return 'below';
	if (rect.bottom < 0) return 'above';
	return 'inside';
}

function lazyLoad(el: Element, markup: string, state: Lazy): void {
	if (state.loaded || state.request) return;
	const src = /src="([^"]+)"/.exec(markup)?.[1];
	if (!src) return;
	const request = new XMLHttpRequest();
	state.request = request;
	request.open('GET', src);
	request.responseType = 'blob';
	request.onload = () => {
		state.request = undefined;
		state.loaded = true;
		if (el.isConnected) el.outerHTML = markup;
	};
	request.send();
}

function lazyEnter(el: Element, markup: string, state: Lazy): void {
	if (state.inViewport) return;
	state.inViewport = true;
	queueMicrotask(() => lazyLoad(el, markup, state));
}

function lazyLeave(state: Lazy): void {
	if (!state.request) return;
	state.inViewport = false;
	state.request.abort();
	state.request = undefined;
}

function checkLazyImages(): void {
	const loaded = routeParts()?.lazy ?? [];
	document.querySelectorAll('.avatar__photo--xl').forEach((el, index) => {
		const markup = loaded[index];
		if (!markup || !el.querySelector(':scope > svg')) return;
		let state = lazy.get(el);
		if (!state) lazy.set(el, (state = { previous: null, inViewport: false, loaded: false }));
		const now = position(el);
		const before = state.previous;
		state.previous = now;
		if (before === now) return;
		if (now === 'inside') lazyEnter(el, markup, state);
		else if (before === 'inside') lazyLeave(state);
		if ((before === 'below' && now === 'above') || (before === 'above' && now === 'below')) {
			lazyEnter(el, markup, state);
			lazyLeave(state);
		}
	});
}

function watchLazyImages(): void {
	if (!routeParts()?.lazy.length) return;
	window.addEventListener('scroll', checkLazyImages, { passive: true });
	window.addEventListener('resize', checkLazyImages, { passive: true });
	queueMicrotask(checkLazyImages);
}

let booted = false;

export function siteBoot(): void {
	if (booted) return;
	booted = true;
	document.documentElement.setAttribute('data-has-hydrated', 'true');
	const saved = storage()?.getItem(TAB_KEY('npm2yarn'));
	const label = NPM2YARN.find((item) => item.toLowerCase() === saved);
	if (label && label !== 'npm') for (const container of document.querySelectorAll('.theme-tabs-container')) if (isNpm2Yarn(container)) selectInContainer(container, label);
	const viewed = storage()?.getItem(ANNOUNCEMENT_ID_KEY);
	const fresh = viewed !== ANNOUNCEMENT_ID;
	storage()?.setItem(ANNOUNCEMENT_ID_KEY, ANNOUNCEMENT_ID);
	if (fresh) storage()?.setItem(DISMISS_KEY, 'false');
	if (!fresh && storage()?.getItem(DISMISS_KEY) === 'true') document.querySelector('.theme-announcement-bar')?.remove();
	applyColorMode(choice());
	window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
		if (choice() === null) applyColorMode(null);
	});
	document.addEventListener('click', siteClick);
	applyWindowSize();
	window.addEventListener('resize', applyWindowSize);
	watchLazyImages();
	updateWordWrap();
	window.addEventListener('resize', updateWordWrap, { passive: true });
	lastScrollY = window.scrollY;
	window.addEventListener('scroll', onScroll, { passive: true });
	document.addEventListener('scroll', updateTocHighlight);
	updateTocHighlight();
	window.addEventListener('hashchange', () => {
		if (document.getElementById(decodeURIComponent(window.location.hash.slice(1)))) document.querySelector('nav.navbarHideable_uAgx')?.classList.add('navbarHidden_QgM6');
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
