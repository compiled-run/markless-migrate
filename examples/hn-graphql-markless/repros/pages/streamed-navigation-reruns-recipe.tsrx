import { computed } from '@markless/core';

// 50 ms on the server; in the browser it asks /api/slow, so a run of the recipe there shows up as a request.
const load = async (): Promise<{ text: string }> => {
	if (!import.meta.env.SSR) return (await fetch('/api/slow?from=browser')).json() as Promise<{ text: string }>;
	await new Promise((resolve) => setTimeout(resolve, 50));
	return { text: 'from the server' };
};

// Reached from nav-start by a link below the fold, so the router fetches this page at the click and the server streams
// the value. Expected the browser to show the streamed value and ask /api/slow nothing; actual it runs the recipe again.
export default function Page() @{
	const data = computed(async () => load());
	<main>
		@try {
			<p id="out">{data.text}</p>
		} @pending {
			<p id="out">pending</p>
		}
	</main>
}
