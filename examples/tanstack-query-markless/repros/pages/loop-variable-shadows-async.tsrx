import { computed } from '@markless/core';
import { slow } from '../lib/slow.ts';

// Expected: both lists render. Actual: the response never ends; the server process spins at full CPU and its memory grows until it is killed.
// Rename the loop's `item` to `row` and it renders. (Looping over `list` itself, the build refuses it with a misleading MARKLESS_PUBLIC_RENDER_GATE_PLAN_DISAGREEMENT.)
export default function LoopVariableShadowsAsync() @{
	const list = computed(async () => (await slow('one two')).text.split(' '));
	const rows = computed(() => (Array.isArray(list) ? list : []).map((w, i) => ({ id: i, text: w })));
	const item = computed(async () => slow('item'));

	<main>
		<ul>
			@try {
				@for (const item of rows; key item.id) {
					<li>{item.text}</li>
				}
			} @pending {
				<li>pending</li>
			}
		</ul>
		@try {
			<p>{item.text}</p>
		} @pending {
			<p>pending</p>
		}
	</main>
}
