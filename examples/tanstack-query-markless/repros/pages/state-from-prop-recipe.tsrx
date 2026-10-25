import { computed, state } from '@markless/core';
import type { PageProps } from '@markless/router';
import { quick } from '../lib/slow.ts';

// An answer inside the 250 ms pending deadline, and a @catch arm. Expected: a click shows "loaded v1 /state-from-prop-recipe". Actual: slow() runs in the browser, then "Cannot read properties of undefined (reading 'pathname')" and the old value stays.
// The same happens with state(http.request.headers.get(...)), the copy MARKLESS_SERVER_ONLY_PROP_BROWSER_READ tells you to make.
export default function StateFromPropRecipe({ url }: PageProps) @{
	let where = state(url.pathname);
	let version = state(0);
	const data = computed(async () => {
		const v = version;
		return quick(`v${v} ${where}`);
	});

	<main>
		<button onClick={() => version++}>bump</button>
		@try {
			<p>{data.text}</p>
		} @pending {
			<p>pending</p>
		} @catch (error) {
			<p>{'caught ' + String(error)}</p>
		}
	</main>
}
