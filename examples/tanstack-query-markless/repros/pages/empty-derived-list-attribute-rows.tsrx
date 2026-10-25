import { computed, state } from '@markless/core';
import { slow } from '../lib/slow.ts';

// Type "zz", then "al". Expected: the list empties, then shows "alpha". Actual: the rows carry an attribute (href), and once the list is empty the @try shows @pending ("loading…") and stays there; no @catch needed.
export default function EmptyDerivedListAttributeRows() @{
	let filter = state('');
	let view = state('{}');
	const words = computed(async () => (await slow('alpha beta')).text.split(' '));
	const shown = computed(() => {
		const all: string[] = Array.isArray(words) ? words : [];
		const f = filter;
		return all.filter((w) => w.includes(f)).map((w, i) => ({ id: i, w, href: `/x?v=${view}` }));
	});

	<main>
		<input value={filter} onInput={(event) => { filter = (event.target as HTMLInputElement).value; view = JSON.stringify({ f: filter }); }} />
		<ul>
			@try {
				@for (const row of shown; key row.id) {
					<li><a href={row.href}>{row.w}</a></li>
				}
			} @pending {
				<li>loading…</li>
			}
		</ul>
	</main>
}
