import { computed, state } from '@markless/core';

const load = async (v: number) => ({ items: [{ id: 1, n: `one ${v}` }, { id: 2, n: `two ${v}` }] });

// Control: fragment rows over an async value a click fetches again, the click handled once on the <tbody> instead of on each row.
export default function Page() @{
	let version = state(0);
	const feed = computed(async () => {
		const v = version;
		return load(v);
	});
	@try {
		<table>
			<tbody onClick={() => version++}>
				@for (const row of feed.items; key row.id) {
					<>
						<tr>
							<td>
								<a>{row.n}</a>
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
}
