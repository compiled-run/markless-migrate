import { computed, state } from '@markless/core';

// one row with its own state, given its item from the parent's @for
export default function Row({ item }: { item: { id: number; n: string } }) @{
	let votes = state(0);
	const label = computed(() => `${item.n} ${votes}`);
	<tr>
		<td>
			<a class="vote" onClick={() => votes++}>{label}</a>
		</td>
	</tr>
}
