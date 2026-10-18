// Markless 0.5.0: a component that renders itself renders on the server, but when the browser replaces the data its
// rows never fill in. Press "fill": the tree stays at "root x". Unrolled copies (one component per depth) work.
import { state } from '@markless/core';

type Node = { key: string; kids: Node[] };

function TreeNode({ node }: { node: Node }) @{
	<div class="node">
		<span>{node.key}</span>
		@for (const kid of node.kids; key kid.key) {
			<TreeNode node={kid} />
		}
	</div>
}

export default function Recursive() @{
	let roots = state<Node[]>([{ key: 'root', kids: [{ key: 'x', kids: [] }] }]);
	<main>
		<button onClick={() => (roots = [{ key: 'r', kids: [{ key: 'a', kids: [{ key: 'a1', kids: [] }] }, { key: 'b', kids: [] }] }])}>fill</button>
		@for (const r of roots; key r.key) {
			<TreeNode node={r} />
		}
	</main>
}
