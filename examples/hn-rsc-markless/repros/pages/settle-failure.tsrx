import { computed } from '@markless/core';
import NameList from '../components/name-list.tsrx';
import { slow } from '../lib/slow.ts';

// A prop the child's @for reads is left out (a type error the build does not report). Expected: the @catch content, or an error response. Actual: the server logs MARKLESS_COMPOSED_READ_UNMAPPED, the response ends, and the page keeps its @pending for good.
export default function SettleFailure() @{
	const data = computed(async () => slow({ title: 'Names' }, 60));
	<main>
		@try {
			// @ts-expect-error names is left out on purpose
			<NameList title={data.title} />
		} @pending {
			<p>loading</p>
		} @catch {
			<p>failed</p>
		}
	</main>
}
