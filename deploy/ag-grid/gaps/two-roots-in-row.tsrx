// Markless 0.5.0: a @for row body with two sibling root elements renders only the first one in the browser. Press
// "fill": each row shows "obj" but not "var". Wrapping both in one element works.
import { state } from '@markless/core';

export default function TwoRoots() @{
	let items = state<{ id: string }[]>([]);
	<main>
		<button onClick={() => (items = [{ id: 'a' }, { id: 'b' }])}>fill</button>
		@for (const item of items; key item.id) {
			<div class="obj">obj {item.id}</div>
			<div class="var">var {item.id}</div>
		}
	</main>
}
