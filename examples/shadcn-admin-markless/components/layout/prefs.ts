// What the old app's providers read from cookies on load (SidebarProvider, LayoutProvider, ThemeProvider,
// DirectionProvider). The old app read them in the browser, and so does the port: the server renders the defaults
// for every visitor, public/parity/layout-prefs.js puts the saved layout on the sidebar before it paints, and the
// Shell takes the saved values into its state once it shows.
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

export const DEFAULT_PREFS: LayoutPrefs = { open: true, variant: DEFAULT_VARIANT, collapsible: DEFAULT_COLLAPSIBLE, theme: DEFAULT_THEME, dir: DEFAULT_DIR };

export function layoutPrefs(header: string | null | undefined): LayoutPrefs {
	return {
		open: cookieIn(header, 'sidebar_state') !== 'false',
		variant: (cookieIn(header, 'layout_variant') as Variant) || DEFAULT_VARIANT,
		collapsible: (cookieIn(header, 'layout_collapsible') as Collapsible) || DEFAULT_COLLAPSIBLE,
		theme: (cookieIn(header, 'vite-ui-theme') as Theme) || DEFAULT_THEME,
		dir: (cookieIn(header, 'dir') as Direction) || DEFAULT_DIR,
	};
}
