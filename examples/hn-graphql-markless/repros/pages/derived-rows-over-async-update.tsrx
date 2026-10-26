import { computed, state } from '@markless/core';

const load = async () => ({ items: [{ id: 1, n: 'one', votes: 0 }, { id: 2, n: 'two', votes: 0 }] });
const withVotes = (feed: { items: { id: number; n: string; votes: number }[] }, extra: Readonly<Record<string, number>>) => feed.items.map((i) => ({ ...i, label: `${i.n} ${i.votes + (extra[i.id] ?? 0)}` }));
const bump = (extra: Readonly<Record<string, number>>, id: number) => ({ ...extra, [id]: (extra[id] ?? 0) + 1 });
const rowId = (target: EventTarget | null) => Number((target as Element).closest('tr')?.querySelector('a')?.getAttribute('href')?.slice(1));

// Rows from a computed that merges a click's answers (state) into an async value; one handler on the table reads which row from the DOM. Expected each click to count that row up in place; actual the first click shows nothing, then every click adds a second set of rows beside the first.
export default function Page() @{
	const feed = computed(async () => load());
	let extra = state<Record<string, number>>({});
	const rows = computed(() => withVotes(feed, extra));
	@try {
		<table>
			<tbody
				onClick={(event) => {
					const id = rowId(event.target);
					if (id) extra = bump(extra, id);
				}}
			>
				@for (const row of rows; key row.id) {
					<tr>
						<td>
							<a href={'#' + row.id}>{row.label}</a>
						</td>
					</tr>
				}
			</tbody>
		</table>
	} @pending {
		<p>loading</p>
	}
}
