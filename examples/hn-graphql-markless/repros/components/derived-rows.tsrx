import { computed, state } from '@markless/core';

export default function Rows({ feed }: { feed: { items: { id: number; n: string }[] } }) @{
	let clicked = state('none');
	const rows = computed(() => feed.items);
	<div>
		<p id="out">{clicked}</p>
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
	</div>
}
