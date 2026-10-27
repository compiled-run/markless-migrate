import { state } from '@markless/core';
import type { Line } from './theme-css/highlight.ts';

// copy-css-config.tsx's Highlight: the theme's CSS as Shiki's poimandres lines, which the "Copy code" control computes
// and hands over (mmthemecss) when it opens the dialog. Each line's newline is its last text (a row's lone node).
export default function ThemeCss() @{
	let lines = state<readonly Line[]>([{ k: 0, tokens: [], end: '' }]);

	<div data-pagefind-ignore="all" class="tab-size max-h-[494px] max-w-full overflow-auto rounded-sm bg-linear-to-b from-slate-900 to-slate-800 p-6 text-sm dark:from-background dark:to-accent/30 border" data-mm-theme-css="" onMmthemecss={(event) => (lines = (event as CustomEvent<readonly Line[]>).detail)}>
		<div>
			<pre class="shiki poimandres" style="background-color:#1b1e28;color:#a6accd" tabindex="0">
				<code>
					@for (const line of lines; key line.k) {
						<span class="line">
							@for (const token of line.tokens; key token.k) {
								<span style={token.style}>{token.content}</span>
							}
							{line.end}
						</span>
					}
				</code>
			</pre>
		</div>
	</div>
}
