import { state } from '@markless/core';

type Row = { id: string; title: string };

function List({ rows }: { readonly rows: readonly Row[] }) @{
	<ul id="prop">
		@for (const r of rows; key r.id) {
			<Item row={r} />
		}
	</ul>
}

function Item({ row }: { readonly row: Row }) @{
	<li data-x="1">{row.title}</li>
}

export default function Repro() @{
	let empty = state([{ id: 'x', title: 'X' }] as Row[]);

	<main>
		<button id="add-empty" onClick={() => (empty = [...empty, { id: String(empty.length), title: `E${empty.length}` }])}>add to empty</button>
		<List rows={empty} />
	</main>
}
