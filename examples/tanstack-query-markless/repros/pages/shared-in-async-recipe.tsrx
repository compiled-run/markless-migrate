import { computed, shared, state } from '@markless/core';
import { slow } from '../lib/slow.ts';

const counter = shared(
	() => {
		const box = state({ version: 0 });
		return { ...box };
	},
	{ scope: 'page' },
);

// Expected: "loaded v0", and "loaded v1" after the click. Actual: the recipe throws undefined on the server and in the browser, so @catch shows "caught undefined" and slow() never runs.
export default function SharedInAsyncRecipe() @{
	const c = counter();
	const data = computed(async () => {
		const v = c.version;
		return slow(`v${v}`);
	});

	<main>
		<button onClick={() => c.version++}>bump</button>
		@try {
			<p>{data.text}</p>
		} @pending {
			<p>pending</p>
		} @catch (error) {
			<p>{'caught ' + String(error)}</p>
		}
	</main>
}
