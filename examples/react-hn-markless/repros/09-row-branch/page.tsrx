import { state } from '@markless/core';

export default function Page() @{
	let rows = state<{ id: number; done: boolean }[]>([]);

	<main>
		<button class="fill" onClick={() => (rows = [{ id: 1, done: false }, { id: 2, done: true }, { id: 3, done: false }])}>fill</button>
		<ol class="rows">
			@for (const row of rows; key row.id) {
				@if (row.done) {
					<li class="done">row {row.id} done</li>
				} @else {
					<li class="open">row {row.id} open</li>
				}
			}
		</ol>
	</main>
}
