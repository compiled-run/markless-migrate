import { state } from '@markless/core';

// Rows that are a fragment of two <tr>s. Click "two": expected #out reads "two"; actual it reads "" (the row's item is undefined in its handler).
export default function Page() @{
	let rows = state([{ id: 1, n: 'one' }, { id: 2, n: 'two' }]);
	let clicked = state('none');
	<main>
		<p id="out">{clicked}</p>
		<table>
			<tbody>
				@for (const row of rows; key row.id) {
					<>
						<tr>
							<td>
								<a onClick={() => (clicked = row.n)}>{row.n}</a>
							</td>
						</tr>
						<tr class="spacer"></tr>
					</>
				}
			</tbody>
		</table>
	</main>
}
