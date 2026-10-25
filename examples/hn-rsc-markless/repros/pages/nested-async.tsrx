import { computed } from '@markless/core';
import AsyncItem from '../components/async-item.tsrx';
import { slow } from '../lib/slow.ts';

// Expected: "item 1" and "item 2". Actual: "loading 1" and "loading 2" forever, in the response and in the browser.
export default function NestedAsync() @{
	const ids = computed(async () => slow([1, 2], 30));
	<main>
		@try {
			<div>
				@for (const id of ids; key id) {
					<AsyncItem id={id} />
				}
			</div>
		} @pending {
			<p>loading ids</p>
		} @catch {
			<p>failed</p>
		}
	</main>
}
