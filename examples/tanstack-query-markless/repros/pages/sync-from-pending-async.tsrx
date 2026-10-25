import { computed } from '@markless/core';
import { slow } from '../lib/slow.ts';

// From /navigation-start. Expected: the list renders once the words arrive. Actual: in the browser the sync computed runs while the async one is still pending, reads undefined and throws "is not iterable" (no error on a fresh load, where the server settles it).
export default function SyncFromPendingAsync() @{
	const list = computed(async () => (await slow('alpha beta')).text.split(' '));
	const upper = computed(() => {
		const all: string[] = list;
		return [...all].map((w, i) => ({ id: i, w: w.toUpperCase() }));
	});

	<main>
		<ul>
			@try {
				@for (const row of upper; key row.id) {
					<li>{row.w}</li>
				}
			} @pending {
				<li>pending</li>
			}
		</ul>
	</main>
}
