import type { Part } from '../parts/index.ts';
import { close, show } from '../parts/qwik-ui/modal.ts';
import { startPagefind } from './pagefind-search.ts';

// qwikui.com's own client components (apps/website/src/components) on Markless. Each control is found by the handler it
// ran on the old page (data-mm-qwik, from the old build's q-manifest.json) and what that handler closed over
// (data-mm-qwik-captures, from the page's paused state). Library behaviour comes from the ports in ../parts.

const on = (event: string, handler: string) => `[data-mm-qwik~="${event}:${handler}"]`;
const capturedOf = (el: Element): string[] => JSON.parse(el.getAttribute('data-mm-qwik-captures') ?? '[]') as string[];

// @qwik-ui/themes' ThemeProvider as root.tsx configures it: attribute "class", enableSystem false, storageKey "theme", and
// every value of @qwik-ui/utils' theme enums as its themes. Its signal starts empty on every page load.
const FONTS = ['font-mono', 'font-sans', 'font-serif', 'font-source-serif-pro', 'font-londra-shadow', 'font-rubik-doodle-shadow'];
const MODES = ['light', 'dark'];
const STYLES = ['simple', 'brutalist', 'neumorphic'];
const BASES = ['base-slate', 'base-gray', 'base-zinc', 'base-neutral', 'base-stone'];
const COLORS = ['slate', 'gray', 'zinc', 'neutral', 'stone', 'red', 'orange', 'amber', 'yellow', 'lime', 'green', 'emerald', 'teal', 'cyan', 'sky', 'blue', 'indigo', 'violet', 'purple', 'fuchsia', 'pink', 'rose'];
const PRIMARIES = [100, 200, 300, 400, 500, 600, 700, 800, 900].flatMap((n) => COLORS.map((c) => `primary-${c}-${n}`));
const RADIUSES = ['border-radius-0', 'border-radius-dot-25', 'border-radius-dot-50', 'border-radius-dot-75', 'border-radius-1'];
const THEMES = [...FONTS, ...MODES, ...STYLES, ...BASES, ...PRIMARIES, ...RADIUSES];

let theme = '';

function setTheme(next: string): void {
	theme = next;
	const root = document.documentElement;
	root.classList.remove(...THEMES);
	if (next) root.classList.add(...next.split(' '));
	localStorage.setItem('theme', next);
	render();
}

interface Config {
	font: string;
	mode: string;
	style: string;
	baseColor: string;
	primaryColor: string;
	borderRadius: string;
}

// make-it-yours.tsx's themeComputedObjectSig.
function config(): Config {
	if (!theme || theme === 'light' || theme === 'dark') return { font: 'font-sans', mode: theme === 'dark' ? 'dark' : 'light', style: 'simple', baseColor: 'base-slate', primaryColor: 'primary-cyan-600', borderRadius: 'border-radius-0' };
	const [font = '', mode = '', style = '', baseColor = '', primaryColor = '', borderRadius = ''] = theme.split(' ');
	return { font, mode, style, baseColor, primaryColor, borderRadius };
}
const classes = (c: Config) => [c.font, c.mode, c.style, c.baseColor, c.primaryColor, c.borderRadius].join(' ');

// What the panel and the header render from the theme, switched by class as Qwik re-rendered them.
const NEUTRAL = /^primary-(slate|gray|zinc|neutral|stone)-(800|900)$/;
// Every Make it yours swatch and radius button names what it applies in its captures; the kind is in the value.
const PANEL_BUTTON = `${on('click', 'make-it-yours.tsx_make_it_yours_component_div_div_Button_onClick')}, ${on('click', 'make-it-yours.tsx_make_it_yours_component_div_div_div_Button_onClick')}, ${on('click', 'make-it-yours.tsx_make_it_yours_component_div_div_div_Button_onClick_1')}`;
const kindOf = (value: string): keyof Config | undefined => (value.startsWith('base-') ? 'baseColor' : value.startsWith('primary-') ? 'primaryColor' : value.startsWith('border-radius') ? 'borderRadius' : undefined);
const valueOf = (el: Element) => capturedOf(el).find((v) => kindOf(v) !== undefined);

function render(): void {
	const c = config();
	const dark = theme.includes('dark');
	for (const button of document.querySelectorAll<HTMLElement>(PANEL_BUTTON)) {
		const value = valueOf(button) ?? '';
		const kind = kindOf(value);
		const on = kind !== undefined && c[kind] === value;
		if (kind === 'baseColor') button.classList.toggle('border-2', on), button.classList.toggle('border-ring', on);
		else if (kind === 'borderRadius') button.classList.toggle('mb-2', on), button.classList.toggle('border-ring', on);
		else if (kind === 'primaryColor') {
			button.classList.toggle('border', on);
			button.classList.toggle('border-ring', on);
			// A neutral 800 or 900 shows its 200 or 100 swatch in dark mode.
			const neutral = NEUTRAL.exec(value);
			const swatch = button.firstElementChild;
			if (neutral && swatch) {
				for (const n of ['100', '200', '800', '900']) swatch.classList.remove(`bg-${neutral[1]}-${n}`);
				swatch.classList.add(`bg-${neutral[1]}-${dark ? (neutral[2] === '800' ? '200' : '100') : neutral[2]}`);
			}
		}
	}
	for (const select of document.querySelectorAll<HTMLSelectElement>(`select${on('change', 'make-it-yours.tsx_make_it_yours_component_div_select_onChange')}`)) select.value = c.style;
	for (const box of document.querySelectorAll<HTMLInputElement>(`input${on('click', 'make-it-yours.tsx_make_it_yours_component_div_div_input_onClick')}`)) box.checked = c.mode === 'dark';
	// header.tsx: the bar's bottom border doubles with the brutalist style.
	document.querySelector('header')?.parentElement?.classList.toggle('border-b-2', theme.includes('brutalist'));
}

// The document's inline theme script sets color-scheme from storage on every page load (a plain light or dark theme;
// none for a full theme). qwikui.com follows its links with page loads, so each page gets it; here pages arrive in
// place and the script does not run again, so each arrival applies the same rule.
function colorSchemeAsOnLoad(): void {
	const stored = localStorage.getItem('theme');
	const style = document.documentElement.style;
	if (stored === 'light' || stored === 'dark' || !stored) style.colorScheme = stored || 'light';
	else style.removeProperty('color-scheme');
}
// A page qwikui.com loads whole runs no transition into its new state; here the sidebar and header stay, and their links'
// classes change in place. Transitions are held from the click on a link until two frames after the page arrives.
const ARRIVING = 'data-mm-arriving';
function holdTransitions(): void {
	if (!document.head.querySelector(`style[${ARRIVING}]`)) {
		const style = document.createElement('style');
		style.setAttribute(ARRIVING, '');
		style.append(document.createTextNode(`[${ARRIVING}] *, [${ARRIVING}] *::before, [${ARRIVING}] *::after { transition: none !important; }`));
		document.head.appendChild(style);
	}
	document.documentElement.setAttribute(ARRIVING, '');
	setTimeout(() => document.documentElement.removeAttribute(ARRIVING), 3000);
}
function onArrival(): void {
	requestAnimationFrame(() =>
		requestAnimationFrame(() => {
			colorSchemeAsOnLoad();
			document.documentElement.removeAttribute(ARRIVING);
		}),
	);
}
let watchingArrivals = false;
function watchArrivals(): void {
	if (watchingArrivals) return;
	watchingArrivals = true;
	for (const name of ['pushState', 'replaceState'] as const) {
		const original = history[name].bind(history);
		history[name] = (...args: Parameters<History['pushState']>) => {
			const before = location.pathname;
			original(...args);
			if (location.pathname !== before) onArrival();
		};
	}
	window.addEventListener('popstate', () => {
		holdTransitions();
		onArrival();
	});
	document.addEventListener(
		'click',
		(event) => {
			const link = (event.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
			if (link && link.origin === location.origin && link.pathname !== location.pathname && !link.target && !event.defaultPrevented) holdTransitions();
		},
		true,
	);
}

const themeControls: Part = {
	idle() {
		watchArrivals();
	},
	click(target) {
		const el = target.closest<HTMLElement>('[data-mm-qwik]');
		if (!el) return false;
		if (el.matches(on('click', 'header.tsx_DarkModeToggle_component_Button_onClick'))) {
			const current = theme || 'light';
			setTheme(current.split(' ').map((w) => (w.includes('light') ? w.replace('light', 'dark') : w.replace('dark', 'light'))).join(' '));
			return true;
		}
		const c = config();
		const value = el.matches(PANEL_BUTTON) ? valueOf(el) : undefined;
		const kind = value ? kindOf(value) : undefined;
		if (kind && value) c[kind] = value;
		else if (el.matches(on('click', 'make-it-yours.tsx_make_it_yours_component_div_div_input_onClick'))) c.mode = c.mode.includes('light') ? 'dark' : 'light';
		else if (el.matches(on('click', 'make-it-yours.tsx_make_it_yours_component_footer_Button_onClick'))) {
			setTheme(theme.includes('dark') ? 'dark' : 'light');
			return true;
		} else return false;
		setTheme(classes(c));
		return true;
	},
	input(target) {
		if (!(target instanceof HTMLSelectElement) || !target.matches(on('change', 'make-it-yours.tsx_make_it_yours_component_div_select_onChange'))) return false;
		const c = config();
		c.font = target.value === 'brutalist' ? 'font-mono' : 'font-sans';
		c.style = target.value;
		setTheme(classes(c));
		return true;
	},
};

// header.tsx: the menu button toggles the mobile sidebar (a Modal bound to isSidebarOpenedSig), its X closes it.
const sidebarOf = (el: Element) => el.closest('header')?.parentElement?.querySelector<HTMLDialogElement>(':scope > dialog');
const mobileNav: Part = {
	click(target) {
		const open = target.closest(on('click', 'header.tsx_header_component_header_div_div_Button_onClick'));
		if (open) {
			const dialog = sidebarOf(open);
			if (dialog) dialog.open ? close(dialog) : show(dialog);
			return !!dialog;
		}
		const x = target.closest(on('click', 'header.tsx_header_component_button_onClick'));
		const dialog = x?.closest('dialog');
		if (!dialog) return false;
		close(dialog);
		return true;
	},
};

// copy-css-config.tsx: Copy code sets the theme from storage (the default, light, when there is none), opens the config
// dialog beside it and shows the theme's CSS, highlighted, in it (theme-css.tsrx); its X closes it.
let themeCss = '';
const cssConfig: Part = {
	click(target) {
		const open = target.closest(on('click', 'copy-css-config.tsx_copy_css_config_component_Button_onClick'));
		const dialog = open?.parentElement?.querySelector<HTMLDialogElement>(':scope > dialog');
		if (open && dialog) {
			setTheme(localStorage.getItem('theme') ?? 'light');
			void import('./theme-css/highlight.ts').then(({ themeCssLines }) => themeCssLines(theme)).then(({ css, lines }) => {
				themeCss = css;
				dialog.querySelector('[data-mm-theme-css]')?.dispatchEvent(new CustomEvent('mmthemecss', { detail: lines }));
			});
			show(dialog);
			return true;
		}
		const x = target.closest(on('click', 'copy-css-config.tsx_copy_css_config_component_button_onClick'));
		const owner = x?.closest('dialog');
		if (!owner) return false;
		close(owner);
		return true;
	},
};

// code-copy.tsx: copies its code prop; for 4 s the button reads "Copied to Clipboard" and lucide's Copy turns into Check
// (the icon's shapes switched by attribute: the svg is Markless's).
const LUCIDE_CHECK = 'M20 6 9 17l-5-5';
const copyTimers = new WeakMap<Element, ReturnType<typeof setTimeout>>();
function copyIcon(button: HTMLElement, check: boolean): void {
	const svg = button.querySelector('svg');
	if (!svg) return;
	const path = svg.querySelector('path');
	const saved = path?.getAttribute('data-mm-d') ?? path?.getAttribute('d') ?? '';
	if (path && !path.hasAttribute('data-mm-d')) path.setAttribute('data-mm-d', saved);
	path?.setAttribute('d', check ? LUCIDE_CHECK : saved);
	for (const el of svg.children) if (el !== path) (el as SVGElement).style.display = check ? 'none' : '';
}
const codeCopy: Part = {
	click(target) {
		const button = target.closest<HTMLElement>(on('click', 'code-copy.tsx_CodeCopy_component_Button_onClick'));
		if (!button) return false;
		const inConfig = button.closest('dialog')?.querySelector('[data-mm-theme-css]');
		void navigator.clipboard?.writeText(inConfig ? themeCss : (capturedOf(button)[0] ?? ''));
		button.title = 'Copied to Clipboard';
		copyIcon(button, true);
		clearTimeout(copyTimers.get(button));
		copyTimers.set(button, setTimeout(() => {
			button.title = 'Copy to Clipboard';
			copyIcon(button, false);
		}, 4000));
		return true;
	},
};

// status-banner.tsx: the X fades the banner out, sliding the page up by its height, and hides it once the fade ends.
const statusBanner: Part = {
	click(target) {
		const button = target.closest(on('click', 'status-banner.tsx_StatusBanner_component_Fragment_div_button_onClick'));
		const banner = button?.parentElement;
		if (!banner) return false;
		banner.style.setProperty('--dynamic-banner-height', `-${banner.offsetHeight + 64}px`);
		banner.classList.toggle('fade');
		if (!banner.dataset.mmFading) {
			banner.dataset.mmFading = '';
			banner.addEventListener('animationend', () => (banner.hidden = true));
		}
		return true;
	},
};

// toc.tsx: a contents link scrolls its heading to 90 px below the top; while the page scrolls, the heading crossing the
// top 15% of the viewport marks its link (font-medium text-foreground, the others text-muted-foreground).
const TOC_LINK = on('click', 'toc.tsx_Anchor_component_a_onClick');
let observing = false;
function watchHeadings(): void {
	if (observing) return;
	const links = [...document.querySelectorAll<HTMLAnchorElement>(TOC_LINK)];
	if (!links.length) return;
	observing = true;
	const observer = new IntersectionObserver(
		(entries) => {
			for (const entry of entries) {
				if (!entry.isIntersecting) continue;
				for (const a of document.querySelectorAll<HTMLAnchorElement>(TOC_LINK)) {
					const active = a.getAttribute('href') === `#${entry.target.id}`;
					a.classList.toggle('font-medium', active);
					a.classList.toggle('text-foreground', active);
					a.classList.toggle('text-muted-foreground', !active);
				}
			}
		},
		{ rootMargin: '0% 0% -85% 0%' },
	);
	for (const a of links) {
		const heading = document.getElementById(decodeURIComponent((a.getAttribute('href') ?? '').slice(1)));
		if (heading) observer.observe(heading);
	}
}
const toc: Part = {
	click(target, event) {
		const a = target.closest<HTMLAnchorElement>(TOC_LINK);
		const heading = a && document.getElementById(decodeURIComponent((a.getAttribute('href') ?? '').slice(1)));
		if (!heading) return false;
		window.scrollTo({ top: heading.getBoundingClientRect().top + window.scrollY - 90, behavior: 'auto' });
		void event;
		return false;
	},
	idle() {
		window.addEventListener('scroll', watchHeadings, { once: true, passive: true });
	},
};

// search.tsx's SearchModal: Cmd+K anywhere toggles the search dialog; the first time it opens, by Cmd+K or its trigger,
// the page's script is asked to load Pagefind (its useTask$ on isOpen).
const searchDialog = () => document.querySelector('input[data-id="search"]')?.closest('dialog');
const searchShortcut: Part = {
	click(target) {
		const trigger = target.closest('button[aria-haspopup="dialog"]');
		const dialog = searchDialog();
		if (trigger && dialog && trigger.parentElement?.contains(dialog)) startPagefind();
		return false;
	},
	shortcut(_target, event) {
		if (event.key !== 'k' || !event.metaKey) return;
		const dialog = searchDialog();
		if (!dialog) return;
		if (dialog.open) close(dialog);
		else {
			startPagefind();
			show(dialog);
		}
	},
};

export const SITE_PARTS: readonly Part[] = [themeControls, mobileNav, cssConfig, codeCopy, statusBanner, toc, searchShortcut];
