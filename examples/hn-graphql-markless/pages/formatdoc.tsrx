import { computed } from '@markless/core';
import Header from '../components/header.tsrx';
import { loadSession, signedOut } from '../lib/session.ts';

function Content() @{
	<>
		<tr>
			<td>
				<span class="admin">
					<div style="text-align:center">
						<table style="width:500px">
							<tbody>
								<tr>
									<td>
										Blank lines separate paragraphs.
										<p>
											Text after a blank line that is indented by two or more spaces is reproduced
											verbatim. (This is intended for code.)
										</p>
										<p>
											Text surrounded by asterisks is italicized, if the character after the first
											asterisk isn't whitespace.
										</p>
										<p>
											Urls become links, except in the text field of a submission.
											<br />
											<br />
										</p>
									</td>
								</tr>
							</tbody>
						</table>
					</div>
				</span>
				<br />
				<br />
			</td>
		</tr>
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
					<Header session={session} currentUrl="/formatdoc" isNavVisible={false} title="Formatting Options" />
				} @pending {
					<Header session={signedOut} currentUrl="/formatdoc" isNavVisible={false} title="Formatting Options" />
				}
				<tr style="height:10px"></tr>
				<Content />
			</tbody>
		</table>
	</div>
}
