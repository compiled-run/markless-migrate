// Markless 0.5.0: an @if written directly in a keyed @for row stops that list from updating in the browser, silently.
// Press "fill": the list without @if shows "r s", the one with @if keeps its server rows. Same-file components
// holding the @if (Leaf) work; the same Leaf imported from another file is never created in the browser.
import { state } from '@markless/core';

type Node = { key: string; obj: boolean };

function Leaf({ node }: { node: Node }) @{
	<div>
		<span>{node.key}</span>
		@if (node.obj) {
			<span>obj</span>
		} @else {
			<span>val</span>
		}
	</div>
}

export default function IfInForRow() @{
	let roots = state<Node[]>([{ key: 'root', obj: true }]);
	<main>
		<button onClick={() => (roots = [{ key: 'r', obj: true }, { key: 's', obj: false }])}>fill</button>
		<p>component rows:</p>
		@for (const r of roots; key r.key) {
			<Leaf node={r} />
		}
		<p>inline if rows:</p>
		@for (const r of roots; key r.key) {
			<div>
				<span>{r.key}</span>
				@if (r.obj) {
					<span>obj</span>
				} @else {
					<span>val</span>
				}
			</div>
		}
	</main>
}
