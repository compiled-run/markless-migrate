import { computed } from '@markless/core';
import Footer from '../components/footer.tsrx';
import Header from '../components/header.tsrx';
import { loadSession, signedOut } from '../lib/session.ts';

function Content() @{
	<>
		<tr>
			<td>
				<table style="border-spacing:7px 0px">
					<tbody>
						<tr>
							<td>
								<a href="/leaders">leaders</a>
							</td>
							<td>Users with most karma.</td>
						</tr>
						<tr>
							<td>
								<a href="/front">front</a>
							</td>
							<td>
								Front page submissions for a given day (e.g.{' '}
								<a href="/front?day=2016-06-20">2016-06-20</a>), ordered by time spent there.
							</td>
						</tr>
						<tr>
							<td>
								<a href="/best">best</a>
							</td>
							<td>Highest-voted recent links.</td>
						</tr>
						<tr>
							<td>
								<a href="/active">active</a>
							</td>
							<td>Most active current discussions.</td>
						</tr>
						<tr>
							<td>
								<a href="/bestcomments">bestcomments</a>
							</td>
							<td>Highest-voted recent comments.</td>
						</tr>
						<tr>
							<td>
								<a href="/noobstories">noobstories</a>
							</td>
							<td>Submissions from new accounts.</td>
						</tr>
						<tr>
							<td>
								<a href="/noobcomments">noobcomments</a>
							</td>
							<td>Comments from new accounts.</td>
						</tr>
					</tbody>
				</table>
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
					<Header session={session} currentUrl="/lists" isNavVisible={true} title="Hacker News" />
				} @pending {
					<Header session={signedOut} currentUrl="/lists" isNavVisible={true} title="Hacker News" />
				}
				<tr style="height:10px"></tr>
				<Content />
				<Footer />
			</tbody>
		</table>
	</div>
}
