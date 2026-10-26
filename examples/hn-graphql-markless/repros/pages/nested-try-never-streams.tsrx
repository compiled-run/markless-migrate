import { computed } from '@markless/core';

const load = (text: string) => new Promise<{ text: string }>((resolve) => setTimeout(() => resolve({ text }), 50));

// Two slow async values, one @try nested in the other. Expected "pending | outer | inner"; actual the outer @try stays "pending" and nothing streams.
export default function Page() @{
	const outer = computed(async () => load('outer'));
	const inner = computed(async () => load('inner'));
	<main>
		@try {
			<section>
				<p id="one">{outer.text}</p>
				@try {
					<p id="two">{inner.text}</p>
				} @pending {
					<p id="two">pending</p>
				}
			</section>
		} @pending {
			<p id="one">pending</p>
		}
	</main>
}
