import { state } from '@markless/core';
import { GitHubButton } from '../lib/embeds/github-button/github-button.tsrx';

/** `starFrame`: an example page, whose demo's fake XMLHttpRequest (sinon) sends buttons.js to its iframe fallback. */
export default function SiteHeader({ starFrame = false }: { readonly starFrame?: boolean }) @{
	let open = state(false);

	<header class="top-nav">
		<div class="c">
			<div class="menu">
				<div class="logo-wrapper">
					<a href="/" class="logo light">&lt;<b>/</b>&gt; htm<b>x</b></a>
					{' '}
					<svg class="hamburger" viewBox="0 0 100 80" width="25" height="25" style="margin-bottom:-5px" onClick={() => (open = !open)}>
						<rect width="100" height="20" style="fill:rgb(52, 101, 164)" rx="10"></rect>
						<rect y="30" width="100" height="20" style="fill:rgb(52, 101, 164)" rx="10"></rect>
						<rect y="60" width="100" height="20" style="fill:rgb(52, 101, 164)" rx="10"></rect>
					</svg>
				</div>
				<div id="nav" class={open ? 'navigation show' : 'navigation'}>
					<nav class="navigation-items">
						<div>
							<a href="/docs/">docs</a>
						</div>
						<div>
							<a href="/reference/">reference</a>
						</div>
						<div>
							<a href="/examples/">examples</a>
						</div>
						<div>
							<a href="/talk/">talk</a>
						</div>
						<div>
							<a href="/essays/">essays</a>
						</div>
						<div>
							<form action="https://google.com/search" role="search" aria-label="Sitewide">
								<input type="hidden" name="q" value="+[inurl:https://htmx.org]" />
								{' '}
								<label>
									<span style="display:none;">Search</span>
									{' '}
									<input type="text" name="q" placeholder="🔍️" class="search-box" />
								</label>
							</form>
						</div>
						<div>
							<div class="github-stars" id="github-stars">
								@if (starFrame) {
									{/* Stands in for the iframe buttons.js writes there, with its box and inline style. */}
									<span class="ghb-frame" data-markless-embed="github-button-bigskysoftware-htmx-star" style="width: 101px; height: 20px; border-width: medium; border-style: none; border-color: currentcolor; border-image: none; color-scheme: light;">
										<GitHubButton embed="github-button-bigskysoftware-htmx-star" />
									</span>;
								} @else {
									<GitHubButton embed="github-button-bigskysoftware-htmx-star" />;
								}
							</div>
						</div>
					</nav>
				</div>
			</div>
		</div>
	</header>
}
