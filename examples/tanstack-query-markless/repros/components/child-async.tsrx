import { computed } from '@markless/core';
import { slow } from '../lib/slow.ts';
export default function ChildAsync() @{
	const data = computed(async () => slow('child'));
	<section>
		@try {
			<p id="out">{data.text}</p>
		} @pending {
			<p id="out">pending</p>
		}
	</section>
}
