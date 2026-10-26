import { computed } from '@markless/core';
import type { PageProps } from '@markless/router';
import Footer from '../components/footer.tsrx';
import Header from '../components/header.tsrx';
import { loadSession, signedOut } from '../lib/session.ts';
import NewsFeed from '../components/news-feed.tsrx';
import { sampleFeed } from '../lib/feed.ts';
import { sampleData } from '../lib/sample-data.ts';

export default function Page({ url }: PageProps) @{
	const session = computed(async () => loadSession());
	const feed = computed(() => sampleFeed(sampleData.newsItems, url.search, '/noobstories'));
	<div>
		<title>Hacker News Clone</title>
		<link rel="stylesheet" type="text/css" href="/static/news.css" />
		<table id="hnmain" style="background-color:#f6f6ef;border:0px;border-collapse:collapse;border-spacing:0px;margin-left:auto;margin-right:auto;padding:0px;width:85%">
			<tbody>
				@try {
					<Header session={session} currentUrl="/noobstories" isNavVisible={true} title="Hacker News" />
				} @pending {
					<Header session={signedOut} currentUrl="/noobstories" isNavVisible={true} title="Hacker News" />
				}
				<tr style="height:10px"></tr>
				<NewsFeed feed={feed} onAnswered={() => undefined} />
				<Footer />
			</tbody>
		</table>
	</div>
}
