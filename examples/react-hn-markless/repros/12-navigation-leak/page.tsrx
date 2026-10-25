import { state } from '@markless/core';
import type { PageProps } from '@markless/router';

export default function Page({ url }: PageProps) @{
	let clicks = state(0);

	<main attach={() => () => {}}>
		<a class="next" href={`/12-navigation-leak?n=${Number(new URLSearchParams(url.search).get('n') ?? 0) + 1}`}>next</a>
		<button class="count" onClick={() => clicks++}>{clicks}</button>
		<ol>
			<li>one</li>
			<li>two</li>
			<li>three</li>
		</ol>
	</main>
}
