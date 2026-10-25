import { computed, state } from '@markless/core';
import type { PageProps } from '@markless/router';

// Expected: a click adds the row "two", both rows marked "here". Actual: the row is added, and the page throws "Cannot read properties of undefined (reading 'pathname')": the browser evaluates the row's page-prop read with no props.
export default function AsyncRowReadsProp({ url }: PageProps) @{
	let version = state(0);
	const rows = computed(async () => {
		const v = version;
		return [{ id: 1, name: `one v${v}` }, ...(v > 0 ? [{ id: 2, name: 'two' }] : [])];
	});

	<main>
		<button onClick={() => version++}>bump</button>
		<ul>
			@try {
				@for (const row of rows; key row.id) {
					<li class={url.pathname === '/async-row-reads-prop' ? 'here' : 'there'}>{row.name}</li>
				}
			} @pending {
				<li>pending</li>
			}
		</ul>
	</main>
}
