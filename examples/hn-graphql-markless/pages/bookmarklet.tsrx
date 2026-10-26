import NoticeLayout from '../components/notice-layout.tsrx';

export default function Page() @{
	<NoticeLayout>
		<b>Bookmarklet</b>
		<br />
		<br />
		<div id="main">
			<p id="first">
				Thanks to Phil Kast for writing this bookmarklet for submitting links to{' '}
				<a href="/">Hacker News</a>
				. When you click on the bookmarklet, it will submit the page you're on. To install,
				drag this link to your browser toolbar:
				<br />
				<br />
			</p>
			<div style="text-align:center">
				<a
					style="color:#777;font-size:2em"
					href="javascript:window.location=%22http://news.ycombinator.com/submitlink?u=%22+encodeURIComponent(document.location)+%22&t=%22+encodeURIComponent(document.title)"
				>
					post to HN
				</a>
			</div>
			<br />
			<br />
			<table style="padding:0px;background-color:#ff6600;width:100%">
				<tbody>
					<tr style="height:0px">
						<td style="padding:0px" />
					</tr>
				</tbody>
			</table>
			<p style="text-align:center">
				<span class="foot">
					<br />
					<br />
				</span>
			</p>
		</div>
	</NoticeLayout>
}
