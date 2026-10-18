// Markless 0.5.0: adding two rows to the end of a keyed list re-inserts every existing row element: press "more" and
// the console logs 12 mutations (each of the 5 rows removed and added again, then the 2 new ones), where 2 would do.
// Re-inserting a focused element drops its focus to the body: the grid's focused row lost focus on every scroll.
import { computed, state } from '@markless/core';

export default function Reinserted() @{
	let count = state(5);
	const rows = computed(() => Array.from({ length: count }, (_, i) => i));
	<main onIdle={() => new MutationObserver((m) => console.log(m.length, 'mutations')).observe(document.querySelector('ul')!, { childList: true })}>
		<button onClick={() => (count += 2)}>more</button>
		<ul>
			@for (const i of rows; key i) {
				<li tabindex="0">row {i}</li>
			}
		</ul>
	</main>
}
