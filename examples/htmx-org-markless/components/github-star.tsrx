import { GitHubButton } from '../lib/embeds/github-button/github-button.tsrx';
import { countStars } from '../lib/github-star-count.ts';

/**
 * The star button with its count as buttons.js shows it (lib/github-star-count.ts). `framed`: an example page, where
 * buttons.js draws into an iframe it sizes to the button, count included; the span stands in for that iframe, with its box
 * and inline style, and shows the count read at convert time until GitHub's API answers.
 */
export default function GitHubStar({ framed }: { readonly framed?: boolean }) @{
	<span
		class={framed === true ? 'ghb-frame ghb-live' : 'ghb-live'}
		data-markless-embed={framed === true ? 'github-button-bigskysoftware-htmx-star' : undefined}
		style={framed === true ? 'width: 102px; height: 20px; border-width: medium; border-style: none; border-color: currentcolor; border-image: none; color-scheme: light;' : undefined}
		onIdle={(event) => countStars(event.target as HTMLElement)}
	>
		<GitHubButton embed="github-button-bigskysoftware-htmx-star" />
	</span>
}
