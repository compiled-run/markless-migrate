// The docs layout's behaviour, as @voidzero-dev/vitepress-theme and VitePress's client run it once a page is mounted:
// appearance switches, sidebar and outline menus, the active outline link, code groups and copy buttons, the aside's
// sponsors and Carbon, and the twoslash popups.
import './docs-header.ts';
import { installTwoslash } from './twoslash.ts';
import { onPage, scrollToHash } from './site.ts';

const STORAGE = 'vitepress-theme-appearance';
const html = document.documentElement;
const prefersDark = window.matchMedia('(prefers-color-scheme: dark)');
const isDocs = () => !!document.querySelector('.docs-layout');

// Vue's <Transition>: from + active classes on insert, to on the next frame, all removed once the transition ends.
function transition(el: Element, name: string, phase: 'enter' | 'leave', done?: () => void): void {
	const from = `${name}-${phase}-from`;
	const active = `${name}-${phase}-active`;
	const to = `${name}-${phase}-to`;
	el.classList.add(from, active);
	if (phase === 'leave') void (el as HTMLElement).offsetHeight;
	requestAnimationFrame(() => {
		requestAnimationFrame(() => {
			el.classList.remove(from);
			el.classList.add(to);
			const style = getComputedStyle(el);
			const longest = Math.max(...style.transitionDuration.split(',').map((d, i) => (parseFloat(d) + parseFloat(style.transitionDelay.split(',')[i] ?? '0')) * 1000));
			let finished = false;
			const finish = () => {
				if (finished) return;
				finished = true;
				el.classList.remove(active, to);
				done?.();
			};
			if (!longest) return finish();
			el.addEventListener('transitionend', (event) => event.target === el && finish());
			setTimeout(finish, longest + 1);
		});
	});
}

// --- appearance: VitePress's isDark, through VueUse's useDark (stored 'auto' when it matches the system) ---------------
const isDark = () => html.classList.contains('dark');
function syncSwitches(): void {
	// Header.vue marks itself dark with the page, in the same update that switches the page.
	const header = document.querySelector('.docs-layout [data-v-5773249e].relative.w-full.z-50');
	if (isDark()) header?.setAttribute('data-theme', 'dark');
	else header?.removeAttribute('data-theme');
	for (const button of document.querySelectorAll('.VPSwitchAppearance')) {
		button.setAttribute('title', isDark() ? 'Switch to light theme' : 'Switch to dark theme');
		button.setAttribute('aria-checked', String(isDark()));
	}
}
function applyDark(dark: boolean): void {
	// useColorMode turns transitions off while the class changes.
	const style = document.createElement('style');
	style.appendChild(
		document.createTextNode(
			'*,*::before,*::after{-webkit-transition:none!important;-moz-transition:none!important;-o-transition:none!important;-ms-transition:none!important;transition:none!important}',
		),
	);
	document.head.appendChild(style);
	html.classList.toggle('dark', dark);
	syncSwitches();
	void window.getComputedStyle(style).opacity;
	document.head.removeChild(style);
}
document.addEventListener('click', (event) => {
	if (!(event.target as Element | null)?.closest?.('.VPSwitchAppearance')) return;
	const dark = !isDark();
	localStorage.setItem(STORAGE, dark === prefersDark.matches ? 'auto' : dark ? 'dark' : 'light');
	applyDark(dark);
});
document.addEventListener('docs:mobilemenu', syncSwitches);
prefersDark.addEventListener('change', (event) => {
	if (isDocs() && (localStorage.getItem(STORAGE) ?? 'auto') === 'auto') applyDark(event.matches);
});

// --- sidebar (mobile): VPLocalNav's menu button, VPBackdrop and VPSidebar -----------------------------------------------
let sidebarTrigger: HTMLElement | null = null;
const sidebarEl = () => document.querySelector<HTMLElement>('.VPSidebar');
function openSidebar(): void {
	const aside = sidebarEl();
	if (!aside || aside.classList.contains('open')) return;
	sidebarTrigger = document.activeElement as HTMLElement | null;
	aside.classList.add('open');
	document.querySelector('.VPLocalNav .menu')?.setAttribute('aria-expanded', 'true');
	const backdrop = document.createElement('div');
	backdrop.className = 'VPBackdrop backdrop';
	backdrop.setAttribute('data-v-98e8ba30', '');
	backdrop.setAttribute('data-v-2ea92cbb', '');
	document.querySelector('.Layout > .VPSkipLink')?.after(backdrop);
	transition(backdrop, 'fade', 'enter');
	document.body.style.overflow = 'hidden';
	aside.focus();
}
function closeSidebar(): void {
	const aside = sidebarEl();
	if (!aside?.classList.contains('open')) return;
	aside.classList.remove('open');
	document.querySelector('.VPLocalNav .menu')?.setAttribute('aria-expanded', 'false');
	const backdrop = document.querySelector('.VPBackdrop');
	if (backdrop) transition(backdrop, 'fade', 'leave', () => backdrop.remove());
	document.body.style.overflow = '';
}
document.addEventListener('click', (event) => {
	const target = event.target as Element | null;
	if (target?.closest?.('.VPLocalNav .menu')) openSidebar();
	else if (target?.closest?.('.VPBackdrop')) closeSidebar();
});
window.addEventListener('keyup', (event) => {
	if (event.key !== 'Escape' || !sidebarEl()?.classList.contains('open')) return;
	closeSidebar();
	sidebarTrigger?.focus();
});

// --- local nav outline dropdown (VPLocalNavOutlineDropdown.vue) ------------------------------------------------------
const dropdown = () => document.querySelector<HTMLElement>('.VPLocalNavOutlineDropdown');
function closeDropdown(): void {
	const main = dropdown();
	const items = main?.querySelector('.items');
	if (!main || !items) return;
	main.querySelector('button')?.setAttribute('class', '');
	transition(items, 'flyout', 'leave', () => items.remove());
}
function openDropdown(): void {
	const main = dropdown()!;
	const S = 'data-v-5bab9656';
	const button = main.querySelector('button')!;
	button.setAttribute('class', 'open');
	main.style.setProperty('--vp-vh', `${window.innerHeight - main.getBoundingClientRect().top}px`);
	const items = document.createElement('div');
	items.className = 'items';
	items.setAttribute(S, '');
	const header = document.createElement('div');
	header.className = 'header';
	header.setAttribute(S, '');
	const top = document.createElement('a');
	top.className = 'top-link';
	top.href = '#';
	top.setAttribute(S, '');
	top.textContent = 'Return to top';
	header.append(top);
	const outline = document.createElement('div');
	outline.className = 'outline';
	outline.setAttribute(S, '');
	const list = document.querySelector('.VPDocAsideOutline ul.VPDocOutlineItem')?.cloneNode(true) as HTMLElement | undefined;
	if (list) {
		list.className = 'VPDocOutlineItem nested';
		list.removeAttribute('data-v-e8d9ab97');
		list.setAttribute(S, '');
		for (const link of list.querySelectorAll('.outline-link.active')) link.classList.remove('active');
		outline.append(list);
	}
	items.append(header, outline);
	main.append(items);
	transition(items, 'flyout', 'enter');
}
document.addEventListener('click', (event) => {
	const target = event.target as Element | null;
	const main = dropdown();
	if (!main) return;
	const button = target?.closest?.('.VPLocalNavOutlineDropdown > button');
	if (button) {
		if (!button.querySelector('.menu-text')) window.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
		else if (button.classList.contains('open')) closeDropdown();
		else openDropdown();
		return;
	}
	if (target?.closest?.('.VPLocalNavOutlineDropdown .top-link')) {
		closeDropdown();
		window.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
		return;
	}
	if (target?.closest?.('.VPLocalNavOutlineDropdown .items')) {
		if (target.classList.contains('outline-link')) {
			const items = main.querySelector<HTMLElement>('.items');
			if (items) items.style.transition = 'none';
			queueMicrotask(closeDropdown);
		}
		return;
	}
	if (main.querySelector('.items') && !main.contains(target)) closeDropdown();
});
window.addEventListener('keydown', (event) => {
	if (event.key === 'Escape') closeDropdown();
});

// Shown on a page with neither an outline nor a sidebar only once the window has scrolled past the nav bar.
function syncLocalNav(): void {
	const wrapper = document.querySelector('.docs-layout .content-wrapper');
	if (!wrapper || wrapper.querySelector(':scope > .VPLocalNav:not(.fixed)')) return;
	const navHeight = parseInt(getComputedStyle(html).getPropertyValue('--vp-nav-height')) || 0;
	const existing = wrapper.querySelector(':scope > .VPLocalNav');
	if (window.scrollY >= navHeight && !existing) {
		const S = 'data-v-50962069';
		const D = 'data-v-5bab9656';
		const nav = document.createElement('div');
		nav.className = 'VPLocalNav empty fixed';
		nav.setAttribute('data-v-2ea92cbb', '');
		nav.setAttribute(S, '');
		nav.innerHTML = `<div class="container" ${S}=""><div class="VPLocalNavOutlineDropdown" style="--vp-vh:0px;" ${S}="" ${D}=""><button ${D}="">Return to top</button></div></div>`;
		wrapper.prepend(nav);
	} else if (window.scrollY < navHeight && existing) existing.remove();
}

// --- active outline link (outline.ts useActiveAnchor) -------------------------------------------------------------------
let previousActive: HTMLAnchorElement | null = null;
function asideEnabled(): boolean {
	const is960 = window.matchMedia('(min-width: 960px)').matches;
	const is1280 = window.matchMedia('(min-width: 1280px)').matches;
	if (!is1280 && !is960) return false;
	return document.querySelector('.content-wrapper.has-sidebar') ? is1280 : is960;
}
function absoluteTop(element: HTMLElement): number {
	let top = 0;
	let node: HTMLElement | null = element;
	while (node !== document.body) {
		if (node === null) return NaN;
		top += node.offsetTop;
		node = node.offsetParent as HTMLElement | null;
	}
	return top;
}
function activateLink(hash: string | null): void {
	const container = document.querySelector('.VPDocAsideOutline');
	const marker = document.querySelector<HTMLElement>('.VPDocAsideOutline .outline-marker');
	if (!container || !marker) return;
	previousActive?.classList.remove('active');
	previousActive = hash == null ? null : container.querySelector<HTMLAnchorElement>(`a[href="${decodeURIComponent(hash)}"]`);
	if (previousActive) {
		previousActive.classList.add('active');
		marker.style.top = `${previousActive.offsetTop + 39}px`;
		marker.style.opacity = '1';
	} else {
		marker.style.top = '33px';
		marker.style.opacity = '0';
	}
}
function setActiveLink(): void {
	if (!asideEnabled() || !document.querySelector('.VPDocAsideOutline')) return;
	const links = [...document.querySelectorAll<HTMLAnchorElement>('.VPDocAsideOutline .outline-link')].map((a) => a.getAttribute('href')!);
	const headers = links
		.map((link) => {
			const element = document.getElementById(decodeURIComponent(link).slice(1));
			return element
				? {
						link,
						top: absoluteTop(element),
						margin: Number.parseFloat(getComputedStyle(element).scrollMarginTop) || 0,
					}
				: undefined;
		})
		.filter((h): h is { link: string; top: number; margin: number } => !!h && !Number.isNaN(h.top))
		.sort((a, b) => a.top - b.top);
	if (!headers.length || window.scrollY < 1) return activateLink(null);
	if (Math.abs(window.scrollY + window.innerHeight - document.body.offsetHeight) < 1) return activateLink(headers[headers.length - 1]!.link);
	let active: string | null = null;
	for (const { link, top, margin } of headers) {
		if (top > window.scrollY + margin + 4) break;
		active = link;
	}
	activateLink(active);
}
// VitePress's throttleAndDebounce(fn, 100).
function throttleAndDebounce(fn: () => void, delay: number): () => void {
	let timeout: ReturnType<typeof setTimeout> | undefined;
	let called = false;
	return () => {
		if (timeout) clearTimeout(timeout);
		if (!called) {
			fn();
			called = true;
			setTimeout(() => (called = false), delay);
		} else timeout = setTimeout(fn, delay);
	};
}
const onScroll = throttleAndDebounce(setActiveLink, 100);
window.addEventListener('scroll', () => {
	if (!isDocs()) return;
	onScroll();
	syncLocalNav();
});

// --- code groups and copy buttons (VitePress's useCodeGroups and useCopyCode) ------------------------------------------
window.addEventListener('click', (event) => {
	const el = event.target as HTMLElement;
	if (!el.matches?.('.vp-code-group input') || el.closest('.marketing-layout')) return;
	const group = el.parentElement?.parentElement;
	if (!group) return;
	const i = Array.from(group.querySelectorAll('input')).indexOf(el as HTMLInputElement);
	if (i < 0) return;
	const blocks = group.querySelector('.blocks');
	if (!blocks) return;
	const current = Array.from(blocks.children).find((child) => child.classList.contains('active'));
	const next = blocks.children[i];
	if (!current || !next || current === next) return;
	current.classList.remove('active');
	next.classList.add('active');
	window.dispatchEvent(new CustomEvent('vitepress:codeGroupTabActivate', { detail: next }));
	group.querySelector(`label[for="${el.id}"]`)?.scrollIntoView({ block: 'nearest' });
});

const copyTimeouts = new WeakMap<Element, number>();
const SHELL = new Set(['vue-html', 'vue', 'bash', 'sh', 'zsh', 'shellscript', 'shell', 'shellsession', 'console', 'fish', 'powershell', 'ps', 'ps1', 'bat', 'batch', 'cmd']);
async function copyToClipboard(text: string): Promise<void> {
	try {
		await navigator.clipboard.writeText(text);
	} catch {
		const element = document.createElement('textarea');
		const previouslyFocused = document.activeElement as HTMLElement | null;
		element.value = text;
		element.setAttribute('readonly', '');
		element.style.contain = 'strict';
		element.style.position = 'absolute';
		element.style.left = '-9999px';
		element.style.fontSize = '12pt';
		const selection = document.getSelection();
		const originalRange = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
		document.body.appendChild(element);
		element.select();
		element.selectionStart = 0;
		element.selectionEnd = text.length;
		document.execCommand('copy');
		document.body.removeChild(element);
		if (originalRange && selection) {
			selection.removeAllRanges();
			selection.addRange(originalRange);
		}
		previouslyFocused?.focus();
	}
}
window.addEventListener('click', (event) => {
	const el = event.target as HTMLElement;
	if (!el.matches?.('div[class*="language-"] > button.copy') || el.closest('.marketing-layout')) return;
	const parent = el.parentElement;
	const sibling = el.nextElementSibling?.nextElementSibling;
	if (!parent || !sibling) return;
	const clone = sibling.cloneNode(true) as HTMLElement;
	clone.querySelectorAll('.vp-copy-ignore, .diff.remove').forEach((node) => node.remove());
	clone.innerHTML = clone.innerHTML.replace(/\n+/g, '\n');
	let text = clone.textContent || '';
	const lang = /language-(\w+)/.exec(parent.className)?.[1] || '';
	if (SHELL.has(lang)) text = text.replace(/^ *(\$|>) /gm, '').trim();
	void copyToClipboard(text).then(() => {
		el.classList.add('copied');
		clearTimeout(copyTimeouts.get(el));
		copyTimeouts.set(
			el,
			window.setTimeout(() => {
				el.classList.remove('copied');
				el.blur();
				copyTimeouts.delete(el);
			}, 2000),
		);
	});
});

// --- aside: AsideSponsors.vue's grid (sponsors.json, fetched once) and VPCarbonAds.vue -------------------------------
interface Sponsor {
	readonly name: string;
	readonly img: string;
	readonly url: string;
}
// useSponsor(): sponsors.json, fetched once and shared by every grid on the site.
let sponsors: Promise<Record<'main' | 'partnership' | 'platinum' | 'gold', Sponsor[]>> | undefined;
const loadSponsors = () => (sponsors ??= fetch('https://sponsors.vite.dev/sponsors.json').then((response) => response.json()));
const GRID: Record<string, [number, number][]> = {
	xmini: [[0, 2]],
	mini: [],
	small: [
		[920, 6],
		[768, 5],
		[640, 4],
		[480, 3],
		[0, 2],
	],
	medium: [
		[960, 5],
		[832, 4],
		[640, 3],
		[480, 2],
	],
	big: [
		[832, 3],
		[640, 2],
	],
};
// useSponsorsGrid: columns for the window width, and empty slots to fill the last row.
function adjustSlots(grid: HTMLElement, size: string): void {
	const total = grid.children.length;
	const filled = grid.querySelectorAll('.vp-sponsor-grid-item:not(.empty)').length;
	let columns = 1;
	(GRID[size] ?? []).some(([breakpoint, value]) => {
		if (window.innerWidth >= breakpoint) {
			columns = filled < value ? filled : value;
			return true;
		}
		return false;
	});
	grid.dataset.vpGrid = String(columns);
	const remainder = filled % columns;
	let count = (remainder === 0 ? 0 : columns - remainder) - (total - filled);
	for (; count > 0; count--) {
		const slot = document.createElement('div');
		slot.classList.add('vp-sponsor-grid-item', 'empty');
		grid.append(slot);
	}
	for (; count < 0; count++) grid.removeChild(grid.lastElementChild!);
}
// Each grid keeps the size it was mounted with for its resize handler.
const sponsorGrids = new Map<HTMLElement, string>();
const onResize = throttleAndDebounce(() => {
	for (const [grid, size] of sponsorGrids)
		if (grid.isConnected) adjustSlots(grid, size);
		else sponsorGrids.delete(grid);
}, 100);
window.addEventListener('resize', onResize);
function gridItems(grid: HTMLElement, items: readonly Sponsor[]): void {
	for (const sponsor of items) {
		const item = document.createElement('div');
		item.className = 'vp-sponsor-grid-item';
		const link = document.createElement('a');
		link.className = 'vp-sponsor-grid-link';
		link.href = sponsor.url;
		link.target = '_blank';
		link.rel = 'sponsored noopener';
		const box = document.createElement('article');
		box.className = 'vp-sponsor-grid-box';
		const img = document.createElement('img');
		img.className = 'vp-sponsor-grid-image';
		img.src = sponsor.img;
		if (sponsor.name != null) img.alt = sponsor.name;
		box.append(img);
		link.append(box);
		item.append(link);
		grid.append(item);
	}
}
// VPSponsors.vue: a section per tier, each a VPSponsorsGrid mounted with its sponsors.
function sponsorSection(tier: { readonly tier?: string; readonly size: string; readonly items: readonly Sponsor[] }): HTMLElement {
	const section = document.createElement('section');
	section.className = 'vp-sponsor-section';
	if (tier.tier) {
		const title = document.createElement('h3');
		title.className = 'vp-sponsor-tier';
		title.textContent = tier.tier;
		section.append(title);
	}
	const grid = document.createElement('div');
	grid.className = `VPSponsorsGrid vp-sponsor-grid ${tier.size}`;
	gridItems(grid, tier.items);
	section.append(grid);
	adjustSlots(grid, tier.size);
	sponsorGrids.set(grid, tier.size);
	return section;
}
// AsideSponsors.vue renders once the data is there: the first tier small, the big ones mini, the rest xmini.
function renderAsideSponsors(card: Element): void {
	void loadSponsors().then(
		(data) => {
			if (!card.isConnected || card.nextElementSibling?.classList.contains('VPDocAsideSponsors')) return;
			const wrap = document.createElement('div');
			wrap.className = 'VPDocAsideSponsors';
			wrap.setAttribute('data-v-ff42876e', '');
			const root = document.createElement('div');
			root.className = 'VPSponsors vp-sponsor aside';
			root.append(
				sponsorSection({ size: 'small', items: data.main }),
				sponsorSection({ size: 'mini', items: data.partnership }),
				sponsorSection({ size: 'mini', items: data.platinum }),
				sponsorSection({ size: 'xmini', items: data.gold }),
			);
			wrap.append(root);
			card.after(wrap);
		},
		() => {},
	);
}
// The acknowledgements page's <VPSponsors :data="sponsors ?? []">: rendered empty first, so its first grid mounts with no
// sponsors (and keeps the medium size and zero columns it measured then) and the tiers fill in when the data arrives.
function renderPageSponsors(root: HTMLElement): void {
	const first = root.querySelector<HTMLElement>('.VPSponsorsGrid');
	if (first) {
		adjustSlots(first, 'medium');
		sponsorGrids.set(first, 'medium');
	}
	void loadSponsors().then(
		(data) => {
			if (!root.isConnected || !first || root.querySelector('.vp-sponsor-tier')) return;
			const title = document.createElement('h3');
			title.className = 'vp-sponsor-tier';
			title.textContent = 'Brought to you by';
			first.before(title);
			first.className = 'VPSponsorsGrid vp-sponsor-grid big';
			gridItems(first, data.main);
			root.append(
				sponsorSection({ tier: 'In partnership with', size: 'big', items: data.partnership }),
				sponsorSection({ tier: 'Platinum Sponsors', size: 'big', items: data.platinum }),
				sponsorSection({ tier: 'Gold Sponsors', size: 'medium', items: data.gold }),
			);
		},
		() => {},
	);
}
function carbon(): void {
	const container = document.querySelector('.VPCarbonAds');
	if (!container || container.querySelector('#_carbonads_js')) return;
	const init = () => {
		const script = document.createElement('script');
		script.id = '_carbonads_js';
		script.src = '//cdn.carbonads.com/carbon.js?serve=CEBIEK3N&placement=vitejsdev';
		script.async = true;
		container.appendChild(script);
	};
	if (asideEnabled()) return init();
	const wide = () => {
		if (!asideEnabled() || !container.isConnected) return;
		window.removeEventListener('resize', wide);
		init();
	};
	window.addEventListener('resize', wide, { passive: true });
}

installTwoslash();

onPage((navigated) => {
	if (!isDocs()) return;
	// The not-found page's translations link to the address that was asked for.
	if (document.querySelector('.NotFound'))
		for (const link of document.querySelectorAll<HTMLAnchorElement>('a[href$=".vite.dev/404"]')) link.href = link.href.replace(/\/404$/, location.pathname);
	for (const template of document.querySelectorAll<HTMLTemplateElement>('.NotFound ~ template, template[data-mobile-menu]'))
		if (document.querySelector('.NotFound'))
			for (const link of template.content.querySelectorAll<HTMLAnchorElement>('a[href$=".vite.dev/404"]')) link.href = link.href.replace(/\/404$/, location.pathname);
	syncSwitches();
	// VPSidebarGroup.vue lets the sidebar animate 300 ms after it mounts.
	const groups = document.querySelectorAll('.VPSidebar .group.no-transition');
	if (groups.length) setTimeout(() => groups.forEach((group) => group.classList.remove('no-transition')), 300);
	previousActive = null;
	if (navigated) {
		activateLink(location.hash || null);
		// VPSkipLink.vue: after a route change focus goes back to the top of the page.
		document.querySelector<HTMLElement>('.Layout > span[tabindex="-1"]')?.focus();
		if (location.hash) scrollToHash(location.hash);
	} else requestAnimationFrame(setActiveLink);
	syncLocalNav();
	const card = document.querySelector('.VPDocAside .viteconf');
	if (card) renderAsideSponsors(card);
	const pageSponsors = document.querySelector<HTMLElement>('.vp-doc .sponsors-container > .VPSponsors');
	if (pageSponsors) renderPageSponsors(pageSponsors);
	carbon();
});
