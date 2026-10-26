import { computed, state } from '@markless/core';
import Header from '../components/header.tsrx';
import { loadSession, signedOut } from '../lib/session.ts';
import { submitNewsItem } from '../lib/submit.ts';

export default function SubmitPage() @{
	const session = computed(async () => loadSession());
	let title = state('');
	let url = state('');
	<div>
		<title>Hacker News Clone</title>
		<link rel="stylesheet" type="text/css" href="/static/news.css" />
		<table id="hnmain" style="background-color:#f6f6ef;border:0px;border-collapse:collapse;border-spacing:0px;margin-left:auto;margin-right:auto;padding:0px;width:85%">
			<tbody>
				@try {
					<Header session={session} currentUrl="/submit" isNavVisible={false} title="Submit" />
				} @pending {
					<Header session={signedOut} currentUrl="/submit" isNavVisible={false} title="Submit" />
				}
				<tr style="height:10px"></tr>
				<tr>
					<td>
						<form onSubmit={(event) => event.preventDefault()}>
							<input type="hidden" name="fnid" value="GvyHFpy11L26dCAIgGQ9rv" />
							<input type="hidden" name="fnop" value="submit-page" />
							<script type="text/javascript">{"function tlen(el) { var n = el.value.length - 80; el.nextSibling.innerText = n > 0 ? n + ' too long' : ''; }"}</script>
							<table style="border:0">
								<tbody>
									<tr>
										<td>title</td>
										<td>
											<input type="text" name="title" size="50" value="" onInput={(event) => (title = (event.target as HTMLInputElement).value)} />
											<span style="margin-left:10px"></span>
										</td>
									</tr>
									<tr>
										<td>url</td>
										<td>
											<input type="text" name="url" size="50" value="" onInput={(event) => (url = (event.target as HTMLInputElement).value)} />
										</td>
									</tr>
									<tr>
										<td></td>
										<td>
											<b>or</b>
										</td>
									</tr>
									<tr>
										<td>text</td>
										<td>
											<textarea name="text" rows="4" cols="49"></textarea>
										</td>
									</tr>
									<tr>
										<td></td>
										<td></td>
									</tr>
									<tr>
										<td></td>
										<td>
											<input type="submit" value="submit" onClick={() => submitNewsItem(title, url)} />
										</td>
									</tr>
									<tr style="height:20px"></tr>
									<tr>
										<td></td>
										<td>
											Leave url blank to submit a question for discussion. If there is no url, the text (if any) will appear at the top of the thread.
											<br />
											<br />
											{'You can also submit via '}
											<a rel="nofollow" href="/bookmarklet">
												<u>bookmarklet</u>
											</a>
											.
										</td>
									</tr>
								</tbody>
							</table>
						</form>
					</td>
				</tr>
			</tbody>
		</table>
	</div>
}
