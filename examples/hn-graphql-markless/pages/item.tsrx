import { computed, state } from '@markless/core';
import type { PageProps } from '@markless/router';
import Footer from '../components/footer.tsrx';
import Header from '../components/header.tsrx';
import LoadingSpinner from '../components/loading-spinner.tsrx';
import NewsItemWithComments from '../components/news-item-with-comments.tsrx';
import { loadItem } from '../lib/item.ts';
import { loadSession, signedOut } from '../lib/session.ts';

export default function ItemPage({ url }: PageProps) @{
	const session = computed(async () => loadSession());
	let version = state(0);
	const view = computed(async () => {
		const v = version;
		return loadItem(url.search, v);
	});
	<div>
		<title>Hacker News Clone</title>
		<link rel="stylesheet" type="text/css" href="/static/news.css" />
		<table id="hnmain" style="background-color:#f6f6ef;border:0px;border-collapse:collapse;border-spacing:0px;margin-left:auto;margin-right:auto;padding:0px;width:85%">
			<tbody>
				@try {
					<Header session={session} currentUrl="/item" isNavVisible={true} title="Hacker News" />
				} @pending {
					<Header session={signedOut} currentUrl="/item" isNavVisible={true} title="Hacker News" />
				}
				<tr style="height:10px"></tr>
				@try {
					<NewsItemWithComments view={view} onAnswered={() => version++} />
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
