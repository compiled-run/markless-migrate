// What the old app's providers read from their cookies on load (SidebarProvider, LayoutProvider, ThemeProvider,
// DirectionProvider), as one cell the Shell renders from. The server renders the defaults (prefs.ts's DEFAULT_PREFS) for every visitor;
// public/parity/layout-prefs.js and the document's head script show the saved values before the first paint, and
// SkipToMain takes them into the cell once the page is idle. It is a component of its own: code that runs at load
// loads the component it sits on, and the Shell's is the whole layout.
import { shared, state } from '@markless/core';
import type { LayoutPrefs } from './prefs.ts';
import { savedPrefs } from './shell-behaviour.ts';

export const shellPrefs = shared(
	() => {
		const cells = state({ open: true, variant: 'inset', collapsible: 'icon', dir: 'ltr', theme: 'system' } as { -readonly [K in keyof LayoutPrefs]: LayoutPrefs[K] });
		return { ...cells };
	},
	{ scope: 'page' },
);

/** The layout's skip link (components/skip-to-main.tsx in the old app). */
export function SkipToMain() @{
	const prefs = shellPrefs();
	<a
		class="fixed inset-s-44 z-999 -translate-y-52 bg-primary px-4 py-2 text-sm font-medium whitespace-nowrap text-primary-foreground opacity-95 shadow-sm transition hover:bg-primary/90 focus:translate-y-3 focus:transform focus-visible:ring-1 focus-visible:ring-ring"
		href="#content"
		onIdle={() => {
			const saved = savedPrefs();
			const open = saved.open;
			const variant = saved.variant;
			const collapsible = saved.collapsible;
			const dir = saved.dir;
			const theme = saved.theme;
			prefs.open = open;
			prefs.variant = variant;
			prefs.collapsible = collapsible;
			prefs.dir = dir;
			prefs.theme = theme;
		}}
	>Skip to Main</a>
}
