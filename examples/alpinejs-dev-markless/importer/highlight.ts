import { createHighlighter } from 'shiki';
import { alpine, tljs } from './grammars.ts';

const THEME = 'github-light';
const LANGS: Record<string, string> = { alpine: 'alpine', js: 'tljs', html: 'html', css: 'css', shell: 'shell', text: 'text', '': 'text' };
const highlighter = await createHighlighter({ themes: [THEME], langs: ['html', 'css', 'shell', alpine as never, tljs as never] });

const escape = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');

// Torchlight's markup: one div.line per line, a span per colour run, &nbsp; on an empty line, and a hidden copy of the source.
export function highlight(code: string, fence: string): string {
	const lang = fence || 'text';
	const lines = highlighter.codeToTokensBase(code, { lang: LANGS[lang] ?? 'text', theme: THEME });
	const body = lines
		.map((tokens) => {
			const runs: { color: string; text: string }[] = [];
			for (const token of tokens) {
				const color = (token.color ?? '#24292E').toUpperCase();
				const last = runs.at(-1);
				if (last && last.color === color) last.text += token.content;
				else if (token.content) runs.push({ color, text: token.content });
			}
			if (runs.every((run) => !run.text.trim())) return `<div class='line'>&nbsp;</div>`;
			const inner = runs.map((run) => `<span style="color: ${run.color};">${escape(run.text)}</span>`).join('');
			return `<div class='line'>${inner}</div>`;
		})
		.join('');
	return `<pre><code data-theme="${THEME}" data-lang="${lang}" class='torchlight' style='background-color: #fff; --theme-selection-background: #e2e5e9;'>${body}<div aria-hidden='true' hidden tabindex='-1' style='display: none;' class='torchlight-copy-target'>\n${escape(code)}</div></code></pre>`;
}
