import { computed } from '@markless/core';
import type { PageProps } from '@markless/router';
import { slow } from '../lib/slow.ts';

// From /navigation-start. Expected: the page swaps in with @pending and the server's answer, which is already being streamed, fills it ("(server)").
// Actual: the browser runs the recipe again after the swap: slow() is called on the server and in the browser, and the result says "(browser)", about half a second after the server had it.
export default function NavigationRerunsRecipe({ url }: PageProps) @{
	const u = new URLSearchParams(url.search).get('u') ?? '0';
	const data = computed(async () => slow(`u=${u}`));

	<main>
		@try {
			<p>{data.text + ' (' + data.side + ')'}</p>
		} @pending {
			<p>pending</p>
		}
	</main>
}
