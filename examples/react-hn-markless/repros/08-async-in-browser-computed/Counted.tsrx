import { computed, state } from '@markless/core';

export default function Counted({ data }: { data: { readonly items: Record<string, string> } }) @{
	let extra = state(0);
	const count = computed(() => Object.keys(data.items).length + extra);

	<div class="counted">
		<button class="more" onClick={() => extra++}>more</button>
		<p class="probe">{count}</p>
	</div>
}
