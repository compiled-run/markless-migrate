// GitHub's star, fork, watch and follow button as buttons.js (ntkme/github-buttons, BSD-2-Clause) draws it, in
// Markless markup with the count read at convert time: no frame and no script at load.
import embeds from '../data.json';
import { OCTICONS } from './octicons.ts';

export type GitHubButtonScheme = 'light' | 'dark';

export type GitHubButtonData = {
	/** The id of the embed it stands in for, from .migrate/embeds.json. */
	readonly embed: string;
	readonly href: string;
	/** The button's text (`data-text`, else the link's text). */
	readonly text: string;
	readonly ariaLabel?: string;
	/** `octicon-star`, `octicon-repo-forked`, `octicon-eye`, `octicon-heart` or `mark-github`. */
	readonly icon?: string;
	readonly large?: boolean;
	/** The palette for no preference, a light preference and a dark one, from `data-color-scheme`. */
	readonly scheme?: { readonly none: GitHubButtonScheme; readonly light: GitHubButtonScheme; readonly dark: GitHubButtonScheme };
	readonly count?: number;
	readonly countHref?: string;
	/** `stargazers`, `forks`, `subscribers`, `followers` or `open issues`. */
	readonly countNoun?: string;
};

/** `embed` names the embed's entry in lib/embeds/data.json, as markless-migrate embeds install writes it. */
export function GitHubButton({ embed }: { readonly embed: string }) @{
	const data = (embeds as Readonly<Record<string, GitHubButtonData>>)[embed]!;
	const name = (data.icon ?? 'mark-github').replace(/^octicon-/, '');
	const path = OCTICONS[name] ?? OCTICONS['mark-github']!;
	const size = data.large === true ? 16 : 14;
	const scheme = data.scheme ?? { none: 'light', light: 'light', dark: 'dark' };
	const noun = data.countNoun ?? 'stargazers';
	const counted = data.count !== undefined;
	const countText = counted ? String(data.count).replace(/\B(?=(\d{3})+(?!\d))/g, ',') : '';
	const countLabel = counted ? `${data.count} ${(data.count ?? 0) < 2 ? noun.replace(/s$/, '') : noun} on GitHub` : '';
	const countHref = data.countHref ?? data.href;
	<span class="ghb-host" data-markless-embed={data.embed}>
		<style>
			.ghb-host { display: inline; }
			.ghb-widget { display: inline-block; overflow: hidden; font-family: -apple-system, BlinkMacSystemFont, Segoe UI, Helvetica, Arial, sans-serif; font-size: 0; line-height: 0; white-space: nowrap; vertical-align: baseline; }
			.ghb-btn, .ghb-count { position: relative; display: inline-flex; box-sizing: content-box; height: 14px; margin: 0; padding: 2px 5px; font-size: 11px; font-weight: 600; font-style: normal; letter-spacing: normal; line-height: 14px; text-decoration: none; text-transform: none; vertical-align: bottom; cursor: pointer; user-select: none; background-repeat: repeat-x; background-position: -1px -1px; background-size: 110% 110%; border: 1px solid; outline: 0; }
			.ghb-btn { border-radius: .25em; color: var(--ghb-color); background-color: var(--ghb-bg); border-color: var(--ghb-border); background-image: var(--ghb-image); }
			.ghb-btn:not(:last-child) { border-radius: .25em 0 0 .25em; }
			.ghb-btn:hover, .ghb-btn:focus { color: var(--ghb-color); background-color: var(--ghb-hover-bg); background-position: 0 -0.5em; border-color: var(--ghb-border); background-image: var(--ghb-hover-image); }
			.ghb-btn:active { background-color: var(--ghb-active-bg); border-color: var(--ghb-border); background-image: none; }
			.ghb-count { border-left: 0; border-radius: 0 .25em .25em 0; color: var(--ghb-color); background-color: var(--ghb-count-bg); border-color: var(--ghb-border); }
			.ghb-count:hover, .ghb-count:focus { color: var(--ghb-count-hover); }
			.ghb-btn:focus-visible, .ghb-count:focus-visible { outline: 2px solid var(--ghb-focus); outline-offset: -2px; }
			.ghb-large .ghb-btn, .ghb-large .ghb-count { height: 16px; padding: 5px 10px; font-size: 12px; line-height: 16px; }
			.ghb-icon { display: inline-block; vertical-align: text-top; fill: currentColor; overflow: visible; }
			.ghb-icon-heart { color: var(--ghb-heart); }
			.ghb-btn span { font: inherit; color: inherit; }
			.ghb-widget[data-none='light'] { --ghb-color: #25292e; --ghb-bg: #ebf0f4; --ghb-border: #d1d9e0; --ghb-image: linear-gradient(180deg, #f6f8fa, #ebf0f4 90%); --ghb-hover-bg: #e5eaee; --ghb-hover-image: linear-gradient(180deg, #eff2f5, #e5eaee 90%); --ghb-active-bg: #e6eaef; --ghb-count-bg: #fff; --ghb-count-hover: #0969da; --ghb-focus: #0969da; --ghb-heart: #bf3989; }
			.ghb-widget[data-none='dark'] { --ghb-color: #f0f6fc; --ghb-bg: #1a2026; --ghb-border: #3d444d; --ghb-image: linear-gradient(180deg, #212830, #1a2026 90%); --ghb-hover-bg: #1f242c; --ghb-hover-image: linear-gradient(180deg, #262c36, #1f242c 90%); --ghb-active-bg: #2a313c; --ghb-count-bg: #0d1117; --ghb-count-hover: #388bfd; --ghb-focus: #1f6feb; --ghb-heart: #db61a2; }
			@media (prefers-color-scheme: light) {
				.ghb-widget[data-light='light'] { --ghb-color: #25292e; --ghb-bg: #ebf0f4; --ghb-border: #d1d9e0; --ghb-image: linear-gradient(180deg, #f6f8fa, #ebf0f4 90%); --ghb-hover-bg: #e5eaee; --ghb-hover-image: linear-gradient(180deg, #eff2f5, #e5eaee 90%); --ghb-active-bg: #e6eaef; --ghb-count-bg: #fff; --ghb-count-hover: #0969da; --ghb-focus: #0969da; --ghb-heart: #bf3989; }
				.ghb-widget[data-light='dark'] { --ghb-color: #f0f6fc; --ghb-bg: #1a2026; --ghb-border: #3d444d; --ghb-image: linear-gradient(180deg, #212830, #1a2026 90%); --ghb-hover-bg: #1f242c; --ghb-hover-image: linear-gradient(180deg, #262c36, #1f242c 90%); --ghb-active-bg: #2a313c; --ghb-count-bg: #0d1117; --ghb-count-hover: #388bfd; --ghb-focus: #1f6feb; --ghb-heart: #db61a2; }
			}
			@media (prefers-color-scheme: dark) {
				.ghb-widget[data-dark='light'] { --ghb-color: #25292e; --ghb-bg: #ebf0f4; --ghb-border: #d1d9e0; --ghb-image: linear-gradient(180deg, #f6f8fa, #ebf0f4 90%); --ghb-hover-bg: #e5eaee; --ghb-hover-image: linear-gradient(180deg, #eff2f5, #e5eaee 90%); --ghb-active-bg: #e6eaef; --ghb-count-bg: #fff; --ghb-count-hover: #0969da; --ghb-focus: #0969da; --ghb-heart: #bf3989; }
				.ghb-widget[data-dark='dark'] { --ghb-color: #f0f6fc; --ghb-bg: #1a2026; --ghb-border: #3d444d; --ghb-image: linear-gradient(180deg, #212830, #1a2026 90%); --ghb-hover-bg: #1f242c; --ghb-hover-image: linear-gradient(180deg, #262c36, #1f242c 90%); --ghb-active-bg: #2a313c; --ghb-count-bg: #0d1117; --ghb-count-hover: #388bfd; --ghb-focus: #1f6feb; --ghb-heart: #db61a2; }
			}
		</style>
		<span class={data.large === true ? 'ghb-widget ghb-large' : 'ghb-widget'} data-none={scheme.none} data-light={scheme.light} data-dark={scheme.dark}>
			<a class="ghb-btn" href={data.href} rel="noopener" target="_blank" aria-label={data.ariaLabel}>
				<svg viewBox="0 0 16 16" width={size} height={size} class={`ghb-icon ghb-icon-${name}`} aria-hidden="true"><path d={path}></path></svg>
				{'\u00a0'}
				<span>{data.text}</span>
			</a>
			@if (counted) {
				<a class="ghb-count" data-markless-embed-live="count" href={countHref} rel="noopener" target="_blank" aria-label={countLabel}>{countText}</a>
			}
		</span>
	</span>
}
