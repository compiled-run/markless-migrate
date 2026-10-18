// Markless 0.5.0: a prop forwarded through one more component is undefined in the innermost component's computed after
// resume. Press "next": Direct shows the value, Forwarded (Outer -> Inner) keeps showing "none".
import { computed, state } from '@markless/core';

function Inner({ value }: { value: string | null }) @{
	const shown = computed(() => (value ? `got ${value}` : 'none'));
	<p>{shown}</p>
}

function Outer({ value }: { value: string | null }) @{
	<section>
		<Inner value={value} />
	</section>
}

export default function Forwarded() @{
	let n = state(0);
	const value = computed(() => (n ? `v${n}` : null));
	<main>
		<button onClick={() => n++}>next</button>
		<Inner value={value} />
		<Outer value={value} />
	</main>
}
