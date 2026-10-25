import { computed, state } from '@markless/core';
import { node, type Tree } from './tree.ts';

function Body({ item }: { item: Tree }) @{
	let open = state(true);

	<div class="body">
		<span class="toggle" onClick={() => (open = !open)}>[{open ? '-' : '+'}]</span> {item.name}
		<div class="kids">
			@for (const kid of item.kids; key kid) {
				<Node id={kid} />
			}
		</div>
	</div>
}

export default function Node({ id }: { id: number }) @{
	const item = computed(async () => node(id));

	<div class="node">
		@try {
			<Body item={item} />
		} @pending {
			<p>loading {id}</p>
		} @catch {
			<p>failed</p>
		}
	</div>
}
