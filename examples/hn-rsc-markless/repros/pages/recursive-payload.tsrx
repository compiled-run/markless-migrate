import { computed } from '@markless/core';
import TreeNode from '../components/tree-node.tsrx';
import { tree } from '../lib/tree.ts';

// 255 nodes, 8 levels deep. Expected: a payload that grows with the number of nodes. Actual: each row's props carry its whole subtree again, so it grows with nodes times depth.
export default function RecursivePayload() @{
	const root = computed(() => tree(7));
	<main>
		<TreeNode label={root.label} kids={root.kids} />
	</main>
}
