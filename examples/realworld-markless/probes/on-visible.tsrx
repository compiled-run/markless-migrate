// Gap 6: onVisible does not run until some other event wakes the runtime; click the button and it runs.
import { state } from '@markless/core';

export default function Probe() @{
	let seen = state('no');
	let clicks = state(0);

	<main>
		<p onVisible={() => (seen = 'yes')}>seen {seen}</p>
		<button onClick={() => clicks++}>clicks {clicks}</button>
	</main>
}
