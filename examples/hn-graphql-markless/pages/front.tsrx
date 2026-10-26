import { computed } from '@markless/core';
import Footer from '../components/footer.tsrx';
import Header from '../components/header.tsrx';
import { loadSession, signedOut } from '../lib/session.ts';

function Content() @{
	<>
		<span>total</span>
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
					<Header session={session} currentUrl="/front" isNavVisible={true} title="Hacker News" />
				} @pending {
					<Header session={signedOut} currentUrl="/front" isNavVisible={true} title="Hacker News" />
				}
				<tr style="height:10px"></tr>
				<Content />
				<Footer />
			</tbody>
		</table>
	</div>
}
