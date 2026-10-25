import { state } from '@markless/core';
import Inner from './Inner.tsrx';

export default function Outer({ depth }: { depth: number }) @{
	let open = state(true);

	<div class="outer">
		<button class="flip" onClick={() => (open = !open)}>{open ? 'open' : 'closed'}</button>
		<Inner depth={depth} />
	</div>
}
