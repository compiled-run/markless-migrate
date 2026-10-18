import { computed, state } from '@markless/core';
import { View } from '../lib/spikeview.tsrx';

type R = { serialNumber: number; args: unknown };

export default function Spike() @{
	let pick = state(0);
	const row = computed((): R | null => (pick === 0 ? null : pick === 1 ? { serialNumber: 1, args: [434] } : { serialNumber: 2, args: [{ ok: true, value: 'x' }] }));
	<main>
		<button class="fill" onClick={() => (pick = (pick + 1) % 3)}>fill</button>
		<View row={row} />
	</main>
}
