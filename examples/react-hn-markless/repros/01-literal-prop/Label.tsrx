import { state } from '@markless/core';

export default function Label({ label }: { label: string }) @{
	let count = state(0);

	<div class="label" attach={() => { setTimeout(() => (count = 3), 50); }} onVisible={() => {}}>
		<p class="probe">{label} {count}</p>
	</div>
}
