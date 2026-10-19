// What the old app's providers did to the document: the theme class on <html> with its cookie (ThemeProvider),
// the sidebar's open state cookie (SidebarProvider), the layout cookies (LayoutProvider) and dir (DirectionProvider).
const YEAR = 60 * 60 * 24 * 365;
const WEEK = 60 * 60 * 24 * 7;

function setCookie(name: string, value: string, maxAge: number): void {
	document.cookie = `${name}=${value}; path=/; max-age=${maxAge}`;
}

function removeCookie(name: string): void {
	document.cookie = `${name}=; path=/; max-age=0`;
}

function resolveTheme(theme: string): void {
	const resolved = theme === 'system' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : theme;
	document.documentElement.classList.remove('light', 'dark');
	document.documentElement.classList.add(resolved);
}

export function applyTheme(theme: 'light' | 'dark' | 'system'): void {
	setCookie('vite-ui-theme', theme, YEAR);
	resolveTheme(theme);
}

export function resetTheme(): void {
	removeCookie('vite-ui-theme');
	resolveTheme('system');
}

export function rememberSidebar(open: boolean): void {
	setCookie('sidebar_state', String(open), WEEK);
}

export function rememberVariant(variant: string): void {
	setCookie('layout_variant', variant, WEEK);
}

export function rememberCollapsible(collapsible: string): void {
	setCookie('layout_collapsible', collapsible, WEEK);
}

export function applyDir(dir: 'ltr' | 'rtl'): void {
	setCookie('dir', dir, YEAR);
	document.documentElement.setAttribute('dir', dir);
}

export function resetDir(): void {
	removeCookie('dir');
	document.documentElement.setAttribute('dir', 'ltr');
}

/** The reset button that had focus is gone: Radix's focus scope sends focus to the dialog itself. */
export function focusDialogOf(event: Event): void {
	const dialog = event.target instanceof Element ? event.target.closest<HTMLElement>('[role=dialog]') : null;
	setTimeout(() => dialog?.focus());
}

/** SignOutDialog's confirm: the auth store's reset (its token cookie) and a replace to /sign-in, remembering where the user was. */
export function signOut(): void {
	removeCookie('thisisjustarandomstring');
	location.replace(`/sign-in?redirect=${encodeURIComponent(location.pathname + location.search + location.hash)}`);
}

/** Radix leaves focus on the page itself after this dialog closes. */
export function blurActive(): void {
	(document.activeElement as HTMLElement | null)?.blur();
}

/** Radix Presence unmounts closed content at once when no exit animation runs on it (reduced motion, animations off). */
export function exitDone(id: string): boolean {
	const el = document.getElementById(id);
	return !el || (el.dataset.state === 'closed' && getComputedStyle(el).animationName === 'none');
}
