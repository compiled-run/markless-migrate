// What the font and theme providers do when the appearance form changes them: the cookie, and the class on <html>.
const YEAR = 60 * 60 * 24 * 365;

export function setFont(font: string): void {
	document.cookie = `font=${font}; path=/; max-age=${YEAR}`;
	const root = document.documentElement;
	for (const cls of [...root.classList]) if (cls.startsWith('font-')) root.classList.remove(cls);
	root.classList.add(`font-${font}`);
}

export function setTheme(theme: string): void {
	document.cookie = `vite-ui-theme=${theme}; path=/; max-age=${YEAR}`;
	const resolved = theme === 'system' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : theme;
	document.documentElement.classList.remove('light', 'dark');
	document.documentElement.classList.add(resolved);
}
