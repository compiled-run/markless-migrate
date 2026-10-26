import { computed } from '@markless/core';

const load = () => new Promise<{ text: string }>((resolve) => setTimeout(() => resolve({ text: 'loaded' }), 50));

export default function SlowOneTry() @{
	const data = computed(async () => load());
	<main>
		@try {
			<p id="one">{data.text}</p>
		} @pending {
			<p id="one">pending</p>
		}
	</main>
}
