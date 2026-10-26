import { computed, state } from '@markless/core';
import FeedRows from '../components/feed-rows-if.tsrx';

const load = async (v: number) => ({ empty: false, items: [{ id: 1, n: `one ${v}`, cls: v > 0 ? 'nosee' : ' ' }, { id: 2, n: `two ${v}`, cls: ' ' }] });

// A child draws rows inside an @if/@else arm; a row click fetches the rows again. Expected each click to count up; actual the first click works, then no event record matches.
export default function Page() @{
	let version = state(0);
	const feed = computed(async () => {
		const v = version;
		return load(v);
	});
	<main>
		@try {
			<FeedRows feed={feed} onAnswered={() => version++} />
		} @pending {
			<p>loading</p>
		}
	</main>
}
