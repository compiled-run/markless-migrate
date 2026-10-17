// Gap 7: a page prop read inside a browser handler throws "Capture slot ... is a callback route" when it runs.
import { state } from '@markless/core';
import type { PageProps } from '@markless/router';

export default function Probe({ url }: PageProps) @{
	let shown = state('');

	<main>
		<button onClick={() => (shown = url.search)}>show search</button>
		<p>{shown}</p>
	</main>
}
