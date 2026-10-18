import { state } from '@markless/core';

export default function SiteHeader() @{
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
								{/* buttons.js replaces its link with a span: serving a span and swapping the link in first keeps a span here, as Markless resume expects.
								On the click-to-edit demo, sinon's fake XMLHttpRequest pushes buttons.js into its iframe fallback: that page gets the iframe it writes, in the span's shadow root.
								The span stays static (a bound attribute would make it an element Markless resumes). */}
								<span></span>
								<script>{'(function () { var s = document.currentScript; if (!s) return; var h = s.previousElementSibling; if (!h) return; var x; if (location.pathname.indexOf("/examples/click-to-edit") === 0) { var q = ["href=" + encodeURIComponent("https://github.com/bigskysoftware/htmx"), "title=", "aria-label=" + encodeURIComponent("Star bigskysoftware/htmx on GitHub"), "data-icon=octicon-star", "data-color-scheme=" + encodeURIComponent("no-preference: light; light: light; dark: dark;"), "data-text=star", "data-show-count=true"].join("&"); x = document.createElement("iframe"); x.src = "https://buttons.github.io/buttons.html#" + q; x.setAttribute("allowtransparency", "true"); x.setAttribute("scrolling", "no"); x.setAttribute("frameborder", "0"); x.setAttribute("style", "width: 51px; height: 20px; border-width: medium; border-style: none; border-color: currentcolor; border-image: none; color-scheme: light;"); x.name = q; h.attachShadow({ mode: "open" }).append(x); return; } else { x = document.createElement("a"); x.className = "github-button"; x.href = "https://github.com/bigskysoftware/htmx"; x.setAttribute("data-color-scheme", "no-preference: light; light: light; dark: dark;"); x.setAttribute("data-icon", "octicon-star"); x.setAttribute("data-show-count", "true"); x.setAttribute("aria-label", "Star bigskysoftware/htmx on GitHub"); x.textContent = "star"; } h.replaceWith(x); })();'}</script>
							</div>
						</div>
					</nav>
				</div>
			</div>
		</div>
	</header>
}
