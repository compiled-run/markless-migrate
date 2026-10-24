import type { ThemeOptions, ThemeToggle } from '../../parts/next-themes.ts';

/**
 * next-themes' options, read from the inline script its ThemeProvider writes into every page: the script is called with
 * (attribute, storageKey, defaultTheme, forcedTheme, themes, value, enableSystem, enableColorScheme). A forced theme or a
 * value map (theme names written as other classes) is not a toggle this reads.
 */
export function nextThemesOptions(script: string, disableTransitionOnChange = false): ThemeOptions | undefined {
	if (!script.includes('document.documentElement') || !script.includes('prefers-color-scheme: dark') || !script.includes('localStorage.getItem(')) return undefined;
	const call = /\}\)\((.*)\)\s*;?\s*$/s.exec(script);
	let args: unknown[];
	try {
		args = JSON.parse(`[${call?.[1] ?? ''}]`) as unknown[];
	} catch {
		return undefined;
	}
	const [attribute, storageKey, defaultTheme, forcedTheme, themes, value, enableSystem, enableColorScheme] = args;
	const attr = Array.isArray(attribute) ? attribute[0] : attribute;
	if (args.length !== 8 || forcedTheme || value || typeof storageKey !== 'string' || typeof defaultTheme !== 'string' || !Array.isArray(themes)) return undefined;
	if (attr !== 'class' && !(typeof attr === 'string' && attr.startsWith('data-'))) return undefined;
	return { attribute: attr as ThemeOptions['attribute'], storageKey, defaultTheme, themes: themes as string[], enableSystem: enableSystem === true, enableColorScheme: enableColorScheme === true, disableTransitionOnChange };
}

/** The site's theme toggle from `lib/site/controls.json` (`"action": "theme"`), with ThemeProvider's disableTransitionOnChange, which its script does not carry. */
export function themeToggleOf(listed: readonly Record<string, unknown>[]): (ThemeToggle & { readonly disableTransitionOnChange?: boolean }) | undefined {
	const entry = listed.find((c) => c.action === 'theme' && typeof c.name === 'string');
	return entry as (ThemeToggle & { readonly disableTransitionOnChange?: boolean }) | undefined;
}
