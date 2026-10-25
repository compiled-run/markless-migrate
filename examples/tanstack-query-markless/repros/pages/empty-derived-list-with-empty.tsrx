import { computed, state } from '@markless/core';
import { slow } from '../lib/slow.ts';

// The same with an @empty arm on the loop and no @catch. Type "zz", then "al". Expected: the list empties, then shows "alpha". Actual: "Failed to execute 'removeChild' on 'Node'" and the list stays empty.
export default function EmptyDerivedListWithEmpty() @{
	let filter = state('');
	const words = computed(async () => (await slow('alpha beta')).text.split(' '));
	const shown = computed(() => {
		const all: string[] = Array.isArray(words) ? words : [];
		const f = filter;
		return all.filter((w) => w.includes(f)).map((w, i) => ({ id: i, w }));
	});

	<main>
		<input value={filter} onInput={(event) => (filter = (event.target as HTMLInputElement).value)} />
		<ul>
			@try {
				@for (const row of shown; key row.id) {
					<li>{row.w}</li>
				} @empty {
					<li hidden>none</li>
				}
			} @pending {
				<li>loading…</li>
			}
		</ul>
	</main>
}
