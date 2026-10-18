// Markless 0.5.0: a computed that reads another computed sees it as undefined when the browser refreshes it after
// resume. Load the page: `windowOf` throws "Cannot read properties of undefined (reading 'length')" from the
// resume of `win`. Reading the state in one computed (windowOf(sortRows(rows, key), top)) works.
import { computed, state } from '@markless/core';
import { sortRows, windowOf } from '../lib/rows.ts';

export default function Chain() @{
	let rows = state([3, 1, 2]);
	let key = state(1);
	let top = state(0);
	const shown = computed(() => sortRows(rows, key));
	const win = computed(() => windowOf(shown, top));
	<main>
		<button onClick={() => (key = -key)}>flip</button>
		<button onClick={() => top++}>down</button>
		@for (const n of win; key n) {
			<p>{n}</p>
		}
	</main>
}
