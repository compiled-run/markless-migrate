import { state } from '@markless/core';

// Expected: the textarea shows "Hello", as <input value> shows its value. Actual: the server writes value="Hello" as an attribute, which a textarea ignores, so it is empty.
export default function TextareaValue() @{
	let body = state('Hello');

	<main>
		<textarea value={body} onInput={(event) => (body = (event.target as HTMLTextAreaElement).value)}></textarea>
	</main>
}
