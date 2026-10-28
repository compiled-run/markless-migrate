// next-themes 0.4 setTheme, as its ThemeProvider applies it: the theme stored under the storage key, the attribute (here
// the class) on <html> swapped, color-scheme set, and transitions held off for the swap when disableTransitionOnChange.

export interface ThemeOptions {
	readonly attribute: 'class' | `data-${string}`;
	readonly themes: readonly string[];
	readonly storageKey: string;
	readonly defaultTheme: string;
	readonly enableSystem: boolean;
	readonly enableColorScheme: boolean;
	readonly disableTransitionOnChange: boolean;
}

const COLOR_SCHEMES = ['light', 'dark'];
const systemTheme = () => (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');

export function storedTheme(options: ThemeOptions): string {
	try {
		return localStorage.getItem(options.storageKey) || options.defaultTheme;
	} catch {
		return options.defaultTheme;
	}
}

export function resolvedTheme(options: ThemeOptions): string {
	const theme = storedTheme(options);
	return theme === 'system' && options.enableSystem ? systemTheme() : theme;
}

function holdTransitions(): () => void {
	const style = document.createElement('style');
	style.appendChild(document.createTextNode('*,*::before,*::after{-webkit-transition:none!important;-moz-transition:none!important;-o-transition:none!important;-ms-transition:none!important;transition:none!important}'));
	document.head.appendChild(style);
	return () => {
		window.getComputedStyle(document.body);
		setTimeout(() => document.head.removeChild(style), 1);
	};
}

function apply(theme: string, options: ThemeOptions): void {
	const resolved = theme === 'system' && options.enableSystem ? systemTheme() : theme;
	const release = options.disableTransitionOnChange ? holdTransitions() : null;
	const root = document.documentElement;
	if (options.attribute === 'class') {
		root.classList.remove(...options.themes);
		root.classList.add(resolved);
	} else root.setAttribute(options.attribute, resolved);
	if (options.enableColorScheme) {
		const fallback = COLOR_SCHEMES.includes(options.defaultTheme) ? options.defaultTheme : null;
		root.style.colorScheme = (COLOR_SCHEMES.includes(resolved) ? resolved : fallback) ?? '';
	}
	release?.();
}

export function setTheme(theme: string, options: ThemeOptions): void {
	try {
		localStorage.setItem(options.storageKey, theme);
	} catch {}
	apply(theme, options);
}

/**
 * ThemeProvider's listeners: another document of the site switching the theme (the storage event) switches it here, and
 * with the system theme chosen a change of the OS's scheme is applied.
 */
export function watchSystemTheme(options: ThemeOptions): void {
	window.addEventListener('storage', (event) => {
		if (event.key !== options.storageKey) return;
		// A cleared theme goes back to the default, stored again (setTheme); any other is only applied (setThemeState).
		if (event.newValue) apply(event.newValue, options);
		else setTheme(options.defaultTheme, options);
	});
	if (!options.enableSystem) return;
	matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
		if (storedTheme(options) === 'system') apply('system', options);
	});
}

/** The site's theme toggle as `lib/site/controls.json` names it: `{ "action": "theme", "name": "Toggle theme", "key": "d" }`. */
export interface ThemeToggle {
	/** The toggle's accessible name: its aria-label, or its text. */
	readonly name: string;
	/** A key that toggles too, outside text fields and without modifiers (ThemeProvider's D shortcut on ui.shadcn.com). */
	readonly key?: string;
	/** `<meta name="theme-color">` per resolved theme, as the site's own hook sets it. */
	readonly metaColors?: Readonly<Record<string, string>>;
}

// Runs inline in the head, before any module: so it carries everything it uses, as next-themes' own inline script does.
function earlyToggle(o: ThemeOptions & ThemeToggle): void {
	const flip = (event: Event) => {
		(event as Event & { __mmTheme?: boolean }).__mmTheme = true;
		let stored: string | null = null;
		try {
			stored = localStorage.getItem(o.storageKey);
		} catch {}
		const theme = stored || o.defaultTheme;
		const system = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
		const next = (theme === 'system' && o.enableSystem ? system : theme) === 'dark' ? 'light' : 'dark';
		try {
			localStorage.setItem(o.storageKey, next);
		} catch {}
		const root = document.documentElement;
		let release: (() => void) | undefined;
		if (o.disableTransitionOnChange) {
			const style = document.createElement('style');
			style.appendChild(document.createTextNode('*,*::before,*::after{transition:none!important}'));
			document.head.appendChild(style);
			release = () => {
				getComputedStyle(document.body);
				setTimeout(() => document.head.removeChild(style), 1);
			};
		}
		if (o.attribute === 'class') {
			root.classList.remove(...o.themes);
			root.classList.add(next);
		} else root.setAttribute(o.attribute, next);
		if (o.enableColorScheme) root.style.colorScheme = next;
		if (o.metaColors?.[next]) document.querySelector('meta[name="theme-color"]')?.setAttribute('content', o.metaColors[next]!);
		release?.();
	};
	const isToggle = (target: EventTarget | null) => {
		const button = target instanceof Element ? target.closest('button') : null;
		return !!button && (button.getAttribute('aria-label') ?? button.textContent ?? '').trim() === o.name;
	};
	// The site's toggle sets theme-color to its resolved theme once mounted and whenever that changes (useMetaColor).
	const metaColors = o.metaColors;
	if (metaColors) {
		const sync = () => {
			let stored: string | null = null;
			try {
				stored = localStorage.getItem(o.storageKey);
			} catch {}
			const theme = stored || o.defaultTheme;
			const resolved = theme === 'system' && o.enableSystem ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : theme;
			document.querySelector('meta[name="theme-color"]')?.setAttribute('content', resolved === 'dark' ? metaColors.dark! : metaColors.light!);
		};
		if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', sync);
		else sync();
		matchMedia('(prefers-color-scheme: dark)').addEventListener('change', sync);
	}
	document.addEventListener('click', (event) => isToggle(event.target) && flip(event), true);
	// On the window, after the document's listeners: a key a part stopped, as its library does, never reaches it.
	if (o.key)
		window.addEventListener('keydown', (event) => {
			const t = event.target;
			const editable = t instanceof HTMLElement && (t.isContentEditable || t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement);
			if (event.key.toLowerCase() !== o.key || event.metaKey || event.ctrlKey || event.altKey || editable || (event as Event & { __mmTheme?: boolean }).__mmTheme) return;
			event.preventDefault();
			flip(event);
		});
}

/**
 * The theme toggle answers from the page's first paint: an inline script in the head switches the theme in the click's
 * own frame, whether or not the page's code has arrived, and marks the event; the site's part then only does what else
 * its toggle does (`switchedFor`). A key reaches the inline script after the parts: one that switched the theme marks
 * the event (`markSwitched`).
 */
export const earlyThemeScript = (options: ThemeOptions, toggle: ThemeToggle): string => `(${earlyToggle.toString()})(${JSON.stringify({ ...options, ...toggle, key: toggle.key?.toLowerCase() })});`;

/** The theme was already switched for this event: switching it again would switch it back. */
export const switchedFor = (event: Event): boolean => Boolean((event as Event & { __mmTheme?: boolean }).__mmTheme);
export const markSwitched = (event: Event): void => {
	(event as Event & { __mmTheme?: boolean }).__mmTheme = true;
};
