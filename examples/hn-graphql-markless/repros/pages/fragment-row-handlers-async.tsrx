import { computed, state } from '@markless/core';

const load = async (v: number) => ({ items: [{ id: 1, n: `one ${v}`, cls: v > 0 ? 'nosee' : ' ' }, { id: 2, n: `two ${v}`, cls: ' ' }] });

// As fragment-row-handlers, the rows from an async value a click fetches again. Click a row: expected "one 1 two 1"; actual nothing runs (MARKLESS_EVENT_DISPATCH_UNMATCHED: no event record matched).
export default function Page() @{
	let version = state(0);
	const feed = computed(async () => {
		const v = version;
		return load(v);
	});
	<main>
		@try {
			<table>
				<tbody id="out">
					@for (const row of feed.items; key row.id) {
						<>
							<tr>
								<td>
									<a class={row.cls} onClick={() => version++}>{row.n}</a>
								</td>
							</tr>
							<tr class="spacer"></tr>
						</>
					}
				</tbody>
			</table>
		} @pending {
			<p>loading</p>
		}
	</main>
}
