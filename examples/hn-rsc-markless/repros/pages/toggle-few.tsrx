import { computed } from '@markless/core';
import TreeNode from '../components/tree-node.tsrx';
import { tree } from '../lib/tree.ts';

// The same tree component as recursive-payload, 7 nodes instead of 255: the first click's cost should not grow with the page.
export default function ToggleFew() @{
	const root = computed(() => tree(2));
	<main>
		<TreeNode label={root.label} kids={root.kids} />
	</main>
}
