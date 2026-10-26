import { computed } from '@markless/core';

// 50 ms on the server; in the browser it asks /api/slow, so a run of the recipe there shows up as a request.
const load = async (): Promise<{ text: string }> => {
	if (!import.meta.env.SSR) return (await fetch('/api/slow?from=browser')).json() as Promise<{ text: string }>;
	await new Promise((resolve) => setTimeout(resolve, 50));
	return { text: 'from the server' };
};

// Click the link, then Back before the next page has arrived. Expected this page to stay as served and ask /api/slow
// nothing; actual it runs its recipe again in the browser.
export default function Page() @{
	const data = computed(async () => load());
	<main>
		<a id="next" href="/streamed-navigation-reruns-recipe">next page</a>
		@try {
			<p id="out">{data.text}</p>
		} @pending {
			<p id="out">pending</p>
		}
	</main>
}
