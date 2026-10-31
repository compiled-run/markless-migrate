import { resolvedTheme, setTheme, storedTheme, type ThemeOptions } from '../parts/next-themes.ts';

// components/theme-provider.tsx: <NextThemesProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange enableColorScheme>
export const THEME: ThemeOptions = { attribute: 'class', themes: ['light', 'dark'], storageKey: 'theme', defaultTheme: 'system', enableSystem: true, enableColorScheme: true, disableTransitionOnChange: true };
// hooks/use-meta-color.ts
const META_THEME_COLORS = { light: '#ffffff', dark: '#0a0a0a' };

// useTheme's resolvedTheme is the theme this document applied: another document's switch stored a moment before (the
// preview of /create forwarding D after toggling itself) has not reached it yet.
export function toggleTheme(): void {
	const next = document.documentElement.classList.contains('dark') ? 'light' : 'dark';
	setTheme(next, THEME);
	document.querySelector('meta[name="theme-color"]')?.setAttribute('content', next === 'dark' ? META_THEME_COLORS.dark : META_THEME_COLORS.light);
}

/** A theme chosen by name (the docs' ModeToggle demo menu: Light, Dark, System), as next-themes' setTheme applies it. */
export function chooseTheme(theme: string): void {
	setTheme(theme, THEME);
	document.querySelector('meta[name="theme-color"]')?.setAttribute('content', resolvedTheme(THEME) === 'dark' ? META_THEME_COLORS.dark : META_THEME_COLORS.light);
}

/**
 * A page in an iframe that switched its own theme and then asked this one to switch (/typeset's preview): this one ends on
 * the theme it stored, as the old page's listener did with the theme it held from before the switch.
 */
export function followStoredTheme(): void {
	const theme = storedTheme(THEME);
	setTheme(theme, THEME);
	const resolved = resolvedTheme(THEME);
	document.querySelector('meta[name="theme-color"]')?.setAttribute('content', resolved === 'dark' ? META_THEME_COLORS.dark : META_THEME_COLORS.light);
}
