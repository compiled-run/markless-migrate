import { computed } from '@markless/core';

// 50 ms on the server; in the browser it asks /api/slow, so a run of the recipe there shows up as a request.
const load = async (): Promise<{ text: string }> => {
	if (!import.meta.env.SSR) return (await fetch('/api/slow?from=browser')).json() as Promise<{ text: string }>;
	await new Promise((resolve) => setTimeout(resolve, 50));
	return { text: 'from the server' };
};

// Control for streamed-navigation-reruns-recipe: the same page behind a link nav-start prefetches before the click.
export default function Page() @{
	const data = computed(async () => load());
	<main>
		@try {
			<p id="out">{data.text}</p>
		} @pending {
			<p id="out">pending</p>
		} @catch {
			<p id="out">failed</p>
		}
	</main>
}
