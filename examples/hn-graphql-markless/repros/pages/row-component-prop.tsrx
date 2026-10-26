import { computed } from '@markless/core';
import Row from '../components/row.tsrx';

const load = async () => ({ items: [{ id: 1, n: 'one' }, { id: 2, n: 'two' }] });

// Each row a component with its own state, given its item. Click the second row: expected "one 0 two 1"; actual "one 0 undefined 1" (the computed reads its item prop as undefined in the browser).
export default function Page() @{
	const feed = computed(async () => load());
	<main>
		@try {
			<table>
				<tbody id="out">
					@for (const row of feed.items; key row.id) {
						<Row item={row} />
					}
				</tbody>
			</table>
		} @pending {
			<p>loading</p>
		}
	</main>
}
