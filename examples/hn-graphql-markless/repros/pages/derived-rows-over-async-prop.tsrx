import { computed } from '@markless/core';
import Rows from '../components/derived-rows.tsrx';

const load = async () => ({ items: [{ id: 1, n: 'one' }, { id: 2, n: 'two' }] });

// A child derives its rows with computed from an async value the page passes in. Click "two": expected "two"; actual "" (the row is undefined in its handler).
export default function Page() @{
	const feed = computed(async () => load());
	<main>
		@try {
			<Rows feed={feed} />
		} @pending {
			<p>loading</p>
		}
	</main>
}
