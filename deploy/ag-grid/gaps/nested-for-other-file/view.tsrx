import { computed, state } from '@markless/core';
import { kidsFor, treeFor } from './parity/microlink-react-json-view/tree.ts';

type R = { serialNumber: number; args: unknown };

export function View({ row }: { row: R | null }) @{
	let toggled = state('');
	const tree = computed(() => treeFor(row, 'data', 'rjv-default', toggled));
	const list = computed(() => kidsFor(row, 'data', 'rjv-default', toggled));
	<div class="out" onClick={(e) => { const hit = (e.target as HTMLElement).closest("[data-toggle]")?.getAttribute("data-toggle"); if (hit) toggled = hit; }}>
		<span class="t">{tree.name}</span><div class="pushed-content object-container" style={tree.pushedStyle}><div class="object-content" style="margin-left: 6px;">
		@for (const n1 of list; key n1.id) {
			<div class="n1"><span>{n1.name}</span>
				@for (const n2 of n1.kids; key n2.id) {
					<div class="n2"><span>{n2.name}</span></div>
				}
			</div>
		}
		</div></div>
	</div>
}

