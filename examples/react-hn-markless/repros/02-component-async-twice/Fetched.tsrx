import { computed } from '@markless/core';
import { slowValue } from './value.ts';

export default function Fetched({ id }: { id: string }) @{
	const value = computed(async () => slowValue(id));

	<div>
		@try {
			<p class="value">{value.text}</p>
		} @pending {
			<p class="value">waiting</p>
		} @catch {
			<p class="value">failed</p>
		}
	</div>
}
