import { computed, state } from '@markless/core';
import { slow } from '../lib/slow.ts';

export default function VoteItem({ id }: { readonly id: number }) @{
	const item = computed(async () => slow({ title: `item ${id}` }, 50));
	let voted = state(false);
	<div class="row">
		@try {
			<span class={voted ? 'voted' : 'arrow'} onClick={() => (voted = !voted)}>{item.title}</span>
		} @pending {
			<span>loading {id}</span>
		} @catch {
			<span>failed</span>
		}
	</div>
}
