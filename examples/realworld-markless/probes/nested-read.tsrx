// Gap 4: a read under an index in a template renders once and never updates; the local-read computed works.
import { computed, state } from '@markless/core';

export default function Probe() @{
	let rows = state([] as { name: string }[]);
	const first = computed(() => {
		const list = rows;
		const item = list[0];
		return item ? item.name : 'none';
	});

	<main>
		<button onClick={() => (rows = [{ name: 'one' }])}>go</button>
		<p id="nested">{rows[0]?.name}</p>
		<p id="computed">{first}</p>
	</main>
}
