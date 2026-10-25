import { computed, state } from '@markless/core';
import { slow } from '../lib/slow.ts';

// From /navigation-start, then click Open. Expected: "Close" and the panel shown, the address unchanged, as on a fresh load of this page.
// Actual: the handler does not run; the router follows the link to /arm-link-handler?open=true and the panel stays hidden. The button beside it works.
export default function ArmLinkHandler() @{
	let open = state(false);
	let clicks = state(0);
	const data = computed(async () => slow('toggle page'));

	<main>
		@try {
			<div>
				<p>{data.text}</p>
				<a href="/arm-link-handler?open=true" onClick={(event) => { event.preventDefault(); open = !open; }}>{open ? 'Close' : 'Open'}</a>
				<button onClick={() => clicks++}>{`clicked ${clicks}`}</button>
				<div hidden={!open}>panel</div>
			</div>
		} @pending {
			<p>pending</p>
		}
	</main>
}
