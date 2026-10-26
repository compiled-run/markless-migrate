import { computed } from '@markless/core';
import Header from '../components/header.tsrx';
import { loadSession, signedOut } from '../lib/session.ts';

function Content() @{
	<>
		<>
			<tr style="height:10px" />
			<tr>
				<td>
					<span class="admin">
						<table style="width:500px">
							<tbody>
								<tr>
									<td>
										Password recovery message sent. If you don't see it, you might want to
										check your spam folder.
									</td>
								</tr>
							</tbody>
						</table>
					</span>
					<br />
					<br />
				</td>
			</tr>
		</>
	</>
}

export default function Page() @{
	const session = computed(async () => loadSession());
	<div>
		<title>Hacker News Clone</title>
		<link rel="stylesheet" type="text/css" href="/static/news.css" />
		<table id="hnmain" style="background-color:#f6f6ef;border:0px;border-collapse:collapse;border-spacing:0px;margin-left:auto;margin-right:auto;padding:0px;width:85%">
			<tbody>
				@try {
					<Header session={session} currentUrl="/x" isNavVisible={false} title="Message" />
				} @pending {
					<Header session={signedOut} currentUrl="/x" isNavVisible={false} title="Message" />
				}
				<tr style="height:10px"></tr>
				<Content />
			</tbody>
		</table>
	</div>
}
