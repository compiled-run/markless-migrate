import { computed } from '@markless/core';
import Counted from './Counted.tsrx';

export default function Page() @{
	const data = computed(async () => ({ items: { a: 'apple', b: 'pear' } }));

	<main>
		@try {
			<Counted data={data} />
		} @pending {
			<p>waiting</p>
		} @catch {
			<p>failed</p>
		}
	</main>
}
