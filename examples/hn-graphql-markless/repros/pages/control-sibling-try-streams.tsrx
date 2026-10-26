import { computed } from '@markless/core';

const load = (text: string) => new Promise<{ text: string }>((resolve) => setTimeout(() => resolve({ text }), 50));

// Control for nested-try-never-streams: sibling @try blocks over the same two values both stream.
export default function Page() @{
	const outer = computed(async () => load('outer'));
	const inner = computed(async () => load('inner'));
	<main>
		@try {
			<p id="one">{outer.text}</p>
		} @pending {
			<p id="one">pending</p>
		}
		@try {
			<p id="two">{inner.text}</p>
		} @pending {
			<p id="two">pending</p>
		}
	</main>
}
