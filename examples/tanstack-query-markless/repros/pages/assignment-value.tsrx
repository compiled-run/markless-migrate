import { state } from '@markless/core';

// Expected: the console logs "assigned 5", since an assignment expression has the value assigned. Actual: "assigned undefined".
// The port's sandbox panel stored "undefined" this way: keep('loaderDelay', (loaderDelay = 150)).
export default function AssignmentValue() @{
	let count = state(0);

	<main>
		<button onClick={() => console.log('assigned', (count = 5))}>set</button>
		<p>{`count: ${count}`}</p>
	</main>
}
