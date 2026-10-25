import { computed } from '@markless/core';
import ToggleRow from '../../components/toggle-row.tsrx';
import { slow } from '../../lib/slow.ts';

export default function NavFast() @{
	const rows = computed(async () => slow([{ id: 1, name: 'first' }, { id: 2, name: 'second' }], 0));
	<main>
		@try {
			<div>
				@for (const row of rows; key row.id) {
					<ToggleRow name={row.name} />
				}
			</div>
		} @pending {
			<p>loading rows</p>
		} @catch {
			<p>failed</p>
		}
	</main>
}
