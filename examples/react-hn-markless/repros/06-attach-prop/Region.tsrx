import { state } from '@markless/core';

export default function Region({ id }: { id: string }) @{
	let seen = state('nothing yet');

	<div class="region" attach={() => void (seen = `attach read id ${String(id)}`)} onVisible={() => {}}>
		<p class="probe">{seen}</p>
	</div>
}
