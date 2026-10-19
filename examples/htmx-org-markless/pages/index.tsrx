import SiteFooter from '../components/site-footer.tsrx';
import SiteHeader from '../components/site-header.tsrx';

export default function Home() @{
	<div style="display: contents">
		<SiteHeader />
		<main class="c content ">
			<script type="application/javascript">{'var q = window.location.search; if (q == "?wuw=true" || q == "?suw=true") document.body.classList.add("lmao"); if (q == "?uwu=true") document.body.classList.add("kawaii"); if (q == "?ads=true") document.body.classList.add("ads");'}</script>
			<div class="ad" style="margin-bottom: 30px">
				{" "}
				<a href="https://swag.htmx.org">
					{" "}
					<img src="/img/ads_top.png" alt={"Ad: MacMall PowerBooks as low as 1999$!\n    Call 888-932-1569. Get your FREE 64MB RAM with your PowerBook!"} />
					{" "}
				</a>
				{" "}
			</div>
			<div class="dark-hero full-width">
				<div class="main">
					{" "}
					<span class="logo dark">&lt;<span class="blue">/</span>&gt; <span class="no-mobile">htm<span class="blue">x</span></span></span>
					{" "}
					<sub class="no-mobile">
						<i>high power tools for HTML</i>
					</sub>
					{" "}
				</div>
				<div class="wuw">
					{" "}
					<a href="https://swag.htmx.org/products/shut-up-warren-tee">
						{" "}
						<img src="/img/wuw.png" alt="shut up warren ⁺₊✦ uwu" />
						{" "}
					</a>
					{" "}
				</div>
				<div class="uwu">
					{" "}
					<a href="https://swag.htmx.org/products/htmx-katakana-shirt">
						{" "}
						<img src="/img/kawaii.png" alt="htmx エイチティーエムエックス uwu" />
						{" "}
					</a>
					{" "}
				</div>
			</div>
			<script>{'document.addEventListener("DOMContentLoaded", function () { setTimeout(function () { document.querySelector(".dark-hero").classList.add("appear"); }, 100); });'}</script>
			<div class="ad">
				{" "}
				<a href="https://swag.htmx.org">
					{" "}
					<img src="/img/ads_bottom.png" alt={"Ads: Get Flash! FREE Microsoft Internet Explorer!\n    Netscape Now! (3.0) Site created with Microsoft® FrontPage™.\n    Powered by Microsoft BackOffice."} />
					{" "}
				</a>
				{" "}
			</div>
			<div class="alert" style="border-radius: 8px">{" "}<b>NEWS:</b> htmx 4.0 <a href="https://four.htmx.org/announcements/2026-08-28-htmx-4.0.0-is-released">has been released</a>! It is not currently marked as <code>latest</code> in NPM so that people using the 2.x line are not accidentally upgraded. We will mark it <code>latest</code> at some point in 2027. More details at <a href="https://four.htmx.org">https://four.htmx.org</a>{" "}</div>
			<h2>introduction</h2>
			<p>htmx gives you access to <a href="https://htmx.org/docs/#ajax">AJAX</a>, <a href="https://htmx.org/docs/#css_transitions">CSS Transitions</a>, <a href="https://htmx.org/docs/#websockets-and-sse">WebSockets</a> and <a href="https://htmx.org/docs/#websockets-and-sse">Server Sent Events</a> directly in HTML, using <a href="https://htmx.org/reference/#attributes">attributes</a>, so you can build <a href="https://htmx.org/examples/">modern user interfaces</a> with the <a rel="noopener" target="_blank" href="https://en.wikipedia.org/wiki/HATEOAS">simplicity</a> and <a rel="noopener" target="_blank" href="https://www.ics.uci.edu/~fielding/pubs/dissertation/rest_arch_style.htm">power</a> of hypertext</p>
			<p>htmx is small (<a rel="noopener" target="_blank" href="https://cdn.jsdelivr.net/npm/htmx.org/dist/">~16k min.gz’d</a>), <a rel="noopener" target="_blank" href="https://github.com/bigskysoftware/htmx/blob/master/package.json">dependency-free</a>, <a rel="noopener" target="_blank" href="https://htmx.org/extensions">extendable</a> &amp; has <strong>reduced</strong> code base sizes by <a href="https://htmx.org/essays/a-real-world-react-to-htmx-port/">67% when compared with react</a></p>
			<h2>motivation</h2>
			<ul>
				<li>Why should only <a rel="noopener" target="_blank" href="https://developer.mozilla.org/en-US/docs/Web/HTML/Element/a"><code>&lt;a&gt;</code></a> &amp; <a rel="noopener" target="_blank" href="https://developer.mozilla.org/en-US/docs/Web/HTML/Element/form"><code>&lt;form&gt;</code></a> be able to make HTTP requests?</li>
				<li>Why should only <a rel="noopener" target="_blank" href="https://developer.mozilla.org/en-US/docs/Web/API/Element/click_event"><code>click</code></a> &amp; <a rel="noopener" target="_blank" href="https://developer.mozilla.org/en-US/docs/Web/API/HTMLFormElement/submit_event"><code>submit</code></a> events trigger them?</li>
				<li>Why should only <a rel="noopener" target="_blank" href="https://developer.mozilla.org/en-US/docs/Web/HTTP/Methods/GET"><code>GET</code></a> &amp; <a rel="noopener" target="_blank" href="https://developer.mozilla.org/en-US/docs/Web/HTTP/Methods/POST"><code>POST</code></a> methods be <a rel="noopener" target="_blank" href="https://developer.mozilla.org/en-US/docs/Web/HTTP/Methods">available</a>?</li>
				<li>Why should you only be able to replace the <strong>entire</strong> screen?</li>
			</ul>
			<p>By removing these constraints, htmx completes HTML as a <a rel="noopener" target="_blank" href="https://en.wikipedia.org/wiki/Hypertext">hypertext</a></p>
			<h2>quick start</h2>
			<pre data-lang="html" style="background-color:#1f2329;color:#abb2bf;" class="language-html "><code class="language-html" data-lang="html"><span>{"  <"}</span><span style="color:#e06c75;">script </span><span style="color:#d19a66;">src</span><span>=</span><span style="color:#98c379;">{"\"https://cdn.jsdelivr.net/npm/htmx.org@2.0.11/dist/htmx.min.js\" \n"}</span><span>{"          "}</span><span style="color:#d19a66;">integrity</span><span>=</span><span style="color:#98c379;">{"\"sha384-2OatzQy1H+Zd/IIrjr1TcuDGqLXeHhbooAyJY1KdQMKnr4LZ22k31GBLdYKHmVjg\"\n"}</span><span>{"          "}</span><span style="color:#d19a66;">crossorigin</span><span>=</span><span style="color:#98c379;">"anonymous"</span><span>&gt;&lt;/</span><span style="color:#e06c75;">script</span><span>{">\n"}</span><span>{"  "}</span><span style="font-style:italic;color:#848da1;">{"<!-- have a button POST a click via AJAX -->\n"}</span><span>{"  <"}</span><span style="color:#e06c75;">button </span><span style="color:#d19a66;">hx-post</span><span>=</span><span style="color:#98c379;">"/clicked" </span><span style="color:#d19a66;">hx-swap</span><span>=</span><span style="color:#98c379;">"outerHTML"</span><span>{">\n"}</span><span>{"    Click Me\n"}</span><span>{"  </"}</span><span style="color:#e06c75;">button</span><span>{">\n"}</span></code></pre>
			<p>The <a href="https://htmx.org/attributes/hx-post/"><code>hx-post</code></a> and <a href="https://htmx.org/attributes/hx-swap/"><code>hx-swap</code></a> attributes on this button tell htmx:</p>
			<blockquote>
				<p>“When a user clicks on this button, issue an AJAX request to /clicked, and replace the entire button with the HTML response”</p>
			</blockquote>
			<p>htmx is the successor to <a rel="noopener" target="_blank" href="http://intercoolerjs.org">intercooler.js</a></p>
			<p>Read the <a href="https://htmx.org/docs/#introduction">docs introduction</a> for a more in-depth… introduction.</p>
			<p>Note that htmx 2.x has dropped IE support. If you require IE support you can use the <a rel="noopener" target="_blank" href="https://v1.htmx.org">1.x</a> code-line, which will be supported in perpetuity.</p>
			<h2><a name="book"></a>book</h2>
			<p>We are happy to announce the release of <a rel="noopener" target="_blank" href="https://hypermedia.systems">Hypermedia Systems</a>, a book on how to build <a href="https://htmx.org/essays/hypermedia-driven-applications/">Hypermedia-Driven Applications</a> using htmx &amp; more:</p>
			<div style="text-align: center;padding: 24px">
				{" "}
				<a href="https://www.amazon.com/dp/B0C9S88QV6/ref=sr_1_1?crid=1P0I3GXQK32TN">
					<img src="/img/hypermedia-systems.png" alt="Hypermedia Systems hardcover edition" />
				</a>
				{" "}
			</div>
			<h2>sponsors <iframe src="https://github.com/sponsors/bigskysoftware/button" title="Sponsor htmx" height="32" width="114" style="border: 1px solid gray; border-radius: 12px; float:right"></iframe></h2>
			<p>htmx development can be supported via <a rel="noopener" target="_blank" href="https://github.com/sponsors/bigskysoftware?o=esb">GitHub Sponsors</a></p>
			<p>Thank you to all our generous <a href="https://github.com/sponsors/bigskysoftware?o=esb">supporters</a>, including:</p>
			<div style="overflow-x: auto">
				<h1 style="margin-top:32px;text-align:center">Platinum Sponsor</h1>
				<div style="display: grid;grid-template-columns: 1fr">
					<div>
						{" "}
						<a data-github-account="commspace" href="https://www.commspace.co.za">
							{" "}
							<img class="dark-hidden" src="/img/commspace.svg" alt="commspace" style="min-width:200px" />
							{" "}
							<img class="dark-visible" src="/img/commspace-dark.svg" alt="commspace" style="min-width:200px" />
						</a>
						{" "}
					</div>
				</div>
				<h1 style="margin-top:12px;text-align:center">Gold Sponsor</h1>
				<div style="display: grid;grid-template-columns: 1fr; justify-items: center; margin-bottom:40px">
					<div>
						{" "}
						<a href="https://serpapi.com/?utm_source=bigsky_software&utm_campaign=os_sponsorship">
							{" "}
							<img class="dark-hidden" src="/img/serpapi.svg" alt="Web Search API" style="width:100%;max-width:320px" />
							{" "}
							<img class="dark-visible" src="/img/serpapi-dark.svg" alt="Web Search API" style="width:100%;max-width:320px" />
						</a>
						{" "}
					</div>
				</div>
				<h2 id="silver-sponsors">
					<a class="zola-anchor" href="#silver-sponsors" aria-label="Anchor link for: silver-sponsors">Silver Sponsors</a>
				</h2>
				<div id="silver-sponsors" style="display: grid;grid-template-columns: repeat(3, 1fr); align-items: center; justify-items: center; ">
					<div>
						{" "}
						<a data-github-account="JetBrainsOfficial" href="https://www.jetbrains.com">
							<img src="/img/jetbrains.svg" alt="Jetbrains" />
						</a>
						{" "}
					</div>
					<div>
						{" "}
						<a href="https://github.blog/2023-04-12-github-accelerator-our-first-cohort-and-whats-next">
							<img class="dark-invert" src="/img/Github_Logo.png" alt="GitHub" style="max-width:80%;min-width:100px;" />
						</a>
						{" "}
					</div>
					<div>
						{" "}
						<a data-github-account="craftcms" href="https://craftcms.com">
							{" "}
							<img class="dark-hidden" src="/img/logo-craft-cms.svg" alt="craft cms" />
							{" "}
							<img class="dark-visible" src="/img/logo-craft-cms-dark.svg" alt="craft cms" />
						</a>
						{" "}
					</div>
					<div>
						{" "}
						<a data-github-account="ButterCMS" href="https://buttercms.com/?utm_campaign=sponsorship&utm_medium=banner&utm_source=htmxhome">
							{" "}
							<img class="dark-invert" style="min-width: 150px;" src="/img/butter-cms.svg" alt="ButterCMS" />
							{" "}
						</a>
						{" "}
					</div>
					<div>
						{" "}
						<a data-github-account="Black-HOST" href="https://black.host">
							{" "}
							<img class="dark-invert" src="/img/blackhost-logo.svg" alt="Black Host" />
							{" "}
						</a>
						{" "}
					</div>
					<div>
						{" "}
						<a href="https://www.v7n.com/">
							{" "}
							<img alt="V7N" class="dark-hidden" src="/img/v7n-logo.png" />
							{" "}
							<img alt="V7N" class="dark-visible" src="/img/v7n-logo-dark.png" />
						</a>
						{" "}
					</div>
					<div>
						{" "}
						<a data-github-account="sekunho" href="https://tacohiro.systems/">
							<img src="/img/sekun-doggo.jpg" alt="Hiro The Doggo" style="border: 2px solid lightgray; border-radius:20px" />
						</a>
						{" "}
					</div>
					<div>
						{" "}
						<a href="https://dasfilter.shop/pages/affiliates">
							{" "}
							<img class="dark-hidden" alt="Das Filter" src="/img/das-filter.svg" />
							{" "}
							<img class="dark-visible" alt="Das Filter" src="/img/das-filter-dark.svg" />
						</a>
						{" "}
					</div>
					<div>
						{" "}
						<a href="https://www.pullapprove.com/?utm_campaign=sponsorship&utm_medium=banner&utm_source=htmx">
							{" "}
							<img class="dark-hidden" src="/img/pullapprove-logo.svg" alt="PullApprove" />
							{" "}
							<img class="dark-visible" src="/img/pullapprove-logo-dark.svg" alt="PullApprove" />
						</a>
						{" "}
					</div>
					<div>
						{" "}
						<a data-github-account="uibakery" href="https://uibakery.io">
							{" "}
							<img class="dark-hidden" src="/img/ui-bakery.svg" alt="UI Bakery" />
							{" "}
							<img class="dark-visible" src="/img/ui-bakery-dark.svg" alt="UI Bakery" />
						</a>
						{" "}
					</div>
					<div>
						{" "}
						<a data-github-account="tracebit-com" href="https://tracebit.com/?utm_source=htmx">
							{" "}
							<img class="dark-hidden" alt="Tracebit Cloud Canaries" src="/img/tracebit-logo.png" />
							{" "}
							<img class="dark-visible" alt="Tracebit Cloud Canaries" src="/img/tracebit-logo-dark.png" />
						</a>
						{" "}
					</div>
					<div>
						{" "}
						<a data-github-account="pubkey" href="https://rxdb.info/?utm_source=sponsor&utm_medium=githubsponsor&utm_campaign=githubsponsor-htmx">
							{" "}
							<img src="/img/rxdb.svg" alt="RxDB JavaScript Database" />
						</a>
						{" "}
					</div>
					<div>
						{" "}
						<a href="https://www.ohne-makler.net/">
							<img src="/img/ohne-makler.svg" alt="Ohne-Makler" style="width:100%;max-width:150px" />
						</a>
						{" "}
					</div>
					<div>
						{" "}
						<a data-github-account="cased" href="https://cased.com///">
							{" "}
							<img class="dark-hidden" alt="Developer friendly DevOps" src="/img/Cased_Logo_DarkBlue.svg" style="width:100%;max-width:250px" />
							{" "}
							<img class="dark-visible" alt="Developer friendly DevOps" src="/img/Cased_Logo_Beige-01.svg" style="width:100%;max-width:250px" />
						</a>
						{" "}
					</div>
					<div>
						{" "}
						<a data-github-account="llcorg" href="https://www.llc.org/">
							{" "}
							<img alt="How to start an LLC - a guide from LLC.org, proud open source sponsor" src="/img/llc-org.svg" style="width:100%;max-width:250px" />
							{" "}
						</a>
						{" "}
					</div>
					<div>
						{" "}
						<a data-github-account="VPSServerCom" href="https://www.vpsserver.com/">
							{" "}
							<img class="dark-hidden" alt="VPS Server Hosting in the Cloud: Cost Efficiency" src="/img/vps-server-logo.svg" style="width:100%;max-width:250px" />
							{" "}
							<img class="dark-visible" alt="VPS Server Hosting in the Cloud: Cost Efficiency" src="/img/vps-server-logo-dark.svg" style="width:100%;max-width:250px" />
						</a>
						{" "}
					</div>
					<div>
						{" "}
						<a data-github-account="appleple" href="https://www.a-blogcms.jp/">
							{" "}
							<img src="/img/ablogcms_logo.svg" alt="a-blog cms" style="width:100%;max-width:250px" />
							{" "}
						</a>
						{" "}
					</div>
					<div>
						{" "}
						<a data-github-account="CoverageCritic" href="https://broadbandmap.com/">
							{" "}
							<img class="dark-hidden" alt="Find Internet Providers With Broadband Map" src="/img/BroadbandMapLogo2LineLightMode.png" style="width:100%;max-width:250px" />
							{" "}
							<img class="dark-visible" alt="Find Internet Providers With Broadband Map" src="/img/BroadbandMapLogo2LineDarkMode.png" style="width:100%;max-width:250px" />
						</a>
						{" "}
					</div>
					<div>
						{" "}
						<a data-github-account="Follower24" href="https://www.follower24.de/">
							{" "}
							<img class="dark-hidden" alt="Follower24" src="/img/follower_light.svg" style="width:100%;max-width:250px" />
							{" "}
							<img class="dark-visible" alt="Follower24" src="/img/follower_dark.svg" style="width:100%;max-width:250px" />
						</a>
						{" "}
					</div>
					<div>
						{" "}
						<a data-github-account="ExchangeRate-API" href="https://www.exchangerate-api.com">
							{" "}
							<img class="dark-hidden" alt="The Accurate & Reliable Exchange Rate API" src="/img/exchange-rate-api.png" style="width:100%;max-width:250px" />
							{" "}
							<img class="dark-visible" alt="The Accurate & Reliable Exchange Rate API" src="/img/exchange-rate-api-dark.png" style="width:100%;max-width:250px" />
						</a>
						{" "}
					</div>
					<div>
						{" "}
						<a data-github-account="mersano" href="https://instant-famous.com/">
							{" "}
							<img src="/img/rsz_instant_famous.png" alt="Instant Famous" style="width:100%;max-width:250px" />
							{" "}
						</a>
						{" "}
					</div>
					<div>
						{" "}
						<a data-github-account="blacksandsmedia" href="https://hellostake.com/au/referral-code">
							{" "}
							<img src="/img/stake.jpeg" alt="Stake" style="width:100%;max-width:250px" />
							{" "}
						</a>
						{" "}
					</div>
					<div>
						{" "}
						<a href="https://prospex.ch">
							{" "}
							<img class="dark-invert" src="/img/prospex.svg" alt="Prospex" style="width:100%;max-width:250px" />
							{" "}
						</a>
						{" "}
					</div>
				</div>
				<div style="text-align: center;font-style: italic;margin-top: 26px;">ʕ •ᴥ•ʔ made in montana</div>
			</div>
		</main>
		<SiteFooter />
	</div>
}
