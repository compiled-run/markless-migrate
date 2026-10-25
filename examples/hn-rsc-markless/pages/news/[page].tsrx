import { computed } from '@markless/core';
import type { PageProps } from '@markless/router';
import Footer from '../../components/footer.tsrx';
import Layout from '../../components/layout.tsrx';
import ServerInfo from '../../components/server-info.tsrx';
import Stories from '../../components/stories.tsrx';
import { topStories } from '../../lib/hn.ts';

export default function NewsPage({ params, http }: PageProps<{ page: string }>) @{
	// Next serves these ISR pages with revalidate: 10.
	http.response.headers.set('cache-control', 's-maxage=10, stale-while-revalidate');
	const list = computed(async () => topStories(params.page));
	<Layout>
		@try {
			<>
				<Stories offset={list.offset} stories={list.stories} more={list.more} />
				<Footer />
				<ServerInfo />
			</>
		} @pending {
			<div></div>
		} @catch {
			<>
				<span>Application error: a server-side exception has occurred</span>
				<Footer />
				<ServerInfo />
			</>
		}
	</Layout>
}
