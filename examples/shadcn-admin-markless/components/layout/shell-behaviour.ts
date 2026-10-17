// What the old app's providers did to the document: the theme class on <html> with its cookie
// (ThemeProvider) and the sidebar's open state cookie (SidebarProvider).
const YEAR = 60 * 60 * 24 * 365;
const WEEK = 60 * 60 * 24 * 7;

export function applyTheme(theme: 'light' | 'dark' | 'system'): void {
	document.cookie = `vite-ui-theme=${theme}; path=/; max-age=${YEAR}`;
	const resolved = theme === 'system' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : theme;
	document.documentElement.classList.remove('light', 'dark');
	document.documentElement.classList.add(resolved);
}

export function rememberSidebar(open: boolean): void {
	document.cookie = `sidebar_state=${open}; path=/; max-age=${WEEK}`;
}
