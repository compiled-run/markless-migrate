import type { Part } from '../parts/index.ts';
import { markSwitched, resolvedTheme, switchedFor, setTheme, watchSystemTheme, type ThemeOptions } from '../parts/next-themes.ts';
import { configure } from '../parts/cmdk.ts';
import { clipboardFor } from '../parts/reveal.ts';
import { closeContaining, toggle } from '../parts/radix/dialog.ts';

// The site's own client components (components/*.tsx in the old app), on Markless: ModeSwitcher and the D shortcut of
// ThemeProvider, CopyButton and CodeBlockCommand's copy. Library behaviour comes from the ports in ../parts.

// components/theme-provider.tsx: <NextThemesProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange enableColorScheme>
const THEME: ThemeOptions = { attribute: 'class', themes: ['light', 'dark'], storageKey: 'theme', defaultTheme: 'system', enableSystem: true, enableColorScheme: true, disableTransitionOnChange: true };
watchSystemTheme(THEME);
// hooks/use-meta-color.ts
const META_THEME_COLORS = { light: '#ffffff', dark: '#0a0a0a' };

function toggleTheme(): void {
	const next = resolvedTheme(THEME) === 'dark' ? 'light' : 'dark';
	setTheme(next, THEME);
	document.querySelector('meta[name="theme-color"]')?.setAttribute('content', next === 'dark' ? META_THEME_COLORS.dark : META_THEME_COLORS.light);
}

const isEditable = (t: EventTarget | null) => (t instanceof HTMLElement && t.isContentEditable) || t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement;

// @tabler/icons-react's IconCopy (lucide-react's Terminal) turned into IconCheck (lucide's Check) by its attributes (the
// svg is Markless's: no node is swapped).
const TABLER_CHECK = { class: 'tabler-icon tabler-icon-check ', d: 'M5 12l5 5l10 -10', points: '5 12 10 17 20 7' };
const LUCIDE_CHECK = { class: 'lucide lucide-check', d: 'M20 6 9 17l-5-5', points: '20 6 9 17 4 12' };
type Saved = { cls: string | null; shape: (string | null)[] };
const copied = new WeakMap<Element, { timer: number; saved: Saved }>();

// The check is drawn by the icon's first path, or its first polyline (lucide's Terminal has no path); the rest are hidden meanwhile.
const shapeOf = (svg: SVGElement) => svg.querySelector('path') ?? svg.querySelector('polyline');
const geometry = (el: Element) => (el.tagName === 'path' ? 'd' : 'points');
const savedOf = (svg: SVGElement): Saved => ({ cls: svg.getAttribute('class'), shape: [...svg.children].map((el) => el.getAttribute(geometry(el))) });

function setIcon(svg: SVGElement, saved: Saved, check: boolean): void {
	const shape = shapeOf(svg);
	const others = [...svg.children].filter((el) => el !== shape);
	if (check) {
		const icon = (saved.cls ?? '').includes('lucide') ? LUCIDE_CHECK : TABLER_CHECK;
		svg.setAttribute('class', icon.class);
		if (shape) shape.setAttribute(geometry(shape), shape.tagName === 'path' ? icon.d : icon.points);
		for (const el of others) el.setAttribute('display', 'none');
	} else {
		if (saved.cls === null) svg.removeAttribute('class');
		else svg.setAttribute('class', saved.cls);
		[...svg.children].forEach((el, i) => {
			const value = saved.shape[i];
			if (value) el.setAttribute(geometry(el), value);
		});
		for (const el of others) el.removeAttribute('display');
	}
}

function legacyCopy(value: string): boolean {
	const area = document.createElement('textarea');
	area.value = value;
	area.setAttribute('readonly', '');
	area.style.position = 'fixed';
	area.style.opacity = '0';
	area.style.pointerEvents = 'none';
	// Outside <body>, the page Markless renders: the textarea is gone again within this call.
	document.documentElement.appendChild(area);
	area.focus();
	area.select();
	area.setSelectionRange(0, value.length);
	let ok = false;
	try {
		ok = document.execCommand('copy');
	} catch {}
	document.documentElement.removeChild(area);
	return ok;
}

async function copy(value: string | Promise<string>): Promise<boolean> {
	// Text still loading is written as a ClipboardItem of its promise, which keeps the click's user activation.
	if (typeof value !== 'string') {
		if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
			try {
				await navigator.clipboard.write([new ClipboardItem({ 'text/plain': value.then((t) => new Blob([t], { type: 'text/plain' })) })]);
				return true;
			} catch {}
		}
		value = await value;
	}
	if (!value) return false;
	if (navigator.clipboard?.writeText) {
		try {
			await navigator.clipboard.writeText(value);
			return true;
		} catch {
			return legacyCopy(value);
		}
	}
	return legacyCopy(value);
}

// The copied value is the code the button sits on: the visible block's text, as the old page passed it in.
function valueFor(button: Element): string {
	const scope = button.parentElement;
	const code = [...(scope?.querySelectorAll('pre') ?? [])].find((pre) => !pre.closest('[hidden]')) ?? scope?.querySelector('code');
	return code?.textContent ?? '';
}

// registry/bases/*/ui/code-block.tsx's CodeBlockCopyButton: aria-label "Copied" and data-copied while it shows the check.
function showCopied(button: HTMLElement): void {
	const svg = button.querySelector('svg');
	if (!svg) return;
	const was = copied.get(button);
	if (was) clearTimeout(was.timer);
	const saved = was?.saved ?? savedOf(svg);
	setIcon(svg, saved, true);
	const codeBlock = button.dataset.slot === 'code-block-copy-button';
	const marks = button.hasAttribute('data-copied') || codeBlock;
	if (marks) button.setAttribute('data-copied', 'true');
	if (codeBlock) button.setAttribute('aria-label', 'Copied');
	const timer = window.setTimeout(() => {
		setIcon(svg, saved, false);
		if (codeBlock) {
			button.removeAttribute('data-copied');
			button.setAttribute('aria-label', 'Copy');
		} else if (marks) button.setAttribute('data-copied', 'false');
		copied.delete(button);
	}, 2000);
	copied.set(button, { timer, saved });
}

const modeSwitcher: Part = {
	click(target, event) {
		const button = target.closest('button');
		if (!button || button.querySelector('.sr-only')?.textContent !== 'Toggle theme') return false;
		if (!switchedFor(event)) toggleTheme();
		return true;
	},
	shortcut(target, event) {
		if ((event.key !== 'd' && event.key !== 'D') || event.metaKey || event.ctrlKey || event.altKey || isEditable(target)) return;
		event.preventDefault();
		if (switchedFor(event)) return;
		toggleTheme();
		markSwitched(event);
	},
};

const copyButton: Part = {
	click(target) {
		const button = target.closest<HTMLElement>('[data-slot="copy-button"]');
		if (!button) return false;
		void copy(valueFor(button)).then((ok) => ok && showCopied(button));
		return true;
	},
};

// components/docs-sidebar.tsx: the sidebar's scroll position is kept per path in sessionStorage, saved once it is shown
// (after lib/docs-sidebar-scroll.ts's inline script has restored it) and on every scroll.
const SIDEBAR_SCROLL_KEY = 'docs-sidebar-scroll';
function saveScroll(container: Element): void {
	try {
		sessionStorage.setItem(SIDEBAR_SCROLL_KEY, JSON.stringify({ pathname: location.pathname, scrollTop: container.scrollTop }));
	} catch {}
}
// hooks/use-search-registry.ts: the directory's list asks /r/registries.json for each registry's health once mounted
// (its answer is what the captured list already shows).
let directoryHealth = false;
const docsSidebar: Part = {
	mount(el) {
		if (!el.hasAttribute('data-docs-sidebar-content')) return;
		if (location.pathname === '/docs/directory' && !directoryHealth) {
			directoryHealth = true;
			void fetch('/r/registries.json', { signal: AbortSignal.timeout(5000) }).catch(() => {});
		}
		saveScroll(el);
		el.addEventListener('scroll', () => saveScroll(el), { passive: true });
	},
};

// components/docs-copy-page.tsx: Copy Page writes the page's raw MDX (captured from the old page as what the button
// copies) and shows IconCheck for useCopyToClipboard's 2 s; CodeBlockCopyButton (registry/bases/*/ui/code-block.tsx) alike.
const copyPage: Part = {
	click(target) {
		const button = target.closest<HTMLElement>('button');
		const text = button ? clipboardFor(button) : undefined;
		if (!button || text === undefined) return false;
		void copy(text).then((ok) => ok && showCopied(button));
		return true;
	},
};

// components/component-preview-tabs.tsx: View Code sets isMobileCodeVisible, which its code block carries as an attribute.
const viewCode: Part = {
	click(target) {
		const code = target.closest('[data-mm-replace]')?.closest<HTMLElement>('[data-slot="code"][data-mobile-code-visible]');
		if (!code) return false;
		code.setAttribute('data-mobile-code-visible', 'true');
		return true;
	},
};

// components/block-viewer.tsx's Refresh Preview: setIframeKey mounts the block's frame afresh, which loads its page again.
const refreshPreview: Part = {
	click(target) {
		const frame = target.closest('button[title="Refresh Preview"]')?.closest('[data-view]')?.querySelector('iframe');
		if (!frame) return false;
		frame.src = frame.src;
		return true;
	},
};

// components/component-preview-tabs.tsx's RTL preview: a LanguageProvider (Arabic first) around the example, whose
// language selector sets the preview's dir and data-lang and the example's text from its translations table
// (examples/<base>/*-rtl.tsx, extracted into rtl-translations.json by scripts/rtl-translations.ts). The example is told
// by its text: the table whose Arabic strings the preview shows. Each node's first text is kept, so every language is
// written from it: the table's strings, the direction and data-lang of what was marked Arabic.
type RtlTable = Record<string, { readonly dir: 'ltr' | 'rtl'; readonly locale?: string; readonly values: Record<string, string>; readonly place?: readonly (readonly [string, string])[] }>;
const LANGUAGES: Record<string, string> = { English: 'en', 'Arabic (العربية)': 'ar', 'Hebrew (עברית)': 'he' };
let rtlTables: Promise<Record<string, RtlTable>> | undefined;
const loadTables = () => (rtlTables ??= import('./rtl-translations.json').then((m) => (m as unknown as { default: Record<string, RtlTable> }).default));
const firstText = new WeakMap<Node, string>();
// What was last written on a text: a text that reads otherwise was written since by the page (a count), and is read again.
const written = new WeakMap<Node, string>();
const firstAttrs = new WeakMap<Element, Record<string, string | null>>();
const PLACED = ['data-side', 'data-align', 'data-mm-side', 'data-mm-align', 'data-mm-placement'] as const;
const RTL_ATTRS = ['placeholder', 'aria-label', 'title', 'alt', 'dir', 'data-lang', ...PLACED] as const;
const rtlTableOf = new WeakMap<Element, RtlTable | null>();
const firstPlaced = new WeakSet<Element>();

function previewParts(preview: Element): Element[] {
	// What the example opens is in the layers its controls name (a dialog, a menu, a submenu a menu opens), each keyed by
	// the control's id, aria-controls or capture key.
	const parts = [preview];
	const layers = [...document.querySelectorAll('[data-mm-layer]')];
	for (let i = 0; i < parts.length; i++) {
		const keys = new Set([...parts[i]!.querySelectorAll('[id], [aria-controls], [data-mm-key]')].flatMap((e) => [e.id, e.getAttribute('aria-controls'), e.getAttribute('data-mm-key')].filter((k): k is string => Boolean(k))));
		for (const layer of layers) if (!parts.includes(layer) && keys.has(layer.getAttribute('data-mm-layer') ?? '')) parts.push(layer);
	}
	return parts;
}

function textNodes(root: Element): Text[] {
	const out: Text[] = [];
	const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
	for (let n = walker.nextNode(); n; n = walker.nextNode()) out.push(n as Text);
	return out;
}

function chooseTable(tables: Record<string, RtlTable>, parts: readonly Element[]): RtlTable | undefined {
	const shown = new Set(parts.flatMap((p) => textNodes(p).map((t) => (firstText.get(t) ?? t.data).trim())).filter(Boolean));
	// The libraries' examples share their strings: a tie goes to the page's own library's (its place props differ).
	const library = /^\/docs\/components\/(radix|base|aria)\//.exec(location.pathname)?.[1];
	let best: RtlTable | undefined;
	let score = 0;
	for (const [name, table] of Object.entries(tables)) {
		const values = Object.values(table.ar?.values ?? {});
		const hits = values.filter((v) => shown.has(v.trim())).length * 2 + (name.startsWith(`${library}/`) ? 1 : 0);
		if (hits > 1 && hits > score) [best, score] = [table, hits];
	}
	return best;
}

function writeLanguage(preview: Element, table: RtlTable | undefined, language: string): void {
	const parts = previewParts(preview);
	const target = table?.[language];
	const dir = target?.dir ?? (language === 'en' ? 'ltr' : 'rtl');
	const from = new Map<string, string>(Object.entries(table?.ar?.values ?? {}).map(([key, v]) => [v.trim(), target?.values[key] ?? v]));
	// A string the example writes beside numbers ("{n} من {m} صف(وف) محدد."): each of the table's strings standing as words, longest first.
	const words = [...from.keys()].filter(Boolean).sort((a, b) => b.length - a.length);
	const escape = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	const inside = words.length ? new RegExp(`(^|\\s)(${words.map(escape).join('|')})(?=\\s|$)`, 'gu') : undefined;
	// Numbers the example formats in its locale (useTranslation's formatNumber): Arabic-Indic digits in Arabic only.
	const digits = (text: string) => (language === 'ar' ? text : text.replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/\u066b/g, '.').replace(/\u066c/g, ','));
	const translate = (text: string) => {
		const key = text.trim();
		const whole = from.get(key);
		if (whole !== undefined) return text.replace(key, whole);
		return digits(inside ? text.replace(inside, (_, space: string, word: string) => space + (from.get(word) ?? word)) : text);
	};
	// Where the example places its popups by direction (side, align, React Aria's placement): the attribute the part that
	// opens it reads, from its value as captured in Arabic to this language's. React Aria's is captured physical.
	const physical = (v: string, d: string) => v.replace(/\bstart\b/, d === 'rtl' ? 'right' : 'left').replace(/\bend\b/, d === 'rtl' ? 'left' : 'right');
	const placed = new Map<string, Map<string, string>>();
	(table?.ar?.place ?? []).forEach(([prop, was], i) => {
		const now = target?.place?.[i]?.[1];
		if (now === undefined) return;
		// What the source asked for (data-mm-side, data-mm-align) and where it went as captured are both read.
		const [names, a, b] = prop === 'placement' ? [['data-mm-placement'], physical(was, 'rtl'), physical(now, dir)] : [[`data-${prop}`, `data-mm-${prop}`], was, now];
		if (a !== b) for (const name of names) (placed.get(name) ?? placed.set(name, new Map()).get(name)!).set(a, b);
	});
	for (const part of parts) {
		for (const node of textNodes(part)) {
			if (!firstText.has(node) || (written.has(node) && written.get(node) !== node.data)) firstText.set(node, node.data);
			const next = translate(firstText.get(node)!);
			if (node.data !== next) node.data = next;
			written.set(node, next);
		}
		for (const el of [part, ...part.querySelectorAll('*')]) {
			const first = firstAttrs.get(el) ?? Object.fromEntries(RTL_ATTRS.map((a) => [a, el.getAttribute(a)]));
			firstAttrs.set(el, first);
			for (const name of ['placeholder', 'aria-label', 'title', 'alt'] as const) if (first[name] !== null) el.setAttribute(name, translate(first[name]!));
			if (first.dir === 'rtl') el.setAttribute('dir', dir);
			if (part !== preview)
				for (const name of PLACED) {
					const was = first[name];
					if (was == null || !placed.has(name) && !firstPlaced.has(el)) continue;
					const to = placed.get(name)?.get(was) ?? was;
					if (el.getAttribute(name) !== to) el.setAttribute(name, to);
					firstPlaced.add(el);
				}
			if (first['data-lang'] === 'ar') {
				if (dir === 'rtl') el.setAttribute('data-lang', language);
				else el.removeAttribute('data-lang');
			}
		}
	}
}

// The language each preview shows other than its first; what the page renders in its parts later (a layer opened, a
// count changed) is written in that language too.
const shownLanguage = new Map<Element, string>();
let rewriting = false;
const rewrite = new MutationObserver(() => {
	if (rewriting) return;
	rewriting = true;
	queueMicrotask(() => {
		rewriting = false;
		void loadTables().then(() => {
			for (const [preview, language] of shownLanguage) if (preview.isConnected) writeLanguage(preview, rtlTableOf.get(preview) ?? undefined, language);
			rewrite.takeRecords();
		});
	});
});

const watchedSelectors = new WeakSet<Element>();
function watchLanguage(selector: Element): void {
	if (watchedSelectors.has(selector)) return;
	watchedSelectors.add(selector);
	const preview = selector.closest('[data-slot="component-preview"]')?.querySelector(':scope > [data-slot="preview"]');
	const label = selector.querySelector('[data-slot="select-value"]');
	if (!preview || !label) return;
	let shown = 'ar';
	new MutationObserver(() => {
		const language = LANGUAGES[(label.textContent ?? '').trim()];
		if (!language || language === shown) return;
		shown = language;
		void loadTables().then((tables) => {
			if (!rtlTableOf.has(preview)) rtlTableOf.set(preview, chooseTable(tables, previewParts(preview)) ?? null);
			writeLanguage(preview, rtlTableOf.get(preview) ?? undefined, language);
			if (language === 'ar') shownLanguage.delete(preview);
			else if (!shownLanguage.size) {
				shownLanguage.set(preview, language);
				rewrite.observe(document.body, { childList: true, characterData: true, subtree: true });
			} else shownLanguage.set(preview, language);
			rewrite.takeRecords();
		});
	}).observe(label, { childList: true, characterData: true, subtree: true });
}
const rtlWatch = (target: Element): boolean => {
	const selector = target.closest('[data-slot="component-preview"]')?.querySelector('[data-name="language-selector"]');
	if (selector) watchLanguage(selector);
	return false;
};
const rtlPreview: Part = { pointerdown: rtlWatch, focusin: rtlWatch, keydown: rtlWatch };

// components/docs-toc.tsx's useActiveItem: the heading crossing the top fifth of the viewport marks its link active.
// components/docs-toc.tsx's useActiveItem: an IntersectionObserver per page over its headings, starting with no item
// active. A page shown in place (or by Back) keeps the list where both pages have one, so the list is synced again then.
const observers = new Map<Element, IntersectionObserver>();
const observedLinks = new WeakSet<Element>();
function syncToc(list: Element): void {
	observers.get(list)?.disconnect();
	const links = [...list.querySelectorAll<HTMLAnchorElement>(':scope > a[data-depth][href^="#"]')];
	for (const link of links) observedLinks.add(link);
	for (const link of links) link.setAttribute('data-active', 'false');
	const observer = new IntersectionObserver(
		(entries) => {
			for (const entry of entries) {
				if (!entry.isIntersecting) continue;
				for (const link of links) link.setAttribute('data-active', String(link.getAttribute('href') === `#${entry.target.id}`));
			}
		},
		{ rootMargin: '0% 0% -80% 0%' },
	);
	for (const link of links) {
		const heading = document.getElementById(decodeURIComponent(link.getAttribute('href')!.slice(1)));
		if (heading) observer.observe(heading);
	}
	observers.set(list, observer);
}
function syncTocs(): void {
	for (const list of [...observers.keys()]) {
		if (!list.isConnected) {
			observers.get(list)!.disconnect();
			observers.delete(list);
		} else syncToc(list);
	}
}
const navigation = (globalThis as { navigation?: EventTarget }).navigation;
navigation?.addEventListener('navigatesuccess', syncTocs);
addEventListener('popstate', () => queueMicrotask(syncTocs));
const docsToc: Part = {
	mount(el) {
		const list = el.parentElement;
		if (!list || !(el instanceof HTMLAnchorElement) || !el.getAttribute('href')?.startsWith('#')) return;
		// A link the list's observer has not seen is a page shown in place or by Back: the list follows that page now.
		if (!observers.has(list) || !observedLinks.has(el)) syncToc(list);
	},
};

// components/command-menu.tsx: the docs search palette's Command filter (the value and keywords containing the search),
// each item's keywords as CommandMenuItem passes them, and runCommand closing the dialog before the item's action; ⌘K
// and / toggle it. The demos' Commands keep cmdk's command-score.
const groupOf = (item: HTMLElement) => item.closest('[cmdk-group]')?.querySelector('[cmdk-group-heading]')?.textContent ?? '';
configure({
	applies: (root) => root.querySelector('[cmdk-input]')?.getAttribute('placeholder') === 'Search documentation...',
	filter: (value, search, keywords) => (`${value} ${keywords.join(' ')}`.toLowerCase().includes(search.toLowerCase()) ? 1 : 0),
	keywords: (item) => {
		const value = item.getAttribute('data-value') ?? '';
		const text = (item.textContent ?? '').trim();
		const group = groupOf(item);
		if (group === 'Pages') return ['nav', 'navigation', text.toLowerCase()];
		if (group === 'Styles') return ['style', 'preset', text];
		if (group === 'Blocks') return ['block', value, text];
		if (group === 'Search Results') return [text];
		if (value.startsWith('bg-') || /^\w+-\d+$/.test(value)) return ['color', value];
		// a docs page: a component page is drawn with the dashed circle and takes "component"
		return item.querySelector('.rounded-full.border-dashed') ? ['component'] : [];
	},
	beforeChoose: (item) => closeContaining(item),
});
const commandMenu: Part = {
	keydown(target, event) {
		if (!((event.key === 'k' && (event.metaKey || event.ctrlKey)) || event.key === '/') || isEditable(target)) return false;
		const trigger = document.querySelector<HTMLElement>('[data-slot="dialog-trigger"][aria-controls]');
		if (!trigger) return false;
		event.preventDefault();
		toggle(trigger);
		return true;
	},
};

// hooks/use-config.ts: CodeBlockCommand's package manager and CodeTabs' installation type are one jotai atom kept in
// localStorage "config": choosing a tab in one such list chooses it in every list of the page, and is kept.
const CONFIG_KEY = 'config';
const CONFIG_DEFAULT = { style: 'new-york-v4', packageManager: 'pnpm', installationType: 'cli' };
const SHARED: Readonly<Record<string, readonly string[]>> = { packageManager: ['pnpm', 'npm', 'yarn', 'bun'], installationType: ['cli', 'manual'] };
const synthetic = new WeakSet<Event>();
const tabValue = (tab: Element) => /-content-(.+)$/.exec(tab.getAttribute('aria-controls') ?? '')?.[1];
function sharedKey(list: Element): string | undefined {
	const values = [...list.querySelectorAll('[role="tab"]')].map(tabValue);
	return Object.keys(SHARED).find((k) => values.length > 0 && values.every((v) => v && SHARED[k]!.includes(v)));
}
function readConfig(): Record<string, string> {
	try {
		return { ...CONFIG_DEFAULT, ...(JSON.parse(localStorage.getItem(CONFIG_KEY) ?? '{}') as Record<string, string>) };
	} catch {
		return { ...CONFIG_DEFAULT };
	}
}
// Each list's own tab state is Markless's: another list is switched by the press its trigger handles.
function chooseEverywhere(key: string, value: string): void {
	for (const list of document.querySelectorAll('[role="tablist"]')) {
		if (sharedKey(list) !== key) continue;
		const tab = [...list.querySelectorAll<HTMLElement>('[role="tab"]')].find((t) => tabValue(t) === value);
		if (!tab || tab.getAttribute('aria-selected') === 'true') continue;
		const press = new MouseEvent('mousedown', { bubbles: true, button: 0 });
		synthetic.add(press);
		tab.dispatchEvent(press);
	}
}
function choose(target: Element, event: Event): boolean {
	if (synthetic.has(event)) return false;
	const tab = target.closest('[role="tab"]');
	const list = tab?.closest('[role="tablist"]');
	const key = list && sharedKey(list);
	const value = tab && tabValue(tab);
	// Radix Tabs call onValueChange only for a tab not already chosen: the atom, and localStorage, are left alone.
	if (!key || !value || tab.getAttribute('aria-selected') === 'true') return false;
	queueMicrotask(() => {
		chooseEverywhere(key, value);
		const config = readConfig();
		if (config[key] === value && localStorage.getItem(CONFIG_KEY) !== null) return;
		localStorage.setItem(CONFIG_KEY, JSON.stringify({ ...config, [key]: value }));
	});
	return false;
}
const sharedTabs: Part = {
	pointerdown(target, event) {
		return event.button === 0 ? choose(target, event) : false;
	},
	keydown(target, event) {
		return event.key === 'Enter' || event.key === ' ' ? choose(target, event) : false;
	},
	// Radix Tabs activate the tab focus moves to (the arrows).
	focusin(target, event) {
		return choose(target, event);
	},
	// Once a docs page shows (its sidebar mounts), the kept choices apply to every list (a mount per tab would give
	// each tab a visibility handler).
	mount(el) {
		if (!el.hasAttribute('data-docs-sidebar-content') || localStorage.getItem(CONFIG_KEY) === null) return;
		const config = readConfig();
		for (const key of Object.keys(SHARED)) if (config[key]) chooseEverywhere(key, config[key]!);
	},
};

// components/chart-iframe.tsx: a chart's frame is opacity-0 until its onLoad, then opacity-100 (the capture holds either).
const frameLoaded = (frame: HTMLIFrameElement): boolean | undefined => {
	const doc = frame.contentDocument;
	return doc ? doc.URL !== 'about:blank' && doc.readyState === 'complete' : undefined;
};
const showFrame = (frame: HTMLIFrameElement, shown: boolean) => frame.classList.replace(shown ? 'opacity-0' : 'opacity-100', shown ? 'opacity-100' : 'opacity-0');
const chartFrame: Part = {
	mount(el) {
		if (!(el instanceof HTMLIFrameElement) || !el.classList.contains('transition-opacity') || !(el.classList.contains('opacity-0') || el.classList.contains('opacity-100'))) return;
		el.addEventListener('load', () => showFrame(el, true));
		const loaded = frameLoaded(el);
		if (loaded) showFrame(el, true);
		else if (loaded === false) {
			// The old frame starts transparent: one captured shown goes there without fading out.
			el.style.transition = 'none';
			showFrame(el, false);
			void getComputedStyle(el).opacity;
			el.style.removeProperty('transition');
		}
	},
};

// registry/*/ui/sidebar.tsx's SidebarProvider: ⌘B or Ctrl+B toggles the sidebar, as its trigger does.
const sidebarShortcut: Part = {
	keydown(_target, event) {
		if (event.key !== 'b' || !(event.metaKey || event.ctrlKey)) return false;
		const trigger = document.querySelector<HTMLElement>('[data-slot="sidebar-trigger"]');
		if (!trigger) return false;
		event.preventDefault();
		trigger.click();
		return true;
	},
};

// examples/*/carousel-api.tsx: "Slide {current} of {count}" under the carousel, from the Embla api's select event (the
// carousel port dispatches carouselselect on the carousel).
document.addEventListener('carouselselect', (event) => {
	const { index, count } = (event as CustomEvent<{ index: number; count: number }>).detail;
	const caption = (event.target as Element).nextElementSibling;
	if (!caption || !/^Slide \d+ of \d+$/.test((caption.textContent ?? '').trim())) return;
	const texts = [...caption.childNodes].filter((n): n is Text => n.nodeType === Node.TEXT_NODE);
	texts.forEach((t, i) => (t.data = i === 0 ? `Slide ${index + 1} of ${count}` : ''));
});

export const SITE_PARTS: readonly Part[] = [commandMenu, modeSwitcher, copyPage, copyButton, viewCode, refreshPreview, rtlPreview, docsSidebar, docsToc, sidebarShortcut, sharedTabs, chartFrame];
