import { computed } from '@markless/core';
import Child from './Child.tsrx';

export default function Parent({ id }: { id: string }) @{
	const item = computed(async () => ({ text: `item ${id}` }));

	<div>
		@try {
			<Child item={item} />
		} @pending {
			<p class="value">waiting</p>
		} @catch {
			<p class="value">failed</p>
		}
	</div>
}
