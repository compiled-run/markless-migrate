import { computed, state } from '@markless/core';

const load = async () => ({ items: [{ id: 1, n: 'one' }, { id: 2, n: 'two' }] });

// Rows from a computed over an async computed, in the page. Click "two": expected #out reads "two"; actual no event record matches the click.
export default function Page() @{
	const feed = computed(async () => load());
	const rows = computed(() => feed.items);
	let clicked = state('none');
	<main>
		<p id="out">{clicked}</p>
		@try {
			<table>
				<tbody>
					@for (const row of rows; key row.id) {
						<tr>
							<td>
								<a onClick={() => (clicked = row.n)}>{row.n}</a>
							</td>
						</tr>
					}
				</tbody>
			</table>
		} @pending {
			<p>loading</p>
		}
	</main>
}
