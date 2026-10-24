import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseSync } from 'oxc-parser';
import { lineIndex, walk, type N } from '../source/js.ts';
import { classesOf, type HtmlElement } from './html.ts';
import type { BehaviourKind } from './types.ts';

/**
 * A feature a documentation theme draws, recognised by the class names the theme's own components write (Docusaurus
 * theme-classic's CSS-module names keep their source name before the hash: `colorModeToggle_UolE`), with the theme
 * component that renders it.
 */
export interface ThemeFeature {
	readonly theme: 'docusaurus-theme' | 'vitepress-theme';
	readonly feature: string;
	readonly kind: BehaviourKind;
	/** The theme component that renders it, as a site's source imports it. */
	readonly component: string;
	readonly match: (el: HtmlElement) => boolean;
	readonly summary: string;
}

const cls = (prefix: string) => (el: HtmlElement) => classesOf(el).some((c) => c === prefix || c.startsWith(`${prefix}_`));
const has = (name: string) => (el: HtmlElement) => classesOf(el).includes(name);
const both = (a: (el: HtmlElement) => boolean, b: (el: HtmlElement) => boolean) => (el: HtmlElement) => a(el) && b(el);

export const THEME_FEATURES: readonly ThemeFeature[] = [
	{ theme: 'docusaurus-theme', feature: 'color mode toggle', kind: 'color-mode', component: '@theme/ColorModeToggle', match: cls('colorModeToggle'), summary: 'switches the colour mode (light, dark, and system when the site respects the OS setting) and remembers the choice; the first click takes effect in its own frame, before the rest of the site\'s code has loaded' },
	{ theme: 'docusaurus-theme', feature: 'search (DocSearch)', kind: 'search', component: '@theme/SearchBar', match: (el) => el.tag === 'button' && has('DocSearch-Button')(el), summary: 'opens the DocSearch dialog (also on Ctrl/Cmd+K), which closes on Escape, the backdrop or its close button; its shortcut keys read ⌘ K and its name "Search (Meta+k)" on Apple platforms, Ctrl K and "Search (Control+k)" elsewhere, chosen in the browser from navigator.platform without a frame of the wrong ones; the dialog\'s code (Ask AI included) loads on the first pointer, focus or touch on the button or a held Ctrl/⌘, before the site\'s own code has started, so the first click fetches nothing' },
	{ theme: 'docusaurus-theme', feature: 'mobile navbar sidebar', kind: 'navbar', component: '@theme/Navbar/MobileSidebar', match: both((el) => el.tag === 'button', has('navbar__toggle')), summary: 'opens the mobile navigation drawer, closed by its close button or the backdrop; the navbar\'s dropdowns (versions, locales) expand and collapse inside it, a link closes it, and the logo leaves it open when it names the page already shown' },
	{ theme: 'docusaurus-theme', feature: 'navbar dropdown', kind: 'menu', component: '@theme/NavbarItem/DropdownNavbarItem', match: both(has('navbar__item'), has('dropdown')), summary: 'opens a navbar menu on hover or focus; choosing an item closes it at once, with no fade, since the theme remounts the navbar on a route change' },
	{ theme: 'docusaurus-theme', feature: 'hideable navbar', kind: 'navbar', component: '@theme/Navbar/Layout', match: cls('navbarHideable'), summary: 'hides when the reader scrolls down and shows when they scroll up; shows again on every route change, Back included, where the restored scroll is not the reader\'s, and hides on a route change to a #hash' },
	{ theme: 'docusaurus-theme', feature: 'docs sidebar category', kind: 'disclosure', component: '@theme/DocSidebarItem/Category', match: (el) => has('menu__caret')(el) || has('menu__list-item-collapsible')(el), summary: 'expands and collapses a sidebar category, animating its height; the sidebar\'s items come with the page (it is part of the kept layout), so neither a navigation nor an expand makes a request the old site does not' },
	{ theme: 'docusaurus-theme', feature: 'collapse docs sidebar', kind: 'sidebar', component: '@theme/DocSidebar/Desktop/CollapseButton', match: cls('collapseSidebarButton'), summary: 'hides the docs sidebar and shows it again' },
	{ theme: 'docusaurus-theme', feature: 'tabs', kind: 'tabs', component: '@theme/Tabs', match: (el) => has('tabs')(el) && el.attrs.get('role') === 'tablist', summary: 'switches tab panels by click and arrow keys; a groupId syncs tabs across the page and remembers the choice' },
	{ theme: 'docusaurus-theme', feature: 'details', kind: 'disclosure', component: '@theme/Details', match: (el) => el.tag === 'details' && (has('details')(el) || cls('details')(el)), summary: 'opens and closes a details block with an animated height' },
	{ theme: 'docusaurus-theme', feature: 'copy code button', kind: 'copy', component: '@theme/CodeBlock/Buttons/CopyButton', match: (el) => el.tag === 'button' && /copy code/i.test(el.attrs.get('aria-label') ?? ''), summary: 'copies the code block to the clipboard and shows a check mark for a moment' },
	{ theme: 'docusaurus-theme', feature: 'announcement bar close', kind: 'dismiss', component: '@theme/AnnouncementBar', match: (el) => el.tag === 'button' && cls('announcementBarClose')(el), summary: 'hides the announcement bar and remembers it was closed' },
	{ theme: 'docusaurus-theme', feature: 'back to top button', kind: 'scroll', component: '@theme/BackToTopButton', match: has('theme-back-to-top-button'), summary: 'appears after scrolling down and scrolls back to the top' },
	{ theme: 'docusaurus-theme', feature: 'table of contents highlight', kind: 'toc', component: '@theme/TOC', match: has('table-of-contents'), summary: 'highlights the heading in view as the page scrolls' },
	{ theme: 'docusaurus-theme', feature: 'mobile table of contents', kind: 'disclosure', component: '@theme/TOCCollapsible', match: cls('tocCollapsibleButton'), summary: 'expands and collapses the table of contents on small screens' },
	{ theme: 'vitepress-theme', feature: 'appearance switch', kind: 'color-mode', component: 'VPSwitchAppearance', match: has('VPSwitchAppearance'), summary: 'switches light and dark and remembers the choice' },
	{ theme: 'vitepress-theme', feature: 'search', kind: 'search', component: 'VPNavBarSearch', match: (el) => has('DocSearch-Button')(el) || has('VPNavBarSearchButton')(el), summary: 'opens the search dialog (also on Ctrl/Cmd+K and /)' },
	{ theme: 'vitepress-theme', feature: 'mobile menu', kind: 'navbar', component: 'VPNavBarHamburger', match: has('VPNavBarHamburger'), summary: 'opens the mobile navigation screen' },
	{ theme: 'vitepress-theme', feature: 'sidebar group', kind: 'disclosure', component: 'VPSidebarItem', match: both(has('VPSidebarItem'), has('collapsible')), summary: 'expands and collapses a sidebar group' },
	{ theme: 'vitepress-theme', feature: 'code group tabs', kind: 'tabs', component: 'vp-code-group', match: has('vp-code-group'), summary: 'switches between code blocks in a group' },
	{ theme: 'vitepress-theme', feature: 'copy code button', kind: 'copy', component: 'vp-code copy', match: (el) => el.tag === 'button' && has('copy')(el), summary: 'copies the code block to the clipboard' },
	{ theme: 'vitepress-theme', feature: 'navbar flyout', kind: 'menu', component: 'VPFlyout', match: has('VPFlyout'), summary: 'opens a navbar menu on hover or focus' },
	{ theme: 'vitepress-theme', feature: 'local outline', kind: 'disclosure', component: 'VPLocalNavOutlineDropdown', match: has('VPLocalNavOutlineDropdown'), summary: 'opens the page outline on small screens' },
];

export interface ConfigFact {
	readonly theme: ThemeFeature['theme'];
	/** The feature the setting changes (matches ThemeFeature.feature). */
	readonly feature: string;
	readonly settings: Record<string, unknown>;
	readonly file: string;
	readonly line: number;
}

const value = (n: N | undefined): unknown => {
	if (!n) return undefined;
	if (n.type === 'Literal') return n.value;
	if (n.type === 'TemplateLiteral' && n.quasis.length === 1) return n.quasis[0].value.cooked;
	if (n.type === 'ArrayExpression') return (n.elements as N[]).map(value);
	if (n.type === 'ObjectExpression') return Object.fromEntries((n.properties as N[]).flatMap((p) => (p.type === 'Property' && (p.key.type === 'Identifier' || p.key.type === 'Literal') ? [[p.key.name ?? String(p.key.value), value(p.value)]] : [])));
	if (n.type === 'UnaryExpression' && n.operator === '!' && n.argument.type === 'Literal') return !n.argument.value;
	return `{${n.type}}`;
};

// Settings in a theme config that change how a feature behaves: the property name, the feature it belongs to.
const DOCUSAURUS_SETTINGS: Readonly<Record<string, string>> = { colorMode: 'color mode toggle', announcementBar: 'announcement bar close', algolia: 'search (DocSearch)', tableOfContents: 'table of contents highlight', sidebar: 'collapse docs sidebar', hideOnScroll: 'hideable navbar' };
const VITEPRESS_SETTINGS: Readonly<Record<string, string>> = { appearance: 'appearance switch', search: 'search', outline: 'local outline' };

/** Reads a Docusaurus or VitePress config's syntax tree for the settings that change a theme feature (colorMode.respectPrefersColorScheme, docs.sidebar.hideable...). */
export async function readThemeConfig(source: string): Promise<ConfigFact[]> {
	const candidates: [ThemeFeature['theme'], string, Readonly<Record<string, string>>][] = [
		...['docusaurus.config.ts', 'docusaurus.config.js', 'docusaurus.config.mjs', 'docusaurus.config.mts'].map((f) => ['docusaurus-theme', f, DOCUSAURUS_SETTINGS] as [ThemeFeature['theme'], string, Readonly<Record<string, string>>]),
		...['.vitepress/config.ts', '.vitepress/config.mts', '.vitepress/config.js', '.vitepress/config.mjs', 'docs/.vitepress/config.ts', 'docs/.vitepress/config.mts'].map((f) => ['vitepress-theme', f, VITEPRESS_SETTINGS] as [ThemeFeature['theme'], string, Readonly<Record<string, string>>]),
	];
	const facts: ConfigFact[] = [];
	for (const [theme, file, settings] of candidates) {
		const text = await readFile(join(source, file), 'utf8').catch(() => undefined);
		if (text === undefined) continue;
		const program = parseSync(file, text, { sourceType: 'module', preserveParens: false }).program as unknown as N;
		const line = lineIndex(text);
		walk(program, (n, ancestors) => {
			if (n.type !== 'Property' || n.key?.type !== 'Identifier') return;
			const feature = settings[n.key.name];
			if (!feature) return;
			// `sidebar` counts only under `docs`, as themeConfig.docs.sidebar; elsewhere it is the sidebars file or a plugin option.
			if (n.key.name === 'sidebar' && !ancestors.some((a) => a.type === 'Property' && a.key?.name === 'docs')) return;
			const v = value(n.value);
			facts.push({ theme, feature, settings: v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : { [n.key.name]: v }, file, line: line(n.start) });
		});
	}
	return facts;
}

/** The colours a colour-mode toggle cycles through on a click, from the theme's settings. */
export function colorModeCycle(theme: ThemeFeature['theme'], settings: Readonly<Record<string, unknown>> | undefined): string[] {
	if (theme === 'docusaurus-theme') return settings?.respectPrefersColorScheme === true ? ['system', 'light', 'dark'] : ['light', 'dark'];
	return ['light', 'dark'];
}
