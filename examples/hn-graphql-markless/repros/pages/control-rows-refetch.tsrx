import { computed, state } from '@markless/core';
import FeedRows from '../components/feed-rows.tsrx';

const load = async (v: number) => ({ empty: false, items: [{ id: 1, n: `one ${v}`, cls: v > 0 ? 'nosee' : ' ' }, { id: 2, n: `two ${v}`, cls: ' ' }] });

// Control for rows-in-branch-lose-handlers: the same rows without the @if, every click counts up.
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
