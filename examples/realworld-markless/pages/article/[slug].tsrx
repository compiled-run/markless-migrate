import { element } from '@markless/core';
import type { PageProps } from '@markless/router';
import Layout from '../../components/layout.tsrx';
import { articleClick, articleSubmit, bootArticle } from '../../lib/pages.ts';

export default function ArticlePage({ url }: PageProps<{ slug: string }>) @{
	const root = element<HTMLDivElement>();

	<Layout>
		<app-article-page>
			<div
				el={root}
				class="article-page"
				onVisible={() => {
					const node = root;
					void bootArticle(node);
				}}
				onClick={(event) => void articleClick(event)}
				onSubmit={(event) => {
					event.preventDefault();
					void articleSubmit(event);
				}}
			></div>
		</app-article-page>
	</Layout>
}
