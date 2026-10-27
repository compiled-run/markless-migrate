import { computed, state } from '@markless/core';

// A keyed list empty on the server whose rows hold an @if; typing fills it.
export default function Repro() @{
	let term = state('');
	const rows = computed(() => (term ? [{ id: 'a', parts: [{ k: 0, text: 'x ', mark: 'y' }, { k: 1, text: ' z', mark: '' }] }] : []));

	<main>
		<input id="q" onInput={(event) => (term = (event.target as HTMLInputElement).value)} />
		<ul id="list">
			@for (const row of rows; key row.id) {
				<li>
					@for (const part of row.parts; key part.k) {
						<><span>{part.text}</span><mark hidden={part.mark === ''}>{part.mark}</mark></>
					}
				</li>
			}
		</ul>
	</main>
}
