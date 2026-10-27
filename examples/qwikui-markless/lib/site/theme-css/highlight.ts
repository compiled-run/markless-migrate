// The theme CSS the "Copy code" dialog shows, highlighted as copy-css-config.tsx's Highlight does: Shiki's web bundle on
// its JavaScript engine, poimandres, CSS; loaded when the control is first used, as the old page loaded it then.
import { extractThemeCSS } from './extract-theme-css.ts';
import globalCSS from './global.css?raw';

export interface Token {
	readonly k: number;
	readonly content: string;
	readonly style: string;
}
export interface Line {
	readonly k: number;
	readonly tokens: readonly Token[];
	readonly end: string;
}

type Highlighter = { codeToTokens(code: string, options: { lang: string; theme: string }): { tokens: { content: string; color?: string; fontStyle?: number }[][] } };
let highlighter: Promise<Highlighter> | undefined;

function load(): Promise<Highlighter> {
	highlighter ??= (async () => {
		const [{ createHighlighter }, { createJavaScriptRegexEngine }] = await Promise.all([import('shiki/bundle/web'), import('shiki/engine/javascript')]);
		return (await createHighlighter({ themes: ['poimandres'], langs: ['tsx', 'html', 'css'], engine: createJavaScriptRegexEngine() })) as unknown as Highlighter;
	})();
	return highlighter;
}

const styleOf = (color: string | undefined, fontStyle = 0) => [color ? `color:${color}` : '', fontStyle & 1 ? 'font-style:italic' : '', fontStyle & 2 ? 'font-weight:bold' : '', fontStyle & 4 ? 'text-decoration:underline' : ''].filter(Boolean).join(';');

/** copy-css-config.tsx's onClick$: the theme in storage (a plain light or dark is the default theme) as CSS lines. */
export async function themeCssLines(theme: string): Promise<{ readonly css: string; readonly lines: readonly Line[] }> {
	const css = extractThemeCSS(theme === 'dark' || theme === 'light' ? 'border-radius-0 simple primary-cyan-600 light base-slate' : theme, globalCSS);
	const { tokens } = (await load()).codeToTokens(css, { lang: 'css', theme: 'poimandres' });
	const lines = tokens.map((line, i) => ({ k: i, tokens: line.map((t, j) => ({ k: j, content: t.content, style: styleOf(t.color, t.fontStyle) })), end: i < tokens.length - 1 ? '\n' : '' }));
	return { css, lines };
}
