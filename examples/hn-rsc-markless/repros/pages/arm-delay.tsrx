import { computed } from '@markless/core';
import { slow } from '../lib/slow.ts';

// Expected: "ready" shows as soon as its part of the response arrives. Actual: it is held until 200 ms after the first paint.
export default function ArmDelay() @{
	const data = computed(async () => slow({ text: 'ready' }, 60));
	<main>
		<h1>Arm delay</h1>
		@try {
			<p id="ready">{data.text}</p>
		} @pending {
			<p>loading</p>
		} @catch {
			<p>failed</p>
		}
	</main>
}
