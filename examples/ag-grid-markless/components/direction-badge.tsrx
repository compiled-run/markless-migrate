import { computed } from '@markless/core';
import { directionInfo } from '../lib/parity/ag-grid-react/model.ts';

/** DirectionBadge.tsx. The arrow is lucide's ArrowRight written out: an @if arm that holds a component is refused. */
export default function DirectionBadge({ direction }: { direction: string }) @{
	const info = computed(() => directionInfo(direction));
	<span class={info.cls} title={info.title}>
		{info.left}
		@if (info.arrow) {
			<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-arrow-right mx-0.5 flex-shrink-0" aria-hidden="true"><path d="M5 12h14"></path><path d="m12 5 7 7-7 7"></path></svg>
		}
		{info.right}
	</span>
}
