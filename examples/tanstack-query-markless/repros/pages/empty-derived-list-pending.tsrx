import { computed, state } from '@markless/core';
import { slow } from '../lib/slow.ts';

// Type "zz" into the box, then "al". Expected: the list empties, then shows "alpha". Actual: with a @catch arm, the @try shows its @pending arm ("loading…") as soon as the derived list is empty, though nothing is loading, and stays there.
export default function EmptyDerivedListPending() @{
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
				}
			} @pending {
				<li>loading…</li>
			} @catch (error) {
				<li>{'failed ' + String(error)}</li>
			}
		</ul>
	</main>
}
