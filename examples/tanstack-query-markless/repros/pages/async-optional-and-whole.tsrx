import { computed } from '@markless/core';
import { slow } from '../lib/slow.ts';

// Expected: the heading and the JSON stream in after @pending. Actual: the response ends after @pending (net::ERR_INCOMPLETE_CHUNKED_ENCODING), the page never finishes loading.
// `data?.text` alone is refused at build time (MARKLESS_PUBLIC_RENDER_GATE_PLAN_DISAGREEMENT); beside the whole `data` it builds and breaks the stream.
export default function AsyncOptionalAndWhole() @{
	const data = computed(async () => slow('json'));

	<main>
		@try {
			<>
				<h4>{data?.text}</h4>
				<pre>{JSON.stringify(data, null, 2)}</pre>
			</>
		} @pending {
			<p>pending</p>
		}
	</main>
}
