// Gap 8: <br /> is written as <br></br>, which parses as two <br>; the button after it never gets its click.
import { state } from '@markless/core';

export default function Probe() @{
	let clicks = state(0);

	<main>
		<p>one line<br />next line</p>
		<button onClick={() => clicks++}>clicks {clicks}</button>
	</main>
}
