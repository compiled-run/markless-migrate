import { computed, state } from '@markless/core';
import type { PageProps } from '@markless/router';
import LoadingSpinner from '../components/loading-spinner.tsrx';
import Footer from '../components/footer.tsrx';
import Header from '../components/header.tsrx';
import { loadSession, signedOut } from '../lib/session.ts';
import NewsFeed from '../components/news-feed.tsrx';
import { loadFeed } from '../lib/feed.ts';

export default function Page({ url }: PageProps) @{
	const session = computed(async () => loadSession());
	let version = state(0);
	const feed = computed(async () => {
		const v = version;
		return loadFeed('NewestFeed', 'new', url.search, '/upvoted', v);
	});
	<div>
		<title>Hacker News Clone</title>
		<link rel="stylesheet" type="text/css" href="/static/news.css" />
		<table id="hnmain" style="background-color:#f6f6ef;border:0px;border-collapse:collapse;border-spacing:0px;margin-left:auto;margin-right:auto;padding:0px;width:85%">
			<tbody>
				@try {
					<Header session={session} currentUrl="/upvoted" isNavVisible={true} title="Hacker News" />
				} @pending {
					<Header session={signedOut} currentUrl="/upvoted" isNavVisible={true} title="Hacker News" />
				}
				<tr style="height:10px"></tr>
				@try {
					<NewsFeed feed={feed} onAnswered={() => version++} />
				} @pending {
					<LoadingSpinner />
				} @catch {
					<LoadingSpinner />
				}
				<Footer />
			</tbody>
		</table>
	</div>
}
