import type { PageProps } from '@markless/router';

export default function Page({ url }: PageProps) @{
	<main>
		<a class="next" href={`/12-navigation-leak?n=${Number(new URLSearchParams(url.search).get('n') ?? 0) + 1}`}>next</a>
		<ol>
			<li>one</li>
			<li>two</li>
			<li>three</li>
		</ol>
	</main>
}
