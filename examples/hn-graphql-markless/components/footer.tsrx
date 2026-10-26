export default function Footer() @{
	<tr>
		<td style="padding:0px">
			<img alt="" src="/static/s.gif" height="10" width="0" />
			<table style="height:2px;width:100%;border-spacing:0px">
				<tbody>
					<tr>
						<td style="background-color:#ff6600"></td>
					</tr>
				</tbody>
			</table>
			<br />
			<div style="text-align:center">
				<span class="yclinks">
					<a href="/newsguidelines">Guidelines</a>
					{' | '}
					<a href="/newsfaq">FAQ</a>
					{' | '}
					<a href="mailto:hn@ycombinator.com">Support</a>
					{' | '}
					<a href="https://github.com/HackerNews/API">API</a>
					{' | '}
					<a href="/security">Security</a>
					{' | '}
					<a href="/lists">Lists</a>
					{' | '}
					<a href="/bookmarklet">Bookmarklet</a>
					{' | '}
					<a href="/dmca">DMCA</a>
					{' | '}
					<a href="http://www.ycombinator.com/apply/">Apply to YC</a>
					{' | '}
					<a href="mailto:hn@ycombinator.com">Contact</a>
				</span>
				<br />
				<br />
				<form method="get" action="//hn.algolia.com/" style="margin-bottom:1em">
					Search:
					<input type="text" name="q" size="17" autocorrect="off" spellcheck="false" autocapitalize="off" autocomplete="false" />
				</form>
			</div>
		</td>
	</tr>
}
