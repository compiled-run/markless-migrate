// What the old app's providers read from cookies on load (SidebarProvider, LayoutProvider, ThemeProvider,
// DirectionProvider), read here from the request so the first paint already matches.
export type Theme = 'light' | 'dark' | 'system';
export type Variant = 'inset' | 'floating' | 'sidebar';
export type Collapsible = 'icon' | 'offcanvas' | 'none';
export type Direction = 'ltr' | 'rtl';

export interface LayoutPrefs {
	readonly open: boolean;
	readonly variant: Variant;
	readonly collapsible: Collapsible;
	readonly theme: Theme;
	readonly dir: Direction;
}

export const DEFAULT_VARIANT: Variant = 'inset';
export const DEFAULT_COLLAPSIBLE: Collapsible = 'icon';
export const DEFAULT_THEME: Theme = 'system';
export const DEFAULT_DIR: Direction = 'ltr';

export function cookieIn(header: string | null | undefined, name: string): string | undefined {
	const parts = `; ${header ?? ''}`.split(`; ${name}=`);
	return parts.length === 2 ? parts.pop()?.split(';').shift() : undefined;
}

export function layoutPrefs(header: string | null | undefined): LayoutPrefs {
	return {
		open: cookieIn(header, 'sidebar_state') !== 'false',
		variant: (cookieIn(header, 'layout_variant') as Variant) || DEFAULT_VARIANT,
		collapsible: (cookieIn(header, 'layout_collapsible') as Collapsible) || DEFAULT_COLLAPSIBLE,
		theme: (cookieIn(header, 'vite-ui-theme') as Theme) || DEFAULT_THEME,
		dir: (cookieIn(header, 'dir') as Direction) || DEFAULT_DIR,
	};
}
