import { state } from '@markless/core';
import Node from './Node.tsrx';

export default function Page() @{
	let root = state(1);

	<main>
		<Node id={root} />
	</main>
}
