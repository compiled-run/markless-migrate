import { computed } from '@markless/core';

const load = async () => ({ rows: [{ id: 'a', text: 'payload-marker-one' }, { id: 'b', text: 'payload-marker-two' }] });

// Control for async-prop-state-twice: the same value drawn by the page itself.
export default function Page() @{
	const data = computed(async () => load());
	@try {
		<ul>
			@for (const row of data.rows; key row.id) {
				<li>{row.text}</li>
			}
		</ul>
	} @pending {
		<p>pending</p>
	}
}
