import { computed } from '@markless/core';
import { slow } from '../lib/slow.ts';

// Expected: "outer" and "inner" both render. Actual: the response streams only the inner @try; the outer one keeps its @pending forever.
export default function NestedTry() @{
	const outer = computed(async () => slow({ text: 'outer' }, 30));
	const inner = computed(async () => slow({ text: 'inner' }, 80));
	<main>
		@try {
			<section>
				<p>{outer.text}</p>
				@try {
					<p>{inner.text}</p>
				} @pending {
					<p>loading inner</p>
				} @catch {
					<p>inner failed</p>
				}
			</section>
		} @pending {
			<p>loading outer</p>
		} @catch {
			<p>outer failed</p>
		}
	</main>
}
