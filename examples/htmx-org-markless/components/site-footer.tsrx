export default function SiteFooter({ wide }: { readonly wide?: boolean }) @{
	<footer>
		<div class={wide ? 'c content wide-content' : 'c content '}>
			<div class="row">
				<div class="6 col footer-haiku">
					<h2>haiku</h2>
					<p>
						<em> javascript fatigue:<br /> longing for a hypertext<br /> already in hand </em>
					</p>
				</div>
				<div class="6 col footer-menu">
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
						<a href="https://twitter.com/htmx_org">&#64;htmx_org</a>
					</div>
				</div>
			</div>
			<div class="row" style="text-align: center;">
				<div class="col">
					{" "}
					<img src="/img/bss_bars.png" alt="" style="max-width: 30px; margin-top: 3em;" />
					{" "}
				</div>
			</div>
			{/* Licence attribution for this public demo copy; fixed, so it changes no layout the migration check compares. */}
			<div class="port-attribution" style="position: fixed; right: 8px; bottom: 8px; z-index: 50; max-width: 360px; margin: 0; padding: 6px 10px; border-radius: 6px; font: 12px/1.4 system-ui, sans-serif; text-align: left; color: #222; background: #fff; box-shadow: 0 1px 4px rgba(0, 0, 0, 0.25);">
				<p style="margin: 0;">
					Unofficial demo copy of <a style="color: #1a4fa0; text-decoration: underline;" href="https://htmx.org">htmx.org</a>, moved to <a style="color: #1a4fa0; text-decoration: underline;" href="https://markless.dev">Markless</a> with markless-migrate. htmx and htmx.org © Big Sky Software and contributors, <a style="color: #1a4fa0; text-decoration: underline;" href="https://github.com/bigskysoftware/htmx/blob/master/LICENSE">Zero-Clause BSD license</a>.
				</p>
			</div>
		</div>
	</footer>
}
