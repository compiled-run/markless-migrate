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
