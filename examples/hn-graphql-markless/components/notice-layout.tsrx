import type { Children } from '@markless/core';

export default function NoticeLayout({ children }: { children?: Children }) @{
	<div>
		<title>Hacker News Clone</title>
		<link rel="stylesheet" type="text/css" href="/static/yc.css" />
		<br />
		<br />
		<table style="margin-left:auto;margin-right:auto;padding:0px;width:500px">
			<tbody>
				<tr>
					<td style="background-color:#fafaf0">
						<a href="http://www.ycombinator.com">
							<img alt="" src="/static/yc500.gif" style="border:0px" width="500" />
						</a>
						<br />
						<br />
						{children}
					</td>
				</tr>
			</tbody>
		</table>
	</div>
}
