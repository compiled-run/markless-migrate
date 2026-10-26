import { computed, state } from '@markless/core';

const load = async (v: number) => ({ items: [{ id: 1, n: `one ${v}`, cls: v > 0 ? 'nosee' : ' ' }, { id: 2, n: `two ${v}`, cls: ' ' }] });

// Control for the fragment repros: one <tbody> per row works, before and after the rows are fetched again.
export default function Page() @{
	let version = state(0);
	const feed = computed(async () => {
		const v = version;
		return load(v);
	});
	<main>
		@try {
			<table>
				<tbody id="out"></tbody>
					@for (const row of feed.items; key row.id) {
						<tbody>
							<tr>
								<td>
									<a class={row.cls} onClick={() => version++}>{row.n}</a>
								</td>
							</tr>
							<tr class="spacer"></tr>
						</tbody>
					}
			</table>
		} @pending {
			<p>loading</p>
		}
	</main>
}
